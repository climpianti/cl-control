"""Lightweight native Home Assistant dashboard model for CL Control 3.5."""

from __future__ import annotations

from copy import deepcopy
import re
import unicodedata
from typing import Any

from .ecosystem import async_discover_cl_modules, module_signature, resolve_energy_provider

DOMAIN_MODULE = {
    "light": "lights",
    "cover": "covers",
    "climate": "climate",
}

MODULE_LABELS = {
    "lights": ("Luci", "mdi:lightbulb-group"),
    "covers": ("Aperture", "mdi:window-shutter"),
    "climate": ("Clima", "mdi:thermostat"),
}

LEVEL_RANK = {"essential": 0, "standard": 1, "pro": 2, "installer": 3}
TECHNICAL_PLATFORMS = {"cl_control", "cl_power_control", "cl_irrigation"}


def _slug(value: str) -> str:
    """Return a Lovelace-safe, deterministic path fragment."""
    normalized = unicodedata.normalize("NFKD", str(value or ""))
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii")
    result = re.sub(r"[^a-z0-9]+", "-", ascii_value.lower()).strip("-")
    return result or "area"


def _allowed(level: str | None, current: str) -> bool:
    """Return whether an entity level is visible at the active experience."""
    item_level = str(level or "essential")
    if item_level == "installer":
        return False
    return LEVEL_RANK.get(item_level, LEVEL_RANK["standard"]) <= LEVEL_RANK.get(
        str(current or "standard"), LEVEL_RANK["standard"]
    )


def _runtime_ui(runtime: dict[str, Any]) -> dict[str, Any]:
    if isinstance(runtime.get("customer_ui"), dict):
        return runtime["customer_ui"]
    return runtime


def _runtime_site(runtime: dict[str, Any], fallback: dict[str, Any]) -> dict[str, Any]:
    site = runtime.get("site")
    return site if isinstance(site, dict) else fallback


def _area_lookup(
    areas: list[dict[str, Any]],
) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    by_id: dict[str, dict[str, Any]] = {}
    by_name: dict[str, dict[str, Any]] = {}
    for raw in areas:
        area_id = str(raw.get("id") or "")
        name = str(raw.get("name") or area_id or "Area")
        if not area_id:
            continue
        item = {
            "id": area_id,
            "name": name,
            "path": f"area-{_slug(area_id)}",
            "native": True,
            "entities": {"lights": [], "covers": [], "climate": []},
        }
        by_id[area_id] = item
        by_name[name.casefold()] = item
    return by_id, by_name


def _resolve_area(
    entity_id: str,
    discovered_area_id: str | None,
    ui: dict[str, Any],
    by_id: dict[str, dict[str, Any]],
    by_name: dict[str, dict[str, Any]],
) -> dict[str, Any] | None:
    overrides = ui.get("entity_areas") or {}
    override = str(overrides.get(entity_id) or "").strip()
    if override:
        if override in by_id:
            return by_id[override]
        if override.casefold() in by_name:
            return by_name[override.casefold()]
        synthetic_id = f"cl-{_slug(override)}"
        item = by_id.get(synthetic_id)
        if item is None:
            item = {
                "id": synthetic_id,
                "name": override,
                "path": f"area-{_slug(override)}",
                "native": False,
                "entities": {"lights": [], "covers": [], "climate": []},
            }
            by_id[synthetic_id] = item
            by_name[override.casefold()] = item
        return item
    if discovered_area_id and discovered_area_id in by_id:
        return by_id[discovered_area_id]
    return None


def _entity_name(entity: dict[str, Any], ui: dict[str, Any]) -> str:
    entity_id = str(entity["entity_id"])
    aliases = ui.get("aliases") or {}
    if aliases.get(entity_id):
        return str(aliases[entity_id])
    for key in ("name", "original_name"):
        if entity.get(key):
            return str(entity[key])
    return entity_id.split(".", 1)[-1].replace("_", " ").strip().title()


def build_dashboard_model(
    *,
    registry_entities: list[dict[str, Any]],
    areas: list[dict[str, Any]],
    runtime: dict[str, Any],
    site: dict[str, Any],
    branding: dict[str, Any],
    version: str,
    revision: int,
    cl_modules: list[dict[str, Any]] | None = None,
    home_assistant_energy_available: bool = False,
) -> dict[str, Any]:
    """Build a structural model without copying Home Assistant runtime states."""
    ui = _runtime_ui(runtime)
    cl_modules = deepcopy(cl_modules or [])
    effective_site = _runtime_site(runtime, site)
    profile = str(ui.get("experience_level") or "standard")
    entity_levels = ui.get("entity_levels") or {}
    module_levels = ui.get("module_levels") or {}
    module_overrides = ui.get("entity_modules") or {}
    visibility = ui.get("entity_visibility") or {}
    hidden = set(ui.get("hidden") or [])
    entity_order = {
        entity_id: index for index, entity_id in enumerate(ui.get("entity_order") or [])
    }

    by_id, by_name = _area_lookup(areas)
    visible_entities: list[dict[str, Any]] = []

    for raw in registry_entities:
        entity_id = str(raw.get("entity_id") or "")
        if "." not in entity_id:
            continue
        domain = str(raw.get("domain") or entity_id.split(".", 1)[0])
        module = str(module_overrides.get(entity_id) or DOMAIN_MODULE.get(domain) or "")
        if module not in MODULE_LABELS:
            continue
        explicit_visibility = visibility.get(entity_id)
        if explicit_visibility is False or (
            entity_id in hidden and explicit_visibility is not True
        ):
            continue
        if raw.get("disabled"):
            continue
        if raw.get("hidden") and explicit_visibility is not True:
            continue
        if raw.get("entity_category") and explicit_visibility is not True:
            continue
        platform = str(raw.get("platform") or "")
        if platform in TECHNICAL_PLATFORMS and explicit_visibility is not True:
            continue
        # Compatibility with the 3.4 experience model:
        # module_levels is an active experience override for that module, not
        # the minimum level required to show the whole module.
        active_module_level = str(module_levels.get(module) or profile)
        if not _allowed(entity_levels.get(entity_id), active_module_level):
            continue

        area = _resolve_area(
            entity_id,
            str(raw.get("area_id") or "") or None,
            ui,
            by_id,
            by_name,
        )
        item = {
            "entity_id": entity_id,
            "domain": domain,
            "module": module,
            "name": _entity_name(raw, ui),
            "area_id": area["id"] if area else "",
            "platform": platform,
            "supported_features": int(raw.get("supported_features") or 0),
            "icon": str(raw.get("icon") or ""),
        }
        visible_entities.append(item)
        if area is not None:
            area["entities"][module].append(item)

    visible_entities.sort(
        key=lambda item: (
            entity_order.get(item["entity_id"], 10**9),
            item["name"].casefold(),
            item["entity_id"],
        )
    )

    for area in by_id.values():
        for module in MODULE_LABELS:
            area["entities"][module].sort(
                key=lambda item: (
                    entity_order.get(item["entity_id"], 10**9),
                    item["name"].casefold(),
                )
            )

    area_order = {
        str(value).casefold(): index
        for index, value in enumerate(ui.get("area_order") or [])
    }
    active_areas = [
        area
        for area in by_id.values()
        if any(area["entities"][module] for module in MODULE_LABELS)
    ]
    active_areas.sort(
        key=lambda area: (
            min(
                area_order.get(area["id"].casefold(), 10**9),
                area_order.get(area["name"].casefold(), 10**9),
            ),
            area["name"].casefold(),
        )
    )

    visible_by_id = {item["entity_id"]: item for item in visible_entities}
    favorites = [
        visible_by_id[entity_id]
        for entity_id in dict.fromkeys(ui.get("favorites") or [])
        if entity_id in visible_by_id
    ]

    modules = {}
    for module, (label, icon) in MODULE_LABELS.items():
        module_entities = [
            item for item in visible_entities if item["module"] == module
        ]
        modules[module] = {
            "id": module,
            "label": label,
            "icon": icon,
            "path": module,
            "entities": module_entities,
            "count": len(module_entities),
        }

    assets = branding.get("assets") if isinstance(branding.get("assets"), dict) else {}
    logo_url = str(assets.get("logo") or "")
    site_name = str(
        effective_site.get("site_name")
        or effective_site.get("customer")
        or "Impianto"
    )

    requested_energy_provider = str(ui.get("energy_provider") or "auto")
    resolved_energy_provider = resolve_energy_provider(
        requested_energy_provider,
        cl_modules,
        home_assistant_energy_available=home_assistant_energy_available,
    )

    return {
        "schema_version": 1,
        "revision": revision,
        "version": version,
        "profile": profile,
        "branding": {
            "brand_name": str(branding.get("brand_name") or "CL Control"),
            "logo_url": logo_url,
        },
        "site": {"site_name": site_name},
        "favorites": favorites,
        "areas": active_areas,
        "modules": modules,
        "cl_modules": cl_modules,
        "energy": {
            "requested_provider": requested_energy_provider,
            "provider": resolved_energy_provider,
        },
    }


def _branding_section(
    model: dict[str, Any], context: str, *, column_span: int
) -> dict[str, Any]:
    """Return a compact native brand strip for Home and subviews."""
    logo = model["branding"].get("logo_url") or ""
    brand = model["branding"].get("brand_name") or "CL Control"
    site_name = model["site"].get("site_name") or "Impianto"
    title = brand if context == "home" else f"{brand} · {context}"
    logo_html = (
        f'<img src="{logo}" alt="CL Impianti" width="72">'
        if logo
        else "**CL Impianti**"
    )
    return {
        "type": "grid",
        "column_span": column_span,
        "cards": [
            {
                "type": "markdown",
                "content": f"{logo_html}\n\n### {title}\n{site_name}",
                "grid_options": {"columns": "full", "rows": "auto"},
            }
        ],
    }


def _tile(entity: dict[str, Any]) -> dict[str, Any]:
    card: dict[str, Any] = {
        "type": "tile",
        "entity": entity["entity_id"],
        "name": entity["name"],
    }
    if entity.get("icon"):
        card["icon"] = entity["icon"]
    return card


def _heading(label: str, icon: str) -> dict[str, Any]:
    return {"type": "heading", "heading": label, "icon": icon}


def _navigation_shortcut(
    *, name: str, icon: str, path: str
) -> dict[str, Any]:
    """Use Home Assistant's compact one-row native navigation card."""
    return {
        "type": "shortcut",
        "label": name,
        "icon": icon,
        "tap_action": {"action": "navigate", "navigation_path": path},
        "hold_action": {"action": "none"},
        "grid_options": {"columns": 6, "rows": 1},
    }


def _module_sections(
    entities: list[dict[str, Any]], areas: list[dict[str, Any]], module: str
) -> list[dict[str, Any]]:
    sections: list[dict[str, Any]] = []
    assigned: set[str] = set()
    for area in areas:
        cards = [_tile(item) for item in area["entities"][module]]
        if not cards:
            continue
        assigned.update(item["entity_id"] for item in area["entities"][module])
        sections.append(
            {
                "type": "grid",
                "cards": [
                    _heading(area["name"], MODULE_LABELS[module][1]),
                    *cards,
                ],
            }
        )
    unassigned = [
        item for item in entities if item["entity_id"] not in assigned
    ]
    if unassigned:
        sections.append(
            {
                "type": "grid",
                "cards": [
                    _heading("Altri dispositivi", MODULE_LABELS[module][1]),
                    *[_tile(item) for item in unassigned],
                ],
            }
        )
    return sections


def build_native_lovelace(model: dict[str, Any]) -> dict[str, Any]:
    """Translate the structural model into native Lovelace configuration."""
    sections: list[dict[str, Any]] = [_branding_section(model, "home", column_span=3)]

    if model["favorites"]:
        sections.append(
            {
                "type": "grid",
                "cards": [
                    _heading("Preferiti", "mdi:star"),
                    *[_tile(item) for item in model["favorites"]],
                ],
            }
        )

    if model["areas"]:
        area_cards: list[dict[str, Any]] = [_heading("Aree", "mdi:floor-plan")]
        for area in model["areas"]:
            if area["native"]:
                area_cards.append(
                    {
                        "type": "area",
                        "area": area["id"],
                        "name": area["name"],
                        "display_type": "compact",
                        "navigation_path": area["path"],
                    }
                )
            else:
                area_cards.append(
                    _navigation_shortcut(
                        name=area["name"],
                        icon="mdi:floor-plan",
                        path=area["path"],
                    )
                )
        sections.append({"type": "grid", "cards": area_cards})

    system_cards = [_heading("Sistemi", "mdi:view-grid-outline")]
    for module in ("lights", "covers", "climate"):
        data = model["modules"][module]
        if data["count"]:
            system_cards.append(
                _navigation_shortcut(
                    name=data["label"], icon=data["icon"], path=data["path"]
                )
            )
    if len(system_cards) > 1:
        sections.append({"type": "grid", "cards": system_cards})

    cl_system_cards = [_heading("Sistemi CL", "mdi:apps")]
    for module in model.get("cl_modules", []):
        if not module.get("customer_visible") or not module.get("route"):
            continue
        cl_system_cards.append(
            _navigation_shortcut(
                name=str(module.get("customer_label") or module.get("display_name") or "CL"),
                icon=str(module.get("icon") or "mdi:puzzle"),
                path=str(module["route"]),
            )
        )
    if len(cl_system_cards) > 1:
        sections.append({"type": "grid", "cards": cl_system_cards})

    views: list[dict[str, Any]] = [
        {
            "type": "sections",
            "title": "Home",
            "path": "home",
            "icon": "mdi:home",
            "max_columns": 3,
            "sections": sections,
        }
    ]

    for area in model["areas"]:
        area_sections = [_branding_section(model, area["name"], column_span=2)]
        for module in ("lights", "covers", "climate"):
            items = area["entities"][module]
            if items:
                area_sections.append(
                    {
                        "type": "grid",
                        "cards": [
                            _heading(
                                MODULE_LABELS[module][0],
                                MODULE_LABELS[module][1],
                            ),
                            *[_tile(item) for item in items],
                        ],
                    }
                )
        views.append(
            {
                "type": "sections",
                "title": area["name"],
                "path": area["path"],
                "subview": True,
                "back_path": "home",
                "max_columns": 2,
                "sections": area_sections,
            }
        )

    for module in ("lights", "covers", "climate"):
        data = model["modules"][module]
        if not data["count"]:
            continue
        module_sections = [
            _branding_section(model, data["label"], column_span=3),
            *_module_sections(data["entities"], model["areas"], module),
        ]
        views.append(
            {
                "type": "sections",
                "title": data["label"],
                "path": data["path"],
                "icon": data["icon"],
                "subview": True,
                "back_path": "home",
                "max_columns": 3,
                "sections": module_sections,
            }
        )

    return {
        "title": model["branding"].get("brand_name") or "CL Control",
        "views": views,
    }


class NativeDashboardService:
    """Cache the structural dashboard and rebuild only after invalidation."""

    def __init__(self, hass: Any, version: str) -> None:
        self.hass = hass
        self.version = version
        self.revision = 1
        self.build_count = 0
        self._cached: dict[str, Any] | None = None
        self._module_signature: tuple[tuple[Any, ...], ...] | None = None

    def invalidate(self, _event: Any = None) -> None:
        """Invalidate structural data without observing entity state changes."""
        self.revision += 1
        self._cached = None
        self._module_signature = None

    def _registry_snapshot(
        self,
    ) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        from homeassistant.helpers import area_registry as ar
        from homeassistant.helpers import device_registry as dr
        from homeassistant.helpers import entity_registry as er

        area_registry = ar.async_get(self.hass)
        device_registry = dr.async_get(self.hass)
        entity_registry = er.async_get(self.hass)

        areas = [
            {"id": area.id, "name": area.name}
            for area in area_registry.async_list_areas()
        ]
        entities: list[dict[str, Any]] = []
        for entry in entity_registry.entities.values():
            area_id = entry.area_id
            if not area_id and entry.device_id:
                device = device_registry.async_get(entry.device_id)
                if device is not None:
                    area_id = dr.async_get_effective_area_id(self.hass, device)
            category = getattr(entry.entity_category, "value", entry.entity_category)
            entities.append(
                {
                    "entity_id": entry.entity_id,
                    "domain": entry.domain,
                    "platform": entry.platform,
                    "area_id": area_id,
                    "device_id": entry.device_id,
                    "disabled": entry.disabled_by is not None,
                    "hidden": entry.hidden_by is not None,
                    "entity_category": str(category or ""),
                    "name": entry.name,
                    "original_name": entry.original_name,
                    "icon": entry.icon or entry.original_icon,
                    "supported_features": entry.supported_features or 0,
                }
            )
        return entities, areas

    async def async_get_payload(
        self,
        *,
        settings: dict[str, Any],
        runtime: dict[str, Any],
    ) -> dict[str, Any]:
        """Return cached model and native Lovelace config."""
        cl_modules = await async_discover_cl_modules(self.hass)
        signature = module_signature(cl_modules)
        if self._cached is not None and signature == self._module_signature:
            return deepcopy(self._cached)
        if self._cached is not None and signature != self._module_signature:
            self.revision += 1
            self._cached = None

        entities, areas = self._registry_snapshot()
        model = build_dashboard_model(
            registry_entities=entities,
            areas=areas,
            runtime=runtime,
            site=settings.get("site") or {},
            branding=settings.get("branding") or {},
            version=self.version,
            revision=self.revision,
            cl_modules=cl_modules,
            home_assistant_energy_available=(
                "energy" in getattr(getattr(self.hass, "config", None), "components", set())
            ),
        )
        config = build_native_lovelace(model)
        self.build_count += 1
        self._module_signature = signature
        self._cached = {
            "schema_version": 1,
            "revision": self.revision,
            "model": model,
            "config": config,
            "diagnostics": {
                "build_count": self.build_count,
                "entity_count": len(entities),
                "area_count": len(areas),
                "cl_module_count": sum(1 for item in cl_modules if item.get("installed")),
            },
        }
        return deepcopy(self._cached)


__all__ = (
    "DOMAIN_MODULE",
    "MODULE_LABELS",
    "NativeDashboardService",
    "build_dashboard_model",
    "build_native_lovelace",
)

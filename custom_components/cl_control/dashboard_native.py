"""Lightweight native Home Assistant dashboard model for CL Control 3.5."""

from __future__ import annotations

from copy import deepcopy
import re
import unicodedata
from urllib.parse import quote
from typing import Any

from .const import DATA_SUMMARY_MANAGER, DOMAIN
from .ecosystem import async_discover_cl_modules, module_signature, resolve_energy_provider

DOMAIN_MODULE = {
    "light": "lights",
    "cover": "covers",
    "climate": "climate",
    "alarm_control_panel": "security",
    "camera": "cameras",
}

MODULE_LABELS = {
    "lights": ("Luci", "mdi:lightbulb-group"),
    "covers": ("Aperture", "mdi:window-shutter"),
    "climate": ("Clima", "mdi:thermostat"),
    "security": ("Sicurezza", "mdi:shield-home"),
    "cameras": ("Telecamere", "mdi:cctv"),
}

AREA_SENSOR_CLASSES = ("temperature", "humidity", "carbon_dioxide")
AREA_ALERT_CLASSES = ("motion", "occupancy", "presence")
AREA_TELEMETRY_CLASSES = (*AREA_SENSOR_CLASSES, *AREA_ALERT_CLASSES, "power")

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
    """Merge runtime site identity over configured support defaults."""
    result = deepcopy(fallback if isinstance(fallback, dict) else {})
    site = runtime.get("site")
    if not isinstance(site, dict):
        return result
    for key, value in site.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = {**result[key], **value}
        else:
            result[key] = deepcopy(value)
    return result


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
            "picture": str(raw.get("picture") or ""),
            "icon": str(raw.get("icon") or ""),
            "entities": {module: [] for module in MODULE_LABELS},
            "telemetry": {device_class: [] for device_class in AREA_TELEMETRY_CLASSES},
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
                "picture": "",
                "icon": "",
                "entities": {module: [] for module in MODULE_LABELS},
                "telemetry": {device_class: [] for device_class in AREA_TELEMETRY_CLASSES},
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


def _resolve_weather_entity(
    registry_entities: list[dict[str, Any]], ui: dict[str, Any]
) -> str:
    """Resolve the configured weather entity without observing runtime state."""
    config = ui.get("weather")
    config = config if isinstance(config, dict) else {}
    mode = str(config.get("mode") or "auto").lower()
    if mode in {"off", "disabled", "none"}:
        return ""
    candidates = sorted(
        str(item.get("entity_id") or "")
        for item in registry_entities
        if str(item.get("domain") or "") == "weather"
        and not item.get("disabled")
        and str(item.get("entity_id") or "")
    )
    selected = str(config.get("entity") or "")
    if mode == "manual":
        return selected if selected in candidates else ""
    return candidates[0] if candidates else ""


def _power_sources(
    registry_entities: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    """Return valid raw power sensors, excluding CL Control aggregates."""
    result: dict[str, dict[str, Any]] = {}
    for item in registry_entities:
        entity_id = str(item.get("entity_id") or "")
        if str(item.get("domain") or "") != "sensor":
            continue
        if str(item.get("device_class") or "") != "power":
            continue
        if item.get("disabled") or str(item.get("platform") or "") == DOMAIN:
            continue
        result[entity_id] = item
    return result


def _selected_power_sources(
    *,
    registry_entities: list[dict[str, Any]],
    model: dict[str, Any],
    ui: dict[str, Any],
) -> tuple[list[str], dict[str, list[str]]]:
    """Resolve Auto/Manual/Off power source selections structurally."""
    candidates = _power_sources(registry_entities)
    monitoring = ui.get("power_monitoring")
    monitoring = monitoring if isinstance(monitoring, dict) else {}
    area_cfg = monitoring.get("areas")
    area_cfg = area_cfg if isinstance(area_cfg, dict) else {}

    area_sources: dict[str, list[str]] = {}
    for area in model.get("areas", []):
        config = area_cfg.get(area["id"])
        config = config if isinstance(config, dict) else {}
        mode = str(config.get("mode") or "auto").lower()
        if mode in {"off", "disabled", "none"}:
            selected: list[str] = []
        elif mode == "manual":
            selected = [
                entity_id
                for entity_id in dict.fromkeys(config.get("entities") or [])
                if entity_id in candidates
            ]
        else:
            selected = sorted(
                entity_id
                for entity_id, item in candidates.items()
                if str(item.get("area_id") or "") == area["id"]
            )
        area_sources[area["id"]] = selected

    home_cfg = monitoring.get("home")
    home_cfg = home_cfg if isinstance(home_cfg, dict) else {}
    home_mode = str(home_cfg.get("mode") or "auto").lower()
    if home_mode in {"off", "disabled", "none"}:
        home_sources: list[str] = []
    elif home_mode == "manual":
        home_sources = [
            entity_id
            for entity_id in dict.fromkeys(home_cfg.get("entities") or [])
            if entity_id in candidates
        ]
    else:
        mapped_home = str((ui.get("energy") or {}).get("home") or "")
        if mapped_home in candidates:
            home_sources = [mapped_home]
        else:
            preferred: list[str] = []
            for entity_id, item in candidates.items():
                text = " ".join(
                    str(item.get(key) or "")
                    for key in ("entity_id", "name", "original_name")
                ).casefold()
                if re.search(r"consum|load|casa|house|home", text):
                    preferred.append(entity_id)
            preferred.sort(
                key=lambda entity_id: (
                    bool(candidates[entity_id].get("area_id")),
                    entity_id,
                )
            )
            if preferred:
                home_sources = [preferred[0]]
            else:
                home_sources = list(
                    dict.fromkeys(
                        entity_id
                        for values in area_sources.values()
                        for entity_id in values
                    )
                )
    return home_sources, area_sources


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
    assistance: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build a structural model without copying Home Assistant runtime states."""
    ui = _runtime_ui(runtime)
    cl_modules = deepcopy(cl_modules or [])
    assistance = deepcopy(assistance or {})
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



    # Area telemetry is structural metadata only. Runtime values remain owned by
    # Home Assistant native cards/badges so normal state changes never rebuild
    # the CL Control dashboard model.
    if LEVEL_RANK.get(profile, 1) >= LEVEL_RANK["standard"]:
        for raw in registry_entities:
            entity_id = str(raw.get("entity_id") or "")
            if "." not in entity_id:
                continue
            domain = str(raw.get("domain") or entity_id.split(".", 1)[0])
            telemetry_class = str(raw.get("device_class") or "")
            allowed_classes = set(AREA_SENSOR_CLASSES + AREA_ALERT_CLASSES)
            if LEVEL_RANK.get(profile, 1) >= LEVEL_RANK["pro"]:
                allowed_classes.add("power")
            if telemetry_class not in allowed_classes:
                continue
            if domain not in {"sensor", "binary_sensor"}:
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
            if not _allowed(entity_levels.get(entity_id), profile):
                continue
            area = _resolve_area(
                entity_id,
                str(raw.get("area_id") or "") or None,
                ui,
                by_id,
                by_name,
            )
            if area is None:
                continue
            area["telemetry"][telemetry_class].append(
                {
                    "entity_id": entity_id,
                    "name": _entity_name(raw, ui),
                    "device_class": telemetry_class,
                }
            )

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
        for telemetry_items in area["telemetry"].values():
            telemetry_items.sort(
                key=lambda item: (
                    item["name"].casefold(),
                    item["entity_id"],
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

    support = effective_site.get("support")
    support = support if isinstance(support, dict) else {}
    whatsapp = re.sub(r"\D", "", str(support.get("whatsapp") or ""))
    weather_entity = _resolve_weather_entity(registry_entities, ui)

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
        "weather_entity": weather_entity,
        "favorites": favorites,
        "areas": active_areas,
        "modules": modules,
        "cl_modules": cl_modules,
        "energy": {
            "requested_provider": requested_energy_provider,
            "provider": resolved_energy_provider,
        },
        "assistance": {
            "provider": str(assistance.get("provider") or "whatsapp"),
            "ai_enabled": bool(assistance.get("ai_enabled")),
            "fallback_whatsapp": bool(
                assistance.get("fallback_whatsapp", True)
            ),
            "whatsapp": whatsapp,
        },
    }


def _branding_section(
    model: dict[str, Any], context: str, *, column_span: int
) -> dict[str, Any]:
    """Return compact CL branding with optional native weather tile."""
    logo = model["branding"].get("logo_url") or ""
    brand = model["branding"].get("brand_name") or "CL Control"
    site_name = model["site"].get("site_name") or "Impianto"
    title = brand if context == "home" else f"{brand} · {context}"
    logo_html = (
        f'<img src="{logo}" alt="CL Impianti" width="64">'
        if logo
        else "<strong>CL Impianti</strong>"
    )
    weather_entity = str(model.get("weather_entity") or "")
    brand_columns: int | str = 8 if weather_entity else "full"
    cards: list[dict[str, Any]] = [
        {
            "type": "markdown",
            "content": (
                '<table role="presentation" width="100%"><tr>'
                f'<td width="78" valign="middle">{logo_html}</td>'
                f'<td valign="middle"><strong>{title}</strong><br>'
                f'<span>{site_name}</span></td>'
                '</tr></table>'
            ),
            "tap_action": {
                "action": "navigate",
                "navigation_path": "home",
            },
            "hold_action": {"action": "none"},
            "grid_options": {"columns": brand_columns, "rows": 2},
        }
    ]
    if weather_entity:
        cards.append(
            {
                "type": "tile",
                "entity": weather_entity,
                "name": "Meteo",
                "state_content": ["state", "temperature"],
                "tap_action": {"action": "more-info"},
                "hold_action": {"action": "none"},
                "grid_options": {"columns": 4, "rows": 2},
            }
        )
    return {
        "type": "grid",
        "column_span": column_span,
        "cards": cards,
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


def _camera_card(entity: dict[str, Any]) -> dict[str, Any]:
    """Return a visual native camera card without a CL custom renderer."""
    return {
        "type": "picture-entity",
        "entity": entity["entity_id"],
        "name": entity["name"],
        "camera_view": "auto",
        "fit_mode": "cover",
        "show_name": True,
        "show_state": False,
        "tap_action": {"action": "more-info"},
        "hold_action": {"action": "none"},
    }


def _entity_card(entity: dict[str, Any]) -> dict[str, Any]:
    if entity.get("module") == "cameras":
        return _camera_card(entity)
    return _tile(entity)


def _heading(label: str, icon: str) -> dict[str, Any]:
    return {"type": "heading", "heading": label, "icon": icon}


def _assistance_url(
    model: dict[str, Any], *, context: str, category: str
) -> str:
    """Build a contextual WhatsApp handoff without exposing backend secrets."""
    assistance = model.get("assistance") or {}
    phone = re.sub(r"\D", "", str(assistance.get("whatsapp") or ""))
    if not phone:
        return ""
    site_name = str((model.get("site") or {}).get("site_name") or "Casa")
    lines = [
        "Richiesta assistenza CL Impianti",
        f"Impianto: {site_name}",
        f"Categoria: {category or 'Altro'}",
        f"Contesto: {context or 'Home'}",
        "Descrizione: ",
    ]
    return f"https://wa.me/{phone}?text={quote(chr(10).join(lines))}"


def _assistance_section(
    model: dict[str, Any], *, context: str, category: str
) -> dict[str, Any] | None:
    """Return a discreet support shortcut at the bottom of a view."""
    url = _assistance_url(model, context=context, category=category)
    if not url:
        return None
    return {
        "type": "grid",
        "cards": [
            {
                "type": "shortcut",
                "label": "Assistenza CL",
                "icon": "mdi:headset",
                "tap_action": {"action": "url", "url_path": url},
                "hold_action": {"action": "none"},
                "grid_options": {"columns": 6, "rows": 1},
            }
        ],
    }


def _installer_section(model: dict[str, Any]) -> dict[str, Any] | None:
    """Expose installer configuration only to Home Assistant administrators."""
    users = [
        str(user_id)
        for user_id in model.get("admin_user_ids") or []
        if str(user_id)
    ]
    if not users:
        return None
    return {
        "type": "grid",
        "cards": [
            {
                "type": "shortcut",
                "label": "Configurazione Installatore",
                "icon": "mdi:cog-outline",
                "tap_action": {
                    "action": "navigate",
                    "navigation_path": "/cl-control?installer=1",
                },
                "hold_action": {"action": "none"},
                "visibility": [{"condition": "user", "users": users}],
                "grid_options": {"columns": 6, "rows": 1},
            }
        ],
    }


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


def _system_summary_card(
    model: dict[str, Any], module: str, data: dict[str, Any]
) -> dict[str, Any]:
    """Prefer native entity tiles so summaries update without config rebuilds."""
    if module == "security" and data.get("entities"):
        return {
            "type": "tile",
            "entity": data["entities"][0]["entity_id"],
            "name": data["label"],
            "icon": data["icon"],
            "state_content": "state",
            "tap_action": {
                "action": "navigate",
                "navigation_path": data["path"],
            },
            "hold_action": {"action": "none"},
            "grid_options": {"columns": 6, "rows": 1},
        }
    entity_id = str((model.get("summary_entities") or {}).get(module) or "")
    if not entity_id:
        return _navigation_shortcut(
            name=data["label"], icon=data["icon"], path=data["path"]
        )
    return {
        "type": "tile",
        "entity": entity_id,
        "name": data["label"],
        "icon": data["icon"],
        "state_content": "summary",
        "tap_action": {
            "action": "navigate",
            "navigation_path": data["path"],
        },
        "hold_action": {"action": "none"},
        "grid_options": {"columns": 6, "rows": 1},
    }


def _area_badges(model: dict[str, Any], area: dict[str, Any]) -> list[dict[str, Any]]:
    """Return native state badges allowed by the active experience profile."""
    if LEVEL_RANK.get(str(model.get("profile") or "standard"), 1) < LEVEL_RANK["standard"]:
        return []
    badges: list[dict[str, Any]] = []
    telemetry = area.get("telemetry") or {}
    for device_class in AREA_SENSOR_CLASSES + AREA_ALERT_CLASSES:
        items = telemetry.get(device_class) or []
        if not items:
            continue
        badges.append(
            {
                "type": "entity",
                "entity": items[0]["entity_id"],
                "show_name": False,
                "show_state": True,
                "show_icon": True,
            }
        )
    if LEVEL_RANK.get(str(model.get("profile") or "standard"), 1) >= LEVEL_RANK["pro"]:
        power_entity = str((model.get("area_power_entities") or {}).get(area["id"]) or "")
        if power_entity:
            badges.append(
                {
                    "type": "entity",
                    "entity": power_entity,
                    "name": "Potenza",
                    "show_name": False,
                    "show_state": True,
                    "show_icon": True,
                }
            )
    return badges


def _light_heading(area: dict[str, Any]) -> dict[str, Any]:
    """Return a native lights heading with state-aware area ON/OFF actions."""
    lights = [item["entity_id"] for item in area["entities"]["lights"]]
    heading = _heading(MODULE_LABELS["lights"][0], MODULE_LABELS["lights"][1])
    if not lights:
        return heading
    any_on = {
        "condition": "or",
        "conditions": [
            {"condition": "state", "entity": entity_id, "state": "on"}
            for entity_id in lights
        ],
    }
    heading["badges"] = [
        {
            "type": "button",
            "icon": "mdi:power",
            "text": "Accendi tutte",
            "tap_action": {
                "action": "perform-action",
                "perform_action": "light.turn_on",
                "target": {"area_id": area["id"]},
            },
            "visibility": [
                {"condition": "not", "conditions": [any_on]},
            ],
        },
        {
            "type": "button",
            "icon": "mdi:power",
            "color": "orange",
            "text": "Spegni tutte",
            "tap_action": {
                "action": "perform-action",
                "perform_action": "light.turn_off",
                "target": {"area_id": area["id"]},
            },
            "visibility": [any_on],
        },
    ]
    return heading


def _module_sections(
    entities: list[dict[str, Any]], areas: list[dict[str, Any]], module: str
) -> list[dict[str, Any]]:
    sections: list[dict[str, Any]] = []
    assigned: set[str] = set()
    for area in areas:
        cards = [_entity_card(item) for item in area["entities"][module]]
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
                    *[_entity_card(item) for item in unassigned],
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
                    *[_entity_card(item) for item in model["favorites"]],
                ],
            }
        )

    if model["areas"]:
        area_cards: list[dict[str, Any]] = [_heading("Aree", "mdi:floor-plan")]
        for area in model["areas"]:
            if area["native"]:
                area_card = {
                    "type": "area",
                    "area": area["id"],
                    "name": area["name"],
                    "display_type": "picture" if area.get("picture") else "compact",
                    "navigation_path": area["path"],
                }
                if LEVEL_RANK.get(str(model.get("profile") or "standard"), 1) >= LEVEL_RANK["standard"]:
                    sensor_classes = list(AREA_SENSOR_CLASSES)
                    area_card["alert_classes"] = list(AREA_ALERT_CLASSES)
                    if LEVEL_RANK.get(str(model.get("profile") or "standard"), 1) >= LEVEL_RANK["pro"]:
                        power_entity = str(
                            (model.get("area_power_entities") or {}).get(area["id"]) or ""
                        )
                        if power_entity:
                            sensor_classes.append("power")
                            area_card["exclude_entities"] = [
                                item["entity_id"]
                                for item in (area.get("telemetry") or {}).get("power", [])
                            ]
                    area_card["sensor_classes"] = sensor_classes
                if area.get("picture"):
                    area_card["aspect_ratio"] = "16:9"
                area_cards.append(area_card)
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
    for module in ("lights", "covers", "climate", "cameras", "security"):
        data = model["modules"][module]
        if data["count"]:
            system_cards.append(_system_summary_card(model, module, data))
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

    installer_section = _installer_section(model)
    if installer_section is not None:
        sections.append(installer_section)

    home_assistance = _assistance_section(
        model, context="Home", category="Altro"
    )
    if home_assistance is not None:
        sections.append(home_assistance)

    home_view: dict[str, Any] = {
        "type": "sections",
        "title": "Home",
        "path": "home",
        "icon": "mdi:home",
        "max_columns": 3,
        "sections": sections,
    }
    if (
        LEVEL_RANK.get(str(model.get("profile") or "standard"), 1)
        >= LEVEL_RANK["pro"]
        and model.get("home_power_entity")
    ):
        home_view["badges"] = [
            {
                "type": "entity",
                "entity": model["home_power_entity"],
                "name": "Potenza casa",
                "show_name": True,
                "show_state": True,
                "show_icon": True,
            }
        ]
    views: list[dict[str, Any]] = [home_view]

    for area in model["areas"]:
        area_sections = [_branding_section(model, area["name"], column_span=2)]
        for module in ("lights", "covers", "climate", "cameras", "security"):
            items = area["entities"][module]
            if items:
                heading = (
                    _light_heading(area)
                    if module == "lights"
                    else _heading(
                        MODULE_LABELS[module][0],
                        MODULE_LABELS[module][1],
                    )
                )
                area_sections.append(
                    {
                        "type": "grid",
                        "cards": [
                            heading,
                            *[_entity_card(item) for item in items],
                        ],
                    }
                )
        area_assistance = _assistance_section(
            model, context=area["name"], category="Altro"
        )
        if area_assistance is not None:
            area_sections.append(area_assistance)
        views.append(
            {
                "type": "sections",
                "title": area["name"],
                "path": area["path"],
                "subview": True,
                "visible": False,
                "back_path": "home",
                "max_columns": 2,
                "badges": _area_badges(model, area),
                "sections": area_sections,
            }
        )

    for module in ("lights", "covers", "climate", "cameras", "security"):
        data = model["modules"][module]
        if not data["count"]:
            continue
        module_sections = [
            _branding_section(model, data["label"], column_span=3),
            *_module_sections(data["entities"], model["areas"], module),
        ]
        module_assistance = _assistance_section(
            model,
            context=data["label"],
            category=data["label"],
        )
        if module_assistance is not None:
            module_sections.append(module_assistance)
        views.append(
            {
                "type": "sections",
                "title": data["label"],
                "path": data["path"],
                "icon": data["icon"],
                "subview": True,
                "visible": False,
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
            {
                "id": area.id,
                "name": area.name,
                "picture": str(getattr(area, "picture", "") or ""),
                "icon": str(getattr(area, "icon", "") or ""),
            }
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
                    "device_class": str(
                        getattr(
                            entry.device_class or entry.original_device_class,
                            "value",
                            entry.device_class or entry.original_device_class or "",
                        )
                    ),
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
            assistance=settings.get("assistance") or {},
        )
        domain_data = getattr(self.hass, "data", {}).get(DOMAIN, {})
        summary_manager = domain_data.get(DATA_SUMMARY_MANAGER)
        if summary_manager is not None:
            summary_manager.set_sources(
                {
                    module: [
                        item["entity_id"]
                        for item in model["modules"][module]["entities"]
                    ]
                    for module in ("lights", "covers", "climate")
                }
            )
            home_power_sources, area_power_sources = _selected_power_sources(
                registry_entities=entities,
                model=model,
                ui=_runtime_ui(runtime),
            )
            summary_manager.set_area_power_sources(area_power_sources)
            summary_manager.set_home_power_sources(home_power_sources)
            model["summary_entities"] = summary_manager.entity_ids()
            model["area_power_entities"] = summary_manager.area_power_entity_ids()
            model["home_power_entity"] = summary_manager.home_power_entity_id()
        else:
            model["summary_entities"] = {}
            model["area_power_entities"] = {}
            model["home_power_entity"] = ""
        try:
            users = await self.hass.auth.async_get_users()
            model["admin_user_ids"] = [
                str(user.id)
                for user in users
                if bool(getattr(user, "is_admin", False))
                and bool(getattr(user, "is_active", True))
            ]
        except (AttributeError, RuntimeError):
            model["admin_user_ids"] = []
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

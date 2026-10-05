"""Lightweight native Home Assistant dashboard model for CL Control 3.5."""

from __future__ import annotations

from copy import deepcopy
import re
import unicodedata
from urllib.parse import quote
from typing import Any

from .const import DATA_CREDENTIALS, DATA_SUMMARY_MANAGER, DOMAIN
from .ecosystem import async_discover_cl_modules, module_signature, resolve_energy_provider
from .modules.security import INIM_ZONE_RE, PARTITION_RE, RISCO_BYPASS_RE

DOMAIN_MODULE = {
    "light": "lights",
    "cover": "covers",
    "climate": "climate",
    "alarm_control_panel": "security",
    "camera": "cameras",
    # Home Assistant "Mostra come" / Switch as X exposes converted switches
    # using the target domain. Keep those entities in the matching Area section.
    "fan": "fans",
    "lock": "locks",
    "siren": "sirens",
    "valve": "valves",
}

MODULE_LABELS = {
    "lights": ("Luci", "mdi:lightbulb-group"),
    "covers": ("Aperture", "mdi:window-shutter"),
    "climate": ("Clima", "mdi:thermostat"),
    "security": ("Sicurezza", "mdi:shield-home"),
    "cameras": ("Telecamere", "mdi:cctv"),
}

# Switches/outlets are useful inside an Area but are intentionally not a
# top-level CL Control System. This preserves the Home taxonomy while exposing
# customer-facing plugs and switches assigned to rooms such as Tavernetta.
AREA_ONLY_MODULES = {
    "switches": ("Interruttori", "mdi:toggle-switch"),
    "outlets": ("Prese", "mdi:power-socket-eu"),
    "fans": ("Ventilatori", "mdi:fan"),
    "locks": ("Serrature", "mdi:lock"),
    "sirens": ("Sirene", "mdi:alarm-light"),
    "valves": ("Valvole", "mdi:valve"),
}
AREA_MODULE_LABELS = {**MODULE_LABELS, **AREA_ONLY_MODULES}

AREA_SENSOR_CLASSES = ("temperature", "humidity", "carbon_dioxide")
AREA_ALERT_CLASSES = ("motion", "occupancy", "presence")
AREA_TELEMETRY_CLASSES = (*AREA_SENSOR_CLASSES, *AREA_ALERT_CLASSES, "power")

LEVEL_RANK = {"essential": 0, "standard": 1, "pro": 2, "installer": 3}
TECHNICAL_PLATFORMS = {"cl_control", "cl_power_control", "cl_irrigation"}
SECURITY_PLATFORMS = {
    "risco",
    "irisco",
    "inim",
    "alarmo",
    "paradox",
    "dsc",
    "texecom",
    "jablotron",
}
SECURITY_ZONE_CLASSES = {
    "door",
    "window",
    "garage_door",
    "opening",
    "motion",
    "occupancy",
    "smoke",
    "moisture",
    "gas",
    "tamper",
    "vibration",
}


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
            "floor_id": str(raw.get("floor_id") or ""),
            "floor_name": str(raw.get("floor_name") or ""),
            "floor_icon": str(raw.get("floor_icon") or ""),
            "floor_order": int(raw.get("floor_order") or 0),
            "entities": {module: [] for module in AREA_MODULE_LABELS},
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
                "floor_id": "",
                "floor_name": "",
                "floor_icon": "",
                "floor_order": 10**9,
                "entities": {module: [] for module in AREA_MODULE_LABELS},
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


def _partition_name(entity: dict[str, Any], ui: dict[str, Any]) -> str:
    """Return the actual INIM partition name instead of generic 'Arming Status'."""
    entity_id = str(entity.get("entity_id") or "")
    aliases = ui.get("aliases") or {}
    alias = str(aliases.get(entity_id) or "").strip()
    if alias:
        return alias
    match = re.fullmatch(r"select\.partition_(?P<name>[a-z0-9_]+)_mode", entity_id)
    if match:
        slug = match.group("name")
        return slug.replace("_", " ").strip().title() or _entity_name(entity, ui)
    return _entity_name(entity, ui)


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




def _build_security_model(
    *,
    registry_entities: list[dict[str, Any]],
    visible_entities: list[dict[str, Any]],
    ui: dict[str, Any],
    profile: str,
    by_id: dict[str, dict[str, Any]],
    by_name: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    """Build security structure while leaving all live states to Home Assistant."""
    raw_by_id = {str(item.get("entity_id") or ""): item for item in registry_entities}
    visibility = ui.get("entity_visibility") or {}
    hidden = set(ui.get("hidden") or [])
    levels = ui.get("entity_levels") or {}
    overrides = ui.get("entity_modules") or {}

    def allowed(raw: dict[str, Any]) -> bool:
        entity_id = str(raw.get("entity_id") or "")
        explicit = visibility.get(entity_id)
        if explicit is False or (entity_id in hidden and explicit is not True):
            return False
        if raw.get("disabled"):
            return False
        if raw.get("hidden") and explicit is not True:
            return False
        if raw.get("entity_category") and explicit is not True:
            return False
        if str(raw.get("platform") or "") in TECHNICAL_PLATFORMS and explicit is not True:
            return False
        return _allowed(levels.get(entity_id), profile)

    panels: list[dict[str, Any]] = []
    panel_config_entries: set[str] = set()
    panel_devices: set[str] = set()
    for item in visible_entities:
        if item.get("domain") != "alarm_control_panel" or item.get("module") != "security":
            continue
        raw = raw_by_id.get(item["entity_id"], {})
        area = _resolve_area(
            item["entity_id"], str(raw.get("area_id") or "") or None, ui, by_id, by_name
        )
        config_entry_id = str(raw.get("config_entry_id") or "")
        device_id = str(raw.get("device_id") or "")
        if config_entry_id:
            panel_config_entries.add(config_entry_id)
        if device_id:
            panel_devices.add(device_id)
        panels.append(
            {
                "entity_id": item["entity_id"],
                "name": item["name"],
                "area_id": area["id"] if area else "",
                "area_name": area["name"] if area else "Altri dispositivi",
                "floor_id": area.get("floor_id", "") if area else "",
                "floor_name": area.get("floor_name", "") if area else "",
                "floor_icon": area.get("floor_icon", "") if area else "",
                "floor_order": int(area.get("floor_order") or 0) if area else 10**9,
                "supported_features": int(item.get("supported_features") or 0),
                "platform": str(item.get("platform") or ""),
            }
        )

    partitions: list[dict[str, Any]] = []
    switches_by_id: dict[str, dict[str, Any]] = {}
    switches_by_device: dict[str, list[dict[str, Any]]] = {}
    for raw in registry_entities:
        entity_id = str(raw.get("entity_id") or "")
        if entity_id.startswith("switch.") and not raw.get("disabled"):
            switches_by_id[entity_id] = raw
            device_id = str(raw.get("device_id") or "")
            if device_id:
                switches_by_device.setdefault(device_id, []).append(raw)
        if not allowed(raw) or not PARTITION_RE.fullmatch(entity_id):
            continue
        area = _resolve_area(
            entity_id, str(raw.get("area_id") or "") or None, ui, by_id, by_name
        )
        partitions.append(
            {
                "entity_id": entity_id,
                "name": _partition_name(raw, ui),
                "area_id": area["id"] if area else "",
                "area_name": area["name"] if area else "Altri dispositivi",
                "floor_id": area.get("floor_id", "") if area else "",
                "floor_name": area.get("floor_name", "") if area else "",
                "floor_icon": area.get("floor_icon", "") if area else "",
                "floor_order": int(area.get("floor_order") or 0) if area else 10**9,
                "platform": str(raw.get("platform") or ""),
            }
        )

    zones: list[dict[str, Any]] = []
    for raw in registry_entities:
        entity_id = str(raw.get("entity_id") or "")
        if not entity_id.startswith("binary_sensor.") or not allowed(raw):
            continue
        platform = str(raw.get("platform") or "").lower()
        device_class = str(raw.get("device_class") or "").lower()
        config_entry_id = str(raw.get("config_entry_id") or "")
        device_id = str(raw.get("device_id") or "")
        semantic = " ".join(
            [
                entity_id,
                str(raw.get("name") or ""),
                str(raw.get("original_name") or ""),
            ]
        ).lower()
        manual = str(overrides.get(entity_id) or "") == "security"
        linked = bool(
            (config_entry_id and config_entry_id in panel_config_entries)
            or (device_id and device_id in panel_devices)
        )
        known_class = device_class in SECURITY_ZONE_CLASSES
        security_semantics = bool(
            re.search(r"(?:^|[^a-z0-9])(?:zone|zona|alarm|allarm|security|sicurezza|tamper|sabot)(?:$|[^a-z0-9])", semantic)
        )
        candidate = manual or (
            platform in SECURITY_PLATFORMS and (linked or known_class or security_semantics)
        ) or (linked and known_class) or (known_class and security_semantics)
        if not candidate:
            continue
        area = _resolve_area(
            entity_id, str(raw.get("area_id") or "") or None, ui, by_id, by_name
        )
        bypass_entity_id = ""
        bypass_requires_pin = False
        if platform in {"risco", "irisco"} and device_id:
            for switch in switches_by_device.get(device_id, []):
                switch_id = str(switch.get("entity_id") or "")
                switch_platform = str(switch.get("platform") or "").lower()
                if switch_platform in {"risco", "irisco"} and RISCO_BYPASS_RE.fullmatch(switch_id):
                    bypass_entity_id = switch_id
                    break
        if not bypass_entity_id:
            slug = entity_id.removeprefix("binary_sensor.")
            exclusion_id = f"switch.{slug}_exclusion"
            if INIM_ZONE_RE.fullmatch(exclusion_id) and exclusion_id in switches_by_id:
                bypass_entity_id = exclusion_id
                bypass_requires_pin = True
        zones.append(
            {
                "entity_id": entity_id,
                "name": _entity_name(raw, ui),
                "area_id": area["id"] if area else "",
                "area_name": area["name"] if area else "Altri dispositivi",
                "floor_id": area.get("floor_id", "") if area else "",
                "floor_name": area.get("floor_name", "") if area else "",
                "floor_icon": area.get("floor_icon", "") if area else "",
                "floor_order": int(area.get("floor_order") or 0) if area else 10**9,
                "device_class": device_class or "generic",
                "platform": platform,
                "bypass_entity_id": bypass_entity_id,
                "bypass_requires_pin": bypass_requires_pin,
            }
        )

    sort_key = lambda item: (
        int(item.get("floor_order") or 0),
        str(item.get("floor_name") or "").casefold(),
        str(item.get("area_name") or "").casefold(),
        str(item.get("name") or "").casefold(),
        str(item.get("entity_id") or ""),
    )
    panels.sort(key=sort_key)
    partitions.sort(key=sort_key)
    zones.sort(key=sort_key)
    return {"panels": panels, "partitions": partitions, "zones": zones}


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
        # Respect Home Assistant's native "Mostra come" classification.
        # A switch configured as Presa remains in the switch domain with the
        # outlet device class; conversions such as Luce/Copertura/Ventilatore
        # are exposed by Home Assistant / switch_as_x in their target domain.
        raw_device_class = str(raw.get("device_class") or "").lower()
        native_module = DOMAIN_MODULE.get(domain) or (
            "outlets"
            if domain == "switch" and raw_device_class == "outlet"
            else "switches" if domain == "switch" else ""
        )
        module = str(module_overrides.get(entity_id) or native_module)
        if module not in AREA_MODULE_LABELS:
            continue
        # Security bypass switches belong exclusively to the Security view.
        # Do not duplicate them among normal room switches/outlets.
        if domain == "switch" and (
            INIM_ZONE_RE.fullmatch(entity_id) or RISCO_BYPASS_RE.fullmatch(entity_id)
        ):
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
            "device_id": str(raw.get("device_id") or ""),
            "config_entry_id": str(raw.get("config_entry_id") or ""),
            "supported_features": int(raw.get("supported_features") or 0),
            "device_class": str(raw.get("device_class") or ""),
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
        for module in AREA_MODULE_LABELS:
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

    security_model = _build_security_model(
        registry_entities=registry_entities,
        visible_entities=visible_entities,
        ui=ui,
        profile=profile,
        by_id=by_id,
        by_name=by_name,
    )
    security_area_ids = {
        str(item.get("area_id") or "")
        for group in ("panels", "partitions", "zones")
        for item in security_model[group]
        if str(item.get("area_id") or "")
    }

    area_order = {
        str(value).casefold(): index
        for index, value in enumerate(ui.get("area_order") or [])
    }
    active_areas = [
        area
        for area in by_id.values()
        if any(area["entities"][module] for module in AREA_MODULE_LABELS)
        or area["id"] in security_area_ids
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

    # Area presentation preferences are intentionally limited to CL Control.
    # Hiding an area here never changes the Home Assistant Area Registry and
    # does not break security/camera correlations or direct subview access.
    area_visibility = ui.get("area_visibility")
    area_visibility = area_visibility if isinstance(area_visibility, dict) else {}
    area_picture_visibility = ui.get("area_picture_visibility")
    area_picture_visibility = (
        area_picture_visibility if isinstance(area_picture_visibility, dict) else {}
    )
    for area in active_areas:
        area_id = str(area.get("id") or "")
        area["home_visible"] = area_visibility.get(area_id, True) is not False
        area["show_picture"] = (
            area_picture_visibility.get(area_id, True) is not False
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
            item
            for item in visible_entities
            if item["module"] == module
            and (module != "security" or item["domain"] == "alarm_control_panel")
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
        "security": security_model,
        "favorites": favorites,
        "areas": active_areas,
        "modules": modules,
        "home_order": [str(value) for value in (ui.get("home_order") or []) if str(value)],
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
    """Return the compact CL header with weather integrated in one card."""
    logo = model["branding"].get("logo_url") or ""
    brand = model["branding"].get("brand_name") or "CL Control"
    site_name = model["site"].get("site_name") or "Impianto"
    title = brand if context == "home" else f"{brand} · {context}"
    weather_entity = str(model.get("weather_entity") or "")
    return {
        "type": "grid",
        "column_span": column_span,
        "cards": [
            {
                "type": "custom:cl-control-header-card",
                "logo": logo,
                "title": title,
                "site_name": site_name,
                "weather_entity": weather_entity,
                "is_home": context == "home",
                "grid_options": {"columns": "full", "rows": 2},
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
    return f"https://wa.me/{phone}?text={quote(chr(10).join(lines), safe='')}"


def _assistance_section(
    model: dict[str, Any], *, context: str, category: str, column_span: int
) -> dict[str, Any] | None:
    """Return a full-width support shortcut at the bottom of a view."""
    url = _assistance_url(model, context=context, category=category)
    if not url:
        return None
    return {
        "type": "grid",
        "column_span": column_span,
        "cards": [
            {
                "type": "custom:cl-control-assistance-card",
                "label": "Assistenza CL",
                "icon": "mdi:headset",
                "subtitle": (
                    "Supporto rapido CL Impianti"
                    if context == "Home"
                    else f"Supporto rapido · {context}"
                ),
                "url": url,
                "grid_options": {"columns": "full", "rows": 1},
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
                    "navigation_path": "installer",
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




def _security_card(
    model: dict[str, Any], *, area_id: str | None = None
) -> dict[str, Any] | None:
    """Return the isolated CL Security card; live values remain in Home Assistant."""
    security = model.get("security") or {}

    def scoped(key: str) -> list[dict[str, Any]]:
        items = [dict(item) for item in security.get(key) or []]
        if area_id is None:
            return items
        return [item for item in items if str(item.get("area_id") or "") == area_id]

    panels = scoped("panels")
    partitions = scoped("partitions")
    zones = scoped("zones")
    if not panels and not partitions and not zones:
        return None
    return {
        "type": "custom:cl-security-card",
        "title": "Sicurezza",
        "panels": panels,
        "partitions": partitions,
        "zones": zones,
        "pin_configured": bool(security.get("pin_configured")),
        "group_by_floor": area_id is None,
        "grid_options": {"columns": 12},
    }


def _security_camera_sections(model: dict[str, Any]) -> list[dict[str, Any]]:
    """Return cameras correlated to security areas without duplicating all cameras."""
    security = model.get("security") or {}
    security_area_ids = {
        str(item.get("area_id") or "")
        for key in ("panels", "partitions", "zones")
        for item in security.get(key) or []
        if str(item.get("area_id") or "")
    }
    if not security_area_ids:
        return []
    cameras = [
        item
        for item in (model.get("modules", {}).get("cameras", {}).get("entities") or [])
        if str(item.get("area_id") or "") in security_area_ids
    ]
    if not cameras:
        return []
    areas_by_id = {str(area.get("id") or ""): area for area in model.get("areas") or []}
    sections: list[dict[str, Any]] = []
    for area_id in sorted(
        security_area_ids,
        key=lambda value: (
            int((areas_by_id.get(value) or {}).get("floor_order") or 0),
            str((areas_by_id.get(value) or {}).get("floor_name") or "").casefold(),
            str((areas_by_id.get(value) or {}).get("name") or value).casefold(),
        ),
    ):
        area_cameras = [item for item in cameras if str(item.get("area_id") or "") == area_id]
        if not area_cameras:
            continue
        area_meta = areas_by_id.get(area_id) or {}
        area_name = str(area_meta.get("name") or "Area")
        floor_name = str(area_meta.get("floor_name") or "").strip()
        camera_heading = f"Telecamere · {floor_name} · {area_name}" if floor_name else f"Telecamere · {area_name}"
        sections.append(
            {
                "type": "grid",
                "cards": [
                    _heading(camera_heading, "mdi:cctv"),
                    *[_camera_card(item) for item in area_cameras],
                ],
            }
        )
    return sections


def _system_summary_card(
    model: dict[str, Any], module: str, data: dict[str, Any]
) -> dict[str, Any]:
    """Prefer native entity tiles so summaries update without config rebuilds."""
    if module == "security":
        panels = (model.get("security") or {}).get("panels") or []
        if panels:
            return {
                "type": "tile",
                "entity": panels[0]["entity_id"],
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
        return _navigation_shortcut(
            name=data["label"], icon=data["icon"], path=data["path"]
        )
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


_STATUS_LABELS = {
    "temperature": "Temperatura",
    "humidity": "Umidità",
    "carbon_dioxide": "CO₂",
    "motion": "Movimento",
    "occupancy": "Occupazione",
    "presence": "Presenza",
}


def _status_tile(entity_id: str, *, name: str = "") -> dict[str, Any]:
    """Return a compact native status tile used below the CL brand header."""
    card: dict[str, Any] = {
        "type": "tile",
        "entity": entity_id,
        "state_content": "state",
        "tap_action": {"action": "more-info"},
        "hold_action": {"action": "none"},
        "grid_options": {"columns": 6, "rows": 1},
    }
    if name:
        card["name"] = name
    return card


def _home_status_section(model: dict[str, Any], *, column_span: int) -> dict[str, Any] | None:
    """Place home-level counters below the CL brand, never above it."""
    if (
        LEVEL_RANK.get(str(model.get("profile") or "standard"), 1)
        < LEVEL_RANK["pro"]
        or not model.get("home_power_entity")
    ):
        return None
    return {
        "type": "grid",
        "column_span": column_span,
        "cards": [
            _status_tile(str(model["home_power_entity"]), name="Potenza casa")
        ],
    }


def _area_status_section(
    model: dict[str, Any], area: dict[str, Any], *, column_span: int
) -> dict[str, Any] | None:
    """Place area telemetry immediately below the CL brand header."""
    if (
        LEVEL_RANK.get(str(model.get("profile") or "standard"), 1)
        < LEVEL_RANK["standard"]
    ):
        return None
    cards: list[dict[str, Any]] = []
    telemetry = area.get("telemetry") or {}
    for device_class in AREA_SENSOR_CLASSES + AREA_ALERT_CLASSES:
        items = telemetry.get(device_class) or []
        if not items:
            continue
        cards.append(
            _status_tile(
                str(items[0]["entity_id"]),
                name=_STATUS_LABELS.get(device_class, ""),
            )
        )
    if (
        LEVEL_RANK.get(str(model.get("profile") or "standard"), 1)
        >= LEVEL_RANK["pro"]
    ):
        power_entity = str(
            (model.get("area_power_entities") or {}).get(area["id"]) or ""
        )
        if power_entity:
            cards.append(_status_tile(power_entity, name="Potenza"))
    if not cards:
        return None
    return {
        "type": "grid",
        "column_span": column_span,
        "cards": cards,
    }


def _light_heading(area: dict[str, Any], title: str | None = None) -> dict[str, Any]:
    """Return a lights heading with state-aware ON/OFF actions for one area."""
    lights = [item["entity_id"] for item in area["entities"]["lights"]]
    heading = _heading(title or MODULE_LABELS["lights"][0], MODULE_LABELS["lights"][1])
    if not lights:
        return heading
    any_on = {
        "condition": "or",
        "conditions": [
            {"condition": "state", "entity": entity_id, "state": "on"}
            for entity_id in lights
        ],
    }
    target = {"area_id": area["id"]} if area.get("native") else {"entity_id": lights}
    heading["badges"] = [
        {
            "type": "button",
            "icon": "mdi:power",
            "text": "Accendi tutte",
            "tap_action": {
                "action": "perform-action",
                "perform_action": "light.turn_on",
                "target": target,
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
                "target": target,
            },
            "visibility": [any_on],
        },
    ]
    return heading


def _module_sections(
    entities: list[dict[str, Any]],
    areas: list[dict[str, Any]],
    module: str,
    profile: str = "standard",
) -> list[dict[str, Any]]:
    sections: list[dict[str, Any]] = []
    if module == "cameras" and LEVEL_RANK.get(profile, 1) < LEVEL_RANK["standard"]:
        if not entities:
            return []
        return [
            {
                "type": "grid",
                "cards": [
                    _heading("Telecamere", MODULE_LABELS[module][1]),
                    *[_entity_card(item) for item in entities],
                ],
            }
        ]
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
                    _light_heading(area, area["name"])
                    if module == "lights"
                    else _heading(area["name"], MODULE_LABELS[module][1]),
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
    home_status = _home_status_section(model, column_span=3)
    if home_status is not None:
        sections.append(home_status)

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

    home_areas = [
        area for area in model["areas"] if area.get("home_visible", True)
    ]
    if home_areas:
        # Mirror Home Assistant's floor-aware Home organization while keeping
        # CL Control's custom area order inside each floor. Areas that are not
        # assigned to any HA floor are grouped under "Altre aree".
        floor_groups: dict[str, dict[str, Any]] = {}
        unassigned_key = "__cl_unassigned__"
        for area in home_areas:
            floor_id = str(area.get("floor_id") or "")
            group_key = floor_id or unassigned_key
            if group_key not in floor_groups:
                floor_groups[group_key] = {
                    "id": floor_id,
                    "name": str(area.get("floor_name") or "") if floor_id else "Altre aree",
                    "icon": str(area.get("floor_icon") or "") if floor_id else "mdi:home-outline",
                    "order": int(area.get("floor_order") or 0) if floor_id else 10**9,
                    "areas": [],
                }
            floor_groups[group_key]["areas"].append(area)

        ordered_groups = sorted(
            floor_groups.values(),
            key=lambda group: (
                int(group.get("order") or 0),
                str(group.get("name") or "").casefold(),
            ),
        )

        area_cards: list[dict[str, Any]] = []
        only_unassigned = (
            len(ordered_groups) == 1 and not str(ordered_groups[0].get("id") or "")
        )
        for group in ordered_groups:
            heading_name = "Aree" if only_unassigned else str(group.get("name") or "Altre aree")
            heading_icon = (
                "mdi:floor-plan"
                if only_unassigned
                else str(group.get("icon") or "mdi:home-floor-1")
            )
            area_cards.append(_heading(heading_name, heading_icon))
            for area in group["areas"]:
                if area["native"]:
                    use_picture = bool(area.get("picture")) and area.get("show_picture", True)
                    area_card = {
                        "type": "area",
                        "area": area["id"],
                        "name": area["name"],
                        "display_type": "picture" if use_picture else "compact",
                        "navigation_path": area["path"],
                    }
                    profile_rank = LEVEL_RANK.get(str(model.get("profile") or "standard"), 1)
                    if profile_rank >= LEVEL_RANK["standard"]:
                        sensor_classes = list(AREA_SENSOR_CLASSES)
                        area_card["alert_classes"] = list(AREA_ALERT_CLASSES)
                        if profile_rank >= LEVEL_RANK["pro"]:
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
                    else:
                        # Home Assistant Area cards have their own default sensor/alert
                        # classes when these keys are omitted. Essential must be truly
                        # clean, so pass explicit empty lists instead of relying on
                        # frontend defaults.
                        area_card["sensor_classes"] = []
                        area_card["alert_classes"] = []
                    if use_picture:
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

    home_order = {
        str(value): index for index, value in enumerate(model.get("home_order") or [])
    }
    default_system_order = ("lights", "covers", "climate", "cameras", "security")
    visible_systems = [
        module for module in default_system_order if model["modules"][module]["count"]
    ]
    visible_systems.sort(
        key=lambda module: (
            home_order.get(module, 10**9),
            default_system_order.index(module),
        )
    )
    system_cards = [_heading("Sistemi", "mdi:view-grid-outline")]
    for module in visible_systems:
        system_cards.append(_system_summary_card(model, module, model["modules"][module]))
    if len(system_cards) > 1:
        sections.append({"type": "grid", "cards": system_cards})

    visible_cl_modules = [
        module
        for module in model.get("cl_modules", [])
        if module.get("customer_visible") and module.get("route")
    ]
    visible_cl_modules.sort(
        key=lambda module: (
            min(
                home_order.get(f"cl:{module.get('module_id') or module.get('domain')}", 10**9),
                home_order.get(str(module.get("module_id") or ""), 10**9),
            ),
            str(module.get("customer_label") or module.get("display_name") or "").casefold(),
        )
    )
    cl_system_cards = [_heading("Sistemi CL", "mdi:apps")]
    for module in visible_cl_modules:
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
        model, context="Home", category="Altro", column_span=3
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
    views: list[dict[str, Any]] = [home_view]

    for area in model["areas"]:
        area_sections = [_branding_section(model, area["name"], column_span=2)]
        area_status = _area_status_section(model, area, column_span=2)
        if area_status is not None:
            area_sections.append(area_status)
        for module in (
            "lights",
            "outlets",
            "switches",
            "covers",
            "fans",
            "locks",
            "sirens",
            "valves",
            "climate",
            "cameras",
            "security",
        ):
            if module == "security":
                security_card = _security_card(model, area_id=area["id"])
                if security_card is not None:
                    area_sections.append(
                        {
                            "type": "grid",
                            "cards": [
                                _heading(
                                    MODULE_LABELS[module][0],
                                    MODULE_LABELS[module][1],
                                ),
                                security_card,
                            ],
                        }
                    )
                continue
            items = area["entities"][module]
            if items:
                labels = AREA_MODULE_LABELS[module]
                heading = (
                    _light_heading(area)
                    if module == "lights"
                    else _heading(labels[0], labels[1])
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
            model, context=area["name"], category="Altro", column_span=2
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
                "sections": area_sections,
            }
        )

    for module in ("lights", "covers", "climate", "cameras", "security"):
        data = model["modules"][module]
        if not data["count"]:
            continue
        if module == "security":
            security_card = _security_card(model)
            module_sections = [_branding_section(model, data["label"], column_span=3)]
            if security_card is not None:
                module_sections.append(
                    {
                        "type": "grid",
                        "column_span": 3,
                        "cards": [security_card],
                    }
                )
            module_sections.extend(_security_camera_sections(model))
        else:
            module_sections = [
                _branding_section(model, data["label"], column_span=3),
                *_module_sections(
                    data["entities"], model["areas"], module, str(model.get("profile") or "standard")
                ),
            ]
        module_assistance = _assistance_section(
            model,
            context=data["label"],
            category=data["label"],
            column_span=3,
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

    if model.get("admin_user_ids"):
        views.append(
            {
                "type": "sections",
                "title": "Installatore",
                "path": "installer",
                "subview": True,
                "visible": False,
                "back_path": "home",
                "max_columns": 2,
                "sections": [
                    _branding_section(model, "Installatore", column_span=2),
                    {
                        "type": "grid",
                        "column_span": 2,
                        "cards": [
                            {
                                "type": "custom:cl-control-installer-card",
                                "grid_options": {"columns": "full", "rows": 12},
                            }
                        ],
                    },
                ],
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
        from homeassistant.helpers import floor_registry as fr

        area_registry = ar.async_get(self.hass)
        device_registry = dr.async_get(self.hass)
        entity_registry = er.async_get(self.hass)
        floor_registry = fr.async_get(self.hass)

        floors = list(floor_registry.async_list_floors())
        floor_meta = {
            floor.floor_id: {
                "name": floor.name,
                "icon": str(getattr(floor, "icon", "") or ""),
                # Preserve the same explicit floor order maintained by HA.
                "order": index,
            }
            for index, floor in enumerate(floors)
        }

        areas = []
        for area in area_registry.async_list_areas():
            floor_id = str(getattr(area, "floor_id", "") or "")
            floor = floor_meta.get(floor_id, {})
            areas.append(
                {
                    "id": area.id,
                    "name": area.name,
                    "picture": str(getattr(area, "picture", "") or ""),
                    "icon": str(getattr(area, "icon", "") or ""),
                    "floor_id": floor_id,
                    "floor_name": str(floor.get("name") or ""),
                    "floor_icon": str(floor.get("icon") or ""),
                    "floor_order": int(floor.get("order") or 0),
                }
            )
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
                    "config_entry_id": entry.config_entry_id,
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
        security_credentials = domain_data.get(DATA_CREDENTIALS, {})
        model["security"]["pin_configured"] = bool(
            security_credentials.get("security_pin")
            or str((settings.get("security") or {}).get("pin") or "")
        )
        security_count = sum(
            len(model["security"].get(key) or [])
            for key in ("panels", "partitions", "zones")
        )
        model["modules"]["security"]["count"] = security_count
        summary_manager = domain_data.get(DATA_SUMMARY_MANAGER)
        if summary_manager is not None:
            summary_manager.set_sources(
                {
                    module: [
                        item["entity_id"]
                        for item in model["modules"][module]["entities"]
                    ]
                    for module in ("lights", "covers", "climate", "cameras")
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

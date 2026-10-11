"""Energy source discovery for CL Control Energy Data Contract v2."""

from __future__ import annotations

import re
from typing import Any

from .energy_contract import (
    CANONICAL_SIGN_CONVENTIONS,
    CL_POWER_REFERENCE_VERSION,
    apply_manual_overrides,
    empty_energy_model,
    normalize_manual_sources,
    recalculate_capabilities,
)

CL_POWER_DOMAIN = "cl_power_control"


def _entry_state_meta(hass: Any, entity_id: str) -> dict[str, Any]:
    state = hass.states.get(entity_id) if entity_id and hasattr(hass, "states") else None
    attributes = getattr(state, "attributes", {}) if state is not None else {}
    return {
        "state": str(getattr(state, "state", "") or ""),
        "unit": str(attributes.get("unit_of_measurement") or ""),
        "device_class": str(attributes.get("device_class") or ""),
        "state_class": str(attributes.get("state_class") or ""),
        "friendly_name": str(attributes.get("friendly_name") or ""),
        "available": bool(
            state is not None
            and str(state.state) not in {"unknown", "unavailable", ""}
        ),
    }


def _set_source(
    model: dict[str, Any],
    key: str,
    ids: list[str],
    *,
    provider: str,
    quality: str = "configured",
    metadata: dict[str, Any] | None = None,
) -> None:
    model["sources"][key] = {
        "ids": list(dict.fromkeys(str(value) for value in ids if str(value))),
        "provider": provider,
        "quality": quality,
        "sign": CANONICAL_SIGN_CONVENTIONS.get(key, ""),
        "metadata": dict(metadata or {}),
    }


def _extract_ha_energy_sources(model: dict[str, Any], prefs: dict[str, Any]) -> None:
    """Map Home Assistant Energy sources.

    Realtime values are fallbacks. Energy/statistic IDs remain the authoritative
    source for daily/7d/30d history even when CL Power Control is installed.
    """
    sources = prefs.get("energy_sources")
    sources = sources if isinstance(sources, list) else []
    model["ha_energy"].update(
        {"configured": bool(sources), "source_count": len(sources)}
    )

    solar_power: list[str] = []
    solar_energy: list[str] = []
    grid_power: list[str] = []
    grid_import: list[str] = []
    grid_export: list[str] = []
    battery_power: list[str] = []
    battery_charge: list[str] = []
    battery_discharge: list[str] = []
    battery_soc: list[str] = []

    for source in sources:
        if not isinstance(source, dict):
            continue
        source_type = str(source.get("type") or "")
        if source_type == "solar":
            if source.get("stat_rate"):
                solar_power.append(str(source["stat_rate"]))
            if source.get("stat_energy_from"):
                solar_energy.append(str(source["stat_energy_from"]))
        elif source_type == "grid":
            if source.get("stat_rate"):
                grid_power.append(str(source["stat_rate"]))
            if source.get("stat_energy_from"):
                grid_import.append(str(source["stat_energy_from"]))
            if source.get("stat_energy_to"):
                grid_export.append(str(source["stat_energy_to"]))
        elif source_type == "battery":
            if source.get("stat_rate"):
                battery_power.append(str(source["stat_rate"]))
            # HA Energy: from = discharge, to = charge.
            if source.get("stat_energy_from"):
                battery_discharge.append(str(source["stat_energy_from"]))
            if source.get("stat_energy_to"):
                battery_charge.append(str(source["stat_energy_to"]))
            if source.get("stat_soc"):
                battery_soc.append(str(source["stat_soc"]))

    if solar_power:
        _set_source(model, "pv_power", solar_power, provider="home_assistant_energy")
    if solar_energy:
        _set_source(
            model,
            "pv_energy_total",
            solar_energy,
            provider="home_assistant_statistics",
            metadata={"configured_by": "home_assistant_energy"},
        )
    if grid_power:
        _set_source(model, "grid_power", grid_power, provider="home_assistant_energy")
    if grid_import:
        _set_source(
            model,
            "grid_import_energy_total",
            grid_import,
            provider="home_assistant_statistics",
            metadata={"configured_by": "home_assistant_energy"},
        )
    if grid_export:
        _set_source(
            model,
            "grid_export_energy_total",
            grid_export,
            provider="home_assistant_statistics",
            metadata={"configured_by": "home_assistant_energy"},
        )
    if battery_power:
        _set_source(
            model, "battery_power", battery_power, provider="home_assistant_energy"
        )
    if battery_charge:
        _set_source(
            model,
            "battery_charge_energy_total",
            battery_charge,
            provider="home_assistant_statistics",
            metadata={"configured_by": "home_assistant_energy"},
        )
    if battery_discharge:
        _set_source(
            model,
            "battery_discharge_energy_total",
            battery_discharge,
            provider="home_assistant_statistics",
            metadata={"configured_by": "home_assistant_energy"},
        )
    if battery_soc:
        _set_source(
            model, "battery_soc", battery_soc, provider="home_assistant_energy"
        )


def _unique_id(entry: dict[str, Any]) -> str:
    return str(entry.get("unique_id") or "")


def _power_control_version(hass: Any, entries: list[dict[str, Any]]) -> str:
    """Read the integration device sw_version without importing CL Power Control."""
    device_ids = [str(item.get("device_id") or "") for item in entries]
    device_ids = [value for value in device_ids if value]
    if not device_ids:
        return ""
    try:
        from homeassistant.helpers import device_registry as dr

        registry = dr.async_get(hass)
        for device_id in device_ids:
            device = registry.async_get(device_id)
            version = str(getattr(device, "sw_version", "") or "") if device else ""
            if version:
                return version
    except (AttributeError, ImportError, RuntimeError):
        pass
    return ""


def _discover_cl_power_control(
    hass: Any,
    registry_entities: list[dict[str, Any]],
    model: dict[str, Any],
) -> None:
    """Discover the public entity contract exposed by CL Power Control beta.5."""
    entries = [
        item
        for item in registry_entities
        if str(item.get("platform") or "") == CL_POWER_DOMAIN
        and not item.get("disabled")
    ]
    pc = model["power_control"]
    pc["installed"] = bool(entries)
    pc["available"] = bool(entries)
    pc["reference_version"] = CL_POWER_REFERENCE_VERSION
    if not entries:
        return

    pc["version"] = _power_control_version(hass, entries)

    mapped: dict[str, str] = {}
    # Suffixes reflect stable unique IDs from v0.4.0-beta.5. Longer/more
    # specific suffixes are checked first to avoid collisions such as enabled.
    suffix_map = [
        ("energy_flexible_available", "flexible_available"),
        ("energy_battery_discharge_power", "battery_discharge_power"),
        ("energy_battery_charge_power", "battery_charge_power"),
        ("energy_surplus_power", "surplus_available"),
        ("energy_import_power", "grid_import_power"),
        ("energy_export_power", "grid_export_power"),
        ("energy_battery_power", "battery_power"),
        ("energy_battery_soc", "battery_soc"),
        ("energy_grid_margin", "grid_margin"),
        ("energy_grid_power", "grid_power"),
        ("energy_pv_power", "pv_power"),
        ("energy_home_power", "home_power"),
        ("intervention_history", "intervention_history"),
        ("energy_status", "energy_control_status"),
        ("effective_limit", "dynamic_limit"),
        ("control_power", "control_power"),
        ("suspended_power", "suspended_power"),
        ("suspended_count", "suspended_count"),
        ("current_power", "current_power"),
        ("last_event", "last_event"),
        ("headroom", "headroom"),
        ("warning", "warning_limit"),
        ("restore", "restore_limit"),
        ("limit", "grid_limit"),
        ("prealert_enabled", "prealert_enabled"),
        ("enabled", "power_control_status"),
    ]

    load_fields = (
        "energy_aux_entity",
        "energy_target_temp",
        "power_sensor",
        "command_entity",
        "energy_action",
        "energy_mode",
        "auto_restart",
        "never_shed",
        "suspended",
        "priority",
        "enabled",
        "power",
    )
    load_re = re.compile(
        r"_load_(.+)_(" + "|".join(re.escape(value) for value in load_fields) + r")$"
    )
    loads_by_id: dict[str, dict[str, Any]] = {}
    energy_loads: list[dict[str, Any]] = []

    for entry in entries:
        entity_id = str(entry.get("entity_id") or "")
        unique_id = _unique_id(entry)
        is_load = "_load_" in unique_id

        if not is_load:
            for suffix, key in suffix_map:
                if unique_id.endswith(f"_{suffix}"):
                    mapped.setdefault(key, entity_id)
                    break

        match = load_re.search(unique_id)
        if match:
            load_id, field = match.groups()
            item = loads_by_id.setdefault(
                load_id,
                {"load_id": load_id, "entities": {}, "name": ""},
            )
            item["entities"][field] = entity_id
            meta = _entry_state_meta(hass, entity_id)
            if field == "power":
                name = meta.get("friendly_name") or str(
                    entry.get("name") or entry.get("original_name") or entity_id
                )
                item["name"] = re.sub(r"\s+Potenza$", "", str(name)).strip() or str(name)
                item["power_entity_id"] = entity_id
                item["power_statistics"] = meta.get("state_class") == "measurement"
            elif not item.get("name") and meta.get("friendly_name"):
                item["name"] = str(meta["friendly_name"]).split(" ", 1)[0]

        if entity_id.startswith("sensor."):
            meta = _entry_state_meta(hass, entity_id)
            if (
                meta.get("device_class") == "energy"
                and meta.get("state_class") in {"total", "total_increasing"}
            ):
                energy_loads.append(
                    {
                        "entity_id": entity_id,
                        "name": meta.get("friendly_name") or entity_id,
                    }
                )

    loads = sorted(
        loads_by_id.values(),
        key=lambda item: str(item.get("name") or item.get("load_id") or "").casefold(),
    )
    pc["entities"] = mapped
    pc["loads"] = loads
    pc["energy_loads"] = sorted(
        energy_loads, key=lambda item: str(item.get("name") or "").casefold()
    )
    pc["energy_control_detected"] = "energy_control_status" in mapped or any(
        key in mapped
        for key in (
            "pv_power",
            "home_power",
            "grid_power",
            "battery_power",
            "surplus_available",
        )
    )

    pc["capabilities"] = {
        "current_power": "current_power" in mapped,
        "grid_limit": "grid_limit" in mapped,
        "headroom": "headroom" in mapped,
        "energy_status": "energy_control_status" in mapped,
        "energy_flow": all(key in mapped for key in ("pv_power", "home_power", "grid_power")),
        "battery": "battery_power" in mapped or "battery_soc" in mapped,
        "surplus": "surplus_available" in mapped,
        "grid_margin": "grid_margin" in mapped,
        "flexible_available": "flexible_available" in mapped,
        "suspended_loads": "suspended_count" in mapped,
        "intervention_history": "intervention_history" in mapped,
        "control_power": "control_power" in mapped,
        "dynamic_limit": "dynamic_limit" in mapped,
        "load_power": any(item.get("power_entity_id") for item in loads),
        "load_energy": bool(energy_loads),
    }

    # CL Power Control owns realtime values when it exposes them. These calls
    # intentionally override HA Energy realtime fallbacks discovered earlier.
    direct_metric_map = {
        "pv_power": "pv_power",
        "home_power": "home_power",
        "grid_power": "grid_power",
        "grid_import_power": "grid_import_power",
        "grid_export_power": "grid_export_power",
        "battery_power": "battery_power",
        "battery_charge_power": "battery_charge_power",
        "battery_discharge_power": "battery_discharge_power",
        "battery_soc": "battery_soc",
        "energy_control_status": "energy_control_status",
        "power_control_status": "power_control_status",
        "control_power": "control_power",
        "grid_limit": "grid_limit",
        "dynamic_limit": "dynamic_limit",
        "warning_limit": "warning_limit",
        "restore_limit": "restore_limit",
        "headroom": "headroom",
        "grid_margin": "grid_margin",
        "surplus_available": "surplus_available",
        "flexible_available": "flexible_available",
        "suspended_power": "suspended_power",
        "suspended_count": "suspended_count",
        "last_event": "last_event",
        "intervention_history": "intervention_history",
    }
    for metric, mapped_key in direct_metric_map.items():
        entity_id = mapped.get(mapped_key)
        if not entity_id:
            continue
        metadata: dict[str, Any] = {"cl_power_control_version": pc.get("version") or ""}
        if metric == "surplus_available":
            metadata["semantic"] = "normalized_grid_export_power"
        elif metric == "control_power":
            metadata["semantic"] = "effective_power_used_by_power_control"
        elif metric == "dynamic_limit":
            metadata["semantic"] = "dynamic_equivalent_household_limit"
        elif metric == "headroom":
            metadata["semantic"] = "configured_power_limit_minus_current_power"
        elif metric == "grid_margin":
            metadata["semantic"] = "configured_limit_minus_normalized_grid_import"
        elif metric == "flexible_available":
            metadata["semantic"] = "min(grid_margin, surplus_plus_grid_allowance)"
        elif metric == "power_control_status":
            metadata["semantic"] = "power_control_enabled_switch"
        _set_source(
            model,
            metric,
            [entity_id],
            provider=CL_POWER_DOMAIN,
            metadata=metadata,
        )

    # beta.5 exposes an authoritative equivalent dynamic limit. Older or
    # partially compatible installations may not; never fabricate it.
    if not (model["sources"].get("dynamic_limit") or {}).get("ids"):
        model["sources"]["dynamic_limit"].update(
            {
                "provider": CL_POWER_DOMAIN,
                "quality": "unsupported",
                "metadata": {
                    "reference_version": CL_POWER_REFERENCE_VERSION,
                    "reason": "dynamic_limit_entity_not_exposed",
                },
            }
        )


def _inject_home_power(model: dict[str, Any], *, home_power_entity: str = "") -> None:
    """Use CL Control's aggregate only when no authoritative realtime home source exists."""
    if not home_power_entity:
        return
    current = model["sources"].get("home_power") or {}
    if current.get("ids"):
        return
    _set_source(
        model,
        "home_power",
        [home_power_entity],
        provider="cl_control_summary",
        metadata={"semantic": "cl_control_area_power_aggregate"},
    )


def _normalize_monitored_loads(hass: Any, raw: Any) -> list[dict[str, Any]]:
    """Normalize CL Control-only monitored loads.

    These loads are presentation/monitoring objects. They never become part of
    CL Power Control load shedding, priorities or surplus automation.
    """
    rows = raw if isinstance(raw, list) else []
    result: list[dict[str, Any]] = []
    seen: set[str] = set()
    for index, row in enumerate(rows):
        if not isinstance(row, dict):
            continue
        load_id = str(row.get("id") or f"monitored_{index + 1}").strip()
        if not load_id or load_id in seen:
            load_id = f"monitored_{index + 1}"
        seen.add(load_id)
        power_entity = str(row.get("power_entity") or "").strip()
        energy_entity = str(row.get("energy_entity") or "").strip()
        command_entity = str(row.get("command_entity") or "").strip()
        power_meta = _entry_state_meta(hass, power_entity) if power_entity else {}
        energy_meta = _entry_state_meta(hass, energy_entity) if energy_entity else {}
        command_meta = _entry_state_meta(hass, command_entity) if command_entity else {}
        name = str(row.get("name") or "").strip()
        if not name:
            source_meta = power_meta or energy_meta or command_meta
            name = str(source_meta.get("friendly_name") or f"Utenza {index + 1}")
        energy_candidate = bool(
            energy_entity
            and energy_meta.get("device_class") == "energy"
            and energy_meta.get("state_class") in {"total", "total_increasing"}
        )
        result.append(
            {
                "id": load_id,
                "name": name,
                "area_id": str(row.get("area_id") or "").strip(),
                "icon": str(row.get("icon") or "").strip(),
                "power_entity_id": power_entity,
                "energy_entity_id": energy_entity,
                "command_entity_id": command_entity,
                "visible": bool(row.get("visible", True)),
                "ranking": bool(row.get("ranking", True)),
                "provider": "cl_control",
                "managed_by_power_control": False,
                "power_available": bool(power_meta.get("available")) if power_entity else False,
                "energy_candidate_valid": energy_candidate,
                "energy_statistics_valid": False,
                "energy_statistics_valid_ids": [],
                "metadata": {
                    "power": power_meta,
                    "energy": energy_meta,
                    "command": command_meta,
                },
            }
        )
    return result


async def _validate_statistics(hass: Any, model: dict[str, Any]) -> None:
    """Validate configured HA Energy and monitored-load statistic IDs off the event loop."""
    ids: set[str] = set()
    keys: list[str] = []
    for key in (
        "pv_energy_total",
        "home_energy_total",
        "home_power_history",
        "grid_import_energy_total",
        "grid_export_energy_total",
        "battery_charge_energy_total",
        "battery_discharge_energy_total",
    ):
        source = model["sources"].get(key) or {}
        source_ids = [str(value) for value in source.get("ids") or [] if str(value)]
        if source_ids:
            keys.append(key)
            ids.update(source_ids)

    monitored = model.get("monitored_loads") or []
    for item in monitored:
        energy_id = str(item.get("energy_entity_id") or "")
        if energy_id:
            ids.add(energy_id)

    if not ids:
        return

    components = set(getattr(getattr(hass, "config", None), "components", set()) or set())
    if "recorder" not in components:
        return
    try:
        from homeassistant.components.recorder.statistics import get_metadata

        metadata = await hass.async_add_executor_job(
            lambda: get_metadata(hass, statistic_ids=ids)
        )
    except (AttributeError, ImportError, RuntimeError):
        return

    model["ha_energy"]["statistics_checked"] = True
    valid_count = 0
    missing_count = 0
    for key in keys:
        source = model["sources"].get(key) or {}
        source_ids = [str(value) for value in source.get("ids") or [] if str(value)]
        valid = [value for value in source_ids if value in metadata]
        missing = [value for value in source_ids if value not in metadata]
        source.setdefault("metadata", {})["statistics_valid_ids"] = valid
        source["metadata"]["statistics_missing_ids"] = missing
        valid_count += len(valid)
        missing_count += len(missing)
        if valid:
            if missing:
                source["quality"] = "partial"
        else:
            source["quality"] = "statistics_missing"

    for item in monitored:
        energy_id = str(item.get("energy_entity_id") or "")
        valid = bool(energy_id and energy_id in metadata)
        item["energy_statistics_valid"] = valid
        item["energy_statistics_valid_ids"] = [energy_id] if valid else []
        if energy_id:
            if valid:
                valid_count += 1
            else:
                missing_count += 1

    model["ha_energy"]["statistics_valid"] = valid_count
    model["ha_energy"]["statistics_missing"] = missing_count


async def async_build_energy_model(
    hass: Any,
    *,
    registry_entities: list[dict[str, Any]],
    runtime: dict[str, Any],
    requested_provider: str = "auto",
    resolved_provider: str = "none",
    home_power_entity: str = "",
) -> dict[str, Any]:
    """Build Energy Contract v2 without duplicating control or history logic."""
    model = empty_energy_model(requested_provider=requested_provider)
    model["provider"] = str(resolved_provider or "none")

    components = set(getattr(getattr(hass, "config", None), "components", set()) or set())
    if "energy" in components:
        model["ha_energy"]["available"] = True
        try:
            from homeassistant.components.energy.data import async_get_manager

            manager = await async_get_manager(hass)
            prefs = manager.data if isinstance(manager.data, dict) else {}
            _extract_ha_energy_sources(model, prefs)
        except (AttributeError, RuntimeError, ImportError):
            pass

    # AUTO priority: CL Power Control beta.5 realtime -> HA Energy realtime
    # fallback -> CL Control aggregate fallback. Historical kWh remain HA-owned.
    _discover_cl_power_control(hass, registry_entities, model)
    _inject_home_power(model, home_power_entity=home_power_entity)

    ui = runtime.get("customer_ui") if isinstance(runtime.get("customer_ui"), dict) else runtime
    ui = ui if isinstance(ui, dict) else {}
    energy_cfg = ui.get("energy") if isinstance(ui.get("energy"), dict) else {}
    manual = normalize_manual_sources(energy_cfg.get("sources"))
    apply_manual_overrides(model, manual)
    model["monitored_loads"] = _normalize_monitored_loads(
        hass, energy_cfg.get("monitored_loads")
    )

    # Add live metadata only for entity-backed IDs. External statistic IDs are
    # valid and intentionally remain statistic IDs.
    for source in model.get("sources", {}).values():
        ids = source.get("ids") or []
        entity_meta = {
            entity_id: _entry_state_meta(hass, entity_id)
            for entity_id in ids
            if "." in entity_id and hass.states.get(entity_id) is not None
        }
        if entity_meta:
            source.setdefault("metadata", {})["entities"] = entity_meta
            if source.get("provider") not in {"home_assistant_statistics", "manual"}:
                if not any(bool(meta.get("available")) for meta in entity_meta.values()):
                    source["quality"] = "unavailable"

    await _validate_statistics(hass, model)
    recalculate_capabilities(model)
    return model


__all__ = ("async_build_energy_model",)

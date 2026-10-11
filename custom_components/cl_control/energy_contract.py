"""Canonical CL Control Energy Data Contract v2.

The contract intentionally separates three responsibilities:
- CL Power Control: authoritative realtime/control-engine metrics.
- Home Assistant Energy/Recorder: authoritative energy counters and history.
- CL Control: normalization, capability detection and presentation only.
"""

from __future__ import annotations

from copy import deepcopy
from typing import Any, Iterable

ENERGY_CONTRACT_VERSION = 2
CL_POWER_REFERENCE_VERSION = "0.4.0-beta.5"

# Canonical sign conventions match CL Power Control 0.4.0-beta.5 and current
# Home Assistant Energy semantics.
CANONICAL_SIGN_CONVENTIONS = {
    "pv_power": "positive_generation",
    "home_power": "positive_consumption",
    "grid_power": "positive_import_negative_export",
    "grid_import_power": "positive_import",
    "grid_export_power": "positive_export",
    "battery_power": "positive_discharge_negative_charge",
    "battery_charge_power": "positive_charge",
    "battery_discharge_power": "positive_discharge",
    "battery_soc": "percentage_0_100",
    "surplus_available": "positive_export_surplus",
    "grid_margin": "positive_available_grid_margin",
    "flexible_available": "positive_available_for_flexible_loads",
}

# preferred_owner is the layer CL Control should trust first in AUTO mode.
# CL Control must never recreate the Power Control engine logic represented by
# metrics owned by cl_power_control.
METRICS: dict[str, dict[str, Any]] = {
    # Realtime energy flow. CL Power Control 0.4.0-beta.5 already normalizes
    # these values when Energy Control is configured.
    "pv_power": {"dimension": "power", "unit": "W", "device_class": "power", "state_class": "measurement", "preferred_owner": "cl_power_control", "fallback_owner": "home_assistant_energy", "realtime": True},
    "home_power": {"dimension": "power", "unit": "W", "device_class": "power", "state_class": "measurement", "preferred_owner": "cl_power_control", "fallback_owner": "cl_control_summary", "realtime": True},
    "grid_power": {"dimension": "power", "unit": "W", "device_class": "power", "state_class": "measurement", "preferred_owner": "cl_power_control", "fallback_owner": "home_assistant_energy", "realtime": True},
    "grid_import_power": {"dimension": "power", "unit": "W", "device_class": "power", "state_class": "measurement", "preferred_owner": "cl_power_control", "realtime": True, "optional": True},
    "grid_export_power": {"dimension": "power", "unit": "W", "device_class": "power", "state_class": "measurement", "preferred_owner": "cl_power_control", "realtime": True, "optional": True},
    "battery_power": {"dimension": "power", "unit": "W", "device_class": "power", "state_class": "measurement", "preferred_owner": "cl_power_control", "fallback_owner": "home_assistant_energy", "realtime": True, "optional": True},
    "battery_charge_power": {"dimension": "power", "unit": "W", "device_class": "power", "state_class": "measurement", "preferred_owner": "cl_power_control", "realtime": True, "optional": True},
    "battery_discharge_power": {"dimension": "power", "unit": "W", "device_class": "power", "state_class": "measurement", "preferred_owner": "cl_power_control", "realtime": True, "optional": True},
    "battery_soc": {"dimension": "percentage", "unit": "%", "device_class": "battery", "state_class": "measurement", "preferred_owner": "cl_power_control", "fallback_owner": "home_assistant_energy", "realtime": True, "optional": True},

    # Long-term energy. CL Power Control 0.4.0-beta.5 does not publish kWh
    # counters for these values; Home Assistant Energy/Recorder owns history.
    "pv_energy_total": {"dimension": "energy", "unit": "kWh", "device_class": "energy", "state_class": "total_increasing", "preferred_owner": "home_assistant_statistics", "statistics": True},
    "home_energy_total": {"dimension": "energy", "unit": "kWh", "device_class": "energy", "state_class": "total_increasing", "preferred_owner": "home_assistant_statistics", "statistics": True, "optional": True},
    "grid_import_energy_total": {"dimension": "energy", "unit": "kWh", "device_class": "energy", "state_class": "total_increasing", "preferred_owner": "home_assistant_statistics", "statistics": True},
    "grid_export_energy_total": {"dimension": "energy", "unit": "kWh", "device_class": "energy", "state_class": "total_increasing", "preferred_owner": "home_assistant_statistics", "statistics": True, "optional": True},
    "battery_charge_energy_total": {"dimension": "energy", "unit": "kWh", "device_class": "energy", "state_class": "total_increasing", "preferred_owner": "home_assistant_statistics", "statistics": True, "optional": True},
    "battery_discharge_energy_total": {"dimension": "energy", "unit": "kWh", "device_class": "energy", "state_class": "total_increasing", "preferred_owner": "home_assistant_statistics", "statistics": True, "optional": True},

    # CL Power Control engine / diagnostics.
    "power_control_status": {"dimension": "state", "preferred_owner": "cl_power_control", "optional": True},
    "energy_control_status": {"dimension": "state", "preferred_owner": "cl_power_control", "optional": True},
    "control_power": {"dimension": "power", "unit": "W", "device_class": "power", "state_class": "measurement", "preferred_owner": "cl_power_control", "optional": True},
    "grid_limit": {"dimension": "power", "unit": "W", "device_class": "power", "state_class": "measurement", "preferred_owner": "cl_power_control", "optional": True},
    "warning_limit": {"dimension": "power", "unit": "W", "device_class": "power", "state_class": "measurement", "preferred_owner": "cl_power_control", "optional": True},
    "restore_limit": {"dimension": "power", "unit": "W", "device_class": "power", "state_class": "measurement", "preferred_owner": "cl_power_control", "optional": True},
    "dynamic_limit": {"dimension": "power", "unit": "W", "device_class": "power", "state_class": "measurement", "preferred_owner": "cl_power_control", "optional": True},
    "headroom": {"dimension": "power", "unit": "W", "device_class": "power", "state_class": "measurement", "preferred_owner": "cl_power_control", "optional": True},
    "grid_margin": {"dimension": "power", "unit": "W", "device_class": "power", "state_class": "measurement", "preferred_owner": "cl_power_control", "optional": True},
    "surplus_available": {"dimension": "power", "unit": "W", "device_class": "power", "state_class": "measurement", "preferred_owner": "cl_power_control", "optional": True},
    "flexible_available": {"dimension": "power", "unit": "W", "device_class": "power", "state_class": "measurement", "preferred_owner": "cl_power_control", "optional": True},
    "suspended_power": {"dimension": "power", "unit": "W", "device_class": "power", "state_class": "measurement", "preferred_owner": "cl_power_control", "optional": True},
    "suspended_count": {"dimension": "count", "preferred_owner": "cl_power_control", "optional": True},
    "last_event": {"dimension": "state", "preferred_owner": "cl_power_control", "optional": True},
    "intervention_history": {"dimension": "history", "preferred_owner": "cl_power_control", "optional": True},
}


def _source(
    *,
    ids: Iterable[str] | None = None,
    provider: str = "none",
    quality: str = "not_configured",
    sign: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    values = [str(value) for value in (ids or []) if str(value)]
    return {
        "ids": list(dict.fromkeys(values)),
        "provider": str(provider or "none"),
        "quality": str(quality or "not_configured"),
        "sign": str(sign or ""),
        "metadata": deepcopy(metadata or {}),
    }


def empty_energy_model(*, requested_provider: str = "auto") -> dict[str, Any]:
    """Return the stable public shape consumed by installer/future Energy UI."""
    return {
        "contract_version": ENERGY_CONTRACT_VERSION,
        "reference": {"cl_power_control": CL_POWER_REFERENCE_VERSION},
        "requested_provider": str(requested_provider or "auto"),
        "provider": "none",
        "realtime_provider": "none",
        "statistics_provider": "none",
        "available": False,
        "ha_energy": {
            "available": False,
            "configured": False,
            "source_count": 0,
            "statistics_checked": False,
            "statistics_valid": 0,
            "statistics_missing": 0,
        },
        "power_control": {
            "installed": False,
            "available": False,
            "version": "",
            "reference_version": CL_POWER_REFERENCE_VERSION,
            "energy_control_detected": False,
            "capabilities": {},
            "entities": {},
            "loads": [],
        },
        "monitored_loads": [],
        "sources": {
            key: _source(sign=CANONICAL_SIGN_CONVENTIONS.get(key))
            for key in METRICS
        },
        "capabilities": {
            "realtime_flow": False,
            "battery": False,
            "daily_summary": False,
            "history_energy": False,
            "power_control": False,
            "energy_control": False,
            "power_control_history": False,
            "load_realtime_ranking": False,
            "load_energy_ranking": False,
        },
        "derived_kpis": {
            "self_consumption": {
                "available": False,
                "formula": "(pv_energy - grid_export_energy) / pv_energy",
                "presentation_only": True,
            },
            "self_sufficiency": {
                "available": False,
                "formula": "1 - (grid_import_energy / home_energy)",
                "presentation_only": True,
            },
        },
        "notes": {
            "dynamic_limit": "CL Power Control 0.4.0-beta.5 exposes the dynamic equivalent limit as an authoritative realtime sensor.",
            "surplus": "In CL Power Control 0.4.0-beta.5 surplus equals normalized instantaneous grid export.",
            "grid_aware": "When grid-aware Power Control is active, control power follows normalized grid exchange and the equivalent limit reflects locally available PV power.",
            "flexible_loads": "Flexible and surplus-only classifications remain diagnostic in 0.4.0-beta.5; CL Control must not imply automatic surplus actuation.",
        },
    }


def normalize_manual_sources(raw: Any) -> dict[str, dict[str, Any]]:
    """Normalize persisted installer overrides without trusting frontend shape."""
    raw = raw if isinstance(raw, dict) else {}
    result: dict[str, dict[str, Any]] = {}
    for key in METRICS:
        item = raw.get(key)
        if isinstance(item, str):
            result[key] = {"mode": "manual", "ids": [item] if item else []}
            continue
        if not isinstance(item, dict):
            continue
        mode = str(item.get("mode") or "auto").lower()
        if mode not in {"auto", "manual", "off"}:
            mode = "auto"
        ids = item.get("ids")
        if isinstance(ids, str):
            ids = [ids]
        if not isinstance(ids, list):
            ids = []
        result[key] = {
            "mode": mode,
            "ids": [str(value) for value in ids if str(value)],
            "invert": bool(item.get("invert", False)),
        }
    return result


def apply_manual_overrides(
    model: dict[str, Any], manual_sources: dict[str, dict[str, Any]]
) -> None:
    """Apply explicit installer overrides after automatic provider discovery."""
    sources = model.get("sources") or {}
    for key, override in manual_sources.items():
        if key not in sources:
            continue
        mode = str(override.get("mode") or "auto")
        if mode == "auto":
            continue
        if mode == "off":
            sources[key] = _source(
                provider="manual",
                quality="disabled",
                sign=CANONICAL_SIGN_CONVENTIONS.get(key),
            )
            continue
        ids = [str(value) for value in override.get("ids") or [] if str(value)]
        sources[key] = _source(
            ids=ids,
            provider="manual",
            quality="configured" if ids else "not_configured",
            sign=CANONICAL_SIGN_CONVENTIONS.get(key),
            metadata={"invert": bool(override.get("invert", False))},
        )


def recalculate_capabilities(model: dict[str, Any]) -> None:
    """Derive UI capabilities only from mapped authoritative sources."""
    sources = model.get("sources") or {}

    def has(key: str) -> bool:
        item = sources.get(key) or {}
        return bool(item.get("ids")) and item.get("quality") not in {
            "disabled",
            "unavailable",
            "unsupported",
            "not_configured",
            "statistics_missing",
        }

    pc = model.get("power_control") or {}
    model["capabilities"] = {
        "realtime_flow": has("home_power") and any(
            has(key) for key in ("pv_power", "grid_power", "battery_power")
        ),
        "battery": has("battery_power") or has("battery_soc"),
        "daily_summary": any(
            has(key)
            for key in (
                "pv_energy_total",
                "home_energy_total",
                "grid_import_energy_total",
                "grid_export_energy_total",
            )
        ),
        "history_energy": any(
            has(key)
            for key in (
                "pv_energy_total",
                "home_energy_total",
                "grid_import_energy_total",
                "grid_export_energy_total",
                "battery_charge_energy_total",
                "battery_discharge_energy_total",
            )
        ),
        "power_control": bool(pc.get("available")),
        "energy_control": bool(pc.get("energy_control_detected")),
        "power_control_history": has("intervention_history"),
        "load_realtime_ranking": bool(pc.get("loads")) or any(
            item.get("visible", True) and item.get("power_entity_id")
            for item in (model.get("monitored_loads") or [])
        ),
        "load_energy_ranking": bool(pc.get("energy_loads")) or any(
            item.get("visible", True) and item.get("energy_statistics_valid")
            for item in (model.get("monitored_loads") or [])
        ),
    }
    model["available"] = any(model["capabilities"].values())

    realtime_keys = (
        "pv_power",
        "home_power",
        "grid_power",
        "battery_power",
        "energy_control_status",
    )
    if any(
        has(key) and (sources.get(key) or {}).get("provider") == "cl_power_control"
        for key in realtime_keys
    ):
        model["realtime_provider"] = "cl_power_control"
    elif any(has(key) for key in realtime_keys):
        model["realtime_provider"] = "home_assistant_energy"
    else:
        model["realtime_provider"] = "none"

    statistic_keys = (
        "pv_energy_total",
        "home_energy_total",
        "grid_import_energy_total",
        "grid_export_energy_total",
        "battery_charge_energy_total",
        "battery_discharge_energy_total",
    )
    monitored_statistics = any(
        item.get("energy_statistics_valid")
        for item in (model.get("monitored_loads") or [])
    )
    model["statistics_provider"] = (
        "home_assistant_statistics"
        if any(has(key) for key in statistic_keys) or monitored_statistics
        else "none"
    )

    derived = model.get("derived_kpis") or {}
    if "self_consumption" in derived:
        derived["self_consumption"]["available"] = has("pv_energy_total") and has(
            "grid_export_energy_total"
        )
    if "self_sufficiency" in derived:
        # A dedicated home energy counter is optional; the future statistics
        # service may also derive home consumption from the HA energy balance.
        derived["self_sufficiency"]["available"] = has(
            "grid_import_energy_total"
        ) and has("home_energy_total")


__all__ = (
    "CANONICAL_SIGN_CONVENTIONS",
    "CL_POWER_REFERENCE_VERSION",
    "ENERGY_CONTRACT_VERSION",
    "METRICS",
    "apply_manual_overrides",
    "empty_energy_model",
    "normalize_manual_sources",
    "recalculate_capabilities",
)

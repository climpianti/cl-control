"""Security provider policy, PIN authorization and safe service dispatch."""

from __future__ import annotations

import asyncio
import re
from typing import Any, Iterable

DEFAULT_CONFIG = {
    "schema_version": 1,
    "provider": "auto",
    "pin": "",
    "allowed_alarm_entity_ids": [],
    "allowed_partition_entity_ids": [],
    "allowed_zone_entity_ids": [],
    "partition_modes": ["TOTAL", "PARTIAL", "INSTANT", "DISARMED"],
    "rate_limit": {
        "max_attempts": 5,
        "window_seconds": 300,
        "lockout_seconds": 900,
    },
}

ALARM_PANEL_RE = re.compile(r"^alarm_control_panel\.[a-z0-9_]+$")
PARTITION_RE = re.compile(r"^select\.partition_[a-z0-9_]+_mode$")
INIM_ZONE_RE = re.compile(r"^switch\.zone_[a-z0-9_]+_exclusion$")
RISCO_BYPASS_RE = re.compile(r"^switch\.[a-z0-9_]+_(?:bypassed|bypassato)$")
ZONE_RE = re.compile(
    r"^switch\.(?:zone_[a-z0-9_]+_exclusion|[a-z0-9_]+_(?:bypassed|bypassato))$"
)


def _explicitly_allowed(discovered: set[str], configured: Iterable[str]) -> set[str]:
    explicit = {str(item) for item in configured if isinstance(item, str)}
    return discovered if not explicit else discovered & explicit


ALARM_COMMAND_SERVICES = {
    "arm_away": "alarm_arm_away",
    "arm_home": "alarm_arm_home",
    "arm_night": "alarm_arm_night",
    "arm_vacation": "alarm_arm_vacation",
    "arm_custom_bypass": "alarm_arm_custom_bypass",
    "disarm": "alarm_disarm",
}


def build_alarm_whitelist(
    states: Iterable[str], security_config: dict[str, Any]
) -> set[str]:
    """Return alarm panels that CL Control may operate."""
    discovered = {
        str(entity_id)
        for entity_id in states
        if ALARM_PANEL_RE.fullmatch(str(entity_id))
    }
    return _explicitly_allowed(
        discovered, security_config.get("allowed_alarm_entity_ids", [])
    )


def build_security_whitelist(
    states: Iterable[str], security_config: dict[str, Any]
) -> tuple[set[str], set[str]]:
    """Return whitelists derived from live entities and optional restrictions."""
    ids = {str(entity_id) for entity_id in states}
    partitions = {entity_id for entity_id in ids if PARTITION_RE.fullmatch(entity_id)}
    zones = {entity_id for entity_id in ids if ZONE_RE.fullmatch(entity_id)}
    return (
        _explicitly_allowed(
            partitions, security_config.get("allowed_partition_entity_ids", [])
        ),
        _explicitly_allowed(zones, security_config.get("allowed_zone_entity_ids", [])),
    )


def validate_risco_zone_pair(
    zone_entity_id: str,
    switch_entity_id: str,
    states: Iterable[str],
    security_config: dict[str, Any],
    zone_metadata: dict[str, Any],
    switch_metadata: dict[str, Any],
) -> tuple[bool, str]:
    """Authorize only a real Risco zone and its bypass switch on the same device."""
    state_ids = {str(entity_id) for entity_id in states}
    if zone_entity_id not in state_ids or switch_entity_id not in state_ids:
        return False, "entity_not_loaded"
    if not zone_entity_id.startswith("binary_sensor."):
        return False, "invalid_zone_domain"
    _, allowed_switches = build_security_whitelist(state_ids, security_config)
    if (
        switch_entity_id not in allowed_switches
        or not RISCO_BYPASS_RE.fullmatch(switch_entity_id)
    ):
        return False, "switch_not_whitelisted"
    zone_platform = str(zone_metadata.get("platform") or "").lower()
    switch_platform = str(switch_metadata.get("platform") or "").lower()
    if zone_platform not in {"risco", "irisco"} or switch_platform not in {
        "risco",
        "irisco",
    }:
        return False, "integration_not_risco"
    zone_device = str(zone_metadata.get("device_id") or "")
    switch_device = str(switch_metadata.get("device_id") or "")
    if not zone_device or zone_device != switch_device:
        return False, "device_mismatch"
    return True, "authorized"


async def async_alarm_command(
    hass: Any, entity_id: str, command: str, context: Any = None
) -> dict[str, Any]:
    """Dispatch one CL-authorized alarm command without exposing the PIN."""
    service = ALARM_COMMAND_SERVICES.get(str(command))
    if service is None:
        raise ValueError("Unsupported alarm command")
    await hass.services.async_call(
        "alarm_control_panel",
        service,
        {},
        blocking=True,
        context=context,
        target={"entity_id": entity_id},
    )
    return {"entity_id": entity_id, "command": command, "service": service}


async def async_set_partition_mode(
    hass: Any, entity_ids: list[str], mode: str, context: Any = None
) -> None:
    """Dispatch a service call only after PIN and whitelist validation."""
    await hass.services.async_call(
        "select",
        "select_option",
        {"option": mode},
        blocking=True,
        context=context,
        target={"entity_id": entity_ids},
    )


async def async_set_zone_exclusion(
    hass: Any,
    entity_id: str,
    excluded: bool,
    context: Any = None,
    state_timeout: float = 5.0,
) -> dict[str, Any]:
    """Toggle a whitelisted switch and report the real state observed by HA."""
    state_store = getattr(hass, "states", None)
    before_object = state_store.get(entity_id) if state_store is not None else None
    before = getattr(before_object, "state", None)
    service = "turn_on" if excluded else "turn_off"
    await hass.services.async_call(
        "switch",
        service,
        {},
        blocking=True,
        context=context,
        target={"entity_id": entity_id},
    )
    target = "on" if excluded else "off"
    after = None
    if state_store is not None:
        deadline = asyncio.get_running_loop().time() + max(0.0, state_timeout)
        while True:
            current = state_store.get(entity_id)
            after = getattr(current, "state", None)
            if after == target or asyncio.get_running_loop().time() >= deadline:
                break
            await asyncio.sleep(0.1)
    return {
        "entity_id": entity_id,
        "service": service,
        "previous_state": before,
        "state": after,
        "target_state": target,
        "confirmed": None if state_store is None else after == target,
    }

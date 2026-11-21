"""Conservative per-control instant-power discovery for CL Control cards.

Only measurement sensors belonging to the same HA device are automatically
paired; an ambiguous multi-channel meter never represents a single output.
Installer manual bindings may use another metering integration.
"""
from __future__ import annotations

import re
from typing import Any

_CHANNEL = re.compile(r"(?:^|_)(?:switch|light|output)_(\d+)(?=_|$)")


def _channel(entity_id: str) -> str | None:
    match = _CHANNEL.search(entity_id.partition(".")[2])
    return match.group(1) if match else None


def _power_sensor(entity: dict[str, Any]) -> bool:
    entity_id = str(entity.get("entity_id") or "")
    return (
        entity_id.startswith("sensor.")
        and str(entity.get("device_class") or "") == "power"
        and str(entity.get("unit_of_measurement") or "") in {"W", "kW"}
        and not entity.get("disabled")
    )


def resolve_card_power(
    registry_entities: list[dict[str, Any]], overrides: dict[str, Any] | None,
) -> dict[str, str]:
    """Map lights/switches to unambiguous, valid, physical power sensors."""
    registry = {
        str(item.get("entity_id") or ""): item for item in registry_entities
        if isinstance(item, dict) and item.get("entity_id")
    }
    sensors_by_device: dict[str, list[dict[str, Any]]] = {}
    for item in registry.values():
        if _power_sensor(item):
            device_id = str(item.get("device_id") or "")
            if device_id:
                sensors_by_device.setdefault(device_id, []).append(item)
    config = overrides if isinstance(overrides, dict) else {}
    result: dict[str, str] = {}
    for entity_id, item in registry.items():
        if not entity_id.startswith(("light.", "switch.")) or item.get("disabled"):
            continue
        selected = config.get(entity_id)
        selected = selected if isinstance(selected, dict) else {}
        mode = str(selected.get("mode") or "auto").lower()
        if mode == "off":
            continue
        if mode == "manual":
            sensor_id = str(selected.get("entity") or "")
            if _power_sensor(registry.get(sensor_id, {})):
                result[entity_id] = sensor_id
            continue
        if mode != "auto":
            continue

        # Switch-as-X may expose a new light entity over an existing relay.
        source_id = str(item.get("source_entity_id") or "")
        source = registry.get(source_id, {})
        device_id = str(source.get("device_id") or item.get("device_id") or "")
        if not device_id:
            continue
        candidates = sensors_by_device.get(device_id, [])
        channel = _channel(source_id or entity_id)
        if channel is not None:
            candidates = [sensor for sensor in candidates
                          if _channel(str(sensor["entity_id"])) == channel]
        else:
            # No channel metadata: accept just one channel-less power sensor.
            # Two meters, or an aggregate plus individual meters, are ambiguous.
            candidates = [sensor for sensor in candidates
                          if _channel(str(sensor["entity_id"])) is None]
        if len(candidates) == 1:
            result[entity_id] = str(candidates[0]["entity_id"])
    return result

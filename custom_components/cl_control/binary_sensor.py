"""Native summary binary sensors for CL Control."""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from homeassistant.components.binary_sensor import BinarySensorEntity
from homeassistant.core import Event, callback
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.event import async_track_state_change_event

from .const import DATA_SUMMARY_MANAGER, DOMAIN, VERSION
from .summary import SUMMARY_MODULES, format_summary, is_active_state

LABELS = {
    "lights": ("Luci", "mdi:lightbulb-group"),
    "covers": ("Aperture", "mdi:window-shutter"),
    "climate": ("Clima", "mdi:thermostat"),
}


async def async_setup_entry(hass, entry, async_add_entities) -> None:
    """Create lightweight aggregate entities used by native dashboard tiles."""
    manager = hass.data[DOMAIN][DATA_SUMMARY_MANAGER]
    async_add_entities(
        [
            CLControlSummaryBinarySensor(entry, manager, module)
            for module in SUMMARY_MODULES
        ],
        True,
    )


class CLControlSummaryBinarySensor(BinarySensorEntity):
    """Expose a compact summary without rebuilding the dashboard model."""

    _attr_has_entity_name = True
    _attr_should_poll = False

    def __init__(self, entry, manager, module: str) -> None:
        self.entry = entry
        self.manager = manager
        self.module = module
        label, icon = LABELS[module]
        installation_id = str(entry.data["installation_id"])
        self._attr_unique_id = f"{installation_id}_summary_{module}"
        self._attr_name = label
        self._attr_icon = icon
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, installation_id)},
            name="CL Control",
            manufacturer="CL Impianti",
            model="CL Control",
            sw_version=VERSION,
        )
        self._sources: tuple[str, ...] = ()
        self._unsub = None

    async def async_added_to_hass(self) -> None:
        self.manager.attach(self.module, self)

    async def async_will_remove_from_hass(self) -> None:
        self.manager.detach(self.module, self)
        self._unsubscribe()

    def _unsubscribe(self) -> None:
        if self._unsub is not None:
            self._unsub()
            self._unsub = None

    def set_sources(self, entity_ids: Iterable[str]) -> None:
        normalized = tuple(dict.fromkeys(str(item) for item in entity_ids))
        if normalized == self._sources and self._unsub is not None:
            return
        self._unsubscribe()
        self._sources = normalized
        if self.hass is not None and self._sources:
            self._unsub = async_track_state_change_event(
                self.hass, self._sources, self._handle_state_change
            )
        if self.hass is not None:
            self.async_write_ha_state()

    @callback
    def _handle_state_change(self, _event: Event) -> None:
        self.async_write_ha_state()

    def _counts(self) -> tuple[int, int, int]:
        if self.hass is None:
            return 0, len(self._sources), 0
        active = 0
        unavailable = 0
        for entity_id in self._sources:
            state_obj = self.hass.states.get(entity_id)
            state = str(getattr(state_obj, "state", "") or "")
            if state in {"unknown", "unavailable", ""}:
                unavailable += 1
                continue
            if is_active_state(self.module, state):
                active += 1
        return active, len(self._sources), unavailable

    @property
    def is_on(self) -> bool:
        active, _total, _unavailable = self._counts()
        return active > 0

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        active, total, unavailable = self._counts()
        return {
            "summary": format_summary(self.module, active, total),
            "active_count": active,
            "total_count": total,
            "unavailable_count": unavailable,
            "module": self.module,
        }

"""Native per-area power aggregation sensors for CL Control."""

from __future__ import annotations

from collections.abc import Iterable

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity, SensorStateClass
from homeassistant.const import UnitOfPower
from homeassistant.core import Event, callback
from homeassistant.helpers import area_registry as ar
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.event import async_track_state_change_event
from homeassistant.util import unit_conversion

from .const import DATA_SUMMARY_MANAGER, DOMAIN, VERSION


async def async_setup_entry(hass, entry, async_add_entities) -> None:
    """Create one aggregate power sensor per Home Assistant area."""
    manager = hass.data[DOMAIN][DATA_SUMMARY_MANAGER]
    area_registry = ar.async_get(hass)
    async_add_entities(
        [
            CLControlHomePowerSensor(entry, manager),
            *[
                CLControlAreaPowerSensor(entry, manager, area.id, area.name)
                for area in area_registry.async_list_areas()
            ],
        ],
        True,
    )


class CLControlAreaPowerSensor(SensorEntity):
    """Sum instantaneous power sensors assigned to one area."""

    _attr_has_entity_name = True
    _attr_should_poll = False
    _attr_device_class = SensorDeviceClass.POWER
    _attr_state_class = SensorStateClass.MEASUREMENT
    _attr_native_unit_of_measurement = UnitOfPower.WATT
    _attr_icon = "mdi:flash"

    def __init__(self, entry, manager, area_id: str, area_name: str) -> None:
        self.entry = entry
        self.manager = manager
        self.area_id = area_id
        self.area_name = area_name
        installation_id = str(entry.data["installation_id"])
        self._attr_unique_id = f"{installation_id}_area_power_{area_id}"
        self._attr_name = f"Potenza {area_name}"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, installation_id)},
            name="CL Control",
            manufacturer="CL Impianti",
            model="CL Control",
            sw_version=VERSION,
        )
        self._sources: tuple[str, ...] = ()
        self._unsub = None
        self._available_sources = 0

    async def async_added_to_hass(self) -> None:
        self.manager.attach_area_power(self.area_id, self)
        registry = er.async_get(self.hass)
        entry = registry.async_get(self.entity_id)
        if entry is not None and entry.area_id != self.area_id:
            registry.async_update_entity(self.entity_id, area_id=self.area_id)

    async def async_will_remove_from_hass(self) -> None:
        self.manager.detach_area_power(self.area_id, self)
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

    def _sum_watts(self) -> float | None:
        if self.hass is None or not self._sources:
            self._available_sources = 0
            return None
        total = 0.0
        available = 0
        for entity_id in self._sources:
            state_obj = self.hass.states.get(entity_id)
            state = str(getattr(state_obj, "state", "") or "")
            if state in {"", "unknown", "unavailable"}:
                continue
            try:
                value = float(state)
            except (TypeError, ValueError):
                continue
            unit = str(
                getattr(state_obj, "attributes", {}).get("unit_of_measurement") or ""
            )
            try:
                watts = (
                    unit_conversion.PowerConverter.convert(
                        value, unit, UnitOfPower.WATT
                    )
                    if unit
                    else value
                )
            except (TypeError, ValueError):
                continue
            total += float(watts)
            available += 1
        self._available_sources = available
        return round(total, 1) if available else None

    @property
    def native_value(self) -> float | None:
        return self._sum_watts()

    @property
    def available(self) -> bool:
        return self._sum_watts() is not None

    @property
    def extra_state_attributes(self) -> dict[str, object]:
        return {
            "area_id": self.area_id,
            "source_count": len(self._sources),
            "available_source_count": self._available_sources,
            "sources": list(self._sources),
        }



class CLControlHomePowerSensor(CLControlAreaPowerSensor):
    """Sum configured instantaneous power sources for the whole home."""

    def __init__(self, entry, manager) -> None:
        super().__init__(entry, manager, "__home__", "Casa")
        installation_id = str(entry.data["installation_id"])
        self.area_id = ""
        self.area_name = "Casa"
        self._attr_unique_id = f"{installation_id}_home_power"
        self._attr_name = "Potenza casa"
        self._attr_icon = "mdi:home-lightning-bolt"

    async def async_added_to_hass(self) -> None:
        self.manager.attach_home_power(self)

    async def async_will_remove_from_hass(self) -> None:
        self.manager.detach_home_power(self)
        self._unsubscribe()

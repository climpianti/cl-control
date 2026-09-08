"""Native Home Assistant update entity for CL Control."""

from __future__ import annotations

from homeassistant.components.update import UpdateEntity, UpdateEntityFeature
from homeassistant.helpers.device_registry import DeviceInfo

from .const import DATA_UPDATE_MANAGER, DOMAIN, VERSION


async def async_setup_entry(hass, entry, async_add_entities) -> None:
    """Create one update entity for the single CL Control Config Entry."""
    async_add_entities([CLControlUpdateEntity(entry, hass.data[DOMAIN][DATA_UPDATE_MANAGER])], True)


class CLControlUpdateEntity(UpdateEntity):
    """Expose the verified provider state through Home Assistant's native UX."""

    _attr_has_entity_name = True
    _attr_name = None
    _attr_title = "CL Control"
    _attr_installed_version = VERSION
    _attr_supported_features = (
        UpdateEntityFeature.INSTALL
        | UpdateEntityFeature.RELEASE_NOTES
        | UpdateEntityFeature.SPECIFIC_VERSION
        | UpdateEntityFeature.PROGRESS
        | UpdateEntityFeature.BACKUP
    )

    def __init__(self, entry, manager):
        self.entry, self.manager = entry, manager
        installation_id = str(entry.data["installation_id"])
        self._attr_unique_id = f"{installation_id}_update"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, installation_id)},
            name="CL Control", manufacturer="CL Impianti", model="CL Control",
            sw_version=VERSION,
        )

    @property
    def available(self):
        return self.manager.error is None

    @property
    def latest_version(self):
        return self.manager.manifest.version if self.manager.manifest else VERSION

    @property
    def release_summary(self):
        return self.manager.manifest.summary if self.manager.manifest else None

    @property
    def release_url(self):
        return self.manager.manifest.release_url if self.manager.manifest else None

    @property
    def in_progress(self):
        return self.manager.in_progress

    @property
    def update_percentage(self):
        return self.manager.progress

    @property
    def extra_state_attributes(self):
        return {
            "channel": self.manager.release_channel,
            "restart_required": self.manager.restart_required,
            "verification_error": self.manager.error,
            "rollback_available": self.manager.rollback_path is not None,
        }

    async def async_update(self):
        await self.manager.async_refresh()

    async def async_release_notes(self):
        return await self.manager.async_release_notes()

    async def async_install(self, version, backup, **kwargs):
        # Backup is mandatory in Phase C even if a caller passes backup=False.
        await self.manager.async_install(version)
        self.async_write_ha_state()

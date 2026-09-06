"""Persistent runtime storage with application-level migrations."""

from __future__ import annotations

from copy import deepcopy
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import STORAGE_KEY, STORAGE_VERSION
from .models import migrate_runtime_config
from .modules.site import DEFAULT_CONFIG as SITE_DEFAULTS


def _merge_site_settings(
    existing: dict[str, Any], configured: dict[str, Any], defaults: dict[str, Any]
) -> dict[str, Any]:
    """Apply explicit site settings without replacing customer data with defaults."""
    result = deepcopy(existing)
    for key, value in configured.items():
        current = result.get(key)
        default = defaults.get(key)
        if isinstance(value, dict):
            result[key] = _merge_site_settings(
                current if isinstance(current, dict) else {},
                value,
                default if isinstance(default, dict) else {},
            )
            continue
        if value in (None, "") and current not in (None, ""):
            continue
        if value == default and current not in (None, "", default):
            continue
        result[key] = deepcopy(value)
    return result


class RuntimeStore:
    """Store CL runtime state while keeping brand/site YAML independently managed."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._store = Store(hass, STORAGE_VERSION, STORAGE_KEY)

    async def async_load(self, site_defaults: dict[str, Any]) -> dict[str, Any]:
        saved = await self._store.async_load()
        runtime = migrate_runtime_config(saved)
        # Site/Options are authoritative configuration; application-only fields
        # remain in runtime storage and are never reset by a code update.
        runtime["site"] = _merge_site_settings(
            runtime["site"], site_defaults, SITE_DEFAULTS
        )
        if saved != runtime:
            await self._store.async_save(runtime)
        return runtime

    async def async_save(self, runtime: dict[str, Any]) -> None:
        await self._store.async_save(migrate_runtime_config(runtime))

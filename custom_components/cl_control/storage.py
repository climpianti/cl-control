"""Persistent runtime storage with application-level migrations."""

from __future__ import annotations

from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import STORAGE_KEY, STORAGE_VERSION
from .models import deep_merge, migrate_runtime_config


class RuntimeStore:
    """Store CL runtime state while keeping brand/site YAML independently managed."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._store = Store(hass, STORAGE_VERSION, STORAGE_KEY)

    async def async_load(self, site_defaults: dict[str, Any]) -> dict[str, Any]:
        saved = await self._store.async_load()
        runtime = migrate_runtime_config(saved)
        # Site/Options are authoritative configuration; application-only fields
        # remain in runtime storage and are never reset by a code update.
        runtime["site"] = deep_merge(runtime["site"], site_defaults)
        if saved != runtime:
            await self._store.async_save(runtime)
        return runtime

    async def async_save(self, runtime: dict[str, Any]) -> None:
        await self._store.async_save(migrate_runtime_config(runtime))

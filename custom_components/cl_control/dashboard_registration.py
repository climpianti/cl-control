"""Create and manage the CL Control Lovelace dashboard using Home Assistant APIs."""

from __future__ import annotations

import logging
from typing import Any

from homeassistant.components import frontend
from homeassistant.components.lovelace import dashboard as lovelace_dashboard
from homeassistant.components.lovelace.const import (
    CONF_ICON,
    CONF_REQUIRE_ADMIN,
    CONF_SHOW_IN_SIDEBAR,
    CONF_TITLE,
    CONF_URL_PATH,
    ConfigNotFound,
    LOVELACE_DATA,
    MODE_STORAGE,
)
from homeassistant.const import CONF_MODE
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError

_LOGGER = logging.getLogger(__name__)

DASHBOARD_URL_PATH = "cl-control"
DASHBOARD_TITLE = "CL Control"
DASHBOARD_ICON = "mdi:home-automation"
STRATEGY_TYPE = "cl-control"
STRATEGY_CONFIG_TYPE = f"custom:{STRATEGY_TYPE}"
STRATEGY_CONFIG: dict[str, Any] = {
    "strategy": {
        "type": STRATEGY_CONFIG_TYPE,
        "managed_by": "cl_control",
    }
}


def _dashboard_metadata() -> dict[str, Any]:
    """Return the storage dashboard metadata owned by CL Control."""
    return {
        CONF_TITLE: DASHBOARD_TITLE,
        CONF_ICON: DASHBOARD_ICON,
        CONF_SHOW_IN_SIDEBAR: True,
        CONF_REQUIRE_ADMIN: False,
        CONF_URL_PATH: DASHBOARD_URL_PATH,
        CONF_MODE: MODE_STORAGE,
    }


def _is_cl_strategy(config: Any) -> bool:
    """Return whether a Lovelace config uses the CL Control strategy."""
    if not isinstance(config, dict):
        return False
    strategy = config.get("strategy")
    return (
        isinstance(strategy, dict)
        and strategy.get("type") in {STRATEGY_TYPE, STRATEGY_CONFIG_TYPE}
    )


def _register_panel(hass: HomeAssistant, metadata: dict[str, Any]) -> None:
    """Register the freshly-created dashboard in the current frontend process."""
    if frontend.async_panel_exists(hass, DASHBOARD_URL_PATH):
        return
    frontend.async_register_built_in_panel(
        hass,
        "lovelace",
        frontend_url_path=DASHBOARD_URL_PATH,
        require_admin=bool(metadata.get(CONF_REQUIRE_ADMIN, False)),
        show_in_sidebar=bool(metadata.get(CONF_SHOW_IN_SIDEBAR, True)),
        sidebar_title=str(metadata.get(CONF_TITLE) or DASHBOARD_TITLE),
        sidebar_icon=str(metadata.get(CONF_ICON) or DASHBOARD_ICON),
        config={"mode": MODE_STORAGE},
    )


async def _load_config(storage: lovelace_dashboard.LovelaceStorage) -> dict[str, Any] | None:
    try:
        return await storage.async_load(False)
    except ConfigNotFound:
        return None


async def async_ensure_dashboard(hass: HomeAssistant) -> bool:
    """Ensure one persistent CL Control dashboard exists and is shown in sidebar.

    Returns True when this call created/configured the dashboard, False when an
    existing CL Control dashboard was already usable or when Home Assistant is
    not in a state where creating it is safe.
    """
    if hass.config.recovery_mode:
        _LOGGER.warning("CL Control dashboard creation skipped in recovery mode")
        return False

    lovelace_data = hass.data.get(LOVELACE_DATA)
    if lovelace_data is None:
        _LOGGER.warning("CL Control dashboard creation deferred: Lovelace is unavailable")
        return False

    # If Home Assistant already knows this dashboard in the current process,
    # never replace a user's unrelated dashboard. Only repair an empty CL-owned
    # storage dashboard or accept the existing CL strategy unchanged.
    existing = lovelace_data.dashboards.get(DASHBOARD_URL_PATH)
    if existing is not None:
        if not isinstance(existing, lovelace_dashboard.LovelaceStorage):
            _LOGGER.warning(
                "CL Control did not take over /%s because it is not a storage dashboard",
                DASHBOARD_URL_PATH,
            )
            return False
        current = await _load_config(existing)
        if current is None:
            await existing.async_save(STRATEGY_CONFIG)
            _register_panel(hass, existing.config or _dashboard_metadata())
            _LOGGER.info("Configured existing empty CL Control dashboard")
            return True
        if not _is_cl_strategy(current):
            _LOGGER.warning(
                "CL Control did not overwrite /%s because it contains a different dashboard",
                DASHBOARD_URL_PATH,
            )
            return False
        _register_panel(hass, existing.config or _dashboard_metadata())
        return False

    # Use Home Assistant's storage collection rather than editing .storage.
    # This is also idempotent when CL Control is installed/reloaded repeatedly.
    collection = lovelace_dashboard.DashboardsCollection(hass)
    await collection.async_load()
    item = next(
        (
            candidate
            for candidate in collection.async_items()
            if candidate.get(CONF_URL_PATH) == DASHBOARD_URL_PATH
        ),
        None,
    )

    created = False
    if item is None:
        try:
            item = await collection.async_create_item(_dashboard_metadata())
        except HomeAssistantError:
            _LOGGER.exception("Unable to create the CL Control dashboard metadata")
            return False
        created = True

    storage = lovelace_dashboard.LovelaceStorage(hass, item)
    current = await _load_config(storage)
    if current is None:
        await storage.async_save(STRATEGY_CONFIG)
    elif not _is_cl_strategy(current):
        _LOGGER.warning(
            "CL Control did not overwrite stored dashboard /%s because it uses another configuration",
            DASHBOARD_URL_PATH,
        )
        return False

    # The collection instance used by Lovelace during startup owns the normal
    # listener. Since this integration can be added after startup, mirror the
    # newly-created object into Lovelace runtime data and register its panel now.
    lovelace_data.dashboards[DASHBOARD_URL_PATH] = storage
    _register_panel(hass, item)
    _LOGGER.info(
        "%s CL Control dashboard /%s",
        "Created" if created else "Recovered",
        DASHBOARD_URL_PATH,
    )
    return True


async def async_remove_managed_dashboard(hass: HomeAssistant) -> bool:
    """Remove only a dashboard that still uses the CL Control strategy."""
    lovelace_data = hass.data.get(LOVELACE_DATA)
    if lovelace_data is None:
        return False

    existing = lovelace_data.dashboards.get(DASHBOARD_URL_PATH)
    storage: lovelace_dashboard.LovelaceStorage | None = None
    if isinstance(existing, lovelace_dashboard.LovelaceStorage):
        storage = existing
    if storage is not None:
        current = await _load_config(storage)
        if current is not None and not _is_cl_strategy(current):
            return False

    collection = lovelace_dashboard.DashboardsCollection(hass)
    await collection.async_load()
    item = next(
        (
            candidate
            for candidate in collection.async_items()
            if candidate.get(CONF_URL_PATH) == DASHBOARD_URL_PATH
        ),
        None,
    )
    if item is None:
        return False

    if storage is None:
        storage = lovelace_dashboard.LovelaceStorage(hass, item)
        current = await _load_config(storage)
        if current is not None and not _is_cl_strategy(current):
            return False

    await collection.async_delete_item(str(item["id"]))
    await storage.async_delete()
    lovelace_data.dashboards.pop(DASHBOARD_URL_PATH, None)
    if frontend.async_panel_exists(hass, DASHBOARD_URL_PATH):
        frontend.async_remove_panel(hass, DASHBOARD_URL_PATH)
    _LOGGER.info("Removed CL Control managed dashboard /%s", DASHBOARD_URL_PATH)
    return True


__all__ = (
    "DASHBOARD_ICON",
    "DASHBOARD_TITLE",
    "DASHBOARD_URL_PATH",
    "STRATEGY_TYPE",
    "STRATEGY_CONFIG_TYPE",
    "async_ensure_dashboard",
    "async_remove_managed_dashboard",
)

"""CL Control integration bootstrap."""

from __future__ import annotations

import logging

from homeassistant.core import HomeAssistant

from .config import CONFIG_SCHEMA, normalize_settings
from .const import (
    DATA_INSTALLER_LIMITER,
    DATA_ASSISTANCE_GATEWAY,
    DATA_INSTALLER_SESSIONS,
    DATA_RUNTIME,
    DATA_SECURITY_LIMITER,
    DATA_SETTINGS,
    DATA_STORE,
    DOMAIN,
)
from .modules.installer import InstallerSessions, PinRateLimiter
from .modules.ai_provider import MockAIProvider
from .modules.assistance_gateway import AssistanceGateway
from .storage import RuntimeStore
from .websocket import async_register_commands

_LOGGER = logging.getLogger(__name__)
VERSION = "3.3.0-dev"


def _limiter(config: dict) -> PinRateLimiter:
    rate = config.get("rate_limit", {})
    return PinRateLimiter(
        max_attempts=rate.get("max_attempts", 5),
        window_seconds=rate.get("window_seconds", 300),
        lockout_seconds=rate.get("lockout_seconds", 900),
    )


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Load modular settings, migrate storage and register APIs."""
    raw = config.get(DOMAIN)
    if not raw:
        return True

    settings = normalize_settings(raw)
    if not settings["installer"]["pin"]:
        _LOGGER.error(
            "CL Control requires installer.pin or the legacy installer_pin setting"
        )
        return False

    store = RuntimeStore(hass)
    runtime = await store.async_load(settings["site"])
    hass.data[DOMAIN] = {
        DATA_SETTINGS: settings,
        DATA_RUNTIME: runtime,
        DATA_STORE: store,
        DATA_INSTALLER_SESSIONS: InstallerSessions(
            settings["installer"]["session_minutes"]
        ),
        DATA_INSTALLER_LIMITER: _limiter(settings["installer"]),
        DATA_SECURITY_LIMITER: _limiter(settings["security"]),
        DATA_ASSISTANCE_GATEWAY: AssistanceGateway(
            settings["assistance"],
            MockAIProvider(settings["assistance"]["model"]),
        ),
    }
    async_register_commands(hass, VERSION)
    return True


__all__ = ["CONFIG_SCHEMA", "async_setup"]

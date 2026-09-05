"""CL Control integration bootstrap and Config Entry lifecycle."""

from __future__ import annotations

import logging
from typing import Any
from uuid import uuid4

from homeassistant import config_entries
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryError
from homeassistant.helpers import issue_registry as ir

from .config import CONFIG_SCHEMA
from .const import (
    CONFIG_ENTRY_VERSION,
    CONF_EXPERIENCE_LEVEL,
    CONF_INSTALLATION_ID,
    CONF_INSTALLER_PIN_LEGACY,
    DATA_ASSISTANCE_GATEWAY,
    DATA_CONFIG_ENTRY,
    DATA_CREDENTIALS,
    DATA_CREDENTIAL_STORE,
    DATA_INSTALLER_LIMITER,
    DATA_INSTALLER_SESSIONS,
    DATA_RUNTIME,
    DATA_SECURITY_LIMITER,
    DATA_SETTINGS,
    DATA_STORE,
    DATA_WEBSOCKET_REGISTERED,
    DOMAIN,
    VERSION,
)
from .credentials import CredentialStore
from .entry_data import (
    entry_data_is_valid,
    normalize_entry_options,
    settings_from_entry,
)
from .frontend import (
    async_register_panel,
    async_register_static_path,
    async_unregister_panel,
    configure_internal_frontend,
)
from .modules.ai_provider import MockAIProvider
from .modules.assistance_gateway import AssistanceGateway
from .modules.installer import InstallerSessions, PinRateLimiter
from .storage import RuntimeStore
from .websocket import async_register_commands

_LOGGER = logging.getLogger(__name__)

_RUNTIME_KEYS = (
    DATA_ASSISTANCE_GATEWAY,
    DATA_CONFIG_ENTRY,
    DATA_CREDENTIALS,
    DATA_CREDENTIAL_STORE,
    DATA_INSTALLER_LIMITER,
    DATA_INSTALLER_SESSIONS,
    DATA_RUNTIME,
    DATA_SECURITY_LIMITER,
    DATA_SETTINGS,
    DATA_STORE,
)


def _limiter(config: dict[str, Any]) -> PinRateLimiter:
    rate = config.get("rate_limit", {})
    return PinRateLimiter(
        max_attempts=rate.get("max_attempts", 5),
        window_seconds=rate.get("window_seconds", 300),
        lockout_seconds=rate.get("lockout_seconds", 900),
    )


def _create_issue(
    hass: HomeAssistant, issue_id: str, translation_key: str, severity: Any
) -> None:
    ir.async_create_issue(
        hass,
        DOMAIN,
        issue_id,
        is_fixable=False,
        is_persistent=True,
        severity=severity,
        translation_key=translation_key,
    )


async def async_setup(hass: HomeAssistant, config: dict[str, Any]) -> bool:
    """Register process-wide resources and schedule a safe YAML import."""
    hass.data.setdefault(DOMAIN, {})
    await async_register_static_path(hass, VERSION)

    legacy = config.get(DOMAIN)
    if not isinstance(legacy, dict):
        ir.async_delete_issue(hass, DOMAIN, "legacy_yaml_present")
        return True

    existing = hass.config_entries.async_entries(DOMAIN)
    if existing:
        _LOGGER.warning(
            "CL Control legacy YAML remains configured after Config Entry migration; "
            "it is deprecated and may be removed manually after validation"
        )
        _create_issue(
            hass,
            "legacy_yaml_present",
            "legacy_yaml_present",
            ir.IssueSeverity.WARNING,
        )
        return True

    hass.async_create_task(
        hass.config_entries.flow.async_init(
            DOMAIN,
            context={"source": config_entries.SOURCE_IMPORT},
            data=legacy,
        )
    )
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up one CL Control Config Entry without resetting application storage."""
    installation_id = str(entry.data.get(CONF_INSTALLATION_ID) or "")
    if not entry_data_is_valid(entry.data):
        _create_issue(
            hass,
            f"invalid_config_entry_{entry.entry_id}",
            "invalid_config_entry",
            ir.IssueSeverity.ERROR,
        )
        raise ConfigEntryError("CL Control Config Entry is incomplete or invalid")

    credential_store = CredentialStore(hass)
    credentials = await credential_store.async_get(installation_id)
    if not credentials or not credentials.get("installer_pin"):
        _create_issue(
            hass,
            f"installer_credential_missing_{entry.entry_id}",
            "installer_credential_missing",
            ir.IssueSeverity.ERROR,
        )
        raise ConfigEntryError("CL Control Installer credential is missing")

    options = normalize_entry_options(entry.options)
    settings = configure_internal_frontend(settings_from_entry(options), VERSION)
    store = RuntimeStore(hass)
    runtime = await store.async_load(settings["site"])
    configured_level = options[CONF_EXPERIENCE_LEVEL]
    if runtime["customer_ui"].get("experience_level") != configured_level:
        runtime["customer_ui"]["experience_level"] = configured_level
        await store.async_save(runtime)

    domain_data = hass.data.setdefault(DOMAIN, {})
    domain_data.update(
        {
            DATA_SETTINGS: settings,
            DATA_RUNTIME: runtime,
            DATA_STORE: store,
            DATA_CONFIG_ENTRY: entry,
            DATA_CREDENTIAL_STORE: credential_store,
            DATA_CREDENTIALS: credentials,
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
    )
    if not domain_data.get(DATA_WEBSOCKET_REGISTERED):
        async_register_commands(hass, VERSION)
        domain_data[DATA_WEBSOCKET_REGISTERED] = True
    entry.runtime_data = domain_data
    async_register_panel(hass, settings, VERSION)
    ir.async_delete_issue(hass, DOMAIN, f"invalid_config_entry_{entry.entry_id}")
    ir.async_delete_issue(
        hass, DOMAIN, f"installer_credential_missing_{entry.entry_id}"
    )
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload the entry while preserving static assets and all persistent data."""
    domain_data = hass.data.get(DOMAIN, {})
    if domain_data.get(DATA_CONFIG_ENTRY) is not entry:
        return True
    settings = domain_data.get(DATA_SETTINGS, {})
    async_unregister_panel(hass, settings)
    for key in _RUNTIME_KEYS:
        domain_data.pop(key, None)
    entry.runtime_data = None
    return True


async def async_remove_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Preserve layout, tickets, overrides and credentials on normal removal."""
    return None


async def async_migrate_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Migrate early development Config Entries without retaining plaintext PINs."""
    if entry.version > CONFIG_ENTRY_VERSION:
        return False
    if entry.version == CONFIG_ENTRY_VERSION and entry_data_is_valid(entry.data):
        return True

    data = dict(entry.data)
    options = dict(entry.options)
    installation_id = str(data.get(CONF_INSTALLATION_ID) or uuid4())
    data[CONF_INSTALLATION_ID] = installation_id
    legacy_pin = data.pop(CONF_INSTALLER_PIN_LEGACY, None) or options.pop(
        CONF_INSTALLER_PIN_LEGACY, None
    )
    legacy_security_pin = data.pop("security_pin", None) or options.pop(
        "security_pin", None
    )
    credential_store = CredentialStore(hass)
    if legacy_pin:
        await credential_store.async_set_pin(
            installation_id, "installer_pin", str(legacy_pin)
        )
    if legacy_security_pin:
        await credential_store.async_set_pin(
            installation_id, "security_pin", str(legacy_security_pin)
        )
    hass.config_entries.async_update_entry(
        entry,
        data=data,
        options=normalize_entry_options(options),
        version=CONFIG_ENTRY_VERSION,
    )
    return True


__all__ = (
    "CONFIG_SCHEMA",
    "async_migrate_entry",
    "async_remove_entry",
    "async_setup",
    "async_setup_entry",
    "async_unload_entry",
)

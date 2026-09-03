"""YAML schema and normalization for CL Control."""

from __future__ import annotations

import voluptuous as vol

from .const import CONF_INSTALLER_PIN_LEGACY, DOMAIN, MODULE_SCHEMA_VERSION
from .models import normalize_settings

MODULE_SCHEMA = vol.Schema(
    {
        vol.Optional("schema_version", default=MODULE_SCHEMA_VERSION): vol.All(
            vol.Coerce(int), vol.In([MODULE_SCHEMA_VERSION])
        )
    },
    extra=vol.ALLOW_EXTRA,
)

CONFIG_SCHEMA = vol.Schema(
    {
        DOMAIN: vol.Schema(
            {
                vol.Optional(CONF_INSTALLER_PIN_LEGACY): vol.Coerce(str),
                vol.Optional("assistance"): MODULE_SCHEMA,
                vol.Optional("branding"): MODULE_SCHEMA,
                vol.Optional("frontend"): MODULE_SCHEMA,
                vol.Optional("discovery"): MODULE_SCHEMA,
                vol.Optional("installer"): MODULE_SCHEMA,
                vol.Optional("customer_ui"): MODULE_SCHEMA,
                vol.Optional("security"): MODULE_SCHEMA,
                vol.Optional("site"): MODULE_SCHEMA,
            },
            extra=vol.ALLOW_EXTRA,
        )
    },
    extra=vol.ALLOW_EXTRA,
)

__all__ = ["CONFIG_SCHEMA", "normalize_settings"]

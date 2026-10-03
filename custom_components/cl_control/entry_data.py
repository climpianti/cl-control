"""Config Entry data contracts and legacy migration helpers."""

from __future__ import annotations

from collections.abc import Mapping
from copy import deepcopy
import re
from typing import Any
from uuid import UUID

from .const import (
    CONF_ASSISTANCE_PROVIDER,
    CONF_BRANDING_TEMPLATE,
    CONF_BRANDING_MODE,
    CONF_BRANDING_RENAME_INSTANCE,
    CONF_BRANDING_PWA,
    CONF_BRANDING_BROWSER_TITLE,
    CONF_BRANDING_SIDEBAR_TITLE,
    CONF_BRANDING_FAVICON,
    CONF_CUSTOMER_NAME,
    CONF_EXPERIENCE_LEVEL,
    CONF_INSTALLATION_ID,
    CONF_LEGACY_IMPORTED,
    CONF_LEGACY_PIN_MIGRATED,
    CONF_LEGACY_SETTINGS,
    CONF_RELEASE_CHANNEL,
    CONF_SITE_NAME,
    CONF_SUPPORT_PHONE,
)
from .models import deep_merge, normalize_settings

ASSISTANCE_PROVIDERS = ("whatsapp", "openai", "hybrid")
EXPERIENCE_LEVELS = ("essential", "standard", "pro")
BRANDING_TEMPLATES = ("cl_control",)
BRANDING_MODES = ("native", "enhanced", "disabled")
RELEASE_CHANNELS = ("stable", "beta", "dev")

DEFAULT_ENTRY_OPTIONS = {
    CONF_SITE_NAME: "Casa",
    CONF_CUSTOMER_NAME: "",
    CONF_SUPPORT_PHONE: "",
    CONF_ASSISTANCE_PROVIDER: "whatsapp",
    CONF_EXPERIENCE_LEVEL: "standard",
    CONF_BRANDING_TEMPLATE: "cl_control",
    CONF_BRANDING_MODE: "enhanced",
    CONF_BRANDING_RENAME_INSTANCE: False,
    CONF_BRANDING_PWA: True,
    CONF_BRANDING_BROWSER_TITLE: True,
    CONF_BRANDING_SIDEBAR_TITLE: True,
    CONF_BRANDING_FAVICON: True,
    CONF_RELEASE_CHANNEL: "stable",
    CONF_LEGACY_SETTINGS: {},
    CONF_LEGACY_IMPORTED: False,
    CONF_LEGACY_PIN_MIGRATED: False,
}

_SENSITIVE_KEY = re.compile(
    r"(?i)(?:pin|password|passwd|secret|token|api[_-]?key|authorization)"
)


def valid_installation_id(value: Any) -> bool:
    """Return whether a value is a canonical random UUID."""
    try:
        parsed = UUID(str(value))
    except (TypeError, ValueError, AttributeError):
        return False
    return str(parsed) == str(value).lower()


def sanitize_legacy_settings(value: Any) -> Any:
    """Deep-copy legacy settings without credentials or secret-like fields."""
    if isinstance(value, dict):
        return {
            str(key): sanitize_legacy_settings(item)
            for key, item in value.items()
            if not _SENSITIVE_KEY.search(str(key))
        }
    if isinstance(value, list):
        return [sanitize_legacy_settings(item) for item in value]
    if isinstance(value, tuple):
        return [sanitize_legacy_settings(item) for item in value]
    return deepcopy(value)


def normalize_entry_options(value: Any) -> dict[str, Any]:
    """Normalize the public, mutable Config Entry options."""
    source = dict(value) if isinstance(value, Mapping) else {}
    result = deep_merge(DEFAULT_ENTRY_OPTIONS, source)
    result[CONF_SITE_NAME] = str(result.get(CONF_SITE_NAME) or "Casa")[:120]
    result[CONF_CUSTOMER_NAME] = str(result.get(CONF_CUSTOMER_NAME) or "")[:120]
    result[CONF_SUPPORT_PHONE] = str(result.get(CONF_SUPPORT_PHONE) or "")[:40]
    if result.get(CONF_ASSISTANCE_PROVIDER) not in ASSISTANCE_PROVIDERS:
        result[CONF_ASSISTANCE_PROVIDER] = "whatsapp"
    if result.get(CONF_EXPERIENCE_LEVEL) not in EXPERIENCE_LEVELS:
        result[CONF_EXPERIENCE_LEVEL] = "standard"
    if result.get(CONF_BRANDING_TEMPLATE) not in BRANDING_TEMPLATES:
        result[CONF_BRANDING_TEMPLATE] = "cl_control"
    if result.get(CONF_BRANDING_MODE) not in BRANDING_MODES:
        result[CONF_BRANDING_MODE] = "enhanced"
    for key in (
        CONF_BRANDING_RENAME_INSTANCE,
        CONF_BRANDING_PWA,
        CONF_BRANDING_BROWSER_TITLE,
        CONF_BRANDING_SIDEBAR_TITLE,
        CONF_BRANDING_FAVICON,
    ):
        result[key] = bool(result.get(key))
    if result.get(CONF_RELEASE_CHANNEL) not in RELEASE_CHANNELS:
        result[CONF_RELEASE_CHANNEL] = "stable"
    result[CONF_LEGACY_SETTINGS] = sanitize_legacy_settings(
        result.get(CONF_LEGACY_SETTINGS, {})
    )
    result[CONF_LEGACY_IMPORTED] = bool(result.get(CONF_LEGACY_IMPORTED))
    result[CONF_LEGACY_PIN_MIGRATED] = bool(
        result.get(CONF_LEGACY_PIN_MIGRATED)
    )
    return result


def options_from_legacy(raw: dict[str, Any]) -> dict[str, Any]:
    """Convert validated legacy YAML to non-sensitive entry options."""
    settings = normalize_settings(raw)
    site = settings["site"]
    support = site.get("support", {})
    return normalize_entry_options(
        {
            CONF_SITE_NAME: site.get("site_name", "Casa"),
            CONF_CUSTOMER_NAME: site.get("customer", ""),
            CONF_SUPPORT_PHONE: support.get("whatsapp") or support.get("phone", ""),
            CONF_ASSISTANCE_PROVIDER: settings["assistance"].get(
                "provider", "whatsapp"
            ),
            CONF_EXPERIENCE_LEVEL: settings["customer_ui"]
            .get("experience", {})
            .get("default_level", "standard"),
            CONF_BRANDING_TEMPLATE: "cl_control",
            CONF_RELEASE_CHANNEL: "stable",
            CONF_LEGACY_SETTINGS: sanitize_legacy_settings(raw),
            CONF_LEGACY_IMPORTED: True,
            CONF_LEGACY_PIN_MIGRATED: bool(
                raw.get("installer_pin")
                or (
                    raw.get("installer", {}).get("pin")
                    if isinstance(raw.get("installer"), dict)
                    else None
                )
            ),
        }
    )


def settings_from_entry(options: dict[str, Any]) -> dict[str, Any]:
    """Build effective modular settings from product defaults and entry options."""
    normalized = normalize_entry_options(options)
    raw = deepcopy(normalized[CONF_LEGACY_SETTINGS])
    site = raw.setdefault("site", {})
    site["site_name"] = normalized[CONF_SITE_NAME]
    site["customer"] = normalized[CONF_CUSTOMER_NAME]
    support = site.setdefault("support", {})
    support["phone"] = normalized[CONF_SUPPORT_PHONE]
    support["whatsapp"] = normalized[CONF_SUPPORT_PHONE]
    raw.setdefault("assistance", {})["provider"] = normalized[
        CONF_ASSISTANCE_PROVIDER
    ]
    raw.setdefault("customer_ui", {}).setdefault("experience", {})[
        "default_level"
    ] = normalized[CONF_EXPERIENCE_LEVEL]
    branding = raw.setdefault("branding", {})
    branding["mode"] = normalized[CONF_BRANDING_MODE]
    branding["rename_instance"] = normalized[CONF_BRANDING_RENAME_INSTANCE]
    branding["pwa_branding"] = normalized[CONF_BRANDING_PWA]
    branding["browser_title"] = normalized[CONF_BRANDING_BROWSER_TITLE]
    branding["sidebar_title"] = normalized[CONF_BRANDING_SIDEBAR_TITLE]
    branding["favicon"] = normalized[CONF_BRANDING_FAVICON]
    return normalize_settings(raw)


def entry_data_is_valid(data: Any) -> bool:
    """Validate essential non-sensitive Config Entry data."""
    return isinstance(data, Mapping) and valid_installation_id(
        data.get(CONF_INSTALLATION_ID)
    )


def sync_options_from_runtime(
    options: dict[str, Any], runtime: dict[str, Any]
) -> dict[str, Any]:
    """Keep Installer edits aligned with authoritative entry options."""
    result = normalize_entry_options(options)
    site = runtime.get("site", {}) if isinstance(runtime, dict) else {}
    support = site.get("support", {}) if isinstance(site, dict) else {}
    customer_ui = (
        runtime.get("customer_ui", {}) if isinstance(runtime, dict) else {}
    )
    result[CONF_SITE_NAME] = str(site.get("site_name") or result[CONF_SITE_NAME])
    result[CONF_CUSTOMER_NAME] = str(
        site.get("customer") or result[CONF_CUSTOMER_NAME]
    )
    result[CONF_SUPPORT_PHONE] = str(
        support.get("whatsapp")
        or support.get("phone")
        or result[CONF_SUPPORT_PHONE]
    )
    level = customer_ui.get("experience_level")
    if level in EXPERIENCE_LEVELS:
        result[CONF_EXPERIENCE_LEVEL] = level
    return result


__all__ = (
    "ASSISTANCE_PROVIDERS",
    "BRANDING_MODES",
    "BRANDING_TEMPLATES",
    "DEFAULT_ENTRY_OPTIONS",
    "EXPERIENCE_LEVELS",
    "RELEASE_CHANNELS",
    "entry_data_is_valid",
    "normalize_entry_options",
    "options_from_legacy",
    "sanitize_legacy_settings",
    "settings_from_entry",
    "sync_options_from_runtime",
    "valid_installation_id",
)

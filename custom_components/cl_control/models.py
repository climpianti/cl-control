"""Pure configuration, bootstrap and storage migration helpers."""

from __future__ import annotations

from copy import deepcopy
from typing import Any

from .const import RUNTIME_SCHEMA_VERSION
from .modules import MODULE_DEFAULTS
from .modules.customer_ui import DEFAULT_RUNTIME
from .modules.assistance import normalize_assistance_config, public_assistance_config
from .modules.site import DEFAULT_CONFIG as SITE_DEFAULTS
from .modules.layout import normalize_layout

RUNTIME_UI_KEYS = (
    "theme",
    "hidden",
    "favorites",
    "aliases",
    "switch_types",
    "area_order",
    "entity_order",
    "home_order",
    "energy",
    "area_switches",
    "ui",
    "experience_level",
    "module_levels",
    "entity_levels",
    "entity_modules",
    "entity_areas",
    "entity_subtypes",
    "entity_visibility",
    "section_levels",
    "card_levels",
    "user_levels",
    "layout",
)


def deep_merge(base: dict[str, Any], override: dict[str, Any] | None) -> dict[str, Any]:
    """Recursively merge dictionaries without mutating either input."""
    result = deepcopy(base)
    if not isinstance(override, dict):
        return result
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = deepcopy(value)
    return result


def normalize_settings(raw: dict[str, Any] | None) -> dict[str, Any]:
    """Normalize modular YAML and accept the v2.0.0 installer_pin key."""
    raw = raw if isinstance(raw, dict) else {}
    settings = {
        name: deep_merge(defaults, raw.get(name))
        for name, defaults in MODULE_DEFAULTS.items()
    }
    legacy_pin = raw.get("installer_pin")
    if legacy_pin is not None and not settings["installer"].get("pin"):
        settings["installer"]["pin"] = str(legacy_pin)
    settings["installer"]["pin"] = str(settings["installer"].get("pin", ""))
    settings["security"]["pin"] = str(settings["security"].get("pin", ""))
    settings["assistance"] = normalize_assistance_config(settings["assistance"])
    return settings


def migrate_runtime_config(value: dict[str, Any] | None) -> dict[str, Any]:
    """Migrate flat v2.0.0 storage to schema v2 and normalize current data."""
    value = value if isinstance(value, dict) else {}
    # The transitional frontend view also exposes ``schema_version: 2`` while
    # remaining flat.  Treat data as the nested format only when a nested
    # section is actually present, otherwise preferences would be discarded.
    is_nested = any(key in value for key in ("customer_ui", "site"))
    if value.get("schema_version") == RUNTIME_SCHEMA_VERSION and is_nested:
        customer_ui = deep_merge(DEFAULT_RUNTIME, value.get("customer_ui"))
        site = deep_merge(SITE_DEFAULTS, value.get("site"))
        assistance = deep_merge({"requests": []}, value.get("assistance"))
    else:
        customer_ui = deep_merge(
            DEFAULT_RUNTIME,
            {key: value[key] for key in RUNTIME_UI_KEYS if key in value},
        )
        legacy_support = value.get("support")
        legacy_support = legacy_support if isinstance(legacy_support, dict) else {}
        site = deep_merge(
            SITE_DEFAULTS,
            {
                "site_name": legacy_support.get("site_name", SITE_DEFAULTS["site_name"]),
                "customer": legacy_support.get("customer", ""),
                "support": {
                    "phone": legacy_support.get("phone", ""),
                    "whatsapp": legacy_support.get("whatsapp", ""),
                    "message": legacy_support.get(
                        "message", SITE_DEFAULTS["support"]["message"]
                    ),
                },
            },
        )
        assistance = {"requests": []}
    customer_ui["layout"] = normalize_layout(customer_ui.get("layout"))
    return {
        "schema_version": RUNTIME_SCHEMA_VERSION,
        "customer_ui": customer_ui,
        "site": site,
        "assistance": assistance,
    }


def runtime_to_frontend(runtime: dict[str, Any]) -> dict[str, Any]:
    """Expose a backwards-compatible frontend view during the v2 transition."""
    normalized = migrate_runtime_config(runtime)
    result = deepcopy(normalized["customer_ui"])
    site = normalized["site"]
    result["schema_version"] = normalized["schema_version"]
    result["support"] = {
        "phone": site["support"]["phone"],
        "whatsapp": site["support"]["whatsapp"],
        "message": site["support"]["message"],
        "customer": site["customer"],
        "site_name": site["site_name"],
    }
    return result


def build_bootstrap(
    settings: dict[str, Any], runtime: dict[str, Any], version: str
) -> dict[str, Any]:
    """Return only public frontend data; PINs and security policy stay server-side."""
    normalized = migrate_runtime_config(runtime)
    effective_site = deep_merge(settings["site"], normalized["site"])
    return {
        "schema_version": 1,
        "version": version,
        "assistance": public_assistance_config(settings["assistance"]),
        "branding": deepcopy(settings["branding"]),
        "frontend": deepcopy(settings["frontend"]),
        "discovery": deepcopy(settings["discovery"]),
        "customer_ui": deepcopy(settings["customer_ui"]),
        "site": effective_site,
        "runtime": runtime_to_frontend(normalized),
    }

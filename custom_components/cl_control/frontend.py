"""Serve the bundled CL Control frontend and register its Home Assistant panel."""

from __future__ import annotations

from copy import deepcopy
import logging
from pathlib import Path
from typing import Any

from homeassistant.components import frontend
from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant

from .const import DATA_STATIC_REGISTERED, DOMAIN

_LOGGER = logging.getLogger(__name__)

FRONTEND_DIRECTORY = Path(__file__).parent / "frontend"
STATIC_URL_ROOT = "/cl_control_static"
REQUIRED_ASSETS = (
    "cl-control-panel.js",
    "cl-control-runtime.mjs",
    "cl-control-ui3.mjs",
    "cl-control-dashboard-strategy.mjs",
    "logo.png",
)
LEGACY_ASSET_ROOT = "/local/cl_control/"


def static_url(version: str) -> str:
    """Return the immutable URL namespace for one component version."""
    return f"{STATIC_URL_ROOT}/{version}"


def configure_internal_frontend(settings: dict[str, Any], version: str) -> dict[str, Any]:
    """Prefer bundled product assets while preserving explicit custom asset URLs."""
    configured = deepcopy(settings)
    asset_base = static_url(version)
    configured["frontend"]["asset_base"] = asset_base
    configured["frontend"]["cache_version"] = version

    assets = configured["branding"].setdefault("assets", {})
    for key in ("logo", "logo_compact"):
        value = str(assets.get(key) or "")
        if value.startswith("frontend:"):
            assets[key] = f"{asset_base}/{value.removeprefix('frontend:')}"
        elif value.startswith(LEGACY_ASSET_ROOT):
            assets[key] = f"{asset_base}/{Path(value).name}"
        elif not value:
            assets[key] = f"{asset_base}/logo.png"
    return configured


def _validate_assets() -> None:
    missing = [name for name in REQUIRED_ASSETS if not (FRONTEND_DIRECTORY / name).is_file()]
    if missing:
        raise FileNotFoundError(f"Missing bundled CL Control frontend assets: {', '.join(missing)}")


def _existing_panel(hass: HomeAssistant, panel_url: str) -> tuple[bool, bool]:
    panels = hass.data.get(frontend.DATA_PANELS, {})
    existing = panels.get(panel_url)
    if existing is None:
        return False, False
    panel_config = getattr(existing, "config", None) or {}
    custom = panel_config.get("_panel_custom", {})
    if getattr(existing, "component_name", None) != "custom" or custom.get("name") != "cl-control-panel":
        raise ValueError(f"Panel route /{panel_url} is already owned by another component")
    return True, str(custom.get("module_url") or "").startswith(LEGACY_ASSET_ROOT)


async def async_register_static_path(hass: HomeAssistant, version: str) -> None:
    """Register immutable bundled assets once per Home Assistant process."""
    _validate_assets()
    domain_data = hass.data.setdefault(DOMAIN, {})
    if domain_data.get(DATA_STATIC_REGISTERED):
        return
    asset_base = static_url(version)
    await hass.http.async_register_static_paths(
        [StaticPathConfig(asset_base, str(FRONTEND_DIRECTORY), True)]
    )
    domain_data[DATA_STATIC_REGISTERED] = True


def async_register_panel(
    hass: HomeAssistant, settings: dict[str, Any], version: str
) -> None:
    """Register or safely update the CL Control sidebar panel."""
    asset_base = static_url(version)
    frontend_config = settings["frontend"]
    panel_url = str(frontend_config.get("panel_url", "/cl-control")).strip("/")
    panel_url = panel_url or "cl-control"
    exists, is_legacy = _existing_panel(hass, panel_url)
    if is_legacy:
        _LOGGER.warning(
            "CL Control imported a legacy panel_custom registration; remove the "
            "deprecated YAML block after validating the Config Entry"
        )

    frontend.async_register_built_in_panel(
        hass,
        component_name="custom",
        sidebar_title=str(settings["branding"].get("brand_name") or "CL Control"),
        sidebar_icon=str(frontend_config.get("sidebar_icon") or "mdi:home-automation"),
        frontend_url_path=panel_url,
        config={
            "version": version,
            "asset_base": asset_base,
            "_panel_custom": {
                "name": "cl-control-panel",
                "embed_iframe": False,
                "trust_external": False,
                "module_url": f"{asset_base}/cl-control-panel.js",
            },
        },
        require_admin=bool(frontend_config.get("require_admin", False)),
        update=exists,
    )


def async_unregister_panel(hass: HomeAssistant, settings: dict[str, Any]) -> None:
    """Remove only the CL Control panel; bundled static files remain registered."""
    frontend_config = settings.get("frontend", {})
    panel_url = str(frontend_config.get("panel_url", "/cl-control")).strip("/")
    panel_url = panel_url or "cl-control"
    panels = hass.data.get(frontend.DATA_PANELS, {})
    if panel_url in panels:
        frontend.async_remove_panel(hass, panel_url)


async def async_register_frontend(
    hass: HomeAssistant, settings: dict[str, Any], version: str
) -> None:
    """Register bundled static assets and the customer-facing sidebar panel."""
    await async_register_static_path(hass, version)
    async_register_panel(hass, settings, version)


__all__ = (
    "FRONTEND_DIRECTORY",
    "REQUIRED_ASSETS",
    "STATIC_URL_ROOT",
    "async_register_frontend",
    "async_register_panel",
    "async_register_static_path",
    "async_unregister_panel",
    "configure_internal_frontend",
    "static_url",
)

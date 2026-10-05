"""Serve the bundled CL Control frontend and register its Home Assistant panel."""

from __future__ import annotations

from copy import deepcopy
import json
import logging
from pathlib import Path
from typing import Any

from homeassistant.components import frontend
from aiohttp import web
from homeassistant.components.http import HomeAssistantView, StaticPathConfig
from homeassistant.core import HomeAssistant

from .const import DATA_STATIC_REGISTERED, DOMAIN

_LOGGER = logging.getLogger(__name__)

FRONTEND_DIRECTORY = Path(__file__).parent / "frontend"
STATIC_URL_ROOT = "/cl_control_static"
STRATEGY_URL = f"{STATIC_URL_ROOT}/cl-control-dashboard-strategy.mjs"
REQUIRED_ASSETS = (
    "cl-control-dashboard-strategy.mjs",
    "cl-control-security-card.mjs",
    "cl-control-header-card.mjs",
    "cl-control-installer-card.mjs",
    "cl-control-assistance-card.mjs",
    "cl-control-branding.mjs",
    "logo.png",
)
LEGACY_ASSET_ROOT = "/local/cl_control/"
ASSET_REVISION = "3.5.1-inim-partition-cards-v2"


def static_url(version: str) -> str:
    """Return the immutable URL namespace for one component version."""
    return f"{STATIC_URL_ROOT}/{version}/{ASSET_REVISION}"


class DashboardStrategyView(HomeAssistantView):
    """Public, non-cached entrypoint containing only the installed asset URL."""

    url = STRATEGY_URL
    name = "cl_control:dashboard_strategy"
    requires_auth = False

    def __init__(self, version: str) -> None:
        self.version = version

    async def get(self, request: web.Request) -> web.Response:
        module_url = (
            f"{static_url(self.version)}/cl-control-dashboard-strategy.mjs"
        )
        return web.Response(
            text=f"export * from {json.dumps(module_url)};\n",
            content_type="text/javascript",
            headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
        )


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


def _is_owned_legacy_panel(panel: Any) -> bool:
    """Return whether a panel is the retired standalone CL Control panel."""
    if panel is None or getattr(panel, "component_name", None) != "custom":
        return False
    panel_config = getattr(panel, "config", None) or {}
    custom = panel_config.get("_panel_custom", {})
    return isinstance(custom, dict) and custom.get("name") == "cl-control-panel"


async def async_register_static_path(hass: HomeAssistant, version: str) -> None:
    """Register immutable bundled assets once per Home Assistant process."""
    # Path.is_file() performs filesystem I/O; keep it outside HA's event loop.
    await hass.async_add_executor_job(_validate_assets)
    domain_data = hass.data.setdefault(DOMAIN, {})
    if domain_data.get(DATA_STATIC_REGISTERED):
        return
    asset_base = static_url(version)
    await hass.http.async_register_static_paths(
        [StaticPathConfig(asset_base, str(FRONTEND_DIRECTORY), True)]
    )
    hass.http.register_view(DashboardStrategyView(version))

    # CL Control is a dashboard strategy.  Historically users had to add
    # STRATEGY_URL manually under Lovelace Resources before Home Assistant
    # could discover the strategy.  Custom integrations can register an
    # extra frontend module directly, so load the strategy automatically
    # without writing to Lovelace resource storage.
    extra_modules = hass.data.get(frontend.DATA_EXTRA_MODULE_URL)
    registered_urls = getattr(extra_modules, "urls", ())
    if STRATEGY_URL not in registered_urls:
        frontend.add_extra_js_url(hass, STRATEGY_URL)

    domain_data[DATA_STATIC_REGISTERED] = True


def async_unregister_panel(hass: HomeAssistant, settings: dict[str, Any]) -> None:
    """Remove only the retired standalone CL Control panel, never Lovelace dashboards."""
    frontend_config = settings.get("frontend", {})
    panel_url = str(frontend_config.get("panel_url", "/cl-control")).strip("/")
    panel_url = panel_url or "cl-control"
    panels = hass.data.get(frontend.DATA_PANELS, {})
    existing = panels.get(panel_url)
    if _is_owned_legacy_panel(existing):
        frontend.async_remove_panel(hass, panel_url)
        _LOGGER.info("Removed retired standalone CL Control panel /%s", panel_url)


async def async_register_frontend(
    hass: HomeAssistant, settings: dict[str, Any], version: str
) -> None:
    """Register native-dashboard assets and retire the obsolete standalone panel."""
    await async_register_static_path(hass, version)
    async_unregister_panel(hass, settings)


__all__ = (
    "FRONTEND_DIRECTORY",
    "REQUIRED_ASSETS",
    "STATIC_URL_ROOT",
    "STRATEGY_URL",
    "DashboardStrategyView",
    "async_register_frontend",
    "async_register_static_path",
    "async_unregister_panel",
    "configure_internal_frontend",
    "static_url",
)

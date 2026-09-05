"""Frontend module product defaults."""

from ..const import VERSION

DEFAULT_CONFIG = {
    "schema_version": 1,
    "panel_url": "/cl-control",
    "asset_base": "internal",
    "cache_version": VERSION,
    "show_version": True,
    "sidebar_icon": "mdi:home-automation",
    "require_admin": False,
    "gestures": {"slider_threshold_px": 10},
}

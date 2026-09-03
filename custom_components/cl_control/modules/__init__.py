"""Modular configuration sections for CL Control."""

from .branding import DEFAULT_CONFIG as BRANDING_DEFAULTS
from .assistance import DEFAULT_CONFIG as ASSISTANCE_DEFAULTS
from .customer_ui import DEFAULT_CONFIG as CUSTOMER_UI_DEFAULTS
from .discovery import DEFAULT_CONFIG as DISCOVERY_DEFAULTS
from .frontend import DEFAULT_CONFIG as FRONTEND_DEFAULTS
from .installer import DEFAULT_CONFIG as INSTALLER_DEFAULTS
from .security import DEFAULT_CONFIG as SECURITY_DEFAULTS
from .site import DEFAULT_CONFIG as SITE_DEFAULTS

MODULE_DEFAULTS = {
    "assistance": ASSISTANCE_DEFAULTS,
    "branding": BRANDING_DEFAULTS,
    "frontend": FRONTEND_DEFAULTS,
    "discovery": DISCOVERY_DEFAULTS,
    "installer": INSTALLER_DEFAULTS,
    "customer_ui": CUSTOMER_UI_DEFAULTS,
    "security": SECURITY_DEFAULTS,
    "site": SITE_DEFAULTS,
}

__all__ = ["MODULE_DEFAULTS"]

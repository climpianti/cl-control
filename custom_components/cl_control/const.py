"""Constants shared by CL Control modules."""

DOMAIN = "cl_control"
VERSION = "3.3.0-dev"

# Preserve the Home Assistant Store envelope so v2.0.0 data remains readable.
# Application-level migrations are driven by RUNTIME_SCHEMA_VERSION.
STORAGE_VERSION = 1
STORAGE_KEY = "cl_control.configuration"
RUNTIME_SCHEMA_VERSION = 2
MODULE_SCHEMA_VERSION = 1

DATA_SETTINGS = "settings"
DATA_RUNTIME = "runtime"
DATA_STORE = "store"
DATA_INSTALLER_SESSIONS = "installer_sessions"
DATA_INSTALLER_LIMITER = "installer_limiter"
DATA_SECURITY_LIMITER = "security_limiter"
DATA_ASSISTANCE_GATEWAY = "assistance_gateway"

CONF_INSTALLER_PIN_LEGACY = "installer_pin"

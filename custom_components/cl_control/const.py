"""Constants shared by CL Control modules."""

DOMAIN = "cl_control"
VERSION = "3.5.0-dev"

# Preserve the Home Assistant Store envelope so v2.0.0 data remains readable.
# Application-level migrations are driven by RUNTIME_SCHEMA_VERSION.
STORAGE_VERSION = 1
STORAGE_KEY = "cl_control.configuration"
CREDENTIAL_STORAGE_VERSION = 1
CREDENTIAL_STORAGE_KEY = "cl_control.credentials"
RUNTIME_SCHEMA_VERSION = 2
MODULE_SCHEMA_VERSION = 1
CONFIG_ENTRY_VERSION = 1
LAYOUT_SCHEMA_VERSION = 1
UPDATE_MANIFEST_SCHEMA_VERSION = 1
PLATFORMS = ("update",)

DATA_SETTINGS = "settings"
DATA_RUNTIME = "runtime"
DATA_STORE = "store"
DATA_INSTALLER_SESSIONS = "installer_sessions"
DATA_INSTALLER_LIMITER = "installer_limiter"
DATA_SECURITY_LIMITER = "security_limiter"
DATA_ASSISTANCE_GATEWAY = "assistance_gateway"
DATA_CONFIG_ENTRY = "config_entry"
DATA_CREDENTIALS = "credentials"
DATA_CREDENTIAL_STORE = "credential_store"
DATA_STATIC_REGISTERED = "static_registered"
DATA_WEBSOCKET_REGISTERED = "websocket_registered"
DATA_LEGACY_CONFIG = "legacy_config"
DATA_UPDATE_MANAGER = "update_manager"
DATA_DISTRIBUTION_PROVIDER = "distribution_provider"
DATA_NATIVE_DASHBOARD = "native_dashboard"

CONF_INSTALLATION_ID = "installation_id"
CONF_SITE_NAME = "site_name"
CONF_CUSTOMER_NAME = "customer_name"
CONF_SUPPORT_PHONE = "support_phone"
CONF_ASSISTANCE_PROVIDER = "assistance_provider"
CONF_EXPERIENCE_LEVEL = "experience_level"
CONF_BRANDING_TEMPLATE = "branding_template"
CONF_RELEASE_CHANNEL = "release_channel"
CONF_LEGACY_SETTINGS = "legacy_settings"
CONF_LEGACY_IMPORTED = "legacy_imported"
CONF_LEGACY_PIN_MIGRATED = "legacy_pin_migrated"

CONF_INSTALLER_PIN_LEGACY = "installer_pin"

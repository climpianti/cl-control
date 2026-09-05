# Legacy modular configuration

These YAML files are compatibility examples for installations configured before
Config Flow. Product defaults are defined by the versioned Python modules inside
`custom_components/cl_control/modules` and do not need to be copied on a new
installation.

Customer-specific values may continue to override those defaults through the
legacy includes. They must never be overwritten by a code update. Current builds
import this legacy configuration into a native Home Assistant Config Entry and
Options Flow. The original files remain untouched as a rollback aid and can be
removed manually only after validating the migration.

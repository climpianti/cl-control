# Legacy modular configuration

These YAML files are compatibility examples for installations configured before
Config Flow. Product defaults are defined by the versioned Python modules inside
`custom_components/cl_control/modules` and do not need to be copied on a new
installation.

Customer-specific values may continue to override those defaults through the
legacy includes. They must never be overwritten by a code update. Config Flow and
Options Flow will replace manual editing in Phase B.

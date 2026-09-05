# CL Control

CL Control is the CL Impianti customer interface for Home Assistant. The current
development version is `3.3.0-dev`.

## Distribution-ready package

All software required at runtime is contained in:

```text
custom_components/cl_control/
```

The integration serves its bundled frontend and registers `/cl-control` in the
Home Assistant sidebar. A new installation no longer needs files in
`/config/www/cl_control`, a `panel_custom` entry, or a `cl_control:` block in
`configuration.yaml`.

Copy the component folder, restart Home Assistant, then open **Settings → Devices
& services → Add integration → CL Control**. The Italian onboarding asks for the
site, assistance, interface and Installer settings, performs a read-only initial
inventory, and creates the panel. Product defaults are bundled in the integration.

The generated installation ID is random and persistent. Mutable site settings are
kept in Config Entry options; layout, entity overrides, favorites and Assistance
tickets remain in `.storage/cl_control.configuration`. Installer and Security PINs
are salted hashes in the separate private `.storage/cl_control.credentials` store.

## Existing YAML installations

The modular `cl_control/*.yaml` configuration remains supported for one-time
import. On startup it is validated, converted to a Config Entry and options, and
the legacy Installer/Security PIN is immediately hashed into credential storage.
The original YAML files and `configuration.yaml` are never edited automatically.
Existing layout, Installer overrides, site information and Assistance tickets
remain in `.storage/cl_control.configuration` and are migrated independently from
code.

After validating the imported entry, the legacy `cl_control:` YAML, old
`panel_custom` entry and files under `/config/www/cl_control` can be removed
manually. Do not remove them before a tested upgrade and backup.

Removing the Config Entry unloads the panel but intentionally preserves CL Control
application and credential storage. A future, separately confirmed Installer
action will handle complete data erasure.

## Security

Never commit `secrets.yaml`, PINs, API keys, tokens, customer databases or Home
Assistant storage. AI access remains disabled unless explicitly configured on the
backend. Report security issues privately to CL Impianti.

## Development

The repository contains frontend, backend and browser interaction tests. Stable
releases are maintained on `main`; active work remains on feature branches.

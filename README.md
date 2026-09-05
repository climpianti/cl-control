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
`/config/www/cl_control` or a `panel_custom` entry.

Config Flow is planned for the next phase. Until then, copy the component folder,
define the Installer PIN in `secrets.yaml`, and add the minimal YAML below:

```yaml
cl_control:
  installer:
    pin: !secret cl_control_installer_pin
```

Restart Home Assistant, then open `/cl-control`. Product defaults are bundled in
the integration; customer/site settings remain in Home Assistant configuration or
CL Control storage and are not part of the distributable package.

## Existing YAML installations

The modular `cl_control/*.yaml` configuration remains supported during the
transition. The integration prefers its bundled frontend. Existing layout,
Installer overrides, site information and Assistance tickets remain in
`.storage/cl_control.configuration` and are migrated independently from code.

After validating the bundled frontend, the legacy `panel_custom` entry and files
under `/config/www/cl_control` can be removed. Do not remove them before a tested
upgrade and backup.

## Security

Never commit `secrets.yaml`, PINs, API keys, tokens, customer databases or Home
Assistant storage. AI access remains disabled unless explicitly configured on the
backend. Report security issues privately to CL Impianti.

## Development

The repository contains frontend, backend and browser interaction tests. Stable
releases are maintained on `main`; active work remains on feature branches.

# CL Control

CL Control is the CL Impianti customer interface for Home Assistant. The current
beta candidate version is `3.4.2-beta.1`. The repository is private; publishing a
tag or prerelease remains a separate authorized operation.

## Optional Home Assistant dashboard

CL Control remains available as the automatically registered `/cl-control` panel. It
also bundles `cl-control-dashboard-strategy.mjs`, an optional dashboard strategy that
reuses the same panel, discovery and design-system runtime. Register this stable
URL once as a Home Assistant JavaScript module resource:

```text
/cl_control_static/cl-control-dashboard-strategy.mjs
```

In **Settings → Dashboards → Resources** (advanced mode enabled), edit the existing
CL Control resource from `/cl_control_static/3.4.2-dev/cl-control-dashboard-strategy.mjs`
to that URL, with type **JavaScript module**. Do not add a duplicate. This one-time
manual migration does not edit dashboard contents. The integration never rewrites
Lovelace storage or resources. Existing versioned URLs still work for the installed
version, but are not retained after a version upgrade.

For future explicitly authorized tooling, HA 2026.9.1 provides admin-only WebSocket
resource create/update/delete commands under `lovelace/resources`, plus resource
listing. The [official resource implementation](https://github.com/home-assistant/core/blob/2026.9.1/homeassistant/components/lovelace/resources.py)
uses HA's storage collection API. This candidate does not call those commands;
resource migration remains a manual UI operation.

Then choose **CL Control**
from the Community dashboards picker (Home Assistant 2026.5 or newer). CL Control does
not change the user's default dashboard automatically.

Create a separate dashboard with its own URL and leave the default selection
unchanged while testing. The HA sidebar/header belongs to HA; navigation inside the
CL card uses the same runtime as `/cl-control`. After validation, use Home Assistant's
dashboard **Set as default** action for the global default, or the dashboard selection
in your user profile for a user-specific default; these choices are never automatic.
See the official [Home Assistant dashboard instructions](https://www.home-assistant.io/dashboards/dashboards/).

The stable entrypoint returns `Cache-Control: no-store` and imports the currently
installed versioned strategy. Panel/runtime assets retain versioned cache-busting
URLs. After an upgrade/downgrade and HA restart, refresh open browser tabs: already
loaded JavaScript modules cannot be replaced in a running page.

Example strategy configuration for an explicitly created dashboard:

```yaml
strategy:
  type: custom:cl-control
```

## Distribution-ready package

All software required at runtime is contained in:

```text
custom_components/cl_control/
```

The integration serves its bundled frontend and registers `/cl-control` in the
Home Assistant sidebar. A new installation no longer needs files in
`/config/www/cl_control`, a `panel_custom` entry, or a `cl_control:` block in
`configuration.yaml`.

For manual installation, download the authorized release ZIP, extract
`custom_components/cl_control`, and copy that folder into `/config/custom_components/`.
Restart Home Assistant, then open **Settings → Devices
& services → Add integration → CL Control**. The Italian onboarding asks for the
site, assistance, interface and Installer settings, performs a read-only initial
inventory, and creates the panel. Product defaults are bundled in the integration.
No Installer secret in YAML is needed: set the PIN during Config Flow.

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

## Private updates (Phase C)

CL Control now exposes a native Home Assistant Update entity backed by a
provider-neutral distribution layer. In this development baseline the provider
is deliberately offline: there is no GitHub token, paid service, telemetry,
automatic update or automatic restart. The default customer channel is
`stable`; `beta` and authorized laboratory `dev` channels can be selected from
the Options Flow.

Every install requires a signed release manifest, Ed25519 verification,
SHA-256 and strict ZIP validation, followed by a successful native Home
Assistant backup. Only `custom_components/cl_control` is staged and swapped;
Config Entry, customer storage and credential storage are never included in an
artifact or overwritten by the updater. See [docs/DISTRIBUTION.md](docs/DISTRIBUTION.md)
for the manifest contract, rollback model and signing-key rotation procedure.

## Local validation

Run `python -m unittest discover -s tests -p "test_*.py"`, then
`node tests/frontend.test.mjs`. HTTP tests use `aiohttp`; signing tests use
`cryptography`. Browser tests use Playwright and a local Chromium/Chrome binary.
Start `python tests/strategy-server.py` (loopback only), then run
`node tests/dashboard-strategy.test.mjs`, `node tests/ui-interaction.test.mjs` and
`node tests/visual-audit.mjs` with `CL_TEST_CONTEXT=panel` and `dashboard`.
Set `CL_PLAYWRIGHT_URL` / `CL_CHROME_PATH` when these dependencies are outside the
repository. The fixture server does not connect to Home Assistant.

# CL Control private distribution

Phase C uses one provider-neutral chain: `UpdateEntity → UpdateManager → DistributionProvider`.
No GitHub credential, customer secret or download token is stored in the frontend. The current
runtime uses an offline mock provider; a future CL Distribution Gateway may implement the same
three operations: latest signed manifest, release notes and authorized artifact download.

## Channels and authorization

- `stable` accepts stable versions only.
- `beta` accepts stable and beta/prerelease versions, but never `dev` artifacts.
- `dev` is reserved for authorized lab installations. The manifest carries the development
  authorization decision; a future gateway must derive it from `installation_id` server-side.

`installation_id` is only an authorization identifier. The protocol must not transmit entity
inventories, IP addresses, customer names, tickets or other telemetry.

## Release and signing

Run `scripts/build_release.py` with an Ed25519 private key stored outside this repository. It
creates a deterministic ZIP, file inventory and signed v1 manifest. CI receives the private key
only from a protected secret and never uploads it. The component ships only trusted public keys.

Without the existing private key, use `--unsigned --channel beta` to prepare local
staging metadata with an empty signature. It is deliberately rejected by the updater
and is not a publishable release manifest. Never generate a replacement release key
as a workaround. The signed builder checks the key against the embedded trusted key.

Candidate: `v3.4.2-beta.1`, title `CL Control 3.4.2 Beta 1`, GitHub prerelease in
the private repository. Planned attachments: runtime ZIP, signed manifest, SHA-256
checksum (signature is embedded in the manifest), and optional inventory. Before
publication, provide the existing signing key, set the final download URL with
`--artifact-url`, regenerate and verify the signature. No tag, release or push is
performed by the builder. Minimum HA is 2026.9.0; the last real HA validation was
2026.9.1 with the 3.4.2-dev baseline, not this candidate. Real candidate installation
and restart remain a subsequent authorized validation step.

To rotate keys, add the next public key under a new `key_id`, publish a transition release signed
by the old key, then sign subsequent releases with the new key. Remove the old public key only
after all supported installations have crossed the transition release.

## Installation safety

Metadata signature and compatibility are checked before download. The artifact then passes size,
SHA-256, ZIP corruption, traversal, duplicate-path, symlink, root-containment and bundled-version
checks. A Home Assistant backup is mandatory. The updater stages a new runtime and swaps only
`custom_components/cl_control`; Config Entry, `.storage/cl_control.configuration`, credentials and
customer YAML are outside the swap. The old runtime remains in the operation rollback directory.
Home Assistant must restart before the new installed version is reported by running code.

Stable policy refuses installation if the native backup service is unavailable or fails. There is
no override in Phase C, no automatic update, and no automatic restart.

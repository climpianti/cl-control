# Changelog

## 3.4.0-dev

- Redesign Home as an overview with status, favorites, Home Assistant areas and global modules.
- Add responsive Area Views and unified capability-aware tiles for devices, climate, environment, security and media.
- Add an optional Home Assistant dashboard strategy that reuses the same CL Control runtime.
- Move area ordering into the session-safe Layout Editor while preserving technical area assignments.
- Simplify customer controls and keep layout/preferences tools exclusive to Installer mode.

## 3.3.0-dev

- Add the native Home Assistant CL Control Update entity and Installer summary.
- Add provider-neutral private distribution contracts with stable/beta/dev policy.
- Require signed manifests, Ed25519 verification, SHA-256 and strict ZIP safety checks.
- Add mandatory native backup, staged runtime swap and recoverable local rollback.
- Add deterministic release packaging and a signing-only CI hook without publishing.
- Add native Home Assistant Config Flow and a complete Italian onboarding.
- Add Config Entry setup/unload and automatic Options Flow reload.
- Store Installer and Security PINs as salted scrypt hashes in private storage.
- Import legacy YAML once without editing source files or resetting customer data.
- Add installation UUID and release-channel foundations for the future update system.
- Bundle the complete frontend inside `custom_components/cl_control`.
- Register versioned static assets and the `/cl-control` panel automatically.
- Preserve modular YAML and storage compatibility during the distribution transition.
- Centralize the Python runtime version and prepare future HACS validation metadata.
- Include the CL Control brand icon in the distributable component.

## 3.2.3

- First stable CL Control baseline.

# CL Discovery MVP 0.1 — technical design

Status: **ETS XML read-only preview implemented**, with an installer-only card
and admin + active-installer-session WebSocket endpoint. CSV parser and a
single-target TCP connectivity probe exist as pure/offline-tested modules;
the TCP probe is not connected to a live UI/API. AI uses a mock provider.
Base: CL Control v3.5.2-beta.2. Never merge this branch into main without tests and a lab pilot.

## Priority and scope
1. **KNX first:** reuse Home Assistant KNX integration + ETS project data, prefer documented project tools/KNX project import rather than bus-wide active probing. Read-only inventory of group addresses, DPTs, names, device associations and suggestions.
2. **Modbus TCP:** explicit installer-approved CIDR/host allowlist, bounded concurrent TCP probes, short timeouts, optional read-only Device Identification function 43/14, profile matching using vendor/model/firmware; selected register reads only after installer chooses a known profile.
3. Both protocols create *draft proposals*. No bus write, Modbus write, restart, YAML change or automatic approval.

## KNX proposal
Source fields: ETS import hash, group address, DPT, label, command/state pairing, area, inferred domain, confidence and evidence.
Never infer a state address from numbering conventions alone (e.g. 0/0/x command and 0/1/x state): propose only, mark for installer verification.
Do not retrieve or store .knxkeys credentials or secrets in AI prompts.
Secure groups require existing authenticated HA KNX configuration.

## Modbus proposal
Source fields: verified profile ID/revision, model, firmware compatibility, unit id, register type/address (0-based documented vs reference notation), width, signedness, word/byte order, scale, offset, unit, polling interval and read permissions.
A replying register does NOT reveal its semantic meaning. No wide register sweep in the MVP.
Never run unauthorized subnet scanning, write coils/registers or change device configuration.

## API status
- Implemented: `cl_control/discovery/knx/import_preview` (ETS group-address XML).
- Remaining proposed endpoints below are not implemented:
- cl_control/discovery/capabilities
- cl_control/discovery/knx/import_preview
- cl_control/discovery/modbus/targets/validate
- cl_control/discovery/modbus/profiles/list
- cl_control/discovery/proposals/validate
All privileged APIs must verify Home Assistant admin user AND a current installer session server-side. UI-only PIN gate is insufficient.

## Implementation stages
- S0 (this branch): pure data models, validation and tests; no network operations.
- S1: KNX project adapter and source-specific import, read-only inventory, preview UI.
- S2: Modbus profile catalog and explicit-target TCP discovery with rate/time bounds.
- S3: proposal review and export; no apply.
- S4: approved apply in a separate, audited release with backup/rollback and tests.

## Acceptance criteria
- Nothing scans or communicates with field devices until installer explicitly initiates it.
- KNX import does not write to KNX bus.
- Modbus scanning never invokes function codes for write.
- Profiles always retain provenance and version.
- Any unrecognized device is surfaced as 'unknown', not guessed as verified.
- Customer dashboards and stable CL Control are unaffected.

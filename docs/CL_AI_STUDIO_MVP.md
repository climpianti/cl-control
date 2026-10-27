# CL AI Studio — staged development

Status: **offline foundation only**, not enabled in Home Assistant.

## First milestone: KNX and Modbus configuration proposals
1. Get read-only device candidates from CL Discovery.
2. Present installer-selected inventory and an instruction to an AI provider.
3. Require a JSON schema version 1 with `items` containing only existing inventory IDs, type and name.
4. Validate deterministic rules server-side, reject all unknown keys, all unknown IDs, duplicate IDs and type mismatches.
5. Display a draft proposal only; no write, bus command or automatic application.

## Hybrid provider roadmap
- Mock provider (implemented) for safe testing.
- Local provider (planned): Ollama via an isolated backend with egress disabled.
- Cloud provider (planned): server-side managed credentials and customer-controlled opt-in, request redaction and audit logs.
- Router (planned): policies for privacy, allowed models, max tokens/cost and timeouts. No automatic cloud fallback if the site is local-only.

## Integration roadmap
Keep AI Studio separate from existing AssistanceGateway and its MockAIProvider.
Do not import this module in `__init__.py` or expose API routes until security review.
Future endpoints (administrator + installer-session authorization, throttling and audit):
`cl_control/studio/inventory`, `cl_control/studio/draft`, `cl_control/studio/validate`.
No `apply` endpoint in the first milestone.

## Security requirements
Provider responses are untrusted. Strict schema validation is mandatory.
The provider must not choose arbitrary Home Assistant entities, URLs, file paths or service actions.
Avoid sending credentials, KNX security keys or identifying customer metadata to cloud providers.
Explicit installer review is mandatory; draft status is not approval.
Critical controls require separate policy and dry-run/rollback in future milestones.

## Dependency
Discovery inventory adapter, UI and authenticated WebSocket endpoints are **not implemented** yet.
This branch is not a working AI assistant or a KNX/Modbus scanner.

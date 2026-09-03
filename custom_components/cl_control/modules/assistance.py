"""Provider-independent assistance request preparation."""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import quote
from uuid import uuid4

DEFAULT_CONFIG = {
    "schema_version": 1,
    "provider": "whatsapp",
    "ai_enabled": False,
    "ai_provider": "mock",
    "model": "mock-disabled",
    "limits": {
        "requests_per_month": 0,
        "conversations_per_month": 0,
        "tokens_per_month": 0,
        "max_context_tokens": 4000,
        "max_output_tokens": 600,
        "timeout_seconds": 20,
        "monthly_budget_eur": None,
        "estimated_max_request_cost_eur": 0.10,
    },
    "fallback_whatsapp": True,
    "confidence_threshold": 0.75,
    "allowed_tools": [
        "read_entity_state",
        "device_availability",
        "area_summary",
        "authorized_recent_errors",
        "safe_diagnostics",
        "knowledge_base",
        "create_ticket",
        "escalate_whatsapp",
    ],
    "categories": [
        "Luci",
        "Clima",
        "Sicurezza",
        "Energia",
        "Telecamere",
        "Altro",
    ],
    "diagnostics": {
        "enabled": False,
        "allowed_fields": [],
        "require_customer_consent": True,
    },
    "escalate_critical": True,
    "severity_levels": ["info", "warning", "critical"],
    "ticketing": {
        "enabled": True,
        "max_persisted_requests": 200,
        "statuses": ["new", "in_progress", "resolved"],
    },
}


def normalize_assistance_config(value: dict[str, Any]) -> dict[str, Any]:
    """Normalize the current provider-independent assistance schema."""
    result = {**DEFAULT_CONFIG, **(value if isinstance(value, dict) else {})}
    result["provider"] = (
        result["provider"] if result["provider"] in {"whatsapp", "openai", "hybrid"}
        else "whatsapp"
    )
    result["limits"] = {**DEFAULT_CONFIG["limits"], **result.get("limits", {})}
    result["diagnostics"] = {
        **DEFAULT_CONFIG["diagnostics"],
        **result.get("diagnostics", {}),
    }
    result["ticketing"] = {
        **DEFAULT_CONFIG["ticketing"],
        **result.get("ticketing", {}),
    }
    return result


def public_assistance_config(value: dict[str, Any]) -> dict[str, Any]:
    """Expose only Customer UI capabilities, never backend credentials or budgets."""
    config = normalize_assistance_config(value)
    return {
        "provider": config["provider"],
        "ai_enabled": bool(config["ai_enabled"]),
        "categories": list(config["categories"]),
        "diagnostics": {
            "enabled": bool(config["diagnostics"].get("enabled")),
            "require_customer_consent": bool(
                config["diagnostics"].get("require_customer_consent", True)
            ),
        },
        "fallback_whatsapp": bool(config["fallback_whatsapp"]),
        "severity_levels": list(config["severity_levels"]),
    }

_SECRET_ASSIGNMENT = re.compile(
    r"(?i)\b(password|passwd|token|pin|secret|api[ _-]?key|authorization)"
    r"\s*[:=]\s*[^\s,;]+"
)
_BEARER = re.compile(r"(?i)\bbearer\s+[a-z0-9._~+/=-]+")
_ENTITY_ID = re.compile(r"^[a-z_]+\.[a-z0-9_]+$")


def redact_sensitive_text(value: str) -> str:
    """Best-effort redaction before content can leave the Home Assistant host."""
    text = _SECRET_ASSIGNMENT.sub(lambda match: f"{match.group(1)}=[RIMOSSO]", value)
    return _BEARER.sub("Bearer [RIMOSSO]", text).strip()


def prepare_whatsapp_request(
    *,
    site: dict[str, Any],
    assistance: dict[str, Any],
    category: str,
    description: str,
    occurred_at: str,
    entity_id: str = "",
    module: str = "",
    severity: str = "info",
    diagnostic_snapshot_id: str = "",
    diagnostic_consent: bool = False,
    ticket_id: str = "",
) -> dict[str, Any]:
    """Create a safe structured request and a WhatsApp URL."""
    categories = [str(item) for item in assistance.get("categories", [])]
    safe_category = category if category in categories else "Altro"
    safe_description = redact_sensitive_text(str(description))[:2000]
    safe_entity = entity_id if _ENTITY_ID.fullmatch(entity_id or "") else ""
    safe_module = re.sub(r"[^A-Za-zÀ-ÿ0-9 _-]", "", str(module))[:80]
    allowed_severity = assistance.get(
        "severity_levels", ["info", "warning", "critical"]
    )
    safe_severity = severity if severity in allowed_severity else "info"
    diagnostics = assistance.get("diagnostics", {})
    consent = bool(diagnostic_consent)
    snapshot_id = ""
    if diagnostics.get("enabled") and consent:
        candidate = re.sub(r"[^A-Za-z0-9_-]", "", diagnostic_snapshot_id)[:128]
        snapshot_id = candidate
    safe_ticket_id = re.sub(r"[^A-Z0-9-]", "", ticket_id.upper())[:48]
    if not safe_ticket_id:
        safe_ticket_id = f"CLA-{uuid4().hex[:12].upper()}"
    support = site.get("support", {}) if isinstance(site.get("support"), dict) else {}
    phone = re.sub(r"\D", "", str(support.get("whatsapp", "")))
    lines = [
        "Richiesta assistenza",
        f"Ticket: {safe_ticket_id}",
        f"Impianto: {site.get('site_name', 'Casa')}",
        f"Categoria: {safe_category}",
        f"Descrizione: {safe_description or '-'}",
        f"Data/ora: {occurred_at}",
    ]
    if safe_module:
        lines.append(f"Modulo: {safe_module}")
    if safe_entity:
        lines.append(f"Entita: {safe_entity}")
    message = "\n".join(lines)
    immediate_escalation = safe_severity == "critical"
    return {
        "provider": "whatsapp",
        "ticket_id": safe_ticket_id,
        "status": "new",
        "message": message,
        "url": f"https://wa.me/{phone}?text={quote(message)}" if phone else "",
        "customer_data": {
            "category": safe_category,
            "description": safe_description,
            "occurred_at": occurred_at,
            "entity_id": safe_entity,
            "module": safe_module,
        },
        "technical_data": {
            "severity": safe_severity,
            "diagnostic_snapshot_id": snapshot_id,
            "diagnostic_snapshot_status": "reserved" if snapshot_id else "not_requested",
            "diagnostic_scope": [],
            "diagnostic_consent": consent,
            "immediate_escalation": immediate_escalation,
            "automatic_troubleshooting": not immediate_escalation,
            "anomalies": [],
        },
    }


def reserve_diagnostic_snapshot_id(enabled: bool, consent: bool) -> str:
    """Reserve an opaque reference without collecting diagnostic data."""
    return f"diag_{uuid4().hex}" if enabled and consent else ""


def persist_request(
    runtime: dict[str, Any], request: dict[str, Any], max_requests: int = 200
) -> dict[str, Any]:
    """Persist a bounded, already-redacted request in the runtime store."""
    assistance_runtime = runtime.setdefault("assistance", {})
    requests = assistance_runtime.setdefault("requests", [])
    requests.append(request)
    assistance_runtime["requests"] = requests[-max(1, int(max_requests)) :]
    return request


def update_request_status(
    runtime: dict[str, Any], ticket_id: str, status: str
) -> dict[str, Any] | None:
    """Apply only the supported request lifecycle states."""
    if status not in {"new", "in_progress", "resolved"}:
        return None
    for request in runtime.get("assistance", {}).get("requests", []):
        if request.get("ticket_id") == ticket_id:
            request["status"] = status
            return request
    return None


def prepare_escalation_whatsapp(
    *, site: dict[str, Any], ticket_id: str, technical_summary: str
) -> dict[str, str]:
    """Build a redacted escalation message containing the ticket reference."""
    summary = redact_sensitive_text(technical_summary)[:1500]
    message = "\n".join(
        [
            "Escalation assistenza",
            f"Ticket: {ticket_id}",
            f"Impianto: {site.get('site_name', 'Casa')}",
            f"Riepilogo: {summary or '-'}",
        ]
    )
    support = site.get("support", {}) if isinstance(site.get("support"), dict) else {}
    phone = re.sub(r"\D", "", str(support.get("whatsapp", "")))
    return {
        "message": message,
        "url": f"https://wa.me/{phone}?text={quote(message)}" if phone else "",
    }

"""Pay-per-use gate, tool policy and installer-only AI telemetry."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any

from .ai_provider import AIProvider, AIRequest
from .assistance import normalize_assistance_config, redact_sensitive_text


CONTROLLED_TOOLS = frozenset(
    {
        "read_entity_state",
        "device_availability",
        "area_summary",
        "authorized_recent_errors",
        "safe_diagnostics",
        "knowledge_base",
        "create_ticket",
        "escalate_whatsapp",
    }
)


@dataclass
class Usage:
    requests: int = 0
    conversations: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    estimated_cost: float = 0.0
    escalations: int = 0
    resolved_by_ai: int = 0
    model: str = ""


class AssistanceGateway:
    """The only component allowed to invoke an AIProvider."""

    def __init__(self, config: dict[str, Any], provider: AIProvider) -> None:
        self.config = normalize_assistance_config(config)
        self.provider = provider
        self._usage: dict[str, Usage] = defaultdict(Usage)
        self._conversations: set[tuple[str, str]] = set()

    def _period_key(self, site_id: str) -> str:
        return f"{site_id}:{datetime.now(timezone.utc):%Y-%m}"

    def telemetry(self, site_id: str) -> dict[str, Any]:
        """Installer presentation model; never exposed by the public bootstrap."""
        return asdict(self._usage[self._period_key(site_id)])

    def _limit_reached(self, usage: Usage, is_new_conversation: bool) -> str:
        limits = self.config["limits"]
        request_limit = int(limits.get("requests_per_month") or 0)
        if request_limit > 0 and usage.requests + 1 > request_limit:
            return "request_limit"
        conversation_limit = int(limits.get("conversations_per_month") or 0)
        if (
            is_new_conversation
            and conversation_limit > 0
            and usage.conversations + 1 > conversation_limit
        ):
            return "conversation_limit"
        token_limit = int(limits.get("tokens_per_month") or 0)
        token_reserve = int(limits["max_context_tokens"]) + int(
            limits["max_output_tokens"]
        )
        if (
            token_limit > 0
            and usage.input_tokens + usage.output_tokens + token_reserve > token_limit
        ):
            return "token_limit"
        budget = float(limits.get("monthly_budget_eur") or 0)
        cost_reserve = max(
            0.0, float(limits.get("estimated_max_request_cost_eur") or 0)
        )
        if budget > 0 and usage.estimated_cost + cost_reserve > budget:
            return "monthly_budget"
        return ""

    async def assist(
        self,
        *,
        site_id: str,
        conversation_id: str,
        message: str,
        severity: str = "info",
        context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Call AI only after all enablement, severity and budget gates pass."""
        provider_mode = self.config["provider"]
        if provider_mode == "whatsapp" or not self.config["ai_enabled"]:
            return {"status": "disabled", "escalate": provider_mode == "hybrid"}
        # This phase intentionally permits only the local no-network provider.
        if self.config.get("ai_provider") != "mock":
            return {"status": "provider_disabled", "escalate": True}
        if severity == "critical":
            usage = self._usage[self._period_key(site_id)]
            usage.escalations += 1
            return {"status": "critical_escalation", "escalate": True}
        usage = self._usage[self._period_key(site_id)]
        conversation_key = (site_id, conversation_id)
        is_new_conversation = conversation_key not in self._conversations
        limit_reason = self._limit_reached(usage, is_new_conversation)
        if limit_reason:
            usage.escalations += 1
            return {
                "status": "limit_reached",
                "limit_reason": limit_reason,
                "escalate": bool(self.config.get("fallback_whatsapp")),
            }

        # No arbitrary tool name can cross the gateway boundary.
        configured_tools = set(self.config.get("allowed_tools", []))
        tools = tuple(sorted(CONTROLLED_TOOLS & configured_tools))
        safe_context = context if isinstance(context, dict) else {}
        request = AIRequest(
            site_id=site_id,
            conversation_id=conversation_id,
            message=redact_sensitive_text(message)[:4000],
            context=safe_context,
            allowed_tools=tools,
            max_context_tokens=int(self.config["limits"]["max_context_tokens"]),
            max_output_tokens=int(self.config["limits"]["max_output_tokens"]),
            timeout_seconds=int(self.config["limits"]["timeout_seconds"]),
        )
        response = await self.provider.respond(request)
        usage.requests += 1
        if is_new_conversation:
            usage.conversations += 1
            self._conversations.add(conversation_key)
        usage.input_tokens += response.input_tokens
        usage.output_tokens += response.output_tokens
        usage.estimated_cost += response.estimated_cost
        usage.model = response.model
        escalate = response.confidence < float(self.config["confidence_threshold"])
        if response.resolved:
            usage.resolved_by_ai += 1
        if escalate:
            usage.escalations += 1
        safe_text = redact_sensitive_text(response.text)
        safe_summary = redact_sensitive_text(response.technical_summary)
        return {
            "status": "resolved" if response.resolved else "guidance",
            "text": safe_text,
            "confidence": response.confidence,
            "resolved": response.resolved,
            "escalate": escalate,
            "technical_summary": safe_summary if escalate else "",
        }

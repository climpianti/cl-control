"""Provider boundary for optional CL Assistance AI."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class AIRequest:
    """Sanitized input produced by the gateway, never by the browser directly."""

    site_id: str
    conversation_id: str
    message: str
    context: dict[str, Any] = field(default_factory=dict)
    allowed_tools: tuple[str, ...] = ()
    max_context_tokens: int = 4000
    max_output_tokens: int = 600
    timeout_seconds: int = 20


@dataclass(frozen=True)
class AIResponse:
    text: str
    confidence: float
    resolved: bool
    input_tokens: int = 0
    output_tokens: int = 0
    estimated_cost: float = 0.0
    model: str = ""
    technical_summary: str = ""


class AIProvider(ABC):
    """Replaceable backend-only provider interface."""

    @abstractmethod
    async def respond(self, request: AIRequest) -> AIResponse:
        """Return a response using only tools explicitly present in the request."""


class MockAIProvider(AIProvider):
    """No-network provider used to validate flows without paid calls."""

    def __init__(
        self, model: str = "mock-disabled", response: AIResponse | None = None
    ) -> None:
        self.model = model
        self.response = response
        self.call_count = 0

    async def respond(self, request: AIRequest) -> AIResponse:
        self.call_count += 1
        if self.response is not None:
            return self.response
        return AIResponse(
            text="Mock CL Assistance: nessuna chiamata AI reale eseguita.",
            confidence=0.0,
            resolved=False,
            model=self.model,
            technical_summary="Provider mock: escalation consigliata.",
        )


class OpenAIProvider(AIProvider):
    """Intentional placeholder: real paid transport is not part of Phase 1/2."""

    async def respond(self, request: AIRequest) -> AIResponse:
        raise RuntimeError("OpenAI provider is not enabled in this build")

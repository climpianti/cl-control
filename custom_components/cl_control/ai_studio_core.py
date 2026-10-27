"""AI Studio MVP: provider-independent, deterministic proposal preparation.

This module never executes Home Assistant services or network requests.
Provider outputs are untrusted and must pass strict validation.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Protocol


ALLOWED_TYPES = frozenset({"knx_entity", "modbus_sensor"})
MAX_CANDIDATES = 100
MAX_OUTPUT_BYTES = 100_000


class StudioProposalError(ValueError):
    """Invalid or unsafe AI-generated proposal."""


@dataclass(frozen=True)
class StudioRequest:
    instruction: str
    inventory: tuple[dict[str, Any], ...]

    def __post_init__(self) -> None:
        if not 1 <= len(self.instruction.strip()) <= 2000:
            raise StudioProposalError("Invalid instruction length")
        if len(self.inventory) > MAX_CANDIDATES:
            raise StudioProposalError("Too many inventory entries")
        ids = []
        for item in self.inventory:
            if not isinstance(item, dict):
                raise StudioProposalError("Invalid inventory entry")
            identifier = item.get("id")
            if not isinstance(identifier, str) or not identifier or len(identifier) > 128:
                raise StudioProposalError("Invalid inventory identifier")
            ids.append(identifier)
        if len(ids) != len(set(ids)):
            raise StudioProposalError("Inventory identifiers must be unique")


class StructuredProvider(Protocol):
    async def generate(self, instruction: str, inventory: tuple[dict[str, Any], ...]) -> str:
        """Generate JSON only. This interface grants no IO/tool permissions."""


def validate_proposal(raw: str, request: StudioRequest) -> dict[str, Any]:
    if not isinstance(raw, str) or len(raw.encode("utf-8")) > MAX_OUTPUT_BYTES:
        raise StudioProposalError("Invalid provider output size")
    try:
        data = json.loads(raw)
    except (ValueError, TypeError) as exc:
        raise StudioProposalError("Provider output is not JSON") from exc
    if not isinstance(data, dict) or set(data) != {"version", "items"}:
        raise StudioProposalError("Unexpected proposal structure")
    if type(data["version"]) is not int or data["version"] != 1:
        raise StudioProposalError("Unsupported schema version")
    items = data["items"]
    if not isinstance(items, list) or len(items) > MAX_CANDIDATES:
        raise StudioProposalError("Invalid proposal items")
    inventory = {entry["id"]: entry for entry in request.inventory}
    normalized = []
    used = set()
    for item in items:
        if not isinstance(item, dict) or set(item) != {"source_id", "type", "name"}:
            raise StudioProposalError("Unexpected item fields")
        source_id, kind, name = item["source_id"], item["type"], item["name"]
        if not isinstance(source_id, str) or source_id not in inventory or source_id in used:
            raise StudioProposalError("Unknown or duplicate source identifier")
        if kind not in ALLOWED_TYPES or kind != inventory[source_id].get("type"):
            raise StudioProposalError("Invalid candidate type")
        if not isinstance(name, str) or not 1 <= len(name.strip()) <= 100:
            raise StudioProposalError("Invalid proposed name")
        used.add(source_id)
        normalized.append({"source_id": source_id, "type": kind, "name": name.strip()})
    return {
        "version": 1,
        "status": "draft",
        "approved": False,
        "items": normalized,
        "warning": "Draft only: installer verification required. No write actions permitted.",
    }


class MockStudioProvider:
    """Predictable mock for integration tests; no cloud access."""

    async def generate(self, instruction: str, inventory: tuple[dict[str, Any], ...]) -> str:
        return json.dumps({
            "version": 1,
            "items": [
                {"source_id": item["id"], "type": item["type"], "name": item["name"]}
                for item in inventory
                if item.get("type") in ALLOWED_TYPES and isinstance(item.get("name"), str)
            ],
        })


async def generate_draft(provider: StructuredProvider, request: StudioRequest) -> dict[str, Any]:
    raw = await provider.generate(request.instruction, request.inventory)
    return validate_proposal(raw, request)

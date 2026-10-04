"""Lightweight runtime summaries for the native CL Control dashboard."""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any

SUMMARY_MODULES = ("lights", "covers", "climate")


def is_active_state(module: str, state: str | None) -> bool:
    """Return whether a source entity should count as active."""
    state = str(state or "").lower()
    if state in {"", "unknown", "unavailable"}:
        return False
    if module == "lights":
        return state == "on"
    if module == "covers":
        return state != "closed"
    if module == "climate":
        return state != "off"
    return False


def format_summary(module: str, active_count: int, total_count: int) -> str:
    """Return compact Italian status text for a customer tile."""
    if module == "lights":
        if active_count == 0:
            return "Tutte spente"
        if active_count == 1:
            return "1 luce accesa"
        return f"{active_count} luci accese"
    if module == "covers":
        if active_count == 0:
            return "Tutte chiuse"
        if active_count == 1:
            return "1 apertura aperta"
        return f"{active_count} aperture aperte"
    if module == "climate":
        if active_count == 0:
            return "Tutto spento"
        if active_count == 1:
            return "1 zona attiva"
        return f"{active_count} zone attive"
    return f"{active_count}/{total_count}"


class SummaryManager:
    """Keep structural source lists separate from state-driven summary updates."""

    def __init__(self, installation_id: str) -> None:
        self.installation_id = installation_id
        self._sources: dict[str, tuple[str, ...]] = {
            module: () for module in SUMMARY_MODULES
        }
        self._entities: dict[str, Any] = {}
        self._area_power_sources: dict[str, tuple[str, ...]] = {}
        self._area_power_entities: dict[str, Any] = {}

    def attach(self, module: str, entity: Any) -> None:
        if module not in SUMMARY_MODULES:
            return
        self._entities[module] = entity
        entity.set_sources(self._sources[module])

    def detach(self, module: str, entity: Any) -> None:
        if self._entities.get(module) is entity:
            self._entities.pop(module, None)

    def set_sources(self, sources: dict[str, Iterable[str]]) -> None:
        for module in SUMMARY_MODULES:
            normalized = tuple(
                dict.fromkeys(str(item) for item in sources.get(module, ()))
            )
            if normalized == self._sources[module]:
                continue
            self._sources[module] = normalized
            entity = self._entities.get(module)
            if entity is not None:
                entity.set_sources(normalized)

    def sources(self, module: str) -> tuple[str, ...]:
        return self._sources.get(module, ())

    def entity_ids(self) -> dict[str, str]:
        result: dict[str, str] = {}
        for module, entity in self._entities.items():
            entity_id = str(getattr(entity, "entity_id", "") or "")
            if entity_id:
                result[module] = entity_id
        return result

    def attach_area_power(self, area_id: str, entity: Any) -> None:
        """Attach one native aggregate power sensor for an area."""
        self._area_power_entities[area_id] = entity
        entity.set_sources(self._area_power_sources.get(area_id, ()))

    def detach_area_power(self, area_id: str, entity: Any) -> None:
        if self._area_power_entities.get(area_id) is entity:
            self._area_power_entities.pop(area_id, None)

    def set_area_power_sources(
        self, sources: dict[str, Iterable[str]]
    ) -> None:
        """Update structural source lists without reading runtime states."""
        area_ids = set(self._area_power_sources) | set(sources)
        for area_id in area_ids:
            normalized = tuple(
                dict.fromkeys(str(item) for item in sources.get(area_id, ()))
            )
            if normalized == self._area_power_sources.get(area_id, ()):
                continue
            self._area_power_sources[area_id] = normalized
            entity = self._area_power_entities.get(area_id)
            if entity is not None:
                entity.set_sources(normalized)

    def area_power_entity_ids(self) -> dict[str, str]:
        """Return aggregate sensors only for areas that have power sources."""
        result: dict[str, str] = {}
        for area_id, sources in self._area_power_sources.items():
            if not sources:
                continue
            entity = self._area_power_entities.get(area_id)
            entity_id = str(getattr(entity, "entity_id", "") or "")
            if entity_id:
                result[area_id] = entity_id
        return result


__all__ = (
    "SUMMARY_MODULES",
    "SummaryManager",
    "format_summary",
    "is_active_state",
)

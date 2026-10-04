"""Validated, versioned dashboard-layout contracts.

Layout data only describes presentation. It never contains service calls or entity
credentials and can therefore be exposed read-only to customer sessions.
"""

from __future__ import annotations

from copy import deepcopy
import re
from typing import Any

LAYOUT_SCHEMA_VERSION = 1
LAYOUT_CONTEXTS = ("base", "mobile", "tablet", "wall")
LAYOUT_VIEWS = (
    "home", "area", "sections", "lights", "covers", "climate", "energy", "security", "media", "cameras", "support"
)
CARD_ID_RE = re.compile(r"^[a-z0-9][a-z0-9_.:-]{0,127}$")
ICON_RE = re.compile(r"^(?:mdi|cl):[a-z0-9-]{1,64}$")

CARD_CAPABILITIES = {
    "module": {"sizes": ("s", "m", "l"), "spans": (1, 2, 3, 4), "shapes": ("compact", "rectangle", "square")},
    "status": {"sizes": ("m", "l"), "spans": (1, 2, 3, 4), "shapes": ("compact", "rectangle")},
    "favorites": {"sizes": ("m", "l", "xl"), "spans": (1, 2, 3, 4), "shapes": ("compact", "rectangle")},
    "light": {"sizes": ("s", "m", "l"), "spans": (1, 2, 3, 4), "shapes": ("compact", "rectangle", "square")},
    "switch": {"sizes": ("s", "m", "l"), "spans": (1, 2, 3, 4), "shapes": ("compact", "rectangle", "square")},
    "thermostat": {"sizes": ("m", "l"), "spans": (1, 2, 3, 4), "shapes": ("rectangle", "square")},
    "camera": {"sizes": ("m", "l", "xl"), "spans": (1, 2, 3, 4), "shapes": ("rectangle", "wide")},
    "energy": {"sizes": ("l", "xl"), "spans": (1, 2, 3, 4), "shapes": ("rectangle", "wide")},
    "security": {"sizes": ("m", "l"), "spans": (1, 2, 3, 4), "shapes": ("compact", "rectangle")},
    "sensor": {"sizes": ("s", "m"), "spans": (1, 2), "shapes": ("compact", "rectangle")},
    "media": {"sizes": ("s", "m", "l"), "spans": (1, 2, 3, 4), "shapes": ("compact", "rectangle")},
    "assistance": {"sizes": ("m", "l"), "spans": (1, 2, 3, 4), "shapes": ("compact", "rectangle")},
}
HOME_CARD_CAPABILITIES = {
    "status": {"sizes": ("l", "xl"), "spans": (2,), "shapes": ("rectangle",), "defaults": {"size": "l", "span": 2, "shape": "rectangle"}, "required": ("show_state",)},
    "favorites": {"sizes": ("l", "xl"), "spans": (2,), "shapes": ("rectangle",), "defaults": {"size": "l", "span": 2, "shape": "rectangle"}, "required": ("show_state",)},
    "module": {"sizes": ("m", "l"), "spans": (1, 2), "shapes": ("compact", "rectangle"), "defaults": {"size": "m", "span": 1, "shape": "rectangle"}, "required": ("show_state",)},
    "assistance": {"sizes": ("m", "l"), "spans": (1, 2), "shapes": ("compact", "rectangle"), "defaults": {"size": "m", "span": 1, "shape": "rectangle"}, "required": ("show_state",)},
}
DEFAULT_CARD = {
    "type": "module", "order": 0, "size": "m", "span": 1,
    "shape": "rectangle", "icon_size": "m", "icon_container": "soft",
    "show_icon": True, "show_title": True, "show_state": True,
    "show_secondary": True, "visible": True, "favorite": False,
}


def empty_layout() -> dict[str, Any]:
    """Return an empty layout whose contexts inherit generated presentation."""
    return {"layout_schema_version": LAYOUT_SCHEMA_VERSION, **{key: {} for key in LAYOUT_CONTEXTS}}


def layout_write_allowed(is_admin: bool, installer_active: bool) -> bool:
    """Central write policy: customers can read layouts but cannot mutate them."""
    return bool(is_admin and installer_active)


def _card(value: Any, *, partial: bool = False, view: str = "") -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    card_type = str(value.get("type", "module")).lower()
    caps = (HOME_CARD_CAPABILITIES.get(card_type, HOME_CARD_CAPABILITIES["module"])
            if view == "home" else CARD_CAPABILITIES.get(card_type, CARD_CAPABILITIES["module"]))
    result = deepcopy(DEFAULT_CARD)
    result["type"] = card_type if card_type in CARD_CAPABILITIES else "module"
    try:
        result["order"] = max(-10000, min(10000, int(value.get("order", 0))))
    except (TypeError, ValueError):
        result["order"] = 0
    size = str(value.get("size", result["size"])).lower()
    result["size"] = size if size in caps["sizes"] else caps.get("defaults", {}).get("size", caps["sizes"][0])
    shape = str(value.get("shape", result["shape"])).lower()
    result["shape"] = shape if shape in caps["shapes"] else caps.get("defaults", {}).get("shape", caps["shapes"][0])
    try:
        span = max(1, min(4, int(value.get("span", 1))))
        result["span"] = span if span in caps["spans"] else caps.get("defaults", {}).get("span", caps["spans"][0])
    except (TypeError, ValueError):
        result["span"] = caps.get("defaults", {}).get("span", 1)
    icon_size = str(value.get("icon_size", "m")).lower()
    result["icon_size"] = icon_size if icon_size in ("s", "m", "l") else "m"
    container = str(value.get("icon_container", "soft")).lower()
    result["icon_container"] = container if container in ("none", "soft", "solid") else "soft"
    icon_value = str(value.get("icon", "")).lower()
    if icon_value and ICON_RE.fullmatch(icon_value):
        result["icon"] = icon_value
    for key in ("show_icon", "show_title", "show_state", "show_secondary", "visible", "favorite"):
        if key in value:
            result[key] = bool(value[key])
    for key in caps.get("required", ()):
        result[key] = True
    # A visible card must retain an accessible identity.
    if result["visible"] and not (result["show_icon"] or result["show_title"]):
        result["show_title"] = True
    if partial:
        allowed = set(DEFAULT_CARD) | {"icon"}
        return {key: result[key] for key in allowed if key in value and key in result}
    return result


def normalize_layout(value: Any) -> dict[str, Any]:
    """Normalize persisted layout, ignoring unknown contexts, views and card IDs."""
    result = empty_layout()
    if not isinstance(value, dict):
        return result
    for context in LAYOUT_CONTEXTS:
        raw_context = value.get(context)
        if not isinstance(raw_context, dict):
            continue
        for view in LAYOUT_VIEWS:
            raw_view = raw_context.get(view)
            if not isinstance(raw_view, dict):
                continue
            cards: dict[str, Any] = {}
            for card_id, raw_card in list(raw_view.items())[:1000]:
                card_id = str(card_id).lower()
                card = _card(raw_card, partial=context != "base", view=view)
                if CARD_ID_RE.fullmatch(card_id) and card is not None:
                    cards[card_id] = card
            if cards:
                result[context][view] = cards
    return result


def update_layout_view(layout: Any, context: str, view: str, cards: Any) -> dict[str, Any]:
    """Replace one validated context/view while preserving all other overrides."""
    if context not in LAYOUT_CONTEXTS or view not in LAYOUT_VIEWS:
        raise ValueError("invalid_layout_scope")
    normalized = normalize_layout(layout)
    candidate = normalize_layout({context: {view: cards}})[context].get(view, {})
    if candidate:
        normalized[context][view] = candidate
    else:
        normalized[context].pop(view, None)
    return normalized


def reset_layout(layout: Any, context: str, view: str | None = None) -> dict[str, Any]:
    """Remove only the selected context or context/view overrides."""
    if context not in LAYOUT_CONTEXTS or (view is not None and view not in LAYOUT_VIEWS):
        raise ValueError("invalid_layout_scope")
    normalized = normalize_layout(layout)
    if view is None:
        normalized[context] = {}
    else:
        normalized[context].pop(view, None)
    return normalized


def layout_favorite_entity_ids(layout: Any, context: str, view: str | None = None) -> set[str]:
    """Return entity favorites that must survive removal of layout overrides."""
    normalized = normalize_layout(layout)
    selected = normalized.get(context, {})
    views = (view,) if view is not None else tuple(selected)
    favorites: set[str] = set()
    for selected_view in views:
        for card_id, card in selected.get(selected_view, {}).items():
            if card.get("favorite") is True and ":entity:" in card_id:
                favorites.add(card_id.split(":entity:", 1)[1])
    return favorites

"""Bounded, user-owned light snapshots and capability-validated scene drafts.

Persistence uses HA Store; activation delegates to native scene.apply. Permission
checks and snapshot validation happen for every target before any dispatch.
"""
from __future__ import annotations

import asyncio
from copy import deepcopy
from datetime import datetime, timezone
import math
import hashlib
import json
import re
from uuid import uuid4

MAX_ITEMS = 1000
MAX_USER_ITEMS = 64
MAX_TARGETS = 32
LIGHT_ID = re.compile(r"^light\.[a-z0-9_]{1,120}$")
ITEM_ID = re.compile(r"^[a-f0-9]{32}$")
COLOR_FIELDS = {
    "rgb": ("rgb_color", (255, 255, 255)),
    "rgbw": ("rgbw_color", (255, 255, 255, 255)),
    "rgbww": ("rgbww_color", (255, 255, 255, 255, 255)),
    "hs": ("hs_color", (360, 100)),
    "xy": ("xy_color", (1, 1)),
}
DIM_MODES = {"brightness", "color_temp", "white", *COLOR_FIELDS}


def _number(value, low, high):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("Valore luce non valido")
    if not math.isfinite(value) or not low <= value <= high:
        raise ValueError("Valore luce fuori intervallo")
    return value


def validate_snapshot(snapshot):
    """Reject unknown fields, malformed data and mixed color representations."""
    if not isinstance(snapshot, dict) or not isinstance(snapshot.get("state"), str) or snapshot["state"] not in {"on", "off"}:
        raise ValueError("Stato luce non valido")
    mode = snapshot.get("color_mode")
    if mode is not None and not isinstance(mode, str):
        raise ValueError("Modalità colore non valida")
    allowed = {"state", "brightness", "color_mode", "effect"}
    if mode in COLOR_FIELDS:
        key, limits = COLOR_FIELDS[mode]
        allowed.add(key)
        values = snapshot.get(key)
        if not isinstance(values, (list, tuple)) or len(values) != len(limits):
            raise ValueError("Colore luce incompleto")
        for value, limit in zip(values, limits):
            _number(value, 0, limit)
    elif mode == "color_temp":
        allowed.add("color_temp_kelvin")
        _number(snapshot.get("color_temp_kelvin"), 1000, 40000)
    elif mode not in {None, "onoff", "brightness", "white"}:
        raise ValueError("Modalità colore non supportata")
    if set(snapshot) - allowed:
        raise ValueError("Attributi luce non consentiti")
    if "brightness" in snapshot:
        brightness = _number(snapshot["brightness"], 1, 255)
        if int(brightness) != brightness:
            raise ValueError("Luminosità non valida")
    if "effect" in snapshot and (
        not isinstance(snapshot["effect"], str) or not 1 <= len(snapshot["effect"]) <= 120
    ):
        raise ValueError("Effetto non valido")
    if snapshot["state"] == "off" and set(snapshot) != {"state"}:
        raise ValueError("Una luce spenta non deve avere comandi colore")
    return deepcopy(snapshot)


def capture_light(state, *, preset=False):
    if state is None or state.state not in {"on", "off"}:
        raise ValueError("Una luce selezionata non è disponibile")
    attributes = state.attributes
    if attributes.get("entity_id") or attributes.get("group_entities"):
        raise ValueError("Seleziona le singole luci, senza gruppi aggregati")
    modes = set(attributes.get("supported_color_modes") or [])
    if preset and (state.state != "on" or not modes.intersection(DIM_MODES)):
        raise ValueError("Per salvare un preferito accendi e regola una luce dimmerabile")
    snapshot = {"state": state.state}
    if state.state == "off":
        return snapshot
    mode = attributes.get("color_mode")
    if modes.intersection(DIM_MODES) and not mode:
        raise ValueError("Modalità luce non ancora disponibile: attendi l'aggiornamento")
    if mode and mode not in modes:
        raise ValueError("Capacità luce incoerenti")
    if mode:
        snapshot["color_mode"] = mode
    if modes.intersection(DIM_MODES):
        snapshot["brightness"] = attributes.get("brightness")
    if mode in COLOR_FIELDS:
        key = COLOR_FIELDS[mode][0]
        value = attributes.get(key)
        snapshot[key] = list(value) if isinstance(value, (list, tuple)) else value
    elif mode == "color_temp":
        snapshot["color_temp_kelvin"] = attributes.get("color_temp_kelvin")
    effect = attributes.get("effect")
    if effect and effect != "None" and effect in (attributes.get("effect_list") or []):
        snapshot["effect"] = effect
    return validate_snapshot(snapshot)


def validate_scene_target(snapshot, state):
    """Validate a desired light state against its current device capabilities."""
    saved = validate_snapshot(snapshot)
    if state is None or state.state not in {"on", "off"}:
        raise ValueError("Una luce selezionata non è disponibile")
    attrs = state.attributes
    if attrs.get("entity_id") or attrs.get("group_entities"):
        raise ValueError("Seleziona le singole luci, senza gruppi aggregati")
    modes = set(attrs.get("supported_color_modes") or [])
    if "brightness" in saved and not modes.intersection(DIM_MODES):
        raise ValueError("Questa luce non supporta la regolazione della luminosità")
    mode = saved.get("color_mode")
    if mode and mode not in modes:
        raise ValueError("Le capacità della luce sono cambiate: controlla le regolazioni")
    if "effect" in saved and saved["effect"] not in (attrs.get("effect_list") or []):
        raise ValueError("L'effetto selezionato non è disponibile")
    kelvin = saved.get("color_temp_kelvin")
    if kelvin is not None and not (
        attrs.get("min_color_temp_kelvin", 1000) <= kelvin
        <= attrs.get("max_color_temp_kelvin", 40000)
    ):
        raise ValueError("Temperatura colore non supportata dalla luce")
    return saved


class LightMemoryLibrary:
    def __init__(self, store, get_state):
        self.store = store
        self.get_state = get_state
        self.items = {}
        self.lock = asyncio.Lock()

    @classmethod
    def from_hass(cls, hass, installation_id):
        from homeassistant.helpers.storage import Store
        return cls(Store(hass, 1, f"cl_control.light_memories.{installation_id}"), hass.states.get)

    async def async_load(self):
        saved = await self.store.async_load()
        if saved is None:
            return
        if not isinstance(saved, dict) or saved.get("schema_version") != 1:
            raise ValueError("Archivio scenari non valido: dati conservati, nessun reset")
        items = saved.get("items")
        if not isinstance(items, dict) or len(items) > MAX_ITEMS:
            raise ValueError("Archivio scenari non valido")
        for item_id, item in items.items():
            if not ITEM_ID.fullmatch(item_id) or not isinstance(item, dict):
                raise ValueError("Scenario salvato non valido")
            if item.get("id") != item_id or item.get("kind") not in {"scene", "preset"}:
                raise ValueError("Tipo scenario non valido")
            if not isinstance(item.get("owner"), str) or not item["owner"]:
                raise ValueError("Proprietario scenario mancante")
            if not isinstance(item.get("name"), str) or not 1 <= len(item["name"]) <= 64:
                raise ValueError("Nome scenario non valido")
            self._validate_states(item.get("states"), item["kind"])
        self.items = deepcopy(items)

    def _validate_states(self, states, kind):
        if not isinstance(states, dict) or not 1 <= len(states) <= MAX_TARGETS:
            raise ValueError("Seleziona da 1 a 32 luci")
        if kind == "preset" and len(states) != 1:
            raise ValueError("Un preferito riguarda una sola luce")
        for entity_id, snapshot in states.items():
            if not isinstance(entity_id, str) or not LIGHT_ID.fullmatch(entity_id):
                raise ValueError("Sono consentite solo luci")
            validate_snapshot(snapshot)
            if kind == "preset" and snapshot["state"] != "on":
                raise ValueError("Preferito luce non valido")

    def _authorize(self, entities, allowed, *, control=False, available=False):
        for entity_id in entities:
            if not allowed(entity_id, "read") or (control and not allowed(entity_id, "control")):
                raise PermissionError("Permessi insufficienti sulle luci selezionate")
            if available:
                state = self.get_state(entity_id)
                if state is None or state.state not in {"on", "off"}:
                    raise ValueError("Una luce selezionata non è disponibile")
                if state.attributes.get("entity_id") or state.attributes.get("group_entities"):
                    raise ValueError("Gruppi aggregati non supportati")

    def _owned(self, owner, item_id):
        item = self.items.get(item_id)
        if item is None or item["owner"] != owner:
            raise ValueError("Scenario o preferito non trovato")
        return item

    @staticmethod
    def _revision(item):
        content = {key: item[key] for key in ("name", "states")}
        return hashlib.sha256(json.dumps(content, sort_keys=True, separators=(",", ":")).encode()).hexdigest()

    async def _save(self, items):
        # Commit memory only after HA Store has persisted successfully.
        await self.store.async_save({"schema_version": 1, "items": deepcopy(items)})
        self.items = items

    async def async_list(self, owner, allowed, *, entity_id=None, kind=None):
        async with self.lock:
            result = []
            for item in self.items.values():
                if item["owner"] != owner or (kind and item["kind"] != kind):
                    continue
                if entity_id and entity_id not in item["states"]:
                    continue
                if not all(allowed(e, "read") for e in item["states"]):
                    continue
                public = {k: deepcopy(v) for k, v in item.items() if k != "owner"}
                if item["kind"] == "scene":
                    public["revision"] = self._revision(item)
                public["available"] = all(
                    (s := self.get_state(e)) is not None and s.state in {"on", "off"}
                    for e in item["states"]
                )
                result.append(public)
            return result

    async def async_capture(self, owner, allowed, name, entity_ids, kind):
        if kind not in {"scene", "preset"}:
            raise ValueError("Tipo salvataggio non valido")
        name = name.strip()
        if not 1 <= len(name) <= 64:
            raise ValueError("Il nome deve contenere da 1 a 64 caratteri")
        if not isinstance(entity_ids, list) or not 1 <= len(entity_ids) <= MAX_TARGETS:
            raise ValueError("Seleziona da 1 a 32 luci")
        if len(set(entity_ids)) != len(entity_ids) or any(not LIGHT_ID.fullmatch(e) for e in entity_ids):
            raise ValueError("Selezione luci non valida")
        if kind == "preset" and len(entity_ids) != 1:
            raise ValueError("Un preferito riguarda una sola luce")
        async with self.lock:
            if len(self.items) >= MAX_ITEMS or sum(i["owner"] == owner for i in self.items.values()) >= MAX_USER_ITEMS:
                raise ValueError("Limite scenari e preferiti raggiunto")
            self._authorize(entity_ids, allowed, control=True, available=True)
            states = {e: capture_light(self.get_state(e), preset=kind == "preset") for e in entity_ids}
            self._validate_states(states, kind)
            item_id = uuid4().hex
            item = {"id": item_id, "owner": owner, "name": name, "kind": kind,
                    "created_at": datetime.now(timezone.utc).isoformat(), "states": states}
            await self._save({**self.items, item_id: item})
            return {k: deepcopy(v) for k, v in item.items() if k != "owner"}

    async def async_delete(self, owner, item_id):
        async with self.lock:
            self._owned(owner, item_id)
            items = {k: v for k, v in self.items.items() if k != item_id}
            await self._save(items)

    async def async_create_scene(self, owner, allowed, name, states):
        """Persist an explicit draft without sending any device command."""
        if not isinstance(name, str) or not 1 <= len(name.strip()) <= 64:
            raise ValueError("Il nome deve contenere da 1 a 64 caratteri")
        self._validate_states(states, "scene")
        # Copy before awaiting the lock, so callers cannot change a validated draft.
        states = deepcopy(states)
        async with self.lock:
            if len(self.items) >= MAX_ITEMS or sum(i["owner"] == owner for i in self.items.values()) >= MAX_USER_ITEMS:
                raise ValueError("Limite scenari e preferiti raggiunto")
            self._authorize(states, allowed, control=True, available=True)
            for entity_id, snapshot in states.items():
                validate_scene_target(snapshot, self.get_state(entity_id))
            item_id = uuid4().hex
            item = {"id": item_id, "owner": owner, "name": name.strip(), "kind": "scene",
                    "created_at": datetime.now(timezone.utc).isoformat(), "states": states}
            await self._save({**self.items, item_id: item})
            return {k: deepcopy(v) for k, v in item.items() if k != "owner"}

    async def async_apply(self, owner, allowed, item_id, apply):
        async with self.lock:
            item = self._owned(owner, item_id)
            self._validate_states(item["states"], item["kind"])
            self._authorize(item["states"], allowed, control=True, available=True)
            # Check changed capabilities before sending anything.
            for entity_id, saved in item["states"].items():
                validate_scene_target(saved, self.get_state(entity_id))
            await apply(deepcopy(item["states"]))
            return {"dispatched": True, "count": len(item["states"])}

    async def async_update_scene(self, owner, allowed, item_id, name, states, expected_revision):
        """Replace one owned scene atomically, without recreating or activating it."""
        if not isinstance(name, str) or not 1 <= len(name.strip()) <= 64:
            raise ValueError("Il nome deve contenere da 1 a 64 caratteri")
        self._validate_states(states, "scene")
        states = deepcopy(states)
        async with self.lock:
            old = self._owned(owner, item_id)
            if old["kind"] != "scene":
                raise ValueError("La modifica è disponibile solo per gli scenari")
            if expected_revision != self._revision(old):
                raise ValueError("Lo scenario è stato modificato altrove. La bozza è conservata: annulla e riapri lo scenario aggiornato.")
            # Removed targets need read permission; retained/new targets also need control.
            self._authorize(old["states"], allowed)
            self._authorize(states, allowed, control=True, available=True)
            for entity_id, snapshot in states.items():
                validate_scene_target(snapshot, self.get_state(entity_id))
            item = {**old, "name": name.strip(), "states": states,
                    "updated_at": datetime.now(timezone.utc).isoformat()}
            await self._save({**self.items, item_id: item})
            return {**{k: deepcopy(v) for k, v in item.items() if k != "owner"},
                    "revision": self._revision(item)}

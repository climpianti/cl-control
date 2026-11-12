"""Authenticated, owner-scoped API for CL lighting memories."""
from __future__ import annotations

import asyncio
import logging
import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.exceptions import HomeAssistantError

from .const import DOMAIN, DATA_LIGHT_MEMORIES

_LOGGER = logging.getLogger(__name__)


def register_light_memory_commands(hass):
    async def handle(hass, connection, msg, action):
        user = connection.user
        if user is None or not user.is_active:
            connection.send_error(msg["id"], "unauthorized", "Accesso non autorizzato")
            return
        library = hass.data[DOMAIN].get(DATA_LIGHT_MEMORIES)
        if library is None:
            connection.send_error(msg["id"], "not_ready", "Archivio scenari non disponibile")
            return
        allowed = lambda entity_id, policy: user.permissions.check_entity(entity_id, policy)
        try:
            if action == "list":
                result = {"items": await library.async_list(
                    user.id, allowed, entity_id=msg.get("entity_id"), kind=msg.get("kind"))}
            elif action == "capture":
                result = await library.async_capture(user.id, allowed, msg["name"], msg["entity_ids"], msg["kind"])
            elif action == "create":
                result = await library.async_create_scene(user.id, allowed, msg["name"], msg["states"])
            elif action == "update":
                result = await library.async_update_scene(user.id, allowed, msg["item_id"], msg["name"], msg["states"], msg["expected_revision"])
            elif action == "delete":
                await library.async_delete(user.id, msg["item_id"])
                result = {"deleted": True}
            else:
                async def apply(states):
                    if not hass.services.has_service("scene", "apply"):
                        raise ValueError("Il servizio nativo scene.apply non è ancora disponibile")
                    async with asyncio.timeout(20):
                        await hass.services.async_call(
                            "scene", "apply", {"entities": states}, blocking=True,
                            context=connection.context(msg))
                result = await library.async_apply(user.id, allowed, msg["item_id"], apply)
        except (ValueError, PermissionError) as exc:
            connection.send_error(msg["id"], "light_memory_error", str(exc))
            return
        except (HomeAssistantError, OSError, TimeoutError):
            _LOGGER.warning("CL light memory operation failed (%s)", action)
            connection.send_error(msg["id"], "light_memory_failed",
                "Operazione non completata. Verifica lo stato delle luci prima di riprovare.")
            return
        connection.send_result(msg["id"], result)

    @websocket_api.websocket_command({
        vol.Required("type"): "cl_control/light_memories/list",
        vol.Optional("entity_id"): str,
        vol.Optional("kind"): vol.In(("scene", "preset")),
    })
    @websocket_api.async_response
    async def list_memories(hass, connection, msg):
        await handle(hass, connection, msg, "list")

    @websocket_api.websocket_command({
        vol.Required("type"): "cl_control/light_memories/capture",
        vol.Required("name"): vol.All(str, vol.Length(min=1, max=64)),
        vol.Required("entity_ids"): vol.All([str], vol.Length(min=1, max=32)),
        vol.Required("kind"): vol.In(("scene", "preset")),
    })
    @websocket_api.async_response
    async def capture_memory(hass, connection, msg):
        await handle(hass, connection, msg, "capture")

    @websocket_api.websocket_command({
        vol.Required("type"): "cl_control/light_memories/create",
        vol.Required("name"): vol.All(str, vol.Length(min=1, max=64)),
        vol.Required("states"): vol.All({str: dict}, vol.Length(min=1, max=32)),
    })
    @websocket_api.async_response
    async def create_scene(hass, connection, msg):
        await handle(hass, connection, msg, "create")

    @websocket_api.websocket_command({
        vol.Required("type"): "cl_control/light_memories/update",
        vol.Required("item_id"): str,
        vol.Required("name"): vol.All(str, vol.Length(min=1, max=64)),
        vol.Required("states"): vol.All({str: dict}, vol.Length(min=1, max=32)),
        vol.Required("expected_revision"): vol.All(str, vol.Match(r"^[a-f0-9]{64}$")),
    })
    @websocket_api.async_response
    async def update_scene(hass, connection, msg):
        await handle(hass, connection, msg, "update")

    @websocket_api.websocket_command({
        vol.Required("type"): "cl_control/light_memories/delete",
        vol.Required("item_id"): str,
    })
    @websocket_api.async_response
    async def delete_memory(hass, connection, msg):
        await handle(hass, connection, msg, "delete")

    @websocket_api.websocket_command({
        vol.Required("type"): "cl_control/light_memories/apply",
        vol.Required("item_id"): str,
    })
    @websocket_api.async_response
    async def apply_memory(hass, connection, msg):
        await handle(hass, connection, msg, "apply")

    for command in (list_memories, capture_memory, create_scene, update_scene, delete_memory, apply_memory):
        websocket_api.async_register_command(hass, command)

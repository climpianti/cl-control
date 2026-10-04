"""Authenticated WebSocket API for CL Control."""

from __future__ import annotations

import logging
import secrets
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er

from .const import (
    DATA_INSTALLER_LIMITER,
    DATA_ASSISTANCE_GATEWAY,
    DATA_BRANDING_MANAGER,
    DATA_CONFIG_ENTRY,
    DATA_CREDENTIALS,
    DATA_CREDENTIAL_STORE,
    DATA_INSTALLER_SESSIONS,
    DATA_NATIVE_DASHBOARD,
    DATA_RUNTIME,
    DATA_SECURITY_LIMITER,
    DATA_SETTINGS,
    DATA_STORE,
    DOMAIN,
    CONF_INSTALLATION_ID,
)
from .credentials import async_verify_pin
from .entry_data import sync_options_from_runtime
from .models import (
    build_bootstrap,
    migrate_runtime_config,
    runtime_to_frontend,
)
from .modules.assistance import (
    persist_request,
    prepare_escalation_whatsapp,
    prepare_whatsapp_request,
    reserve_diagnostic_snapshot_id,
    update_request_status,
)
from .modules.security import (
    ALARM_COMMAND_SERVICES,
    INIM_ZONE_RE,
    async_alarm_command,
    async_set_partition_mode,
    async_set_zone_exclusion,
    build_alarm_whitelist,
    build_security_whitelist,
    validate_risco_zone_pair,
)
from .modules.layout import LAYOUT_CONTEXTS, LAYOUT_VIEWS, layout_favorite_entity_ids, layout_write_allowed, reset_layout, update_layout_view

_LOGGER = logging.getLogger(__name__)


def _data(hass: HomeAssistant) -> dict[str, Any]:
    return hass.data[DOMAIN]


def _user_key(connection: Any) -> str:
    return str(connection.user.id)


def _require_admin(connection: Any, msg: dict[str, Any]) -> bool:
    if connection.user is not None and connection.user.is_admin:
        return True
    connection.send_error(
        msg["id"], "unauthorized", "Funzione riservata agli amministratori"
    )
    return False


def _context(connection: Any, msg: dict[str, Any]) -> Any:
    return connection.context(msg) if hasattr(connection, "context") else None


def async_register_commands(hass: HomeAssistant, version: str) -> None:
    """Register all CL Control commands once during integration setup."""

    @websocket_api.websocket_command(
        {vol.Required("type"): "cl_control/bootstrap/get"}
    )
    @websocket_api.async_response
    async def ws_get_bootstrap(hass, connection, msg):
        data = _data(hass)
        connection.send_result(
            msg["id"],
            build_bootstrap(
                data[DATA_SETTINGS], data[DATA_RUNTIME], version
            ),
        )

    @websocket_api.websocket_command({vol.Required("type"): "cl_control/config/get"})
    @websocket_api.async_response
    async def ws_get_config(hass, connection, msg):
        connection.send_result(
            msg["id"], runtime_to_frontend(_data(hass)[DATA_RUNTIME])
        )

    @websocket_api.websocket_command(
        {vol.Required("type"): "cl_control/dashboard/native_config"}
    )
    @websocket_api.async_response
    async def ws_get_native_dashboard(hass, connection, msg):
        data = _data(hass)
        service = data.get(DATA_NATIVE_DASHBOARD)
        if service is None:
            connection.send_error(
                msg["id"], "not_ready", "Dashboard nativa CL Control non disponibile"
            )
            return
        connection.send_result(
            msg["id"],
            await service.async_get_payload(
                settings=data[DATA_SETTINGS],
                runtime=data[DATA_RUNTIME],
            ),
        )

    @websocket_api.websocket_command(
        {
            vol.Required("type"): "cl_control/config/set",
            vol.Required("config"): dict,
        }
    )
    @websocket_api.async_response
    async def ws_set_config(hass, connection, msg):
        if not _require_admin(connection, msg):
            return
        data = _data(hass)
        user_key = _user_key(connection)
        if not data[DATA_INSTALLER_SESSIONS].active(user_key):
            connection.send_error(
                msg["id"], "unauthorized", "Modalita installatore non attiva"
            )
            return
        runtime = migrate_runtime_config(msg["config"])
        # Customer UI saves must never overwrite backend-only assistance history.
        runtime["assistance"] = migrate_runtime_config(data[DATA_RUNTIME])[
            "assistance"
        ]
        data[DATA_RUNTIME] = runtime
        await data[DATA_STORE].async_save(runtime)
        if data.get(DATA_NATIVE_DASHBOARD) is not None:
            data[DATA_NATIVE_DASHBOARD].invalidate()
        branding_manager = data.get(DATA_BRANDING_MANAGER)
        if branding_manager is not None:
            await branding_manager.async_apply(runtime)
        entry = data.get(DATA_CONFIG_ENTRY)
        if entry is not None:
            options = sync_options_from_runtime(dict(entry.options), runtime)
            if options != dict(entry.options):
                hass.config_entries.async_update_entry(entry, options=options)
        connection.send_result(msg["id"], runtime_to_frontend(runtime))

    @websocket_api.websocket_command(
        {
            vol.Required("type"): "cl_control/layout/set",
            vol.Required("context"): vol.In(LAYOUT_CONTEXTS),
            vol.Required("view"): vol.In(LAYOUT_VIEWS),
            vol.Required("cards"): dict,
        }
    )
    @websocket_api.async_response
    async def ws_set_layout(hass, connection, msg):
        if not _require_admin(connection, msg):
            return
        data = _data(hass)
        if not layout_write_allowed(True, data[DATA_INSTALLER_SESSIONS].active(_user_key(connection))):
            connection.send_error(msg["id"], "unauthorized", "Modalita installatore non attiva")
            return
        runtime = migrate_runtime_config(data[DATA_RUNTIME])
        runtime["customer_ui"]["layout"] = update_layout_view(
            runtime["customer_ui"].get("layout"), msg["context"], msg["view"], msg["cards"]
        )
        data[DATA_RUNTIME] = runtime
        await data[DATA_STORE].async_save(runtime)
        connection.send_result(msg["id"], runtime["customer_ui"]["layout"])

    @websocket_api.websocket_command(
        {
            vol.Required("type"): "cl_control/layout/reset",
            vol.Required("context"): vol.In(LAYOUT_CONTEXTS),
            vol.Optional("view"): vol.In(LAYOUT_VIEWS),
        }
    )
    @websocket_api.async_response
    async def ws_reset_layout(hass, connection, msg):
        if not _require_admin(connection, msg):
            return
        data = _data(hass)
        if not layout_write_allowed(True, data[DATA_INSTALLER_SESSIONS].active(_user_key(connection))):
            connection.send_error(msg["id"], "unauthorized", "Modalita installatore non attiva")
            return
        runtime = migrate_runtime_config(data[DATA_RUNTIME])
        preserved_favorites = layout_favorite_entity_ids(
            runtime["customer_ui"].get("layout"), msg["context"], msg.get("view")
        )
        if preserved_favorites:
            runtime["customer_ui"]["favorites"] = list(dict.fromkeys([
                *runtime["customer_ui"].get("favorites", []), *sorted(preserved_favorites)
            ]))[:500]
        runtime["customer_ui"]["layout"] = reset_layout(
            runtime["customer_ui"].get("layout"), msg["context"], msg.get("view")
        )
        data[DATA_RUNTIME] = runtime
        await data[DATA_STORE].async_save(runtime)
        connection.send_result(msg["id"], runtime["customer_ui"]["layout"])

    @websocket_api.websocket_command(
        {
            vol.Required("type"): "cl_control/favorites/set",
            vol.Required("favorites"): [str],
        }
    )
    @websocket_api.async_response
    async def ws_set_favorites(hass, connection, msg):
        data = _data(hass)
        runtime = migrate_runtime_config(data[DATA_RUNTIME])
        favorites = list(dict.fromkeys(msg["favorites"]))[:500]
        runtime["customer_ui"]["favorites"] = favorites
        data[DATA_RUNTIME] = runtime
        await data[DATA_STORE].async_save(runtime)
        if data.get(DATA_NATIVE_DASHBOARD) is not None:
            data[DATA_NATIVE_DASHBOARD].invalidate()
        connection.send_result(msg["id"], favorites)

    @websocket_api.websocket_command(
        {
            vol.Required("type"): "cl_control/installer/unlock",
            vol.Required("pin"): str,
        }
    )
    @websocket_api.async_response
    async def ws_unlock_installer(hass, connection, msg):
        if not _require_admin(connection, msg):
            return
        data = _data(hass)
        user_key = _user_key(connection)
        limiter = data[DATA_INSTALLER_LIMITER]
        retry_after = limiter.retry_after(user_key)
        if retry_after:
            connection.send_result(
                msg["id"], {"unlocked": False, "retry_after": retry_after}
            )
            return
        entered = str(msg.get("pin") or "")
        credential = data.get(DATA_CREDENTIALS, {}).get("installer_pin")
        expected = data[DATA_SETTINGS]["installer"]["pin"]
        valid = (
            await async_verify_pin(hass, entered, credential)
            if credential
            else secrets.compare_digest(entered, expected)
        )
        if valid:
            limiter.record_success(user_key)
            data[DATA_INSTALLER_SESSIONS].unlock(user_key)
            minutes = data[DATA_SETTINGS]["installer"]["session_minutes"]
            connection.send_result(
                msg["id"], {"unlocked": True, "minutes": minutes}
            )
            return
        retry_after = limiter.record_failure(user_key)
        connection.send_result(
            msg["id"], {"unlocked": False, "retry_after": retry_after}
        )

    @websocket_api.websocket_command(
        {vol.Required("type"): "cl_control/installer/lock"}
    )
    @websocket_api.async_response
    async def ws_lock_installer(hass, connection, msg):
        if not _require_admin(connection, msg):
            return
        _data(hass)[DATA_INSTALLER_SESSIONS].lock(_user_key(connection))
        connection.send_result(msg["id"], {"unlocked": False})

    @websocket_api.websocket_command(
        {vol.Required("type"): "cl_control/installer/status"}
    )
    @websocket_api.async_response
    async def ws_installer_status(hass, connection, msg):
        if not _require_admin(connection, msg):
            return
        data = _data(hass)
        user_key = _user_key(connection)
        connection.send_result(
            msg["id"],
            {
                "unlocked": data[DATA_INSTALLER_SESSIONS].active(user_key),
                "retry_after": data[DATA_INSTALLER_LIMITER].retry_after(user_key),
            },
        )

    async def _validate_security_pin(hass, connection, msg) -> bool:
        data = _data(hass)
        user_key = _user_key(connection)
        limiter = data[DATA_SECURITY_LIMITER]
        retry_after = limiter.retry_after(user_key)
        if retry_after:
            connection.send_error(
                msg["id"], "rate_limited", f"Riprova tra {retry_after} secondi"
            )
            return False
        expected = data[DATA_SETTINGS]["security"]["pin"]
        credential = data.get(DATA_CREDENTIALS, {}).get("security_pin")
        if not expected and not credential:
            connection.send_error(
                msg["id"], "not_configured", "PIN sicurezza non configurato"
            )
            return False
        try:
            valid = (
                await async_verify_pin(hass, str(msg["pin"]), credential)
                if credential
                else secrets.compare_digest(str(msg["pin"]), expected)
            )
        except Exception as err:
            _LOGGER.exception("CL Control security PIN verification failed: %s", err)
            connection.send_error(
                msg["id"],
                "security_validation_error",
                "Impossibile verificare il Codice Sicurezza",
            )
            return False
        if valid:
            limiter.record_success(user_key)
            return True
        retry_after = limiter.record_failure(user_key)
        message = (
            f"Codice non valido; riprova tra {retry_after} secondi"
            if retry_after
            else "Codice non valido"
        )
        connection.send_error(msg["id"], "invalid_auth", message)
        return False

    @websocket_api.websocket_command(
        {
            vol.Required("type"): "cl_control/assistance/prepare",
            vol.Required("category"): str,
            vol.Required("description"): str,
            vol.Required("occurred_at"): str,
            vol.Optional("entity_id", default=""): str,
            vol.Optional("module", default=""): str,
            vol.Optional("severity", default="info"): vol.In(
                ["info", "warning", "critical"]
            ),
            vol.Optional("diagnostic_consent", default=False): bool,
        }
    )
    @websocket_api.async_response
    async def ws_prepare_assistance(hass, connection, msg):
        data = _data(hass)
        provider = data[DATA_SETTINGS]["assistance"]["provider"]
        assistance = data[DATA_SETTINGS]["assistance"]
        if provider == "openai" and not assistance.get("fallback_whatsapp"):
            connection.send_error(
                msg["id"], "provider_unavailable", "Provider assistenza non disponibile"
            )
            return
        snapshot_id = reserve_diagnostic_snapshot_id(
            bool(assistance.get("diagnostics", {}).get("enabled")),
            bool(msg["diagnostic_consent"]),
        )
        request = prepare_whatsapp_request(
            site=data[DATA_RUNTIME]["site"],
            assistance=assistance,
            category=msg["category"],
            description=msg["description"],
            occurred_at=msg["occurred_at"],
            entity_id=msg["entity_id"],
            module=msg["module"],
            severity=msg["severity"],
            diagnostic_snapshot_id=snapshot_id,
            diagnostic_consent=msg["diagnostic_consent"],
        )
        ticketing = assistance.get("ticketing", {})
        if ticketing.get("enabled", True):
            persist_request(
                data[DATA_RUNTIME],
                request,
                ticketing.get("max_persisted_requests", 200),
            )
            await data[DATA_STORE].async_save(data[DATA_RUNTIME])
        connection.send_result(
            msg["id"],
            {
                key: request[key]
                for key in (
                    "provider",
                    "status",
                    "ticket_id",
                    "message",
                    "url",
                    "customer_data",
                )
            },
        )

    @websocket_api.websocket_command(
        {
            vol.Required("type"): "cl_control/assistance/request/status",
            vol.Required("ticket_id"): str,
            vol.Required("status"): vol.In(["new", "in_progress", "resolved"]),
        }
    )
    @websocket_api.async_response
    async def ws_assistance_request_status(hass, connection, msg):
        if not _require_admin(connection, msg):
            return
        data = _data(hass)
        if not data[DATA_INSTALLER_SESSIONS].active(_user_key(connection)):
            connection.send_error(
                msg["id"], "unauthorized", "Modalita installatore non attiva"
            )
            return
        request = update_request_status(
            data[DATA_RUNTIME], msg["ticket_id"], msg["status"]
        )
        if request is None:
            connection.send_error(msg["id"], "not_found", "Ticket non trovato")
            return
        await data[DATA_STORE].async_save(data[DATA_RUNTIME])
        connection.send_result(msg["id"], request)

    @websocket_api.websocket_command(
        {vol.Required("type"): "cl_control/assistance/requests/get"}
    )
    @websocket_api.async_response
    async def ws_assistance_requests(hass, connection, msg):
        if not _require_admin(connection, msg):
            return
        data = _data(hass)
        if not data[DATA_INSTALLER_SESSIONS].active(_user_key(connection)):
            connection.send_error(
                msg["id"], "unauthorized", "Modalita installatore non attiva"
            )
            return
        requests = data[DATA_RUNTIME].get("assistance", {}).get("requests", [])
        connection.send_result(msg["id"], list(reversed(requests[-200:])))

    @websocket_api.websocket_command(
        {
            vol.Required("type"): "cl_control/assistance/ai/message",
            vol.Required("conversation_id"): str,
            vol.Required("message"): str,
            vol.Optional("severity", default="info"): vol.In(
                ["info", "warning", "critical"]
            ),
            vol.Optional("entity_id", default=""): str,
            vol.Optional("module", default=""): str,
            vol.Optional("ticket_id", default=""): str,
        }
    )
    @websocket_api.async_response
    async def ws_assistance_ai_message(hass, connection, msg):
        """Optional mock gateway; enablement gates guarantee zero idle API calls."""
        data = _data(hass)
        site = data[DATA_RUNTIME]["site"]
        result = await data[DATA_ASSISTANCE_GATEWAY].assist(
            site_id=str(site.get("site_id") or site.get("site_name") or "site"),
            conversation_id=msg["conversation_id"][:128],
            message=msg["message"],
            severity=msg["severity"],
            context={
                "entity_id": msg["entity_id"][:128],
                "module": msg["module"][:80],
            },
        )
        technical_summary = result.pop("technical_summary", "")
        if result.get("escalate") and msg["ticket_id"]:
            result["whatsapp_escalation"] = prepare_escalation_whatsapp(
                site=site,
                ticket_id=msg["ticket_id"],
                technical_summary=technical_summary
                or "Assistenza AI non conclusiva",
            )
        connection.send_result(msg["id"], result)

    @websocket_api.websocket_command(
        {vol.Required("type"): "cl_control/assistance/telemetry/get"}
    )
    @websocket_api.async_response
    async def ws_assistance_telemetry(hass, connection, msg):
        if not _require_admin(connection, msg):
            return
        data = _data(hass)
        if not data[DATA_INSTALLER_SESSIONS].active(_user_key(connection)):
            connection.send_error(
                msg["id"], "unauthorized", "Modalita installatore non attiva"
            )
            return
        site = data[DATA_RUNTIME]["site"]
        site_id = str(site.get("site_id") or site.get("site_name") or "site")
        connection.send_result(
            msg["id"], data[DATA_ASSISTANCE_GATEWAY].telemetry(site_id)
        )

    @websocket_api.websocket_command(
        {vol.Required("type"): "cl_control/security/pin/status"}
    )
    @websocket_api.async_response
    async def ws_security_pin_status(hass, connection, msg):
        if not _require_admin(connection, msg):
            return
        data = _data(hass)
        if not data[DATA_INSTALLER_SESSIONS].active(_user_key(connection)):
            connection.send_error(
                msg["id"], "unauthorized", "Modalita installatore non attiva"
            )
            return
        credential = data.get(DATA_CREDENTIALS, {}).get("security_pin")
        legacy = str(data[DATA_SETTINGS].get("security", {}).get("pin") or "")
        connection.send_result(msg["id"], {"configured": bool(credential or legacy)})

    @websocket_api.websocket_command(
        {
            vol.Required("type"): "cl_control/security/pin/set",
            vol.Required("pin"): str,
        }
    )
    @websocket_api.async_response
    async def ws_security_pin_set(hass, connection, msg):
        if not _require_admin(connection, msg):
            return
        data = _data(hass)
        user_key = _user_key(connection)
        if not data[DATA_INSTALLER_SESSIONS].active(user_key):
            connection.send_error(
                msg["id"], "unauthorized", "Modalita installatore non attiva"
            )
            return
        pin = str(msg.get("pin") or "")
        if not pin.isdigit() or not 4 <= len(pin) <= 12:
            connection.send_error(
                msg["id"],
                "invalid_pin_format",
                "Usa un PIN numerico da 4 a 12 cifre",
            )
            return
        entry = data.get(DATA_CONFIG_ENTRY)
        installation_id = str(
            getattr(entry, "data", {}).get(CONF_INSTALLATION_ID) if entry else ""
        )
        if not installation_id:
            connection.send_error(
                msg["id"], "not_ready", "Identificativo installazione non disponibile"
            )
            return
        record = await data[DATA_CREDENTIAL_STORE].async_set_pin(
            installation_id, "security_pin", pin
        )
        data.setdefault(DATA_CREDENTIALS, {})["security_pin"] = record
        data[DATA_SECURITY_LIMITER].record_success(user_key)
        if data.get(DATA_NATIVE_DASHBOARD) is not None:
            data[DATA_NATIVE_DASHBOARD].invalidate()
        connection.send_result(msg["id"], {"configured": True})

    @websocket_api.websocket_command(
        {
            vol.Required("type"): "cl_control/security/alarm_command",
            vol.Required("pin"): str,
            vol.Required("entity_id"): str,
            vol.Required("command"): vol.In(sorted(ALARM_COMMAND_SERVICES)),
        }
    )
    @websocket_api.async_response
    async def ws_alarm_command(hass, connection, msg):
        if not await _validate_security_pin(hass, connection, msg):
            return
        data = _data(hass)
        security = data[DATA_SETTINGS]["security"]
        entity_id = str(msg["entity_id"])
        allowed = build_alarm_whitelist(hass.states.async_entity_ids(), security)
        if entity_id not in allowed:
            connection.send_error(
                msg["id"], "not_allowed", "Pannello allarme non autorizzato"
            )
            return
        try:
            result = await async_alarm_command(
                hass, entity_id, str(msg["command"]), _context(connection, msg)
            )
        except Exception as err:
            _LOGGER.exception(
                "CL Control alarm service failed: entity=%s command=%s error=%s",
                entity_id,
                msg["command"],
                err,
            )
            connection.send_error(
                msg["id"],
                "service_error",
                f"Home Assistant non ha eseguito il comando allarme: {type(err).__name__}",
            )
            return
        connection.send_result(msg["id"], {"success": True, **result})

    @websocket_api.websocket_command(
        {
            vol.Required("type"): "cl_control/security/partition_command",
            vol.Required("pin"): str,
            vol.Required("mode"): str,
            vol.Required("entity_ids"): [str],
        }
    )
    @websocket_api.async_response
    async def ws_partition_command(hass, connection, msg):
        if not await _validate_security_pin(hass, connection, msg):
            return
        security = _data(hass)[DATA_SETTINGS]["security"]
        mode = str(msg["mode"]).upper()
        requested = set(msg["entity_ids"])
        partitions, _ = build_security_whitelist(hass.states.async_entity_ids(), security)
        if (
            not requested
            or not requested.issubset(partitions)
            or mode not in security["partition_modes"]
        ):
            connection.send_error(
                msg["id"], "not_allowed", "Comando sicurezza non autorizzato"
            )
            return
        await async_set_partition_mode(
            hass, sorted(requested), mode, _context(connection, msg)
        )
        connection.send_result(msg["id"], {"success": True})

    @websocket_api.websocket_command(
        {
            vol.Required("type"): "cl_control/security/zone_exclusion",
            vol.Optional("pin"): str,
            vol.Optional("zone_entity_id"): str,
            vol.Required("entity_id"): str,
            vol.Required("excluded"): bool,
        }
    )
    @websocket_api.async_response
    async def ws_zone_exclusion(hass, connection, msg):
        security = _data(hass)[DATA_SETTINGS]["security"]
        entity_id = msg["entity_id"]
        zone_entity_id = str(msg.get("zone_entity_id") or "")
        if INIM_ZONE_RE.fullmatch(entity_id):
            if not await _validate_security_pin(hass, connection, msg):
                return
            _, zones = build_security_whitelist(hass.states.async_entity_ids(), security)
            authorized = entity_id in zones
            reason = "authorized" if authorized else "switch_not_whitelisted"
        else:
            registry = er.async_get(hass)
            zone_entry = registry.async_get(zone_entity_id)
            switch_entry = registry.async_get(entity_id)
            authorized, reason = validate_risco_zone_pair(
                zone_entity_id,
                entity_id,
                hass.states.async_entity_ids(),
                security,
                {
                    "platform": getattr(zone_entry, "platform", ""),
                    "device_id": getattr(zone_entry, "device_id", ""),
                },
                {
                    "platform": getattr(switch_entry, "platform", ""),
                    "device_id": getattr(switch_entry, "device_id", ""),
                },
            )
        if not authorized:
            _LOGGER.warning(
                "CL Control rejected zone command: zone=%s switch=%s reason=%s",
                zone_entity_id,
                entity_id,
                reason,
            )
            connection.send_error(
                msg["id"], "not_allowed", "Zona sicurezza non autorizzata"
            )
            return
        excluded = bool(msg["excluded"])
        try:
            result = await async_set_zone_exclusion(
                hass,
                entity_id,
                excluded,
                _context(connection, msg),
            )
        except Exception as err:  # Home Assistant supplies the technical exception.
            _LOGGER.exception(
                "CL Control zone service failed: zone=%s switch=%s service=%s error=%s",
                zone_entity_id,
                entity_id,
                "switch.turn_on" if excluded else "switch.turn_off",
                err,
            )
            connection.send_error(
                msg["id"],
                "service_error",
                "Home Assistant non ha eseguito il comando sulla zona",
            )
            return
        if result["confirmed"] is False:
            _LOGGER.warning(
                "CL Control zone state not confirmed: zone=%s switch=%s service=%s before=%s after=%s target=%s",
                zone_entity_id,
                entity_id,
                result["service"],
                result["previous_state"],
                result["state"],
                result["target_state"],
            )
            connection.send_error(
                msg["id"],
                "state_not_confirmed",
                "La zona non ha confermato il nuovo stato",
            )
            return
        connection.send_result(msg["id"], {"success": True, **result})

    for command in (
        ws_get_bootstrap,
        ws_get_config,
        ws_get_native_dashboard,
        ws_set_config,
        ws_set_layout,
        ws_reset_layout,
        ws_set_favorites,
        ws_unlock_installer,
        ws_lock_installer,
        ws_installer_status,
        ws_prepare_assistance,
        ws_assistance_request_status,
        ws_assistance_requests,
        ws_assistance_ai_message,
        ws_assistance_telemetry,
        ws_security_pin_status,
        ws_security_pin_set,
        ws_alarm_command,
        ws_partition_command,
        ws_zone_exclusion,
    ):
        websocket_api.async_register_command(hass, command)

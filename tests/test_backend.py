"""Minimum regression tests for CL Control's pure backend contracts."""

from __future__ import annotations

import importlib
from pathlib import Path
import sys
import types
import unittest


ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / "custom_components" / "cl_control"

# Load pure modules without importing Home Assistant dependent __init__.py.
package = types.ModuleType("cl_control")
package.__path__ = [str(PACKAGE)]
sys.modules.setdefault("cl_control", package)

models = importlib.import_module("cl_control.models")
assistance = importlib.import_module("cl_control.modules.assistance")
ai_provider = importlib.import_module("cl_control.modules.ai_provider")
assistance_gateway = importlib.import_module("cl_control.modules.assistance_gateway")
installer = importlib.import_module("cl_control.modules.installer")
security = importlib.import_module("cl_control.modules.security")
layout = importlib.import_module("cl_control.modules.layout")


class MigrationTests(unittest.TestCase):
    def test_flat_transitional_schema_is_migrated_without_data_loss(self):
        value = {
            "schema_version": 2,
            "theme": "cl_light",
            "favorites": ["light.cucina"],
            "support": {"site_name": "DEMO", "whatsapp": "+39 123"},
        }
        migrated = models.migrate_runtime_config(value)
        self.assertEqual(migrated["customer_ui"]["theme"], "cl_light")
        self.assertEqual(migrated["customer_ui"]["favorites"], ["light.cucina"])
        self.assertEqual(migrated["site"]["site_name"], "DEMO")

    def test_bootstrap_never_exposes_pins(self):
        settings = models.normalize_settings(
            {"installer": {"pin": "1234"}, "security": {"pin": "9876"}}
        )
        bootstrap = models.build_bootstrap(settings, {}, "3.3.0-dev")
        rendered = repr(bootstrap)
        self.assertNotIn("1234", rendered)
        self.assertNotIn("9876", rendered)
        self.assertNotIn("installer", bootstrap)
        self.assertNotIn("security", bootstrap)

    def test_nested_migration_preserves_assistance_requests(self):
        value = {
            "schema_version": 2,
            "customer_ui": {},
            "site": {},
            "assistance": {"requests": [{"ticket_id": "CLA-ONE"}]},
        }
        migrated = models.migrate_runtime_config(value)
        self.assertEqual(
            migrated["assistance"]["requests"][0]["ticket_id"], "CLA-ONE"
        )

    def test_legacy_runtime_receives_empty_versioned_layout(self):
        migrated = models.migrate_runtime_config({"favorites": ["light.cucina"]})
        self.assertEqual(migrated["customer_ui"]["layout"], layout.empty_layout())


class LayoutTests(unittest.TestCase):
    def test_customers_are_read_only_and_admin_needs_installer_session(self):
        self.assertFalse(layout.layout_write_allowed(False, False))
        self.assertFalse(layout.layout_write_allowed(False, True))
        self.assertFalse(layout.layout_write_allowed(True, False))
        self.assertTrue(layout.layout_write_allowed(True, True))

    def test_validation_discards_unknowns_and_clamps_capabilities(self):
        normalized = layout.normalize_layout({
            "layout_schema_version": 999,
            "base": {"home": {
                "home:module:lights": {
                    "type": "light", "order": "4", "size": "xl", "span": 99,
                    "shape": "wide", "icon": "javascript:bad", "show_icon": False,
                    "show_title": False, "secret": "ignored",
                },
                "../bad": {"type": "module"},
            }, "unknown": {"x": {}}},
            "desktop": {"home": {}},
        })
        card = normalized["base"]["home"]["home:module:lights"]
        self.assertEqual(normalized["layout_schema_version"], 1)
        self.assertEqual(card["size"], "s")
        self.assertEqual(card["span"], 4)
        self.assertEqual(card["shape"], "compact")
        self.assertTrue(card["show_title"])
        self.assertNotIn("icon", card)
        self.assertNotIn("secret", card)
        self.assertNotIn("desktop", normalized)

    def test_update_and_scoped_reset_preserve_other_views(self):
        value = layout.update_layout_view({}, "base", "home", {
            "home:status": {"type": "status", "order": 1, "size": "l"}
        })
        value = layout.update_layout_view(value, "mobile", "lights", {
            "lights:entity:light.cucina": {"type": "light", "order": 2}
        })
        reset = layout.reset_layout(value, "mobile", "lights")
        self.assertIn("home:status", reset["base"]["home"])
        self.assertNotIn("lights", reset["mobile"])

    def test_device_override_keeps_only_explicit_fields(self):
        value = layout.normalize_layout({
            "mobile": {"home": {"home:status": {"type": "status", "size": "m"}}}
        })
        self.assertEqual(value["mobile"]["home"]["home:status"], {"type": "status", "size": "m"})

    def test_invalid_scope_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "invalid_layout_scope"):
            layout.update_layout_view({}, "desktop", "home", {})


class RateLimitTests(unittest.TestCase):
    def test_lockout_and_expiry(self):
        now = [100.0]
        limiter = installer.PinRateLimiter(2, 60, 30, clock=lambda: now[0])
        self.assertEqual(limiter.record_failure("user"), 0)
        self.assertEqual(limiter.record_failure("user"), 30)
        now[0] += 31
        self.assertEqual(limiter.retry_after("user"), 0)

    def test_success_clears_failures_without_storing_pin(self):
        limiter = installer.PinRateLimiter(2, 60, 30)
        limiter.record_failure("user")
        limiter.record_success("user")
        self.assertEqual(limiter.retry_after("user"), 0)
        self.assertFalse(any("pin" in key.lower() for key in vars(limiter)))


class SecurityTests(unittest.TestCase):
    def test_discovery_and_explicit_whitelist_are_both_enforced(self):
        states = {
            "select.partition_house_mode",
            "select.not_a_partition",
            "switch.zone_kitchen_exclusion",
            "switch.bar_serranda_bypassato",
            "switch.router_bypassato-extra",
            "switch.zone_bad-exclusion",
        }
        partitions, zones = security.build_security_whitelist(
            states,
            {
                "allowed_partition_entity_ids": ["select.partition_house_mode"],
                "allowed_zone_entity_ids": [
                    "switch.zone_kitchen_exclusion",
                    "switch.bar_serranda_bypassato",
                ],
            },
        )
        self.assertEqual(partitions, {"select.partition_house_mode"})
        self.assertEqual(
            zones,
            {"switch.zone_kitchen_exclusion", "switch.bar_serranda_bypassato"},
        )

    def test_risco_pair_requires_same_device_and_risco_platform(self):
        states = {
            "binary_sensor.bar_serranda",
            "switch.bar_serranda_bypassato",
            "switch.generic_bypassato",
        }
        allowed, reason = security.validate_risco_zone_pair(
            "binary_sensor.bar_serranda",
            "switch.bar_serranda_bypassato",
            states,
            security.DEFAULT_CONFIG,
            {"platform": "risco", "device_id": "risco-zone-1"},
            {"platform": "risco", "device_id": "risco-zone-1"},
        )
        self.assertTrue(allowed)
        self.assertEqual(reason, "authorized")

        allowed, reason = security.validate_risco_zone_pair(
            "binary_sensor.bar_serranda",
            "switch.generic_bypassato",
            states,
            security.DEFAULT_CONFIG,
            {"platform": "risco", "device_id": "risco-zone-1"},
            {"platform": "demo", "device_id": "risco-zone-1"},
        )
        self.assertFalse(allowed)
        self.assertEqual(reason, "integration_not_risco")

        allowed, reason = security.validate_risco_zone_pair(
            "binary_sensor.bar_serranda",
            "switch.bar_serranda_bypassato",
            states,
            security.DEFAULT_CONFIG,
            {"platform": "risco", "device_id": "risco-zone-1"},
            {"platform": "risco", "device_id": "other-device"},
        )
        self.assertFalse(allowed)
        self.assertEqual(reason, "device_mismatch")


class SecurityDispatchTests(unittest.IsolatedAsyncioTestCase):
    async def test_risco_bypass_uses_standard_switch_services(self):
        calls = []
        states = {
            "switch.bar_serranda_bypassato": types.SimpleNamespace(state="off")
        }

        class Services:
            async def async_call(
                self, domain, service, data, *, blocking, context=None
            ):
                calls.append((domain, service, data, blocking, context))
                states[data["entity_id"]].state = "on" if service == "turn_on" else "off"

        hass = types.SimpleNamespace(services=Services(), states=states)
        excluded = await security.async_set_zone_exclusion(
            hass, "switch.bar_serranda_bypassato", True, "context", state_timeout=0
        )
        included = await security.async_set_zone_exclusion(
            hass, "switch.bar_serranda_bypassato", False, "context", state_timeout=0
        )
        self.assertEqual(
            calls,
            [
                (
                    "switch",
                    "turn_on",
                    {"entity_id": "switch.bar_serranda_bypassato"},
                    True,
                    "context",
                ),
                (
                    "switch",
                    "turn_off",
                    {"entity_id": "switch.bar_serranda_bypassato"},
                    True,
                    "context",
                ),
            ],
        )
        self.assertEqual(excluded["previous_state"], "off")
        self.assertEqual(excluded["state"], "on")
        self.assertTrue(excluded["confirmed"])
        self.assertEqual(included["previous_state"], "on")
        self.assertEqual(included["state"], "off")
        self.assertTrue(included["confirmed"])

    async def test_service_error_is_not_swallowed(self):
        class Services:
            async def async_call(self, *args, **kwargs):
                raise RuntimeError("Risco transport failed")

        hass = types.SimpleNamespace(
            services=Services(),
            states={
                "switch.bar_serranda_bypassato": types.SimpleNamespace(state="off")
            },
        )
        with self.assertRaisesRegex(RuntimeError, "Risco transport failed"):
            await security.async_set_zone_exclusion(
                hass,
                "switch.bar_serranda_bypassato",
                True,
                state_timeout=0,
            )


class AssistanceTests(unittest.TestCase):
    def _request(self, **overrides):
        arguments = {
            "site": {
                "site_name": "DEMO",
                "support": {"whatsapp": "+39 333 0000000"},
            },
            "assistance": {
                **assistance.DEFAULT_CONFIG,
                "diagnostics": {
                    "enabled": True,
                    "allowed_fields": [],
                    "require_customer_consent": True,
                },
            },
            "category": "Sicurezza",
            "description": "anomalia token=test-only-token password:test-only-password PIN=test-only-pin",
            "occurred_at": "2026-08-30T16:00:00+02:00",
        }
        arguments.update(overrides)
        return assistance.prepare_whatsapp_request(**arguments)

    def test_customer_message_is_redacted_and_snapshot_is_technical_only(self):
        request = self._request(
            diagnostic_snapshot_id="snapshot_42",
            diagnostic_consent=True,
        )
        self.assertNotIn("test-only-token", request["message"])
        self.assertNotIn("test-only-password", request["message"])
        self.assertNotIn("test-only-pin", request["message"])
        self.assertNotIn("snapshot_42", request["message"])
        self.assertEqual(
            request["technical_data"]["diagnostic_snapshot_id"], "snapshot_42"
        )

    def test_snapshot_requires_explicit_consent(self):
        request = self._request(
            diagnostic_snapshot_id="snapshot_42",
            diagnostic_consent=False,
        )
        self.assertEqual(request["technical_data"]["diagnostic_snapshot_id"], "")

    def test_critical_escalates_without_automatic_troubleshooting(self):
        request = self._request(severity="critical")
        technical = request["technical_data"]
        self.assertTrue(technical["immediate_escalation"])
        self.assertFalse(technical["automatic_troubleshooting"])

    def test_ticket_persistence_status_and_bounded_history(self):
        runtime = {}
        first = self._request(ticket_id="CLA-FIRST")
        second = self._request(ticket_id="CLA-SECOND")
        assistance.persist_request(runtime, first, max_requests=1)
        assistance.persist_request(runtime, second, max_requests=1)
        self.assertEqual(
            [item["ticket_id"] for item in runtime["assistance"]["requests"]],
            ["CLA-SECOND"],
        )
        updated = assistance.update_request_status(
            runtime, "CLA-SECOND", "in_progress"
        )
        self.assertEqual(updated["status"], "in_progress")
        self.assertIsNone(
            assistance.update_request_status(runtime, "CLA-SECOND", "invalid")
        )

    def test_snapshot_id_is_opaque_and_requires_consent(self):
        self.assertEqual(assistance.reserve_diagnostic_snapshot_id(True, False), "")
        snapshot_id = assistance.reserve_diagnostic_snapshot_id(True, True)
        self.assertRegex(snapshot_id, r"^diag_[a-f0-9]{32}$")

    def test_escalation_summary_is_redacted(self):
        result = assistance.prepare_escalation_whatsapp(
            site={
                "site_name": "DEMO",
                "support": {"whatsapp": "+39 333 0000000"},
            },
            ticket_id="CLA-TEST",
            technical_summary="errore token=secret-value",
        )
        self.assertIn("CLA-TEST", result["message"])
        self.assertNotIn("secret-value", result["message"])


class AssistanceGatewayTests(unittest.IsolatedAsyncioTestCase):
    def _config(self, **overrides):
        config = {
            **assistance.DEFAULT_CONFIG,
            "provider": "hybrid",
            "ai_enabled": True,
            "ai_provider": "mock",
            "limits": {
                **assistance.DEFAULT_CONFIG["limits"],
                "monthly_budget_eur": 1.0,
                "estimated_max_request_cost_eur": 0.10,
            },
        }
        config.update(overrides)
        return config

    async def test_disabled_ai_never_calls_provider(self):
        provider = ai_provider.MockAIProvider()
        gateway = assistance_gateway.AssistanceGateway(
            self._config(ai_enabled=False), provider
        )
        result = await gateway.assist(
            site_id="demo", conversation_id="one", message="Problema"
        )
        self.assertEqual(result["status"], "disabled")
        self.assertEqual(provider.call_count, 0)

    async def test_critical_never_calls_provider(self):
        provider = ai_provider.MockAIProvider()
        gateway = assistance_gateway.AssistanceGateway(self._config(), provider)
        result = await gateway.assist(
            site_id="demo",
            conversation_id="one",
            message="Allarme",
            severity="critical",
        )
        self.assertEqual(result["status"], "critical_escalation")
        self.assertEqual(provider.call_count, 0)

    async def test_openai_placeholder_is_blocked_before_provider_call(self):
        provider = ai_provider.MockAIProvider()
        gateway = assistance_gateway.AssistanceGateway(
            self._config(ai_provider="openai"), provider
        )
        result = await gateway.assist(
            site_id="demo", conversation_id="one", message="Problema"
        )
        self.assertEqual(result["status"], "provider_disabled")
        self.assertEqual(provider.call_count, 0)

    async def test_monthly_budget_reserves_cost_and_blocks_next_call(self):
        response = ai_provider.AIResponse(
            text="mock",
            confidence=0.9,
            resolved=True,
            estimated_cost=0.06,
            model="mock-test",
        )
        provider = ai_provider.MockAIProvider(response=response)
        config = self._config(
            limits={
                **assistance.DEFAULT_CONFIG["limits"],
                "monthly_budget_eur": 0.10,
                "estimated_max_request_cost_eur": 0.05,
            }
        )
        gateway = assistance_gateway.AssistanceGateway(config, provider)
        first = await gateway.assist(
            site_id="demo", conversation_id="one", message="Uno"
        )
        second = await gateway.assist(
            site_id="demo", conversation_id="one", message="Due"
        )
        self.assertEqual(first["status"], "resolved")
        self.assertEqual(second["status"], "limit_reached")
        self.assertEqual(second["limit_reason"], "monthly_budget")
        self.assertEqual(provider.call_count, 1)
        self.assertAlmostEqual(gateway.telemetry("demo")["estimated_cost"], 0.06)


if __name__ == "__main__":
    unittest.main()

"""Smoke-test Config Entry lifecycle and legacy YAML import scheduling."""

from __future__ import annotations

import importlib
from pathlib import Path
import sys
import types
from types import MappingProxyType
import unittest
from unittest.mock import AsyncMock, Mock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

# Reuse the comprehensive Home Assistant fakes installed by test_config_entry.
support = importlib.import_module("test_config_entry")

aiohttp = types.ModuleType("aiohttp")
aiohttp_web = types.ModuleType("aiohttp.web")
aiohttp.web = aiohttp_web
sys.modules.setdefault("aiohttp", aiohttp)
sys.modules.setdefault("aiohttp.web", aiohttp_web)

components = types.ModuleType("homeassistant.components")
frontend = types.ModuleType("homeassistant.components.frontend")
frontend.DATA_PANELS = "frontend_panels"
frontend.async_register_built_in_panel = Mock()
frontend.async_remove_panel = Mock()
websocket_api = types.ModuleType("homeassistant.components.websocket_api")
websocket_api.websocket_command = lambda schema: (lambda func: func)
websocket_api.async_response = lambda func: func
websocket_api.require_admin = lambda func: func
websocket_api.async_register_command = Mock()
http = types.ModuleType("homeassistant.components.http")
http.StaticPathConfig = object
http.HomeAssistantView = object
entity_registry = types.ModuleType("homeassistant.helpers.entity_registry")
entity_registry.EVENT_ENTITY_REGISTRY_UPDATED = "entity_registry_updated"
entity_registry.async_get = lambda _hass: types.SimpleNamespace(
    async_get=lambda _entity_id: None
)
area_registry = types.ModuleType("homeassistant.helpers.area_registry")
area_registry.EVENT_AREA_REGISTRY_UPDATED = "area_registry_updated"
support.device_registry.EVENT_DEVICE_REGISTRY_UPDATED = "device_registry_updated"
exceptions = types.ModuleType("homeassistant.exceptions")
exceptions.ConfigEntryError = RuntimeError
components.frontend = frontend
components.websocket_api = websocket_api
sys.modules.update(
    {
        "homeassistant.components": components,
        "homeassistant.components.frontend": frontend,
        "homeassistant.components.websocket_api": websocket_api,
        "homeassistant.components.http": http,
        "homeassistant.helpers.entity_registry": entity_registry,
        "homeassistant.helpers.area_registry": area_registry,
        "homeassistant.exceptions": exceptions,
    }
)

support._ConfigEntry.async_on_unload = lambda self, callback: callback


class FakeBrandingManager:
    def __init__(self, hass, settings, version):
        self.hass = hass
        self.settings = settings
        self.version = version

    async def async_apply(self):
        return None

    async def async_restore(self, *, clear):
        return None


def _prepare_hass(hass):
    hass.bus = types.SimpleNamespace(async_listen=lambda *_args, **_kwargs: (lambda: None))
    hass.config = types.SimpleNamespace(components=set(), location_name="Home")
    return hass


class ComponentImportTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        support.issue_registry.issues.clear()
        support.issue_registry.deleted.clear()
        self.component = importlib.import_module("custom_components.cl_control")
        self.component.BrandingManager = FakeBrandingManager

    async def test_invalid_entry_stops_before_application_storage(self):
        component = self.component

        class ForbiddenStore:
            def __init__(self, _hass):
                raise AssertionError("application storage must not be opened")

        original = component.RuntimeStore
        component.RuntimeStore = ForbiddenStore
        hass = _prepare_hass(support._Hass())
        entry = support._ConfigEntry({"installation_id": "invalid"}, {})
        try:
            with self.assertRaisesRegex(RuntimeError, "incomplete or invalid"):
                await component.async_setup_entry(hass, entry)
            self.assertTrue(
                any(
                    args[2] == f"invalid_config_entry_{entry.entry_id}"
                    for args, _kwargs in support.issue_registry.issues
                )
            )
        finally:
            component.RuntimeStore = original

    async def test_missing_credential_stops_before_application_storage(self):
        component = self.component

        class ForbiddenStore:
            def __init__(self, _hass):
                raise AssertionError("application storage must not be opened")

        original = component.RuntimeStore
        component.RuntimeStore = ForbiddenStore
        hass = _prepare_hass(support._Hass())
        entry = support._ConfigEntry(
            {"installation_id": "00000000-0000-4000-8000-000000000099"},
            {},
        )
        try:
            with self.assertRaisesRegex(RuntimeError, "credential is missing"):
                await component.async_setup_entry(hass, entry)
        finally:
            component.RuntimeStore = original

    async def test_yaml_schedules_import_without_loading_runtime(self):
        component = self.component
        component.async_register_static_path = AsyncMock()
        component.async_register_commands = Mock()
        flow_init = AsyncMock()
        created = []

        class Hass(support._Hass):
            def __init__(self):
                super().__init__()
                _prepare_hass(self)
                self.http = types.SimpleNamespace()
                self.config_entries.flow = types.SimpleNamespace(async_init=flow_init)

            def async_create_task(self, coroutine):
                created.append(coroutine)
                return types.SimpleNamespace()

        hass = Hass()
        legacy = {"installer": {"pin": "2468"}}
        result = await component.async_setup(hass, {"cl_control": legacy})
        self.assertTrue(result)
        self.assertNotIn("runtime", hass.data["cl_control"])
        self.assertEqual(len(created), 1)
        await created[0]
        flow_init.assert_awaited_once_with(
            "cl_control", context={"source": "import"}, data=legacy
        )
        component.async_register_commands.assert_not_called()

    async def test_setup_entry_preserves_storage_and_unload_keeps_credentials(self):
        component = self.component
        installation_id = "00000000-0000-4000-8000-000000000001"
        hass = _prepare_hass(support._Hass())
        hass.data = {"cl_control": {"static_registered": True}}
        await support.credentials_module.CredentialStore(hass).async_set_pin(
            installation_id, "installer_pin", "2468"
        )
        existing_runtime = {
            "schema_version": 2,
            "customer_ui": {
                "favorites": ["light.cucina"],
                "aliases": {"light.cucina": "Luce cucina"},
                "experience_level": "standard",
                "layout": {
                    "layout_schema_version": 1,
                    "base": {},
                    "mobile": {},
                    "tablet": {},
                    "wall": {},
                },
            },
            "site": {"site_name": "Existing site"},
            "assistance": {"requests": [{"ticket_id": "CLA-KEEP"}]},
        }

        class FakeStore:
            def __init__(self, _hass):
                pass

            async def async_load(self, _site_defaults):
                return existing_runtime

            async def async_save(self, _runtime):
                return None

        component.RuntimeStore = FakeStore
        component.async_register_panel = Mock()
        component.async_unregister_panel = Mock()
        component.async_register_commands = Mock()
        entry = support._ConfigEntry(
            MappingProxyType({"installation_id": installation_id}),
            MappingProxyType(
                support.flow_module.normalize_entry_options(
                    {"site_name": "Existing site"}
                )
            ),
        )
        self.assertTrue(await component.async_setup_entry(hass, entry))
        self.assertEqual(hass.config_entries.forwarded, [(entry, ("update", "binary_sensor"))])
        self.assertIs(hass.data["cl_control"]["runtime"], existing_runtime)
        self.assertEqual(
            existing_runtime["customer_ui"]["favorites"], ["light.cucina"]
        )
        self.assertEqual(
            existing_runtime["customer_ui"]["aliases"]["light.cucina"],
            "Luce cucina",
        )
        self.assertEqual(
            existing_runtime["assistance"]["requests"][0]["ticket_id"],
            "CLA-KEEP",
        )
        self.assertEqual(
            hass.data["cl_control"]["settings"]["site"]["site_name"],
            "Existing site",
        )
        component.async_register_commands.assert_called_once_with(hass, "3.5.0-dev")
        self.assertIn(
            ((hass, "cl_control", f"invalid_config_entry_{entry.entry_id}"), {}),
            support.issue_registry.deleted,
        )
        self.assertFalse(
            any(
                args[2] == "legacy_yaml_present"
                for args, _kwargs in support.issue_registry.deleted
                if len(args) > 2
            )
        )
        credentials_before = dict(support._Store.records)
        self.assertTrue(await component.async_unload_entry(hass, entry))
        self.assertEqual(hass.config_entries.unloaded, [(entry, ("update", "binary_sensor"))])
        await component.async_remove_entry(hass, entry)
        self.assertEqual(support._Store.records, credentials_before)
        self.assertNotIn("runtime", hass.data["cl_control"])
        self.assertTrue(await component.async_setup_entry(hass, entry))
        component.async_register_commands.assert_called_once_with(hass, "3.5.0-dev")
        self.assertTrue(await component.async_unload_entry(hass, entry))
        invalid_cleanup = [
            args
            for args, _kwargs in support.issue_registry.deleted
            if len(args) > 2
            and args[2] == f"invalid_config_entry_{entry.entry_id}"
        ]
        self.assertEqual(len(invalid_cleanup), 2)


if __name__ == "__main__":
    unittest.main()

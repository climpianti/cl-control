"""Smoke-test the packaged integration import and YAML setup contract."""

from __future__ import annotations

import importlib
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import AsyncMock, Mock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


class Schema:
    def __init__(self, value, **_kwargs) -> None:
        self.value = value

    def __call__(self, value):
        return value


vol = types.ModuleType("voluptuous")
vol.ALLOW_EXTRA = object()
vol.Schema = Schema
vol.Optional = lambda key, **_kwargs: key
vol.Required = lambda key, **_kwargs: key
vol.Coerce = lambda *_args, **_kwargs: (lambda value: value)
vol.In = lambda *_args, **_kwargs: (lambda value: value)
vol.All = lambda *_args, **_kwargs: (lambda value: value)
sys.modules["voluptuous"] = vol

homeassistant = types.ModuleType("homeassistant")
components = types.ModuleType("homeassistant.components")
frontend = types.ModuleType("homeassistant.components.frontend")
frontend.DATA_PANELS = "frontend_panels"
frontend.async_register_built_in_panel = Mock()
websocket_api = types.ModuleType("homeassistant.components.websocket_api")
http = types.ModuleType("homeassistant.components.http")
http.StaticPathConfig = object
core = types.ModuleType("homeassistant.core")
core.HomeAssistant = object
helpers = types.ModuleType("homeassistant.helpers")
entity_registry = types.ModuleType("homeassistant.helpers.entity_registry")
storage = types.ModuleType("homeassistant.helpers.storage")
storage.Store = object
components.frontend = frontend
components.websocket_api = websocket_api
helpers.entity_registry = entity_registry
sys.modules.update(
    {
        "homeassistant": homeassistant,
        "homeassistant.components": components,
        "homeassistant.components.frontend": frontend,
        "homeassistant.components.websocket_api": websocket_api,
        "homeassistant.components.http": http,
        "homeassistant.core": core,
        "homeassistant.helpers": helpers,
        "homeassistant.helpers.entity_registry": entity_registry,
        "homeassistant.helpers.storage": storage,
    }
)


class ComponentImportTests(unittest.IsolatedAsyncioTestCase):
    async def test_component_import_and_legacy_yaml_setup_preserve_runtime(self):
        component = importlib.import_module("custom_components.cl_control")
        self.assertEqual(component.VERSION, "3.3.0-dev")
        self.assertTrue(callable(component.async_setup))

        existing_runtime = {
            "schema_version": 2,
            "customer_ui": {"favorites": ["light.cucina"]},
            "site": {"site_name": "Existing site"},
            "assistance": {"requests": []},
        }

        class FakeStore:
            def __init__(self, _hass) -> None:
                return

            async def async_load(self, _site_defaults):
                return existing_runtime

        component.RuntimeStore = FakeStore
        component.async_register_frontend = AsyncMock()
        component.async_register_commands = Mock()
        hass = types.SimpleNamespace(data={})
        result = await component.async_setup(
            hass,
            {"cl_control": {"installer": {"pin": "test-only-pin"}}},
        )
        self.assertTrue(result)
        self.assertIs(hass.data["cl_control"]["runtime"], existing_runtime)
        component.async_register_frontend.assert_awaited_once()
        component.async_register_commands.assert_called_once_with(hass, "3.3.0-dev")


if __name__ == "__main__":
    unittest.main()

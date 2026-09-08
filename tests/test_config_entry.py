"""Config Flow, credential and Config Entry contract tests."""

from __future__ import annotations

import asyncio
import importlib
from pathlib import Path
import sys
import types
from types import MappingProxyType
import unittest

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / "custom_components" / "cl_control"


class _Marker:
    def __init__(self, key, **_kwargs):
        self.key = key

    def __hash__(self):
        return hash(self.key)

    def __eq__(self, other):
        return isinstance(other, _Marker) and self.key == other.key


class _Schema:
    def __init__(self, value, **_kwargs):
        self.schema = value

    def __call__(self, value):
        return value


vol = types.ModuleType("voluptuous")
vol.ALLOW_EXTRA = object()
vol.Schema = _Schema
vol.Optional = lambda key, **kwargs: _Marker(key, **kwargs)
vol.Required = lambda key, **kwargs: _Marker(key, **kwargs)
vol.Coerce = lambda *_args, **_kwargs: (lambda value: value)
vol.In = lambda *_args, **_kwargs: (lambda value: value)
vol.All = lambda *_args, **_kwargs: (lambda value: value)
sys.modules.setdefault("voluptuous", vol)


class _ConfigEntry:
    def __init__(self, data, options, title="Casa", entry_id="entry-1", version=1):
        self.data = data
        self.options = options
        self.title = title
        self.entry_id = entry_id
        self.version = version
        self.runtime_data = None


class _FlowBase:
    def __init_subclass__(cls, **kwargs):
        return super().__init_subclass__()

    def _async_current_entries(self):
        return self.hass.config_entries.entries

    def async_show_form(self, **kwargs):
        return {"type": "form", **kwargs}

    def async_show_menu(self, **kwargs):
        return {"type": "menu", **kwargs}

    def async_abort(self, **kwargs):
        return {"type": "abort", **kwargs}

    async def async_set_unique_id(self, value):
        self.unique_id = value

    def _abort_if_unique_id_configured(self):
        return None

    def async_create_entry(self, **kwargs):
        return {"type": "create_entry", **kwargs}


class _ConfigFlow(_FlowBase):
    pass


class _OptionsFlowWithReload(_FlowBase):
    def add_suggested_values_to_schema(self, schema, _values):
        return schema


class _Store:
    records = {}
    save_calls = {}

    def __init__(self, _hass, _version, key, **_kwargs):
        self.key = key

    async def async_load(self):
        value = self.records.get(self.key)
        return None if value is None else value.copy()

    async def async_save(self, value):
        self.records[self.key] = value
        self.save_calls[self.key] = self.save_calls.get(self.key, 0) + 1


config_entries = types.ModuleType("homeassistant.config_entries")
config_entries.ConfigEntry = _ConfigEntry
config_entries.ConfigFlow = _ConfigFlow
config_entries.ConfigFlowResult = dict
config_entries.OptionsFlowWithReload = _OptionsFlowWithReload
config_entries.SOURCE_IMPORT = "import"

core = types.ModuleType("homeassistant.core")
core.HomeAssistant = object
core.callback = lambda func: func
helpers = types.ModuleType("homeassistant.helpers")
device_registry = types.ModuleType("homeassistant.helpers.device_registry")
device_registry.async_get = lambda hass: types.SimpleNamespace(devices=hass.devices)
issue_registry = types.ModuleType("homeassistant.helpers.issue_registry")
issue_registry.IssueSeverity = types.SimpleNamespace(WARNING="warning", ERROR="error")
issue_registry.issues = []
issue_registry.deleted = []
issue_registry.async_create_issue = lambda *args, **kwargs: issue_registry.issues.append((args, kwargs))
issue_registry.async_delete_issue = lambda *args, **kwargs: issue_registry.deleted.append((args, kwargs))
storage = types.ModuleType("homeassistant.helpers.storage")
storage.Store = _Store
selector = types.ModuleType("homeassistant.helpers.selector")
selector.TextSelectorType = types.SimpleNamespace(PASSWORD="password")
selector.TextSelectorConfig = lambda **kwargs: kwargs
selector.TextSelector = lambda config: config
selector.SelectSelectorMode = types.SimpleNamespace(DROPDOWN="dropdown")
selector.SelectSelectorConfig = lambda **kwargs: kwargs
selector.SelectSelector = lambda config: config
homeassistant = types.ModuleType("homeassistant")
homeassistant.config_entries = config_entries
sys.modules.update(
    {
        "homeassistant": homeassistant,
        "homeassistant.config_entries": config_entries,
        "homeassistant.core": core,
        "homeassistant.helpers": helpers,
        "homeassistant.helpers.device_registry": device_registry,
        "homeassistant.helpers.issue_registry": issue_registry,
        "homeassistant.helpers.storage": storage,
        "homeassistant.helpers.selector": selector,
    }
)

package = sys.modules.get("cl_control")
if package is None:
    package = types.ModuleType("cl_control")
    package.__path__ = [str(PACKAGE)]
    sys.modules["cl_control"] = package

flow_module = importlib.import_module("cl_control.config_flow")
credentials_module = importlib.import_module("cl_control.credentials")
entry_data_module = importlib.import_module("cl_control.entry_data")
models_module = importlib.import_module("cl_control.models")
runtime_storage_module = importlib.import_module("cl_control.storage")


class _ConfigEntriesManager:
    def __init__(self):
        self.entries = []
        self.forwarded = []
        self.unloaded = []

    def async_entries(self, _domain=None):
        return self.entries

    def async_update_entry(self, entry, **kwargs):
        for key, value in kwargs.items():
            setattr(entry, key, value)

    async def async_forward_entry_setups(self, entry, platforms):
        self.forwarded.append((entry, tuple(platforms)))

    async def async_unload_platforms(self, entry, platforms):
        self.unloaded.append((entry, tuple(platforms)))
        return True


class _Hass:
    def __init__(self):
        self.data = {}
        self.devices = {"device-1": object(), "device-2": object()}
        self.states = types.SimpleNamespace(async_all=lambda: [1, 2, 3])
        self.config_entries = _ConfigEntriesManager()

    async def async_add_executor_job(self, func, *args):
        return await asyncio.to_thread(func, *args)


class ConfigFlowTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        _Store.records.clear()
        _Store.save_calls.clear()
        issue_registry.issues.clear()
        issue_registry.deleted.clear()

    async def test_fresh_onboarding_creates_minimal_entry_and_hashed_pin(self):
        self.assertTrue(
            issubclass(
                flow_module.CLControlOptionsFlow,
                config_entries.OptionsFlowWithReload,
            )
        )
        flow = flow_module.CLControlConfigFlow()
        flow.hass = _Hass()
        self.assertEqual((await flow.async_step_user())["step_id"], "user")
        await flow.async_step_user({"site_name": "Villa", "customer_name": "Rossi"})
        await flow.async_step_assistance({"support_phone": "+39000", "assistance_provider": "whatsapp"})
        await flow.async_step_interface({"experience_level": "standard", "branding_template": "cl_control"})
        await flow.async_step_installer({"installer_pin": "2468", "installer_pin_confirm": "2468"})
        discovery = await flow.async_step_discovery()
        self.assertEqual(discovery["description_placeholders"], {"entities": "3", "devices": "2"})
        await flow.async_step_discovery({})
        result = await flow.async_step_summary({})
        self.assertEqual(result["type"], "create_entry")
        self.assertEqual(set(result["data"]), {"installation_id"})
        self.assertEqual(result["options"]["release_channel"], "stable")
        self.assertNotIn("2468", repr(result))
        stored = await credentials_module.CredentialStore(flow.hass).async_get(result["data"]["installation_id"])
        self.assertTrue(credentials_module.verify_pin("2468", stored["installer_pin"]))
        self.assertNotIn("2468", repr(_Store.records))

    async def test_pin_mismatch_stays_on_installer_step(self):
        flow = flow_module.CLControlConfigFlow()
        flow.hass = _Hass()
        result = await flow.async_step_installer({"installer_pin": "2468", "installer_pin_confirm": "1357"})
        self.assertEqual(result["errors"]["base"], "pin_mismatch")

    async def test_legacy_import_is_one_time_and_sanitizes_options(self):
        raw = {
            "installer": {"pin": "2468"},
            "security": {"pin": "8642"},
            "site": {"site_name": "DEMO", "support": {"whatsapp": "+39000"}},
        }
        _Store.records["cl_control.configuration"] = {
            "schema_version": 2,
            "customer_ui": {
                "experience_level": "pro",
                "favorites": ["light.cucina"],
            },
            "site": {
                "site_name": "DEMO Storage",
                "customer": "Cliente storage",
                "support": {"whatsapp": "+39111"},
            },
            "assistance": {"requests": [{"ticket_id": "CLA-KEEP"}]},
        }
        original = repr(raw)
        flow = flow_module.CLControlConfigFlow()
        flow.hass = _Hass()
        result = await flow.async_step_import(raw)
        self.assertEqual(result["type"], "create_entry")
        self.assertNotIn("2468", repr(result))
        self.assertNotIn("8642", repr(result))
        self.assertEqual(repr(raw), original)
        self.assertEqual(result["options"]["site_name"], "DEMO Storage")
        self.assertEqual(result["options"]["experience_level"], "pro")
        self.assertEqual(
            _Store.records["cl_control.configuration"]["assistance"]
            ["requests"][0]["ticket_id"],
            "CLA-KEEP",
        )
        stored = await credentials_module.CredentialStore(flow.hass).async_get(result["data"]["installation_id"])
        self.assertTrue(credentials_module.verify_pin("2468", stored["installer_pin"]))
        self.assertTrue(credentials_module.verify_pin("8642", stored["security_pin"]))
        self.assertTrue(issue_registry.issues)

        second = flow_module.CLControlConfigFlow()
        second.hass = _Hass()
        second.hass.config_entries.entries.append(_ConfigEntry({}, {}))
        self.assertEqual((await second.async_step_import(raw))["reason"], "already_configured")

    async def test_alphanumeric_legacy_pin_is_migrated_for_compatibility(self):
        flow = flow_module.CLControlConfigFlow()
        flow.hass = _Hass()
        result = await flow.async_step_import(
            {"installer": {"pin": "legacy-only-value"}}
        )
        stored = await credentials_module.CredentialStore(flow.hass).async_get(
            result["data"]["installation_id"]
        )
        self.assertTrue(
            credentials_module.verify_pin(
                "legacy-only-value", stored["installer_pin"]
            )
        )
        self.assertNotIn("legacy-only-value", repr(result))

    async def test_options_update_and_pin_rotation(self):
        hass = _Hass()
        installation_id = "00000000-0000-4000-8000-000000000001"
        await credentials_module.CredentialStore(hass).async_set_pin(installation_id, "installer_pin", "2468")
        entry = _ConfigEntry(
            {"installation_id": installation_id},
            flow_module.normalize_entry_options({"site_name": "Casa"}),
        )
        options = flow_module.CLControlOptionsFlow()
        options.hass = hass
        options.config_entry = entry
        general = await options.async_step_general({"site_name": "Villa", "experience_level": "pro"})
        self.assertEqual(general["data"]["site_name"], "Villa")
        self.assertEqual(entry.title, "Villa")

        bad = await options.async_step_installer({"current_installer_pin": "0000", "new_installer_pin": "9753", "new_installer_pin_confirm": "9753"})
        self.assertEqual(bad["errors"]["base"], "invalid_current_pin")
        good = await options.async_step_installer({"current_installer_pin": "2468", "new_installer_pin": "9753", "new_installer_pin_confirm": "9753"})
        self.assertEqual(good["type"], "create_entry")
        self.assertNotIn("9753", repr(good))
        stored = await credentials_module.CredentialStore(hass).async_get(installation_id)
        self.assertTrue(credentials_module.verify_pin("9753", stored["installer_pin"]))
        self.assertFalse(credentials_module.verify_pin("2468", stored["installer_pin"]))


class ConfigEntryMappingTests(unittest.TestCase):
    def test_entry_data_accepts_dict_and_immutable_mapping(self):
        installation_id = "00000000-0000-4000-8000-000000000001"
        mutable = {"installation_id": installation_id}
        immutable = MappingProxyType(mutable)
        before = dict(immutable)

        self.assertTrue(entry_data_module.entry_data_is_valid(mutable))
        self.assertTrue(entry_data_module.entry_data_is_valid(immutable))
        self.assertEqual(dict(immutable), before)

    def test_entry_data_rejects_missing_invalid_and_corrupt_values(self):
        self.assertFalse(entry_data_module.entry_data_is_valid({}))
        self.assertFalse(
            entry_data_module.entry_data_is_valid(
                MappingProxyType({"installation_id": "not-a-uuid"})
            )
        )
        self.assertFalse(entry_data_module.entry_data_is_valid(None))
        self.assertFalse(
            entry_data_module.entry_data_is_valid(
                [("installation_id", "not-a-mapping")]
            )
        )

    def test_immutable_options_are_normalized_without_mutation(self):
        raw = {
            "site_name": "Villa Mapping",
            "experience_level": "pro",
            "legacy_settings": {"site": {"customer": "Cliente"}},
        }
        immutable = MappingProxyType(raw)
        before = repr(raw)

        normalized = entry_data_module.normalize_entry_options(immutable)

        self.assertEqual(normalized["site_name"], "Villa Mapping")
        self.assertEqual(normalized["experience_level"], "pro")
        self.assertEqual(repr(raw), before)


class RuntimeStoragePrecedenceTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        _Store.records.clear()
        _Store.save_calls.clear()

    async def test_defaults_preserve_customer_theme_and_runtime_data(self):
        existing = models_module.migrate_runtime_config(
            {
                "schema_version": 2,
                "customer_ui": {
                    "theme": "auto",
                    "favorites": ["light.cucina"],
                    "entity_visibility": {"light.cucina": False},
                },
                "site": {
                    "site_name": "Impianto cliente",
                    "customer": "Cliente storage",
                    "support": {"message": "Messaggio cliente"},
                },
                "assistance": {"requests": [{"ticket_id": "CLA-KEEP"}]},
            }
        )
        _Store.records["cl_control.configuration"] = existing
        store = runtime_storage_module.RuntimeStore(_Hass())
        defaults = entry_data_module.settings_from_entry(
            entry_data_module.normalize_entry_options({"customer_name": ""})
        )["site"]

        loaded = await store.async_load(defaults)

        self.assertEqual(loaded["site"]["customer"], "Cliente storage")
        self.assertEqual(loaded["customer_ui"]["theme"], "auto")
        self.assertEqual(loaded["customer_ui"]["favorites"], ["light.cucina"])
        self.assertFalse(loaded["customer_ui"]["entity_visibility"]["light.cucina"])
        self.assertEqual(loaded["assistance"]["requests"][0]["ticket_id"], "CLA-KEEP")
        self.assertEqual(_Store.save_calls.get("cl_control.configuration", 0), 0)

    async def test_explicit_site_option_wins_once_then_storage_is_stable(self):
        existing = models_module.migrate_runtime_config(
            {
                "schema_version": 2,
                "customer_ui": {"theme": "auto"},
                "site": {"customer": "Cliente storage"},
                "assistance": {"requests": [{"ticket_id": "CLA-KEEP"}]},
            }
        )
        _Store.records["cl_control.configuration"] = existing
        store = runtime_storage_module.RuntimeStore(_Hass())
        explicit = entry_data_module.settings_from_entry(
            entry_data_module.normalize_entry_options(
                {"customer_name": "Cliente option"}
            )
        )["site"]

        first = await store.async_load(explicit)
        first_saved = repr(_Store.records["cl_control.configuration"])
        second = await store.async_load(explicit)

        self.assertEqual(first["site"]["customer"], "Cliente option")
        self.assertEqual(first["customer_ui"]["theme"], "auto")
        self.assertEqual(first["assistance"]["requests"][0]["ticket_id"], "CLA-KEEP")
        self.assertEqual(second, first)
        self.assertEqual(repr(_Store.records["cl_control.configuration"]), first_saved)
        self.assertEqual(_Store.save_calls["cl_control.configuration"], 1)


if __name__ == "__main__":
    unittest.main()

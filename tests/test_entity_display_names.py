"""Regression tests for names resolved by Home Assistant."""
import sys
import types
import unittest
from types import SimpleNamespace
from unittest.mock import patch
from custom_components.cl_control.dashboard_native import (
    NativeDashboardService, _entity_name, build_dashboard_model, build_native_lovelace,
)

LED = [
    ("light.shellyplusrgbwpm_30c922579de0_light_0", "LED Letto", "matrimoniale"),
    ("light.shellyplusrgbwpm_30c922579de0_light_1", "LED Bagno", "bagno"),
    ("light.shellyplusrgbwpm_30c922579de0_light_2", "LED Cameretta", "cameretta"),
]


class EntityDisplayNameTests(unittest.TestCase):
    def test_priority(self):
        entity = {"entity_id": LED[0][0], "name": "Nome installatore",
                  "friendly_name": "LED Letto", "original_name": "Light 0"}
        self.assertEqual(_entity_name(entity, {"aliases": {LED[0][0]: "Alias CL"}}), "Alias CL")
        self.assertEqual(_entity_name(entity, {}), "Nome installatore")
        entity["name"] = None
        self.assertEqual(_entity_name(entity, {}), "LED Letto")
        entity["friendly_name"] = None
        self.assertEqual(_entity_name(entity, {}), "Light 0")
        entity["original_name"] = None
        self.assertEqual(_entity_name(entity, {}), "Shellyplusrgbwpm 30C922579De0 Light 0")

    def test_shelly_room_and_scene_names(self):
        entities = [{"entity_id": eid, "domain": "light", "area_id": area,
                     "friendly_name": name, "name": None, "original_name": None}
                    for eid, name, area in LED]
        model = build_dashboard_model(
            registry_entities=entities,
            areas=[{"id": area, "name": area.title()} for _, _, area in LED],
            runtime={}, site={}, branding={}, version="test", revision=1,
        )
        config = build_native_lovelace(model)
        for eid, name, area in LED:
            room = next(view for view in config["views"] if view["path"] == "area-" + area)
            cards = [card for section in room["sections"] for card in section["cards"]]
            self.assertTrue(any(card.get("entity") == eid and card.get("name") == name for card in cards))
        scenes = next(view for view in config["views"] if view["path"] == "light-scenes")
        items = [entity for section in scenes["sections"] for card in section["cards"]
                 for entity in card.get("entities", [])]
        for eid, name, _ in LED:
            self.assertTrue(any(item["entity_id"] == eid and item["name"] == name for item in items))

    def test_registry_snapshot_captures_friendly_name_only(self):
        eid, _, area_id = LED[0]
        entry = SimpleNamespace(entity_id=eid, domain="light", platform="shelly",
            area_id=area_id, device_id=None, config_entry_id="sample", disabled_by=None,
            hidden_by=None, entity_category=None, name=None, original_name=None,
            unique_id="test", icon=None, original_icon=None, supported_features=0,
            device_class=None, original_device_class=None)
        hass = SimpleNamespace(states=SimpleNamespace(get=lambda _: SimpleNamespace(
            state="on", attributes={"friendly_name": "LED Letto", "brightness": 123})))
        registry_objects = {
            "area_registry": SimpleNamespace(async_list_areas=lambda: []),
            "device_registry": SimpleNamespace(async_get=lambda _: None),
            "entity_registry": SimpleNamespace(entities={eid: entry}),
            "floor_registry": SimpleNamespace(async_list_floors=lambda: []),
        }
        helpers = types.ModuleType("homeassistant.helpers")
        helpers.__path__ = []
        ha_module = types.ModuleType("homeassistant")
        ha_module.__path__ = []
        ha_module.helpers = helpers
        modules = {"homeassistant": ha_module, "homeassistant.helpers": helpers}
        for name, obj in registry_objects.items():
            module = types.ModuleType("homeassistant.helpers." + name)
            module.async_get = lambda _, registry=obj: registry
            setattr(helpers, name, module)
            modules[module.__name__] = module
        with patch.dict(sys.modules, modules):
            records, _ = NativeDashboardService(hass, "test")._registry_snapshot()
        self.assertEqual(records[0]["friendly_name"], "LED Letto")
        self.assertNotIn("state", records[0])
        self.assertNotIn("brightness", records[0])


if __name__ == "__main__":
    unittest.main()

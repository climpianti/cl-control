import unittest
from custom_components.cl_control.dashboard_native import build_dashboard_model, build_native_lovelace


class SceneDashboardTests(unittest.TestCase):
    def config(self, entities):
        model = build_dashboard_model(registry_entities=entities,
            areas=[{"id":"room", "name":"Stanza"}], runtime={},
            site={}, branding={}, version="test", revision=1)
        return build_native_lovelace(model)

    def test_light_card_and_scene_selector_follow_visible_model(self):
        config = self.config([
            {"entity_id":"light.a", "domain":"light", "area_id":"room", "name":"A"},
            {"entity_id":"light.hidden", "domain":"light", "hidden":True},
            {"entity_id":"switch.outlet", "domain":"switch", "area_id":"room"},
        ])
        scenes = next(v for v in config["views"] if v["path"] == "light-scenes")
        card = next(c for s in scenes["sections"] for c in s["cards"] if c["type"] == "custom:cl-control-light-memories-card")
        self.assertEqual(card["entities"], [{"entity_id":"light.a","name":"A"}])
        area = next(v for v in config["views"] if v["path"] == "area-room")
        self.assertTrue(any(c.get("entity") == "light.a" and c["type"] == "custom:cl-control-light-memories-card" for s in area["sections"] for c in s["cards"]))

    def test_no_scene_view_without_lights(self):
        self.assertNotIn("light-scenes", [v["path"] for v in self.config([])["views"]])

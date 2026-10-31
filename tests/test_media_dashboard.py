"""Regression tests for multimedia in native CL Control dashboards."""
import unittest

from custom_components.cl_control.dashboard_native import (
    build_dashboard_model, build_native_lovelace,
)
from custom_components.cl_control.summary import format_summary, is_active_state


class MultimediaDashboardTests(unittest.TestCase):
    def model(self, entities=None, runtime=None):
        return build_dashboard_model(
            registry_entities=entities if entities is not None else [
                {"entity_id": "media_player.tv", "domain": "media_player",
                 "area_id": "living", "name": "TV soggiorno"},
            ],
            areas=[{"id": "living", "name": "Soggiorno"}],
            runtime=runtime or {}, site={}, branding={}, version="test", revision=1,
        )

    def test_media_only_area_and_system_are_generated(self):
        model = self.model()
        self.assertEqual(model["modules"]["media"]["count"], 1)
        self.assertEqual(model["areas"][0]["entities"]["media"][0]["entity_id"], "media_player.tv")
        config = build_native_lovelace(model)
        views = {view["path"]: view for view in config["views"]}
        for path in ("area-living", "media"):
            cards = [c for s in views[path]["sections"] for c in s["cards"]]
            self.assertTrue(any(c.get("type") == "media-control" and c["entity"] == "media_player.tv" for c in cards))

    def test_no_empty_media_view_without_players(self):
        config = build_native_lovelace(self.model(entities=[]))
        self.assertNotIn("media", [v["path"] for v in config["views"]])

    def test_unassigned_player_remains_in_system(self):
        model = self.model(entities=[{"entity_id": "media_player.speaker"}])
        self.assertEqual(model["areas"], [])
        config = build_native_lovelace(model)
        media = next(v for v in config["views"] if v["path"] == "media")
        self.assertTrue(any(c.get("entity") == "media_player.speaker" for s in media["sections"] for c in s["cards"]))

    def test_visibility_and_order_are_respected(self):
        players = [{"entity_id": "media_player." + suffix, "area_id": "living"} for suffix in ("a", "b", "hidden", "disabled")]
        players[-1]["disabled"] = True
        model = self.model(players, {"entity_visibility": {"media_player.hidden": False}, "entity_order": ["media_player.b", "media_player.a"]})
        self.assertEqual([p["entity_id"] for p in model["areas"][0]["entities"]["media"]], ["media_player.b", "media_player.a"])

    def test_favorite_player_uses_media_card(self):
        model = self.model(runtime={"favorites": ["media_player.tv"]})
        home = build_native_lovelace(model)["views"][0]
        self.assertTrue(any(c.get("type") == "media-control" for s in home["sections"] for c in s["cards"]))

    def test_no_unsupported_service_commands_generated(self):
        model = self.model()
        media = next(v for v in build_native_lovelace(model)["views"] if v["path"] == "media")
        card = next(c for s in media["sections"] for c in s["cards"] if c.get("type") == "media-control")
        self.assertEqual(set(card), {"type", "entity", "name"})

    def test_playing_and_availability_summary(self):
        for state in ("playing", "buffering"):
            self.assertTrue(is_active_state("media", state))
        for state in ("off", "idle", "paused", "standby", "unknown", "unavailable"):
            self.assertFalse(is_active_state("media", state))
        self.assertEqual(format_summary("media", 0, 2, 2), "Non disponibili")
        self.assertEqual(format_summary("media", 1, 2, 1), "1 in riproduzione · 1 non disponibili")

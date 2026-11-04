"""Regression tests for CL Control climate cards."""
from pathlib import Path
import unittest

from custom_components.cl_control.dashboard_native import (
    build_dashboard_model,
    build_native_lovelace,
)


class ClimateDashboardTests(unittest.TestCase):
    def model(self, entities=None, runtime=None):
        return build_dashboard_model(
            registry_entities=entities if entities is not None else [
                {
                    "entity_id": "climate.living",
                    "domain": "climate",
                    "area_id": "living",
                    "name": "Living",
                },
            ],
            areas=[{"id": "living", "name": "Soggiorno"}],
            runtime=runtime or {},
            site={},
            branding={},
            version="test",
            revision=1,
        )

    def _cards(self, view):
        return [card for section in view["sections"] for card in section["cards"]]

    def test_area_and_climate_system_use_custom_card(self):
        config = build_native_lovelace(self.model())
        views = {view["path"]: view for view in config["views"]}
        for path in ("area-living", "climate"):
            cards = self._cards(views[path])
            self.assertTrue(
                any(
                    card.get("type") == "custom:cl-control-climate-card"
                    and card.get("entity") == "climate.living"
                    for card in cards
                )
            )

    def test_favorite_climate_uses_custom_card(self):
        config = build_native_lovelace(
            self.model(runtime={"favorites": ["climate.living"]})
        )
        home_cards = self._cards(config["views"][0])
        self.assertTrue(
            any(
                card.get("type") == "custom:cl-control-climate-card"
                and card.get("entity") == "climate.living"
                for card in home_cards
            )
        )

    def test_no_climate_view_without_climate_entities(self):
        config = build_native_lovelace(self.model(entities=[]))
        self.assertNotIn("climate", [view["path"] for view in config["views"]])

    def test_frontend_contract_is_capability_aware(self):
        source = (
            Path(__file__).resolve().parents[1]
            / "custom_components"
            / "cl_control"
            / "frontend"
            / "cl-control-climate-card.mjs"
        ).read_text(encoding="utf-8")
        for expected in (
            "target_temp_step",
            "min_temp",
            "max_temp",
            "hvac_modes",
            "preset_modes",
            "fan_modes",
            "_call('set_temperature'",
            "_call('set_hvac_mode'",
            "_call('set_preset_mode'",
            "_call('set_fan_mode'",
            "hass-more-info",
        ):
            self.assertIn(expected, source)


if __name__ == "__main__":
    unittest.main()

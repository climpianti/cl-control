"""Tests for the CL Control 3.5 structural native dashboard."""

from __future__ import annotations

import importlib
from pathlib import Path
import sys
import types
import unittest

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / "custom_components" / "cl_control"

package = sys.modules.get("cl_control")
if package is None:
    package = types.ModuleType("cl_control")
    package.__path__ = [str(PACKAGE)]
    sys.modules["cl_control"] = package

dashboard = importlib.import_module("cl_control.dashboard_native")


class NativeDashboardTests(unittest.TestCase):
    def _model(self, **runtime_ui):
        runtime = {
            "customer_ui": {
                "experience_level": "standard",
                "favorites": ["light.salone"],
                "entity_visibility": {},
                "entity_modules": {},
                "entity_areas": {},
                **runtime_ui,
            },
            "site": {"site_name": "Villa Test"},
        }
        entities = [
            {
                "entity_id": "light.salone",
                "domain": "light",
                "platform": "knx",
                "area_id": "salone",
                "name": "Luce salone",
                "supported_features": 1,
            },
            {
                "entity_id": "cover.salotto",
                "domain": "cover",
                "platform": "knx",
                "area_id": "salone",
                "name": "Tapparella",
            },
            {
                "entity_id": "climate.camera",
                "domain": "climate",
                "platform": "knx",
                "area_id": "camera",
                "name": "Camera",
            },
            {
                "entity_id": "light.cl_power_debug",
                "domain": "light",
                "platform": "cl_power_control",
                "area_id": "salone",
                "name": "Debug",
            },
        ]
        return dashboard.build_dashboard_model(
            registry_entities=entities,
            areas=[
                {"id": "salone", "name": "Salone"},
                {"id": "camera", "name": "Camera"},
            ],
            runtime=runtime,
            site={},
            branding={
                "brand_name": "CL Control",
                "assets": {"logo": "/cl_control_static/3.5.0-dev/logo.png"},
            },
            version="3.5.0-dev",
            revision=4,
            cl_modules=[
                {
                    "domain": "cl_power_control",
                    "module_id": "energy",
                    "display_name": "CL Power Control",
                    "customer_label": "Energia",
                    "icon": "mdi:solar-power-variant",
                    "installed": True,
                    "available": True,
                    "ready": True,
                    "route": "/cl-power-control",
                    "customer_visible": True,
                },
                {
                    "domain": "cl_irrigation",
                    "module_id": "irrigation",
                    "display_name": "CL Irrigation",
                    "customer_label": "Irrigazione",
                    "icon": "mdi:sprinkler-variant",
                    "installed": True,
                    "available": True,
                    "ready": True,
                    "route": "/giardino-irrigazione",
                    "customer_visible": True,
                },
            ],
            home_assistant_energy_available=True,
        )

    def test_model_is_structural_and_filters_internal_platforms(self):
        model = self._model()
        rendered = repr(model)
        self.assertEqual(model["revision"], 4)
        self.assertEqual(model["site"]["site_name"], "Villa Test")
        self.assertNotIn("light.cl_power_debug", rendered)
        self.assertNotIn("'state':", rendered)
        self.assertEqual(model["modules"]["lights"]["count"], 1)
        self.assertEqual(model["modules"]["covers"]["count"], 1)
        self.assertEqual(model["modules"]["climate"]["count"], 1)
        self.assertEqual(model["energy"]["provider"], "cl_power_control")
        self.assertEqual(len(model["cl_modules"]), 2)


    def test_module_levels_override_active_experience_instead_of_hiding_module(self):
        model = self._model(
            experience_level="essential",
            module_levels={"lights": "pro", "climate": "standard"},
        )
        self.assertEqual(model["modules"]["lights"]["count"], 1)
        self.assertEqual(model["modules"]["climate"]["count"], 1)
        cucina = next(area for area in model["areas"] if area["name"] == "Salone")
        self.assertEqual(len(cucina["entities"]["lights"]), 1)

    def test_entity_level_uses_module_experience_override(self):
        model = self._model(
            experience_level="essential",
            module_levels={"lights": "pro"},
            entity_levels={"light.salone": "pro", "climate.camera": "standard"},
        )
        self.assertEqual(model["modules"]["lights"]["count"], 1)
        self.assertEqual(model["modules"]["climate"]["count"], 0)

    def test_installer_only_entity_never_leaks_to_customer_dashboard(self):
        model = self._model(entity_levels={"light.salone": "installer"})
        self.assertEqual(model["modules"]["lights"]["count"], 0)

    def test_installer_visibility_override_can_expose_internal_entity(self):
        model = self._model(
            entity_visibility={"light.cl_power_debug": True},
            favorites=["light.cl_power_debug"],
        )
        self.assertEqual(model["modules"]["lights"]["count"], 2)
        self.assertEqual(
            model["favorites"][0]["entity_id"], "light.cl_power_debug"
        )

    def test_native_config_contains_no_cl_custom_customer_cards(self):
        config = dashboard.build_native_lovelace(self._model())
        rendered = repr(config)
        self.assertNotIn("custom:cl-control-dashboard-card", rendered)
        self.assertNotIn("custom:", rendered)
        self.assertTrue(config["views"])
        self.assertTrue(all(view["type"] == "sections" for view in config["views"]))
        self.assertEqual(config["views"][0]["path"], "home")
        card_types = {
            card["type"]
            for view in config["views"]
            for section in view["sections"]
            for card in section["cards"]
        }
        self.assertTrue({"markdown", "heading", "tile", "area", "button"} <= card_types)
        home = config["views"][0]
        rendered_home = repr(home)
        self.assertIn("Sistemi CL", rendered_home)
        self.assertIn("/cl-power-control", rendered_home)
        self.assertIn("/giardino-irrigazione", rendered_home)

    def test_area_override_creates_a_native_navigation_view_without_state_data(self):
        model = self._model(entity_areas={"light.salone": "Terrazza"})
        terrazza = next(area for area in model["areas"] if area["name"] == "Terrazza")
        self.assertFalse(terrazza["native"])
        self.assertEqual(terrazza["path"], "area-terrazza")
        config = dashboard.build_native_lovelace(model)
        self.assertTrue(any(view["path"] == "area-terrazza" for view in config["views"]))


if __name__ == "__main__":
    unittest.main()

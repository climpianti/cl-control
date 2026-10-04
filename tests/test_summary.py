"""Tests for lightweight CL Control dashboard summaries."""

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

summary = importlib.import_module("cl_control.summary")


class SummaryTests(unittest.TestCase):
    def test_active_state_contracts(self):
        self.assertTrue(summary.is_active_state("lights", "on"))
        self.assertFalse(summary.is_active_state("lights", "off"))
        self.assertTrue(summary.is_active_state("covers", "open"))
        self.assertTrue(summary.is_active_state("covers", "closing"))
        self.assertFalse(summary.is_active_state("covers", "closed"))
        self.assertTrue(summary.is_active_state("climate", "heat"))
        self.assertTrue(summary.is_active_state("climate", "cool"))
        self.assertFalse(summary.is_active_state("climate", "off"))
        self.assertFalse(summary.is_active_state("climate", "unavailable"))

    def test_summary_copy(self):
        self.assertEqual(summary.format_summary("lights", 0, 8), "Tutte spente")
        self.assertEqual(summary.format_summary("lights", 2, 8), "2 luci accese")
        self.assertEqual(summary.format_summary("covers", 0, 5), "Tutte chiuse")
        self.assertEqual(summary.format_summary("covers", 2, 5), "2 aperture aperte")
        self.assertEqual(summary.format_summary("climate", 0, 4), "Tutto spento")
        self.assertEqual(summary.format_summary("climate", 2, 4), "2 zone attive")

    def test_manager_tracks_area_power_sources(self):
        manager = summary.SummaryManager("fixture")
        manager.set_area_power_sources(
            {
                "salone": ["sensor.power_a", "sensor.power_b", "sensor.power_a"],
                "camera": [],
            }
        )
        self.assertEqual(
            manager._area_power_sources["salone"],
            ("sensor.power_a", "sensor.power_b"),
        )
        self.assertEqual(manager.area_power_entity_ids(), {})

    def test_manager_updates_sources_without_runtime_states(self):
        manager = summary.SummaryManager("fixture")
        manager.set_sources(
            {
                "lights": ["light.a", "light.a", "light.b"],
                "covers": ["cover.a"],
                "climate": [],
            }
        )
        self.assertEqual(manager.sources("lights"), ("light.a", "light.b"))
        self.assertEqual(manager.sources("covers"), ("cover.a",))
        self.assertEqual(manager.entity_ids(), {})


if __name__ == "__main__":
    unittest.main()

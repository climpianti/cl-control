"""Tests for optional CL ecosystem module discovery contracts."""

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

ecosystem = importlib.import_module("cl_control.ecosystem")


class CLEcosystemTests(unittest.TestCase):
    def test_detects_power_panel_and_irrigation_strategy_dashboard(self):
        modules = ecosystem.build_module_descriptors(
            active_domains={"cl_power_control", "cl_irrigation"},
            entry_counts={"cl_power_control": 1, "cl_irrigation": 2},
            panels=[
                {"path": "cl-power-control", "title": "CL Power Control"},
                {"path": "garden", "title": "Giardino"},
            ],
            strategy_routes={"cl-irrigation": "garden-irrigation"},
        )
        power = next(item for item in modules if item["domain"] == "cl_power_control")
        irrigation = next(item for item in modules if item["domain"] == "cl_irrigation")

        self.assertTrue(power["ready"])
        self.assertEqual(power["route"], "/cl-power-control")
        self.assertEqual(power["entry_count"], 1)
        self.assertTrue(irrigation["ready"])
        self.assertEqual(irrigation["route"], "/garden-irrigation")
        self.assertEqual(irrigation["entry_count"], 2)

    def test_irrigation_installed_without_dashboard_is_not_customer_visible(self):
        modules = ecosystem.build_module_descriptors(
            active_domains={"cl_irrigation"},
            entry_counts={"cl_irrigation": 1},
        )
        irrigation = next(item for item in modules if item["domain"] == "cl_irrigation")
        self.assertTrue(irrigation["installed"])
        self.assertFalse(irrigation["ready"])
        self.assertFalse(irrigation["customer_visible"])
        self.assertEqual(irrigation["status"], "dashboard_required")

    def test_energy_provider_prefers_cl_power_control_in_auto_mode(self):
        modules = ecosystem.build_module_descriptors(
            active_domains={"cl_power_control"},
            entry_counts={"cl_power_control": 1},
        )
        self.assertEqual(
            ecosystem.resolve_energy_provider(
                "auto", modules, home_assistant_energy_available=True
            ),
            "cl_power_control",
        )

    def test_energy_provider_falls_back_to_home_assistant(self):
        modules = ecosystem.build_module_descriptors(active_domains=set())
        self.assertEqual(
            ecosystem.resolve_energy_provider(
                "auto", modules, home_assistant_energy_available=True
            ),
            "home_assistant",
        )
        self.assertEqual(
            ecosystem.resolve_energy_provider(
                "cl_power_control",
                modules,
                home_assistant_energy_available=True,
            ),
            "none",
        )

    def test_module_signature_ignores_non_structural_metadata(self):
        modules = ecosystem.build_module_descriptors(
            active_domains={"cl_power_control"},
            entry_counts={"cl_power_control": 1},
            panels=[{"path": "cl-power-control", "title": "CL Power Control"}],
        )
        before = ecosystem.module_signature(modules)
        modules[0]["diagnostic_note"] = "does not affect structure"
        self.assertEqual(before, ecosystem.module_signature(modules))


if __name__ == "__main__":
    unittest.main()

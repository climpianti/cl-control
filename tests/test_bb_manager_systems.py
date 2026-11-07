"""Regression checks for optional CL B&B Manager discovery and navigation."""
import unittest

from custom_components.cl_control.dashboard_native import (
    build_dashboard_model,
    build_native_lovelace,
)
from custom_components.cl_control.ecosystem import (
    build_module_descriptors,
    module_signature,
)
from custom_components.cl_control.energy_contract import empty_energy_model


class BBManagerSystemsTests(unittest.TestCase):
    def _modules(self, *, installed=True, panel=True, operators=()):
        return build_module_descriptors(
            active_domains={"cl_bb_manager"} if installed else set(),
            entry_counts={"cl_bb_manager": 1} if installed else {},
            panels=(
                [{"path": "cl-bb-manager", "title": ""}]
                if panel else []
            ),
            operator_user_ids={"cl_bb_manager": tuple(operators)},
        )

    def _shortcuts(self, modules, admin_users=None):
        model = build_dashboard_model(
            registry_entities=[],
            areas=[],
            runtime={},
            site={},
            branding={},
            version="test",
            revision=1,
            cl_modules=modules,
        )
        model["energy"] = empty_energy_model()
        model["admin_user_ids"] = admin_users or []
        config = build_native_lovelace(model)
        home = next(view for view in config["views"] if view["path"] == "home")
        cards = [
            card
            for section in home["sections"]
            for card in section["cards"]
        ]
        return [
            (card, card.get("card", card))
            for card in cards
            if card.get("card", card).get("type") == "shortcut"
        ]

    def test_detects_b_and_b_when_panel_is_registered(self):
        item = next(x for x in self._modules() if x["domain"] == "cl_bb_manager")
        self.assertTrue(item["installed"])
        self.assertTrue(item["ready"])
        self.assertTrue(item["customer_visible"])
        self.assertTrue(item["admin_only"])
        self.assertEqual(item["route"], "/cl-bb-manager")
        self.assertEqual(item["customer_label"], "CL B&B Manager")

    def test_missing_or_disabled_integration_never_shows_shortcut(self):
        for installed, panel in ((False, False), (False, True), (True, False)):
            with self.subTest(installed=installed, panel=panel):
                modules = self._modules(installed=installed, panel=panel)
                self.assertFalse(next(
                    x for x in modules if x["domain"] == "cl_bb_manager"
                )["ready"])
                shortcuts = self._shortcuts(modules, ["administrator"])
                self.assertFalse(any(
                    c["label"] == "CL B&B Manager" for _, c in shortcuts
                ))

    def test_manager_shortcut_allows_administrator_and_opens_panel(self):
        shortcuts = self._shortcuts(self._modules(), ["administrator"])
        matching = [
            (outer, card) for outer, card in shortcuts
            if card["label"] == "CL B&B Manager"
        ]
        self.assertEqual(len(matching), 1)
        outer, card = matching[0]
        self.assertEqual(card["icon"], "mdi:bed")
        self.assertEqual(card["tap_action"], {
            "action": "navigate",
            "navigation_path": "/cl-bb-manager",
        })
        expected = [{"condition": "user", "users": ["administrator"]}]
        self.assertEqual(card["visibility"], expected)
        self.assertEqual(outer["visibility"], expected)

    def test_no_authorized_users_means_no_manager_shortcut(self):
        self.assertFalse(any(
            c["label"] == "CL B&B Manager"
            for _, c in self._shortcuts(self._modules(), [])
        ))

    def test_operator_can_see_shortcut_without_admin_account(self):
        shortcuts = self._shortcuts(self._modules(operators=["operator"]), [])
        matching = [
            (outer, card) for outer, card in shortcuts
            if card["label"] == "CL B&B Manager"
        ]
        self.assertEqual(len(matching), 1)
        outer, card = matching[0]
        expected = [{"condition": "user", "users": ["operator"]}]
        self.assertEqual(card["visibility"], expected)
        self.assertEqual(outer["visibility"], expected)

    def test_operator_and_admin_visibility_are_combined(self):
        shortcuts = self._shortcuts(self._modules(operators=["operator"]), ["administrator"])
        matching = [
            card for _, card in shortcuts if card["label"] == "CL B&B Manager"
        ]
        self.assertEqual(len(matching), 1)
        self.assertEqual(matching[0]["visibility"], [{
            "condition": "user", "users": ["administrator", "operator"],
        }])

    def test_panel_install_and_uninstall_change_cache_signature(self):
        absent = self._modules(installed=False)
        ready = self._modules()
        no_panel = self._modules(panel=False)
        self.assertNotEqual(module_signature(absent), module_signature(ready))
        self.assertNotEqual(module_signature(no_panel), module_signature(ready))
        self.assertNotEqual(
            module_signature(ready),
            module_signature(self._modules(operators=["operator"])),
        )


if __name__ == "__main__":
    unittest.main()

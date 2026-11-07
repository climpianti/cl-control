"""Migration acceptance contracts using synthetic data, without HA or network IO."""
from copy import deepcopy
import json
import unittest

from custom_components.cl_control.dashboard_native import build_dashboard_model, build_native_lovelace
from custom_components.cl_control.energy_contract import empty_energy_model, apply_manual_overrides, recalculate_capabilities
from custom_components.cl_control.modules.layout import (
    layout_write_allowed, normalize_layout, reset_layout, update_layout_view,
)


def fixture_model(energy=True):
    model = build_dashboard_model(
        registry_entities=[
            {"entity_id": f"{domain}.migration_test", "area_id": "test_room", "name": name}
            for domain, name in (
                ("light", "Luce di prova con nome molto lungo"),
                ("climate", "Clima di prova"), ("cover", "Apertura di prova"),
                ("media_player", "TV di prova"),
            )
        ],
        areas=[{"id": "test_room", "name": "Ambiente sintetico"}],
        runtime={}, site={}, branding={}, version="migration-test", revision=1,
        home_assistant_energy_available=energy,
    )
    # Runtime normally fills this through async_build_energy_model. Exercise the
    # pure contract here; this fixture does not claim to test HA discovery.
    model["energy"] = empty_energy_model()
    if energy:
        apply_manual_overrides(model["energy"], {
            key: {"mode": "manual", "ids": [f"sensor.migration_test_{key}"]}
            for key in ("home_power", "grid_power")
        })
    recalculate_capabilities(model["energy"])
    return model


def cards(view):
    return [card for section in view["sections"] for card in section["cards"]]


class MigrationFoundationTests(unittest.TestCase):
    def test_native_customer_views_exist(self):
        config = build_native_lovelace(fixture_model())
        views = {view["path"]: view for view in config["views"]}
        self.assertTrue({"home", "lights", "climate", "covers", "media", "energy", "area-test-room"} <= views.keys(), views.keys())
        for view, domain in (("lights", "light"), ("climate", "climate"), ("covers", "cover")):
            expected_type = {"light": "custom:cl-control-light-memories-card", "cover": "custom:cl-control-cover-card", "climate": "custom:cl-control-climate-glass-card"}.get(domain, "tile")
            self.assertTrue(any(card.get("entity") == f"{domain}.migration_test" and card["type"] == expected_type for card in cards(views[view])))
        self.assertTrue(any(card["type"] == "custom:cl-control-energy-card" for card in cards(views["energy"])))

    def test_energy_is_not_fabricated_without_a_provider(self):
        config = build_native_lovelace(fixture_model(energy=False))
        self.assertNotIn("energy", [view["path"] for view in config["views"]])

    def test_home_systems_only_navigate_and_native_areas_are_preserved(self):
        config = build_native_lovelace(fixture_model())
        home = next(view for view in config["views"] if view["path"] == "home")
        systems = [card for card in cards(home) if card["type"] == "custom:cl-control-system-card"]
        by_module = {card["module"]: card for card in systems}
        for module, domain in (("lights", "light"), ("covers", "cover"), ("climate", "climate"), ("media", "media_player")):
            self.assertEqual(by_module[module]["entities"], [f"{domain}.migration_test"])
            self.assertEqual(by_module[module]["path"], module)
            self.assertNotIn("tap_action", by_module[module])
        areas = [card["card"] for card in cards(home) if card["type"] == "custom:cl-control-home-surface" and card["card"]["type"] == "area"]
        self.assertEqual(len(areas), 1)
        self.assertEqual(areas[0]["area"], "test_room")
        self.assertEqual(areas[0]["navigation_path"], "area-test-room")

    def test_customer_navigation_does_not_add_discovery(self):
        # Presentation only: this does NOT certify WebSocket authorization.
        config = build_native_lovelace(fixture_model())
        self.assertNotIn("installer", [view["path"] for view in config["views"]])
        self.assertNotIn("custom:cl-control-discovery-card", json.dumps(config))

    def test_native_glass_surfaces_cover_all_views_without_losing_actions(self):
        model = fixture_model()
        model["admin_user_ids"] = ["synthetic-admin"]
        source = {"entity_id": "switch.test_oven", "name": "Forno di prova", "domain": "switch", "module": "switches"}
        model["areas"][0]["entities"]["switches"] = [source]
        for view in build_native_lovelace(model)["views"]:
            for card in cards(view):
                self.assertNotIn(card["type"], {"tile", "area", "button", "shortcut", "picture-entity"})
        area = next(view for view in build_native_lovelace(model)["views"] if view["path"] == "area-test-room")
        switches = [card["card"] for card in cards(area) if card["type"] == "custom:cl-control-home-surface" and card["card"].get("entity") == "switch.test_oven"]
        self.assertEqual(switches, [{"type": "tile", "entity": "switch.test_oven", "name": "Forno di prova"}])

    def test_shared_header_and_support_on_all_generated_views(self):
        model = fixture_model()
        model["assistance"] = {"whatsapp": "390000000000"}  # Synthetic; no message is sent.
        for view in build_native_lovelace(model)["views"]:
            headers = [card for card in cards(view) if card["type"] == "custom:cl-control-header-card"]
            support = [card for card in cards(view) if card["type"] == "custom:cl-control-assistance-card"]
            self.assertEqual(len(headers), 1, view["path"])
            self.assertEqual(len(support), 1, view["path"])
            self.assertEqual(headers[0]["grid_options"]["rows"], "auto")
            self.assertEqual(support[0]["grid_options"]["rows"], "auto")
            self.assertTrue(support[0]["url"].startswith("https://wa.me/390000000000?text="))

    def test_installer_shortcut_has_admin_visibility(self):
        model = fixture_model()
        model["admin_user_ids"] = ["synthetic-admin"]
        config = build_native_lovelace(model)
        home = next(view for view in config["views"] if view["path"] == "home")
        shortcuts = [card for card in cards(home) if card.get("card", card).get("tap_action", {}).get("navigation_path") == "installer"]
        self.assertTrue(shortcuts)
        self.assertTrue(all(card["visibility"] == [{"condition": "user", "users": ["synthetic-admin"]}] for card in shortcuts))
        self.assertTrue(all(card["card"]["visibility"] == card["visibility"] for card in shortcuts))

    def test_installer_panels_size_to_their_content(self):
        model = fixture_model()
        model["admin_user_ids"] = ["synthetic-admin"]
        installer = next(view for view in build_native_lovelace(model)["views"] if view["path"] == "installer")
        panels = [card for card in cards(installer) if card["type"] in {"custom:cl-control-installer-card", "custom:cl-control-discovery-card", "custom:cl-control-modbus-card"}]
        self.assertEqual(len(panels), 3)
        self.assertTrue(all(card["grid_options"]["rows"] == "auto" for card in panels))

    def test_layout_requires_both_admin_and_installer(self):
        for admin, unlocked in ((False, False), (False, True), (True, False)):
            self.assertFalse(layout_write_allowed(admin, unlocked))
        self.assertTrue(layout_write_allowed(True, True))

    def test_layout_drops_executable_properties(self):
        layout = normalize_layout({"base": {"lights": {"light.migration_test": {
            "type": "light", "tap_action": {"action": "perform-action", "perform_action": "light.turn_on"},
            "html": "<script>example</script>", "service": "light.turn_on", "url": "https://example.invalid",
        }}}})
        card = layout["base"]["lights"]["light.migration_test"]
        for forbidden in ("tap_action", "html", "service", "url"):
            self.assertNotIn(forbidden, card)

    def test_mobile_edit_and_reset_preserve_other_contexts(self):
        original = normalize_layout({"base": {"lights": {"light.migration_test": {"type": "light", "size": "m"}}}, "wall": {"climate": {"climate.migration_test": {"type": "thermostat", "size": "l"}}}})
        untouched = deepcopy(original)
        changed = update_layout_view(original, "mobile", "lights", {"light.migration_test": {"type": "light", "size": "s"}})
        self.assertEqual(original, untouched)
        self.assertEqual(changed["base"], original["base"])
        self.assertEqual(changed["wall"], original["wall"])
        self.assertEqual(reset_layout(changed, "mobile", "lights"), original)

    def test_lovelace_generation_does_not_mutate_model(self):
        model = fixture_model()
        original = deepcopy(model)
        first = build_native_lovelace(model)
        self.assertEqual(model, original)
        self.assertEqual(first, build_native_lovelace(model))

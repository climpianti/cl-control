"""Regressions for customer-facing area mode selectors in CL Control."""
from pathlib import Path
import unittest

from custom_components.cl_control.dashboard_native import (
    build_dashboard_model,
    build_native_lovelace,
)


class AreaSelectTests(unittest.TestCase):
    def model(self, entities, runtime=None):
        return build_dashboard_model(
            registry_entities=entities,
            areas=[{"id": "sala_ced", "name": "Sala CED"}],
            runtime=runtime or {},
            site={},
            branding={},
            version="3.5.3-beta.17",
            revision=1,
        )

    def cards(self, view):
        return [card for section in view.get("sections", []) for card in section.get("cards", [])]

    def test_input_select_is_available_and_usable_in_area(self):
        entity_id = "input_select.pdc_modalita_estate_inverno"
        model = self.model([
            {"entity_id": entity_id, "domain": "input_select", "area_id": "sala_ced", "name": "PDC Modalità Estate Inverno"}
        ])
        self.assertIn(entity_id, [item["entity_id"] for item in model["areas"][0]["entities"]["modes"]])
        config = build_native_lovelace(model)
        area = next(view for view in config["views"] if view["path"] == "area-sala-ced")
        cards = self.cards(area)
        self.assertTrue(any(c.get("type") == "heading" and c.get("heading") == "Modalità" for c in cards))
        card = next(c for c in cards if c.get("entity") == entity_id)
        self.assertEqual(card["type"], "tile")
        self.assertEqual(card["features"], [{"type": "select-options"}])

    def test_select_integration_and_favorites_use_same_native_control(self):
        entity_id = "select.water_heater_mode"
        model = self.model([
            {"entity_id": entity_id, "domain": "select", "area_id": "sala_ced", "name": "Modalità ACS"}
        ], runtime={"favorites": [entity_id]})
        config = build_native_lovelace(model)
        home = self.cards(config["views"][0])
        self.assertTrue(any(c.get("entity") == entity_id and c.get("features") == [{"type": "select-options"}] for c in home))

    def test_security_partition_selector_is_not_exposed_in_modes(self):
        entity_id = "select.partition_casa_mode"
        model = self.model([
            {"entity_id": entity_id, "domain": "select", "area_id": "sala_ced", "name": "Partition"}
        ], runtime={"entity_modules": {entity_id: "modes"}})
        self.assertEqual(model["areas"][0]["entities"]["modes"], [])

    def test_switch_classification_remains_unchanged(self):
        entity_id = "switch.caldo_on_freddo_off_pompa_di_calore"
        model = self.model([
            {"entity_id": entity_id, "domain": "switch", "area_id": "sala_ced", "name": "Shelly"}
        ])
        self.assertIn(entity_id, [e["entity_id"] for e in model["areas"][0]["entities"]["switches"]])

    def test_installer_orders_modes(self):
        source = (
            Path(__file__).resolve().parents[1] / "custom_components" / "cl_control"
            / "frontend" / "cl-control-installer-card.mjs"
        ).read_text(encoding="utf-8")
        self.assertIn("modes:'Modalità'", source)


if __name__ == "__main__":
    unittest.main()

"""CL Control beta.40: Pro area card layout and telemetry contracts."""
import unittest

from custom_components.cl_control.dashboard_native import build_dashboard_model, build_native_lovelace


def fixture(cls, entity, *, area="room", unit="", disabled=False):
    return {
        "entity_id": entity, "domain": entity.split(".")[0],
        "area_id": area, "device_class": cls, "unit_of_measurement": unit,
        "disabled": disabled,
    }


def home_cards(model):
    config = build_native_lovelace(model)
    home = next(view for view in config["views"] if view["path"] == "home")
    return [card.get("card", card) if card.get("type")=="custom:cl-control-home-surface" else card
            for section in home["sections"] for card in section.get("cards", [])]


class ProAreaCardTest(unittest.TestCase):
    def setUp(self):
        self.areas = [{"id": "room", "name": "Camera da letto", "icon": "mdi:bed",
                       "floor_id": "upper", "floor_name": "4° Piano"}]
        self.entities = [
            fixture("", "light.room"),
            fixture("temperature", "sensor.room_temperature", unit="°C"),
            fixture("humidity", "sensor.room_humidity", unit="%"),
            fixture("carbon_dioxide", "sensor.room_co2", unit="ppm"),
            fixture("motion", "binary_sensor.room_motion"),
            fixture("presence", "binary_sensor.room_presence"),
            fixture("power", "sensor.room_watts", unit="W"),
        ]

    def model(self, level="pro", **kwargs):
        return build_dashboard_model(
            registry_entities=kwargs.get("entities", self.entities),
            areas=self.areas, runtime={"experience_level": level},
            site={}, branding={}, version="3.5.3-beta.40", revision=1,
        )

    def test_pro_two_columns_with_all_metrics_and_navigation(self):
        model=self.model()
        cards=[c for c in home_cards(model) if c.get("type")=="custom:cl-control-area-pro-card"]
        self.assertEqual(len(cards), 1)
        card=cards[0]
        self.assertEqual(card["area"],"room")
        self.assertEqual(card["icon"],"mdi:bed")
        self.assertEqual(card["navigation_path"],"area-room")
        self.assertEqual(card["grid_options"]["columns"],6)
        self.assertEqual(card["telemetry"]["temperature"],["sensor.room_temperature"])
        self.assertEqual(card["telemetry"]["humidity"],["sensor.room_humidity"])
        self.assertEqual(card["telemetry"]["carbon_dioxide"],["sensor.room_co2"])
        self.assertEqual(card["telemetry"]["motion"],["binary_sensor.room_motion"])
        self.assertEqual(card["telemetry"]["presence"],["binary_sensor.room_presence"])
        self.assertIn("power",card["telemetry"])

    def test_essential_and_standard_stay_native(self):
        for level in ("essential","standard"):
            with self.subTest(level=level):
                cards=home_cards(self.model(level))
                self.assertFalse(any(c.get("type")=="custom:cl-control-area-pro-card" for c in cards))
                self.assertTrue(any(c.get("type")=="area" and c["area"]=="room" for c in cards))

    def test_no_source_does_not_invent_metric(self):
        model=self.model(entities=[fixture("", "light.room"),fixture("temperature","sensor.room_temperature",unit="°C")])
        area=next(c for c in home_cards(model) if c.get("type")=="custom:cl-control-area-pro-card")
        self.assertEqual(area["telemetry"]["humidity"],[])
        self.assertEqual(area["telemetry"]["carbon_dioxide"],[])
        self.assertEqual(area["telemetry"]["power"],[])

    def test_hidden_sensor_is_not_exposed(self):
        model=build_dashboard_model(
            registry_entities=self.entities,areas=self.areas,
            runtime={"experience_level":"pro",
                     "entity_visibility":{"sensor.room_co2":False}},
            site={},branding={},version="test",revision=1,
        )
        area=next(c for c in home_cards(model) if c.get("type")=="custom:cl-control-area-pro-card")
        self.assertEqual(area["telemetry"]["carbon_dioxide"],[])


if __name__=="__main__":
    unittest.main()

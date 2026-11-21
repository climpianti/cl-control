"""CL Control Alexa/Echo physical-device grouping regression tests."""
import unittest

from custom_components.cl_control.dashboard_native import (
    build_dashboard_model, build_native_lovelace,
)


def cards(view):
    return [
        entity for section in view["sections"]
        for card in section["cards"]
        for entity in [card, *(
            nested for group in card.get("groups", [])
            for nested in group.get("entities", [])
        )]
    ]


class AlexaMediaTests(unittest.TestCase):
    def model(self, entities, ui=None):
        return build_dashboard_model(
            registry_entities=entities,
            areas=[{"id": "bed", "name": "Camera da letto"},
                   {"id": "living", "name": "Soggiorno"}],
            runtime=ui or {}, site={}, branding={}, version="test", revision=1,
        )

    @staticmethod
    def echo():
        return {
            "entity_id": "media_player.echo_bed", "domain": "media_player",
            "platform": "alexa_media", "area_id": "bed", "device_id": "echo-1",
            "name": "Echo Show camera da letto",
        }

    @staticmethod
    def switch(id, device="echo-1", area="bed"):
        return {
            "entity_id": "switch." + id, "domain": "switch",
            "platform": "alexa_media", "device_id": device,
            "area_id": area, "name": "Echo Show camera da letto " + id,
        }

    def test_echo_switches_and_sensors_group_into_one_media_card(self):
        entities = [
            self.echo(),
            self.switch("mescolare"),
            self.switch("non_disturbare"),
            self.switch("ripetere"),
            {"entity_id": "sensor.echo_temperature", "platform": "alexa_media",
             "device_id": "echo-1", "area_id": "bed", "name": "Echo Temperatura"},
            {"entity_id": "select.echo_equalizer", "platform": "alexa_media",
             "device_id": "echo-1", "area_id": "bed", "name": "Equalizzatore"},
            self.switch("desk_lamp", device="other", area="bed"),
        ]
        model = self.model(entities)
        bed = next(area for area in model["areas"] if area["id"] == "bed")
        self.assertEqual(len(bed["entities"]["media"]), 1)
        self.assertEqual(
            [e["entity_id"] for e in bed["entities"]["switches"]],
            ["switch.desk_lamp"],
        )
        self.assertEqual(bed["entities"]["modes"], [])
        player = bed["entities"]["media"][0]
        grouped = {item["entity"] for item in player["alexa_entities"]}
        self.assertEqual(grouped, {
            "switch.mescolare", "switch.non_disturbare", "switch.ripetere",
            "sensor.echo_temperature", "select.echo_equalizer",
        })
        self.assertEqual(model["modules"]["media"]["count"], 1)
        for path in ("area-bed", "media"):
            view = next(v for v in build_native_lovelace(model)["views"]
                        if v["path"] == path)
            card = next(c for c in cards(view)
                        if c.get("entity") == "media_player.echo_bed")
            self.assertEqual({e["entity"] for e in card["alexa_entities"]}, grouped)
            self.assertEqual(card["type"], "custom:cl-control-media-card")

    def test_no_merge_for_same_name_on_different_device(self):
        model = self.model([self.echo(), self.switch("mescolare", device="echo-2")])
        bed = next(area for area in model["areas"] if area["id"] == "bed")
        self.assertNotIn("alexa_entities", bed["entities"]["media"][0])
        self.assertEqual(len(bed["entities"]["switches"]), 1)

    def test_explicit_hidden_disabled_and_manual_override_are_preserved(self):
        overridden = self.switch("ripetere")
        disabled = self.switch("disabilitato")
        disabled["disabled"] = True
        model = self.model([
            self.echo(), self.switch("mescolare"), overridden,
            self.switch("nascosto"), disabled,
        ], {
            "entity_visibility": {"switch.nascosto": False},
            "entity_modules": {"switch.ripetere": "switches"},
        })
        player = model["modules"]["media"]["entities"][0]
        self.assertEqual(
            [m["entity"] for m in player["alexa_entities"]],
            ["switch.mescolare"],
        )
        bed = next(area for area in model["areas"] if area["id"] == "bed")
        self.assertEqual([m["entity_id"] for m in bed["entities"]["switches"]],
                         ["switch.ripetere"])

    def test_member_assigned_to_another_room_remains_there(self):
        model = self.model([self.echo(), self.switch("salotto", area="living")])
        self.assertNotIn("alexa_entities", model["modules"]["media"]["entities"][0])
        living = next(a for a in model["areas"] if a["id"] == "living")
        self.assertEqual(len(living["entities"]["switches"]), 1)

    def test_unrelated_media_and_ambiguous_echo_not_absorbed(self):
        other = dict(self.echo(), entity_id="media_player.sonos", platform="sonos")
        model = self.model([other, self.switch("mescolare")])
        self.assertNotIn("alexa_entities", model["modules"]["media"]["entities"][0])
        multiple = self.model([
            self.echo(), dict(self.echo(), entity_id="media_player.echo_alt"),
            self.switch("mescolare"),
        ])
        self.assertTrue(all(
            "alexa_entities" not in item
            for item in multiple["modules"]["media"]["entities"]
        ))
        bed = next(a for a in multiple["areas"] if a["id"] == "bed")
        self.assertEqual(len(bed["entities"]["switches"]), 1)

    def test_legacy_media_card_unchanged_without_alexa_members(self):
        model = self.model([self.echo()])
        view = next(v for v in build_native_lovelace(model)["views"]
                    if v["path"] == "media")
        media_card = next(c for c in cards(view)
                          if c.get("entity") == "media_player.echo_bed")
        self.assertNotIn("alexa_entities", media_card)


if __name__ == "__main__":
    unittest.main()

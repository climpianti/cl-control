"""CL Control card power matching and dashboard contract."""
import unittest
from custom_components.cl_control.modules.card_power import resolve_card_power
from custom_components.cl_control.dashboard_native import build_dashboard_model, build_native_lovelace


def item(entity_id, device="device-1", *, power=False, unit="W", cls=None, source="", disabled=False):
    return {"entity_id": entity_id, "domain": entity_id.split(".")[0],
            "device_id": device, "area_id": "room",
            "disabled": disabled, "device_class": cls or ("power" if power else ""),
            "unit_of_measurement": unit if power else "",
            "source_entity_id": source}


class CardPowerTest(unittest.TestCase):
    def test_single_channel_switch_as_x(self):
        base="shelly1pmminig3_3030f9e759d0"
        source=f"switch.{base}"
        light=f"light.{base}"
        sensor=f"sensor.{base}_power"
        found=resolve_card_power([item(source),item(light,source=source),item(sensor,power=True)],{})
        self.assertEqual(found[light],sensor)
        self.assertEqual(found[source],sensor)

    def test_dual_channel_is_independent(self):
        base="shellyplus2pm_1c6920478fe4"
        entries=[]
        for channel in (0,1):
            entries += [item(f"light.{base}_switch_{channel}"),
                        item(f"sensor.{base}_switch_{channel}_power",power=True)]
        found=resolve_card_power(entries,{})
        for channel in (0,1):
            self.assertEqual(found[f"light.{base}_switch_{channel}"],
                             f"sensor.{base}_switch_{channel}_power")

    def test_ambiguous_sources_and_units_are_not_guessed(self):
        data=[item("switch.any"),item("sensor.a_power",power=True),
              item("sensor.b_power",power=True)]
        self.assertEqual(resolve_card_power(data,{}),{})
        data=[item("light.any"),item("sensor.a_power",power=True,unit="kWh")]
        self.assertEqual(resolve_card_power(data,{}),{})

    def test_manual_off_and_cross_device(self):
        records=[item("light.a"),item("sensor.knx_power","meter",power=True,unit="kW")]
        self.assertEqual(resolve_card_power(records,{}),{})
        self.assertEqual(resolve_card_power(records,
            {"light.a":{"mode":"manual","entity":"sensor.knx_power"}}),
            {"light.a":"sensor.knx_power"})
        self.assertEqual(resolve_card_power(records,{"light.a":{"mode":"off"}}),{})
        self.assertEqual(resolve_card_power(records,
            {"light.a":{"mode":"manual","entity":"sensor.not_found"}}),{})

    def test_area_cards_and_outlets(self):
        records=[item("light.lamp"),item("switch.socket",cls="outlet"),
                 item("switch.relay"),item("sensor.power",power=True)]
        overrides={"card_power":{
            "light.lamp":{"mode":"manual","entity":"sensor.power"},
            "switch.socket":{"mode":"manual","entity":"sensor.power"},
            "switch.relay":{"mode":"off"}}}
        model=build_dashboard_model(registry_entities=records,
            areas=[{"id":"room","name":"Room"}],runtime=overrides,
            site={},branding={},version="test",revision=1)
        view=next(v for v in build_native_lovelace(model)["views"] if v["path"]=="area-room")
        cards=[c for sec in view["sections"] for c in sec["cards"]]
        by_id=lambda eid:next(c for c in cards if c.get("entity")==eid)
        self.assertEqual(by_id("light.lamp")["power_entity"],"sensor.power")
        self.assertEqual(by_id("switch.socket")["type"],"custom:cl-control-switch-glass-card")
        self.assertEqual(by_id("switch.socket")["power_entity"],"sensor.power")
        self.assertNotIn("power_entity",by_id("switch.relay"))


if __name__=="__main__":
    unittest.main()

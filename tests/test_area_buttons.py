"""Area input_button and button command card regression."""
import unittest
from custom_components.cl_control.dashboard_native import build_dashboard_model, build_native_lovelace

class AreaButtonTests(unittest.TestCase):
    def test_input_button_appears_in_area_and_uses_glass_command(self):
        eid="input_button.apertura_scala"
        model=build_dashboard_model(registry_entities=[{"entity_id":eid,"domain":"input_button","area_id":"strada","name":"Apertura Scala"}],areas=[{"id":"strada","name":"Strada"}],runtime={},site={},branding={},version="3.5.3-beta.27",revision=1)
        self.assertIn(eid,[e["entity_id"] for e in model["areas"][0]["entities"]["commands"]])
        config=build_native_lovelace(model)
        view=next(v for v in config["views"] if v["path"]=="area-strada")
        cards=[c.get("card",c) for section in view["sections"] for c in section.get("cards",[])]
        card=next(c for c in cards if c.get("entity")==eid)
        self.assertEqual(card["type"],"custom:cl-control-command-glass-card")
        self.assertEqual(card["grid_options"]["columns"],"full")
    def test_button_domain_supported(self):
        model=build_dashboard_model(registry_entities=[{"entity_id":"button.test_action","domain":"button","area_id":"strada","name":"Azione"}],areas=[{"id":"strada","name":"Strada"}],runtime={},site={},branding={},version="3.5.3-beta.27",revision=1)
        self.assertEqual(model["areas"][0]["entities"]["commands"][0]["domain"],"button")
if __name__=="__main__":unittest.main()

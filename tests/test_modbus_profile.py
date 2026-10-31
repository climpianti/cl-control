"""Offline regression tests for read-only Modbus profile drafts."""
import json
import unittest
from custom_components.cl_control.modbus_profile import prepare_modbus_preview, validate_private_target

def fixture():
    return {"manufacturer":"Demo", "model":"Meter", "registers":[
        {"name":"Power","address":100,"register_type":"input","data_type":"int32","unit":"W","scale":0.1}
    ]}

class ModbusProfileTests(unittest.TestCase):
    def preview(self, profile=None):
        return prepare_modbus_preview(json.dumps(fixture() if profile is None else profile), "192.168.1.10", 502, 1)
    def test_read_only_preview(self):
        p=self.preview()
        self.assertFalse(p["applied"])
        self.assertIn("device_address: 1",p["yaml"])
        self.assertIn("input_type: input",p["yaml"])
    def test_reject_public_and_loopback(self):
        for host in ("8.8.8.8","127.0.0.1","localhost","169.254.1.1","224.0.0.1"):
            with self.subTest(host=host),self.assertRaises(ValueError):
                validate_private_target(host,502,1)
    def test_reject_bad_unit(self):
        with self.assertRaises(ValueError):
            validate_private_target("192.168.1.10",502,0)
    def test_duplicate_span(self):
        x=fixture()
        x["registers"].append({"name":"Overlap","address":101,"register_type":"input","data_type":"uint16"})
        with self.assertRaises(ValueError):
            self.preview(x)
    def test_reject_write_parameters(self):
        x=fixture()
        x["registers"][0]["access"]="write"
        with self.assertRaises(ValueError):
            self.preview(x)
    def test_reject_unbounded_register(self):
        x=fixture()
        x["registers"][0]["address"]=65535
        with self.assertRaises(ValueError):
            self.preview(x)
    def test_reject_invalid_scale(self):
        x=fixture()
        x["registers"][0]["scale"]=0
        with self.assertRaises(ValueError):
            self.preview(x)
    def test_reject_special_text(self):
        x=fixture()
        x["registers"][0]["name"]="evil\n  address: 0"
        with self.assertRaises(ValueError):
            self.preview(x)

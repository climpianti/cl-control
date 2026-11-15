"""Unit tests: discovery drafts never grant themselves approval."""
import unittest

from custom_components.cl_control.discovery_models import (
    DiscoveryProposal,
    KnxCandidate,
    ModbusProfileRegister,
    ModbusTarget,
)

class DiscoveryModelTests(unittest.TestCase):
    def test_knx_candidate_valid(self):
        x = KnxCandidate("0/0/1", "Luce ingresso", "1.001", "light")
        x.validate()

    def test_knx_bad_address(self):
        with self.assertRaises(ValueError):
            KnxCandidate("bad", "Luce", "1.001", "light").validate()

    def test_modbus_profile_read_only(self):
        ModbusProfileRegister("Temperatura", 100, "input", "int16", "C", 0.1).validate()

    def test_modbus_authorized_network(self):
        target = ModbusTarget("192.168.1.50")
        target.validate(("192.168.1.0/24",))
        with self.assertRaises(ValueError):
            target.validate(("10.10.10.0/24",))

    def test_no_default_network_permission(self):
        with self.assertRaises(ValueError):
            ModbusTarget("192.168.1.50").validate(())

    def test_no_implicit_approval(self):
        with self.assertRaises(ValueError):
            DiscoveryProposal("knx", "ets project", approved=True).validate()

    def test_protocol_mismatch(self):
        with self.assertRaises(ValueError):
            DiscoveryProposal("knx", "ets project", (ModbusProfileRegister("W", 1, "input", "uint16"),)).validate()

if __name__ == "__main__":
    unittest.main()

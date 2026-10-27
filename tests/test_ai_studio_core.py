"""Offline unit tests for AI Studio validation and mock generation."""
import asyncio
import json
import unittest

from custom_components.cl_control.ai_studio_core import (
    MockStudioProvider, StudioProposalError, StudioRequest, generate_draft, validate_proposal
)


class StudioTests(unittest.TestCase):
    def setUp(self):
        self.request = StudioRequest(
            instruction="Proponi le entita da configurare",
            inventory=(
                {"id": "knx:0/0/1", "type": "knx_entity", "name": "Luce ingresso"},
                {"id": "modbus:device1:100", "type": "modbus_sensor", "name": "Temperatura"},
            ),
        )

    def test_mock_draft(self):
        result = asyncio.run(generate_draft(MockStudioProvider(), self.request))
        self.assertEqual(result["status"], "draft")
        self.assertFalse(result["approved"])
        self.assertEqual(len(result["items"]), 2)

    def test_reject_unknown_id(self):
        payload = {"version": 1, "items": [
            {"source_id": "unknown", "type": "knx_entity", "name": "Unknown"}
        ]}
        with self.assertRaises(StudioProposalError):
            validate_proposal(json.dumps(payload), self.request)

    def test_reject_extra_write_field(self):
        payload = {"version": 1, "items": [
            {"source_id": "knx:0/0/1", "type": "knx_entity", "name": "Luce", "service": "turn_on"}
        ]}
        with self.assertRaises(StudioProposalError):
            validate_proposal(json.dumps(payload), self.request)

    def test_reject_wrong_type(self):
        payload = {"version": 1, "items": [
            {"source_id": "knx:0/0/1", "type": "modbus_sensor", "name": "Luce"}
        ]}
        with self.assertRaises(StudioProposalError):
            validate_proposal(json.dumps(payload), self.request)

    def test_reject_duplicate_inventory_ids(self):
        with self.assertRaises(StudioProposalError):
            StudioRequest("Test", ({"id": "x"}, {"id": "x"}))

    def test_reject_extra_root_fields(self):
        with self.assertRaises(StudioProposalError):
            validate_proposal('{"version":1,"items":[],"approved":true}', self.request)


if __name__ == "__main__":
    unittest.main()

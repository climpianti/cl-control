"""Offline unit tests for the KNX CSV importer and Modbus TCP probe."""
import asyncio
import unittest
from custom_components.cl_control.discovery_service import parse_knx_csv, probe_modbus_tcp

class DiscoveryServiceTests(unittest.TestCase):
    def test_knx_csv(self):
        result = parse_knx_csv(b'Name;Group Address;DPT\nLuce soggiorno;0/0/1;DPT 1.001\nStato;0/1/1;1.001\n')
        self.assertEqual(len(result), 2)
        self.assertEqual(result[0]['dpt'], '1.001')

    def test_no_invalid_address(self):
        with self.assertRaises(ValueError):
            parse_knx_csv(b'Name,Group Address,DPT\nTest,0/9/2,1.001\n')

    def test_duplicate_address(self):
        with self.assertRaises(ValueError):
            parse_knx_csv(b'Name,Group Address,DPT\nA,0/0/1,1.001\nB,0/0/1,1.001\n')

    def test_reject_unauthorized_target(self):
        with self.assertRaises(PermissionError):
            asyncio.run(probe_modbus_tcp('192.168.1.50', ('10.0.0.0/24',)))

    def test_reject_dns(self):
        with self.assertRaises(ValueError):
            asyncio.run(probe_modbus_tcp('localhost', ('127.0.0.0/8',)))

    def test_local_tcp_probe(self):
        async def run():
            server = await asyncio.start_server(lambda r,w: w.close(), '127.0.0.1', 0)
            try:
                port = server.sockets[0].getsockname()[1]
                result = await probe_modbus_tcp('127.0.0.1', ('127.0.0.1/32',), port)
                self.assertTrue(result.tcp_reachable)
                self.assertFalse(result.protocol_verified)
            finally:
                server.close()
                await server.wait_closed()
        asyncio.run(run())

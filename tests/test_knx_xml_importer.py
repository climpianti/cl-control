"""Offline tests for ETS GA-export XML importer."""
import unittest
from custom_components.cl_control.knx_xml_importer import import_ets_group_xml as parse

NS = 'http://knx.org/xml/ga-export/01'

def xml(inner):
    return f'<GroupAddress-Export xmlns="{NS}">{inner}</GroupAddress-Export>'.encode()

class KnxXmlImporterTests(unittest.TestCase):
    def test_basic_pair(self):
        body = ('<GroupRange Name="Comandi Luci"><GroupRange Name="Comandi">'
                '<GroupAddress Name="Luce A - Comando" Address="0/0/1" DPTs="DPST-1-6"/>'
                '</GroupRange><GroupRange Name="Stati">'
                '<GroupAddress Name="Luce A - Stato" Address="0/1/1" DPTs="DPST-1-6"/>'
                '</GroupRange></GroupRange>')
        result = parse(xml(body))
        self.assertEqual(result['summary']['matched_command_state'], 1)
        self.assertEqual(result['pairs'][0]['state'], '0/1/1')

    def test_mismatched_dpt_not_paired(self):
        body = ('<GroupRange Name="X"><GroupRange Name="Comandi">'
                '<GroupAddress Name="Luce A - Comando" Address="0/0/1" DPTs="DPST-1-6"/>'
                '</GroupRange><GroupRange Name="Stati">'
                '<GroupAddress Name="Luce A - Stato" Address="0/1/1" DPTs="DPST-5-1"/>'
                '</GroupRange></GroupRange>')
        self.assertIsNone(parse(xml(body))['pairs'][0]['state'])

    def test_invalid_group_address_rejected(self):
        with self.assertRaises(ValueError):
            parse(xml('<GroupAddress Name="X" Address="0/8/1"/>'))

    def test_duplicate_group_address_rejected(self):
        with self.assertRaises(ValueError):
            parse(xml('<GroupAddress Name="X" Address="0/0/1"/><GroupAddress Name="Y" Address="0/0/1"/>'))

    def test_doctype_rejected(self):
        with self.assertRaises(ValueError):
            parse(b'<!DOCTYPE a [<!ENTITY x SYSTEM "file:///etc/passwd">]>' + xml(''))

    def test_wrong_root_rejected(self):
        with self.assertRaises(ValueError):
            parse(b'<KNX/>')

    def test_access_control_requires_review(self):
        body = ('<GroupRange Name="X"><GroupRange Name="Comandi">'
                '<GroupAddress Name="Apertura Porta Ingresso - Comando" Address="0/0/48" DPTs="DPST-1-6"/>'
                '</GroupRange></GroupRange>')
        self.assertEqual(parse(xml(body))['pairs'][0]['status'], 'review_required')

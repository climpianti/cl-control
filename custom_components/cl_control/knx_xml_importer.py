"""Offline ETS group-address XML importer for CL Control Discovery.

Never communicates with a KNX bus or writes Home Assistant configuration.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from hashlib import sha256
import re
import unicodedata
import xml.etree.ElementTree as ET
from typing import Any

ETS_NS = 'http://knx.org/xml/ga-export/01'
Q = '{' + ETS_NS + '}'
DPT_RE = re.compile(r'^DPST-(\d{1,3})-(\d{1,3})$')
DTD_RE = re.compile(rb'<!\s*(?:DOCTYPE|ENTITY)\b', re.IGNORECASE)
MAX_BYTES = 4 * 1024 * 1024
MAX_GROUPS = 4096


def _ga_ok(addr: str) -> bool:
    p = addr.split('/')
    return (len(p) == 3 and all(x.isdecimal() for x in p)
            and 0 <= int(p[0]) <= 31 and 0 <= int(p[1]) <= 7
            and 0 <= int(p[2]) <= 255)


def _norm(name: str) -> str:
    s = unicodedata.normalize('NFKC', name).casefold().strip()
    s = re.sub(r'\s*[-–]?\s*\b(?:comando|stato)\b\s*$', '', s)
    s = re.sub(r'\s*\((?:comando|stato)\)\s*$', '', s)
    return ' '.join(re.findall(r'\w+', s))


def _category(name: str) -> str:
    s = _norm(name)
    if any(k in s for k in ('aprtura porta', 'apertura porta', 'serratura', 'apriporta', 'sblocco porta')):
        return 'access_control_review'
    if any(k in s for k in ('libera', 'da definire', 'riserva')):
        return 'unassigned'
    if any(k in s for k in ('termo arredo', 'testina radiante')):
        return 'hvac_load'
    if re.search(r'\b(pres[ae]|forno|induzione|lavastoviglie|bora|linea)\b', s):
        return 'switch_candidate'
    if re.search(r'\b(luc[ei]|faretti|led|pulsar|aplique|bonella|specchio|comodino)\b', s):
        return 'light_candidate'
    return 'unknown_review'


def _extract(xml: bytes) -> tuple[list[dict[str, Any]], list[str]]:
    if not isinstance(xml, bytes) or not xml or len(xml) > MAX_BYTES:
        raise ValueError('Invalid ETS XML size')
    if DTD_RE.search(xml):
        raise ValueError('DTD and entities are not permitted')
    root = ET.fromstring(xml)
    if root.tag != Q + 'GroupAddress-Export':
        raise ValueError('Expected ETS GroupAddress-Export (namespace /01)')
    rows: list[dict[str, Any]] = []
    warnings: list[str] = []
    seen: set[str] = set()

    def walk(parent: ET.Element, path: tuple[str, ...], depth: int) -> None:
        if depth > 8:
            raise ValueError('ETS XML nesting depth exceeded')
        for child in parent:
            if child.tag == Q + 'GroupRange':
                walk(child, path + (child.attrib.get('Name', '').strip(),), depth + 1)
            elif child.tag == Q + 'GroupAddress':
                if len(rows) >= MAX_GROUPS:
                    raise ValueError('Too many group addresses')
                address = child.attrib.get('Address', '').strip()
                name = child.attrib.get('Name', '').strip()
                if not _ga_ok(address):
                    raise ValueError('Unsupported or invalid 3-level group address')
                if not name or len(name) > 200 or address in seen:
                    raise ValueError('Blank/long name or duplicate group address')
                seen.add(address)
                raw = child.attrib.get('DPTs', '')
                dpts = []
                for token in raw.split(','):
                    token = token.strip()
                    if not token:
                        continue
                    m = DPT_RE.fullmatch(token)
                    if not m:
                        warnings.append('Unknown DPT expression at ' + address)
                        continue
                    dpts.append(f'{int(m.group(1))}.{int(m.group(2)):03d}')
                rows.append({'address': address, 'name': name, 'path': list(path),
                             'dpts': dpts, 'description': child.attrib.get('Description', '')})
            else:
                raise ValueError('Unexpected ETS XML element')
    walk(root, (), 0)
    return rows, warnings


def import_ets_group_xml(xml: bytes) -> dict[str, Any]:
    """Return read-only inventory and tentative pairing with provenance."""
    rows, warnings = _extract(xml)
    commands = [r for r in rows if len(r['path']) >= 2 and r['path'][-1].casefold() == 'comandi']
    states = [r for r in rows if len(r['path']) >= 2 and r['path'][-1].casefold() == 'stati']
    state_by_name: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for state in states:
        state_by_name[_norm(state['name'])].append(state)
    pairs: list[dict[str, Any]] = []
    for cmd in commands:
        matches = [s for s in state_by_name[_norm(cmd['name'])]
                   if cmd['dpts'] and s['dpts'] and set(cmd['dpts']) & set(s['dpts'])]
        category = _category(cmd['name'])
        match = matches[0] if len(matches) == 1 else None
        pairs.append({'name': _norm(cmd['name']), 'command': cmd['address'],
                      'state': match['address'] if match else None,
                      'category': category,
                      'status': 'review_required' if category in ('access_control_review', 'unassigned', 'unknown_review') or match is None else 'proposed',
                      'evidence': 'matching_name_and_dpt' if match else 'no_unique_matching_name_and_dpt'})
    climate = defaultdict(list)
    for row in rows:
        if len(row['path']) >= 2 and row['path'][0].casefold() == 'clima':
            climate[row['path'][1]].append(row)
    zones = []
    for name, ga_list in climate.items():
        seq = {int(row['address'].split('/')[-1]): row for row in ga_list}
        issues = []
        for a, b in ((1, 2), (3, 4), (5, 6), (7, 8), (9, 10)):
            if a in seq and b in seq and seq[a]['dpts'] != seq[b]['dpts']:
                issues.append({'problem': 'dpt_mismatch', 'command': seq[a]['address'], 'state': seq[b]['address']})
        if len(ga_list) != 11:
            issues.append({'problem': 'unexpected_group_address_count', 'count': len(ga_list)})
        zones.append({'name': name, 'addresses': len(ga_list), 'issues': issues,
                      'status': 'review_required' if issues else 'candidate'})
    dimmer_cmd = [row for row in rows if row['path'] and row['path'][-1].casefold() == 'dimmer']
    dimmer_state = [row for row in rows if row['path'] and row['path'][-1].casefold() == 'stato dimmer']
    dimmers = []
    for cmd in dimmer_cmd:
        suffix = cmd['address'].split('/')[-1]
        candidates = [state for state in dimmer_state if state['address'].split('/')[-1] == suffix]
        dimmers.append({'command': cmd['address'], 'name': cmd['name'],
                        'suggested_state': candidates[0]['address'] if len(candidates) == 1 else None,
                        'status': 'review_required', 'evidence': 'matching_numeric_suffix_only'})
    counters = Counter(row['dpts'][0] if row['dpts'] else 'untyped' for row in rows)
    return {
        'schema_version': 1, 'mode': 'read_only', 'sha256': sha256(xml).hexdigest(),
        'source': 'ets_group_address_export_xml',
        'summary': {'group_addresses': len(rows), 'command_state_candidates': len(pairs),
                    'matched_command_state': sum(bool(pair['state']) for pair in pairs),
                    'dimmers': len(dimmers), 'climate_zones': len(zones),
                    'climate_dpt_mismatches': sum(len(zone['issues']) for zone in zones),
                    'dpt_counts': dict(sorted(counters.items()))},
        'pairs': pairs, 'dimmers': dimmers, 'climate_zones': zones,
        'warnings': warnings,
        'notice': 'Not a KNX device inventory. Group-address export does not prove physical devices or communication-object bindings.'
    }

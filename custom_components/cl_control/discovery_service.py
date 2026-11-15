"""Opt-in KNX CSV import and Modbus TCP connectivity probe; no field writes."""
from __future__ import annotations
import asyncio
import csv
import io
import ipaddress
import re
from dataclasses import asdict, dataclass

GA = re.compile(r'^(\d{1,2})/(\d{1,3})/(\d{1,3})$')
DPT = re.compile(r'^(?:DPT\s*)?(\d{1,3}\.\d{1,3})$', re.I)
MAX_CSV_BYTES = 2_000_000
MAX_ROWS = 10000

@dataclass(frozen=True)
class KnxRow:
    name: str
    group_address: str
    dpt: str | None
    source: str = 'ets_csv'

def parse_knx_csv(data: bytes) -> list[dict]:
    """Parse normalized ETS CSV: Name, Group Address, DPT.
    No assumptions about associations between commands and states.
    """
    if not data or len(data) > MAX_CSV_BYTES:
        raise ValueError('CSV is empty or exceeds maximum size')
    content = data.decode('utf-8-sig')
    try:
        dialect = csv.Sniffer().sniff(content[:4096], delimiters=',;\t')
    except csv.Error:
        dialect = csv.excel
    rows = csv.DictReader(io.StringIO(content), dialect=dialect)
    if not rows.fieldnames:
        raise ValueError('Missing CSV header')
    columns = {c.strip().casefold(): c for c in rows.fieldnames}
    if not all(k in columns for k in ('name', 'group address', 'dpt')):
        raise ValueError('Expected Name, Group Address and DPT columns')
    result, addresses = [], set()
    for index, row in enumerate(rows):
        if index >= MAX_ROWS:
            raise ValueError('Too many CSV rows')
        name = (row.get(columns['name']) or '').strip()
        addr = (row.get(columns['group address']) or '').strip()
        raw_dpt = (row.get(columns['dpt']) or '').strip()
        match = GA.fullmatch(addr)
        if not match or any(int(v) > m for v, m in zip(match.groups(), (31, 7, 255))):
            raise ValueError(f'Invalid 3-level KNX address at row {index + 2}')
        dpt_match = DPT.fullmatch(raw_dpt) if raw_dpt else None
        if raw_dpt and not dpt_match:
            raise ValueError(f'Invalid DPT at row {index + 2}')
        if not name or len(name) > 160 or addr in addresses:
            raise ValueError(f'Invalid name or repeated address at row {index + 2}')
        addresses.add(addr)
        result.append(asdict(KnxRow(name, addr, dpt_match.group(1) if dpt_match else None)))
    return result

@dataclass(frozen=True)
class TcpProbeResult:
    address: str
    port: int
    tcp_reachable: bool
    protocol_verified: bool = False

async def probe_modbus_tcp(address: str, allowed_cidrs: tuple[str, ...], port: int = 502,
                           timeout: float = 0.7) -> TcpProbeResult:
    """Single installer-authorized IP probe; sends no Modbus protocol frames."""
    host = ipaddress.ip_address(address)
    if not allowed_cidrs or not any(host in ipaddress.ip_network(net, strict=False)
                                    for net in allowed_cidrs):
        raise PermissionError('Target is not in the installer-approved network list')
    if not 1 <= port <= 65535 or not 0.1 <= timeout <= 3.0:
        raise ValueError('Invalid port or timeout')
    try:
        reader, writer = await asyncio.wait_for(asyncio.open_connection(str(host), port), timeout)
        writer.close()
        await writer.wait_closed()
        return TcpProbeResult(str(host), port, True)
    except (OSError, asyncio.TimeoutError):
        return TcpProbeResult(str(host), port, False)

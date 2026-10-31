"""CL Modbus Discovery: validate an installer-supplied read-only register profile.

This module only prepares drafts. It never contacts a device, configures HA,
or guesses any manufacturer/register addresses.
"""
from __future__ import annotations

from hashlib import sha256
from ipaddress import ip_address, IPv4Address
import json
import math
import re
from typing import Any

MAX_PROFILE_BYTES = 64 * 1024
MAX_REGISTERS = 64
DATA_TYPES = {"int16": 1, "uint16": 1, "int32": 2, "uint32": 2, "float32": 2}
REGISTER_TYPES = {"input", "holding"}
KEYS = {"name", "address", "register_type", "data_type", "unit", "scale", "offset", "swap"}
TEXT = re.compile(r"^[^\x00-\x1f\x7f]{1,100}$")


def validate_private_target(host: str, port: int, unit_id: int = 1) -> str:
    """A single literal RFC1918 IPv4 target, never DNS/loopback/link-local."""
    if not isinstance(host, str):
        raise ValueError("Inserire un indirizzo IPv4 privato")
    try:
        value = ip_address(host)
    except ValueError as exc:
        raise ValueError("Indirizzo IPv4 non valido") from exc
    private = any(value in net for net in (
        __import__("ipaddress").ip_network("10.0.0.0/8"),
        __import__("ipaddress").ip_network("172.16.0.0/12"),
        __import__("ipaddress").ip_network("192.168.0.0/16"),
    ))
    if not isinstance(value, IPv4Address) or not private or value.is_multicast:
        raise ValueError("È consentito un solo IPv4 della rete privata")
    if type(port) is not int or not (1 <= port <= 65535):
        raise ValueError("Porta TCP non valida")
    if type(unit_id) is not int or not (1 <= unit_id <= 247):
        raise ValueError("Unit ID Modbus non valido (1-247)")
    return str(value)


def _number(value: Any, name: str, *, nonzero: bool = False) -> float:
    if type(value) not in (int, float) or not math.isfinite(value) or abs(value) > 1_000_000:
        raise ValueError(f"{name} non valido")
    if nonzero and value == 0:
        raise ValueError(f"{name} non può essere zero")
    return value


def _text(value: Any, name: str, max_len: int = 100) -> str:
    if not isinstance(value, str) or len(value) > max_len or not TEXT.fullmatch(value.strip()):
        raise ValueError(f"{name} non valido")
    return value.strip()


def _yaml_str(s: str) -> str:
    return json.dumps(s, ensure_ascii=True)


def prepare_modbus_preview(profile_json: str, host: str, port: int, unit_id: int) -> dict:
    """Strict profile -> explicit HA Modbus YAML preview. No writes, no probes."""
    target = validate_private_target(host, port, unit_id)
    if not isinstance(profile_json, str) or not 0 < len(profile_json.encode("utf-8")) <= MAX_PROFILE_BYTES:
        raise ValueError("Profilo JSON vuoto o troppo grande")
    try:
        obj = json.loads(profile_json)
    except (ValueError, TypeError) as exc:
        raise ValueError("Profilo JSON non valido") from exc
    if not isinstance(obj, dict) or set(obj) != {"manufacturer", "model", "registers"}:
        raise ValueError("Chiavi richieste: manufacturer, model, registers")
    manufacturer = _text(obj["manufacturer"], "Produttore", 80)
    model = _text(obj["model"], "Modello", 80)
    registers = obj["registers"]
    if not isinstance(registers, list) or not (1 <= len(registers) <= MAX_REGISTERS):
        raise ValueError("Inserire da 1 a 64 registri")
    parsed, occupied = [], set()
    for i, reg in enumerate(registers, 1):
        if not isinstance(reg, dict) or not {"name", "address", "register_type", "data_type"} <= set(reg) or set(reg) - KEYS:
            raise ValueError(f"Registro {i}: campi non validi")
        name = _text(reg["name"], f"Nome registro {i}")
        addr, kind, datatype = reg["address"], reg["register_type"], reg["data_type"]
        if type(addr) is not int or addr < 0 or addr > 65535:
            raise ValueError(f"Registro {i}: indirizzo non valido")
        if kind not in REGISTER_TYPES or datatype not in DATA_TYPES:
            raise ValueError(f"Registro {i}: tipo non valido")
        if addr + DATA_TYPES[datatype] > 65536:
            raise ValueError(f"Registro {i}: supera il limite")
        scale = _number(reg.get("scale", 1), f"Scala registro {i}", nonzero=True)
        offset = _number(reg.get("offset", 0), f"Offset registro {i}")
        unit = _text(reg["unit"], f"Unità registro {i}", 24) if "unit" in reg else None
        swap = reg.get("swap")
        if swap is not None and (swap not in {"byte", "word", "word_byte"} or
                                 (datatype in {"int16", "uint16"} and swap != "byte")):
            raise ValueError(f"Registro {i}: ordine byte/parole non valido")
        for pos in range(addr, addr + DATA_TYPES[datatype]):
            key = (kind, pos)
            if key in occupied:
                raise ValueError(f"Registro {i}: indirizzo sovrapposto")
            occupied.add(key)
        parsed.append({"name": name, "address": addr, "register_type": kind,
                       "data_type": datatype, "scale": scale, "offset": offset,
                       "unit": unit, "swap": swap})
    # Explicit transport and unit ID. YAML is never applied automatically.
    hub_name = "cl_" + re.sub(r"[^a-z0-9_]+", "_", (manufacturer + "_" + model).lower()).strip("_")[:55]
    lines = [
        "# BOZZA CL Discovery - NON APPLICATA",
        "# Verificare sul manuale indirizzi 0-based/1-based, DPT equivalenti,",
        "# ordine byte/parole, scala e identita del dispositivo prima di applicare.",
        "modbus:",
        f"  - name: {_yaml_str(hub_name)}",
        "    type: tcp",
        f"    host: {_yaml_str(target)}",
        f"    port: {port}",
        "    sensors:",
    ]
    for item in parsed:
        lines.extend([
            f"      - name: {_yaml_str(item['name'])}",
            f"        device_address: {unit_id}",
            f"        address: {item['address']}",
            f"        input_type: {item['register_type']}",
            f"        data_type: {item['data_type']}",
            f"        scale: {item['scale']}",
            f"        offset: {item['offset']}",
        ])
        if item["unit"] is not None:
            lines.append(f"        unit_of_measurement: {_yaml_str(item['unit'])}")
        if item["swap"] is not None:
            lines.append(f"        swap: {item['swap']}")
    return {
        "schema_version": 1, "status": "draft", "applied": False,
        "manufacturer": manufacturer, "model": model,
        "target": target, "port": port, "unit_id": unit_id,
        "register_count": len(parsed), "registers": parsed,
        "source_sha256": sha256(profile_json.encode("utf-8")).hexdigest(),
        "yaml": "\n".join(lines) + "\n",
        "warning": "La bozza non identifica il dispositivo e non legge i registri: confermare il manuale Modbus.",
    }

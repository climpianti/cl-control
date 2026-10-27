"""CL Discovery: safe, transport-independent discovery proposal models.

No bus access, network scanning, or Home Assistant mutations in this module.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from ipaddress import ip_address, ip_network
from typing import Literal
import re

GA_PATTERN = re.compile(r"^(?:\d{1,2}/\d{1,3}/\d{1,3}|\d{1,2}/\d{1,5}|\d{1,5})$")
DPT_PATTERN = re.compile(r"^\d{1,3}\.\d{1,3}$")

@dataclass(frozen=True)
class KnxCandidate:
    group_address: str
    name: str
    dpt: str | None
    function: str
    state_address: str | None = None
    provenance: Literal["ets", "knx_integration", "manual"] = "ets"

    def validate(self) -> None:
        if not GA_PATTERN.fullmatch(self.group_address):
            raise ValueError("Invalid KNX group address")
        if self.state_address and not GA_PATTERN.fullmatch(self.state_address):
            raise ValueError("Invalid KNX state address")
        if self.dpt and not DPT_PATTERN.fullmatch(self.dpt):
            raise ValueError("Invalid KNX DPT")
        if not self.name.strip() or not self.function.strip():
            raise ValueError("Missing KNX candidate metadata")

@dataclass(frozen=True)
class ModbusProfileRegister:
    name: str
    address: int
    register_type: Literal["input", "holding"]
    data_type: Literal["int16", "uint16", "int32", "uint32", "float32"]
    unit: str | None = None
    scale: float = 1.0
    offset: float = 0.0
    access: Literal["read"] = "read"

    def validate(self) -> None:
        if not 0 <= self.address <= 65535:
            raise ValueError("Modbus address out of bounds")
        if not self.name.strip():
            raise ValueError("Missing register name")
        if self.scale == 0:
            raise ValueError("Scale cannot be zero")

@dataclass(frozen=True)
class ModbusTarget:
    host: str
    port: int = 502
    unit_id: int = 1

    def validate(self, allowed_cidrs: tuple[str, ...]) -> None:
        if not allowed_cidrs:
            raise ValueError("No authorized target networks")
        ip = ip_address(self.host)
        if not any(ip in ip_network(cidr, strict=False) for cidr in allowed_cidrs):
            raise ValueError("Target outside authorized networks")
        if not (1 <= self.port <= 65535):
            raise ValueError("Invalid TCP port")
        if not (0 <= self.unit_id <= 247):
            raise ValueError("Invalid Modbus unit ID")

@dataclass(frozen=True)
class DiscoveryProposal:
    protocol: Literal["knx", "modbus"]
    source: str
    candidates: tuple[KnxCandidate | ModbusProfileRegister, ...] = field(default_factory=tuple)
    approved: bool = False

    def validate(self) -> None:
        if not self.source.strip():
            raise ValueError("Provenance required")
        if self.approved:
            raise ValueError("Discovery draft must not self-approve")
        for item in self.candidates:
            if self.protocol == "knx" and not isinstance(item, KnxCandidate):
                raise ValueError("Candidate protocol mismatch")
            if self.protocol == "modbus" and not isinstance(item, ModbusProfileRegister):
                raise ValueError("Candidate protocol mismatch")
            item.validate()

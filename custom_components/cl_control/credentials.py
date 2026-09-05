"""Backend-only credential storage for CL Control."""

from __future__ import annotations

import asyncio
from base64 import b64decode, b64encode
import hashlib
import hmac
import os
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import CREDENTIAL_STORAGE_KEY, CREDENTIAL_STORAGE_VERSION

PIN_ALGORITHM = "scrypt"
PIN_N = 2**14
PIN_R = 8
PIN_P = 1
PIN_DKLEN = 32
PIN_SALT_BYTES = 16


def hash_pin(pin: str, *, salt: bytes | None = None) -> dict[str, Any]:
    """Hash a PIN with a unique salt; never return the plaintext."""
    encoded = str(pin).encode("utf-8")
    actual_salt = salt if salt is not None else os.urandom(PIN_SALT_BYTES)
    digest = hashlib.scrypt(
        encoded,
        salt=actual_salt,
        n=PIN_N,
        r=PIN_R,
        p=PIN_P,
        dklen=PIN_DKLEN,
    )
    return {
        "algorithm": PIN_ALGORITHM,
        "salt": b64encode(actual_salt).decode("ascii"),
        "hash": b64encode(digest).decode("ascii"),
        "n": PIN_N,
        "r": PIN_R,
        "p": PIN_P,
        "dklen": PIN_DKLEN,
    }


def verify_pin(pin: str, record: Any) -> bool:
    """Verify a PIN in constant time against a supported credential record."""
    if not isinstance(record, dict) or record.get("algorithm") != PIN_ALGORITHM:
        return False
    try:
        salt = b64decode(str(record["salt"]), validate=True)
        expected = b64decode(str(record["hash"]), validate=True)
        digest = hashlib.scrypt(
            str(pin).encode("utf-8"),
            salt=salt,
            n=int(record.get("n", PIN_N)),
            r=int(record.get("r", PIN_R)),
            p=int(record.get("p", PIN_P)),
            dklen=int(record.get("dklen", PIN_DKLEN)),
        )
    except (KeyError, TypeError, ValueError):
        return False
    return hmac.compare_digest(digest, expected)


async def async_hash_pin(hass: HomeAssistant, pin: str) -> dict[str, Any]:
    """Hash outside the event loop."""
    if hasattr(hass, "async_add_executor_job"):
        return await hass.async_add_executor_job(hash_pin, pin)
    return await asyncio.to_thread(hash_pin, pin)


async def async_verify_pin(
    hass: HomeAssistant, pin: str, record: Any
) -> bool:
    """Verify outside the event loop."""
    if hasattr(hass, "async_add_executor_job"):
        return await hass.async_add_executor_job(verify_pin, pin, record)
    return await asyncio.to_thread(verify_pin, pin, record)


class CredentialStore:
    """Persist salted hashes separately from Config Entry and application state."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._hass = hass
        self._store = Store(
            hass, CREDENTIAL_STORAGE_VERSION, CREDENTIAL_STORAGE_KEY, private=True
        )
        self._lock = asyncio.Lock()

    async def _async_load_all(self) -> dict[str, Any]:
        saved = await self._store.async_load()
        if not isinstance(saved, dict):
            return {"schema_version": 1, "installations": {}}
        installations = saved.get("installations")
        if not isinstance(installations, dict):
            installations = {}
        return {"schema_version": 1, "installations": installations}

    async def async_get(self, installation_id: str) -> dict[str, Any] | None:
        """Return one installation credential bundle."""
        data = await self._async_load_all()
        value = data["installations"].get(installation_id)
        return dict(value) if isinstance(value, dict) else None

    async def async_set_pin(
        self, installation_id: str, name: str, pin: str
    ) -> dict[str, Any]:
        """Hash and persist one named PIN without retaining plaintext."""
        if name not in {"installer_pin", "security_pin"}:
            raise ValueError("Unsupported credential name")
        record = await async_hash_pin(self._hass, pin)
        async with self._lock:
            data = await self._async_load_all()
            installation = dict(data["installations"].get(installation_id) or {})
            installation[name] = record
            data["installations"][installation_id] = installation
            await self._store.async_save(data)
        return record

    async def async_set_hashed(
        self, installation_id: str, name: str, record: dict[str, Any]
    ) -> None:
        """Persist an already-hashed PIN record."""
        if name not in {"installer_pin", "security_pin"} or not isinstance(
            record, dict
        ):
            raise ValueError("Invalid credential record")
        async with self._lock:
            data = await self._async_load_all()
            installation = dict(data["installations"].get(installation_id) or {})
            installation[name] = dict(record)
            data["installations"][installation_id] = installation
            await self._store.async_save(data)


__all__ = (
    "CredentialStore",
    "async_hash_pin",
    "async_verify_pin",
    "hash_pin",
    "verify_pin",
)

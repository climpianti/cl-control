"""Signed, provider-neutral CL Control update distribution primitives."""

from __future__ import annotations

from abc import ABC, abstractmethod
import base64
import asyncio
from dataclasses import dataclass
from datetime import datetime
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import tempfile
from typing import Any, Mapping
from zipfile import BadZipFile, ZipFile

from .const import (
    CONFIG_ENTRY_VERSION,
    LAYOUT_SCHEMA_VERSION,
    RUNTIME_SCHEMA_VERSION,
    UPDATE_MANIFEST_SCHEMA_VERSION,
    VERSION,
)

MAX_ARTIFACT_SIZE = 32 * 1024 * 1024
MAX_EXPANDED_SIZE = 96 * 1024 * 1024
ARCHIVE_ROOT = PurePosixPath("custom_components/cl_control")
REQUIRED_ARCHIVE_FILES = {"__init__.py", "manifest.json"}
CHANNELS = ("stable", "beta", "dev")
PUBLIC_KEYS_FILE = Path(__file__).with_name("release_public_keys.json")
_SEMVER = re.compile(
    r"^(?P<major>0|[1-9]\d*)\.(?P<minor>0|[1-9]\d*)\.(?P<patch>0|[1-9]\d*)"
    r"(?:-(?P<pre>[0-9A-Za-z.-]+))?$"
)


class DistributionError(RuntimeError):
    """Base class for safe update failures."""


class ManifestError(DistributionError):
    """Release metadata is malformed or incompatible."""


class AuthorizationError(DistributionError):
    """The installation is not authorized for a release."""


class IntegrityError(DistributionError):
    """Artifact integrity or archive layout is invalid."""


class BackupError(DistributionError):
    """A required backup could not be created."""


@dataclass(frozen=True, order=True)
class SemVer:
    """Small deterministic SemVer subset used by the release contract."""

    major: int
    minor: int
    patch: int
    prerelease: tuple[tuple[int, str], ...] = ()

    @classmethod
    def parse(cls, value: str) -> "SemVer":
        match = _SEMVER.fullmatch(str(value))
        if not match:
            raise ManifestError(f"Invalid semantic version: {value!r}")
        pre = match.group("pre")
        parts = tuple(
            (0, item) if item.isdigit() else (1, item.lower())
            for item in pre.split(".")
        ) if pre else ((2, ""),)
        return cls(
            int(match.group("major")), int(match.group("minor")),
            int(match.group("patch")), parts,
        )

    @property
    def is_prerelease(self) -> bool:
        return self.prerelease != ((2, ""),)


def canonical_manifest_bytes(raw: Mapping[str, Any]) -> bytes:
    """Canonical signed payload, excluding only the signature value."""
    value = json.loads(json.dumps(raw))
    signing = value.get("signing")
    if isinstance(signing, dict):
        signing.pop("signature", None)
    return json.dumps(
        value, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    ).encode("utf-8")


@dataclass(frozen=True)
class ReleaseManifest:
    raw: Mapping[str, Any]
    version: str
    channel: str
    summary: str
    notes: str
    release_url: str
    artifact_url: str
    sha256: str
    size: int
    requires_restart: bool

    @classmethod
    def parse(cls, raw: Any) -> "ReleaseManifest":
        if not isinstance(raw, Mapping):
            raise ManifestError("Release manifest must be a mapping")
        required = {"schema", "product", "version", "channel", "published_at", "artifact", "compatibility", "release", "signing"}
        if not required.issubset(raw):
            raise ManifestError("Release manifest is incomplete")
        if raw["schema"] != UPDATE_MANIFEST_SCHEMA_VERSION or raw["product"] != "cl_control":
            raise ManifestError("Unsupported release manifest schema or product")
        version = str(raw["version"])
        SemVer.parse(version)
        channel = str(raw["channel"])
        if channel not in CHANNELS:
            raise ManifestError("Unknown release channel")
        try:
            datetime.fromisoformat(str(raw["published_at"]).replace("Z", "+00:00"))
        except ValueError as err:
            raise ManifestError("Release timestamp is invalid") from err
        artifact, compatibility, release, signing = raw["artifact"], raw["compatibility"], raw["release"], raw["signing"]
        if not all(isinstance(item, Mapping) for item in (artifact, compatibility, release, signing)):
            raise ManifestError("Malformed release manifest sections")
        sha256 = str(artifact.get("sha256", "")).lower()
        if not re.fullmatch(r"[0-9a-f]{64}", sha256):
            raise ManifestError("Artifact SHA-256 is required")
        size = artifact.get("size")
        if not isinstance(size, int) or not 0 < size <= MAX_ARTIFACT_SIZE:
            raise ManifestError("Artifact size is invalid")
        if artifact.get("format") != "zip" or artifact.get("root") != str(ARCHIVE_ROOT):
            raise ManifestError("Unsupported artifact format or root")
        if not str(artifact.get("url", "")):
            raise ManifestError("Artifact URL is required")
        if signing.get("algorithm") != "ed25519" or not signing.get("key_id") or not signing.get("signature"):
            raise ManifestError("Ed25519 signature metadata is required")
        return cls(
            raw=raw, version=version, channel=channel,
            summary=str(release.get("summary", ""))[:255],
            notes=str(release.get("notes", "")),
            release_url=str(release.get("url", "")),
            artifact_url=str(artifact.get("url", "")), sha256=sha256,
            size=size, requires_restart=bool(raw.get("requires_restart", True)),
        )


@dataclass(frozen=True)
class CompatibilityContext:
    home_assistant_version: str
    runtime_schema: int = RUNTIME_SCHEMA_VERSION
    layout_schema: int = LAYOUT_SCHEMA_VERSION
    config_entry_version: int = CONFIG_ENTRY_VERSION


def _version_core(value: str) -> tuple[int, int, int]:
    match = re.match(r"^(\d+)\.(\d+)\.(\d+)", str(value))
    if not match:
        raise ManifestError(f"Invalid Home Assistant version: {value!r}")
    return tuple(map(int, match.groups()))


def validate_release(
    manifest: ReleaseManifest, *, installed: str, selected_channel: str,
    compatibility: CompatibilityContext, allow_downgrade: bool = False,
) -> None:
    """Apply channel, downgrade and schema compatibility policy."""
    if selected_channel not in CHANNELS:
        raise ManifestError("Configured release channel is invalid")
    candidate = SemVer.parse(manifest.version)
    current = SemVer.parse(installed)
    if candidate < current and not allow_downgrade:
        raise ManifestError("Downgrade is not allowed")
    if selected_channel == "stable" and candidate.is_prerelease:
        raise AuthorizationError("Prerelease is not allowed on stable channel")
    if selected_channel == "beta" and manifest.channel == "dev":
        raise AuthorizationError("Development release is not allowed on beta channel")
    authorization = manifest.raw.get("authorization", {})
    if not isinstance(authorization, Mapping):
        raise ManifestError("Authorization metadata is malformed")
    if selected_channel == "dev" and manifest.channel == "dev" and not bool(authorization.get("dev", False)):
        raise AuthorizationError("Development channel is not authorized for this installation")
    comp = manifest.raw["compatibility"]
    if comp.get("rollback_safe") is not True:
        raise ManifestError("Release does not declare safe rollback compatibility")
    minimum_ha = str(comp.get("minimum_home_assistant", "0.0.0"))
    if _version_core(compatibility.home_assistant_version) < _version_core(minimum_ha):
        raise ManifestError("Home Assistant version is not compatible")
    try:
        for name, actual in (
            ("runtime_schema", compatibility.runtime_schema),
            ("layout_schema", compatibility.layout_schema),
        ):
            bounds = comp.get(name, {})
            if not isinstance(bounds, Mapping) or not int(bounds.get("min", -1)) <= actual <= int(bounds.get("max", -1)):
                raise ManifestError(f"{name} is not compatible")
        entry = comp.get("config_entry", {})
        if not isinstance(entry, Mapping) or int(entry.get("major", -1)) != compatibility.config_entry_version:
            raise ManifestError("Config Entry schema is not compatible")
    except (TypeError, ValueError) as err:
        raise ManifestError("Compatibility metadata is malformed") from err


def load_public_keys(path: Path = PUBLIC_KEYS_FILE) -> dict[str, bytes]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    return {str(key): base64.b64decode(value, validate=True) for key, value in raw["keys"].items()}


def verify_manifest_signature(manifest: ReleaseManifest, public_keys: Mapping[str, bytes]) -> None:
    """Verify the signed metadata before downloading or opening the ZIP."""
    from cryptography.exceptions import InvalidSignature
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

    signing = manifest.raw["signing"]
    key = public_keys.get(str(signing["key_id"]))
    if key is None:
        raise IntegrityError("Unknown release signing key")
    try:
        signature = base64.b64decode(str(signing["signature"]), validate=True)
        Ed25519PublicKey.from_public_bytes(key).verify(signature, canonical_manifest_bytes(manifest.raw))
    except (ValueError, InvalidSignature) as err:
        raise IntegrityError("Release signature is invalid") from err


def validate_artifact(manifest: ReleaseManifest, payload: bytes) -> tuple[str, ...]:
    """Verify size, digest and strict archive containment before extraction."""
    if len(payload) != manifest.size:
        raise IntegrityError("Artifact size does not match the manifest")
    if hashlib.sha256(payload).hexdigest() != manifest.sha256:
        raise IntegrityError("Artifact SHA-256 does not match the manifest")
    names: list[str] = []
    try:
        with ZipFile(io.BytesIO(payload)) as archive:
            seen: set[str] = set()
            component_files: set[str] = set()
            expanded_size = 0
            for info in archive.infolist():
                name = info.filename
                path = PurePosixPath(name)
                if "\\" in name or path.is_absolute() or ".." in path.parts or name in seen:
                    raise IntegrityError("Archive contains an unsafe or duplicate path")
                seen.add(name)
                if tuple(path.parts[:2]) != tuple(ARCHIVE_ROOT.parts):
                    raise IntegrityError("Archive contains files outside CL Control")
                if (info.external_attr >> 16) & 0o170000 == 0o120000:
                    raise IntegrityError("Archive symbolic links are forbidden")
                if not info.is_dir():
                    relative = str(PurePosixPath(*path.parts[2:]))
                    expanded_size += info.file_size
                    if expanded_size > MAX_EXPANDED_SIZE:
                        raise IntegrityError("Expanded artifact exceeds the safety limit")
                    basename = path.name.lower()
                    if basename in {"secrets.yaml", ".env"} or basename.endswith((".pem", ".key", ".p12", ".pfx", ".db", ".sqlite", ".sqlite3")):
                        raise IntegrityError("Archive contains a forbidden sensitive/runtime file")
                    component_files.add(relative)
                    names.append(name)
            if not REQUIRED_ARCHIVE_FILES.issubset(component_files):
                raise IntegrityError("Artifact runtime is incomplete")
            bundled = json.loads(archive.read(f"{ARCHIVE_ROOT}/manifest.json"))
            if bundled.get("domain") != "cl_control" or bundled.get("version") != manifest.version:
                raise IntegrityError("Bundled manifest identity/version mismatch")
    except (BadZipFile, KeyError, json.JSONDecodeError) as err:
        raise IntegrityError("Artifact ZIP is corrupt") from err
    return tuple(sorted(names))


class DistributionProvider(ABC):
    """Gateway boundary; customer UI never knows transport or credentials."""

    @abstractmethod
    async def async_latest_manifest(self, installation_id: str, channel: str) -> Mapping[str, Any] | None:
        pass

    @abstractmethod
    async def async_download_artifact(self, installation_id: str, manifest: ReleaseManifest) -> bytes:
        pass

    async def async_release_notes(self, installation_id: str, manifest: ReleaseManifest) -> str:
        return manifest.notes


class MockDistributionProvider(DistributionProvider):
    """No-network provider for tests and this disabled-by-default Phase C."""

    def __init__(self, manifest: Mapping[str, Any] | None = None, artifact: bytes = b"", *, authorized: bool = True, allowed_channels: tuple[str, ...] = CHANNELS):
        self.manifest, self.artifact, self.authorized = manifest, artifact, authorized
        self.allowed_channels = allowed_channels
        self.calls = {"manifest": 0, "download": 0}

    @classmethod
    def offline(cls) -> "MockDistributionProvider":
        return cls(None)

    async def async_latest_manifest(self, installation_id: str, channel: str) -> Mapping[str, Any] | None:
        self.calls["manifest"] += 1
        if not self.authorized:
            raise AuthorizationError("Installation is not authorized")
        if channel not in self.allowed_channels:
            raise AuthorizationError("Release channel is not authorized")
        return self.manifest

    async def async_download_artifact(self, installation_id: str, manifest: ReleaseManifest) -> bytes:
        self.calls["download"] += 1
        if not self.authorized or not manifest.artifact_url.startswith(("mock://", "local://")):
            raise AuthorizationError("Artifact source is not authorized")
        return self.artifact


class LocalDistributionProvider(DistributionProvider):
    """Filesystem provider for isolated lab validation; never follows URLs."""

    def __init__(self, manifest_path: Path, artifact_root: Path, *, authorized: bool = True, allowed_channels: tuple[str, ...] = CHANNELS):
        self.manifest_path = manifest_path.resolve()
        self.artifact_root = artifact_root.resolve()
        self.authorized = authorized
        self.allowed_channels = allowed_channels

    async def async_latest_manifest(self, installation_id: str, channel: str) -> Mapping[str, Any] | None:
        if not self.authorized:
            raise AuthorizationError("Installation is not authorized")
        if channel not in self.allowed_channels:
            raise AuthorizationError("Release channel is not authorized")
        return json.loads(await asyncio.to_thread(self.manifest_path.read_text, encoding="utf-8"))

    async def async_download_artifact(self, installation_id: str, manifest: ReleaseManifest) -> bytes:
        if not self.authorized or not manifest.artifact_url.startswith("local://"):
            raise AuthorizationError("Artifact source is not authorized")
        relative = PurePosixPath(manifest.artifact_url.removeprefix("local://"))
        if relative.is_absolute() or ".." in relative.parts:
            raise AuthorizationError("Artifact path is not authorized")
        path = self.artifact_root.joinpath(*relative.parts).resolve()
        if not path.is_relative_to(self.artifact_root):
            raise AuthorizationError("Artifact path escapes the authorized root")
        return await asyncio.to_thread(path.read_bytes)


class HomeAssistantBackupProvider:
    """Use HA's backup service; failure blocks every Phase C installation."""

    def __init__(self, hass: Any):
        self.hass = hass

    async def async_create(self, name: str) -> None:
        services = self.hass.services
        if not services.has_service("backup", "create_automatic"):
            raise BackupError("Home Assistant backup service is unavailable")
        try:
            # The native automatic-backup action intentionally has no payload;
            # its policy and location are owned by Home Assistant.
            await services.async_call("backup", "create_automatic", {}, blocking=True)
        except Exception as err:
            raise BackupError("Home Assistant backup failed") from err


class RuntimeInstaller:
    """Stage and swap only custom_components/cl_control, with local rollback."""

    def __init__(self, component_path: Path, work_root: Path):
        self.component_path = component_path.resolve()
        self.work_root = work_root.resolve()

    def install(self, manifest: ReleaseManifest, payload: bytes) -> Path:
        validate_artifact(manifest, payload)
        self.work_root.mkdir(parents=True, exist_ok=True)
        operation = Path(tempfile.mkdtemp(prefix="install-", dir=self.work_root))
        extracted, incoming = operation / "extracted", operation / "incoming"
        rollback = operation / "rollback"
        try:
            with ZipFile(io.BytesIO(payload)) as archive:
                archive.extractall(extracted)
            source = extracted / ARCHIVE_ROOT
            shutil.copytree(source, incoming)
            # Validate the copied tree again before touching the running runtime.
            bundled = json.loads((incoming / "manifest.json").read_text(encoding="utf-8"))
            if bundled.get("version") != manifest.version:
                raise IntegrityError("Staged runtime version mismatch")
            if self.component_path.exists():
                os.replace(self.component_path, rollback)
            try:
                os.replace(incoming, self.component_path)
            except Exception:
                if rollback.exists() and not self.component_path.exists():
                    os.replace(rollback, self.component_path)
                raise
            return rollback
        except Exception:
            if rollback.exists() and not self.component_path.exists():
                os.replace(rollback, self.component_path)
            raise

    def rollback(self, rollback: Path) -> None:
        """Recover the previous runtime without touching customer data."""
        rollback = rollback.resolve()
        if rollback.parent != self.work_root and rollback.parent.parent != self.work_root:
            raise IntegrityError("Rollback source is outside the updater work area")
        if not (rollback / "manifest.json").is_file():
            raise IntegrityError("Rollback runtime is incomplete")
        failed = rollback.parent / "failed-runtime"
        if failed.exists():
            shutil.rmtree(failed)
        os.replace(self.component_path, failed)
        try:
            os.replace(rollback, self.component_path)
        except Exception:
            os.replace(failed, self.component_path)
            raise


class UpdateManager:
    """Single state/controller shared by the native entity and Installer UI."""

    def __init__(self, *, hass: Any, entry: Any, provider: DistributionProvider, release_channel: str, public_keys: Mapping[str, bytes] | None = None, backup_provider: Any | None = None):
        self.hass, self.entry, self.provider = hass, entry, provider
        self.release_channel = release_channel
        self.public_keys = dict(public_keys) if public_keys is not None else load_public_keys()
        self.backup_provider = backup_provider or HomeAssistantBackupProvider(hass)
        self.manifest: ReleaseManifest | None = None
        self.error: str | None = None
        self.in_progress = False
        self.progress: int | None = None
        self.restart_required = False
        self.rollback_path: Path | None = None

    async def async_refresh(self) -> None:
        self.error = None
        installation_id = str(self.entry.data["installation_id"])
        try:
            raw = await self.provider.async_latest_manifest(installation_id, self.release_channel)
            if raw is None:
                self.manifest = None
                return
            candidate = ReleaseManifest.parse(raw)
            configured_version = getattr(getattr(self.hass, "config", None), "version", None)
            if not configured_version:
                try:
                    from homeassistant.const import __version__ as configured_version
                except ImportError:
                    configured_version = "0.0.0"
            validate_release(
                candidate, installed=VERSION, selected_channel=self.release_channel,
                compatibility=CompatibilityContext(str(configured_version)),
            )
            verify_manifest_signature(candidate, self.public_keys)
            self.manifest = candidate
        except DistributionError as err:
            self.manifest = None
            self.error = str(err)

    async def async_release_notes(self) -> str | None:
        if self.manifest is None:
            return None
        return await self.provider.async_release_notes(str(self.entry.data["installation_id"]), self.manifest)

    async def async_install(self, version: str | None = None) -> None:
        if self.manifest is None:
            raise ManifestError("No verified release is available")
        if version is not None and version != self.manifest.version:
            raise ManifestError("Requested version is not the verified release")
        self.in_progress, self.progress = True, 5
        try:
            await self.backup_provider.async_create(f"CL Control pre-update {VERSION}")
            self.progress = 20
            payload = await self.provider.async_download_artifact(str(self.entry.data["installation_id"]), self.manifest)
            self.progress = 45
            validate_artifact(self.manifest, payload)
            self.progress = 65
            component_path = Path(self.hass.config.path("custom_components", "cl_control"))
            installer = RuntimeInstaller(component_path, Path(self.hass.config.path(".cl_control_update")))
            self.rollback_path = await self.hass.async_add_executor_job(installer.install, self.manifest, payload)
            self.progress = 100
            self.restart_required = self.manifest.requires_restart
            self.error = None
        except DistributionError as err:
            self.error = str(err)
            raise
        except Exception as err:
            self.error = "Runtime installation failed; previous runtime was retained"
            raise DistributionError(self.error) from err
        finally:
            self.in_progress = False


__all__ = (
    "AuthorizationError", "BackupError", "CompatibilityContext", "DistributionError",
    "DistributionProvider", "IntegrityError", "LocalDistributionProvider", "ManifestError", "MockDistributionProvider",
    "ReleaseManifest", "RuntimeInstaller", "SemVer", "UpdateManager", "canonical_manifest_bytes",
    "load_public_keys", "validate_artifact", "validate_release", "verify_manifest_signature",
)

"""Signed update contract, provider and safe runtime swap tests."""

from __future__ import annotations

import base64
import hashlib
import importlib
import io
import json
from pathlib import Path
import sys
import tempfile
import types
import unittest
from zipfile import ZIP_DEFLATED, ZipFile

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / "custom_components" / "cl_control"
package = types.ModuleType("cl_update_test")
package.__path__ = [str(PACKAGE)]
sys.modules.setdefault("cl_update_test", package)
distribution = importlib.import_module("cl_update_test.distribution")


def artifact(version="3.3.1", *, extra=None):
    stream = io.BytesIO()
    with ZipFile(stream, "w", ZIP_DEFLATED) as archive:
        archive.writestr("custom_components/cl_control/__init__.py", "# release\n")
        archive.writestr("custom_components/cl_control/manifest.json", json.dumps({"domain": "cl_control", "version": version}))
        if extra:
            archive.writestr(*extra)
    return stream.getvalue()


def signed_manifest(private, payload, *, version="3.3.1", channel="stable", dev=False, sha=None, size=None):
    raw = {
        "schema": 1, "product": "cl_control", "version": version, "channel": channel,
        "published_at": "2026-09-08T00:00:00Z",
        "requires_restart": True, "authorization": {"dev": dev},
        "compatibility": {
            "minimum_home_assistant": "2026.9.0",
            "runtime_schema": {"min": 2, "max": 2},
            "layout_schema": {"min": 1, "max": 1},
            "config_entry": {"major": 1, "minor": 0},
            "rollback_safe": True,
        },
        "artifact": {"url": "mock://release.zip", "sha256": sha or hashlib.sha256(payload).hexdigest(), "size": len(payload) if size is None else size, "format": "zip", "root": "custom_components/cl_control"},
        "release": {"summary": "Release", "notes": "Notes", "url": "https://example.invalid/release"},
        "signing": {"algorithm": "ed25519", "key_id": "test", "signature": ""},
    }
    raw["signing"]["signature"] = base64.b64encode(private.sign(distribution.canonical_manifest_bytes(raw))).decode()
    return raw


class UpdateSystemTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.private = Ed25519PrivateKey.generate()
        self.public = self.private.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
        self.payload = artifact()

    def parsed(self, **kwargs):
        return distribution.ReleaseManifest.parse(signed_manifest(self.private, self.payload, **kwargs))

    def test_valid_signature_hash_and_archive(self):
        manifest = self.parsed()
        distribution.verify_manifest_signature(manifest, {"test": self.public})
        names = distribution.validate_artifact(manifest, self.payload)
        self.assertIn("custom_components/cl_control/manifest.json", names)

    def test_malformed_missing_hash_bad_signature_and_corrupt_zip(self):
        raw = signed_manifest(self.private, self.payload)
        raw["artifact"].pop("sha256")
        with self.assertRaises(distribution.ManifestError):
            distribution.ReleaseManifest.parse(raw)
        raw = signed_manifest(self.private, self.payload)
        raw["release"]["summary"] = "tampered"
        with self.assertRaises(distribution.IntegrityError):
            distribution.verify_manifest_signature(distribution.ReleaseManifest.parse(raw), {"test": self.public})
        corrupt = b"not-a-zip"
        manifest = distribution.ReleaseManifest.parse(signed_manifest(self.private, corrupt))
        with self.assertRaises(distribution.IntegrityError):
            distribution.validate_artifact(manifest, corrupt)

    def test_hash_size_and_zip_path_safety(self):
        bad_hash = self.parsed(sha="0" * 64)
        with self.assertRaises(distribution.IntegrityError):
            distribution.validate_artifact(bad_hash, self.payload)
        bad_size = self.parsed(size=len(self.payload) + 1)
        with self.assertRaises(distribution.IntegrityError):
            distribution.validate_artifact(bad_size, self.payload)
        unsafe = artifact(extra=("custom_components/cl_control/../../secrets.yaml", "no"))
        manifest = distribution.ReleaseManifest.parse(signed_manifest(self.private, unsafe))
        with self.assertRaises(distribution.IntegrityError):
            distribution.validate_artifact(manifest, unsafe)

    def test_channels_authorization_downgrade_and_compatibility(self):
        context = distribution.CompatibilityContext("2026.9.1")
        stable = self.parsed()
        distribution.validate_release(stable, installed="3.3.0-dev", selected_channel="stable", compatibility=context)
        beta = self.parsed(version="3.4.0-beta.1", channel="beta")
        with self.assertRaises(distribution.AuthorizationError):
            distribution.validate_release(beta, installed="3.3.0-dev", selected_channel="stable", compatibility=context)
        dev = self.parsed(version="3.4.0-dev", channel="dev", dev=False)
        with self.assertRaises(distribution.AuthorizationError):
            distribution.validate_release(dev, installed="3.3.0-dev", selected_channel="dev", compatibility=context)
        with self.assertRaises(distribution.ManifestError):
            distribution.validate_release(stable, installed="9.0.0", selected_channel="stable", compatibility=context)
        incompatible = signed_manifest(self.private, self.payload)
        incompatible["compatibility"]["runtime_schema"] = {"min": 3, "max": 3}
        incompatible["signing"]["signature"] = base64.b64encode(self.private.sign(distribution.canonical_manifest_bytes(incompatible))).decode()
        with self.assertRaises(distribution.ManifestError):
            distribution.validate_release(distribution.ReleaseManifest.parse(incompatible), installed="3.3.0-dev", selected_channel="stable", compatibility=context)

    async def test_mock_provider_authorization_and_no_download_during_check(self):
        raw = signed_manifest(self.private, self.payload)
        provider = distribution.MockDistributionProvider(raw, self.payload)
        self.assertEqual(await provider.async_latest_manifest("installation", "stable"), raw)
        self.assertEqual(provider.calls, {"manifest": 1, "download": 0})
        denied = distribution.MockDistributionProvider(raw, self.payload, authorized=False)
        with self.assertRaises(distribution.AuthorizationError):
            await denied.async_latest_manifest("installation", "stable")
        channel_denied = distribution.MockDistributionProvider(raw, self.payload, allowed_channels=("stable",))
        with self.assertRaises(distribution.AuthorizationError):
            await channel_denied.async_latest_manifest("installation", "dev")

    async def test_local_provider_confines_artifact_path(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            payload_path = root / "release.zip"
            payload_path.write_bytes(self.payload)
            raw = signed_manifest(self.private, self.payload)
            raw["artifact"]["url"] = "local://release.zip"
            raw["signing"]["signature"] = base64.b64encode(self.private.sign(distribution.canonical_manifest_bytes(raw))).decode()
            manifest_path = root / "release.json"
            manifest_path.write_text(json.dumps(raw), encoding="utf-8")
            provider = distribution.LocalDistributionProvider(manifest_path, root)
            manifest = distribution.ReleaseManifest.parse(await provider.async_latest_manifest("id", "stable"))
            self.assertEqual(await provider.async_download_artifact("id", manifest), self.payload)
            escaped = dict(raw)
            escaped["artifact"] = {**raw["artifact"], "url": "local://../secret.zip"}
            with self.assertRaises(distribution.AuthorizationError):
                await provider.async_download_artifact("id", distribution.ReleaseManifest.parse(escaped))

    def test_runtime_swap_preserves_storage_and_keeps_rollback(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            component = root / "config/custom_components/cl_control"
            component.mkdir(parents=True)
            (component / "old.txt").write_text("old", encoding="utf-8")
            (component / "manifest.json").write_text(json.dumps({"domain": "cl_control", "version": "3.3.0-dev"}), encoding="utf-8")
            storage = root / "config/.storage/cl_control.configuration"
            credentials = root / "config/.storage/cl_control.credentials"
            storage.parent.mkdir(parents=True)
            storage.write_text("customer", encoding="utf-8")
            credentials.write_text("hash", encoding="utf-8")
            rollback = distribution.RuntimeInstaller(component, root / "config/.cl_control_update").install(self.parsed(), self.payload)
            self.assertEqual(json.loads((component / "manifest.json").read_text())["version"], "3.3.1")
            self.assertEqual((rollback / "old.txt").read_text(), "old")
            self.assertEqual(storage.read_text(), "customer")
            self.assertEqual(credentials.read_text(), "hash")
            installer = distribution.RuntimeInstaller(component, root / "config/.cl_control_update")
            installer.rollback(rollback)
            self.assertEqual((component / "old.txt").read_text(), "old")

    async def test_manager_requires_backup_and_marks_restart(self):
        class Config:
            version = "2026.9.1"
            def __init__(self, root): self.root = root
            def path(self, *parts): return str(self.root.joinpath(*parts))
        class Hass:
            def __init__(self, root): self.config = Config(root)
            async def async_add_executor_job(self, func, *args): return func(*args)
        class Backup:
            def __init__(self, fail=False): self.calls = 0; self.fail = fail
            async def async_create(self, _name):
                self.calls += 1
                if self.fail: raise distribution.BackupError("failed")
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            component = root / "custom_components/cl_control"
            component.mkdir(parents=True)
            (component / "old.txt").write_text("old")
            raw = signed_manifest(self.private, self.payload)
            provider = distribution.MockDistributionProvider(raw, self.payload)
            backup = Backup()
            entry = types.SimpleNamespace(data={"installation_id": "id"})
            manager = distribution.UpdateManager(hass=Hass(root), entry=entry, provider=provider, release_channel="stable", public_keys={"test": self.public}, backup_provider=backup)
            await manager.async_refresh()
            self.assertIsNotNone(manager.manifest)
            self.assertEqual(provider.calls["download"], 0)
            await manager.async_install()
            self.assertEqual(backup.calls, 1)
            self.assertTrue(manager.restart_required)
            self.assertFalse(manager.in_progress)
        failed = Backup(True)
        manager = distribution.UpdateManager(hass=Hass(Path(temp)), entry=entry, provider=provider, release_channel="stable", public_keys={"test": self.public}, backup_provider=failed)
        manager.manifest = distribution.ReleaseManifest.parse(raw)
        before = provider.calls["download"]
        with self.assertRaises(distribution.BackupError): await manager.async_install()
        self.assertEqual(provider.calls["download"], before)


if __name__ == "__main__":
    unittest.main()

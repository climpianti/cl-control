"""Validate local signed or unsigned staging packages without installing them."""
from __future__ import annotations

import argparse
import hashlib
import importlib
import json
from pathlib import Path
import sys
import types
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
package = types.ModuleType("cl_release_verification")
package.__path__ = [str(ROOT / "custom_components/cl_control")]
sys.modules[package.__name__] = package
distribution = importlib.import_module(f"{package.__name__}.distribution")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest", type=Path)
    args = parser.parse_args()
    raw = json.loads(args.manifest.read_text(encoding="utf-8"))
    payload_path = args.manifest.with_name(f"cl-control-{raw['version']}.zip")
    payload = payload_path.read_bytes()
    signed = bool(raw["signing"]["signature"])
    if signed:
        manifest = distribution.ReleaseManifest.parse(raw)
        distribution.verify_manifest_signature(manifest, distribution.load_public_keys())
    else:
        try:
            distribution.ReleaseManifest.parse(raw)
        except distribution.ManifestError:
            pass
        else:
            raise AssertionError("Unsigned staging must be rejected by the updater")
        # Artifact validation is independent of signature verification. Never
        # replace the empty signature with a dummy or present staging as signed.
        manifest = distribution.ReleaseManifest(
            raw=raw, version=raw["version"], channel=raw["channel"],
            summary=raw["release"]["summary"], notes=raw["release"]["notes"],
            release_url=raw["release"]["url"], artifact_url=raw["artifact"]["url"],
            sha256=raw["artifact"]["sha256"], size=raw["artifact"]["size"],
            requires_restart=raw["requires_restart"],
        )
    names = distribution.validate_artifact(manifest, payload)
    expected = json.loads((ROOT / "custom_components/cl_control/manifest.json").read_text())
    assert expected["version"] == manifest.version
    required = {"frontend/cl-control-dashboard-strategy.mjs", "release_public_keys.json"}
    with ZipFile(payload_path) as archive:
        for relative in required:
            assert f"custom_components/cl_control/{relative}" in names
        for name in names:
            relative = name.removeprefix("custom_components/cl_control/")
            assert archive.read(name) == (ROOT / "custom_components/cl_control" / relative).read_bytes()
            assert not any(part in {"tests", ".storage", ".git", "backups", "screenshots"} for part in Path(name).parts)
            if Path(name).suffix in {".py", ".js", ".mjs", ".json", ".yaml"}:
                assert b"PRIVATE KEY-----" not in archive.read(name)
    inventory = json.loads(args.manifest.with_name(f"cl-control-{raw['version']}.inventory.json").read_text())
    assert sorted(item["path"] for item in inventory["files"]) == list(names)
    with ZipFile(payload_path) as archive:
        for item in inventory["files"]:
            data = archive.read(item["path"])
            assert len(data) == item["size"]
            assert hashlib.sha256(data).hexdigest() == item["sha256"]
    print(json.dumps({"files": len(names), "size": len(payload), "sha256": manifest.sha256,
                      "version": manifest.version, "signed": signed, "valid_artifact": True}))


if __name__ == "__main__":
    main()

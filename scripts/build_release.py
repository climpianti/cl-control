#!/usr/bin/env python3
"""Build a deterministic, signed CL Control runtime bundle."""

from __future__ import annotations

import argparse
import base64
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path, PurePosixPath
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

from cryptography.hazmat.primitives import serialization

ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "cl_control"
ARCHIVE_ROOT = PurePosixPath("custom_components/cl_control")
EXCLUDED_PARTS = {"__pycache__", ".pytest_cache"}
EXCLUDED_SUFFIXES = {".pyc", ".pyo", ".log", ".db", ".sqlite", ".sqlite3"}
KEY_ID = "cl-control-release-2026-01"


def canonical(raw: dict) -> bytes:
    value = json.loads(json.dumps(raw))
    value["signing"].pop("signature", None)
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()


def runtime_files() -> list[Path]:
    files = []
    for path in COMPONENT.rglob("*"):
        relative = path.relative_to(COMPONENT)
        if path.is_file() and not EXCLUDED_PARTS.intersection(relative.parts) and path.suffix.lower() not in EXCLUDED_SUFFIXES:
            files.append(path)
    return sorted(files, key=lambda item: item.relative_to(COMPONENT).as_posix())


def build_zip(target: Path) -> list[dict]:
    inventory = []
    target.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(target, "w", ZIP_DEFLATED, compresslevel=9) as archive:
        for source in runtime_files():
            relative = source.relative_to(COMPONENT).as_posix()
            name = str(ARCHIVE_ROOT / relative)
            data = source.read_bytes()
            info = ZipInfo(name, (1980, 1, 1, 0, 0, 0))
            info.compress_type = ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            info.create_system = 3
            archive.writestr(info, data)
            inventory.append({"path": name, "size": len(data), "sha256": hashlib.sha256(data).hexdigest()})
    return inventory


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    signing = parser.add_mutually_exclusive_group(required=True)
    signing.add_argument("--signing-key", type=Path)
    signing.add_argument("--unsigned", action="store_true", help="Create staging metadata rejected by the updater until signed")
    parser.add_argument("--channel", choices=("stable", "beta", "dev"), default="dev")
    parser.add_argument("--published-at")
    parser.add_argument("--artifact-url")
    parser.add_argument("--summary")
    parser.add_argument("--notes")
    args = parser.parse_args()
    component_manifest = json.loads((COMPONENT / "manifest.json").read_text(encoding="utf-8"))
    version = component_manifest["version"]
    artifact = args.output / f"cl-control-{version}.zip"
    inventory = build_zip(artifact)
    payload = artifact.read_bytes()
    published = args.published_at or datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    manifest = {
        "schema": 1, "product": "cl_control", "version": version,
        "channel": args.channel, "published_at": published,
        "requires_restart": True,
        "authorization": {"dev": args.channel == "dev"},
        "compatibility": {
            "minimum_home_assistant": "2026.9.0",
            "tested_home_assistant": "2026.9.1",
            "runtime_schema": {"min": 2, "max": 2},
            "layout_schema": {"min": 1, "max": 1},
            "config_entry": {"major": 1, "minor": 0},
            "rollback_safe": True,
        },
        "artifact": {
            "url": args.artifact_url or f"local://{artifact.name}",
            "sha256": hashlib.sha256(payload).hexdigest(), "size": len(payload),
            "format": "zip", "root": str(ARCHIVE_ROOT),
        },
        "release": {
            "summary": args.summary or f"CL Control {version}",
            "notes": args.notes or "Local validation artifact. No automatic publication.",
            "url": "https://github.com/climpianti/cl-control",
        },
        "signing": {"algorithm": "ed25519", "key_id": KEY_ID, "signature": ""},
    }
    if args.signing_key:
        private_key = serialization.load_pem_private_key(args.signing_key.read_bytes(), password=None)
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
        if not isinstance(private_key, Ed25519PrivateKey):
            raise ValueError("An Ed25519 release key is required")
        public_key = private_key.public_key().public_bytes(
            serialization.Encoding.Raw, serialization.PublicFormat.Raw
        )
        trusted = json.loads((COMPONENT / "release_public_keys.json").read_text(encoding="utf-8"))
        if base64.b64encode(public_key).decode() != trusted["keys"][KEY_ID]:
            raise ValueError("Signing key does not match the embedded trusted public key")
        manifest["signing"]["signature"] = base64.b64encode(private_key.sign(canonical(manifest))).decode()
    manifest_path = args.output / f"cl-control-{version}.manifest.json"
    inventory_path = args.output / f"cl-control-{version}.inventory.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    inventory_path.write_text(json.dumps({"files": inventory}, indent=2) + "\n", encoding="utf-8")
    (args.output / f"cl-control-{version}.sha256").write_text(
        f"{manifest['artifact']['sha256']}  {artifact.name}\n", encoding="utf-8"
    )
    print(json.dumps({"artifact": str(artifact), "manifest": str(manifest_path), "inventory": str(inventory_path), "sha256": manifest["artifact"]["sha256"], "size": len(payload), "files": len(inventory), "signed": bool(manifest["signing"]["signature"])}))


if __name__ == "__main__":
    main()

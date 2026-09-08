"""Deterministic release packaging regression tests."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("cl_release_build", ROOT / "scripts/build_release.py")
builder = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(builder)


class ReleaseBuildTests(unittest.TestCase):
    def test_zip_is_deterministic_and_runtime_only(self):
        with tempfile.TemporaryDirectory() as temp:
            first, second = Path(temp) / "one.zip", Path(temp) / "two.zip"
            inventory = builder.build_zip(first)
            builder.build_zip(second)
            self.assertEqual(first.read_bytes(), second.read_bytes())
            self.assertTrue(inventory)
            with ZipFile(first) as archive:
                names = archive.namelist()
                self.assertTrue(all(name.startswith("custom_components/cl_control/") for name in names))
                self.assertIn("custom_components/cl_control/manifest.json", names)
                self.assertFalse(any("__pycache__" in name or name.endswith(".pyc") for name in names))

    def test_schema_and_public_key_metadata_are_parseable(self):
        schema = json.loads((ROOT / "docs/release-manifest-v1.schema.json").read_text(encoding="utf-8"))
        keys = json.loads((ROOT / "custom_components/cl_control/release_public_keys.json").read_text(encoding="utf-8"))
        self.assertEqual(schema["properties"]["schema"]["const"], 1)
        self.assertEqual(keys["schema"], 1)
        self.assertEqual(len(keys["keys"]), 1)


if __name__ == "__main__":
    unittest.main()

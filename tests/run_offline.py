"""Run pure CL modules without importing the HA integration entry point.

This deliberately does not emulate Home Assistant. Runtime setup and services
must additionally be verified against the beta instance.
"""
from pathlib import Path
import sys
import types
import unittest

ROOT = Path(__file__).resolve().parents[1]
for name, directory in (
    ("custom_components", ROOT / "custom_components"),
    ("custom_components.cl_control", ROOT / "custom_components/cl_control"),
):
    package = types.ModuleType(name)
    package.__path__ = [str(directory)]
    sys.modules[name] = package

suite = unittest.defaultTestLoader.discover(str(ROOT / "tests"))
result = unittest.TextTestRunner(verbosity=2).run(suite)
sys.exit(not result.wasSuccessful())

"""Distribution packaging and Home Assistant frontend registration tests."""

from __future__ import annotations

from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import importlib.util
import json
from pathlib import Path
import sys
import threading
import types
import unittest
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / "custom_components" / "cl_control"


class StaticPathConfig:
    def __init__(self, url_path: str, path: str, cache_headers: bool) -> None:
        self.url_path = url_path
        self.path = path
        self.cache_headers = cache_headers


frontend_stub = types.ModuleType("homeassistant.components.frontend")
frontend_stub.DATA_PANELS = "frontend_panels"


def register_panel(hass, component_name, **kwargs):
    route = kwargs["frontend_url_path"]
    if route in hass.data.setdefault(frontend_stub.DATA_PANELS, {}) and not kwargs.get("update"):
        raise ValueError("duplicate panel")
    hass.data[frontend_stub.DATA_PANELS][route] = types.SimpleNamespace(
        component_name=component_name,
        config=kwargs["config"],
        sidebar_title=kwargs["sidebar_title"],
        sidebar_icon=kwargs["sidebar_icon"],
        require_admin=kwargs["require_admin"],
        update=kwargs.get("update", False),
    )


frontend_stub.async_register_built_in_panel = register_panel
frontend_stub.async_remove_panel = lambda hass, route: hass.data.get(
    frontend_stub.DATA_PANELS, {}
).pop(route, None)
components_stub = types.ModuleType("homeassistant.components")
components_stub.frontend = frontend_stub
http_stub = types.ModuleType("homeassistant.components.http")
http_stub.StaticPathConfig = StaticPathConfig
core_stub = types.ModuleType("homeassistant.core")
core_stub.HomeAssistant = object
homeassistant_stub = types.ModuleType("homeassistant")
homeassistant_stub.components = components_stub

sys.modules.setdefault("homeassistant", homeassistant_stub)
sys.modules.setdefault("homeassistant.components", components_stub)
sys.modules.setdefault("homeassistant.components.frontend", frontend_stub)
sys.modules.setdefault("homeassistant.components.http", http_stub)
sys.modules.setdefault("homeassistant.core", core_stub)

distribution_package = types.ModuleType("cl_control_distribution")
distribution_package.__path__ = [str(PACKAGE)]
sys.modules.setdefault("cl_control_distribution", distribution_package)
spec = importlib.util.spec_from_file_location(
    "cl_control_distribution.frontend", PACKAGE / "frontend.py"
)
distribution = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(distribution)


class FakeHttp:
    def __init__(self) -> None:
        self.paths = []

    async def async_register_static_paths(self, paths) -> None:
        self.paths.extend(paths)


class FakeHass:
    def __init__(self) -> None:
        self.data = {}
        self.http = FakeHttp()


def settings(**frontend_overrides):
    return {
        "branding": {
            "brand_name": "Brand dinamico",
            "assets": {
                "logo": "frontend:logo.png",
                "logo_compact": "/local/cl_control/logo.png",
                "favicon": "/local/customer/favicon.ico",
            },
        },
        "frontend": {
            "panel_url": "/cl-control",
            "sidebar_icon": "mdi:home-automation",
            "require_admin": False,
            **frontend_overrides,
        },
    }


class DistributionTests(unittest.IsolatedAsyncioTestCase):
    def test_runtime_is_fully_bundled(self):
        for name in distribution.REQUIRED_ASSETS:
            self.assertTrue((PACKAGE / "frontend" / name).is_file(), name)
        self.assertTrue((PACKAGE / "brand" / "icon.png").is_file())
        self.assertFalse((ROOT / "cl-control-panel.js").exists())
        self.assertFalse((ROOT / "logo.png").exists())
        snippet = (ROOT / "configuration-snippet.yaml").read_text(encoding="utf-8")
        self.assertNotIn("panel_custom:", snippet)
        self.assertNotIn("/local/cl_control", snippet)

    def test_internal_settings_replace_only_legacy_product_assets(self):
        configured = distribution.configure_internal_frontend(settings(), "3.3.0-dev")
        self.assertEqual(configured["frontend"]["asset_base"], "/cl_control_static/3.3.0-dev")
        self.assertEqual(configured["frontend"]["cache_version"], "3.3.0-dev")
        self.assertEqual(
            configured["branding"]["assets"]["logo"],
            "/cl_control_static/3.3.0-dev/logo.png",
        )
        self.assertEqual(
            configured["branding"]["assets"]["logo_compact"],
            "/cl_control_static/3.3.0-dev/logo.png",
        )
        self.assertEqual(
            configured["branding"]["assets"]["favicon"],
            "/local/customer/favicon.ico",
        )

    async def test_registers_static_path_and_customer_panel(self):
        hass = FakeHass()
        configured = distribution.configure_internal_frontend(settings(), "3.3.0-dev")
        await distribution.async_register_frontend(hass, configured, "3.3.0-dev")
        self.assertEqual(len(hass.http.paths), 1)
        path = hass.http.paths[0]
        self.assertEqual(path.url_path, "/cl_control_static/3.3.0-dev")
        self.assertEqual(Path(path.path), PACKAGE / "frontend")
        self.assertTrue(path.cache_headers)
        panel = hass.data[frontend_stub.DATA_PANELS]["cl-control"]
        self.assertEqual(panel.sidebar_title, "Brand dinamico")
        self.assertFalse(panel.require_admin)
        self.assertFalse(panel.update)
        custom = panel.config["_panel_custom"]
        self.assertEqual(custom["name"], "cl-control-panel")
        self.assertEqual(
            custom["module_url"],
            "/cl_control_static/3.3.0-dev/cl-control-panel.js",
        )

        await distribution.async_register_static_path(hass, "3.3.0-dev")
        self.assertEqual(len(hass.http.paths), 1)

    async def test_panel_can_unload_without_removing_static_assets(self):
        hass = FakeHass()
        configured = distribution.configure_internal_frontend(
            settings(), "3.3.0-dev"
        )
        await distribution.async_register_frontend(
            hass, configured, "3.3.0-dev"
        )
        distribution.async_unregister_panel(hass, configured)
        self.assertNotIn("cl-control", hass.data[frontend_stub.DATA_PANELS])
        self.assertEqual(len(hass.http.paths), 1)

    async def test_legacy_panel_is_replaced_by_internal_panel(self):
        hass = FakeHass()
        hass.data[frontend_stub.DATA_PANELS] = {
            "cl-control": types.SimpleNamespace(
                component_name="custom",
                config={"_panel_custom": {"name": "cl-control-panel", "module_url": "/local/cl_control/cl-control-panel.js"}},
            )
        }
        configured = distribution.configure_internal_frontend(settings(), "3.3.0-dev")
        await distribution.async_register_frontend(hass, configured, "3.3.0-dev")
        panel = hass.data[frontend_stub.DATA_PANELS]["cl-control"]
        self.assertTrue(panel.update)
        self.assertNotIn("/local/", panel.config["_panel_custom"]["module_url"])

    async def test_unrelated_panel_route_is_never_overwritten(self):
        hass = FakeHass()
        hass.data[frontend_stub.DATA_PANELS] = {
            "cl-control": types.SimpleNamespace(component_name="other", config={})
        }
        with self.assertRaisesRegex(ValueError, "already owned"):
            await distribution.async_register_frontend(
                hass,
                distribution.configure_internal_frontend(settings(), "3.3.0-dev"),
                "3.3.0-dev",
            )

    def test_bundled_assets_are_http_readable(self):
        class QuietHandler(SimpleHTTPRequestHandler):
            def log_message(self, *_args) -> None:
                return

        server = ThreadingHTTPServer(
            ("127.0.0.1", 0),
            partial(QuietHandler, directory=str(PACKAGE / "frontend")),
        )
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            for name in distribution.REQUIRED_ASSETS:
                with urlopen(f"http://127.0.0.1:{server.server_port}/{name}") as response:
                    self.assertEqual(response.status, 200)
                    self.assertGreater(len(response.read()), 0)
        finally:
            server.shutdown()
            thread.join()
            server.server_close()

    def test_manifest_and_future_hacs_metadata_are_valid(self):
        manifest = json.loads((PACKAGE / "manifest.json").read_text(encoding="utf-8"))
        hacs = json.loads((ROOT / "hacs.json").read_text(encoding="utf-8"))
        strings = json.loads((PACKAGE / "strings.json").read_text(encoding="utf-8"))
        italian = json.loads(
            (PACKAGE / "translations" / "it.json").read_text(encoding="utf-8")
        )
        self.assertEqual(manifest["domain"], "cl_control")
        self.assertEqual(manifest["name"], "CL Control")
        self.assertEqual(manifest["version"], "3.4.2-dev")
        self.assertTrue(manifest["config_flow"])
        self.assertTrue(manifest["single_config_entry"])
        self.assertEqual(manifest["codeowners"], ["@climpianti"])
        self.assertIn("issue_tracker", manifest)
        self.assertEqual(hacs["name"], "CL Control")
        self.assertEqual(strings.keys(), italian.keys())
        self.assertEqual(strings["config"]["step"].keys(), italian["config"]["step"].keys())
        self.assertEqual(strings["options"]["step"].keys(), italian["options"]["step"].keys())
        self.assertEqual(strings["selector"].keys(), italian["selector"].keys())


if __name__ == "__main__":
    unittest.main()

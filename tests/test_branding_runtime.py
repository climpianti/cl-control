"""Pure contracts for CL Control global branding."""
from __future__ import annotations
import importlib
from pathlib import Path
import sys,types,unittest
ROOT=Path(__file__).resolve().parents[1]; PACKAGE=ROOT/"custom_components"/"cl_control"
frontend=types.ModuleType("homeassistant.components.frontend"); frontend.MANIFEST_JSON={}; frontend.DATA_EXTRA_MODULE_URL="extra_module_url"; frontend.add_manifest_json_key=lambda *_a,**_k:None; frontend.add_extra_js_url=lambda *_a,**_k:None; frontend.remove_extra_js_url=lambda *_a,**_k:None
components=types.ModuleType("homeassistant.components"); components.frontend=frontend
core=types.ModuleType("homeassistant.core"); core.HomeAssistant=object
storage=types.ModuleType("homeassistant.helpers.storage"); storage.Store=object
helpers=types.ModuleType("homeassistant.helpers"); homeassistant=types.ModuleType("homeassistant"); homeassistant.components=components
sys.modules.setdefault("homeassistant",homeassistant); sys.modules.setdefault("homeassistant.components",components); sys.modules.setdefault("homeassistant.components.frontend",frontend); sys.modules.setdefault("homeassistant.core",core); sys.modules.setdefault("homeassistant.helpers",helpers); sys.modules.setdefault("homeassistant.helpers.storage",storage)
package=sys.modules.get("cl_control")
if package is None: package=types.ModuleType("cl_control"); package.__path__=[str(PACKAGE)]; sys.modules["cl_control"]=package
branding=importlib.import_module("cl_control.branding_runtime")
class BrandingContractTests(unittest.TestCase):
    def settings(self,**o):
        return {"site":{"site_name":"Villa Rossi"},"frontend":{"asset_base":"/cl_control_static/3.5.0-dev"},"branding":{"brand_name":"CL Control","mode":"enhanced","rename_instance":False,"pwa_branding":True,"browser_title":True,"sidebar_title":True,"favicon":True,"assets":{"logo":"/cl_control_static/3.5.0-dev/logo.png"},"colors":{"primary":"#19BAFF","background":"#061324"},**o}}
    def test_title(self): self.assertEqual(branding.global_brand_title(self.settings()),"CL Control · Villa Rossi")
    def test_manifest(self):
        m=branding.manifest_branding(self.settings()); self.assertEqual(m["name"],"CL Control · Villa Rossi"); self.assertEqual(m["short_name"],"CL Control"); self.assertEqual(m["icons"][0]["src"],"/cl_control_static/3.5.0-dev/logo.png"); self.assertNotIn("/local/",repr(m))
    def test_module_url(self):
        u=branding.enhanced_module_url(self.settings(),"3.5.0-dev"); self.assertTrue(u.startswith("/cl_control_static/3.5.0-dev/cl-control-branding.mjs?")); self.assertIn("sidebar=1",u); self.assertIn("browser=1",u); self.assertIn("favicon=1",u)
    def test_mode(self): self.assertEqual(branding.branding_mode(self.settings(mode="unexpected")),"enhanced")
if __name__=="__main__": unittest.main()

"""Performance and cache regression tests for the 3.5 native dashboard."""
from __future__ import annotations
import importlib,sys,types,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]; PACKAGE=ROOT/"custom_components"/"cl_control"
package=sys.modules.get("cl_control")
if package is None:
    package=types.ModuleType("cl_control"); package.__path__=[str(PACKAGE)]; sys.modules["cl_control"]=package
dashboard=importlib.import_module("cl_control.dashboard_native")
class FakeConfig: components=set()
class FakeHass:
    def __init__(self): self.config=FakeConfig(); self.states={}
class CountingService(dashboard.NativeDashboardService):
    def __init__(self,hass,entities,areas):
        super().__init__(hass,"3.5.0-dev"); self.entities=entities; self.areas=areas; self.snapshot_calls=0
    def _registry_snapshot(self):
        self.snapshot_calls+=1; return self.entities,self.areas
def make_entities(count:int):
    domains=("light","cover","climate"); areas=[{"id":f"a{i}","name":f"Area {i}"} for i in range(20)]
    entities=[{"entity_id":f"{domains[i%3]}.fixture_{i}","domain":domains[i%3],"platform":"demo","area_id":f"a{i%20}","name":f"Fixture {i}"} for i in range(count)]
    return entities,areas
class NativeDashboardPerformanceContracts(unittest.IsolatedAsyncioTestCase):
    async def test_runtime_state_churn_never_rebuilds_structural_model(self):
        entities,areas=make_entities(2000); hass=FakeHass(); service=CountingService(hass,entities,areas)
        runtime={"customer_ui":{"experience_level":"standard","favorites":[],"entity_visibility":{},"entity_modules":{},"entity_areas":{}},"site":{"site_name":"Test"}}
        settings={"site":{},"branding":{"brand_name":"CL Control","assets":{"logo":"/cl_control_static/3.5.0-dev/logo.png"}}}
        async def no_modules(_hass): return []
        original=dashboard.async_discover_cl_modules; dashboard.async_discover_cl_modules=no_modules
        try:
            first=await service.async_get_payload(settings=settings,runtime=runtime)
            self.assertEqual((service.build_count,service.snapshot_calls),(1,1))
            for i in range(10000): hass.states[f"sensor.state_{i%100}"]=i
            second=await service.async_get_payload(settings=settings,runtime=runtime)
            self.assertEqual((service.build_count,service.snapshot_calls),(1,1)); self.assertEqual(first["revision"],second["revision"])
            service.invalidate(); third=await service.async_get_payload(settings=settings,runtime=runtime)
            self.assertEqual((service.build_count,service.snapshot_calls),(2,2)); self.assertGreater(third["revision"],second["revision"])
        finally: dashboard.async_discover_cl_modules=original
    def test_dashboard_backend_has_no_state_subscription_or_state_snapshot_dependency(self):
        source=(PACKAGE/"dashboard_native.py").read_text(encoding="utf-8")
        self.assertNotIn("EVENT_STATE_CHANGED",source); self.assertNotIn("async_track_state",source); self.assertNotIn("hass.states",source)
    def test_strategy_does_not_render_or_subscribe_to_entity_states(self):
        source=(PACKAGE/"frontend"/"cl-control-dashboard-strategy.mjs").read_text(encoding="utf-8")
        self.assertNotIn("hass.states",source); self.assertNotIn("subscribe",source.lower()); self.assertNotIn("custom:cl-control-dashboard-card",source)
if __name__=="__main__": unittest.main()

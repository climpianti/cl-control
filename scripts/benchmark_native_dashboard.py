"""Deterministic benchmark for the CL Control 3.5 native dashboard."""
from __future__ import annotations
import argparse, asyncio, importlib, json, sys, time, types
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]; PACKAGE=ROOT/"custom_components"/"cl_control"
package=sys.modules.get("cl_control")
if package is None:
    package=types.ModuleType("cl_control"); package.__path__=[str(PACKAGE)]; sys.modules["cl_control"]=package
dashboard=importlib.import_module("cl_control.dashboard_native")
def make_fixture(count:int):
    area_count=max(1,min(100,(count+19)//20))
    areas=[{"id":f"area_{i}","name":f"Area {i}"} for i in range(area_count)]
    domains=("light","light","light","cover","climate")
    entities=[{"entity_id":f"{domains[i%5]}.fixture_{i}","domain":domains[i%5],"platform":"demo","area_id":f"area_{i%area_count}","name":f"Fixture {i}","supported_features":0} for i in range(count)]
    runtime={"customer_ui":{"experience_level":"standard","favorites":[e["entity_id"] for e in entities[:min(12,count)]],"entity_visibility":{},"entity_modules":{},"entity_areas":{},"energy_provider":"auto"},"site":{"site_name":"Benchmark"}}
    branding={"brand_name":"CL Control","assets":{"logo":"/cl_control_static/3.5.0-dev/logo.png"}}
    return entities,areas,runtime,branding
class FakeConfig: components=set()
class FakeHass:
    def __init__(self): self.config=FakeConfig(); self.states={}
class BenchmarkService(dashboard.NativeDashboardService):
    def __init__(self,hass,version,entities,areas):
        super().__init__(hass,version); self.entities=entities; self.areas=areas; self.snapshot_calls=0
    def _registry_snapshot(self):
        self.snapshot_calls+=1; return self.entities,self.areas
async def run_case(count:int)->dict:
    entities,areas,runtime,branding=make_fixture(count)
    kwargs={"registry_entities":entities,"areas":areas,"runtime":runtime,"site":{},"branding":branding,"version":"3.5.0-dev","revision":1,"cl_modules":[],"home_assistant_energy_available":False}
    t=time.perf_counter(); model=dashboard.build_dashboard_model(**kwargs); cold=(time.perf_counter()-t)*1000
    t=time.perf_counter(); lovelace=dashboard.build_native_lovelace(model); love=(time.perf_counter()-t)*1000
    model_bytes=len(json.dumps(model,separators=(",",":"),ensure_ascii=False).encode())
    lovelace_bytes=len(json.dumps(lovelace,separators=(",",":"),ensure_ascii=False).encode())
    hass=FakeHass(); service=BenchmarkService(hass,"3.5.0-dev",entities,areas)
    async def no_modules(_hass): return []
    original=dashboard.async_discover_cl_modules; dashboard.async_discover_cl_modules=no_modules
    try:
        t=time.perf_counter(); await service.async_get_payload(settings={"site":{},"branding":branding},runtime=runtime); cold_service=(time.perf_counter()-t)*1000
        t=time.perf_counter(); await service.async_get_payload(settings={"site":{},"branding":branding},runtime=runtime); warm=(time.perf_counter()-t)*1000
        before=service.build_count
        for i in range(5000): hass.states[f"sensor.runtime_{i%50}"]=i
        await service.async_get_payload(settings={"site":{},"branding":branding},runtime=runtime)
        after=service.build_count
    finally:
        dashboard.async_discover_cl_modules=original
    return {"entities":count,"areas":len(areas),"cold_model_ms":round(cold,3),"lovelace_ms":round(love,3),"cold_service_ms":round(cold_service,3),"warm_cache_ms":round(warm,3),"model_json_bytes":model_bytes,"lovelace_json_bytes":lovelace_bytes,"snapshot_calls":service.snapshot_calls,"build_count_after_state_churn":after,"state_churn_triggered_rebuild":after!=before}
async def main():
    parser=argparse.ArgumentParser(); parser.add_argument("--json",dest="json_path"); args=parser.parse_args()
    results=[await run_case(n) for n in (100,500,1000,2000)]
    strategy_size=(ROOT/"custom_components"/"cl_control"/"frontend"/"cl-control-dashboard-strategy.mjs").stat().st_size
    output={"version":"3.5.0-dev","strategy_js_bytes":strategy_size,"results":results}; print(json.dumps(output,indent=2))
    if args.json_path: Path(args.json_path).write_text(json.dumps(output,indent=2)+"\n",encoding="utf-8")
    assert all(not r["state_churn_triggered_rebuild"] for r in results)
    assert all(r["snapshot_calls"]==1 for r in results)
    assert all(r["warm_cache_ms"]<250 for r in results)
    assert all(r["model_json_bytes"]<10_000_000 for r in results)
    assert all(r["lovelace_json_bytes"]<10_000_000 for r in results)
if __name__=="__main__": asyncio.run(main())

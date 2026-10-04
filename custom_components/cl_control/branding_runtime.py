"""Fail-safe global Home Assistant branding for CL Control."""
from __future__ import annotations
from copy import deepcopy
import logging
from typing import Any
from urllib.parse import urlencode
from homeassistant.components import frontend
from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store
_LOGGER=logging.getLogger(__name__)
STORE_VERSION=1
STORE_KEY="cl_control.branding_state"
MODES={"native","enhanced","disabled"}
SHELL_TITLE_MODES={"cl_control","site","custom","original"}
MANIFEST_KEYS=("name","short_name","theme_color","background_color","icons")

def branding_mode(settings:dict[str,Any])->str:
    mode=str(settings.get("branding",{}).get("mode") or "enhanced")
    return mode if mode in MODES else "enhanced"

def _runtime_customer_ui(runtime:dict[str,Any]|None)->dict[str,Any]:
    runtime=runtime if isinstance(runtime,dict) else {}
    nested=runtime.get("customer_ui")
    return nested if isinstance(nested,dict) else runtime

def _runtime_site(runtime:dict[str,Any]|None)->dict[str,Any]:
    runtime=runtime if isinstance(runtime,dict) else {}
    nested=runtime.get("site")
    if isinstance(nested,dict):
        return nested
    support=runtime.get("support")
    if isinstance(support,dict):
        return {"site_name":support.get("site_name","")}
    return {}

def shell_title_config(runtime:dict[str,Any]|None)->dict[str,str]:
    ui=_runtime_customer_ui(runtime)
    raw=ui.get("shell_title") if isinstance(ui,dict) else None
    raw=raw if isinstance(raw,dict) else {}
    mode=str(raw.get("mode") or "cl_control").strip().lower()
    if mode not in SHELL_TITLE_MODES:
        mode="cl_control"
    return {"mode":mode,"custom":str(raw.get("custom") or "").strip()}

def shell_title(settings:dict[str,Any],runtime:dict[str,Any]|None)->str:
    cfg=shell_title_config(runtime)
    if cfg["mode"]=="original":
        return ""
    if cfg["mode"]=="site":
        runtime_site=str(_runtime_site(runtime).get("site_name") or "").strip()
        configured_site=str(settings.get("site",{}).get("site_name") or "").strip()
        return runtime_site or configured_site or "Casa"
    if cfg["mode"]=="custom":
        return cfg["custom"] or "CL Control"
    return "CL Control"

def global_brand_title(settings:dict[str,Any])->str:
    b=settings.get("branding",{}); s=settings.get("site",{})
    brand=str(b.get("brand_name") or "CL Control"); site=str(s.get("site_name") or "").strip()
    return f"{brand} · {site}" if site and site.casefold() not in {brand.casefold(),"casa"} else brand

def manifest_branding(settings:dict[str,Any])->dict[str,Any]:
    b=settings.get("branding",{}); a=b.get("assets") if isinstance(b.get("assets"),dict) else {}; c=b.get("colors") if isinstance(b.get("colors"),dict) else {}; logo=str(a.get("logo") or "")
    return {"name":global_brand_title(settings),"short_name":str(b.get("brand_name") or "CL Control"),"theme_color":str(c.get("primary") or "#19BAFF"),"background_color":str(c.get("background") or "#061324"),"icons":[{"src":logo,"sizes":"any","type":"image/png","purpose":"any"}] if logo else []}

def enhanced_module_url(settings:dict[str,Any],runtime:dict[str,Any]|None,version:str)->str:
    b=settings.get("branding",{}); a=b.get("assets") if isinstance(b.get("assets"),dict) else {}; c=b.get("colors") if isinstance(b.get("colors"),dict) else {}; base=str(settings.get("frontend",{}).get("asset_base") or f"/cl_control_static/{version}")
    title=global_brand_title(settings); shell_cfg=shell_title_config(runtime); side_title=shell_title(settings,runtime)
    sidebar_enabled=bool(b.get("sidebar_title",True)) and shell_cfg["mode"]!="original"
    return f"{base}/cl-control-branding.mjs?"+urlencode({"brand":str(b.get("brand_name") or "CL Control"),"title":title,"sidebar_title":side_title,"logo":str(a.get("logo") or ""),"theme":str(c.get("primary") or "#19BAFF"),"sidebar":"1" if sidebar_enabled else "0","browser":"1" if b.get("browser_title",True) else "0","favicon":"1" if b.get("favicon",True) else "0"})

class BrandingManager:
    def __init__(self,hass:HomeAssistant,settings:dict[str,Any],version:str,runtime:dict[str,Any]|None=None)->None:
        self.hass=hass; self.settings=settings; self.version=version; self.runtime=runtime if isinstance(runtime,dict) else {}; self._store=Store(hass,STORE_VERSION,STORE_KEY); self._state={}
    async def async_apply(self,runtime:dict[str,Any]|None=None)->None:
        if isinstance(runtime,dict): self.runtime=runtime
        self._state=await self._store.async_load() or {"schema_version":1}; mode=branding_mode(self.settings)
        if mode=="disabled": await self.async_restore(clear=False); return
        b=self.settings.get("branding",{}); cfg=shell_title_config(self.runtime); target=shell_title(self.settings,self.runtime)
        # New native UI preference takes priority. If no runtime preference exists,
        # retain compatibility with the historical rename_instance option.
        has_runtime_pref=isinstance(_runtime_customer_ui(self.runtime).get("shell_title"),dict)
        if (has_runtime_pref and cfg["mode"]!="original") or (not has_runtime_pref and bool(b.get("rename_instance",False))):
            await self._async_apply_location_name(target or global_brand_title(self.settings))
        else:
            await self._async_restore_location_name()
        if bool(b.get("pwa_branding",True)): self._apply_manifest()
        else: self._restore_manifest()
        if mode=="enhanced": self._apply_enhanced_module()
        else: self._remove_enhanced_module()
        self._state["mode"]=mode; await self._store.async_save(self._state)
    async def _async_apply_location_name(self,target:str)->None:
        current=str(self.hass.config.location_name); managed=str(self._state.get("managed_location_name") or ""); previous=self._state.get("previous_location_name")
        if previous is None: self._state["previous_location_name"]=current; previous=current
        if current not in {str(previous),managed,target} and managed:
            _LOGGER.warning("CL Control did not overwrite manually changed Home Assistant name: %s",current); return
        if current!=target: await self.hass.config.async_update(location_name=target)
        self._state["managed_location_name"]=target
    async def _async_restore_location_name(self)->None:
        previous=self._state.get("previous_location_name"); managed=str(self._state.get("managed_location_name") or "")
        if previous is None or not managed: return
        if str(self.hass.config.location_name)==managed: await self.hass.config.async_update(location_name=str(previous))
        self._state["managed_location_name"]=""
    def _apply_manifest(self)->None:
        desired=manifest_branding(self.settings)
        if not self._state.get("previous_manifest"): self._state["previous_manifest"]={k:deepcopy(frontend.MANIFEST_JSON[k]) for k in MANIFEST_KEYS}
        old=self._state.get("managed_manifest") or {}
        for k,v in desired.items():
            current=frontend.MANIFEST_JSON[k]
            if old and k in old and current not in (old[k],self._state["previous_manifest"].get(k),v):
                _LOGGER.warning("CL Control left manifest key %s unchanged because another component modified it",k); continue
            frontend.add_manifest_json_key(k,deepcopy(v))
        self._state["managed_manifest"]=deepcopy(desired)
    def _restore_manifest(self)->None:
        previous=self._state.get("previous_manifest") or {}; managed=self._state.get("managed_manifest") or {}
        for k,v in previous.items():
            try: current=frontend.MANIFEST_JSON[k]
            except KeyError: continue
            if k in managed and current==managed[k]: frontend.add_manifest_json_key(k,deepcopy(v))
        self._state["managed_manifest"]={}
    def _registered(self,url:str)->bool:
        manager=self.hass.data.get(frontend.DATA_EXTRA_MODULE_URL); return url in getattr(manager,"urls",())
    def _remove_enhanced_module(self)->None:
        url=str(self._state.get("module_url") or "")
        if url and self._registered(url): frontend.remove_extra_js_url(self.hass,url)
        self._state["module_url"]=""
    def _apply_enhanced_module(self)->None:
        desired=enhanced_module_url(self.settings,self.runtime,self.version); current=str(self._state.get("module_url") or "")
        if current and current!=desired and self._registered(current): frontend.remove_extra_js_url(self.hass,current)
        if not self._registered(desired): frontend.add_extra_js_url(self.hass,desired)
        self._state["module_url"]=desired
    async def async_restore(self,*,clear:bool)->None:
        if not self._state: self._state=await self._store.async_load() or {"schema_version":1}
        self._remove_enhanced_module(); await self._async_restore_location_name(); self._restore_manifest(); self._state["mode"]="disabled"
        if clear: await self._store.async_remove(); self._state={"schema_version":1}
        else: await self._store.async_save(self._state)

__all__=("BrandingManager","MODES","SHELL_TITLE_MODES","branding_mode","enhanced_module_url","global_brand_title","manifest_branding","shell_title","shell_title_config")

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
MANIFEST_KEYS=("name","short_name","theme_color","background_color","icons")
def branding_mode(settings:dict[str,Any])->str:
    mode=str(settings.get("branding",{}).get("mode") or "enhanced")
    return mode if mode in MODES else "enhanced"
def global_brand_title(settings:dict[str,Any])->str:
    b=settings.get("branding",{}); s=settings.get("site",{})
    brand=str(b.get("brand_name") or "CL Control"); site=str(s.get("site_name") or "").strip()
    return f"{brand} · {site}" if site and site.casefold() not in {brand.casefold(),"casa"} else brand
def manifest_branding(settings:dict[str,Any])->dict[str,Any]:
    b=settings.get("branding",{}); a=b.get("assets") if isinstance(b.get("assets"),dict) else {}; c=b.get("colors") if isinstance(b.get("colors"),dict) else {}; logo=str(a.get("logo") or "")
    return {"name":global_brand_title(settings),"short_name":str(b.get("brand_name") or "CL Control"),"theme_color":str(c.get("primary") or "#19BAFF"),"background_color":str(c.get("background") or "#061324"),"icons":[{"src":logo,"sizes":"any","type":"image/png","purpose":"any"}] if logo else []}
def enhanced_module_url(settings:dict[str,Any],version:str)->str:
    b=settings.get("branding",{}); a=b.get("assets") if isinstance(b.get("assets"),dict) else {}; c=b.get("colors") if isinstance(b.get("colors"),dict) else {}; base=str(settings.get("frontend",{}).get("asset_base") or f"/cl_control_static/{version}")
    return f"{base}/cl-control-branding.mjs?"+urlencode({"brand":str(b.get("brand_name") or "CL Control"),"title":global_brand_title(settings),"logo":str(a.get("logo") or ""),"theme":str(c.get("primary") or "#19BAFF"),"sidebar":"1" if b.get("sidebar_title",True) else "0","browser":"1" if b.get("browser_title",True) else "0","favicon":"1" if b.get("favicon",True) else "0"})
class BrandingManager:
    def __init__(self,hass:HomeAssistant,settings:dict[str,Any],version:str)->None:
        self.hass=hass; self.settings=settings; self.version=version; self._store=Store(hass,STORE_VERSION,STORE_KEY); self._state={}
    async def async_apply(self)->None:
        self._state=await self._store.async_load() or {"schema_version":1}; mode=branding_mode(self.settings)
        if mode=="disabled": await self.async_restore(clear=False); return
        b=self.settings.get("branding",{})
        if bool(b.get("rename_instance",False)): await self._async_apply_location_name()
        else: await self._async_restore_location_name()
        if bool(b.get("pwa_branding",True)): self._apply_manifest()
        else: self._restore_manifest()
        if mode=="enhanced": self._apply_enhanced_module()
        else: self._remove_enhanced_module()
        self._state["mode"]=mode; await self._store.async_save(self._state)
    async def _async_apply_location_name(self)->None:
        target=global_brand_title(self.settings); current=str(self.hass.config.location_name); managed=str(self._state.get("managed_location_name") or ""); previous=self._state.get("previous_location_name")
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
        desired=enhanced_module_url(self.settings,self.version); current=str(self._state.get("module_url") or "")
        if current and current!=desired and self._registered(current): frontend.remove_extra_js_url(self.hass,current)
        if not self._registered(desired): frontend.add_extra_js_url(self.hass,desired)
        self._state["module_url"]=desired
    async def async_restore(self,*,clear:bool)->None:
        if not self._state: self._state=await self._store.async_load() or {"schema_version":1}
        self._remove_enhanced_module(); await self._async_restore_location_name(); self._restore_manifest(); self._state["mode"]="disabled"
        if clear: await self._store.async_remove(); self._state={"schema_version":1}
        else: await self._store.async_save(self._state)
__all__=("BrandingManager","MODES","branding_mode","enhanced_module_url","global_brand_title","manifest_branding")

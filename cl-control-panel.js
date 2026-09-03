import {
  FALLBACK_BOOTSTRAP,
  CL_CONTROL_ASSET_VERSION,
  applyDesignTokens,
  classifySwitchModule,
  classifyCover,
  classifySecurityZone,
  colorWheelSelection,
  buildResponsiveNavigation,
  classifyEntity,
  deepMerge,
  escapeHtml,
  looksTechnicalName,
  selectMobileNavigation,
  visibleAtExperience,
  effectiveLayout,
  emptyLayout,
  layoutDeviceContext,
  layoutCardCapabilities,
  reorderLayoutCards,
  structuredCloneSafe,
} from './cl-control-runtime.mjs?v=3.3.0-dev';
import { buildUi3Styles, icon } from './cl-control-ui3.mjs?v=3.3.0-dev';
class CLControlPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode:'open'});
    this._hass = null;
    this._panel = null;
    this._page = 'home';
    this._registriesLoaded = false;
    this._registryLoading = false;
    this._areas = new Map();
    this._entityArea = new Map();
    this._entityRegistry = new Map();
    this._deviceRegistry = new Map();
    this._securityProvider = 'none';
    this._selectedPartitions = new Set();
    this._selectionInitialized = false;
    this._config = null;
    this._bootstrap = deepMerge(FALLBACK_BOOTSTRAP, {});
    this._previewExperience = null;
    this._configLoading = false;
    this._installerUnlocked = false;
    this._hidden = new Set();
    this._lightFilter = 'all';
    this._coverFilter = 'all';
    this._climateFilter = 'all';
    this._securityFilter = 'all';
    this._hiddenSyncLockUntil = 0;
    this._installerSearch = '';
    this._reviewFilter = 'all';
    this._installerSectionIds = ['site','discovery','interface','layout','experience','security','assistance','diagnostics','about'];
    this._installerOpenSections = new Set(['site','discovery']);
    this._reorderMode = false;
    this._energyLocalMap = new Map();
    this._installerUiLocked = false;
    this._installerRenderPending = false;
    this._entityDrag = null;
    this._dragTimer = null;
    this._lightUiLocked = false;
    this._lightRenderPending = false;
    this._pendingCommands = new Map();
    this._layoutEditor={active:false,preview:false,context:'base',view:'home',device:'auto',drafts:new Map(),dirty:false,drag:null};
    this._renderShell();
    this._bindStatic();
  }

  set hass(value) {
    this._hass = value;
    this._syncPendingCommands();
    this._loadConfig();
    this._loadRegistries();
    this._renderData();
  }
  get hass(){return this._hass;}
  set panel(value){this._panel=value;}
  set narrow(value){this.toggleAttribute('narrow',Boolean(value));}

  _state(id){return this._hass?.states?.[id];}
  _value(id,fallback='unknown'){return this._state(id)?.state ?? fallback;}
  _friendly(id){return this._state(id)?.attributes?.friendly_name || this._entityRegistry.get(id)?.name || this._entityRegistry.get(id)?.original_name || this._pretty(String(id).split('.')[1]||id);}
  _esc(v){return escapeHtml(v);}
  _pretty(v){return String(v??'').replaceAll('_',' ').replace(/\b\w/g,m=>m.toUpperCase()).replace(/\bTlc\b/gi,'Telecamera').replace(/\bMainstream\b/gi,'').replace(/\bMediaprofile\b/gi,'').replace(/\bChannel1\b/gi,'').replace(/\s+/g,' ').trim();}
  _rgbHex(rgb){if(!Array.isArray(rgb)||rgb.length<3)return this._bootstrap?.branding?.colors?.warning||'';return'#'+rgb.slice(0,3).map(v=>Math.max(0,Math.min(255,Number(v)||0)).toString(16).padStart(2,'0')).join('');}
  _defaultLightRgb(){const values=String(this._bootstrap?.branding?.colors?.light_default_rgb||'').split(',').map(value=>Number(value.trim())).filter(Number.isFinite);return values.length>=3?values.slice(0,3):[0,0,0];}
  _hexRgb(hex){const m=String(hex||'').match(/^#?([0-9a-f]{6})$/i);if(!m)return this._defaultLightRgb();const n=parseInt(m[1],16);return[(n>>16)&255,(n>>8)&255,n&255];}
  _fmtEnergyAbs(s){if(!s)return'--';const n=Math.abs(Number(s.state));const u=s.attributes?.unit_of_measurement||'';if(!Number.isFinite(n))return`${s.state} ${u}`.trim();if(u==='W'&&n>=1000)return`${(n/1000).toFixed(2)} kW`;if(u==='kW')return`${n.toFixed(2)} kW`;if(u==='Wh'&&n>=1000)return`${(n/1000).toFixed(2)} kWh`;if(u==='kWh')return`${n.toFixed(2)} kWh`;if(u==='%')return`${Math.round(n)}%`;return`${Math.round(n*100)/100} ${u}`.trim();}
  _areaNameFor(id){return this._config?.entity_areas?.[id]||this._entityArea.get(id)||'Altri dispositivi';}
  _installerAreaName(id){return this._config?.entity_areas?.[id]||this._entityArea.get(id)||'Non assegnata';}
  _installerOn(){return Boolean(this._installerUnlocked);}
  _toast(message,tone=''){
    const region=this.shadowRoot.getElementById('toastRegion');if(!region)return;
    region.innerHTML=`<div class="toast ${this._esc(tone)}" role="status">${this._esc(message)}</div>`;
    clearTimeout(this._toastTimer);this._toastTimer=setTimeout(()=>{if(region)region.innerHTML='';},3200);
  }
  _closeDialog(value=null){const layer=this.shadowRoot.getElementById('dialogLayer');if(!layer)return;layer.classList.remove('open');layer.setAttribute('aria-hidden','true');const resolve=this._dialogResolve;this._dialogResolve=null;layer.innerHTML='';if(resolve)resolve(value);}
  _openDialog({title,description='',body='',confirmLabel='CONFERMA',cancelLabel='ANNULLA',tone=''}){
    const layer=this.shadowRoot.getElementById('dialogLayer');if(!layer)return Promise.resolve(null);
    if(this._dialogResolve)this._closeDialog(null);
    layer.innerHTML=`<div class="dialog ${this._esc(tone)}" role="dialog" aria-modal="true" aria-labelledby="clDialogTitle"><div class="row"><h2 id="clDialogTitle">${this._esc(title)}</h2><button class="iconBtn" data-dialog-cancel aria-label="Chiudi">${icon('close')}</button></div>${description?`<p>${this._esc(description)}</p>`:''}<form id="clDialogForm">${body}<div class="dialogActions"><button type="button" class="btn" data-dialog-cancel>${this._esc(cancelLabel)}</button><button type="submit" class="btn primary">${this._esc(confirmLabel)}</button></div></form></div>`;
    layer.classList.add('open');layer.setAttribute('aria-hidden','false');
    layer.querySelectorAll('.choiceOption input').forEach(input=>input.addEventListener('change',()=>{const details=input.closest('details'),summary=details?.querySelector('[data-choice-summary]');if(summary)summary.textContent=input.dataset.choiceLabel||input.value;if(details)details.open=false;}));
    return new Promise(resolve=>{this._dialogResolve=resolve;layer.querySelectorAll('[data-dialog-cancel]').forEach(button=>button.addEventListener('click',()=>this._closeDialog(null)));layer.querySelector('#clDialogForm')?.addEventListener('submit',event=>{event.preventDefault();const values=Object.fromEntries(new FormData(event.currentTarget).entries());this._closeDialog(values);});queueMicrotask(()=>layer.querySelector('input,select,button')?.focus());});
  }
  async _requestPin(title,description='',confirmLabel='SBLOCCA'){
    const result=await this._openDialog({title,description,body:'<label class="muted" for="clPin">PIN</label><input id="clPin" name="pin" type="password" inputmode="numeric" autocomplete="one-time-code" maxlength="12" required aria-describedby="clPinHelp"><div id="clPinHelp" class="meta">Il codice resta nel dispositivo e non viene mostrato.</div>',confirmLabel});
    return result?.pin||null;
  }

  _defaultConfig(){
    const level=this._bootstrap?.customer_ui?.experience?.default_level||'standard';
    const site=this._bootstrap?.site||{};
    const base={theme:this._bootstrap?.customer_ui?.default_theme||'cl_blue',hidden:[],favorites:[],aliases:{},switch_types:{},entity_modules:{},entity_areas:{},entity_subtypes:{},entity_visibility:{},area_order:[],entity_order:[],home_order:[...(this._bootstrap?.customer_ui?.modules||[])],energy:{},area_switches:{},support:{phone:site.support?.phone||'',whatsapp:site.support?.whatsapp||'',message:site.support?.message||'',customer:site.customer||'',site_name:site.site_name||'Casa'},ui:{density:'normal'},experience_level:level,module_levels:{},entity_levels:{},section_levels:{},card_levels:{},user_levels:{},layout:emptyLayout()};
    return deepMerge(base,this._bootstrap?.runtime||{});
  }

  async _loadConfig(){
    if(!this._hass||this._configLoading||this._config)return;
    this._configLoading=true;
    try{
      const payload=await this._hass.callWS({type:'cl_control/bootstrap/get'});
      this._bootstrap=deepMerge(FALLBACK_BOOTSTRAP,payload||{});
      const cfg=this._bootstrap.runtime||await this._hass.callWS({type:'cl_control/config/get'});
      this._config=Object.assign(this._defaultConfig(),cfg||{});
      this._config.support=Object.assign(this._defaultConfig().support,cfg?.support||{});
      this._config.ui=Object.assign(this._defaultConfig().ui,cfg?.ui||{});
      this._hidden=new Set(this._config.hidden||[]);
      if(this._hass?.user?.is_admin){
        try{const st=await this._hass.callWS({type:'cl_control/installer/status'});this._installerUnlocked=Boolean(st?.unlocked);}catch(_err){this._installerUnlocked=false;}
      }
      this._renderShell();this._bindStatic();
      this._applyTheme();
    }catch(err){
      console.warn('[cl_control] backend v2 non disponibile, uso configurazione locale di sola lettura',err);
      this._config=this._defaultConfig();this._hidden=new Set();this._applyTheme();
    }finally{this._configLoading=false;this._renderData();}
  }

  async _saveConfig(patch={}){
    if(!this._config)return false;
    const next=(typeof structuredClone==='function')?structuredClone(this._config):JSON.parse(JSON.stringify(this._config));
    for(const [k,v] of Object.entries(patch)) next[k]=v;
    try{
      const saved=await this._hass.callWS({type:'cl_control/config/set',config:next});
      this._config=saved||next;this._hidden=new Set(this._config.hidden||[]);this._applyTheme();return true;
    }catch(err){console.error('[cl_control] salvataggio configurazione non riuscito',err);this._toast('Salvataggio non riuscito. Verifica la sessione installatore.','error');return false;}
  }

  _theme(){const themes=this._bootstrap?.branding?.themes||[];const fallback=this._bootstrap?.customer_ui?.default_theme||themes[0]?.id||'default';const value=this._config?.theme||fallback;return themes.some(x=>x.id===value)?value:fallback;}
  _themeLabel(theme){return (this._bootstrap?.branding?.themes||[]).find(x=>x.id===theme)?.name||theme;}
  _themePreviewStyle(theme){const base=this._bootstrap?.branding?.colors||{};const colors={...base,...(theme?.colors||{})};return `--preview-primary:${colors.primary};--preview-background:${colors.background};--preview-surface:${colors.surface}`;}
  _applyTheme(theme=null){const selected=theme||this._theme(),effective=selected==='auto'?(window.matchMedia?.('(prefers-color-scheme: light)').matches?'light':'dark'):selected;this.setAttribute('data-theme',selected);this.setAttribute('data-theme-effective',effective);applyDesignTokens(this,this._bootstrap,effective);}
  async _setTheme(theme){if(!this._installerOn())return;this._config.theme=theme;this._applyTheme(theme);await this._saveConfig({theme});}

  _entityMetadata(id){const entity=this._entityRegistry.get(id)||{};const device=this._deviceRegistry.get(entity.device_id)||{};const identifiers=(device.identifiers||[]).flat().map(String);return{...entity,device,device_id:entity.device_id||'',device_name:device.name_by_user||device.name||'',manufacturer:device.manufacturer||'',model:device.model||'',identifiers,area_name:this._installerAreaName(id),platform:entity.platform||entity.integration||'',integration:entity.platform||entity.integration||'',original_device_class:entity.original_device_class||'',config_entry_id:entity.config_entry_id||'',switch_type:this._config?.switch_types?.[id]||''};}
  _customerNameInfo(id){
    const alias=String(this._config?.aliases?.[id]||'').trim();if(alias)return{name:alias,source:'cl_control',needs_review:false};
    const state=this._state(id),meta=this._entityMetadata(id);const friendly=String(state?.attributes?.friendly_name||'').trim();if(friendly&&!looksTechnicalName(friendly))return{name:friendly,source:'friendly_name',needs_review:false};
    const entityName=String(meta.name||meta.original_name||'').trim(),deviceName=String(meta.device_name||'').trim();
    const readableEntity=entityName&&!looksTechnicalName(entityName),readableDevice=deviceName&&!looksTechnicalName(deviceName);
    if(readableDevice&&readableEntity&&!deviceName.toLowerCase().includes(entityName.toLowerCase()))return{name:`${deviceName} · ${entityName}`,source:'device_function',needs_review:false};
    if(readableDevice)return{name:deviceName,source:'device',needs_review:false};
    if(readableEntity)return{name:entityName,source:'registry',needs_review:false};
    const fallback=this._pretty(String(id).split('.')[1]||'');if(fallback&&!looksTechnicalName(fallback))return{name:fallback,source:'discovery',needs_review:false};
    const domain=String(id).split('.')[0],area=this._config?.entity_areas?.[id]||this._entityArea.get(id);if(area&&area!=='Altri dispositivi'){const peers=Object.keys(this._hass?.states||{}).filter(other=>other!==id&&other.startsWith(`${domain}.`)&&this._areaNameFor(other)===area);const labels={light:'Luce',cover:'Apertura',climate:'Clima',camera:'Telecamera',alarm_control_panel:'Allarme',binary_sensor:'Sensore'};if(labels[domain]&&!peers.length)return{name:`${labels[domain]} ${area}`,source:'contextual',needs_review:false};}
    return{name:'',source:'unresolved',needs_review:true};
  }
  _displayName(id){return this._customerNameInfo(id).name;}
  _nameNeedsReview(id){return this._customerNameInfo(id).needs_review;}
  _customerEntityVisible(id){const override=this._config?.entity_visibility?.[id];if(override===false)return false;if(override===true)return true;return !this._customerNameInfo(id).needs_review;}
  _switchClassification(entity){if(!entity)return{module:'unassigned',classification_confidence:0,needs_review:true,customer_facing:false};return classifySwitchModule(entity.entity_id,entity.attributes||{},this._entityMetadata(entity.entity_id),this._config?.entity_modules?.[entity.entity_id]||'');}
  _isFavorite(id){return (this._config?.favorites||[]).includes(id);}
  _choiceField(name,label,options,current){
    const selected=options.find(option=>option.value===current)||options[0];
    return `<fieldset class="choiceField"><legend>${this._esc(label)}</legend><details class="choicePicker"><summary><span class="choiceSummaryIcon">${icon(selected?.icon||'more')}</span><span data-choice-summary>${this._esc(selected?.label||'Auto')}</span>${icon('chevron')}</summary><div class="choiceList">${options.map(option=>`<label class="choiceOption"><input type="radio" name="${this._esc(name)}" value="${this._esc(option.value)}" data-choice-label="${this._esc(option.label)}" ${option.value===selected?.value?'checked':''}><span class="choiceOptionIcon">${icon(option.icon||'more')}</span><span>${this._esc(option.label)}</span></label>`).join('')}</div></details></fieldset>`;
  }
  async _toggleFavorite(id){
    const list=[...(this._config?.favorites||[])];const i=list.indexOf(id);if(i>=0)list.splice(i,1);else list.push(id);
    try{await this._hass.callWS({type:'cl_control/favorites/set',favorites:list});this._config.favorites=list;this._renderData();}catch(e){console.error(e);}
  }
  async _editEntity(id){
    if(!this._installerOn())return;
    const aliases={...(this._config.aliases||{})},types={...(this._config.switch_types||{})},levels={...(this._config.entity_levels||{})},modules={...(this._config.entity_modules||{})},areas={...(this._config.entity_areas||{})},subtypes={...(this._config.entity_subtypes||{})},visibility={...(this._config.entity_visibility||{})};
    const entity=this._state(id),domain=String(id).split('.')[0],nameInfo=this._customerNameInfo(id),current=aliases[id]||(!nameInfo.needs_review?nameInfo.name:''),meta=this._entityMetadata(id),experience=this._entityClassification(entity),moduleClassification=/^(switch|valve)$/.test(domain)?this._switchClassification(entity):null,securityClassification=domain==='binary_sensor'?this._securityZoneClassification(entity):null,coverClassification=domain==='cover'?classifyCover(id,entity?.attributes||{},meta,subtypes[id]||''):null,confidence=moduleClassification?.classification_confidence??securityClassification?.classification_confidence??coverClassification?.confidence??experience.classification_confidence;
    const typeOptions=[['auto','Auto','more'],['interruttore','Interruttore','more'],['presa','Presa','energy'],['luce','Luce','lights'],['valvola','Valvola','climate'],['pompa','Pompa','energy'],['ventilazione','Ventilazione','climate'],['elettrodomestico','Elettrodomestico','home'],['comando','Comando','more'],['tecnico','Tecnico','more']].map(([value,label,iconName])=>({value,label,icon:iconName}));
    const moduleOptions=[['auto','Auto','more'],['lights','Luci','lights'],['covers','Aperture','covers'],['climate','Clima','climate'],['energy','Energia','energy'],['security','Sicurezza','security'],['cameras','Telecamere','cameras'],['support','Assistenza','support'],['installer','Installer','more']].map(([value,label,iconName])=>({value,label,icon:iconName}));
    const areaNames=[...new Set([...this._areas.values(),...Object.values(areas)])].sort((a,b)=>a.localeCompare(b,'it')),areaOptions=[{value:'',label:'Automatica',icon:'home'},...areaNames.map(area=>({value:area,label:area,icon:'home'}))];
    const coverSubtypes=[['auto','Auto'],['window','Finestra'],['shutter','Tapparella'],['blind','Tenda/Veneziana'],['curtain','Tenda'],['door','Porta'],['garage','Garage/Basculante'],['gate','Cancello'],['generic','Apertura generica']];
    const securitySubtypes=[['auto','Auto'],['motion','Movimento'],['occupancy','Presenza/Occupazione'],['opening','Apertura'],['door','Porta'],['window','Finestra'],['garage','Garage'],['vibration','Vibrazione'],['smoke','Fumo'],['gas','Gas'],['moisture','Allagamento'],['tamper','Manomissione'],['generic','Zona generica']];
    const subtypeOptions=(domain==='cover'?coverSubtypes:domain==='binary_sensor'?securitySubtypes:[['auto','Auto']]).map(([value,label])=>({value,label,icon:domain==='binary_sensor'?'security':domain==='cover'?'covers':'more'}));
    const levelOptions=[['auto','Auto'],['essential','Essential'],['standard','Standard'],['pro','Pro'],['installer','Installer']].map(([value,label])=>({value,label,icon:'more'}));
    const body=`<div class="entityDetailGrid"><div><span>Entity ID</span><b>${this._esc(id)}</b></div><div><span>Device</span><b>${this._esc(meta.device_name||'Non disponibile')}</b></div><div><span>Integration</span><b>${this._esc(meta.platform||'Non disponibile')}</b></div><div><span>Domain</span><b>${this._esc(domain)}</b></div><div><span>Device class</span><b>${this._esc(entity?.attributes?.device_class||meta.original_device_class||'Non disponibile')}</b></div><div><span>Confidence</span><b>${Math.round(confidence*100)}%</b></div></div><div class="editorGrid"><label class="editorNameField">Nome visualizzato<input name="alias" value="${this._esc(current)}" placeholder="Inserisci il nome mostrato al cliente">${nameInfo.needs_review?'<span class="fieldHint warning">Configura qui il nome prima di rendere visibile il dispositivo.</span>':''}</label>${this._choiceField('area','Area',areaOptions,areas[id]||'')}${this._choiceField('module','Modulo',moduleOptions,modules[id]||'auto')}${this._choiceField('type','Tipo dispositivo',typeOptions,types[id]||'auto')}${this._choiceField('subtype','Sottotipo',subtypeOptions,subtypes[id]||'auto')}${this._choiceField('level','Livello esperienza',levelOptions,levels[id]||'auto')}</div><div class="editorChecks"><label><input type="checkbox" name="visible" ${visibility[id]!==false?'checked':''}> Visibile al cliente</label><label><input type="checkbox" name="favorite" ${this._isFavorite(id)?'checked':''}> Preferito</label></div>`;
    const result=await this._openDialog({title:'Configura dispositivo',description:id,body,confirmLabel:'SALVA'});if(!result)return;
    const alias=String(result.alias||'').trim();if(alias&&alias!==this._friendly(id))aliases[id]=alias;else delete aliases[id];
    const type=String(result.type||'auto').toLowerCase();if(type==='auto')delete types[id];else types[id]=type;
    const module=String(result.module||'auto').toLowerCase();if(module==='auto')delete modules[id];else modules[id]=module;
    const area=String(result.area||'').trim();if(area)areas[id]=area;else delete areas[id];
    const subtype=String(result.subtype||'auto').toLowerCase();if(subtype==='auto')delete subtypes[id];else subtypes[id]=subtype;
    visibility[id]=result.visible==='on';
    const normalized=String(result.level||'auto').toLowerCase();if(normalized==='auto')delete levels[id];else if(['essential','standard','pro','installer'].includes(normalized))levels[id]=normalized;
    const favorites=new Set(this._config?.favorites||[]);result.favorite==='on'?favorites.add(id):favorites.delete(id);
    await this._saveConfig({aliases,switch_types:types,entity_levels:levels,entity_modules:modules,entity_areas:areas,entity_subtypes:subtypes,entity_visibility:visibility,favorites:[...favorites]});this._renderData();
  }

  async _hideEntity(id){if(!this._installerOn())return;const hidden=new Set(this._config.hidden||[]);hidden.add(id);await this._saveConfig({hidden:[...hidden]});this._renderData();}

  _syncPendingCommands(){if(!this._pendingCommands?.size)return;const now=Date.now();for(const [id,pending] of this._pendingCommands){const state=this._state(id)?.state;if(state===pending.targetState||now-pending.startedAt>10000){clearTimeout(pending.timer);this._pendingCommands.delete(id);}}}
  _pendingState(id){return this._pendingCommands.get(id)||null;}
  async _toggleEntity(id,domain='light'){
    const entity=this._state(id);if(!entity||['unknown','unavailable'].includes(entity.state)||this._pendingCommands.has(id))return;
    const on=entity.state==='on'||entity.state==='open',service=domain==='valve'?(on?'close_valve':'open_valve'):(on?'turn_off':'turn_on'),targetState=domain==='valve'?(on?'closed':'open'):(on?'off':'on');
    const pending={targetState,startedAt:Date.now(),timer:null};pending.timer=setTimeout(()=>{if(this._pendingCommands.get(id)===pending){this._pendingCommands.delete(id);this._renderLights();this._toast('Il dispositivo non ha confermato il nuovo stato.','warning');}},10000);this._pendingCommands.set(id,pending);this._renderLights();
    try{await this._hass.callService(domain,service,{entity_id:id});}catch(error){clearTimeout(pending.timer);this._pendingCommands.delete(id);this._renderLights();this._toast('Comando non riuscito.','error');}
  }

  _hsvRgb(hue,saturation=1,value=1){const h=((Number(hue)||0)%360+360)%360,c=value*saturation,x=c*(1-Math.abs((h/60)%2-1)),m=value-c;let rgb=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];return rgb.map(channel=>Math.round((channel+m)*255));}
  _setColorWheelHue(wheel,hueInput,preview,value){const hue=((Math.round(Number(value)||0)%360)+360)%360;if(hueInput)hueInput.value=String(hue);if(preview)preview.style.setProperty('--preview-hue',String(hue));if(wheel){wheel.setAttribute('aria-valuenow',String(hue));const marker=wheel.querySelector('[data-color-wheel-indicator]'),angle=(hue-90)*Math.PI/180;if(marker){marker.style.left=`${50+34*Math.cos(angle)}%`;marker.style.top=`${50+34*Math.sin(angle)}%`;}}return hue;}
  _bindColorWheelControls(layer,hueInput,preview,currentHue){const wheel=layer?.querySelector('[data-color-wheel]'),presets=layer?.querySelectorAll('[data-hue-preset]')||[];const update=value=>this._setColorWheelHue(wheel,hueInput,preview,value);hueInput?.addEventListener('input',()=>update(hueInput.value));presets.forEach(button=>button.addEventListener('click',()=>update(button.dataset.huePreset)));if(wheel){let activePointer=null;const select=(event,allowOutside=false)=>{const point=colorWheelSelection(event.clientX,event.clientY,wheel.getBoundingClientRect(),{allowOutside});if(!point)return false;event.preventDefault();update(point.hue);return true;};wheel.addEventListener('pointerdown',event=>{if(event.button!=null&&event.button!==0)return;if(!select(event,false))return;activePointer=event.pointerId;wheel.setPointerCapture?.(event.pointerId);});wheel.addEventListener('pointermove',event=>{if(activePointer!==event.pointerId)return;select(event,true);});const finish=event=>{if(activePointer!==event.pointerId)return;event.preventDefault();wheel.releasePointerCapture?.(event.pointerId);activePointer=null;};wheel.addEventListener('pointerup',finish);wheel.addEventListener('pointercancel',finish);}update(currentHue);return{wheel,update};}
  async _openLightControls(id){const entity=this._state(id);if(!entity)return;const a=entity.attributes||{},modes=(a.supported_color_modes||[]).map(String),brightness=a.brightness!=null,hasColor=modes.some(mode=>['rgb','rgbw','rgbww','hs','xy'].includes(mode)),hasTemp=modes.includes('color_temp'),hasWhite=modes.some(mode=>['white','rgbw','rgbww'].includes(mode));const currentHue=Array.isArray(a.hs_color)?Math.round(a.hs_color[0]):38,minKelvin=Number(a.min_color_temp_kelvin)||2000,maxKelvin=Number(a.max_color_temp_kelvin)||6500,currentKelvin=Number(a.color_temp_kelvin)||Math.round((minKelvin+maxKelvin)/2);const body=`<div class="lightSheet"><div class="lightPreview" data-light-preview></div>${hasColor?`<label>Tonalità<div class="colorWheel" data-color-wheel role="slider" tabindex="0" aria-label="Seleziona tonalità" aria-valuemin="0" aria-valuemax="359" aria-valuenow="${currentHue}"><span class="colorWheelIndicator" data-color-wheel-indicator></span></div><input class="hueSlider" type="range" name="hue" min="0" max="359" value="${currentHue}" aria-label="Tonalità colore"><div class="colorPresets">${[0,35,60,120,200,260,315].map(hue=>`<button type="button" data-hue-preset="${hue}" aria-label="Preset colore ${hue}" style="--preset-hue:${hue}"></button>`).join('')}</div></label>`:''}${brightness?`<label>Luminosità<input type="range" name="brightness" min="1" max="255" value="${a.brightness||128}"></label>`:''}${hasTemp?`<label>Temperatura colore<input type="range" name="kelvin" min="${minKelvin}" max="${maxKelvin}" value="${currentKelvin}"><span class="rangeLegend"><small>Calda</small><small>Fredda</small></span></label>`:''}${hasWhite?`<label>Modalità<select name="light_mode"><option value="color">Colore</option><option value="white">Bianco</option></select></label>`:''}</div>`;const pending=this._openDialog({title:this._displayName(id),description:'Controlli luce supportati dal dispositivo',body,confirmLabel:'APPLICA'}),layer=this.shadowRoot.getElementById('dialogLayer'),hue=layer?.querySelector('[name="hue"]'),preview=layer?.querySelector('[data-light-preview]');this._bindColorWheelControls(layer,hue,preview,currentHue);const result=await pending;if(!result)return;const data={entity_id:id};if(result.brightness)data.brightness=Number(result.brightness);if(result.light_mode==='white'){data.color_temp_kelvin=Number(result.kelvin)||currentKelvin;}else if(result.hue)data.rgb_color=this._hsvRgb(result.hue);else if(result.kelvin)data.color_temp_kelvin=Number(result.kelvin);await this._hass.callService('light','turn_on',data);}

  async _loadRegistries(){
    if(!this._hass||this._registriesLoaded||this._registryLoading)return;
    this._registryLoading=true;
    try{
      const [areas,entities,devices]=await Promise.all([
        this._hass.callWS({type:'config/area_registry/list'}),
        this._hass.callWS({type:'config/entity_registry/list'}),
        this._hass.callWS({type:'config/device_registry/list'})
      ]);
      const areaMap=new Map((areas||[]).map(a=>[a.area_id,a.name]));
      const deviceArea=new Map((devices||[]).map(d=>[d.id,d.area_id]));
      this._areas=areaMap;this._entityRegistry=new Map((entities||[]).map(entity=>[entity.entity_id,entity]));this._deviceRegistry=new Map((devices||[]).map(device=>[device.id,device]));this._entityArea.clear();
      for(const e of entities||[]){const areaId=e.area_id||deviceArea.get(e.device_id);if(areaId&&areaMap.has(areaId))this._entityArea.set(e.entity_id,areaMap.get(areaId));}
      this._registriesLoaded=true;
    }catch(err){console.warn('[cl_control] registri HA non disponibili',err);}finally{this._registryLoading=false;this._renderData();}
  }

  _entities(domain,includeHidden=false){
    if(!this._hass)return[];
    return Object.values(this._hass.states)
      .filter(s=>s.entity_id.startsWith(domain+'.'))
      .filter(s=>s.state!=='unknown')
      .filter(s=>includeHidden||!this._hidden.has(s.entity_id))
      .filter(s=>includeHidden||this._customerEntityVisible(s.entity_id))
      .filter(s=>includeHidden||this._visibleForExperience(s,this._moduleForDomain(domain)));
  }

  _moduleForDomain(domain){return({light:'lights',switch:'lights',valve:'lights',cover:'covers',climate:'climate',sensor:'energy',camera:'cameras',alarm_control_panel:'security',binary_sensor:'security',select:'security'})[domain]||domain;}
  _activeExperience(moduleName='home'){return this._previewExperience||this._config?.module_levels?.[moduleName]||this._config?.experience_level||this._bootstrap?.customer_ui?.experience?.default_level||'standard';}
  _entityClassification(entity){if(!entity)return{recommended_level:'standard',classification_confidence:0,classification_reason:'missing',needs_review:true};return classifyEntity(entity.entity_id,entity.attributes||{},this._bootstrap?.discovery||{});}
  _entityLevel(entity){return this._config?.entity_levels?.[entity?.entity_id]||this._entityClassification(entity).recommended_level;}
  _visibleForExperience(entity,moduleName){return visibleAtExperience(this._entityLevel(entity),this._activeExperience(moduleName),false);}

  _areaOrder(){return this._config?.area_order||[];}

  async _setAreaOrder(areas){if(!this._installerOn())return;await this._saveConfig({area_order:[...areas]});}

  _sortAreaEntries(entries){
    const order=this._areaOrder();
    const idx=new Map(order.map((x,i)=>[x,i]));
    return [...entries].sort((a,b)=>{
      const ai=idx.has(a[0])?idx.get(a[0]):9999;
      const bi=idx.has(b[0])?idx.get(b[0]):9999;
      return ai-bi || a[0].localeCompare(b[0],'it');
    });
  }

  _entityOrder(){return this._config?.entity_order||[];}

  async _setEntityOrder(ids){if(!this._installerOn())return;await this._saveConfig({entity_order:[...ids]});}

  _sortEntities(items){
    const order=this._entityOrder();
    const idx=new Map(order.map((id,i)=>[id,i]));
    return [...items].sort((a,b)=>{
      const ai=idx.has(a.entity_id)?idx.get(a.entity_id):999999;
      const bi=idx.has(b.entity_id)?idx.get(b.entity_id):999999;
      return ai-bi || this._friendly(a.entity_id).localeCompare(this._friendly(b.entity_id),'it');
    });
  }

  async _moveEntityRelative(dragId,targetId){
    if(!this._installerOn()||!dragId||!targetId||dragId===targetId)return;
    const all=[...this._entities('light',true),...this._switchLike(true).filter(e=>!/_exclusion$/.test(e.entity_id))];
    const existing=this._entityOrder().filter(id=>all.some(e=>e.entity_id===id));
    const missing=all.map(e=>e.entity_id).filter(id=>!existing.includes(id));
    const order=[...existing,...missing];
    const from=order.indexOf(dragId),to=order.indexOf(targetId);
    if(from<0||to<0)return;
    order.splice(from,1);
    const newTo=order.indexOf(targetId);
    order.splice(newTo,0,dragId);
    await this._setEntityOrder(order);
  }

  _groupByArea(items){
    const groups=new Map();
    for(const item of items){const area=this._areaNameFor(item.entity_id);if(!groups.has(area))groups.set(area,[]);groups.get(area).push(item);}
    for(const [area,list] of groups)groups.set(area,this._sortEntities(list));
    return this._sortAreaEntries([...groups.entries()]);
  }

  _energyMap(role){const id=this._config?.energy?.[role]||'';return id&&this._state(id)?id:'';}

  async _setEnergyMap(role,entityId){if(!this._installerOn())return;const energy={...(this._config.energy||{})};if(entityId)energy[role]=entityId;else delete energy[role];await this._saveConfig({energy});}

  _energySensors(includeHidden=false){
    const rx=/(solar|fotovolta|\bpv\b|produz|generated|generation|consum|consumption|load|casa|house|home|grid|rete|export|import|battery|batteria|soc|energia|energy|power|potenza)/i;
    return this._entities('sensor',includeHidden).filter(s=>{
      const a=s.attributes||{}; const dc=String(a.device_class||'').toLowerCase(); const unit=String(a.unit_of_measurement||'').toLowerCase();
      const text=`${s.entity_id} ${a.friendly_name||''}`;
      const phoneLike=/(phone|telefono|smartphone|iphone|pixel|galaxy|android|mobile|tablet|ipad|companion)/i.test(text);
      const energyLike=['power','energy'].includes(dc) || ['w','kw','wh','kwh'].includes(unit) && rx.test(text);
      const batteryLike=(dc==='battery'||unit==='%') && rx.test(text) && !phoneLike;
      return energyLike || batteryLike;
    });
  }
  _energyModuleAvailable(){
    const mapped=Object.values(this._config?.energy||{}).some(id=>id&&this._state(id)&&!this._hidden.has(id));
    const discovered=this._energySensors(true).some(entity=>!this._hidden.has(entity.entity_id));
    return mapped||discovered;
  }

  _energyRole(s){
    const text=`${s.entity_id} ${s.attributes?.friendly_name||''}`.toLowerCase();
    if(/battery|batteria|soc/.test(text))return'battery';
    if(/solar|fotovolta|\bpv\b|produz|generated|generation/.test(text))return'solar';
    if(/export|immission|feed.?in/.test(text))return'export';
    if(/import|preliev/.test(text))return'import';
    if(/grid|rete/.test(text))return'grid';
    if(/consum|load|casa|house|home/.test(text))return'home';
    return'other';
  }

  _bestEnergy(role,kind='power'){
    const mapped=this._energyMap(role);
    if(mapped && this._state(mapped)) return this._state(mapped);
    const list=this._energySensors().filter(s=>this._energyRole(s)===role);
    const scored=list.map(s=>{const a=s.attributes||{},dc=String(a.device_class||'').toLowerCase(),u=String(a.unit_of_measurement||'').toLowerCase();let score=0;if(kind==='power'&&(dc==='power'||['w','kw'].includes(u)))score+=10;if(kind==='energy'&&(dc==='energy'||['wh','kwh'].includes(u)))score+=10;if(kind==='battery'&&(dc==='battery'||u==='%'))score+=10;return[s,score];}).sort((a,b)=>b[1]-a[1]);
    return scored[0]?.[0]||null;
  }

  _fmtEnergy(s){
    if(!s)return'--'; const n=Number(s.state); const u=s.attributes?.unit_of_measurement||''; if(!Number.isFinite(n))return`${s.state} ${u}`.trim();
    if(u==='W'&&Math.abs(n)>=1000)return`${(n/1000).toFixed(2)} kW`;
    if(u==='kW')return`${n.toFixed(2)} kW`;
    if(u==='Wh'&&Math.abs(n)>=1000)return`${(n/1000).toFixed(2)} kWh`;
    if(u==='kWh')return`${n.toFixed(2)} kWh`;
    if(u==='%')return`${Math.round(n)}%`;
    return`${Math.round(n*100)/100} ${u}`.trim();
  }

  _powerW(s){
    if(!s)return 0;
    const n=Number(s.state); if(!Number.isFinite(n))return 0;
    const u=String(s.attributes?.unit_of_measurement||'').toLowerCase();
    if(u==='kw')return n*1000;
    if(u==='w')return n;
    return 0;
  }

  _inimZones(includeHidden=false){
    return Object.values(this._hass?.states||{})
      .filter(s=>s.entity_id.startsWith('binary_sensor.zone_')&&!s.entity_id.endsWith('_alarm_memory'))
      .filter(s=>includeHidden||!this._hidden.has(s.entity_id))
      .map(s=>{
        const slug=s.entity_id.slice('binary_sensor.'.length);
        const memoryId=`${s.entity_id}_alarm_memory`;
        const stateId=`sensor.${slug}_state`;
        const exclusionId=`switch.${slug}_exclusion`;
        const detailed=this._value(stateId,'');
        const memory=this._value(memoryId,'off')==='on';
        const excluded=this._value(exclusionId,'off')==='on';
        const unavailable=['unknown','unavailable'].includes(s.state);
        return {entityId:s.entity_id,name:this._friendly(s.entity_id),state:s.state,detailed,memory,excluded,exclusionId,hasExclusion:Boolean(this._state(exclusionId)),unavailable};
      })
      .sort((a,b)=>Number(b.memory||b.excluded||b.state==='on'||b.unavailable)-Number(a.memory||a.excluded||a.state==='on'||a.unavailable)||a.name.localeCompare(b.name,'it'));
  }

  _securityZoneClassification(entity){
    if(!entity)return{module:'unassigned',type:'generic',classification_confidence:0,needs_review:false,customer_facing:false,security_candidate:false};
    const metadata=this._entityMetadata(entity.entity_id),alarmMetadata=this._entities('alarm_control_panel',true).map(panel=>this._entityMetadata(panel.entity_id));
    metadata.linked_to_alarm_panel=Boolean(
      metadata.config_entry_id&&alarmMetadata.some(panel=>panel.config_entry_id===metadata.config_entry_id)
      ||metadata.device_id&&alarmMetadata.some(panel=>panel.device_id===metadata.device_id)
    );
    return classifySecurityZone(entity.entity_id,entity.attributes||{},metadata,{
      module:this._config?.entity_modules?.[entity.entity_id]||'',
      subtype:this._config?.entity_subtypes?.[entity.entity_id]||'',
      threshold:this._bootstrap?.discovery?.classification_confidence_threshold,
    });
  }
  _securityZoneCandidates(includeHidden=true){return this._entities('binary_sensor',includeHidden).filter(entity=>this._securityZoneClassification(entity).security_candidate);}
  _securityZoneExperienceLevel(entity,classification){
    const override=this._config?.entity_levels?.[entity.entity_id];
    if(override)return override;
    return classification?.customer_facing&&classification?.module==='security'?'standard':this._entityLevel(entity);
  }
  _securityZoneVisible(entity,classification,includeHidden=false){
    if(!classification.customer_facing)return false;
    if(includeHidden)return true;
    if(this._hidden.has(entity.entity_id)||!this._customerEntityVisible(entity.entity_id))return false;
    return visibleAtExperience(this._securityZoneExperienceLevel(entity,classification),this._activeExperience('security'),false);
  }
  _securityBypassSwitch(entity){
    const metadata=this._entityMetadata(entity?.entity_id),deviceId=metadata.device_id;
    if(!deviceId)return null;
    return this._entities('switch',true).find(candidate=>{
      const candidateMetadata=this._entityMetadata(candidate.entity_id),integration=`${candidateMetadata.platform} ${candidateMetadata.integration} ${candidateMetadata.manufacturer} ${(candidateMetadata.identifiers||[]).join(' ')}`;
      return candidateMetadata.device_id===deviceId&&/risco|irisco/i.test(integration)&&/_(?:bypassed|bypassato)$/.test(candidate.entity_id);
    })||null;
  }
  _securityZones(includeHidden=false){
    return this._entities('binary_sensor',true)
      .map(entity=>({entity,classification:this._securityZoneClassification(entity)}))
      .filter(item=>this._securityZoneVisible(item.entity,item.classification,includeHidden))
      .map(({entity,classification})=>{
        const dc=classification.type,active=entity.state==='on',unavailable=['unknown','unavailable'].includes(entity.state),bypassSwitch=this._securityBypassSwitch(entity),pending=bypassSwitch?this._pendingState(bypassSwitch.entity_id):null,bypassed=bypassSwitch?bypassSwitch.state==='on':Boolean(entity.attributes?.bypassed||entity.attributes?.excluded||entity.attributes?.is_bypassed);
        const labels={door:active?'Aperta':'Chiusa',window:active?'Aperta':'Chiusa',opening:active?'Aperta':'Chiusa',garage:active?'Aperto':'Chiuso',motion:active?'Movimento':'Riposo',occupancy:active?'Occupata':'Libera',smoke:active?'Fumo rilevato':'Regolare',moisture:active?'Perdita rilevata':'Asciutta',gas:active?'Gas rilevato':'Regolare',tamper:active?'Manomissione':'Regolare',vibration:active?'Vibrazione':'Riposo',generic:active?'Anomalia':'Regolare'};
        const state=pending?'Aggiornamento…':unavailable?'Non disponibile':bypassed?'Esclusa':labels[dc];
        return{entity,entityId:entity.entity_id,name:this._displayName(entity.entity_id),area:this._areaNameFor(entity.entity_id),deviceClass:this._securityTypeLabel(dc),state,active:active||bypassed,unavailable,bypassed,bypassEntityId:bypassSwitch?.entity_id||'',hasBypass:Boolean(bypassSwitch),pending:Boolean(pending),classification};
      })
      .sort((a,b)=>Number(b.unavailable||b.bypassed||b.active)-Number(a.unavailable||a.bypassed||a.active)||a.area.localeCompare(b.area,'it')||a.name.localeCompare(b.name,'it'));
  }
  _securityTypeLabel(type){return({motion:'Movimento',occupancy:'Presenza',opening:'Apertura',door:'Porta',window:'Finestra',garage:'Garage',vibration:'Vibrazione',smoke:'Fumo',gas:'Gas',moisture:'Allagamento',tamper:'Manomissione',generic:'Zona sicurezza'})[type]||'Zona sicurezza';}
  async _openSecurityZone(zone){
    if(!zone)return;
    const bypassLabel=zone.hasBypass?(zone.bypassed?'Esclusa':'Inclusa'):'Non disponibile';
    const body=`<div class="zoneSheet"><div class="infoRow"><span>Area</span><b>${this._esc(zone.area)}</b></div><div class="infoRow"><span>Tipo</span><b>${this._esc(zone.deviceClass)}</b></div><div class="infoRow"><span>Stato</span><b>${this._esc(zone.state)}</b></div><div class="infoRow"><span>Esclusione</span><b>${this._esc(bypassLabel)}</b></div>${zone.hasBypass?'':'<p class="fieldHint warning">Questa zona non espone un controllo di esclusione supportato.</p>'}</div>`;
    const result=await this._openDialog({title:zone.name,description:'Dettaglio zona sicurezza',body,confirmLabel:zone.hasBypass?(zone.bypassed?'REINCLUDI ZONA':'ESCLUDI ZONA'):'CHIUDI',cancelLabel:zone.hasBypass?'ANNULLA':'INDIETRO',tone:'securityZoneDialog'});
    if(!result||!zone.hasBypass)return;
    await this._setSecurityZoneBypass(zone,!zone.bypassed);
  }
  async _setSecurityZoneBypass(zone,excluded){
    if(!zone?.hasBypass||!zone.bypassEntityId||zone.unavailable||this._pendingState(zone.bypassEntityId))return;
    const confirmation=await this._openDialog({
      title:`${excluded?'Escludere':'Reincludere'} ${zone.name}?`,
      description:excluded?'La zona non genererà allarmi finché resta esclusa.':'La zona tornerà a proteggere l’area associata.',
      confirmLabel:excluded?'ESCLUDI':'REINCLUDI',
      cancelLabel:'ANNULLA',
      tone:'securityZoneDialog',
    });
    if(!confirmation||this._pendingState(zone.bypassEntityId))return;
    const targetState=excluded?'on':'off',pending={targetState,startedAt:Date.now(),timer:null};
    pending.timer=setTimeout(()=>{if(this._pendingCommands.get(zone.bypassEntityId)===pending){this._pendingCommands.delete(zone.bypassEntityId);this._renderSecurity();this._toast('La zona non ha confermato il nuovo stato.','warning');}},10000);
    this._pendingCommands.set(zone.bypassEntityId,pending);this._renderSecurity();this._toast(excluded?'Esclusione in corso…':'Reinclusione in corso…');
    try{
      await this._hass.callWS({type:'cl_control/security/zone_exclusion',zone_entity_id:zone.entityId,entity_id:zone.bypassEntityId,excluded});
      this._toast(excluded?'Zona esclusa.':'Zona reinclusa.','success');
    }catch(err){
      clearTimeout(pending.timer);this._pendingCommands.delete(zone.bypassEntityId);this._renderSecurity();
      const code=String(err?.code||''),technical=String(err?.message||err||'Errore sconosciuto');
      console.error('[cl_control] gestione zona sicurezza non riuscita',{code,technical,zone_entity_id:zone.entityId,entity_id:zone.bypassEntityId,excluded});
      const friendly=code==='not_allowed'?'Questa zona non è autorizzata.':code==='state_not_confirmed'?'La zona non ha confermato il nuovo stato.':code==='service_error'?'Home Assistant non ha eseguito il comando.':'Impossibile aggiornare la zona.';
      this._toast(friendly,'error');
    }
  }

  async _toggleInimZone(zone){
    if(!zone?.hasExclusion)return;
    const pin=await this._requestPin(`${zone.excluded?'Includi':'Escludi'} zona`,zone.name);
    if(pin===null)return;
    try{
      await this._hass.callWS({type:'cl_control/security/zone_exclusion',pin,entity_id:zone.exclusionId,excluded:!zone.excluded});
    }catch(err){
      console.error('[cl_control] esclusione zona INIM non riuscita',err);
      this._toast('Comando sicurezza non disponibile.','error');
    }
  }

  _switchType(e){
    if(!e)return'interruttore';const override=this._config?.switch_types?.[e.entity_id];if(override&&override!=='auto')return override;
    if(e.entity_id.startsWith('valve.'))return'valvola';const dc=String(e.attributes?.device_class||'').toLowerCase();
    if(dc==='outlet')return'presa';if(/valve|valvol/.test(dc))return'valvola';if(/pump|pompa/.test(`${dc} ${e.entity_id} ${e.attributes?.friendly_name||''}`))return'pompa';return'interruttore';
  }
  _switchIcon(type){return icon(({pompa:'energy',ventilazione:'climate',tecnico:'more',luce:'lights'})[type]||'more');}
  _switchLike(includeHidden=false){return [...this._entities('switch',includeHidden).filter(e=>!/_exclusion$/.test(e.entity_id)),...this._entities('valve',includeHidden)].filter(entity=>this._switchClassification(entity).customer_facing);}
  _coverInfo(entity){return classifyCover(entity?.entity_id,entity?.attributes||{},this._entityMetadata(entity?.entity_id),this._config?.entity_subtypes?.[entity?.entity_id]||'');}
  _coversTitle(){const types=[...new Set(this._entities('cover').map(entity=>this._coverInfo(entity).type))];if(types.length!==1)return'Aperture';return({window:'Finestre',shutter:'Tapparelle',blind:'Tende/Veneziane',curtain:'Tende',door:'Porte',garage:'Garage',gate:'Cancelli'})[types[0]]||'Aperture';}
  _climateState(state){return({heat:'Riscaldamento',cool:'Raffrescamento',off:'Spento',auto:'Automatico',heat_cool:'Auto caldo/freddo',dry:'Deumidificazione',fan_only:'Ventilazione',idle:'In attesa'})[state]||this._pretty(state);}
  _alarmState(state){return({disarmed:'Disinserito',armed_home:'Parziale',armed_away:'Inserito',armed_night:'Notte',armed_custom_bypass:'Parziale',arming:'In inserimento',pending:'In attesa',triggered:'In allarme',unavailable:'Non disponibile'})[state]||this._pretty(state);}

  _discoverSecurity(){
    const ids=Object.keys(this._hass?.states||{});
    if(ids.some(id=>id.startsWith('select.partition_')&&id.endsWith('_mode'))&&ids.some(id=>id.startsWith('binary_sensor.inim_prime_panel_')))return'inim';
    const panels=ids.filter(id=>id.startsWith('alarm_control_panel.')&&!this._hidden.has(id));
    if(panels.some(id=>/risco|irisco/i.test(id+' '+this._friendly(id))))return'risco';
    if(panels.length)return'generic';if(this._securityZones().length)return'generic';return'none';
  }

  _inimPartitions(includeHidden=false){
    const wanted=[
      ['interno','Interno',['interno','interni','interne']],['porte','Porte',['porta','porte']],['sismico','Sismico',['sismico']],['finestre','Finestre',['finestra','finestre']],['esterno','Esterno',['esterno']],['controlli','Controlli',['controllo','controlli']],['cassaforte','Cassaforte',['cassaforte']],['tele_balcone','Tele. Balcone',['tele balcone','tele. balcone','telecamere balcone','balcone']],['tele_cancello','Tele. Cancello',['tele cancello','tele. cancello','telecamere cancello','cancello']],['tele_giardino','Tele. Giardino',['tele giardino','tele. giardino','telecamere giardino','giardino']]
    ];
    return Object.values(this._hass?.states||{}).filter(s=>s.entity_id.startsWith('select.partition_')&&s.entity_id.endsWith('_mode')).filter(s=>includeHidden||!this._hidden.has(s.entity_id)).map(m=>{const id=m.entity_id.slice('select.partition_'.length,-'_mode'.length);const hay=(id+' '+(m.attributes?.friendly_name||'')).toLowerCase().replaceAll('_',' ');const idx=wanted.findIndex(w=>w[2].some(a=>hay.includes(a)));if(idx<0)return null;return{id,name:wanted[idx][1],order:idx,modeId:m.entity_id,stateId:`sensor.partition_${id}_state`,memoryId:`binary_sensor.partition_${id}_alarm_memory`,mode:m.state,state:this._value(`sensor.partition_${id}_state`),options:m.attributes?.options||[]};}).filter(Boolean).sort((a,b)=>a.order-b.order);
  }

  _ensurePartitionSelection(){const parts=this._inimPartitions();const ids=new Set(parts.map(p=>p.id));for(const x of [...this._selectedPartitions])if(!ids.has(x))this._selectedPartitions.delete(x);if(!this._selectionInitialized&&ids.size){ids.forEach(x=>this._selectedPartitions.add(x));this._selectionInitialized=true;}}

  _navItems(){
    const labels=this._bootstrap?.customer_ui?.labels||{};
    const items=[['home','home',labels.home||'Home']];
    if(this._entities('light').length)items.push(['lights','lights',labels.lights||'Luci']);
    if(this._entities('cover').length)items.push(['covers','covers',labels.covers&&labels.covers!=='Tapparelle'?labels.covers:this._coversTitle()]);
    if(this._entities('climate').length)items.push(['climate','climate',labels.climate||'Clima']);
    if(this._energyModuleAvailable())items.push(['energy','energy',labels.energy||'Energia']);
    if(this._securityProvider!=='none')items.push(['security','security',labels.security||'Sicurezza']);
    if(this._entities('camera').length)items.push(['cameras','cameras',labels.cameras||'Telecamere']);
    if((this._config?.favorites||[]).length)items.push(['favorites','favorites',labels.favorites||'Preferiti']);
    items.push(['support','support',labels.support||'Assistenza']);if(this._hass?.user?.is_admin)items.push(['more','more',labels.installer||'Installatore']); return items;
  }

  _renderShell(){
    const brand=this._bootstrap?.branding||{};
    const logo=this._esc(brand.assets?.logo||'');
    const company=this._esc(brand.company_name||'');
    const product=this._esc(brand.brand_name||brand.product_name||'');
    this.shadowRoot.innerHTML=`<style>
      :host{display:block;min-height:100%;font-family:var(--cl-font-family);color:var(--cl-text);background:var(--cl-background);--line:var(--cl-line);--muted:var(--cl-muted);--green:var(--cl-success);--yellow:var(--cl-warning);--red:var(--cl-danger);--cyan:var(--cl-primary)}.app{min-height:100vh;background:var(--cl-app-background);padding:var(--cl-space-md) var(--cl-space-md) var(--cl-panel-bottom-space)}.wrap{max-width:var(--cl-content-max-width);margin:auto}.top{display:flex;justify-content:space-between;align-items:center;gap:12px;position:sticky;top:0;z-index:10;padding:4px 2px 12px;background:var(--cl-top-background);backdrop-filter:blur(10px)}.brand{display:flex;align-items:center;gap:14px}.logo{width:var(--cl-logo-size);height:var(--cl-logo-size);object-fit:contain;filter:drop-shadow(0 0 14px color-mix(in srgb,var(--cl-primary) 25%,transparent))}.kicker{font-size:var(--cl-font-label);letter-spacing:.15em;font-weight:900;color:var(--cl-primary)}.title{font-size:var(--cl-font-title);font-weight:950}.sub{font-size:var(--cl-font-caption);color:var(--cl-muted)}.card{background:var(--cl-card-background);border:1px solid var(--line);border-radius:var(--cl-radius-xl);padding:var(--cl-space-lg);margin-bottom:var(--cl-space-md);box-shadow:var(--cl-shadow-medium)}.hero{background:var(--cl-hero-background)}.hero h1{margin:5px 0 6px;font-size:var(--cl-font-display)}.muted{color:var(--muted);font-size:var(--cl-font-body-small)}.stats{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-top:14px}.stat{padding:11px 7px;text-align:center;border:1px solid var(--line);border-radius:14px;background:var(--cl-surface-translucent)}.stat b{display:block;font-size:18px}.stat span{font-size:var(--cl-font-caption);color:var(--muted)}.sectionHead{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:11px}.sectionHead h2{font-size:var(--cl-font-heading);margin:0}.pill{font-size:var(--cl-font-caption);font-weight:900;border-radius:var(--cl-radius-pill);padding:5px 9px;background:color-mix(in srgb,var(--cl-primary) 14%,transparent);color:var(--cl-primary)}.pill.ok{background:color-mix(in srgb,var(--cl-success) 13%,transparent);color:var(--green)}.pill.warn{background:color-mix(in srgb,var(--cl-warning) 13%,transparent);color:var(--yellow)}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.entity{border:1px solid var(--cl-line);border-radius:15px;padding:12px;background:var(--cl-surface-translucent)}.lightEntity{position:relative;overflow:hidden;transition:var(--cl-motion-normal) background,var(--cl-motion-normal) border-color,var(--cl-motion-normal) box-shadow,var(--cl-motion-normal) transform}.lightEntity.on{background:linear-gradient(145deg,var(--cl-warning-soft),var(--cl-warning-soft));border-color:var(--cl-warning);box-shadow:0 0 0 1px var(--cl-warning-soft),0 10px 28px var(--cl-warning-soft)}.lightEntity.on:before{content:"";position:absolute;width:90px;height:90px;border-radius:50%;right:-40px;top:-44px;background:var(--cl-warning-soft);filter:blur(3px)}.lightMain{display:flex;align-items:center;gap:11px;min-width:0}.lightIcon{width:42px;height:42px;flex:0 0 42px;border-radius:50%;display:grid;place-items:center;font-size:22px;background:var(--cl-overlay-soft);filter:grayscale(1);opacity:.55}.lightEntity.on .lightIcon{background:var(--cl-warning-soft);filter:none;opacity:1;box-shadow:0 0 22px var(--cl-warning-soft)}.lightEntity.on .name{color:var(--cl-warning)}.lightEntity.on .meta{color:var(--cl-warning)}.row{display:flex;align-items:center;justify-content:space-between;gap:10px}.name{font-size:var(--cl-font-body);font-weight:850}.meta{font-size:var(--cl-font-caption);color:var(--cl-muted);margin-top:2px}.btn{border:1px solid var(--line);border-radius:var(--cl-radius-md);background:var(--cl-surface-alt);color:var(--cl-text);padding:var(--cl-space-sm) var(--cl-space-md);min-height:var(--cl-touch-target);font-size:var(--cl-font-label);font-weight:850;cursor:pointer;transition:transform var(--cl-motion-fast) var(--cl-easing),background var(--cl-motion-normal) var(--cl-easing)}.btn.primary{background:var(--cl-secondary);color:var(--cl-primary)}.btn.on{background:color-mix(in srgb,var(--cl-success) 15%,transparent);color:var(--green)}.btn.danger{background:color-mix(in srgb,var(--cl-danger) 12%,transparent);color:var(--red)}.btn.warn{background:color-mix(in srgb,var(--cl-warning) 13%,transparent);color:var(--yellow)}.slider{width:100%;accent-color:var(--cl-primary);margin-top:10px}.lightEntity.on{background:linear-gradient(145deg,rgba(var(--light-rgb,var(--cl-light-default-rgb)),.25),var(--cl-warning-soft));border-color:rgba(var(--light-rgb,var(--cl-light-default-rgb)),.68);box-shadow:0 0 0 1px rgba(var(--light-rgb,var(--cl-light-default-rgb)),.11),0 10px 28px rgba(var(--light-rgb,var(--cl-light-default-rgb)),.10)}.lightEntity.on .lightIcon{background:rgba(var(--light-rgb,var(--cl-light-default-rgb)),.18);box-shadow:0 0 22px rgba(var(--light-rgb,var(--cl-light-default-rgb)),.25)}.lightControls{display:flex;align-items:center;gap:8px;margin-top:9px;flex-wrap:wrap}.colorControl{display:flex;align-items:center;gap:7px;border:1px solid var(--line);border-radius:11px;padding:6px 8px;background:var(--cl-surface-translucent);font-size:var(--cl-font-caption);color:var(--muted);font-weight:800}.colorPicker{width:30px;height:25px;padding:0;border:0;background:transparent;cursor:pointer}.colorPicker::-webkit-color-swatch-wrapper{padding:0}.colorPicker::-webkit-color-swatch{border:1px solid var(--cl-overlay-soft);border-radius:var(--cl-radius-sm)}.areaTitle{font-size:var(--cl-font-body-small);letter-spacing:.08em;color:var(--cl-primary);font-weight:900;margin:14px 0 8px}.areaTitle:first-child{margin-top:0}.areaBlock{border:1px solid var(--cl-line);border-radius:var(--cl-radius-lg);padding:11px;margin:12px 0;background:var(--cl-surface-translucent)}.areaBlock.active{border-color:color-mix(in srgb,var(--cl-warning) 38%,transparent);box-shadow:0 0 0 1px color-mix(in srgb,var(--cl-warning) 6%,transparent)}.areaHeader{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:9px}.areaHeaderLeft{min-width:0}.areaHeader .areaTitle{margin:0}.areaFeedback{font-size:var(--cl-font-caption);color:var(--muted);margin-top:3px}.areaToggle{white-space:nowrap}.switchSection{margin-top:10px;padding-top:9px;border-top:1px dashed var(--cl-line)}.switchTitle{font-size:var(--cl-font-caption);font-weight:900;letter-spacing:.08em;color:var(--cl-muted);margin-bottom:7px}.switchEntity.on{border-color:color-mix(in srgb,var(--cl-success) 35%,transparent);background:var(--cl-success-soft)}.switchIcon{width:42px;height:42px;border-radius:13px;display:grid;place-items:center;background:var(--cl-overlay-soft);border:1px solid var(--cl-line)}.switchGlyph{position:relative;width:26px;height:15px;border-radius:var(--cl-radius-pill);background:var(--cl-state-disabled);box-shadow:inset 0 1px 3px color-mix(in srgb,var(--cl-background) 55%,transparent)}.entityActions{display:flex;gap:5px;align-items:center}.starBtn,.editBtn{border:0;background:transparent;color:var(--cl-muted);font-size:18px;padding:4px 5px;cursor:pointer}.starBtn.active{color:var(--cl-warning)}.editBtn{font-size:var(--cl-font-heading)}.homeStat{cursor:pointer}.homeStat:hover{border-color:color-mix(in srgb,var(--cl-primary) 45%,transparent)}.filterBar{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:10px}.filterBar .btn.active{background:var(--cl-secondary);color:var(--cl-primary)}.supportGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.supportCard{min-height:118px;text-align:left}.supportCard.disabled{opacity:.55}.switchGlyph:after{content:"";position:absolute;top:2px;left:2px;width:11px;height:11px;border-radius:50%;background:var(--cl-text);box-shadow:0 1px 3px color-mix(in srgb,var(--cl-background) 55%,transparent);transition:var(--cl-motion-normal)}.switchEntity.on .switchIcon{background:color-mix(in srgb,var(--cl-success) 14%,transparent);border-color:color-mix(in srgb,var(--cl-success) 28%,transparent)}.switchEntity.on .switchGlyph{background:color-mix(in srgb,var(--cl-success) 70%,transparent)}.switchEntity.on .switchGlyph:after{left:13px;background:var(--cl-text)}.installerDragHint{display:flex;align-items:center;gap:7px;margin:0 0 10px;padding:8px 10px;border-radius:var(--cl-radius-md);background:color-mix(in srgb,var(--cl-primary) 8%,transparent);border:1px dashed color-mix(in srgb,var(--cl-primary) 28%,transparent);font-size:var(--cl-font-caption);color:var(--cl-primary);font-weight:800}.entity.dragReady{touch-action:none;cursor:grab}.entity.dragging{opacity:.55;transform:scale(.985);outline:2px solid var(--cyan);outline-offset:2px}.entity.dragTarget{border-color:var(--yellow)!important;box-shadow:0 0 0 2px color-mix(in srgb,var(--cl-warning) 16%,transparent)}.dragHandle{display:none;align-items:center;justify-content:center;width:28px;height:28px;border-radius:9px;border:1px solid var(--line);background:color-mix(in srgb,var(--cl-primary) 8%,transparent);color:var(--cl-primary);font-size:var(--cl-font-heading);flex:0 0 28px}.installer-active .dragHandle{display:flex}.installer-active .entity.dragReady{user-select:none;-webkit-user-select:none}.areaOrderList{display:grid;gap:7px}.areaOrderRow{display:grid;grid-template-columns:1fr auto;align-items:center;gap:8px;padding:10px 11px;border-radius:13px;background:var(--cl-surface-translucent);border:1px solid var(--cl-line)}.areaOrderBtns{display:flex;gap:5px}.areaOrderBtns .btn{padding:7px 9px}.coverBtns,.climateBtns{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}.temp{font-size:22px;font-weight:950}.cameraGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.camera{overflow:hidden;border-radius:17px;border:1px solid var(--line);background:var(--cl-surface-alt);cursor:pointer;position:relative}.camera img{width:100%;height:var(--cl-camera-height);object-fit:cover;display:block}.camera .shade{position:absolute;left:0;right:0;bottom:0;padding:28px 11px 10px;background:linear-gradient(transparent,color-mix(in srgb,var(--cl-background) 92%,transparent));font-size:var(--cl-font-body-small);font-weight:900}.offline{filter:grayscale(1) brightness(.5)}.page{display:none}.page.active{display:block}.nav{position:fixed;left:50%;bottom:8px;transform:translateX(-50%);width:min(var(--cl-navigation-max-width),calc(100% - 18px));display:flex;gap:4px;padding:6px;overflow-x:auto;border:1px solid var(--line);border-radius:var(--cl-radius-lg);background:var(--cl-nav-background);backdrop-filter:blur(16px);z-index:30}.nav button{flex:1 0 var(--cl-navigation-item-width);border:0;border-radius:var(--cl-radius-md);background:transparent;color:var(--cl-muted);padding:7px 5px;font-size:var(--cl-font-caption);font-weight:850}.nav button.active{background:var(--cl-secondary);color:var(--cl-primary)}.nav i{display:block;font-style:normal;font-size:16px;margin-bottom:2px}.empty{padding:16px;text-align:center;color:var(--cl-muted);font-size:var(--cl-font-body-small)}.partition{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center}.partition input{width:20px;height:20px;accent-color:var(--cl-primary)}.chip{font-size:var(--cl-font-caption);font-weight:900;border-radius:var(--cl-radius-pill);padding:5px 8px;background:color-mix(in srgb,var(--cl-primary) 12%,transparent);color:var(--cl-primary)}.modes{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.mode{border:1px solid var(--line);border-radius:15px;padding:13px;background:var(--cl-surface);color:var(--cl-text);font-size:var(--cl-font-label);font-weight:900}.mode small{display:block;font-size:var(--cl-font-micro);color:var(--cl-muted);margin-top:4px}.mode.total{background:linear-gradient(145deg,color-mix(in srgb,var(--cl-danger) 35%,var(--cl-surface)),var(--cl-surface))}.mode.partial{background:linear-gradient(145deg,color-mix(in srgb,var(--cl-warning) 30%,var(--cl-surface)),var(--cl-surface))}.mode.instant{background:linear-gradient(145deg,color-mix(in srgb,var(--cl-primary) 35%,var(--cl-surface)),var(--cl-surface))}.mode.disarm{background:linear-gradient(145deg,color-mix(in srgb,var(--cl-success) 35%,var(--cl-surface)),var(--cl-surface))}.energyFlow{display:grid;grid-template-columns:repeat(4,1fr);gap:9px}.energyNode{border:1px solid var(--line);border-radius:17px;background:var(--cl-surface-translucent);padding:15px;text-align:center}.energyNode .ico{font-size:24px}.energyNode b{display:block;font-size:18px;margin-top:6px}.energyNode span{font-size:var(--cl-font-caption);color:var(--muted)}.energyScene{position:relative;min-height:430px;border:1px solid var(--line);border-radius:22px;background:radial-gradient(circle at 50% 48%,color-mix(in srgb,var(--cl-primary) 12%,transparent),transparent 28%),var(--cl-surface-translucent);overflow:hidden}.flowNode{position:absolute;width:142px;color:var(--cl-text);min-height:var(--cl-flow-node-min-height);border:1px solid var(--line);border-radius:var(--cl-radius-lg);background:linear-gradient(145deg,var(--cl-surface),var(--cl-surface-alt));display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:10px;z-index:3;box-shadow:0 12px 28px color-mix(in srgb,var(--cl-background) 55%,transparent)}.flowNode .flowIcon{font-size:28px;line-height:1}.flowNode b{font-size:17px;margin-top:6px}.flowNode small{font-size:var(--cl-font-caption);color:var(--cl-muted);margin-top:2px}.flowNode.solar{left:7%;top:7%}.flowNode.battery{right:7%;top:7%}.flowNode.home{left:50%;top:48%;transform:translate(-50%,-50%);width:160px;min-height:118px;border-color:color-mix(in srgb,var(--cl-primary) 35%,transparent)}.flowNode.grid{left:50%;bottom:6%;transform:translateX(-50%)}.flowLine{position:absolute;height:3px;background:var(--cl-line);transform-origin:left center;z-index:1;overflow:visible}.flowLine:after{content:\"\";position:absolute;top:50%;left:0;width:9px;height:9px;margin-top:-4.5px;border-radius:50%;background:var(--cl-warning);box-shadow:0 0 14px var(--cl-warning);opacity:0}.flowLine.active:after{opacity:1;animation:energyDot var(--cl-motion-flow) linear infinite}.flowLine.reverse.active:after{animation-direction:reverse}.lineSolar{left:24%;top:29%;width:31%;transform:rotate(25deg)}.lineBattery{left:53%;top:55%;width:31%;transform:rotate(-25deg)}.lineGrid{left:50%;top:62%;width:19%;transform:rotate(90deg)}@keyframes energyDot{0%{left:0}100%{left:100%}}.flowLegend{display:flex;gap:10px;flex-wrap:wrap;margin-top:10px;font-size:var(--cl-font-caption);color:var(--muted)}.flowLegend span{display:inline-flex;align-items:center;gap:5px}.flowLegend i{width:8px;height:8px;border-radius:50%;background:var(--cl-warning)}.energyMapGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.energyMapItem{border:1px solid var(--line);border-radius:14px;padding:10px;background:var(--cl-surface-translucent)}.energyMapItem label{display:block;font-size:var(--cl-font-label);font-weight:900;margin-bottom:6px}.energySelect{width:100%;border:1px solid var(--line);border-radius:10px;padding:9px;background:var(--cl-surface-alt);color:var(--cl-text);font-size:var(--cl-font-label);outline:none}.zoneState{font-size:var(--cl-font-caption);font-weight:900;border-radius:var(--cl-radius-pill);padding:5px 8px;white-space:nowrap}.zoneState.ok{background:color-mix(in srgb,var(--cl-success) 13%,transparent);color:var(--green)}.zoneState.warn{background:color-mix(in srgb,var(--cl-warning) 14%,transparent);color:var(--yellow)}.zoneState.bad{background:color-mix(in srgb,var(--cl-danger) 13%,transparent);color:var(--red)}.zoneActions{display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end}.installerHero{display:flex;justify-content:space-between;align-items:center;gap:12px}.search{width:100%;border:1px solid var(--line);border-radius:13px;padding:11px;background:var(--cl-surface-alt);color:var(--cl-text);outline:none}.hideRow{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center}.hiddenTag{color:var(--yellow)}      .energyMapItem{position:relative}.energySearch{width:100%;border:1px solid var(--line);border-radius:var(--cl-radius-md);padding:9px 10px;background:var(--cl-surface-alt);color:var(--cl-text);font-size:var(--cl-font-body-small);outline:none;margin-top:6px}.energyMatches{display:none;position:absolute;left:0;right:0;top:100%;z-index:45;max-height:220px;overflow:auto;border:1px solid var(--line);border-radius:var(--cl-radius-md);background:var(--cl-surface);box-shadow:0 16px 36px color-mix(in srgb,var(--cl-background) 55%,transparent);padding:5px}.energyMapItem.searchOpen .energyMatches{display:block}.energyMatch{width:100%;border:0;border-radius:9px;background:transparent;color:var(--cl-text);text-align:left;padding:8px;font-size:var(--cl-font-label);cursor:pointer}.energyMatch:hover,.energyMatch:focus{background:color-mix(in srgb,var(--cl-primary) 13%,transparent)}.energyMatch b{display:block;font-size:var(--cl-font-label)}.energyMatch span{display:block;color:var(--muted);font-size:var(--cl-font-caption);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.energyMapActions{display:flex;gap:6px;margin-top:6px}.energyMapActions .btn{flex:1;padding:8px 7px;font-size:var(--cl-font-caption)}
.themeGrid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:9px}.themeCard{border:1px solid var(--line);border-radius:16px;padding:8px;background:var(--cl-surface-translucent);color:inherit;cursor:pointer;text-align:left}.themeCard.active{outline:2px solid var(--cyan);box-shadow:0 0 0 4px color-mix(in srgb,var(--cl-primary) 12%,transparent)}.themePreview{background:radial-gradient(circle at 80% 0,var(--preview-primary) 0,transparent 40%),linear-gradient(145deg,var(--preview-background),var(--preview-surface));height:72px;border-radius:var(--cl-radius-md);margin-bottom:8px;border:1px solid var(--cl-overlay-soft);position:relative;overflow:hidden}.themePreview:after{content:"";position:absolute;left:10px;right:10px;bottom:9px;height:19px;border-radius:7px;background:var(--cl-overlay-soft);box-shadow:0 -27px 0 var(--cl-overlay-soft)}.themeCard b{display:block;font-size:var(--cl-font-label)}.themeCard span{display:block;font-size:var(--cl-font-micro);color:var(--muted);margin-top:2px}
      .climateEntity{cursor:pointer;transition:var(--cl-motion-normal) transform,var(--cl-motion-normal) border-color,var(--cl-motion-normal) background}.climateEntity:hover{border-color:color-mix(in srgb,var(--cl-primary) 32%,transparent);background:var(--cl-surface-translucent)}.climateEntity:active{transform:scale(.995)}.energySceneV2{display:grid;grid-template-rows:auto 54px auto;gap:8px;align-items:center;justify-items:center;padding:8px 2px}.flowMiddle{width:100%;display:grid;grid-template-columns:minmax(120px,1fr) 54px minmax(140px,1.15fr) 54px minmax(120px,1fr);align-items:center;gap:8px}.flowNodeV2{width:100%;min-height:108px;border:1px solid var(--line);border-radius:var(--cl-radius-lg);background:linear-gradient(145deg,var(--cl-surface),var(--cl-surface-alt));display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:12px;box-shadow:0 12px 28px color-mix(in srgb,var(--cl-background) 55%,transparent)}.flowNodeV2.solar{width:min(220px,70%)}.flowNodeV2.home{border-color:color-mix(in srgb,var(--cl-primary) 38%,transparent);box-shadow:0 0 30px color-mix(in srgb,var(--cl-primary) 8%,transparent)}.flowNodeV2 .flowIcon{font-size:var(--cl-font-display)}.flowNodeV2 b{font-size:18px;margin-top:6px}.flowNodeV2 small{font-size:var(--cl-font-caption);color:var(--muted);margin-top:3px}.flowArrow{position:relative;display:flex;align-items:center;justify-content:center;color:var(--cl-muted);overflow:hidden}.flowArrow span{font-size:22px;font-weight:900;z-index:2}.flowArrow i{position:absolute;width:9px;height:9px;border-radius:50%;background:var(--cl-warning);box-shadow:0 0 13px var(--cl-warning);opacity:0}.flowArrow.active i{opacity:1}.flowArrow.vertical{height:54px;width:44px}.flowArrow.vertical i{animation:flowDotV var(--cl-motion-flow) linear infinite}.flowArrow.horizontal{height:48px;width:54px}.flowArrow.horizontal i{animation:flowDotH var(--cl-motion-flow) linear infinite}.flowArrow.reverse i{animation-direction:reverse}@keyframes flowDotH{0%{left:3%}100%{left:80%}}@keyframes flowDotV{0%{top:2%}100%{top:78%}}
.pvDiagram{display:grid;grid-template-columns:minmax(100px,1fr) 44px minmax(145px,1.25fr) 44px minmax(100px,1fr);grid-template-rows:auto 44px auto;grid-template-areas:". . solar . ." ". . solarLink . ." "battery batteryLink home gridLink grid";align-items:center;gap:8px;padding:8px 2px 4px}.pvNode{min-width:0;min-height:118px;border:1px solid var(--line);border-radius:20px;background:linear-gradient(145deg,var(--cl-surface),var(--cl-surface-alt));display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:12px;box-shadow:0 13px 30px color-mix(in srgb,var(--cl-background) 55%,transparent)}.pvNode.solar{grid-area:solar;max-width:230px;justify-self:center;width:100%}.pvNode.battery{grid-area:battery}.pvNode.home{grid-area:home;border-color:color-mix(in srgb,var(--cl-primary) 48%,transparent);box-shadow:0 0 32px color-mix(in srgb,var(--cl-primary) 10%,transparent)}.pvNode.grid{grid-area:grid}.pvNode .pvIcon{font-size:31px;line-height:1}.pvNode b{font-size:19px;margin-top:8px;white-space:nowrap}.pvNode small{font-size:var(--cl-font-caption);color:var(--muted);margin-top:4px}.pvLink{position:relative;display:flex;align-items:center;justify-content:center;color:var(--cl-muted);overflow:hidden;min-width:0}.pvLink.solarLink{grid-area:solarLink;height:44px}.pvLink.batteryLink{grid-area:batteryLink;height:42px}.pvLink.gridLink{grid-area:gridLink;height:42px}.pvLink .arrow{font-size:21px;font-weight:950;z-index:2}.pvLink .particle{position:absolute;width:8px;height:8px;border-radius:50%;background:var(--cl-warning);box-shadow:0 0 13px var(--cl-warning);opacity:0}.pvLink.active .particle{opacity:1}.pvLink.vertical .particle{animation:pvV var(--cl-motion-flow) linear infinite}.pvLink.horizontal .particle{animation:pvH var(--cl-motion-flow) linear infinite}.pvLink.reverse .particle{animation-direction:reverse}@keyframes pvH{0%{left:4%}100%{left:78%}}@keyframes pvV{0%{top:4%}100%{top:76%}}.pvLegend{display:flex;justify-content:center;gap:16px;flex-wrap:wrap;margin-top:12px;font-size:var(--cl-font-caption);color:var(--muted)}.pvLegend i{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--cl-warning);margin-right:5px;box-shadow:0 0 8px var(--cl-warning)}
    ${buildUi3Styles(brand)}${this._responsiveCss()}</style><div class="app"><div class="shell"><header class="top"><a class="brand brandHome" href="${this._esc(new URL('/',window.location.origin).href)}" aria-label="Apri Home Assistant">${logo?`<img class="logo" src="${logo}" alt="${product}">`:''}<div class="brandCopy"><div class="title">${product}</div><div class="siteName">${this._esc(this._config?.support?.site_name||company)}</div></div></a><button id="refresh" class="iconBtn" aria-label="Aggiorna">${icon('refresh')}</button></header><nav id="nav" class="nav" aria-label="Navigazione principale"></nav><main class="wrap"><div class="content"><section id="page-home" class="page active"></section><section id="page-lights" class="page"></section><section id="page-covers" class="page"></section><section id="page-climate" class="page"></section><section id="page-energy" class="page"></section><section id="page-security" class="page"></section><section id="page-cameras" class="page"></section><section id="page-favorites" class="page"></section><section id="page-support" class="page"></section><section id="page-overflow" class="page"></section><section id="page-more" class="page"></section></div></main></div></div><div id="dialogLayer" class="dialogLayer" aria-hidden="true"></div><div id="toastRegion" class="toastRegion" aria-live="polite"></div>`;
  }

  _responsiveCss(){
    const bp=this._bootstrap?.branding?.design_tokens?.breakpoints||{};
    const phone=Number(bp.phone)||480,tablet=Number(bp.tablet)||768;
    return `@media(max-width:${tablet}px){.cameraGrid,.energyMapGrid{grid-template-columns:1fr}.camera img{height:210px}.modes,.energyFlow{grid-template-columns:1fr 1fr}.themeGrid{grid-template-columns:repeat(2,1fr)}}@media(max-width:${phone}px){.supportGrid{grid-template-columns:1fr}}`;
  }

  _layoutKey(view=this._layoutEditor.view,context=this._layoutEditor.context){return`${context}:${view}`;}
  _layoutGenerated(root,view){
    const cards=[];
    if(view==='home'){
      const status=root.querySelector('.statusCard');if(status){status.dataset.layoutId='home:status';status.dataset.layoutType='status';cards.push({id:'home:status',type:'status'});}
      root.querySelectorAll('.quickTile[data-open]').forEach((element,index)=>{const id=`home:module:${element.dataset.open}`;element.dataset.layoutId=id;element.dataset.layoutType=element.dataset.open==='support'?'assistance':'module';cards.push({id,type:element.dataset.layoutType,order:index+1});});
      const favorites=root.querySelector('.sectionHead [data-open="favorites"]')?.closest('.sectionHead');if(favorites){favorites.dataset.layoutId='home:favorites';favorites.dataset.layoutType='favorites';cards.push({id:'home:favorites',type:'favorites',order:cards.length});}
    }else if(view==='lights'){
      root.querySelectorAll('[data-order-entity]').forEach((element,index)=>{const id=`lights:entity:${element.dataset.orderEntity}`;element.dataset.layoutId=id;element.dataset.layoutType=element.dataset.orderKind==='switch'?'switch':'light';cards.push({id,type:element.dataset.layoutType,order:index});});
    }
    return cards;
  }
  _layoutContext(){return layoutDeviceContext(this.getBoundingClientRect?.().width||window.innerWidth,this._layoutEditor.device==='auto'?this._layoutEditor.context:this._layoutEditor.device);}
  _layoutDraft(root,view,generated){
    const key=this._layoutKey(view);if(this._layoutEditor.drafts.has(key))return this._layoutEditor.drafts.get(key);
    const context=this._layoutEditor.context,items=effectiveLayout(this._config?.layout,context,view,generated);this._layoutEditor.drafts.set(key,items);return items;
  }
  _layoutMarkup(){const e=this._layoutEditor;return`<div class="layoutEditorBar" role="toolbar" aria-label="Editor layout"><label>Vista<select data-layout-view><option value="home" ${e.view==='home'?'selected':''}>Home</option><option value="lights" ${e.view==='lights'?'selected':''}>Luci</option></select></label><label>Override<select data-layout-context>${[['base','Base'],['mobile','Smartphone'],['tablet','Tablet'],['wall','Wall panel']].map(([id,label])=>`<option value="${id}" ${e.context===id?'selected':''}>${label}</option>`).join('')}</select></label><label>Profilo<select data-layout-experience><option value="">Cliente</option>${['essential','standard','pro'].map(x=>`<option value="${x}" ${this._previewExperience===x?'selected':''}>${x.toUpperCase()}</option>`).join('')}</select></label><label>Anteprima<select data-layout-device>${[['auto','Automatico'],['mobile','Smartphone'],['tablet','Tablet'],['wall','Wall panel']].map(([id,label])=>`<option value="${id}" ${e.device===id?'selected':''}>${label}</option>`).join('')}</select></label><span class="layoutEditorStatus">${e.dirty?'Modifiche non salvate':'Bozza locale'}</span><button class="btn" data-layout-preview>${e.preview?'Modifica':'Anteprima cliente'}</button><button class="btn" data-layout-cancel>Annulla</button><button class="btn primary" data-layout-save ${e.dirty?'':'disabled'}>Salva</button></div>`;}
  _decorateLayoutCard(element,card){
    element.style.order=String(card.order);element.style.setProperty('--cl-layout-span',String(card.span));element.dataset.layoutSpan=String(card.span);element.dataset.layoutSize=card.size;element.dataset.layoutShape=card.shape;element.dataset.layoutIconSize=card.icon_size;element.dataset.layoutIconContainer=card.icon_container;
    element.classList.add('layoutCard');element.classList.toggle('layoutHiddenTitle',!card.show_title);element.classList.toggle('layoutHiddenState',!card.show_state);element.classList.toggle('layoutHiddenSecondary',!card.show_secondary);element.classList.toggle('layoutHiddenIcon',!card.show_icon);
    if(card.icon){const target=element.querySelector('.quickIcon,.lightIcon,.switchIcon,.statusIcon');if(target)target.innerHTML=card.icon.startsWith('mdi:')?`<ha-icon icon="${this._esc(card.icon)}"></ha-icon>`:icon(card.icon.slice(3));}
    if(this._layoutEditor.active&&!this._layoutEditor.preview){element.insertAdjacentHTML('afterbegin',`<div class="layoutCardTools"><button class="layoutDragHandle" data-layout-drag="${this._esc(card.id)}" aria-label="Trascina ${this._esc(card.id)}">↕</button><button data-layout-up="${this._esc(card.id)}" aria-label="Sposta su">↑</button><button data-layout-down="${this._esc(card.id)}" aria-label="Sposta giù">↓</button><button data-layout-edit="${this._esc(card.id)}" aria-label="Personalizza">${icon('more')}</button></div>`);}
  }
  _applyLayoutToView(root,view){
    if(!root)return;if(this._layoutEditor.active&&this._layoutEditor.view===view)this._switchPage(view);const generated=this._layoutGenerated(root,view);if(!generated.length)return;
    let cards=this._layoutEditor.active&&this._layoutEditor.view===view?this._layoutDraft(root,view,generated):effectiveLayout(this._config?.layout,this._layoutContext(),view,generated);
    const byId=new Map(cards.map(card=>[card.id,card]));root.querySelectorAll('[data-layout-id]').forEach(element=>{const card=byId.get(element.dataset.layoutId);if(card)this._decorateLayoutCard(element,card);else element.hidden=true;});
    if(view==='home'){const first=root.querySelector('[data-layout-id]');if(first){const grid=document.createElement('div');grid.className='layoutGrid homeLayoutGrid';first.before(grid);root.querySelectorAll('[data-layout-id]').forEach(el=>grid.append(el));root.querySelector('.quickGrid')?.remove();}}
    else root.querySelectorAll('.grid').forEach(grid=>grid.classList.add('layoutGrid'));
    if(this._layoutEditor.active&&this._layoutEditor.view===view){root.insertAdjacentHTML('afterbegin',this._layoutMarkup());root.classList.add('layoutEditing');root.dataset.layoutPreview=this._layoutEditor.device;if(this._layoutEditor.preview)root.classList.add('layoutPreviewing');this._bindLayoutEditor(root,view,cards);}
  }
  _setLayoutDraft(view,cards){this._layoutEditor.drafts.set(this._layoutKey(view),cards);this._layoutEditor.dirty=true;view==='home'?this._renderHome():this._renderLights();}
  _moveLayoutCard(view,id,direction){const cards=[...(this._layoutEditor.drafts.get(this._layoutKey(view))||[])];const index=cards.findIndex(card=>card.id===id),target=index+direction;if(index<0||target<0||target>=cards.length)return;this._setLayoutDraft(view,reorderLayoutCards(cards,id,cards[target].id));}
  async _editLayoutCard(view,id){const cards=this._layoutEditor.drafts.get(this._layoutKey(view))||[],card=cards.find(item=>item.id===id);if(!card)return;const capability=layoutCardCapabilities(card.type),checks=[['show_icon','Icona'],['show_title','Titolo'],['show_state','Stato'],['show_secondary','Dettaglio'],['visible','Visibile']];const body=`<div class="editorGrid"><label>Dimensione<select name="size">${capability.sizes.map(v=>`<option value="${v}" ${card.size===v?'selected':''}>${v.toUpperCase()}</option>`).join('')}</select></label><label>Larghezza<select name="span">${[1,2,3,4].map(v=>`<option value="${v}" ${card.span===v?'selected':''}>${v} colonn${v===1?'a':'e'}</option>`).join('')}</select></label><label>Forma<select name="shape">${capability.shapes.map(v=>`<option value="${v}" ${card.shape===v?'selected':''}>${v}</option>`).join('')}</select></label><label>Icona<input name="icon" value="${this._esc(card.icon||'')}" placeholder="cl:lights oppure mdi:lightbulb" pattern="(?:cl|mdi):[a-z0-9-]+"></label><label>Dimensione icona<select name="icon_size">${['s','m','l'].map(v=>`<option value="${v}" ${card.icon_size===v?'selected':''}>${v.toUpperCase()}</option>`).join('')}</select></label><label>Contenitore icona<select name="icon_container">${['none','soft','solid'].map(v=>`<option value="${v}" ${card.icon_container===v?'selected':''}>${v}</option>`).join('')}</select></label></div><div class="editorChecks">${checks.map(([key,label])=>`<label><input type="checkbox" name="${key}" ${card[key]?'checked':''}>${label}</label>`).join('')}</div>`;const result=await this._openDialog({title:'Personalizza card',description:id,body,confirmLabel:'APPLICA ALLA BOZZA'});if(!result)return;const updated={...card,size:result.size,span:Number(result.span),shape:result.shape,icon:String(result.icon||''),icon_size:result.icon_size,icon_container:result.icon_container};for(const[key]of checks)updated[key]=result[key]==='on';if(updated.visible&&!updated.show_icon&&!updated.show_title)updated.show_title=true;this._setLayoutDraft(view,cards.map(item=>item.id===id?updated:item));}
  _bindLayoutEditor(root,view,cards){
    const block=event=>{if(event.target.closest('[data-layout-save],[data-layout-cancel],[data-layout-preview],[data-layout-view],[data-layout-device],[data-layout-experience],[data-layout-edit],[data-layout-up],[data-layout-down],[data-layout-drag]'))return;event.preventDefault();event.stopImmediatePropagation();};root.addEventListener('click',block,true);
    root.querySelectorAll('.layoutCardTools').forEach(tools=>tools.addEventListener('click',event=>event.stopPropagation()));
    root.querySelector('[data-layout-view]')?.addEventListener('change',event=>{this._layoutEditor.view=event.target.value;this._switchPage(event.target.value);event.target.value==='home'?this._renderHome():this._renderLights();});root.querySelector('[data-layout-context]')?.addEventListener('change',event=>{this._layoutEditor.context=event.target.value;view==='home'?this._renderHome():this._renderLights();});root.querySelector('[data-layout-device]')?.addEventListener('change',event=>{this._layoutEditor.device=event.target.value;view==='home'?this._renderHome():this._renderLights();});root.querySelector('[data-layout-experience]')?.addEventListener('change',event=>{this._previewExperience=event.target.value||null;this._renderData();});root.querySelector('[data-layout-preview]')?.addEventListener('click',()=>{this._layoutEditor.preview=!this._layoutEditor.preview;view==='home'?this._renderHome():this._renderLights();});root.querySelector('[data-layout-cancel]')?.addEventListener('click',()=>this._cancelLayoutEditor());root.querySelector('[data-layout-save]')?.addEventListener('click',()=>this._saveLayoutDraft());root.querySelectorAll('[data-layout-edit]').forEach(button=>button.addEventListener('click',()=>this._editLayoutCard(view,button.dataset.layoutEdit)));root.querySelectorAll('[data-layout-up]').forEach(button=>button.addEventListener('click',()=>this._moveLayoutCard(view,button.dataset.layoutUp,-1)));root.querySelectorAll('[data-layout-down]').forEach(button=>button.addEventListener('click',()=>this._moveLayoutCard(view,button.dataset.layoutDown,1)));
    root.querySelectorAll('[data-layout-drag]').forEach(handle=>{handle.addEventListener('pointerdown',event=>{event.preventDefault();this._layoutEditor.drag={id:handle.dataset.layoutDrag,pointerId:event.pointerId};handle.setPointerCapture?.(event.pointerId);handle.closest('[data-layout-id]')?.classList.add('dragging');});handle.addEventListener('pointermove',event=>{const drag=this._layoutEditor.drag;if(!drag||drag.pointerId!==event.pointerId)return;event.preventDefault();root.querySelectorAll('.layoutDropTarget').forEach(x=>x.classList.remove('layoutDropTarget'));const target=(this.shadowRoot.elementFromPoint?.(event.clientX,event.clientY)||document.elementFromPoint?.(event.clientX,event.clientY))?.closest?.('[data-layout-id]');if(target&&target.dataset.layoutId!==drag.id)target.classList.add('layoutDropTarget');});handle.addEventListener('pointerup',event=>{const drag=this._layoutEditor.drag;if(!drag||drag.pointerId!==event.pointerId)return;const target=root.querySelector('.layoutDropTarget')?.dataset.layoutId;this._layoutEditor.drag=null;if(target)this._setLayoutDraft(view,reorderLayoutCards(cards,drag.id,target));else view==='home'?this._renderHome():this._renderLights();});handle.addEventListener('pointercancel',()=>{this._layoutEditor.drag=null;view==='home'?this._renderHome():this._renderLights();});});
  }
  _startLayoutEditor(preview=false){if(!this._installerOn())return;this._layoutEditor={active:true,preview,context:'base',view:'home',device:'auto',drafts:new Map(),dirty:false,drag:null};this._switchPage('home');this._renderHome();}
  _cancelLayoutEditor(){this._layoutEditor={active:false,preview:false,context:'base',view:'home',device:'auto',drafts:new Map(),dirty:false,drag:null};this._previewExperience=null;this._renderData();}
  async _saveLayoutDraft(){const e=this._layoutEditor;if(!e.drafts.size)return;try{let layout=this._config.layout;for(const[key,cards]of e.drafts){const separator=key.indexOf(':'),context=key.slice(0,separator),view=key.slice(separator+1),payload=Object.fromEntries(cards.map(({id,...card})=>[id,card]));layout=await this._hass.callWS({type:'cl_control/layout/set',context,view,cards:payload});}this._config.layout=layout;e.dirty=false;e.drafts.clear();this._toast('Layout salvato.','success');e.view==='home'?this._renderHome():this._renderLights();}catch(err){console.error('[cl_control] layout save failed',err);this._toast('Salvataggio layout non riuscito.','error');}}
  async _resetLayout(){const result=await this._openDialog({title:'Ripristina layout automatico',description:'Rimuove gli override della vista e del contesto selezionati.',confirmLabel:'RIPRISTINA'});if(!result)return;try{const layout=await this._hass.callWS({type:'cl_control/layout/reset',context:this._layoutEditor.context||'base',view:this._layoutEditor.view||'home'});this._config.layout=layout;this._layoutEditor.drafts.clear();this._toast('Layout automatico ripristinato.','success');this._renderData();}catch(err){this._toast('Ripristino non riuscito.','error');}}

  _bindStatic(){this.shadowRoot.getElementById('refresh').addEventListener('click',()=>{this._registriesLoaded=false;this._loadRegistries();this._renderData();});}
  _switchPage(page){this._page=page;this.shadowRoot.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.id===`page-${page}`));this.shadowRoot.querySelectorAll('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===page));}

  _renderData(){if(!this._hass)return;this._securityProvider=this._discoverSecurity();if(this._securityProvider==='inim')this._ensurePartitionSelection();this._renderNav();this._renderHome();if(!this._lightUiLocked)this._renderLights();else this._lightRenderPending=true;this._renderCovers();this._renderClimate();this._renderEnergy();this._renderSecurity();this._renderCameras();this._renderFavorites();this._renderSupport();this._renderOverflow();if(!this._installerUiLocked)this._renderInstaller();else this._installerRenderPending=true;}
  _renderNav(){const root=this.shadowRoot.getElementById('nav'),items=this._navItems(),model=buildResponsiveNavigation(items,{maxItems:5}),overflowLabel='Altro',all=model.overflow.length?[...items,['overflow','more',overflowLabel]]:items;root.innerHTML=all.map(([p,i,l])=>`<button data-page="${p}" class="${p===this._page?'active ':''}${model.primary.includes(p)?'mobilePrimary ':''}${p==='overflow'?'mobileOnly':''}" aria-label="${this._esc(l)}"><i>${icon(i)}</i><span>${this._esc(l)}</span></button>`).join('');root.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>this._switchPage(b.dataset.page)));}
  _renderOverflow(){const root=this.shadowRoot.getElementById('page-overflow');if(!root)return;const items=this._navItems(),model=buildResponsiveNavigation(items,{maxItems:5}),map=new Map(items.map(item=>[item[0],item]));root.innerHTML=`<div class="homeHeader"><div><h1 class="pageTitle">Altro</h1><p class="pageLead">Tutte le funzioni disponibili.</p></div></div><div class="moduleMenu">${model.overflow.map(id=>{const item=map.get(id);if(!item)return'';return`<button class="moduleMenuItem" data-overflow-open="${id}"><span class="quickIcon">${icon(item[1])}</span><span><b>${this._esc(item[2])}</b><small>${id==='more'?'Strumenti riservati':'Apri modulo'}</small></span>${icon('chevron')}</button>`}).join('')}</div>`;root.querySelectorAll('[data-overflow-open]').forEach(button=>button.addEventListener('click',()=>this._switchPage(button.dataset.overflowOpen)));}

  _renderHome(){
    const lights=this._entities('light'),covers=this._entities('cover'),climate=this._entities('climate'),cams=this._entities('camera'),energy=this._energySensors();
    const on=lights.filter(x=>x.state==='on').length,open=covers.filter(x=>!['closed','unavailable'].includes(x.state)).length,activeClimate=climate.filter(x=>x.state!=='off').length;
    const site=this._config?.support?.site_name||'Casa';const root=this.shadowRoot.getElementById('page-home');
    const unavailable=Object.values(this._hass?.states||{}).filter(state=>state.state==='unavailable'&&!this._hidden.has(state.entity_id)).length;
    const attention=unavailable>0;const level=this._activeExperience('home');
    const modules=this._navItems().filter(item=>!['home','more','favorites'].includes(item[0]));const order=this._config?.home_order||[];modules.sort((a,b)=>{const ai=order.indexOf(a[0]),bi=order.indexOf(b[0]);return(ai<0?999:ai)-(bi<0?999:bi)});
    const mainPower=this._bestEnergy('home','power'),alarm=this._entities('alarm_control_panel')[0];const values={lights:[`${on} accese`,`${lights.length} totali`],covers:[`${open} aperte`,`${covers.length} totali`],climate:[`${activeClimate} attivi`,`${climate.length} zone`],energy:[mainPower?this._fmtEnergy(mainPower):'Disponibile',energy.length>1?`${energy.length} misure`:''],security:[alarm?this._alarmState(alarm.state):(this._securityProvider==='none'?'Non configurata':'Connessa'),'Stato impianto'],cameras:[`${cams.filter(camera=>!['unknown','unavailable'].includes(camera.state)).length} online`,cams.length>1?`${cams.length} telecamere`:''],support:['Serve aiuto?','Contatta assistenza']};
    const visibleModules=modules.slice(0,level==='essential'?4:level==='standard'?6:8);
    root.innerHTML=`<div class="homeHeader"><div><h1 class="pageTitle">${this._esc(site)}</h1><p class="pageLead">Il tuo impianto, a colpo d'occhio.</p></div><span class="pill">${this._esc(level.toUpperCase())}</span></div><button class="card statusCard ${attention?'attention':''}" data-home-attention="${attention?'more':''}"><span class="statusIcon">${icon(attention?'warning':'check')}</span><span class="statusCopy"><span class="statusTitle">${attention?`${unavailable} ${unavailable===1?'dispositivo richiede':'dispositivi richiedono'} attenzione`:'Tutto sotto controllo'}</span><span class="statusMeta">${attention?'Apri Installatore per i dettagli':'Nessuna anomalia rilevata'}</span></span>${attention?icon('chevron'):''}</button>${(this._config?.favorites||[]).length?`<div class="sectionHead"><h2>Preferiti</h2><button class="btn" data-open="favorites">Vedi tutti</button></div>`:''}<div class="sectionHead"><h2>La tua casa</h2></div><div class="quickGrid" data-count="${visibleModules.length}">${visibleModules.map(([id,ico,label])=>{const value=values[id]||['Apri',''];return`<button class="quickTile ${id==='lights'&&on?'attention':''}" data-open="${id}"><span class="quickIcon">${icon(ico)}</span><span class="quickCopy"><span class="quickModule">${this._esc(label)}</span><span class="quickValue">${this._esc(value[0])}</span>${value[1]?`<span class="quickLabel">${this._esc(value[1])}</span>`:''}</span>${icon('chevron')}</button>`}).join('')}</div>`;
    this._applyLayoutToView(root,'home');
    root.querySelectorAll('[data-open]').forEach(b=>b.addEventListener('click',()=>this._switchPage(b.dataset.open)));
    root.querySelector('[data-home-attention="more"]')?.addEventListener('click',()=>this._switchPage('more'));
    root.querySelectorAll('[data-home-target]').forEach(b=>b.addEventListener('click',()=>{const t=b.dataset.homeTarget;if(t==='lights')this._lightFilter=b.dataset.filter||'all';if(t==='covers')this._coverFilter=b.dataset.filter||'all';if(t==='climate')this._climateFilter=b.dataset.filter||'all';this._switchPage(t);if(t==='lights')this._renderLights();if(t==='covers')this._renderCovers();if(t==='climate')this._renderClimate();}));
  }

  _renderLights(){
    const root=this.shadowRoot.getElementById('page-lights');
    let lights=this._entities('light');
    if(this._lightFilter==='on')lights=lights.filter(e=>e.state==='on');
    if(this._lightFilter==='favorites')lights=lights.filter(e=>this._isFavorite(e.entity_id));
    let switches=this._switchLike();
    if(this._lightFilter==='on')switches=switches.filter(e=>e.state==='on'||e.state==='open');
    if(this._lightFilter==='favorites')switches=switches.filter(e=>this._isFavorite(e.entity_id));
    const lightGroups=new Map(this._groupByArea(lights));
    const switchGroups=new Map(this._groupByArea(switches));
    const allAreas=new Set([...lightGroups.keys(),...switchGroups.keys()]);
    const orderedAreas=this._sortAreaEntries([...allAreas].map(a=>[a,null])).map(x=>x[0]);

    const areaHtml=orderedAreas.map(area=>{
      const items=lightGroups.get(area)||[];
      const sw=switchGroups.get(area)||[];
      const onCount=items.filter(x=>x.state==='on').length;
      const anyOn=onCount>0;
      const allOn=items.length>0&&onCount===items.length;
      const areaSwitchOn=Boolean(this._config?.area_switches?.[area]);const feedback=!items.length?'Nessuna luce':allOn?`${onCount}/${items.length} accese · TUTTE ACCESE`:anyOn?`${onCount}/${items.length} accese · PARZIALE`:`0/${items.length} accese · TUTTE SPENTE`;
      const lightCards=items.map(e=>{const on=e.state==='on',unavailable=['unknown','unavailable'].includes(e.state),pending=this._pendingState(e.entity_id),a=e.attributes||{},bri=a.brightness;const modes=a.supported_color_modes||[];const rgbCapable=modes.some(m=>['rgb','rgbw','rgbww','hs','xy'].includes(String(m).toLowerCase()));const rgb=Array.isArray(a.rgb_color)&&a.rgb_color.length>=3?a.rgb_color:this._defaultLightRgb();const rgbCss=rgb.slice(0,3).map(v=>Math.max(0,Math.min(255,Number(v)||0))).join(',');const color=this._rgbHex(rgb),name=this._displayName(e.entity_id),stateLabel=unavailable?'Non disponibile':pending?'Aggiornamento…':on?'Accesa':'Spenta';return`<div class="entity lightEntity ${on?'on':''} ${pending?'loading':''} ${unavailable?'unavailable':''} ${this._installerOn()?'dragReady':''}" data-order-entity="${e.entity_id}" data-order-area="${this._esc(area)}" data-order-kind="light" style="--light-rgb:${rgbCss}"><div class="row">${this._installerOn()?'<div class="dragHandle" title="Tieni premuto e trascina">↕</div>':''}<div class="lightMain"><div class="lightIcon">${icon('lights')}</div><div><div class="name">${this._esc(name)}</div><div class="meta">${stateLabel}${!unavailable&&!pending&&on&&bri!=null?` · ${Math.round((bri/255)*100)}%`:''}${!unavailable&&!pending&&rgbCapable?' · Colore':''}</div></div></div><div class="entityActions"><button class="starBtn ${this._isFavorite(e.entity_id)?'active':''}" data-favorite="${e.entity_id}" aria-label="Preferito">${icon('star')}</button>${this._installerOn()?`<button class="editBtn" data-edit-entity="${e.entity_id}" aria-label="Configura">${icon('more')}</button>`:''}<button class="iconBtn" data-light-more="${e.entity_id}" aria-label="Dettagli">${icon('chevron')}</button><button class="clToggle ${on?'on':''} ${pending?'loading':''}" data-toggle-light="${e.entity_id}" role="switch" aria-checked="${on}" aria-busy="${Boolean(pending)}" aria-label="${on?'Spegni':'Accendi'} ${this._esc(name)}" ${unavailable||pending?'disabled':''}><span class="toggleTrack"><span class="toggleThumb"></span></span><span class="srOnly">${stateLabel}</span></button></div></div></div>`}).join('');
      const switchCards=sw.map(e=>{const on=e.state==='on'||e.state==='open',unavailable=['unknown','unavailable'].includes(e.state),pending=this._pendingState(e.entity_id),type=this._switchType(e),isValve=e.entity_id.startsWith('valve.'),name=this._displayName(e.entity_id),stateLabel=unavailable?'Non disponibile':pending?'Aggiornamento…':on?'Attivo':'Spento';return`<div class="entity switchEntity ${on?'on':''} ${pending?'loading':''} ${unavailable?'unavailable':''} ${this._installerOn()?'dragReady':''}" data-order-entity="${e.entity_id}" data-order-area="${this._esc(area)}" data-order-kind="switch"><div class="row">${this._installerOn()?'<div class="dragHandle" title="Tieni premuto e trascina">↕</div>':''}<div class="lightMain"><div class="switchIcon">${this._switchIcon(type)}</div><div><div class="name">${this._esc(name)}</div><div class="meta">${stateLabel} · ${this._pretty(type)}</div></div></div><div class="entityActions"><button class="starBtn ${this._isFavorite(e.entity_id)?'active':''}" data-favorite="${e.entity_id}" aria-label="Preferito">${icon('star')}</button>${this._installerOn()?`<button class="editBtn" data-edit-entity="${e.entity_id}" aria-label="Configura">${icon('more')}</button>`:''}<button class="clToggle ${on?'on':''} ${pending?'loading':''}" data-toggle-switch="${e.entity_id}" data-domain="${isValve?'valve':'switch'}" role="switch" aria-checked="${on}" aria-busy="${Boolean(pending)}" aria-label="${on?'Spegni':'Accendi'} ${this._esc(name)}" ${unavailable||pending?'disabled':''}><span class="toggleTrack"><span class="toggleThumb"></span></span><span class="srOnly">${stateLabel}</span></button></div></div></div>`}).join('');
      return`<section class="areaBlock ${anyOn?'active':''}" data-light-area="${this._esc(area)}"><div class="areaHeader"><div class="areaHeaderLeft"><div class="areaTitle">${this._esc(area)}</div><div class="areaFeedback">${this._esc(feedback)}${sw.length?` · ${sw.length} comandi`:''}</div></div>${items.length?`<button class="btn areaToggle ${anyOn?'warn':'primary'}" data-area-light-toggle="${this._esc(area)}">${anyOn?'Spegni area':'Accendi area'}${areaSwitchOn?' + comandi':''}</button>`:''}</div>${items.length?`<div class="grid">${lightCards}</div>`:''}${sw.length?`<div class="switchSection"><div class="switchTitle">COMANDI</div><div class="grid">${switchCards}</div></div>`:''}</section>`;
    }).join('');

    root.innerHTML=`<div class="homeHeader"><div><h1 class="pageTitle">Luci</h1><p class="pageLead">${lights.filter(x=>x.state==='on').length} accese</p></div></div><div class="filterBar"><button class="btn ${this._lightFilter==='all'?'active':''}" data-light-filter="all">Tutte</button><button class="btn ${this._lightFilter==='on'?'active':''}" data-light-filter="on">Accese</button><button class="btn ${this._lightFilter==='favorites'?'active':''}" data-light-filter="favorites">Preferite</button></div><div class="${this._installerOn()?'installer-active':''}">${this._installerOn()?'<div class="installerDragHint">Modalità installatore: tieni premuto e trascina per riordinare nello stesso gruppo.</div>':''}${areaHtml||'<div class="card empty">Nessuna luce o comando trovato.</div>'}</div>`;

    root.querySelectorAll('[data-order-kind="light"]').forEach(card=>{const id=card.dataset.orderEntity,entity=this._state(id),modes=entity?.attributes?.supported_color_modes||[],advanced=entity?.attributes?.brightness!=null||modes.some(mode=>['rgb','rgbw','rgbww','hs','xy','color_temp','white'].includes(String(mode)));if(advanced)card.insertAdjacentHTML('beforeend',`<button class="btn lightDetailAction" data-light-controls="${this._esc(id)}">Regola luce</button>`);});
    const banner=root.querySelector('.installerDragHint'),installerWrap=root.querySelector('.installer-active');if(this._installerOn()){root.querySelector('.filterBar')?.insertAdjacentHTML('beforeend',`<button class="btn ${this._reorderMode?'on':''}" data-reorder-mode>${this._reorderMode?'Termina riordino':'Riordina'}</button>`);if(!this._reorderMode){banner?.remove();installerWrap?.classList.remove('installer-active');}}

    root.querySelectorAll('[data-toggle-light]').forEach(button=>button.addEventListener('click',()=>this._toggleEntity(button.dataset.toggleLight,'light')));
    root.querySelectorAll('[data-toggle-switch]').forEach(button=>button.addEventListener('click',()=>this._toggleEntity(button.dataset.toggleSwitch,button.dataset.domain||'switch')));
    root.querySelectorAll('[data-favorite]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();this._toggleFavorite(b.dataset.favorite);}));
    root.querySelectorAll('[data-edit-entity]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();this._editEntity(b.dataset.editEntity);}));
    root.querySelectorAll('[data-light-filter]').forEach(b=>b.addEventListener('click',()=>{this._lightFilter=b.dataset.lightFilter;this._renderLights();}));
    root.querySelectorAll('[data-light-controls]').forEach(button=>button.addEventListener('click',()=>this._openLightControls(button.dataset.lightControls)));
    root.querySelector('[data-reorder-mode]')?.addEventListener('click',()=>{this._reorderMode=!this._reorderMode;this._renderLights();});
    root.querySelectorAll('[data-area-light-toggle]').forEach(b=>b.addEventListener('click',async()=>{const area=b.dataset.areaLightToggle;const list=lightGroups.get(area)||[];const ids=list.map(x=>x.entity_id);if(!ids.length)return;const anyOn=list.some(x=>x.state==='on');await this._hass.callService('light',anyOn?'turn_off':'turn_on',{entity_id:ids});if(this._config?.area_switches?.[area]){for(const e of (switchGroups.get(area)||[])){if(e.entity_id.startsWith('valve.'))await this._hass.callService('valve',anyOn?'close_valve':'open_valve',{entity_id:e.entity_id});else await this._hass.callService('switch',anyOn?'turn_off':'turn_on',{entity_id:e.entity_id});}}}));
    root.querySelectorAll('[data-brightness]').forEach(sl=>sl.addEventListener('change',()=>this._hass.callService('light','turn_on',{entity_id:sl.dataset.brightness,brightness:Number(sl.value)})));
    root.querySelectorAll('[data-light-more]').forEach(b=>b.addEventListener('click',()=>this.dispatchEvent(new CustomEvent('hass-more-info',{bubbles:true,composed:true,detail:{entityId:b.dataset.lightMore}}))));
    if(this._installerOn()&&this._reorderMode&&!this._layoutEditor.active){
      const cards=[...root.querySelectorAll('[data-order-entity]')];
      const clearTargets=()=>cards.forEach(c=>c.classList.remove('dragTarget'));
      const cancelDrag=()=>{clearTimeout(this._dragTimer);this._dragTimer=null;if(this._entityDrag?.card)this._entityDrag.card.classList.remove('dragging');clearTargets();this._entityDrag=null;};
      cards.forEach(card=>{
        card.addEventListener('pointerdown',ev=>{
          if(ev.target.closest('button,input,label,.slider'))return;
          clearTimeout(this._dragTimer);
          const startX=ev.clientX,startY=ev.clientY,pointerId=ev.pointerId;
          this._dragTimer=setTimeout(()=>{
            this._entityDrag={card,id:card.dataset.orderEntity,area:card.dataset.orderArea,kind:card.dataset.orderKind,pointerId,startX,startY};
            card.classList.add('dragging');
            try{card.setPointerCapture(pointerId)}catch(e){}
            if(navigator.vibrate)navigator.vibrate(30);
          },480);
        });
        card.addEventListener('pointermove',ev=>{
          if(!this._entityDrag||this._entityDrag.pointerId!==ev.pointerId)return;
          ev.preventDefault();clearTargets();
          const el=this.shadowRoot.elementFromPoint?.(ev.clientX,ev.clientY) || document.elementFromPoint(ev.clientX,ev.clientY);
          const target=el?.closest?.('[data-order-entity]');
          if(target && target!==this._entityDrag.card && target.dataset.orderArea===this._entityDrag.area && target.dataset.orderKind===this._entityDrag.kind)target.classList.add('dragTarget');
        });
        card.addEventListener('pointerup',async ev=>{
          clearTimeout(this._dragTimer);this._dragTimer=null;
          if(!this._entityDrag||this._entityDrag.pointerId!==ev.pointerId)return;
          const target=cards.find(c=>c.classList.contains('dragTarget'));
          const dragId=this._entityDrag.id;
          cancelDrag();
          if(target){await this._moveEntityRelative(dragId,target.dataset.orderEntity);this._renderLights();}
        });
        card.addEventListener('pointercancel',cancelDrag);
      });
    }
    this._applyLayoutToView(root,'lights');
    if(this._layoutEditor.active&&this._layoutEditor.view==='lights')root.querySelectorAll('[data-toggle-light],[data-toggle-switch],[data-area-light-toggle],[data-brightness],[data-light-controls],[data-light-more],[data-favorite],[data-edit-entity]').forEach(control=>{control.disabled=true;control.setAttribute('aria-disabled','true');});

  }

  _renderCovers(){
    const root=this.shadowRoot.getElementById('page-covers');let items=this._entities('cover');if(this._coverFilter==='open')items=items.filter(entity=>!['closed','unavailable'].includes(entity.state));const groups=this._groupByArea(items),title=this._coversTitle();
    const stateLabel=entity=>['unknown','unavailable'].includes(entity.state)?'Non disponibile':entity.state==='closed'?'Chiusa':entity.state==='open'?'Aperta':entity.state==='opening'?'In apertura':entity.state==='closing'?'In chiusura':this._pretty(entity.state);
    root.innerHTML=`<div class="homeHeader"><div><h1 class="pageTitle">${this._esc(title)}</h1><p class="pageLead">Controllo aperture e posizione.</p></div><span class="pill">${items.length}</span></div><div class="filterBar"><button class="btn ${this._coverFilter==='all'?'active':''}" data-cover-filter="all">Tutte</button><button class="btn ${this._coverFilter==='open'?'active':''}" data-cover-filter="open">Aperte</button></div>${groups.length?groups.map(([area,areaItems])=>`<section class="areaBlock"><div class="areaTitle">${this._esc(area)}</div><div class="coverGrid">${areaItems.map(entity=>{const info=this._coverInfo(entity),a=entity.attributes||{},features=Number(a.supported_features)||0,inverted=Boolean(a.position_inverted),raw=Number(a.current_position),position=Number.isFinite(raw)?(inverted?100-raw:raw):null,disabled=['unknown','unavailable'].includes(entity.state);return`<div class="entity coverEntity ${disabled?'unavailable':''}"><div class="row"><div><div class="name">${this._esc(this._displayName(entity.entity_id))}</div><div class="meta">${this._esc(info.label)} · ${stateLabel(entity)}</div></div>${position!=null?`<strong class="coverPosition">${Math.round(position)}%</strong>`:''}</div>${position!=null&&(features&4)?`<input class="coverSlider" type="range" min="0" max="100" value="${Math.round(position)}" data-cover-position="${entity.entity_id}" data-inverted="${inverted}" aria-label="Posizione ${this._esc(this._displayName(entity.entity_id))}" ${disabled?'disabled':''}>`:''}<div class="coverBtns">${features&1?`<button class="btn" data-cover-open="${entity.entity_id}" ${disabled?'disabled':''}>Apri</button>`:''}${features&8?`<button class="btn" data-cover-stop="${entity.entity_id}" ${disabled?'disabled':''}>Stop</button>`:''}${features&2?`<button class="btn" data-cover-close="${entity.entity_id}" ${disabled?'disabled':''}>Chiudi</button>`:''}</div></div>`}).join('')}</div></section>`).join(''):'<div class="card empty">Nessuna apertura configurata.</div>'}`;
    root.querySelectorAll('[data-cover-open]').forEach(button=>button.addEventListener('click',()=>this._hass.callService('cover','open_cover',{entity_id:button.dataset.coverOpen})));root.querySelectorAll('[data-cover-close]').forEach(button=>button.addEventListener('click',()=>this._hass.callService('cover','close_cover',{entity_id:button.dataset.coverClose})));root.querySelectorAll('[data-cover-stop]').forEach(button=>button.addEventListener('click',()=>this._hass.callService('cover','stop_cover',{entity_id:button.dataset.coverStop})));root.querySelectorAll('[data-cover-position]').forEach(slider=>slider.addEventListener('change',()=>{const value=Number(slider.value),position=slider.dataset.inverted==='true'?100-value:value;this._hass.callService('cover','set_cover_position',{entity_id:slider.dataset.coverPosition,position});}));root.querySelectorAll('[data-cover-filter]').forEach(button=>button.addEventListener('click',()=>{this._coverFilter=button.dataset.coverFilter;this._renderCovers();}));
  }

  _openMoreInfo(entityId){if(!entityId||!this._state(entityId))return;this.dispatchEvent(new CustomEvent('hass-more-info',{bubbles:true,composed:true,detail:{entityId}}));}

  async _openClimateControls(id){const entity=this._state(id);if(!entity)return;const a=entity.attributes||{},modes=a.hvac_modes||[],fans=a.fan_modes||[],presets=a.preset_modes||[],swings=a.swing_modes||[],min=Number(a.min_temp)||7,max=Number(a.max_temp)||35,step=Number(a.target_temp_step)||0.5;const body=`<div class="climateSheet"><div class="thermostatReading"><span>Temperatura ambiente</span><strong>${a.current_temperature??'--'}°</strong></div>${a.temperature!=null?`<label>Setpoint<input type="range" name="temperature" min="${min}" max="${max}" step="${step}" value="${a.temperature}"><span class="rangeLegend"><small>${min}°</small><b>${a.temperature}°C</b><small>${max}°</small></span></label>`:''}${modes.length?`<label>Modalità<select name="hvac_mode">${modes.map(mode=>`<option value="${mode}" ${mode===entity.state?'selected':''}>${this._climateState(mode)}</option>`).join('')}</select></label>`:''}${fans.length?`<label>Ventilazione<select name="fan_mode">${fans.map(mode=>`<option value="${this._esc(mode)}" ${mode===a.fan_mode?'selected':''}>${this._pretty(mode)}</option>`).join('')}</select></label>`:''}${presets.length?`<label>Preset<select name="preset_mode">${presets.map(mode=>`<option value="${this._esc(mode)}" ${mode===a.preset_mode?'selected':''}>${this._pretty(mode)}</option>`).join('')}</select></label>`:''}${swings.length?`<label>Oscillazione<select name="swing_mode">${swings.map(mode=>`<option value="${this._esc(mode)}" ${mode===a.swing_mode?'selected':''}>${this._pretty(mode)}</option>`).join('')}</select></label>`:''}${a.current_humidity!=null?`<div class="infoRow"><span>Umidità attuale</span><b>${a.current_humidity}%</b></div>`:''}${a.humidity!=null?`<label>Umidità obiettivo<input type="range" name="humidity" min="30" max="80" value="${a.humidity}"></label>`:''}</div>`;const result=await this._openDialog({title:this._displayName(id),description:this._climateState(entity.state),body,confirmLabel:'APPLICA'});if(!result)return;if(result.temperature)await this._hass.callService('climate','set_temperature',{entity_id:id,temperature:Number(result.temperature)});if(result.hvac_mode&&result.hvac_mode!==entity.state)await this._hass.callService('climate','set_hvac_mode',{entity_id:id,hvac_mode:result.hvac_mode});if(result.fan_mode)await this._hass.callService('climate','set_fan_mode',{entity_id:id,fan_mode:result.fan_mode});if(result.preset_mode)await this._hass.callService('climate','set_preset_mode',{entity_id:id,preset_mode:result.preset_mode});if(result.swing_mode)await this._hass.callService('climate','set_swing_mode',{entity_id:id,swing_mode:result.swing_mode});if(result.humidity)await this._hass.callService('climate','set_humidity',{entity_id:id,humidity:Number(result.humidity)});}

  _renderClimate(){
    const root=this.shadowRoot.getElementById('page-climate');let items=this._entities('climate');if(this._climateFilter==='active')items=items.filter(entity=>entity.state!=='off');const groups=this._groupByArea(items);
    root.innerHTML=`<div class="homeHeader"><div><h1 class="pageTitle">Clima</h1><p class="pageLead">Comfort ambiente.</p></div><span class="pill">${items.length}</span></div><div class="filterBar"><button class="btn ${this._climateFilter==='all'?'active':''}" data-climate-filter="all">Tutti</button><button class="btn ${this._climateFilter==='active'?'active':''}" data-climate-filter="active">Attivi</button></div>${groups.length?groups.map(([area,areaItems])=>`<section class="areaBlock"><div class="areaTitle">${this._esc(area)}</div><div class="thermostatGrid">${areaItems.map(entity=>{const a=entity.attributes||{},target=Number(a.temperature),current=a.current_temperature??'--';return`<article class="entity thermostatCard" data-climate-detail="${entity.entity_id}" tabindex="0" role="button" aria-label="Apri controlli ${this._esc(this._displayName(entity.entity_id))}"><div class="thermostatTop"><div><div class="name">${this._esc(this._displayName(entity.entity_id))}</div><div class="meta">${this._climateState(entity.state)}</div></div><span class="climateMode">${this._climateState(entity.state)}</span></div><div class="thermostatBody"><div><span class="meta">Ambiente</span><strong class="currentTemp">${current}°</strong></div><div class="setpoint"><span class="meta">Setpoint</span><strong>${Number.isFinite(target)?target.toFixed(1):'--'}°</strong></div></div><div class="thermostatActions"><button class="tempButton" data-temp-down="${entity.entity_id}" aria-label="Riduci temperatura">−</button><button class="tempButton" data-temp-up="${entity.entity_id}" aria-label="Aumenta temperatura">+</button><button class="btn" data-climate-open="${entity.entity_id}">Dettagli</button></div></article>`}).join('')}</div></section>`).join(''):'<div class="card empty">Nessuna zona clima configurata.</div>'}`;
    const change=(button,delta)=>{const entity=this._state(button.dataset[delta>0?'tempUp':'tempDown']),target=Number(entity?.attributes?.temperature);if(Number.isFinite(target))this._hass.callService('climate','set_temperature',{entity_id:entity.entity_id,temperature:target+delta});};root.querySelectorAll('[data-temp-up]').forEach(button=>button.addEventListener('click',event=>{event.stopPropagation();change(button,0.5);}));root.querySelectorAll('[data-temp-down]').forEach(button=>button.addEventListener('click',event=>{event.stopPropagation();change(button,-0.5);}));root.querySelectorAll('[data-climate-open]').forEach(button=>button.addEventListener('click',event=>{event.stopPropagation();this._openClimateControls(button.dataset.climateOpen);}));root.querySelectorAll('[data-climate-detail]').forEach(card=>{card.addEventListener('click',()=>this._openClimateControls(card.dataset.climateDetail));card.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();this._openClimateControls(card.dataset.climateDetail);}})});root.querySelectorAll('[data-climate-filter]').forEach(button=>button.addEventListener('click',()=>{this._climateFilter=button.dataset.climateFilter;this._renderClimate();}));
  }

  _renderEnergy(){
    const root=this.shadowRoot.getElementById('page-energy'),sensors=this._energySensors();
    const solar=this._bestEnergy('solar','power'),home=this._bestEnergy('home','power'),grid=this._bestEnergy('grid','power'),imported=this._bestEnergy('import','power'),exported=this._bestEnergy('export','power');
    const battery=this._bestEnergy('battery','battery')||this._bestEnergy('battery','power');
    const batteryPower=this._bestEnergy('battery_power','power')||this._energySensors().filter(s=>this._energyRole(s)==='battery'&&['w','kw'].includes(String(s.attributes?.unit_of_measurement||'').toLowerCase()))[0]||null;
    const solarW=Math.abs(this._powerW(solar)),importW=Math.abs(this._powerW(imported||grid)),exportW=Math.abs(this._powerW(exported)),batteryW=this._powerW(batteryPower);
    const groups=new Map();for(const x of sensors){const role=this._energyRole(x);if(!groups.has(role))groups.set(role,[]);groups.get(role).push(x);}const labels={solar:'Fotovoltaico',home:'Consumo casa',grid:'Rete',import:'Prelievo rete',export:'Immissione rete',battery:'Batteria',other:'Altri dati'};
    const exporting=exportW>importW&&exportW>5;
    const gridValue=exported&&exportW>0?this._fmtEnergyAbs(exported):(imported?this._fmtEnergyAbs(imported):this._fmtEnergy(grid));
    root.innerHTML=`<div class="card hero"><div class="sectionHead"><h2>Flusso energia</h2><span class="pill">${this._installerOn()?'MAPPATURA INSTALLATORE':'LIVE'}</span></div><div class="pvDiagram"><div class="pvNode solar"><div class="pvIcon">☀️</div><b>${this._fmtEnergy(solar)}</b><small>Produzione fotovoltaica</small></div><div class="pvLink vertical solarLink ${solarW>5?'active':''}"><span class="arrow">↓</span><i class="particle"></i></div><div class="pvNode battery"><div class="pvIcon">🔋</div><b>${this._fmtEnergy(battery)}</b><small>${batteryPower?`Potenza ${this._fmtEnergyAbs(batteryPower)}`:'Batteria'}</small></div><div class="pvLink horizontal batteryLink ${Math.abs(batteryW)>5?'active':''} ${batteryW<0?'reverse':''}"><span class="arrow">${batteryW<0?'←':'→'}</span><i class="particle"></i></div><div class="pvNode home"><div class="pvIcon">🏠</div><b>${this._fmtEnergy(home)}</b><small>Consumo casa</small></div><div class="pvLink horizontal gridLink ${(importW>5||exportW>5)?'active':''} ${exporting?'':'reverse'}"><span class="arrow">${exporting?'→':'←'}</span><i class="particle"></i></div><div class="pvNode grid"><div class="pvIcon">⚡</div><b>${gridValue}</b><small>${exporting?'Immissione in rete':'Prelievo dalla rete'}</small></div></div><div class="pvLegend"><span><i></i>punto luminoso = flusso attivo</span><span>Casa al centro del sistema</span></div></div><div class="card"><div class="sectionHead"><h2>Dettaglio energia</h2><span class="pill">${sensors.length}</span></div>${sensors.length?[...groups.entries()].map(([role,items])=>`<div class="areaTitle">${labels[role]||this._pretty(role)}</div><div class="grid">${items.map(x=>`<div class="entity"><div class="name">${this._esc(this._displayName(x.entity_id))}</div><div class="temp">${this._esc(this._fmtEnergy(x))}</div></div>`).join('')}</div>`).join(''):'<div class="empty">Nessun sensore energia riconosciuto.</div>'}</div>`;
  }

  async _sendInimMode(mode){const targets=this._inimPartitions().filter(p=>this._selectedPartitions.has(p.id));if(!targets.length){this._toast('Seleziona almeno una partizione.','warning');return;}const pin=await this._requestPin('Codice di sicurezza','Conferma il comando sulle partizioni selezionate.');if(pin===null)return;try{await this._hass.callWS({type:'cl_control/security/partition_command',pin,mode,entity_ids:targets.map(p=>p.modeId)});}catch(e){this._toast('Comando sicurezza non disponibile.','error');}}

  _renderSecurity(){
    const root=this.shadowRoot.getElementById('page-security');
    if(this._securityProvider==='inim'){
      const parts=this._inimPartitions(),zones=this._inimZones();
      const zoneProblems=zones.filter(z=>z.memory||z.excluded||z.state==='on'||z.unavailable).length;
      root.innerHTML=`<div class="card"><div class="sectionHead"><h2>Sicurezza · INIM</h2><span class="pill">AUTO</span></div><div class="modes"><button class="mode total" data-inim-mode="TOTAL">🔒 TOTALE<small>Inserimento completo</small></button><button class="mode partial" data-inim-mode="PARTIAL">◐ PARZIALE<small>Inserimento parziale</small></button><button class="mode instant" data-inim-mode="INSTANT">⚡ ISTANTANEO<small>Senza ritardo</small></button><button class="mode disarm" data-inim-mode="DISARMED">🔓 DISINSERISCI<small>Aree selezionate</small></button></div></div><div class="card"><div class="sectionHead"><h2>Partizioni</h2><span class="pill">${parts.length}</span></div><div class="grid">${parts.map(p=>`<label class="entity partition"><input type="checkbox" data-part="${p.id}" ${this._selectedPartitions.has(p.id)?'checked':''}><div><div class="name">${p.name}</div><div class="meta">${this._pretty(p.state)}</div></div><span class="chip">${this._pretty(p.mode)}</span></label>`).join('')}</div></div><div class="card"><div class="sectionHead"><h2>Zone</h2><span class="pill ${zoneProblems?'warn':'ok'}">${zoneProblems?`${zoneProblems} da verificare`:`${zones.length} OK`}</span></div><div class="grid">${zones.map(z=>{let cls='ok',txt='OK';if(z.unavailable){cls='bad';txt='NON DISP.';}else if(z.memory){cls='bad';txt='MEMORIA';}else if(z.excluded){cls='warn';txt='ESCLUSA';}else if(z.state==='on'){cls='warn';txt='ATTIVA';}return`<div class="entity"><div class="row"><div><div class="name">${this._esc(z.name)}</div><div class="meta">${this._esc(z.detailed||this._pretty(z.state))}</div></div><div class="zoneActions"><span class="zoneState ${cls}">${txt}</span>${z.hasExclusion?`<button class="btn ${z.excluded?'on':'warn'}" data-zone-exclude="${this._esc(z.entityId)}">${z.excluded?'INCLUDI':'ESCLUDI'}</button>`:''}</div></div></div>`}).join('')}</div></div>`;
      root.querySelectorAll('[data-part]').forEach(i=>i.addEventListener('change',()=>i.checked?this._selectedPartitions.add(i.dataset.part):this._selectedPartitions.delete(i.dataset.part)));
      root.querySelectorAll('[data-inim-mode]').forEach(b=>b.addEventListener('click',()=>this._sendInimMode(b.dataset.inimMode)));
      root.querySelectorAll('[data-zone-exclude]').forEach(b=>b.addEventListener('click',()=>{const z=zones.find(x=>x.entityId===b.dataset.zoneExclude);if(z)this._toggleInimZone(z);}));
    }else{
      const panels=this._entities('alarm_control_panel'),zones=this._securityZones(),groups=this._groupByArea(zones.map(zone=>zone.entity)),zoneMap=new Map(zones.map(zone=>[zone.entityId,zone])),zoneIndex=new Map(zones.map((zone,index)=>[zone.entityId,index]));
      root.innerHTML=`<div class="homeHeader"><div><h1 class="pageTitle">Sicurezza</h1><p class="pageLead">Impianto, partizioni e zone.</p></div><span class="pill ${zones.some(zone=>zone.active||zone.unavailable)?'warn':'ok'}">${zones.filter(zone=>zone.active||zone.unavailable).length} attenzioni</span></div><div class="card"><div class="sectionHead"><h2>Impianto / Partizioni</h2><span class="pill">${panels.length}</span></div><div class="grid securityGrid">${panels.map(entity=>`<div class="entity securityPanel"><div class="name">${this._esc(this._displayName(entity.entity_id))}</div><div class="securityState">${this._alarmState(entity.state)}</div><div class="coverBtns"><button class="btn warn" data-alarm-away="${entity.entity_id}">Inserisci</button><button class="btn" data-alarm-home="${entity.entity_id}">Parziale</button><button class="btn danger" data-alarm-disarm="${entity.entity_id}">Disinserisci</button></div></div>`).join('')||'<div class="empty">Nessuna partizione configurata.</div>'}</div></div><div class="card"><div class="sectionHead"><h2>Zone</h2><span class="pill">${zones.length}</span></div>${groups.map(([area,entities])=>`<section class="securityArea"><div class="areaTitle">${this._esc(area)}</div><div class="zoneList">${entities.map(entity=>{const zone=zoneMap.get(entity.entity_id);return`<button type="button" class="zoneRow ${zone.active?'attention':''} ${zone.bypassed?'bypassed':''} ${zone.pending?'loading':''} ${zone.unavailable?'unavailable':''}" data-security-zone="${zoneIndex.get(entity.entity_id)}" aria-label="Apri ${this._esc(zone.name)}"><span><b>${this._esc(zone.name)}</b><small>${this._esc(zone.deviceClass)} - ${this._esc(zone.area)}</small></span><span class="zoneState ${zone.unavailable?'bad':zone.bypassed?'warn':zone.active?'warn':'ok'}">${this._esc(zone.state)}</span></button>`}).join('')}</div></section>`).join('')||'<div class="empty">Nessuna zona di sicurezza riconosciuta.</div>'}</div>`;
       const command=async(button,service,key)=>{const code=await this._requestPin('Codice allarme','Inserisci il codice se richiesto dal tuo impianto.');if(code!==null)this._hass.callService('alarm_control_panel',service,{entity_id:button.dataset[key],code});};
       root.querySelectorAll('[data-alarm-away]').forEach(b=>b.addEventListener('click',()=>command(b,'alarm_arm_away','alarmAway')));
       root.querySelectorAll('[data-alarm-home]').forEach(b=>b.addEventListener('click',()=>command(b,'alarm_arm_home','alarmHome')));
       root.querySelectorAll('[data-alarm-disarm]').forEach(b=>b.addEventListener('click',()=>command(b,'alarm_disarm','alarmDisarm')));
       root.querySelectorAll('[data-security-zone]').forEach(button=>button.addEventListener('click',()=>this._openSecurityZone(zones[Number(button.dataset.securityZone)])));
    }
  }

  _openCamera(id){const entity=this._state(id);if(!entity)return;const picture=entity.attributes?.entity_picture||`/api/camera_proxy/${encodeURIComponent(id)}`;this._openDialog({title:this._displayName(id),description:['unknown','unavailable'].includes(entity.state)?'Non disponibile':'Live',body:`<div class="cameraViewer"><img src="${this._esc(picture)}" alt="${this._esc(this._displayName(id))}"></div>`,confirmLabel:'CHIUDI',cancelLabel:'INDIETRO',tone:'cameraDialog'});}

  _renderCameras(){const root=this.shadowRoot.getElementById('page-cameras'),cameras=this._entities('camera'),online=cameras.filter(entity=>!['unavailable','unknown'].includes(entity.state)).length;root.innerHTML=`<div class="homeHeader"><div><h1 class="pageTitle">Telecamere</h1><p class="pageLead">${online} online</p></div><span class="pill">${cameras.length}</span></div><div class="cameraGrid">${cameras.map(entity=>{const unavailable=['unavailable','unknown'].includes(entity.state),picture=entity.attributes?.entity_picture||`/api/camera_proxy/${encodeURIComponent(entity.entity_id)}`;return`<button class="camera ${unavailable?'offline':''}" data-camera="${entity.entity_id}" aria-label="Apri ${this._esc(this._displayName(entity.entity_id))}"><span class="cameraFrame"><img loading="lazy" src="${this._esc(picture)}" alt=""></span><span class="shade"><b>${this._esc(this._displayName(entity.entity_id))}</b><small>${unavailable?'Non disponibile':'Online'}</small></span></button>`}).join('')||'<div class="card empty">Nessuna telecamera configurata.</div>'}</div>`;root.querySelectorAll('[data-camera]').forEach(button=>button.addEventListener('click',()=>this._openCamera(button.dataset.camera)));}

  _renderFavorites(){
    const root=this.shadowRoot.getElementById('page-favorites');if(!root)return;const ids=(this._config?.favorites||[]).filter(id=>this._state(id)&&!this._hidden.has(id));
    root.innerHTML=`<div class="card"><div class="sectionHead"><h2>Preferiti</h2><span class="pill">${ids.length}</span></div><div class="grid">${ids.map(id=>{const e=this._state(id);return`<button class="entity btn" data-fav-open="${this._esc(id)}"><div class="name">${icon('star')} ${this._esc(this._displayName(id))}</div><div class="meta">${this._esc(this._pretty(e.state))}</div></button>`}).join('')||'<div class="empty">Nessun preferito. Aggiungi qui i controlli che usi più spesso.</div>'}</div></div>`;
    root.querySelectorAll('[data-fav-open]').forEach(b=>b.addEventListener('click',()=>this._openMoreInfo(b.dataset.favOpen)));
  }

  _renderSupport(){
    const root=this.shadowRoot.getElementById('page-support');if(!root)return;const s=this._config?.support||{},tel=String(s.phone||'').trim(),brand=this._bootstrap?.branding||{},assistance=this._bootstrap?.assistance||{},categories=assistance.categories||['Altro'];
    root.innerHTML=`<div class="card hero"><div class="muted">${this._esc(brand.company_name||'')}</div><h2>Assistenza</h2><div class="muted">Descrivi il problema: prepareremo una richiesta chiara senza includere credenziali o codici.</div></div><div class="card"><div class="sectionHead"><h2>Richiedi assistenza</h2><span class="pill">${this._esc(String(assistance.provider||'whatsapp').toUpperCase())}</span></div><label class="name" for="assistanceCategory">Categoria</label><select id="assistanceCategory" class="energySearch">${categories.map(x=>`<option value="${this._esc(x)}">${this._esc(x)}</option>`).join('')}</select><label class="name" for="assistanceDescription" style="display:block;margin-top:var(--cl-space-md)">Cosa sta succedendo?</label><textarea id="assistanceDescription" class="energySearch" rows="5" maxlength="2000" placeholder="Descrivi il problema con parole semplici"></textarea>${assistance.diagnostics?.enabled?`<label class="row" style="justify-content:flex-start;margin-top:var(--cl-space-md)"><input id="diagnosticConsent" type="checkbox"><span class="meta">Autorizzo la raccolta della diagnostica tecnica prevista per questa richiesta.</span></label>`:''}<button id="requestAssistance" class="btn primary" style="margin-top:var(--cl-space-md)">RICHIEDI ASSISTENZA</button></div><div class="supportGrid"><button class="card supportCard btn ${tel?'primary':'disabled'}" data-support-call ${tel?'':'disabled'}><div class="name">☎ Chiama ${this._esc(brand.company_name||'')}</div><div class="meta">${tel||'Numero non configurato'}</div></button><button class="card supportCard btn" data-support-info><div class="name">ⓘ Info impianto</div><div class="meta">${this._esc(s.site_name||'Casa')} ${s.customer?`· ${this._esc(s.customer)}`:''}</div></button></div>`;
    root.querySelector('#requestAssistance')?.addEventListener('click',async()=>{const button=root.querySelector('#requestAssistance'),category=root.querySelector('#assistanceCategory')?.value||'Altro',description=root.querySelector('#assistanceDescription')?.value||'',diagnostic_consent=Boolean(root.querySelector('#diagnosticConsent')?.checked);button.disabled=true;try{const prepared=await this._hass.callWS({type:'cl_control/assistance/prepare',category,description,occurred_at:new Date().toLocaleString('it-IT'),entity_id:this._assistanceContext?.entity_id||'',module:this._assistanceContext?.module||'',severity:'info',diagnostic_consent});if(prepared?.url)window.open(prepared.url,'_blank','noopener');else this._toast(`Richiesta registrata${prepared?.ticket_id?` · ticket ${prepared.ticket_id}`:''}. WhatsApp non configurato.`,'warning');}catch(_err){this._toast('Impossibile preparare la richiesta di assistenza.','error');}finally{button.disabled=false;}});
    root.querySelector('[data-support-call]')?.addEventListener('click',()=>{window.location.href=`tel:${tel}`;});
    root.querySelector('[data-support-info]')?.addEventListener('click',()=>this._openDialog({title:brand.product_name||brand.brand_name||'',description:`Impianto: ${s.site_name||'Casa'} · Cliente: ${s.customer||'-'}`,body:'',confirmLabel:'CHIUDI',cancelLabel:'INDIETRO'}));
  }

  _installerEntities(){
    const out=[];const add=(module,items)=>items.forEach(e=>out.push({module,id:e.entity_id,name:this._friendly(e.entity_id)}));
    add('Luci',this._entities('light',true)); add('Switch',this._entities('switch',true)); add('Aperture',this._entities('cover',true)); add('Clima',this._entities('climate',true)); add('Telecamere',this._entities('camera',true)); add('Energia',this._energySensors(true)); add('Sicurezza',this._entities('alarm_control_panel',true)); add('Zone sicurezza',this._securityZoneCandidates(true)); this._inimPartitions(true).forEach(p=>out.push({module:'Sicurezza INIM',id:p.modeId,name:p.name})); this._inimZones(true).forEach(z=>out.push({module:'Zone INIM',id:z.entityId,name:z.name}));
    const seen=new Set();return out.filter(x=>{if(seen.has(x.id))return false;seen.add(x.id);return true;}).sort((a,b)=>a.module.localeCompare(b.module,'it')||a.name.localeCompare(b.name,'it'));
  }

  async _unlockInstaller(){const pin=await this._requestPin('Accesso installatore','Inserisci il PIN riservato per aprire gli strumenti tecnici.');if(pin===null)return;try{const r=await this._hass.callWS({type:'cl_control/installer/unlock',pin});this._installerUnlocked=Boolean(r?.unlocked);if(!this._installerUnlocked)this._toast(r?.retry_after?`Accesso temporaneamente bloccato. Riprova tra ${r.retry_after} secondi.`:`Codice errato${Number.isFinite(r?.remaining_attempts)?` · ${r.remaining_attempts} tentativi rimasti`:''}.`,r?.retry_after?'warning':'error');this._renderData();}catch(e){this._toast('Backend di configurazione non disponibile.','error');}}
  async _lockInstaller(){try{await this._hass.callWS({type:'cl_control/installer/lock'});}catch(e){}this._installerUnlocked=false;this._renderData();}

  _captureInstallerSections(root){root?.querySelectorAll?.('.installerSection').forEach((section,index)=>{const id=section.dataset.installerSection||this._installerSectionIds[index];if(!id)return;section.open?this._installerOpenSections.add(id):this._installerOpenSections.delete(id);});}
  _restoreInstallerSections(root){root?.querySelectorAll?.('.installerSection').forEach((section,index)=>{const id=this._installerSectionIds[index];if(!id)return;section.dataset.installerSection=id;section.open=this._installerOpenSections.has(id);section.addEventListener('toggle',()=>{section.open?this._installerOpenSections.add(id):this._installerOpenSections.delete(id);});});}

  _renderInstaller(){
    const root=this.shadowRoot.getElementById('page-more'),on=this._installerOn();
    this._captureInstallerSections(root);
    if(!on){
      root.innerHTML=`<div class="installerSurface"><div class="homeHeader"><div><h1 class="pageTitle">Installatore</h1><p class="pageLead">Area riservata agli amministratori autorizzati.</p></div><button id="openNativeHaLocked" class="btn nativeHaButton">Apri Home Assistant</button></div><div class="card installerBanner"><span class="statusIcon">${icon('security')}</span><span><span class="statusTitle">Sessione protetta</span><span class="statusMeta">Inserisci il PIN installatore per accedere agli strumenti tecnici.</span></span><button id="unlockInstaller" class="btn primary">SBLOCCA</button></div></div>`;
      root.querySelector('#unlockInstaller')?.addEventListener('click',()=>this._unlockInstaller());root.querySelector('#openNativeHaLocked')?.addEventListener('click',()=>window.location.assign(new URL('/',window.location.origin).href));return;
    }
    const all=this._installerEntities(),term=this._installerSearch.toLowerCase().trim(),filtered=all.filter(x=>!term||`${x.module} ${x.name} ${x.id}`.toLowerCase().includes(term));
    const grouped=new Map();for(const x of filtered){if(!grouped.has(x.module))grouped.set(x.module,[]);grouped.get(x.module).push(x);}
    const currentTheme=this._theme(),themes=this._bootstrap?.branding?.themes||[],levels=this._bootstrap?.customer_ui?.experience?.levels||['essential','standard','pro'];
    const reviewAll=all.map(x=>{const entity=this._state(x.id),domain=String(x.id).split('.')[0],experience=this._entityClassification(entity),switchClassification=/^(switch|valve)$/.test(domain)?this._switchClassification(entity):null,securityClassification=domain==='binary_sensor'?this._securityZoneClassification(entity):null,nameNeedsReview=this._nameNeedsReview(x.id)&&!this._config?.aliases?.[x.id],areaMissing=!this._entityArea.has(x.id)&&!this._config?.entity_areas?.[x.id],classification=securityClassification||switchClassification||experience,mappingMissing=Boolean((securityClassification?.needs_review||switchClassification?.needs_review)&&!this._config?.entity_modules?.[x.id]),reasons=[nameNeedsReview?'nome':'',classification.needs_review&&!this._config?.entity_levels?.[x.id]?'classification':'',areaMissing?'area':'',mappingMissing?'mapping':''].filter(Boolean);return{...x,classification,nameNeedsReview,areaMissing,mappingMissing,reasons,needsReview:Boolean(reasons.length)};}).filter(x=>x.needsReview),review=this._reviewFilter==='all'?reviewAll:reviewAll.filter(item=>item.reasons.includes(this._reviewFilter));
    const levelOptions=(selected,inherit=false)=>`${inherit?'<option value="">Eredita</option>':''}${levels.map(level=>`<option value="${level}" ${selected===level?'selected':''}>${level.toUpperCase()}</option>`).join('')}`;
    const moduleIds=this._bootstrap?.customer_ui?.modules||[];
    const areas=[...new Set([...this._entities('light',true),...this._switchLike(true)].map(e=>this._areaNameFor(e.entity_id)))];const configuredAreas=this._areaOrder();const orderedAreas=[...configuredAreas.filter(a=>areas.includes(a)),...areas.filter(a=>!configuredAreas.includes(a)).sort((a,b)=>a.localeCompare(b,'it'))];
    const homeLabels={lights:'Luci',covers:'Aperture',climate:'Clima',energy:'Energia',security:'Sicurezza',cameras:'Telecamere',support:'Assistenza'};const present=this._navItems().map(x=>x[0]).filter(x=>homeLabels[x]);const configuredHome=this._config?.home_order||[];const orderedHome=[...configuredHome.filter(x=>present.includes(x)),...present.filter(x=>!configuredHome.includes(x))];
    const energyRoles=[['solar','Produzione FV'],['home','Consumo casa'],['grid','Potenza rete'],['import','Prelievo rete'],['export','Immissione rete'],['battery','Stato batteria'],['battery_power','Potenza batteria']];
    const s=this._config?.support||{};const version=this._esc(CL_CONTROL_ASSET_VERSION);const brand=this._bootstrap?.branding||{};
    root.innerHTML=`<div class="installerSurface"><div class="homeHeader"><div><h1 class="pageTitle">Installatore</h1><p class="pageLead">Configurazione tecnica ${this._esc(s.site_name||'')}</p></div><button id="lockInstaller" class="btn danger">BLOCCA</button></div><div class="installerSections">
      <details class="installerSection" open><summary>Impianto <span class="pill ok">ONLINE</span></summary><div class="installerBody"><div class="installerGrid"><div class="entity"><div class="name">Entità rilevate</div><div class="temp">${all.length}</div></div><div class="entity"><div class="name">Entità nascoste</div><div class="temp">${this._hidden.size}</div></div></div></div></details>
      <details class="installerSection" open><summary>Discovery <span class="pill ${reviewAll.length?'warn':''}">${reviewAll.length} da configurare</span></summary><div class="installerBody"><p class="muted">Completa nome, classificazione, area e mapping tramite override dedicati.</p><div class="filterBar reviewFilters">${[['all','Tutti'],['nome','Nome'],['classification','Classificazione'],['area','Area'],['mapping','Mapping']].map(([id,label])=>`<button class="btn ${this._reviewFilter===id?'active':''}" data-review-filter="${id}">${label}</button>`).join('')}</div>${review.length?`<div class="reviewList">${review.slice(0,30).map(x=>`<button class="reviewRow" data-review-entity="${this._esc(x.id)}"><span class="reviewMain"><span class="name">${this._esc(this._displayName(x.id)||'Nome non configurato')}</span><span class="meta">${this._esc(x.module)} · confidence ${Math.round(x.classification.classification_confidence*100)}%</span><code>${this._esc(x.id)}</code></span><span class="reviewAside"><span class="reviewStatus">${x.reasons.map(reason=>({nome:'Nome',classification:'Classificazione',area:'Area',mapping:'Mapping'})[reason]).join(' · ')}</span><span class="reviewAction">Configura ›</span></span></button>`).join('')}</div>`:'<div class="empty">Nessuna classificazione da verificare.</div>'}<div class="sectionHead"><h2>Mappatura Energia</h2></div><div class="energyMapGrid">${energyRoles.map(([role,label])=>{const current=this._energyMap(role),candidates=this._energySensors(true).filter(e=>role!=='battery'||String(e.attributes?.unit_of_measurement||'')==='%'||String(e.attributes?.device_class||'')==='battery');return`<div class="energyMapItem" data-energy-item="${role}"><label>${label}</label><input class="energySearch" data-energy-search="${role}" placeholder="Automatico o entity_id" value="${this._esc(current||'')}" autocomplete="off"><div class="energyMatches" data-energy-matches="${role}">${candidates.slice(0,80).map(e=>`<button type="button" class="energyMatch" data-energy-choice="${role}" data-energy-id="${this._esc(e.entity_id)}"><b>${this._esc(this._displayName(e.entity_id))}</b><span>${this._esc(e.entity_id)}</span></button>`).join('')}</div><div class="energyMapActions"><button type="button" class="btn primary" data-energy-save="${role}">SALVA</button><button type="button" class="btn" data-energy-auto="${role}">AUTO</button></div></div>`}).join('')}</div></div></details>
      <details class="installerSection"><summary>Interfaccia <span class="pill">${this._esc(this._themeLabel(currentTheme))}</span></summary><div class="installerBody"><div class="sectionHead"><h2>Tema</h2></div><div class="themeGrid">${themes.map(theme=>`<button class="themeCard ${currentTheme===theme.id?'active':''}" data-theme-choice="${this._esc(theme.id)}"><div class="themePreview" style="${this._esc(this._themePreviewStyle(theme))}"></div><b>${this._esc(theme.name)}</b><span>${this._esc(theme.description||'')}</span></button>`).join('')}</div><div class="sectionHead"><h2>Ordine aree Luci</h2></div><div class="areaOrderList">${orderedAreas.map((area,i)=>`<div class="areaOrderRow"><div><div class="name">${this._esc(area)}</div><div class="meta">Posizione ${i+1} · Switch nel generale: ${this._config?.area_switches?.[area]?'Sì':'No'}</div></div><div class="areaOrderBtns"><button class="btn ${this._config?.area_switches?.[area]?'on':''}" data-area-switch-toggle="${this._esc(area)}">SW</button><button class="btn" data-area-up="${this._esc(area)}" ${i===0?'disabled':''}>↑</button><button class="btn" data-area-down="${this._esc(area)}" ${i===orderedAreas.length-1?'disabled':''}>↓</button></div></div>`).join('')}</div><div class="sectionHead"><h2>Ordine Home</h2></div><div class="areaOrderList">${orderedHome.map((id,i)=>`<div class="areaOrderRow"><div><div class="name">${homeLabels[id]}</div><div class="meta">Posizione ${i+1}</div></div><div class="areaOrderBtns"><button class="btn" data-home-up="${id}" ${i===0?'disabled':''}>↑</button><button class="btn" data-home-down="${id}" ${i===orderedHome.length-1?'disabled':''}>↓</button></div></div>`).join('')}</div></div></details>
      <details class="installerSection"><summary>Layout dashboard <span class="pill">3.3</span></summary><div class="installerBody"><p class="muted">Personalizza Home e Luci con una bozza sicura. Gli altri moduli useranno lo stesso schema nelle prossime estensioni.</p><div class="layoutInstallerActions"><button class="btn primary" data-layout-start>MODIFICA LAYOUT</button><button class="btn" data-layout-start-preview>ANTEPRIMA CLIENTE</button><button class="btn warn" data-layout-reset>RIPRISTINA AUTOMATICO</button></div><div class="meta">Override disponibili: Base · Smartphone · Tablet · Wall panel. Ereditarietà: dispositivo → base → generato.</div></div></details>
      <details class="installerSection"><summary>Livelli esperienza <span class="pill">${this._esc(this._activeExperience().toUpperCase())}</span></summary><div class="installerBody"><p class="muted">Un solo runtime, con profondità delle informazioni adattata al profilo.</p><div class="filterBar">${levels.map(level=>`<button class="btn ${this._config?.experience_level===level?'on':''}" data-experience-global="${level}">${level.toUpperCase()}</button>`).join('')}</div><div class="sectionHead"><h2>Preview as</h2><span class="pill">TEMPORANEO</span></div><div class="filterBar"><button class="btn ${!this._previewExperience?'on':''}" data-preview-level="">CLIENTE</button>${levels.map(level=>`<button class="btn ${this._previewExperience===level?'on':''}" data-preview-level="${level}">${level.toUpperCase()}</button>`).join('')}</div><div class="energyMapGrid">${moduleIds.map(id=>`<div class="energyMapItem"><label>${this._esc(id)}</label><select class="energySearch" data-module-level="${this._esc(id)}">${levelOptions(this._config?.module_levels?.[id]||'',true)}</select></div>`).join('')}</div></div></details>
      <details class="installerSection"><summary>Sicurezza <span class="pill ok">SESSIONE ATTIVA</span></summary><div class="installerBody"><p class="muted">Accesso amministratore verificato. La sessione viene bloccata automaticamente dal backend.</p><button class="btn danger" id="lockInstallerSecondary">TERMINA SESSIONE</button></div></details>
      <details class="installerSection"><summary>Assistenza <span class="pill">CLIENTE</span></summary><div class="installerBody"><div class="energyMapGrid"><div class="energyMapItem"><label>Nome impianto</label><input class="energySearch" id="cfgSite" value="${this._esc(s.site_name||'Casa')}"></div><div class="energyMapItem"><label>Cliente</label><input class="energySearch" id="cfgCustomer" value="${this._esc(s.customer||'')}"></div><div class="energyMapItem"><label>WhatsApp</label><input class="energySearch" id="cfgWhatsapp" value="${this._esc(s.whatsapp||'')}"></div><div class="energyMapItem"><label>Telefono</label><input class="energySearch" id="cfgPhone" value="${this._esc(s.phone||'')}"></div></div><button id="saveSupport" class="btn primary">SALVA ASSISTENZA</button></div></details>
      <details class="installerSection"><summary>Diagnostica <span class="pill">TECNICA</span></summary><div class="installerBody"><input id="installerSearch" class="search" placeholder="Cerca nome o entity_id" value="${this._esc(this._installerSearch)}"><button id="showAll" class="btn">MOSTRA TUTTE</button>${[...grouped.entries()].map(([module,items])=>`<div class="areaTitle">${this._esc(module)}</div><div class="grid">${items.map(x=>{const hidden=this._hidden.has(x.id);return`<div class="entity hideRow"><div><div class="name ${hidden?'hiddenTag':''}">${this._esc(x.name)}</div><div class="meta">${this._esc(x.id)}${hidden?' · NASCOSTA':''}</div></div><button class="btn ${hidden?'on':'warn'}" data-hide="${this._esc(x.id)}">${hidden?'MOSTRA':'NASCONDI'}</button></div>`}).join('')}</div>`).join('')}</div></details>
      <details class="installerSection"><summary>Sistema / About <span class="pill">${version}</span></summary><div class="installerBody"><p class="muted">${this._esc(brand.product_name||brand.brand_name||'')} · ${this._esc(brand.company_name||'')}</p><div class="meta">Versione ${version}</div><button id="openNativeHa" class="btn primary nativeHaButton">Apri Home Assistant</button></div></details>
    </div></div>`;
    this._restoreInstallerSections(root);
    root.querySelector('[data-layout-start]')?.addEventListener('click',()=>this._startLayoutEditor(false));root.querySelector('[data-layout-start-preview]')?.addEventListener('click',()=>this._startLayoutEditor(true));root.querySelector('[data-layout-reset]')?.addEventListener('click',()=>this._resetLayout());
    root.querySelectorAll('[data-preview-level]').forEach(button=>button.addEventListener('click',()=>{this._previewExperience=button.dataset.previewLevel||null;this._renderData();}));
    root.querySelectorAll('[data-experience-global]').forEach(button=>button.addEventListener('click',async()=>{await this._saveConfig({experience_level:button.dataset.experienceGlobal});this._renderData();}));
    root.querySelectorAll('[data-module-level]').forEach(select=>select.addEventListener('change',async()=>{const values={...(this._config?.module_levels||{})};if(select.value)values[select.dataset.moduleLevel]=select.value;else delete values[select.dataset.moduleLevel];await this._saveConfig({module_levels:values});this._renderData();}));
    root.querySelectorAll('[data-review-entity]').forEach(button=>button.addEventListener('click',()=>this._editEntity(button.dataset.reviewEntity)));
    root.querySelectorAll('[data-review-filter]').forEach(button=>button.addEventListener('click',()=>{this._reviewFilter=button.dataset.reviewFilter;this._renderInstaller();}));
    root.querySelector('#openNativeHa')?.addEventListener('click',()=>window.location.assign(new URL('/',window.location.origin).href));
    root.querySelectorAll('#lockInstaller,#lockInstallerSecondary').forEach(button=>button.addEventListener('click',()=>this._lockInstaller()));
    root.querySelectorAll('[data-theme-choice]').forEach(button=>button.addEventListener('click',async()=>{await this._setTheme(button.dataset.themeChoice);this._renderInstaller();}));
    root.querySelectorAll('[data-area-up],[data-area-down]').forEach(button=>button.addEventListener('click',async()=>{const area=button.dataset.areaUp||button.dataset.areaDown;const i=orderedAreas.indexOf(area),j=button.dataset.areaUp!==undefined?i-1:i+1;if(i<0||j<0||j>=orderedAreas.length)return;[orderedAreas[i],orderedAreas[j]]=[orderedAreas[j],orderedAreas[i]];await this._setAreaOrder(orderedAreas);this._renderLights();this._renderInstaller();}));
    root.querySelectorAll('[data-area-switch-toggle]').forEach(button=>button.addEventListener('click',async()=>{const map={...(this._config.area_switches||{})};const area=button.dataset.areaSwitchToggle;map[area]=!map[area];await this._saveConfig({area_switches:map});this._renderLights();this._renderInstaller();}));
    root.querySelectorAll('[data-home-up],[data-home-down]').forEach(button=>button.addEventListener('click',async()=>{const id=button.dataset.homeUp||button.dataset.homeDown;const i=orderedHome.indexOf(id),j=button.dataset.homeUp!==undefined?i-1:i+1;if(i<0||j<0||j>=orderedHome.length)return;[orderedHome[i],orderedHome[j]]=[orderedHome[j],orderedHome[i]];await this._saveConfig({home_order:orderedHome});this._renderHome();this._renderInstaller();}));
    root.querySelectorAll('[data-energy-search]').forEach(input=>{const item=input.closest('[data-energy-item]'),box=item?.querySelector('[data-energy-matches]');const lock=()=>{this._installerUiLocked=true;item?.classList.add('searchOpen');};const filter=()=>{const query=input.value.trim().toLowerCase();box?.querySelectorAll('[data-energy-id]').forEach(button=>{button.hidden=Boolean(query&&!`${button.textContent} ${button.dataset.energyId}`.toLowerCase().includes(query));});};input.addEventListener('focus',()=>{lock();filter();});input.addEventListener('input',()=>{lock();filter();});input.addEventListener('blur',()=>setTimeout(()=>{item?.classList.remove('searchOpen');this._installerUiLocked=false;},250));});
    root.querySelectorAll('[data-energy-choice]').forEach(button=>{button.addEventListener('pointerdown',event=>event.preventDefault());button.addEventListener('click',()=>{const input=button.closest('[data-energy-item]')?.querySelector('[data-energy-search]');if(input)input.value=button.dataset.energyId;});});
    root.querySelectorAll('[data-energy-save]').forEach(button=>button.addEventListener('click',async()=>{const item=button.closest('[data-energy-item]'),value=(item?.querySelector('[data-energy-search]')?.value||'').trim();if(value&&!this._state(value)){this._toast('Entity ID non trovato. Controlla il valore.','error');return;}await this._setEnergyMap(button.dataset.energySave,value);this._renderEnergy();this._renderInstaller();}));
    root.querySelectorAll('[data-energy-auto]').forEach(button=>button.addEventListener('click',async()=>{await this._setEnergyMap(button.dataset.energyAuto,'');this._renderEnergy();this._renderInstaller();}));
    root.querySelector('#saveSupport')?.addEventListener('click',async()=>{const support={...(this._config.support||{}),site_name:root.querySelector('#cfgSite')?.value||'Casa',customer:root.querySelector('#cfgCustomer')?.value||'',whatsapp:root.querySelector('#cfgWhatsapp')?.value||'',phone:root.querySelector('#cfgPhone')?.value||''};await this._saveConfig({support});this._renderData();});
    root.querySelector('#installerSearch')?.addEventListener('input',event=>{this._installerSearch=event.target.value;this._renderInstaller();});root.querySelector('#showAll')?.addEventListener('click',async()=>{await this._saveConfig({hidden:[]});this._renderData();});root.querySelectorAll('[data-hide]').forEach(button=>button.addEventListener('click',async()=>{const hidden=new Set(this._config.hidden||[]),id=button.dataset.hide;hidden.has(id)?hidden.delete(id):hidden.add(id);await this._saveConfig({hidden:[...hidden]});this._renderData();}));
  }
}

if(!customElements.get('cl-control-panel'))customElements.define('cl-control-panel',CLControlPanel);

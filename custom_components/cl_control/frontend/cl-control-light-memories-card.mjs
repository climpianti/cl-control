const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const DIM = new Set(['brightness','rgb','rgbw','rgbww','hs','xy','color_temp','white']);
function hueRGB(h){const c=x=>Math.round(255*Math.max(0,Math.min(1,Math.abs(((h/60+x)%6)-3)-1)));return [c(0),c(4),c(2)];}
function rgbHue(rgb){const [r,g,b]=rgb.map(v=>v/255), max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;if(!d)return 0;return ((max===r?(g-b)/d:max===g?(b-r)/d+2:(r-g)/d+4)*60+360)%360;}
const CHANGED = 'cl-control-light-memories-changed';
const sceneCounts=(on,off)=>`${on} ${on===1?'accesa':'accese'} · ${off} ${off===1?'spenta':'spente'}`;

export function lightTileConfig(entity, name, state) {
  const modes = state?.attributes?.supported_color_modes || [];
  const features = [];
  if (modes.some(m => DIM.has(m))) features.push({type:'light-brightness'});
  if (modes.includes('color_temp')) features.push({type:'light-color-temp'});
  return {type:'tile',entity,name,features,tap_action:{action:'more-info'},hold_action:{action:'more-info'}};
}

export function memoryDescription(states) {
  const values = Object.values(states || {});
  if (values.length !== 1) return `${values.length} luci · stato, luminosità e colore`;
  const s = values[0];
  if (s.state === 'off') return 'Spenta';
  const parts = [];
  if (Number.isFinite(s.brightness)) parts.push(`${Math.round(s.brightness / 255 * 100)}%`);
  if (s.color_temp_kelvin) parts.push(`${s.color_temp_kelvin} K`);
  else if (['rgb','rgbw','rgbww','hs','xy'].includes(s.color_mode)) parts.push('Colore salvato');
  if (s.effect) parts.push(s.effect);
  return parts.join(' · ') || 'Accesa';
}

export class CLLightMemoriesCard extends HTMLElement {
  constructor() {
    super(); this.attachShadow({mode:'open'});
    this._config={}; this._hass=null; this._items=[]; this._selected=new Set();
    this._name=''; this._busy=false; this._loading=true; this._error=''; this._notice='';
    this._sequence=0; this._native=null; this._nativeKey=''; this._connected=false;
    this._expanded=false; this._detailsExpanded=false; this._controlBusy=false; this._controlKey='';
    this._sceneStep=0; this._sceneRenderedStep=-1; this._sceneDrafts={};
    this._refresh=()=>this._load();
  }
  setConfig(config) { this._config={...config}; this._sceneRenderedStep=-1; this._render(); }
  connectedCallback() {
    this._connected=true;
    window.addEventListener(CHANGED,this._refresh);
    if(this._hass)this._load();
  }
  disconnectedCallback() {
    this._connected=false; ++this._sequence;
    window.removeEventListener(CHANGED,this._refresh);
  }
  set hass(hass) {
    const first=!this._hass;
    const changedUser=this._hass?.user?.id!==hass?.user?.id;
    this._hass=hass;
    if(changedUser){this._items=[];this._name='';this._selected.clear();this._sceneDrafts={};this._sceneStep=0;this._sceneRenderedStep=-1;if(!this._isPreset())this._render();}
    if(this._native)this._native.hass=hass;
    this._syncState();
    if((first||changedUser)&&this._connected)this._load();
  }
  getCardSize(){return this._config.entity?2:8;}
  getGridOptions(){return {columns:12,rows:'auto',min_columns:6};}
  _isPreset(){return Boolean(this._config.entity);}
  _canSavePreset(){
    const s=this._hass?.states?.[this._config.entity];
    return s?.state==='on'&&(s.attributes?.supported_color_modes||[]).some(m=>DIM.has(m));
  }
  async _load(){
    if(!this._hass||!this._connected)return;
    const sequence=++this._sequence;
    try{
      const response=await this._hass.callWS({type:'cl_control/light_memories/list',
        kind:this._isPreset()?'preset':'scene',...(this._isPreset()?{entity_id:this._config.entity}:{})});
      if(sequence!==this._sequence||!this._connected)return;
      this._items=response.items||[];this._error='';
    }catch(e){if(sequence===this._sequence)this._error=e?.message||'Caricamento non riuscito. Riprova.';}
    finally{if(sequence===this._sequence&&this._connected){this._loading=false;this._render();}}
  }
  async _action(operation,data){
    if(this._busy)return;
    this._busy=true;this._error='';this._notice='';this._render();
    try{
      await this._hass.callWS({type:`cl_control/light_memories/${operation}`,...data});
      this._notice=operation==='apply'?'Richiesta inviata. Verifica le luci.':operation==='delete'?'Eliminato.':'Stato attuale salvato.';
      if(operation==='capture'||operation==='create'){this._name='';if(!this._isPreset()){this._sceneStep=0;this._selected.clear();this._sceneDrafts={};this._notice='Scenario salvato. Premi Avvia per applicarlo alle luci.';}}
      window.dispatchEvent(new Event(CHANGED));
    }catch(e){this._error=e?.message||'Operazione non completata. Verifica lo stato prima di riprovare.';}
    finally{this._busy=false;this._render();if(['capture','create'].includes(operation)&&!this._isPreset()&&!this._sceneStep)this.shadowRoot.querySelector('#createScene')?.focus();}
  }
  _capture(){
    if(!this._isPreset()&&(this._sceneStep!==3||!this._sceneSelectionReady()||!this._name.trim()))return;
    if(!this._isPreset()){
      const states=Object.fromEntries([...this._selected].map(id=>[id,this._sceneSnapshot(id)]));
      this._action('create',{name:this._name.trim(),states});return;
    }
    const entity_ids=this._isPreset()?[this._config.entity]:[...this._selected];
    this._action('capture',{name:this._name.trim(),entity_ids,kind:this._isPreset()?'preset':'scene'});
  }
  _moreInfo(){
    this.dispatchEvent(new CustomEvent('hass-more-info',{bubbles:true,composed:true,detail:{entityId:this._config.entity}}));
  }
  _lightModel(){
    const state=this._hass?.states?.[this._config.entity];
    const a=state?.attributes||{}, modes=a.supported_color_modes||[];
    return {state,a,modes,on:state?.state==='on',available:['on','off'].includes(state?.state),
      dim:modes.some(m=>DIM.has(m)),rgb:modes.some(m=>['rgb','rgbw','rgbww','hs','xy'].includes(m)),
      white:modes.includes('rgbw'),temp:modes.includes('color_temp')};
  }
  async _control(service,data={}){
    if(this._controlBusy||this._busy||!this._lightModel().available)return;
    this._controlBusy=true;this._error='';this._syncControls();
    try{await this._hass.callService('light',service,data,{entity_id:this._config.entity});}
    catch(e){this._error=e?.message||'Comando non riuscito.';}
    finally{this._controlBusy=false;this._render();}
  }
  _setLight(kind,value){
    const {a,modes}=this._lightModel();
    if(kind==='brightness')return this._control(value===0?'turn_off':'turn_on',value===0?{}:{brightness_pct:value});
    if(kind==='temp')return this._control('turn_on',{color_temp_kelvin:value});
    if(kind==='white')return this._control('turn_on',{rgbw_color:[...(a.rgbw_color||[0,0,0,0]).slice(0,3),Math.round(value*255/100)]});
    if(kind==='hue'){
      const rgb=hueRGB(value);
      const data=modes.includes('rgbw')?{rgbw_color:[...rgb,a.rgbw_color?.[3]||0]}:
        modes.includes('rgbww')?{rgbww_color:[...rgb,...(a.rgbww_color||[0,0,0,0,0]).slice(3,5)]}:{hs_color:[value,100]};
      return this._control('turn_on',data);
    }
  }
  _controlsHTML(){
    const m=this._lightModel();
    const slider=(kind,label,min,max,cls)=>`<label class="rail ${cls}"><span>${label}<output data-value="${kind}"></output></span><input type="range" data-control="${kind}" aria-label="${label}" min="${min}" max="${max}" step="1"></label>`;
    return `<div class="light-head"><button class="bulb" id="moreInfo" aria-label="Dettagli luce"><svg viewBox="0 0 32 42" aria-hidden="true"><path class="glass" d="M16 2C8 2 3 8 3 15c0 5 3 8 6 12v4h14v-4c3-4 6-7 6-12C29 8 24 2 16 2Z"/><path class="base" d="M9 32h14v3H9zm1 5h12l-3 4h-6z"/></svg></button><div class="identity"><strong>${esc(this._config.name||m.a.friendly_name||this._config.entity)}</strong><small id="lightState"></small></div>${m.dim?`<button class="star ${this._items.length?'saved':''}" id="favorites" aria-label="Preferiti luce" aria-expanded="${this._expanded}" aria-controls="presetPanel" title="Preferiti luce">${this._items.length?'★':'☆'}</button>`:''}<button id="power" class="power" role="switch" aria-label="Accensione luce"><span></span></button></div><button id="adjust" class="adjust" aria-expanded="${this._detailsExpanded}" aria-controls="lightAdjustments" ${!m.dim&&!m.rgb&&!m.temp&&!m.white?'hidden':''}>${this._detailsExpanded?'Chiudi regolazioni':'Regola'}</button><div id="lightAdjustments" class="rails" ${!this._detailsExpanded?'hidden':''}>${m.dim?slider('brightness','Luminosità',0,100,'brightness'):''}${m.rgb?slider('hue','RGB',0,360,'hue'):''}${m.temp?slider('temp','Bianco · temperatura',m.a.min_color_temp_kelvin||2000,m.a.max_color_temp_kelvin||6500,'temperature'):''}${m.white?slider('white','Bianco W',0,100,'white'):''}</div>`;
  }
  _syncControls(){
    if(!this._isPreset())return;
    const m=this._lightModel(), root=this.shadowRoot;
    const key=JSON.stringify([m.dim,m.rgb,m.white,m.temp,m.a.min_color_temp_kelvin,m.a.max_color_temp_kelvin]);
    if(this._controlKey!==key){this._controlKey=key;this._render();return;}
    const pct=Math.round((m.a.brightness||0)/255*100);
    const status=root.querySelector('#lightState');
    if(status)status.textContent=!m.available?'Non disponibile':m.on?`Accesa${m.dim?' · '+pct+'%':''}`:'Spenta';
    const power=root.querySelector('#power');
    if(power){power.setAttribute('aria-checked',String(m.on));power.disabled=!m.available||this._controlBusy||this._busy;}
    const rgb=m.a.rgb_color||m.a.rgbw_color?.slice(0,3)||[255,210,136];
    const safeRGB=rgb.map(v=>Math.max(0,Math.min(255,Number(v)||0)));
    const white=m.a.rgbw_color?.[3]||0;
    const tint=safeRGB.map(v=>Math.min(255,v+white));
    const level=m.on?(m.dim?Math.max(0,Math.min(1,(m.a.brightness??255)/255)):1):0;
    const surface=root.querySelector('ha-card.light-card');
    if(surface){surface.style.setProperty('--light-rgb',m.on?tint.join(','):'115,119,130');surface.style.setProperty('--light-alpha',String(level*.42));surface.style.setProperty('--light-level',`${level*100}%`);surface.style.setProperty('--lamp-opacity',String(m.on ? .25+.75*level : .4));}
    const bulb=root.querySelector('.bulb');
    if(bulb){bulb.style.setProperty('--glow',m.on?`rgb(${safeRGB.join(',')})`:'#737782');bulb.classList.toggle('lit',m.on);}
    const values={brightness:m.on?pct:0,hue:m.a.hs_color?.[0]??rgbHue(rgb),temp:m.a.color_temp_kelvin||m.a.min_color_temp_kelvin||2000,white:Math.round((m.a.rgbw_color?.[3]||0)/255*100)};
    root.querySelectorAll('[data-control]').forEach(el=>{
      el.disabled=!m.available||this._controlBusy||this._busy;
      if(root.activeElement!==el)el.value=String(values[el.dataset.control]);
      const out=root.querySelector(`[data-value="${el.dataset.control}"]`);
      if(out)out.textContent=el.dataset.control==='temp'?`${el.value} K`:el.dataset.control==='hue'?`${Math.round(Number(el.value))}°`:`${el.value}%`;
    });
  }
  _sceneLightAvailable(id){
    const s=this._hass?.states?.[id];
    return ['on','off'].includes(s?.state)&&!s.attributes?.entity_id&&!s.attributes?.group_entities;
  }
  _sceneDraftFromState(id){
    const s=this._hass?.states?.[id],a=s?.attributes||{},modes=a.supported_color_modes||[];
    const mode=modes.includes(a.color_mode)?a.color_mode:modes[0]||null;
    const channels=(key,fallback,limits=fallback.map(()=>255))=>Array.isArray(a[key])&&a[key].length===fallback.length&&a[key].every((v,i)=>Number.isFinite(v)&&v>=0&&v<=limits[i])?[...a[key]]:fallback;
    return {state:s?.state==='on'?'on':'off',color_mode:mode,
      brightness:Number.isInteger(a.brightness)&&a.brightness>0?Math.min(255,a.brightness):255,
      color_temp_kelvin:Math.max(a.min_color_temp_kelvin||2000,Math.min(a.max_color_temp_kelvin||6500,a.color_temp_kelvin||a.min_color_temp_kelvin||2700)),
      rgb_color:channels('rgb_color',[255,255,255]),rgbw_color:channels('rgbw_color',[255,255,255,0]),
      rgbww_color:channels('rgbww_color',[255,255,255,0,0]),hs_color:channels('hs_color',[30,70],[360,100]),
      xy_color:channels('xy_color',[.3127,.329],[1,1]),effect:(a.effect_list||[]).includes(a.effect)?a.effect:''};
  }
  _sceneSnapshot(id){
    const draft=this._sceneDrafts[id];
    if(!draft||draft.state==='off')return {state:'off'};
    const snapshot={state:'on'},mode=draft.color_mode;
    const modes=this._hass?.states?.[id]?.attributes?.supported_color_modes||[];
    if(modes.some(m=>DIM.has(m)))snapshot.brightness=draft.brightness;
    if(mode)snapshot.color_mode=mode;
    const field={rgb:'rgb_color',rgbw:'rgbw_color',rgbww:'rgbww_color',hs:'hs_color',xy:'xy_color',color_temp:'color_temp_kelvin'}[mode];
    if(field)snapshot[field]=Array.isArray(draft[field])?[...draft[field]]:draft[field];
    if(draft.effect)snapshot.effect=draft.effect;
    return snapshot;
  }
  _sceneDraftValid(id){
    const d=this._sceneDrafts[id],a=this._hass?.states?.[id]?.attributes||{};
    if(!d||!this._sceneLightAvailable(id))return false;
    if(d.state==='off')return true;
    const modes=a.supported_color_modes||[];
    if(modes.length&&!modes.includes(d.color_mode))return false;
    if(d.color_mode==='color_temp'&&(d.color_temp_kelvin<(a.min_color_temp_kelvin||1000)||d.color_temp_kelvin>(a.max_color_temp_kelvin||40000)))return false;
    return !d.effect||(a.effect_list||[]).includes(d.effect);
  }
  _sceneSelectionReady(){return this._selected.size>0&&this._selected.size<=32&&[...this._selected].every(id=>this._sceneDraftValid(id));}
  _sceneDraftDescription(id){
    if(!this._sceneDrafts[id])return 'Impostazioni da scegliere';
    const snapshot=this._sceneSnapshot(id),description=memoryDescription({[id]:snapshot}).replace('Colore salvato','Colore impostato');
    return snapshot.state==='on'&&description!=='Accesa'?`Accesa · ${description}`:description;
  }
  _sceneAdjustmentsHTML(names){
    const modeNames={onoff:'Acceso/spento',brightness:'Luminosità',white:'Bianco',color_temp:'Temperatura bianco',rgb:'Colore RGB',rgbw:'Colore RGBW',rgbww:'Colore RGB + due bianchi',hs:'Tonalità e saturazione',xy:'Colore XY'};
    return [...this._selected].map(id=>{
      const d=this._sceneDrafts[id],a=this._hass?.states?.[id]?.attributes||{},modes=a.supported_color_modes||[];
      const slider=(key,label,value,min,max,step=1)=>`<label class="draft-slider"><span>${label}<output data-draft-output="${key}">${value}</output></span><input type="range" data-draft-control="${key}" aria-label="${esc(label)} · ${esc(names[id]||id)}" min="${min}" max="${max}" step="${step}" value="${value}"></label>`;
      const field={rgb:'rgb_color',rgbw:'rgbw_color',rgbww:'rgbww_color'}[d.color_mode];
      let color='';
      if(field){
        const hex='#'+d[field].slice(0,3).map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
        color=`<label class="draft-color">Colore<input type="color" data-draft-control="color" aria-label="Colore · ${esc(names[id]||id)}" value="${hex}"></label>`;
        if(d.color_mode==='rgbw')color+=slider('white','Bianco W',Math.round(d.rgbw_color[3]/255*100),0,100);
        if(d.color_mode==='rgbww')color+=slider('coldWhite','Bianco freddo',Math.round(d.rgbww_color[3]/255*100),0,100)+slider('warmWhite','Bianco caldo',Math.round(d.rgbww_color[4]/255*100),0,100);
      }else if(d.color_mode==='hs')color=slider('hue','Tonalità',d.hs_color[0],0,360)+slider('saturation','Saturazione',d.hs_color[1],0,100);
      else if(d.color_mode==='xy')color=slider('x','Coordinata colore X',d.xy_color[0],0,1,.0001)+slider('y','Coordinata colore Y',d.xy_color[1],0,1,.0001);
      else if(d.color_mode==='color_temp')color=slider('kelvin','Temperatura bianco',d.color_temp_kelvin,a.min_color_temp_kelvin||2000,a.max_color_temp_kelvin||6500);
      const modeSelect=modes.length>1?`<label class="draft-mode">Regolazione<select data-draft-control="mode" aria-label="Regolazione · ${esc(names[id]||id)}">${modes.map(m=>`<option value="${esc(m)}" ${m===d.color_mode?'selected':''}>${esc(modeNames[m]||m)}</option>`).join('')}</select></label>`:'';
      const effect=(a.effect_list||[]).length?`<label class="draft-mode">Effetto<select data-draft-control="effect" aria-label="Effetto · ${esc(names[id]||id)}"><option value="">Nessun effetto selezionato</option>${a.effect_list.map(e=>`<option value="${esc(e)}" ${d.effect===e?'selected':''}>${esc(e)}</option>`).join('')}</select></label>`:'';
      return `<article class="draft-light" data-draft-id="${esc(id)}"><div class="draft-heading"><ha-icon icon="mdi:lightbulb-outline"></ha-icon><strong>${esc(names[id]||id)}</strong></div><small data-draft-status></small><div class="draft-power" role="group" aria-label="Stato nello scenario · ${esc(names[id]||id)}"><button type="button" data-draft-on="on" aria-pressed="${d.state==='on'}">Accesa</button><button type="button" data-draft-on="off" aria-pressed="${d.state==='off'}">Spenta</button></div><div data-draft-settings ${d.state==='off'?'hidden':''}>${modes.some(m=>DIM.has(m))?slider('brightness','Luminosità',Math.round(d.brightness/255*100),1,100):'<small>Questa luce supporta solo acceso/spento.</small>'}${modeSelect}${color}${effect}</div><button type="button" class="quiet draft-current" data-draft-current>Usa stato attuale</button></article>`;
    }).join('');
  }
  _bindSceneAdjustments(editor){
    editor.querySelectorAll('[data-draft-id]').forEach(row=>{
      const id=row.dataset.draftId;
      row.querySelectorAll('[data-draft-on]').forEach(button=>button.onclick=()=>{if(this._busy)return;this._sceneDrafts[id].state=button.dataset.draftOn;this._syncSceneState();});
      row.querySelector('[data-draft-current]').onclick=()=>{
        if(this._busy||!this._sceneLightAvailable(id))return;
        this._sceneDrafts[id]=this._sceneDraftFromState(id);this._sceneRenderedStep=-1;this._renderScenes();
      };
      row.querySelectorAll('[data-draft-control]').forEach(input=>{
        const update=()=>{
          if(this._busy)return;
          const d=this._sceneDrafts[id],key=input.dataset.draftControl,v=Number(input.value);
          if(key==='brightness')d.brightness=Math.round(v/100*255);
          else if(key==='mode')d.color_mode=input.value;
          else if(key==='effect')d.effect=input.value;
          else if(key==='kelvin')d.color_temp_kelvin=v;
          else if(key==='color'){
            const field={rgb:'rgb_color',rgbw:'rgbw_color',rgbww:'rgbww_color'}[d.color_mode];
            d[field].splice(0,3,...[1,3,5].map(i=>parseInt(input.value.slice(i,i+2),16)));
          }else if(key==='white')d.rgbw_color[3]=Math.round(v/100*255);
          else if(key==='coldWhite'||key==='warmWhite')d.rgbww_color[key==='coldWhite'?3:4]=Math.round(v/100*255);
          else if(key==='hue'||key==='saturation')d.hs_color[key==='hue'?0:1]=v;
          else if(key==='x'||key==='y')d.xy_color[key==='x'?0:1]=v;
          if(key==='mode'){this._sceneRenderedStep=-1;this._renderScenes();}
          else this._syncSceneState();
        };
        input.addEventListener(input.tagName==='SELECT'?'change':'input',update);
      });
    });
  }
  _syncSavedAvailability(){
    this.shadowRoot.querySelectorAll('[data-apply]').forEach(button=>{
      const item=this._items.find(i=>i.id===button.dataset.apply);
      const ids=Object.keys(item?.states||{}),available=ids.length>0&&ids.every(id=>this._sceneLightAvailable(id));
      button.disabled=this._busy||!available;
      const hint=button.closest('.memory')?.querySelector('[data-availability]');
      if(hint)hint.hidden=available;
    });
  }
  _sceneLightDescription(id){
    const s=this._hass?.states?.[id];
    if(!this._sceneLightAvailable(id))return 'Da rimuovere dalla selezione o riprovare più tardi';
    const description=memoryDescription({[id]:{...s.attributes,state:s.state}}).replace('Colore salvato','Colore attuale');
    return s.state==='on'&&description!=='Accesa'?`Accesa · ${description}`:description;
  }
  _sceneStepTo(step){
    if(this._busy)return;
    if(step===1&&this._sceneStep===0){this._error='';this._notice='';}
    if(step>this._sceneStep&&step===2&&!this._sceneSelectionReady())return;
    if(step>this._sceneStep&&step===3&&!this._sceneSelectionReady())return;
    this._sceneStep=step;this._renderScenes();
    const focus=this.shadowRoot.querySelector(step===3?'#name':step?'#sceneStepTitle':'#createScene');
    focus?.focus();
  }
  _cancelScene(){this._name='';this._selected.clear();this._sceneDrafts={};this._sceneStepTo(0);}
  _renderScenes(){
    const root=this.shadowRoot;
    if(!root.querySelector('.scene-shell')){
      root.innerHTML=`<style>
        .scene-shell{color:#f5f7fc;--primary-text-color:#f5f7fc;--secondary-text-color:#bdcadd;--text-primary-color:#f5f7fc}
        :host{display:block;min-width:0;color:#f5f7fc}*{box-sizing:border-box}ha-card{display:block;padding:18px;border:1px solid #b2daff55;border-radius:25px;background:radial-gradient(ellipse at 0% 0%,#29496a66,transparent 75%),linear-gradient(115deg,#18222b,#121721 60%,#211c30);box-shadow:0 9px 25px #0004,inset 0 1px 2px #e7f7ff33}
        h3,h4,p{margin:0}h3{font-size:18px}h4{font-size:16px}.intro,small{color:#bdcadd;font-size:13px;line-height:1.5}small{display:block}.intro{margin:6px 0 14px}.scene-head,.memory,.actions,.editor-actions{display:flex;align-items:center;gap:10px}.scene-head{justify-content:space-between;flex-wrap:wrap}.memory{justify-content:space-between;padding:14px 0;border-top:1px solid #ffffff20}.memory>div:first-child{min-width:0;overflow-wrap:anywhere}.actions{flex-shrink:0}.memory strong{display:block;margin-bottom:4px}.empty{padding:18px 0;color:#bdcadd;font-size:14px}
        button,input{font:inherit}button{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:44px;padding:9px 12px;border:1px solid #ffffff25;border-radius:12px;background:#ffffff08;color:#f5f7fc;cursor:pointer}button ha-icon{--mdc-icon-size:19px}button:disabled{opacity:.45;cursor:default}.primary{background:#356a9c;border-color:#6599c455}.quiet{background:transparent}button:focus-visible,input:focus-visible,h4:focus-visible{outline:2px solid #78c5ff;outline-offset:3px}
        .editor{margin-top:18px;padding-top:18px;border-top:1px solid #ffffff25}.steps{color:#8ac8ff;font-size:12px;margin-bottom:6px}.editor-actions{justify-content:flex-end;flex-wrap:wrap;margin-top:16px}.editor-actions #cancelScene{margin-right:auto}.targets{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.targets label{display:flex;gap:10px;align-items:center;padding:12px;border:1px solid #ffffff20;border-radius:12px;min-width:0;overflow-wrap:anywhere}.targets input{accent-color:#78c5ff;width:18px;height:18px;flex-shrink:0}.area-name{grid-column:1/-1;margin:12px 0 0;font-weight:600;font-size:14px;color:#bdcadd}.targets label span{min-width:0}.name-label{display:block;margin:14px 0 6px}#name{display:block;width:100%;padding:12px;font-size:16px;color:#f5f7fc;background:#ffffff08;border:1px solid #ffffff30;border-radius:12px}.summary{margin:12px 0 0;padding:12px;background:#ffffff08;border-radius:12px;font-size:14px;overflow-wrap:anywhere}.review-row{display:flex;justify-content:space-between;align-items:baseline;gap:12px;border-bottom:1px solid #ffffff10;padding:10px 0;overflow-wrap:anywhere}.review-row span{min-width:0}.review-row small{text-align:right}.message{padding:10px;margin:10px 0;background:#ffffff0b;border-radius:10px;font-size:13px;overflow-wrap:anywhere}#refresh{margin-top:12px}[hidden]{display:none!important}
        .draft-lights{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:12px}.draft-light{min-width:0;padding:16px;border:1px solid #ffffff25;border-radius:18px;background:#ffffff06}.draft-heading{display:flex;align-items:center;gap:10px;overflow-wrap:anywhere}.draft-heading ha-icon{color:#91cfff;flex-shrink:0}.draft-heading strong{min-width:0}.draft-power{display:flex;gap:8px;margin:14px 0}.draft-power button{flex:1}.draft-power button[aria-pressed=true]{background:#356a9c;border-color:#91cfff}.draft-slider{display:block;margin:14px 0}.draft-slider>span{display:flex;justify-content:space-between;gap:10px;font-size:13px}.draft-slider output{font-variant-numeric:tabular-nums;white-space:nowrap}.draft-slider input{width:100%;height:36px;accent-color:#8ac8ff}.draft-color,.draft-mode{display:flex;justify-content:space-between;align-items:center;gap:10px;margin:12px 0;font-size:13px}.draft-color input{width:64px;height:44px;background:#ffffff08;border:1px solid #ffffff30;border-radius:10px}.draft-mode{flex-wrap:wrap}.draft-mode select{min-width:0;max-width:100%;padding:10px;min-height:44px;font:inherit;font-size:16px;background:#18222b;color:#f5f7fc;border:1px solid #ffffff30;border-radius:10px}.draft-current{margin-top:10px;width:100%}select:focus-visible{outline:2px solid #78c5ff;outline-offset:3px}
        @media(max-width:480px){ha-card{padding:14px}.targets{grid-template-columns:1fr}.memory{align-items:flex-start;flex-wrap:wrap}.memory>.actions{margin-left:auto}.editor-actions button{flex:1}.editor-actions #cancelScene{flex-basis:100%;margin:0}.review-row{flex-direction:column;gap:3px}.review-row small{text-align:left}}
      </style><ha-card class="scene-shell"><div class="scene-head"><h3>I tuoi scenari</h3><button id="createScene" class="primary"><ha-icon icon="mdi:plus"></ha-icon>Crea scenario</button></div><p class="intro">Richiama le tue luci con le impostazioni salvate. Gli scenari sono personali per il tuo utente.</p><div id="sceneError" class="message" role="alert" hidden></div><div id="sceneNotice" class="message" role="status" hidden></div><div id="sceneList"></div><button id="refresh" class="quiet">Aggiorna elenco</button><section id="sceneEditor" class="editor" aria-label="Crea scenario" hidden></section></ha-card>`;
      root.querySelector('#createScene').onclick=()=>this._sceneStepTo(1);
      root.querySelector('#refresh').onclick=()=>this._load();
      this._sceneRenderedStep=-1;
    }
    const names=Object.fromEntries((this._config.entities||[]).map(e=>[e.entity_id,e.name||e.entity_id]));
    const areas=Object.fromEntries((this._config.entities||[]).map(e=>[e.entity_id,e.area_name]));
    root.querySelector('#sceneList').innerHTML=this._items.map(item=>{
      const ids=Object.keys(item.states),on=Object.values(item.states).filter(s=>s.state==='on').length;
      const summary=ids.length===1?memoryDescription(item.states):on===0?'Tutte spente':sceneCounts(on,ids.length-on);
      const areaNames=[...new Set(ids.map(id=>areas[id]).filter(Boolean))].join(' · ');
      return `<div class="memory"><div><strong>${esc(item.name)}</strong>${areaNames?`<small>${esc(areaNames)}</small>`:''}<small>${ids.length} ${ids.length===1?'luce':'luci'} · ${esc(summary)}</small><details><summary>Luci incluse</summary><small>${esc(ids.map(id=>names[id]||id).join(', '))}</small></details><small data-availability hidden>Controlla le luci dello scenario prima di avviarlo.</small></div><div class="actions"><button data-apply="${esc(item.id)}" aria-label="Avvia ${esc(item.name)}"><ha-icon icon="mdi:play"></ha-icon>Avvia</button><button data-delete="${esc(item.id)}" aria-label="Elimina ${esc(item.name)}"><ha-icon icon="mdi:delete-outline"></ha-icon>Elimina</button></div></div>`;
    }).join('')||`<p class="empty">${this._loading?'Caricamento…':'Non hai ancora scenari. Crea il primo con le luci che preferisci.'}</p>`;
    root.querySelectorAll('[data-apply]').forEach(button=>button.onclick=()=>{
      const item=this._items.find(i=>i.id===button.dataset.apply);
      if(!button.disabled&&item&&window.confirm(`Avviare “${item.name}”? Verranno richiamate le impostazioni salvate di ${Object.keys(item.states).length} luci.`))this._action('apply',{item_id:item.id});
    });
    root.querySelectorAll('[data-delete]').forEach(button=>button.onclick=()=>{
      const item=this._items.find(i=>i.id===button.dataset.delete);
      if(item&&window.confirm(`Eliminare “${item.name}”?`))this._action('delete',{item_id:item.id});
    });
    const editor=root.querySelector('#sceneEditor');editor.hidden=!this._sceneStep;
    if(this._sceneRenderedStep!==this._sceneStep){
      const step=this._sceneStep;this._sceneRenderedStep=step;
      if(!step)editor.replaceChildren();
      else{
        const titles=['','Scegli le luci','Regola le luci','Nome e riepilogo'];
        const groups=new Map();for(const entity of this._config.entities||[]){const group=entity.area_name||'Luci';if(!groups.has(group))groups.set(group,[]);groups.get(group).push(entity);}
        const selector=[...groups].map(([area,entities])=>`<div class="area-name">${esc(area)}</div>${entities.map(e=>`<label><input type="checkbox" data-target="${esc(e.entity_id)}" ${this._selected.has(e.entity_id)?'checked':''}><span>${esc(e.name||e.entity_id)}<small></small></span></label>`).join('')}`).join('');
        const review=[...this._selected].map(id=>`<div class="review-row"><span>${esc(names[id]||id)}</span><small data-review="${esc(id)}"></small></div>`).join('');
        editor.innerHTML=`<p class="steps">Passaggio ${step} di 3</p><h4 id="sceneStepTitle" tabindex="-1">${titles[step]}</h4><p class="intro">${step===1?'Scegli fino a 32 luci, anche in ambienti diversi.':step===2?'Scegli come dovrà essere ogni luce quando avvierai lo scenario. Queste regolazioni modificano soltanto la bozza.':'Controlla le impostazioni e scegli un nome. Salva scenario non aziona le luci.'}</p>${step===1?`<div class="targets" role="group" aria-label="Luci dello scenario">${selector}</div>`:step===2?`<div class="draft-lights">${this._sceneAdjustmentsHTML(names)}</div>`:`<label class="name-label" for="name">Nome scenario</label><input id="name" maxlength="64" placeholder="Es. Relax tavernetta" value="${esc(this._name)}">${review}`}<p id="selectionSummary" class="summary" role="status"></p><p id="selectionHint" class="intro"></p><div class="editor-actions"><button id="cancelScene" class="quiet">Annulla</button>${step>1?'<button id="previousScene">Indietro</button>':''}${step<3?'<button id="nextScene" class="primary">Continua</button>':'<button id="capture" class="primary"><ha-icon icon="mdi:content-save-outline"></ha-icon>Salva scenario</button>'}</div>`;
        editor.querySelector('#cancelScene').onclick=()=>this._cancelScene();
        editor.querySelector('#previousScene')?.addEventListener('click',()=>this._sceneStepTo(step-1));
        editor.querySelector('#nextScene')?.addEventListener('click',()=>this._sceneStepTo(step+1));
        editor.querySelector('#capture')?.addEventListener('click',()=>this._capture());
        editor.querySelector('#name')?.addEventListener('input',event=>{this._name=event.target.value;this._syncSceneState();});
        editor.querySelectorAll('[data-target]').forEach(input=>input.onchange=()=>{
          const id=input.dataset.target;
          if(input.checked){this._selected.add(id);this._sceneDrafts[id]=this._sceneDraftFromState(id);}
          else{this._selected.delete(id);delete this._sceneDrafts[id];}
          this._syncState();
        });
        if(step===2)this._bindSceneAdjustments(editor);
      }
    }
    this._syncSceneState();this._syncSavedAvailability();
  }
  _syncSceneState(){
    const root=this.shadowRoot;if(!root.querySelector('.scene-shell'))return;
    root.querySelector('#createScene').disabled=this._busy||this._sceneStep>0;
    root.querySelector('#createScene').hidden=this._sceneStep>0;
    root.querySelector('.scene-head h3').textContent=this._sceneStep?'Crea scenario':'I tuoi scenari';
    root.querySelector('.scene-shell > .intro').textContent=this._sceneStep?'Salva le impostazioni da richiamare in seguito. Gli scenari sono personali per il tuo utente.':'Richiama le tue luci con le impostazioni salvate. Gli scenari sono personali per il tuo utente.';
    root.querySelector('#sceneList').hidden=this._sceneStep>0;
    root.querySelector('#refresh').hidden=this._sceneStep>0;
    root.querySelector('#refresh').disabled=this._busy;
    for(const [id,text] of [['sceneError',this._error],['sceneNotice',this._notice]]){const node=root.querySelector('#'+id);node.textContent=text;node.hidden=!text;}
    root.querySelectorAll('[data-delete]').forEach(button=>button.disabled=this._busy);
    if(!this._sceneStep)return;
    root.querySelectorAll('[data-target]').forEach(input=>{
      const available=this._sceneLightAvailable(input.dataset.target);
      input.disabled=this._busy||(!input.checked&&(!available||this._selected.size>=32));
      const label=input.closest('label').querySelector('small');label.textContent=available?this._sceneLightDescription(input.dataset.target):'Non selezionabile in questo momento';
    });
    root.querySelectorAll('[data-review]').forEach(node=>node.textContent=this._sceneDraftDescription(node.dataset.review));
    root.querySelectorAll('[data-draft-id]').forEach(row=>{
      const id=row.dataset.draftId,d=this._sceneDrafts[id],available=this._sceneLightAvailable(id);
      row.querySelector('[data-draft-settings]').hidden=d.state==='off';
      row.querySelector('[data-draft-status]').textContent=this._sceneDraftValid(id)?`Nello scenario: ${this._sceneDraftDescription(id)}`:'Controlla disponibilità e capacità della luce. La bozza è conservata.';
      row.querySelectorAll('[data-draft-on]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.draftOn===d.state)));
      row.querySelectorAll('input,select,button').forEach(input=>input.disabled=this._busy||!available);
      row.querySelectorAll('[data-draft-output]').forEach(output=>{
        const key=output.dataset.draftOutput,input=row.querySelector(`[data-draft-control="${key}"]`);
        output.textContent=input.value+(key==='kelvin'?' K':['brightness','white','coldWhite','warmWhite','saturation'].includes(key)?'%':key==='hue'?'°':'');
      });
    });
    const ids=[...this._selected],on=ids.filter(id=>this._sceneDrafts[id]?.state==='on').length,off=ids.length-on;
    const ready=this._sceneSelectionReady();
    root.querySelector('#selectionSummary').textContent=ids.length?`${ids.length} ${ids.length===1?'luce selezionata':'luci selezionate'} · ${sceneCounts(on,off)}`:'Nessuna luce selezionata';
    const hint=root.querySelector('#selectionHint');
    hint.textContent=ids.length&&!ready?'Rimuovi le luci non selezionabili, attendi che tornino raggiungibili oppure aggiorna le regolazioni con Usa stato attuale.':this._sceneStep===3?(on===0?'Questo scenario spegnerà tutte le luci selezionate quando lo avvierai.':'Le luci non selezionate resteranno invariate. Dopo il salvataggio lo troverai in I tuoi scenari: premi Avvia per applicarlo.'):'La bozza non comanda le luci. Le regolazioni scelte restano invariate durante gli aggiornamenti.';
    root.querySelector('#nextScene')?.toggleAttribute('disabled',this._busy||!ready);
    root.querySelector('#capture')?.toggleAttribute('disabled',this._busy||!ready||!this._name.trim());
    root.querySelector('#name')?.toggleAttribute('disabled',this._busy);
    root.querySelectorAll('#cancelScene,#previousScene').forEach(button=>button.disabled=this._busy);
  }
  _syncState(){
    this._syncSavedAvailability();
    if(!this._isPreset()){this._syncSceneState();return;}
    if(!this._isPreset())this.shadowRoot.querySelectorAll('[data-target]').forEach(el=>{
      const state=this._hass?.states?.[el.dataset.target];
      const available=['on','off'].includes(state?.state)&&!state?.attributes?.entity_id&&!state?.attributes?.group_entities;
      el.disabled=this._busy||!available;
      const label=el.closest('label')?.querySelector('small');
      if(label)label.textContent=available?(state.state==='on'?'Accesa':'Spenta'):'Non disponibile o gruppo';
    });
    const save=this.shadowRoot.querySelector('#capture');
    if(save)save.disabled=this._busy||!this._name.trim()||(this._isPreset()?!this._canSavePreset():this._selected.size===0);
    const hint=this.shadowRoot.querySelector('#presetHint');
    if(hint)hint.hidden=this._canSavePreset();
    if(this._isPreset())this._syncControls();
  }
  _render(){
    if(!this._isPreset()){this._renderScenes();return;}
    const preset=this._isPreset();
    const names=Object.fromEntries((this._config.entities||[]).map(e=>[e.entity_id,e.name||e.entity_id]));
    const selector=preset?'':`<div class="targets" role="group" aria-label="Luci dello scenario">${(this._config.entities||[]).map(e=>{
      const state=this._hass?.states?.[e.entity_id];
      const available=['on','off'].includes(state?.state)&&!state?.attributes?.entity_id&&!state?.attributes?.group_entities;
      return `<label><input type="checkbox" data-target="${esc(e.entity_id)}" ${this._selected.has(e.entity_id)?'checked':''} ${available&&!this._busy?'':'disabled'}><span>${esc(e.name||e.entity_id)}<small>${available?(state.state==='on'?'Accesa':'Spenta'):'Non disponibile o gruppo'}</small></span></label>`;
    }).join('')}</div>`;
    const rows=this._items.map(item=>`<div class="memory"><div><strong>${esc(item.name)}</strong><small>${esc(memoryDescription(item.states))}</small>${!preset?`<small>${esc(Object.keys(item.states).map(id=>names[id]||id).join(', '))}</small>`:''}${item.available===false?'<small>Una luce non è disponibile</small>':''}</div><div class="actions"><button data-apply="${esc(item.id)}" ${this._busy||item.available===false?'disabled':''} aria-label="Applica ${esc(item.name)}"><ha-icon icon="mdi:play"></ha-icon> Applica</button><button data-delete="${esc(item.id)}" ${this._busy?'disabled':''} aria-label="Elimina ${esc(item.name)}"><ha-icon icon="mdi:delete-outline"></ha-icon></button></div></div>`).join('');
    this.shadowRoot.innerHTML=`<style>
      :host{display:block;color:var(--primary-text-color)}ha-card{border-radius:18px;overflow:hidden}#native{min-height:64px}#native:empty{min-height:0}.content{padding:16px}h3{margin:0 0 6px;font-size:18px}.intro,small{color:var(--secondary-text-color);font-size:12px;line-height:1.5}small{display:block}.intro{margin:0 0 12px}.memory{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0;border-top:1px solid var(--divider-color)}.memory>div:first-child{min-width:0;overflow-wrap:anywhere}.actions{display:flex;gap:5px;flex-shrink:0}button,input{font:inherit}button{display:inline-flex;align-items:center;justify-content:center;gap:5px;cursor:pointer;color:var(--primary-text-color);border:1px solid var(--divider-color);border-radius:10px;background:var(--secondary-background-color);padding:9px 10px;min-height:42px}button ha-icon{--mdc-icon-size:18px}button:disabled{opacity:.45;cursor:default}.primary{background:var(--primary-color);color:var(--text-primary-color,#fff);border:0}.save{display:flex;gap:8px;margin-top:12px}.save input{width:100%;min-width:0;box-sizing:border-box;padding:10px;border:1px solid var(--divider-color);border-radius:10px;background:var(--card-background-color);color:inherit}.save button{flex-shrink:0}.targets{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:12px 0}.targets label{display:flex;align-items:center;gap:8px;padding:10px;border:1px solid var(--divider-color);border-radius:10px;overflow-wrap:anywhere}.targets input{accent-color:var(--primary-color)}.message{padding:10px;border-radius:10px;background:var(--secondary-background-color);font-size:13px;margin:10px 0}.empty{padding:14px 0;color:var(--secondary-text-color);font-size:13px}[hidden]{display:none!important}@media(max-width:460px){.targets{grid-template-columns:1fr}.save{flex-wrap:wrap}.save button{width:100%}.memory{align-items:flex-start}.actions button{padding:8px}}
      :host{--ink:#f3f4f6;--muted:#a5a7ad}ha-card.light-card{display:block;background:linear-gradient(145deg,#252629,#17181a);color:var(--ink);border:1px solid #ffffff20;border-radius:22px;box-shadow:0 8px 24px #0002;padding:14px;box-sizing:border-box}.light-head{display:flex;align-items:center;gap:10px;min-height:48px}.identity{flex:1;min-width:0}.identity strong{display:block;font-size:15px;line-height:1.3;font-weight:600;overflow-wrap:anywhere}.identity small{color:var(--muted);font-size:12px;margin-top:3px}.light-card button{color:var(--ink);background:#ffffff0c;border-color:#ffffff20}.light-card .bulb{width:40px;height:48px;padding:5px;border:0;background:transparent;flex-shrink:0}.bulb svg{width:28px;height:38px;overflow:visible}.glass{fill:var(--glow);transition:fill .2s}.base{fill:#999da5}.lit .glass{filter:drop-shadow(0 0 7px var(--glow))}.light-card .star{border:0;background:transparent;font-size:30px;min-width:44px;padding:0;color:#aaa}.light-card .star.saved,.light-card .star[aria-expanded=true]{color:#f5c34b}.light-card .power{width:46px;min-width:46px;min-height:28px;height:28px;padding:3px;border:0;border-radius:30px;background:#555961;justify-content:flex-start}.power span{width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 1px 3px #0005;transition:transform .2s}.light-card .power[aria-checked=true]{background:#168bfa}.power[aria-checked=true] span{transform:translateX(18px)}.rails{display:grid;gap:7px;margin-top:9px}.rails:empty{display:none}.rail{display:block;padding:8px 11px 5px;background:#ffffff0b;border:1px solid #ffffff06;border-radius:12px}.rail>span{display:flex;justify-content:space-between;font-size:11px;color:#c3c4c8;letter-spacing:.2px}.rail output{font-variant-numeric:tabular-nums;color:#ddd}.rail input{display:block;width:100%;height:28px;margin:0;appearance:none;-webkit-appearance:none;background:transparent;cursor:pointer}.rail input::-webkit-slider-runnable-track{height:12px;border-radius:20px;background:var(--track)}.rail input::-moz-range-track{height:12px;border-radius:20px;background:var(--track)}.rail input::-webkit-slider-thumb{appearance:none;width:21px;height:21px;margin-top:-4.5px;background:#fff;border:2px solid #fff;border-radius:50%;box-shadow:0 1px 5px #0008}.rail input::-moz-range-thumb{width:18px;height:18px;background:#fff;border:2px solid white;border-radius:50%;box-shadow:0 1px 5px #0008}.rail.brightness{--track:linear-gradient(90deg,#41434a,#f9e6ba)}.rail.hue{--track:linear-gradient(90deg,#f33,#ff0,#0f4,#0ff,#24f,#f0d,#f33)}.rail.temperature{--track:linear-gradient(90deg,#ffb34b,#fff2da,#86bfff)}.rail.white{--track:linear-gradient(90deg,#545861,#fff)}input:disabled{opacity:.4;cursor:default}button:focus-visible,input:focus-visible{outline:2px solid #69b6ff;outline-offset:3px}.light-card .content{padding:16px 0 0;margin-top:12px;border-top:1px solid #ffffff18}.light-card .intro,.light-card small,.light-card .empty{color:var(--muted)}.light-card .save input{background:#ffffff08;color:var(--ink);border-color:#ffffff25}.light-card .primary{background:#168bfa;color:white}.light-card .message{background:#ffffff10}.light-card .memory{border-color:#ffffff20}.light-card .save{flex-wrap:wrap}.light-card .save button{width:100%}

      /* CL Control premium: contained dark glass; shared across light types. */
      ha-card.light-card{background:radial-gradient(ellipse at 90% 15%,rgba(117,72,157,.38),transparent 54%),linear-gradient(135deg,#122846,#151a29 62%,#251b35);border:1px solid rgba(155,190,255,.28);border-radius:24px;padding:19px 20px;box-shadow:0 12px 28px rgba(0,0,0,.22);min-height:154px;isolation:isolate;position:relative}
      ha-card.light-card:before{content:"";position:absolute;inset:0;background:linear-gradient(120deg,rgba(40,120,229,.09),transparent 65%);pointer-events:none;border-radius:inherit}
      .light-head,.rails,.light-card .content{position:relative}
      .identity strong{font-size:18px;font-weight:700;letter-spacing:-.3px}
      .identity small{font-size:13px;color:#bac6dc}
      .light-card .bulb{width:52px;height:56px}
      .bulb svg{width:36px;height:44px}
      .lit .glass{filter:drop-shadow(0 0 12px var(--glow))}
      .light-card .star{color:#bdc6d8;font-size:29px}
      .light-card .star.saved,.light-card .star[aria-expanded=true]{color:#ffcb48;text-shadow:0 0 10px #ffcb4866}
      .light-card .power{width:54px;min-width:54px;height:31px;min-height:31px;background:#515868}
      .power span{width:25px;height:25px}
      .power[aria-checked=true] span{transform:translateX(23px)}
      .rails{gap:10px;margin-top:18px}
      .rail{padding:11px 13px 7px;background:#ffffff0b;border:1px solid #c9d7ff22;border-radius:17px}
      .rail>span{font-size:13px;color:#e3e8f4}
      .rail input{height:31px}
      .rail input::-webkit-slider-runnable-track{height:13px}
      .rail input::-moz-range-track{height:13px}
      .rail input::-webkit-slider-thumb{height:24px;width:24px;margin-top:-5.5px;background:#fff;border:3px solid #e8eaff;box-shadow:0 0 0 3px #ffffff20,0 2px 9px #0009}
      .rail input::-moz-range-thumb{height:21px;width:21px;border:3px solid #e8eaff}
      .rail.hue{--track:linear-gradient(90deg,#f33,#ffad00,#ffec12,#19db6c,#13dcfa,#3064ff,#bb37de,#f23c8f)}
      .rail.white{--track:linear-gradient(90deg,#70a9ec,#e7f4ff,#fff9f1,#ffb75a)}
      .light-card .content{background:#090f1b65;border-radius:16px;padding:12px;margin-top:16px}
      .light-card .save input{border-radius:12px}
      .light-card .save button{border-radius:12px}
      @media(max-width:520px){ha-card.light-card{padding:14px;border-radius:19px}.identity strong{font-size:15px}.light-card .bulb{width:42px;height:48px}.rails{margin-top:12px}.rail{padding:9px 10px 4px}.identity small{font-size:12px}}
      @media(prefers-reduced-motion:reduce){.glass,.power span{transition:none}}
      /* Shared Glass palette; retain the existing light controls and capabilities. */
      :host{--ink:#f5f7fc;--muted:#bdcadd}
      ha-card.light-card{border-radius:25px;border:1px solid #b2daff66;background:radial-gradient(ellipse at 22% 0%,#253e5d88,transparent 68%),radial-gradient(ellipse at 96% 80%,#542f7366,transparent 65%),linear-gradient(115deg,#18222b,#121721 60%,#211a29);box-shadow:0 9px 25px #0004,inset 0 1px 2px #e7f7ff55;padding:20px}
      ha-card.light-card:before{background:linear-gradient(90deg,#0e17231a,#12162022)}
      .light-card .identity strong{font-weight:650;font-size:18px;color:var(--ink)}
      .light-card .identity small{color:var(--muted);font-size:13px}
      .light-card button{min-height:44px;touch-action:manipulation}
      .light-card .star{min-width:44px}
      .light-card .power{height:44px;min-height:44px;align-items:center;background:#ffffff20}
      .light-card .power[aria-checked=true]{background:linear-gradient(135deg,#39adff,#9b83ff,#bd65f3);box-shadow:0 0 12px #9577ff44}
      .light-card .rail{border-color:#ffffff18;background:#ffffff08;border-radius:15px}
      .light-card .rail>span{color:var(--muted);font-size:13px;letter-spacing:0}
      .light-card .rail output{color:var(--ink)}
      .light-card .rail input{height:36px}
      .light-card .rail input::-webkit-slider-runnable-track{height:7px}
      .light-card .rail input::-moz-range-track{height:7px}
      .light-card .rail input::-webkit-slider-thumb{margin-top:-8.5px;box-shadow:0 2px 6px #0004;border:0}
      .light-card .rail input::-moz-range-thumb{border:0}
      .light-card .rail.brightness{--track:linear-gradient(90deg,#39adff,#9b83ff,#bd65f3)}
      .light-card .rail.white{--track:linear-gradient(90deg,#545861,#fff)}
      .light-card .primary{background:linear-gradient(120deg,#256ba4,#65439e);color:var(--ink)}
      @media(max-width:520px){ha-card.light-card{padding:16px;border-radius:25px}.light-card .identity strong{font-size:16px}.light-card .light-head{gap:8px}.light-card .rail{padding:9px 10px 4px}}
      /* Compact summary: lamp colour and brightness affect decoration, never text contrast. */
      ha-card.light-card{min-height:0;padding:16px;background:radial-gradient(ellipse at 10% 0%,rgba(var(--light-rgb,115,119,130),var(--light-alpha,0)),transparent 80%),linear-gradient(115deg,#18222b,#121721 70%,#211a29)}
      ha-card.light-card:before{background:none}
      ha-card.light-card:after{content:"";position:absolute;left:0;bottom:0;height:3px;width:var(--light-level,0%);background:rgb(var(--light-rgb,115,119,130));pointer-events:none}
      .light-card .glass{opacity:var(--lamp-opacity,.4)}
      .light-card .adjust{margin-top:8px;width:100%;min-height:44px;background:#ffffff08;color:var(--ink);border-color:#ffffff18}
      .light-card .power[aria-checked=true]{background:rgba(var(--light-rgb,57,173,255),.7);box-shadow:0 0 12px rgba(var(--light-rgb,57,173,255),var(--light-alpha,0))}
    :host{--primary-text-color:#f5f7fc;--secondary-text-color:#bdcadd;--primary-color:#356a9c;--card-background-color:#18222b;--secondary-background-color:#ffffff08;--divider-color:#ffffff20}ha-card:not(.light-card){display:block;border:1px solid #b2daff55;border-radius:25px;background:radial-gradient(ellipse at 0% 0%,#29496a66,transparent 75%),linear-gradient(115deg,#18222b,#121721 60%,#211c30);box-shadow:0 9px 25px #0004,inset 0 1px 2px #e7f7ff33}</style><ha-card class="${preset?'light-card':''}">${preset?this._controlsHTML():''}${preset&&this._error&&!this._expanded?`<div class="message" role="alert">${esc(this._error)}</div>`:''}<div class="content" id="presetPanel" ${preset&&!this._expanded?'hidden':''}>${preset?'':'<h3>Scenari luci</h3>'}<p class="intro">${preset?'Salva luminosità e colore attuali nei tuoi preferiti.':'Seleziona le luci e fotografa il loro stato attuale. Il salvataggio non aziona le luci.'} Salvati per il tuo utente, anche dopo un riavvio.</p>${this._error?`<div class="message" role="alert">${esc(this._error)}</div>`:''}${this._notice?`<div class="message" role="status">${esc(this._notice)}</div>`:''}${selector}<div class="save"><input id="name" aria-label="Nome ${preset?'preferito':'scenario'}" maxlength="64" placeholder="${preset?'Es. Lettura calda':'Es. Serata in casa'}" value="${esc(this._name)}" ${this._busy?'disabled':''}><button id="capture" class="primary" disabled><ha-icon icon="mdi:camera-outline"></ha-icon> ${preset?'Salva preferito':'Fotografa e salva'}</button></div>${preset?'<p id="presetHint" class="intro">Accendi e regola la luce per salvare un preferito dimmer o colore.</p>':''}<div>${this._loading?'<div class="empty">Caricamento…</div>':rows||`<div class="empty">Nessun ${preset?'preferito':'scenario'} salvato.</div>`}</div><button id="refresh" ${this._busy?'disabled':''}>Aggiorna elenco</button></div></ha-card>`;
    this.shadowRoot.querySelector('#name')?.addEventListener('input',e=>{this._name=e.target.value;this._syncState();});
    this.shadowRoot.querySelector('#capture')?.addEventListener('click',()=>this._capture());
    this.shadowRoot.querySelector('#moreInfo')?.addEventListener('click',()=>this._moreInfo());
    this.shadowRoot.querySelector('#refresh')?.addEventListener('click',()=>this._load());
    this.shadowRoot.querySelectorAll('[data-target]').forEach(el=>el.onchange=()=>{el.checked?this._selected.add(el.dataset.target):this._selected.delete(el.dataset.target);this._syncState();});
    this.shadowRoot.querySelectorAll('[data-apply]').forEach(el=>el.onclick=()=>{
      const item=this._items.find(i=>i.id===el.dataset.apply);
      if(item&&(preset||window.confirm(`Applicare “${item.name}” a ${Object.keys(item.states).length} luci?`)))this._action('apply',{item_id:item.id});
    });
    this.shadowRoot.querySelectorAll('[data-delete]').forEach(el=>el.onclick=()=>{
      const item=this._items.find(i=>i.id===el.dataset.delete);
      if(item&&window.confirm(`Eliminare “${item.name}”?`))this._action('delete',{item_id:item.id});
    });
    this.shadowRoot.querySelector('#favorites')?.addEventListener('click',()=>{this._expanded=!this._expanded;this._render();this.shadowRoot.querySelector('#favorites')?.focus();});
    this.shadowRoot.querySelector('#adjust')?.addEventListener('click',()=>{this._detailsExpanded=!this._detailsExpanded;this._render();this.shadowRoot.querySelector('#adjust')?.focus();});
    this.shadowRoot.querySelector('#power')?.addEventListener('click',()=>this._control(this._lightModel().on?'turn_off':'turn_on'));
    this.shadowRoot.querySelectorAll('[data-control]').forEach(el=>{
      el.addEventListener('input',()=>{const out=this.shadowRoot.querySelector(`[data-value="${el.dataset.control}"]`);if(out)out.textContent=el.value+(el.dataset.control==='temp'?' K':el.dataset.control==='hue'?'°':'%');});
      el.addEventListener('change',()=>this._setLight(el.dataset.control,Number(el.value)));
    });
    this._syncState();
  }
}
if(!customElements.get('cl-control-light-memories-card'))customElements.define('cl-control-light-memories-card',CLLightMemoriesCard);

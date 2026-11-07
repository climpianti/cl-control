const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const DIM = new Set(['brightness','rgb','rgbw','rgbww','hs','xy','color_temp','white']);
function hueRGB(h){const c=x=>Math.round(255*Math.max(0,Math.min(1,Math.abs(((h/60+x)%6)-3)-1)));return [c(0),c(4),c(2)];}
function rgbHue(rgb){const [r,g,b]=rgb.map(v=>v/255), max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;if(!d)return 0;return ((max===r?(g-b)/d:max===g?(b-r)/d+2:(r-g)/d+4)*60+360)%360;}
const CHANGED = 'cl-control-light-memories-changed';

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
    this._refresh=()=>this._load();
  }
  setConfig(config) { this._config={...config}; this._render(); }
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
    if(changedUser){this._items=[];this._name='';this._selected.clear();}
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
      if(operation==='capture')this._name='';
      window.dispatchEvent(new Event(CHANGED));
    }catch(e){this._error=e?.message||'Operazione non completata. Verifica lo stato prima di riprovare.';}
    finally{this._busy=false;this._render();}
  }
  _capture(){
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
  _syncState(){
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

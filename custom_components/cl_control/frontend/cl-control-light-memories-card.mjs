const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const DIM = new Set(['brightness','rgb','rgbw','rgbww','hs','xy','color_temp','white']);
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
  getCardSize(){return this._config.entity?4:8;}
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
  async _mountNative(){
    if(!this._isPreset()||!this._hass)return;
    const state=this._hass.states[this._config.entity];
    const config=lightTileConfig(this._config.entity,this._config.name,state);
    const key=JSON.stringify(config);
    if(key!==this._nativeKey){
      this._nativeKey=key;
      try{
        const helpers=await window.loadCardHelpers();
        if(this._nativeKey!==key)return;
        this._native=helpers.createCardElement(config);
      }catch(_){
        this._nativeKey='';
        const host=this.shadowRoot.querySelector('#native');
        if(host)host.textContent='Apri i controlli della luce con il pulsante Regola luce.';
        return;
      }
    }
    if(this._native){this._native.hass=this._hass;this.shadowRoot.querySelector('#native')?.replaceChildren(this._native);}
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
    if(this._isPreset())this._mountNative();
  }
  _render(){
    const preset=this._isPreset();
    const modes=this._hass?.states?.[this._config.entity]?.attributes?.supported_color_modes;
    if(preset&&Array.isArray(modes)&&!modes.some(m=>DIM.has(m))){
      this.shadowRoot.innerHTML='<div id="native"></div>';
      this._mountNative();return;
    }
    const names=Object.fromEntries((this._config.entities||[]).map(e=>[e.entity_id,e.name||e.entity_id]));
    const selector=preset?'':`<div class="targets" role="group" aria-label="Luci dello scenario">${(this._config.entities||[]).map(e=>{
      const state=this._hass?.states?.[e.entity_id];
      const available=['on','off'].includes(state?.state)&&!state?.attributes?.entity_id&&!state?.attributes?.group_entities;
      return `<label><input type="checkbox" data-target="${esc(e.entity_id)}" ${this._selected.has(e.entity_id)?'checked':''} ${available&&!this._busy?'':'disabled'}><span>${esc(e.name||e.entity_id)}<small>${available?(state.state==='on'?'Accesa':'Spenta'):'Non disponibile o gruppo'}</small></span></label>`;
    }).join('')}</div>`;
    const rows=this._items.map(item=>`<div class="memory"><div><strong>${esc(item.name)}</strong><small>${esc(memoryDescription(item.states))}</small>${!preset?`<small>${esc(Object.keys(item.states).map(id=>names[id]||id).join(', '))}</small>`:''}${item.available===false?'<small>Una luce non è disponibile</small>':''}</div><div class="actions"><button data-apply="${esc(item.id)}" ${this._busy||item.available===false?'disabled':''} aria-label="Applica ${esc(item.name)}"><ha-icon icon="mdi:play"></ha-icon> Applica</button><button data-delete="${esc(item.id)}" ${this._busy?'disabled':''} aria-label="Elimina ${esc(item.name)}"><ha-icon icon="mdi:delete-outline"></ha-icon></button></div></div>`).join('');
    this.shadowRoot.innerHTML=`<style>
      :host{display:block;color:var(--primary-text-color)}ha-card{border-radius:18px;overflow:hidden}#native{min-height:64px}#native:empty{min-height:0}.content{padding:16px}h3{margin:0 0 6px;font-size:18px}.intro,small{color:var(--secondary-text-color);font-size:12px;line-height:1.5}small{display:block}.intro{margin:0 0 12px}.memory{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0;border-top:1px solid var(--divider-color)}.memory>div:first-child{min-width:0;overflow-wrap:anywhere}.actions{display:flex;gap:5px;flex-shrink:0}button,input{font:inherit}button{display:inline-flex;align-items:center;justify-content:center;gap:5px;cursor:pointer;color:var(--primary-text-color);border:1px solid var(--divider-color);border-radius:10px;background:var(--secondary-background-color);padding:9px 10px;min-height:42px}button ha-icon{--mdc-icon-size:18px}button:disabled{opacity:.45;cursor:default}.primary{background:var(--primary-color);color:var(--text-primary-color,#fff);border:0}.save{display:flex;gap:8px;margin-top:12px}.save input{width:100%;min-width:0;box-sizing:border-box;padding:10px;border:1px solid var(--divider-color);border-radius:10px;background:var(--card-background-color);color:inherit}.save button{flex-shrink:0}.targets{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:12px 0}.targets label{display:flex;align-items:center;gap:8px;padding:10px;border:1px solid var(--divider-color);border-radius:10px;overflow-wrap:anywhere}.targets input{accent-color:var(--primary-color)}.message{padding:10px;border-radius:10px;background:var(--secondary-background-color);font-size:13px;margin:10px 0}.empty{padding:14px 0;color:var(--secondary-text-color);font-size:13px}[hidden]{display:none!important}@media(max-width:460px){.targets{grid-template-columns:1fr}.save{flex-wrap:wrap}.save button{width:100%}.memory{align-items:flex-start}.actions button{padding:8px}}
    </style><ha-card>${preset?'<div id="native"></div>':''}<div class="content">${preset?'<button id="moreInfo"><ha-icon icon="mdi:palette"></ha-icon> Regola luce</button>':'<h3>Scenari luci</h3>'}<p class="intro">${preset?'Salva luminosità e colore attuali nei tuoi preferiti.':'Seleziona le luci e fotografa il loro stato attuale. Il salvataggio non aziona le luci.'} Salvati per il tuo utente, anche dopo un riavvio.</p>${this._error?`<div class="message" role="alert">${esc(this._error)}</div>`:''}${this._notice?`<div class="message" role="status">${esc(this._notice)}</div>`:''}${selector}<div class="save"><input id="name" aria-label="Nome ${preset?'preferito':'scenario'}" maxlength="64" placeholder="${preset?'Es. Lettura calda':'Es. Serata in casa'}" value="${esc(this._name)}" ${this._busy?'disabled':''}><button id="capture" class="primary" disabled><ha-icon icon="mdi:camera-outline"></ha-icon> ${preset?'Salva preferito':'Fotografa e salva'}</button></div>${preset?'<p id="presetHint" class="intro">Accendi e regola la luce per salvare un preferito dimmer o colore.</p>':''}<div>${this._loading?'<div class="empty">Caricamento…</div>':rows||`<div class="empty">Nessun ${preset?'preferito':'scenario'} salvato.</div>`}</div><button id="refresh" ${this._busy?'disabled':''}>Aggiorna elenco</button></div></ha-card>`;
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
    this._syncState();
  }
}
if(!customElements.get('cl-control-light-memories-card'))customElements.define('cl-control-light-memories-card',CLLightMemoriesCard);

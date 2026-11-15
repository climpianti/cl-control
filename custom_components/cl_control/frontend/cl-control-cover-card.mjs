// Glass cover card. Adjusting a draft never moves the cover; Apply dispatches it.
const FEATURES={open_cover:1,close_cover:2,set_cover_position:4,stop_cover:8,open_cover_tilt:16,close_cover_tilt:32,stop_cover_tilt:64,set_cover_tilt_position:128};
const position=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=100?Math.round(v):null;
export class CLControlCoverCard extends HTMLElement {
  constructor(){super();this.attachShadow({mode:'open'});this._config={};this._draft={};this._expanded=false;this._pending=0;}
  setConfig(config){if(!config.entity?.startsWith('cover.'))throw Error('Entità cover richiesta');if(config.entity!==this._config.entity)this._draft={};this._config={...config};this._render();}
  set hass(value){this._hass=value;this._sync();}
  getCardSize(){return this._expanded?5:2;}
  getGridOptions(){return {columns:12,rows:'auto',min_columns:6};}
  _state(){return this._hass?.states?.[this._config.entity];}
  _available(){return ['open','closed','opening','closing'].includes(this._state()?.state);}
  _has(action){return !!(Number(this._state()?.attributes?.supported_features||0)&FEATURES[action]);}
  _render(){
    this.shadowRoot.innerHTML=`<style>
      :host{display:block;min-width:0;color:#f5f7fc}*{box-sizing:border-box}
      ha-card{display:block;padding:16px;border-radius:25px;border:1px solid #b2daff66;background:radial-gradient(ellipse at 22% 0%,#253e5d88,transparent 68%),radial-gradient(ellipse at 96% 80%,#542f7366,transparent 65%),linear-gradient(115deg,#18222b,#121721 60%,#211a29);box-shadow:0 9px 25px #0004,inset 0 1px 2px #e7f7ff55;color:inherit}
      .head{display:flex;align-items:center;gap:12px;width:100%;text-align:left;background:transparent;border:0;padding:0}.head ha-icon{flex:none}.head .identity{display:block}.identity{flex:1;min-width:0}strong{display:block;overflow-wrap:anywhere;font-size:16px}small{display:block;color:#bdcadd;margin-top:5px;font-size:13px}
      button,input{font:inherit}button{color:inherit;border:1px solid #ffffff18;background:#ffffff0c;border-radius:12px;min-width:44px;min-height:44px;cursor:pointer;padding:8px;touch-action:manipulation}button:disabled,input:disabled{opacity:.4;cursor:default}button:focus-visible,input:focus-visible{outline:2px solid #67c5ff;outline-offset:3px}ha-icon{--mdc-icon-size:25px}.info{background:transparent;border:0;flex:none}
      .meter{height:4px;background:#ffffff18;border-radius:4px;margin-top:14px;overflow:hidden}.meter span{display:block;height:100%;background:linear-gradient(90deg,#39adff,#9b83ff,#bd65f3)}
      .summary{display:flex;gap:8px;margin-top:12px}.summary button{flex:1}.stop{border-color:#9b83ff80;font-weight:650}
      .details{border-top:1px solid #ffffff18;margin-top:14px;padding-top:14px}.actions{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}.actions button{flex:1}label{display:block;color:#bdcadd;font-size:13px}output{color:#f5f7fc;font-variant-numeric:tabular-nums}.slider{display:flex;align-items:center;gap:10px;margin:6px 0}.slider input{min-width:0;flex:1;accent-color:#9b83ff;height:36px}.apply{width:100%;background:linear-gradient(120deg,#256ba4,#65439e);margin-bottom:12px}.note{font-size:12px;color:#bdcadd;line-height:1.5;margin:0 0 12px}.error{color:#ffd0d8;font-size:13px}[hidden]{display:none!important}
      .aperture-icon{width:52px;height:52px;flex:none;filter:drop-shadow(0 0 8px #7777ff33)}.aperture-icon svg{width:100%;height:100%}
      .head:disabled{opacity:1;cursor:default}
      [data-section="position"]{margin-top:8px}[data-section="position"] label{text-align:right;font-size:12px}
      .slider{gap:8px;margin:2px 0}.slider input{appearance:none;-webkit-appearance:none;height:36px;background:transparent;accent-color:#9b83ff}
      .slider input::-webkit-slider-runnable-track{height:7px;border-radius:7px;background:linear-gradient(90deg,#39adff,#bd65f3 var(--fill,0%),#ffffff24 var(--fill,0%))}
      .slider input::-webkit-slider-thumb{appearance:none;width:20px;height:20px;border-radius:50%;background:#fff;margin-top:-6.5px;box-shadow:0 2px 6px #0005}
      .slider input::-moz-range-track{height:7px;border-radius:7px;background:#ffffff24}.slider input::-moz-range-progress{background:#9b83ff;height:7px}.slider input::-moz-range-thumb{border:0;background:#fff;width:20px;height:20px;border-radius:50%}
      .draft-actions{display:flex;gap:8px;margin-top:8px}.draft-actions .apply{flex:1;margin:0}
      .aperture-icon{color:#77d1ff}.aperture-icon .motion{display:none;transform-origin:28px 28px}
      .aperture-icon[data-state="closed"]{filter:none;color:#bdcadd}
      .aperture-icon[data-state="opening"] .motion,.aperture-icon[data-state="closing"] .motion{display:block;animation:cover-signal 1s ease-in-out infinite}
      .aperture-icon[data-state="opening"]{color:#b88aff;filter:drop-shadow(0 0 8px #b88aff66)}
      .aperture-icon[data-state="closing"]{color:#ffd08a;filter:drop-shadow(0 0 8px #ffd08a44)}
      .aperture-icon[data-state="closing"] .motion{transform:rotate(180deg)}
      .aperture-icon[data-position-known="false"] g[clip-path]{opacity:.25}
      .aperture-icon[data-position-known="false"] rect[stroke="url(#frame)"]{stroke-dasharray:3 3}
      @keyframes cover-signal{50%{opacity:.45}}
      @media(prefers-reduced-motion:reduce){.aperture-icon .motion{animation:none!important}}
    </style><ha-card>
      <button class="head" id="adjust" aria-label="Regola apertura" aria-controls="details" aria-expanded="false"><span class="aperture-icon" aria-hidden="true"><svg viewBox="0 0 56 56"><defs><linearGradient id="frame" x2="1" y2="1"><stop stop-color="#77d1ff"/><stop offset="1" stop-color="#b88aff"/></linearGradient><clipPath id="slats"><rect id="slatsClip" x="14" y="12" width="28" height="32"/></clipPath></defs><rect x="6" y="5" width="44" height="46" rx="12" fill="#ffffff08" stroke="#b2daff55"/><rect x="12" y="10" width="32" height="36" rx="3" fill="#0b1421" stroke="url(#frame)" stroke-width="2"/><g clip-path="url(#slats)" stroke="url(#frame)" stroke-width="3"><path d="M14 14h28m-28 5h28m-28 5h28m-28 5h28m-28 5h28m-28 5h28m-28 5h28"/></g><g class="motion"><circle cx="28" cy="28" r="10" fill="#101a29ee"/><path d="M28 34V22m-5 5 5-5 5 5" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></g><path d="M9 48h38" stroke="#b5caff" stroke-width="2" stroke-linecap="round"/></svg></span><span class="identity"><strong></strong><small id="state"></small></span><span id="chevron" aria-hidden="true">▾</span></button>
      <div class="meter" aria-hidden="true"><span></span></div>
        <div data-section="position"><label for="position"><output data-output="position">—</output></label><div class="slider"><button data-step="position" data-delta="-5" aria-label="Riduci apertura">−</button><input id="position" type="range" min="0" max="100" step="1" aria-label="Apertura desiderata"><button data-step="position" data-delta="5" aria-label="Aumenta apertura">+</button></div><div id="draftActions" class="draft-actions" hidden><button class="apply" data-apply="position">Applica apertura</button><button id="cancelPosition">Annulla</button></div></div>
      <div class="summary"><button data-action="open_cover">Apri</button><button class="stop" data-action="stop_cover">Stop</button><button data-action="close_cover">Chiudi</button></div>
      <div id="details" class="details" hidden>

        <div data-section="tilt"><div class="actions"><button data-action="open_cover_tilt">Apri lamelle</button><button data-action="stop_cover_tilt">Stop lamelle</button><button data-action="close_cover_tilt">Chiudi lamelle</button></div><div data-tilt-position><label for="tilt">Inclinazione desiderata · <output data-output="tilt">—</output></label><div class="slider"><button data-step="tilt" data-delta="-5" aria-label="Riduci inclinazione">−</button><input id="tilt" type="range" min="0" max="100" step="1" aria-label="Inclinazione desiderata"><button data-step="tilt" data-delta="5" aria-label="Aumenta inclinazione">+</button></div><button class="apply" data-apply="tilt">Applica inclinazione</button></div></div>

      </div><p class="note" id="missing" hidden>Posizione attuale non disponibile. Seleziona esplicitamente il valore desiderato prima di applicare.</p><p class="error" role="status" hidden></p>
    </ha-card>`;
    const q=s=>this.shadowRoot.querySelector(s);
    q('#cancelPosition').onclick=()=>{delete this._draft.position;this._sync();};
    const toggle=()=>{this._expanded=!this._expanded;this._sync();};
    q('#adjust').onclick=toggle;
    q('ha-card').onclick=e=>{if(!e.target.closest('button,input,label,.details'))toggle();};
    this.shadowRoot.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>this._send(b.dataset.action));
    for(const kind of ['position','tilt']){
      q('#'+kind).oninput=e=>{this._draft[kind]=Number(e.target.value);this._sync();};
      q(`[data-apply="${kind}"]`).onclick=()=>this._send(kind==='position'?'set_cover_position':'set_cover_tilt_position',{[kind==='position'?'position':'tilt_position']:this._draft[kind]??this._current(kind)});
    }
    this.shadowRoot.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>{const kind=b.dataset.step;this._draft[kind]=Math.max(0,Math.min(100,(this._draft[kind]??this._current(kind)??50)+Number(b.dataset.delta)));this._sync();});
    this._sync();
  }
  _current(kind){return position(this._state()?.attributes?.[kind==='position'?'current_position':'current_tilt_position']);}
  _sync(){
    if(!this.shadowRoot.querySelector('ha-card'))return;
    const q=s=>this.shadowRoot.querySelector(s),s=this._state(),available=this._available(),current=this._current('position');
    q('strong').textContent=this._config.name||s?.attributes?.friendly_name||this._config.entity;
    q('#slatsClip').setAttribute('height',String(current===null?32:32*(1-current/100)));
    const picture=q('.aperture-icon');picture.dataset.state=s?.state||'unknown';picture.dataset.positionKnown=String(current!==null);picture.style.opacity=available?'1':'.45';
    const names={open:'Aperta',closed:'Chiusa',opening:'In apertura',closing:'In chiusura'};
    q('#state').textContent=(names[s?.state]||'Non disponibile')+(current===null?' · Posizione non disponibile':` · ${current}%`);
    q('.meter span').style.width=current===null?'0%':`${current}%`;
    q('#details').hidden=!this._expanded;q('#chevron').textContent=this._expanded?'▴':'▾';q('#adjust').setAttribute('aria-label',this._expanded?'Chiudi regolazioni apertura':'Regola apertura');q('#adjust').setAttribute('aria-expanded',String(this._expanded));
    this.shadowRoot.querySelectorAll('[data-action]').forEach(b=>{b.hidden=!this._has(b.dataset.action);b.disabled=!available||(!b.dataset.action.startsWith('stop_')&&this._pending>0);});
    q('[data-section="position"]').hidden=!this._has('set_cover_position');q('.meter').hidden=this._has('set_cover_position');q('#draftActions').hidden=this._draft.position===undefined;
    const tiltAvailable=['open_cover_tilt','close_cover_tilt','stop_cover_tilt','set_cover_tilt_position'].some(a=>this._has(a));q('#details').hidden=!this._expanded||!tiltAvailable;q('#chevron').hidden=!tiltAvailable;q('#adjust').disabled=!tiltAvailable;
    q('[data-section="tilt"]').hidden=!['open_cover_tilt','close_cover_tilt','stop_cover_tilt','set_cover_tilt_position'].some(a=>this._has(a));
    q('[data-tilt-position]').hidden=!this._has('set_cover_tilt_position');
    for(const kind of ['position','tilt']){
      const value=this._draft[kind]??this._current(kind),input=q('#'+kind);
      if(this.shadowRoot.activeElement!==input)input.value=value??50;
      input.disabled=!available||this._pending>0;
      q(`[data-output="${kind}"]`).textContent=value===null?'Non impostata':`${kind==='position'&&this._draft.position!==undefined?'Scelta: ':''}${value}%`;
      if(kind==='position')input.style.setProperty('--fill',`${value??0}%`);
      q(`[data-apply="${kind}"]`).disabled=!available||this._pending>0||value===null;
      this.shadowRoot.querySelectorAll(`[data-step="${kind}"]`).forEach(b=>b.disabled=!available||this._pending>0);
    }
    q('#missing').hidden=!(this._has('set_cover_position')&&current===null||this._expanded&&this._has('set_cover_tilt_position')&&this._current('tilt')===null);
  }
  async _send(action,data={}){
    if(!this._available()||!this._has(action)||(this._pending&&!action.startsWith('stop_')))return;
    if(action==='set_cover_position'&&position(data.position)===null||action==='set_cover_tilt_position'&&position(data.tilt_position)===null)return;
    const error=this.shadowRoot.querySelector('.error');error.hidden=true;this._pending++;this._sync();
    try{await this._hass.callService('cover',action,data,{entity_id:this._config.entity});if(action==='set_cover_position')delete this._draft.position;if(action==='set_cover_tilt_position')delete this._draft.tilt;}
    catch(e){error.textContent='Comando non riuscito. Verifica la connessione dell’apertura.';error.hidden=false;}
    finally{this._pending--;this._sync();}
  }
}
if(!customElements.get('cl-control-cover-card'))customElements.define('cl-control-cover-card',CLControlCoverCard);

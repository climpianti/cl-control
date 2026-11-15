// Compact Glass summary; native HA thermostat owns all climate commands.
const finite=value=>typeof value==='number'&&Number.isFinite(value)?value:null;
// Feature flags are Home Assistant ClimateEntityFeature values. Let HA own
// options, limits, units, unavailable handling and service calls.
function climateFeatures(attributes={}){
  const features=[],supported=attributes.supported_features||0;
  if(Array.isArray(attributes.hvac_modes)&&attributes.hvac_modes.length)features.push({type:'climate-hvac-modes',style:'dropdown'});
  for(const [flag,attribute,type] of [[8,'fan_modes','climate-fan-modes'],[16,'preset_modes','climate-preset-modes'],[32,'swing_modes','climate-swing-modes'],[512,'swing_horizontal_modes','climate-swing-horizontal-modes']]){
    if((supported&flag)&&Array.isArray(attributes[attribute])&&attributes[attribute].length)features.push({type,style:'dropdown'});
  }
  if(supported&4)features.push({type:'target-humidity'});
  return features;
}
export class CLControlClimateCard extends HTMLElement {
  constructor(){super();this.attachShadow({mode:'open'});this._config={};this._expanded=false;this._generation=0;}
  setConfig(config){if(!config.entity?.startsWith('climate.'))throw Error('Entità climate richiesta');this._config={...config};this._expanded=false;this._native=null;this._loading=false;this._generation++;this._render();}
  set hass(value){this._hass=value;if(this._native){this._syncNativeConfig();this._native.hass=value;}this._sync();}
  getCardSize(){return this._expanded?6:2;}
  getGridOptions(){return {columns:12,rows:'auto',min_columns:6};}
  _render(){
    this.shadowRoot.innerHTML=`<style>
      :host{display:block;min-width:0;color:#f5f7fc;--primary-text-color:#f5f7fc;--secondary-text-color:#bdcadd;--card-background-color:#18222b;--ha-card-background:#18222b;--primary-color:#9b83ff;--divider-color:#ffffff20}
      *{box-sizing:border-box}ha-card{display:block;padding:16px;border-radius:25px;border:1px solid var(--climate-border,#b2daff66);background:radial-gradient(ellipse at 10% 0%,var(--climate-glow,#253e5d88),transparent 75%),radial-gradient(ellipse at 96% 80%,var(--climate-glow-secondary,#38465833),transparent 65%),linear-gradient(115deg,#18222b,#121721 60%,#19202b);box-shadow:0 9px 25px #0004,inset 0 1px 2px #e7f7ff55;color:inherit}
      button{font:inherit;cursor:pointer;min-height:44px;border:1px solid #ffffff18;border-radius:12px;background:#ffffff08;color:inherit;padding:10px}button:focus-visible{outline:2px solid #67c5ff;outline-offset:3px}.head{display:flex;align-items:center;gap:14px;width:100%;border:0;background:transparent;padding:0;text-align:left}.copy{flex:1;min-width:0}.copy strong{display:block;font-size:16px;overflow-wrap:anywhere}.state,.target{display:block;font-size:13px;color:#bdcadd;line-height:1.5;margin-top:5px}
      .thermometer{width:50px;height:60px;flex:none;color:var(--climate-accent,#b1b9dc)}svg{width:100%;height:100%}.reading{display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin-top:14px}.temperature{font-size:30px;letter-spacing:-1px}.caption{color:#bdcadd;font-size:12px}.details{margin-top:14px;padding-top:14px;border-top:1px solid #ffffff18}#native{min-width:0}.error{font-size:13px;color:#ffd0d8}.more{width:100%;margin-top:10px}[hidden]{display:none!important}
    </style><ha-card><button class="head" id="expand" aria-expanded="false" aria-controls="details" aria-label="Regolazioni clima"><span class="thermometer" aria-hidden="true"><svg viewBox="0 0 50 60"><rect x="5" y="3" width="40" height="54" rx="13" fill="#ffffff08" stroke="#b2daff55"/><path d="M20 32V15a5 5 0 0 1 10 0v17a10 10 0 1 1-10 0" fill="#ffffff08" stroke="currentColor" stroke-width="2"/><path d="M25 19v20" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><circle cx="25" cy="41" r="5" fill="currentColor"/></svg></span><span class="copy"><strong></strong><span class="state"></span></span><span id="chevron" aria-hidden="true">▾</span></button><div class="reading"><span><span class="caption">Temperatura attuale</span><br><span class="temperature">—</span></span><span class="target"></span></div><div id="details" class="details" hidden><div id="native"></div><p class="error" role="status" hidden></p><button class="more">Dettagli dispositivo</button></div></ha-card>`;
    this.shadowRoot.querySelector('#expand').onclick=()=>{this._expanded=!this._expanded;this._sync();if(this._expanded)this._mountNative();};
    this.shadowRoot.querySelector('.more').onclick=()=>this.dispatchEvent(new CustomEvent('hass-more-info',{detail:{entityId:this._config.entity},bubbles:true,composed:true}));
    const humidity=document.createElement('div');humidity.className='humidity caption';humidity.hidden=true;this.shadowRoot.querySelector('.reading').after(humidity);
    this._sync();
  }
  _sync(){
    const q=selector=>this.shadowRoot.querySelector(selector);if(!q('ha-card'))return;
    const state=this._hass?.states?.[this._config.entity],a=state?.attributes||{},available=!!state&&!['unknown','unavailable'].includes(state.state);
    const unit=this._hass?.config?.unit_system?.temperature||a.temperature_unit||'°C';
    const format=value=>finite(value)===null?'—':`${new Intl.NumberFormat('it-IT',{maximumFractionDigits:1}).format(value)} ${unit}`;
    const modes={off:'Spento',heat:'Riscaldamento',cool:'Raffrescamento',heat_cool:'Automatico caldo/freddo',auto:'Automatico',dry:'Deumidificazione',fan_only:'Ventilazione'};
    const actions={heating:'Riscaldamento in corso',cooling:'Raffrescamento in corso',idle:'In attesa',off:'Spento',drying:'Deumidificazione in corso',fan:'Ventilazione',preheating:'Preriscaldamento'};
    q('strong').textContent=this._config.name||a.friendly_name||this._config.entity;
    q('.state').textContent=!available?'Non disponibile':state.state==='off'?'Spento':actions[a.hvac_action]||modes[state.state]||state.state;
    q('.temperature').textContent=available?format(a.current_temperature):'—';
    const target=finite(a.temperature)!==null?format(a.temperature):finite(a.target_temp_low)!==null&&finite(a.target_temp_high)!==null?`${format(a.target_temp_low)} – ${format(a.target_temp_high)}`:'—';
    q('.target').textContent=`Impostata: ${available?target:'—'}`;
    const currentHumidity=finite(a.current_humidity),targetHumidity=finite(a.humidity);
    const validHumidity=value=>value!==null&&value>=0&&value<=100;
    const humidity=[];
    if(validHumidity(currentHumidity))humidity.push(`Umidità: ${currentHumidity}%`);
    if((a.supported_features&4)&&validHumidity(targetHumidity))humidity.push(`Obiettivo: ${targetHumidity}%`);
    q('.humidity').textContent=humidity.join(' · ');q('.humidity').hidden=!available||!humidity.length;
    const heating=available&&state.state!=='off'&&a.hvac_action==='heating',cooling=available&&state.state!=='off'&&a.hvac_action==='cooling';
    const activity=!available?'unavailable':state.state==='off'?'off':heating?'heating':cooling?'cooling':'idle';
    const palette=heating?['#ffd08a','#cf681c77','#b3422e44','#ffc07988']:cooling?['#77d1ff','#197abb88','#20aebc44','#77d1ff88']:['#b8c1ce','#3d4a5b44','#38465822','#abbad044'];
    const surface=q('ha-card');surface.dataset.activity=activity;
    ['--climate-accent','--climate-glow','--climate-glow-secondary','--climate-border'].forEach((key,index)=>surface.style.setProperty(key,palette[index]));
    q('#details').hidden=!this._expanded;q('#expand').setAttribute('aria-expanded',String(this._expanded));q('#chevron').textContent=this._expanded?'▴':'▾';
  }
  _nativeConfig(){return {type:'thermostat',entity:this._config.entity,name:this._config.name,features:climateFeatures(this._hass?.states?.[this._config.entity]?.attributes)};}
  _syncNativeConfig(){
    const config=this._nativeConfig(),key=JSON.stringify(config);
    // Ordinary realtime changes must not reset active native controls.
    if(key!==this._nativeConfigKey){this._native.setConfig(config);this._nativeConfigKey=key;}
  }
  async _mountNative(){
    if(this._native||this._loading)return;this._loading=true;const generation=this._generation;
    const error=this.shadowRoot.querySelector('.error');error.hidden=true;
    try{const helpers=await window.loadCardHelpers();if(generation!==this._generation)return;const config=this._nativeConfig(),card=helpers.createCardElement(config);card.hass=this._hass;this.shadowRoot.querySelector('#native').replaceChildren(card);this._native=card;this._nativeConfigKey=JSON.stringify(config);}
    catch(e){if(generation===this._generation){error.textContent='Regolazioni non disponibili. Apri i dettagli del dispositivo.';error.hidden=false;}}
    finally{if(generation===this._generation)this._loading=false;}
  }
}
if(!customElements.get('cl-control-climate-glass-card'))customElements.define('cl-control-climate-glass-card',CLControlClimateCard);

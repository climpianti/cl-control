// Home navigation and native-card surfaces. No device commands live here.
const HOME_GLASS=`
 :host{display:block;min-width:0;--primary-text-color:#f5f7fc;--secondary-text-color:#bdcadd;--primary-color:#78c5ff;--card-background-color:#18222b;--ha-card-background:linear-gradient(115deg,#18222b,#121721 60%,#211c30);--ha-card-border-radius:25px;--ha-card-border-color:#b2daff55;--ha-card-box-shadow:0 9px 25px #0004,inset 0 1px 2px #e7f7ff33;color:#f5f7fc}
 *{box-sizing:border-box}button{font:inherit;color:inherit}button:focus-visible{outline:2px solid #78c5ff;outline-offset:3px}
`;

export function systemPresentation(module,ids,hass){
 const states=ids.map(id=>hass?.states?.[id]);
 const valid=states.filter(s=>s&&!['unknown','unavailable',''].includes(s.state));
 const missing=states.length-valid.length;
 const result={tone:'neutral',motion:'none',text:'Apri sezione',position:0,brightness:0};
 if(!ids.length)return result;
 // Keep navigation and the original icon without inventing an inactive state.
 if(!valid.length)return {...result,text:''};
 const count=predicate=>valid.filter(predicate).length;
 if(module==='lights'){
  const on=valid.filter(s=>s.state==='on');result.text=on.length?`${on.length} ${on.length===1?'luce accesa':'luci accese'}`:'Tutte spente';
  if(on.length){result.tone='warm';result.brightness=on.reduce((sum,s)=>sum+(Number.isFinite(s.attributes?.brightness)?Math.max(0,Math.min(255,s.attributes.brightness))/255:1),0)/on.length;}
 }else if(module==='covers'){
  const moving=count(s=>['opening','closing'].includes(s.state)),open=count(s=>s.state!=='closed');
  const positions=valid.map(s=>typeof s.attributes?.current_position==='number'?s.attributes.current_position:s.state==='closed'?0:s.state==='open'?100:null).filter(p=>p!==null&&Number.isFinite(p));
  result.position=positions.length?Math.max(0,Math.min(100,positions.reduce((a,b)=>a+b,0)/positions.length)):null;
  result.text=moving?`${moving} in movimento`:open?`${open} ${open===1?'apertura aperta':'aperture aperte'}`:'Tutte chiuse';
  if(open)result.tone='blue';if(moving)result.motion='moving';
 }else if(module==='climate'){
  const enabled=valid.filter(s=>s.state!=='off'),heat=enabled.filter(s=>['heating','preheating'].includes(s.attributes?.hvac_action)).length,cool=enabled.filter(s=>s.attributes?.hvac_action==='cooling').length;
  const fan=enabled.filter(s=>s.attributes?.hvac_action==='fan').length,dry=enabled.filter(s=>s.attributes?.hvac_action==='drying').length;
  result.text=heat&&cool?`${heat} caldo · ${cool} freddo`:heat?`${heat} in riscaldamento`:cool?`${cool} in raffrescamento`:fan?`${fan} in ventilazione`:dry?`${dry} in deumidificazione`:enabled.length?`${enabled.length} abilitate · in attesa`:'Tutto spento';
  result.tone=heat&&cool?'mixed':heat?'warm':cool?'cool':enabled.length?'blue':'neutral';if(heat||cool||fan||dry)result.motion='climate';
 }else if(module==='security'){
  const alarm=count(s=>s.state==='triggered'),pending=count(s=>['pending','arming','disarming'].includes(s.state)),armed=count(s=>s.state.startsWith('armed_'));
  result.text=alarm?'Allarme in corso':pending?'Cambio stato in corso':armed?`${armed} ${armed===1?'impianto inserito':'impianti inseriti'}`:'Disinserito';
  result.tone=alarm?'alert':pending?'warm':armed?'good':'neutral';if(alarm||pending)result.motion='alert';
 }else if(module==='media'){
  const playing=count(s=>s.state==='playing'),buffering=count(s=>s.state==='buffering');
  result.text=playing?`${playing} in riproduzione`:buffering?'Caricamento multimediale':'Nessuna riproduzione';
  if(playing||buffering)result.tone='purple';if(playing)result.motion='playing';
 }else if(module==='cameras'){
  const live=count(s=>['streaming','recording'].includes(s.state));result.text=live?`${live} in streaming / registrazione`:`${valid.length} ${valid.length===1?'disponibile':'disponibili'}`;
  result.tone='blue';if(live)result.motion='live';
 }
 if(module==='climate'&&result.text.includes('in attesa')&&valid.some(s=>s.state!=='off'&&!['idle','off'].includes(s.attributes?.hvac_action)))result.text=result.text.replace(' · in attesa','');
 if(module==='security'&&valid.some(s=>!['disarmed','triggered','pending','arming','disarming'].includes(s.state)&&!s.state.startsWith('armed_'))&&result.tone==='neutral')result.text='Stato da verificare';
 if(missing){
  const partial={'Tutte spente':'Nessuna accesa rilevata','Tutte chiuse':'Nessuna aperta rilevata','Tutto spento':'Nessuna zona abilitata rilevata','Disinserito':'Nessun inserimento rilevato'};
  result.text=partial[result.text]||result.text;
 }
 return result;
}

const glyphs={
 lights:'<path d="M21 37c-11-10-7-26 11-26s22 16 11 26l-5 6H26z"/><path d="M25 49h14m-11 6h8M32 2v4M7 15l5 3m40 0 5-3M3 34h6m46 0h6"/>',
 covers:'<rect x="9" y="9" width="46" height="46" rx="5"/><g class="slats"><path d="M14 17h36M14 24h36M14 31h36M14 38h36M14 45h36M14 52h36"/></g>',
 climate:'<path d="M25 37V15a7 7 0 0 1 14 0v22a13 13 0 1 1-14 0"/><path d="M32 20v25"/><circle cx="32" cy="47" r="5"/>',
 security:'<path d="M32 5 53 13v18c0 13-12 23-21 28C23 54 11 44 11 31V13z"/><path d="m22 31 7 7 14-16"/>',
 media:'<g class="equalizer"><path class="bar b1" d="M14 24v16"/><path class="bar b2" d="M26 13v38"/><path class="bar b3" d="M38 20v24"/><path class="bar b4" d="M50 27v10"/></g>',
 cameras:'<rect x="6" y="16" width="52" height="36" rx="8"/><circle cx="32" cy="34" r="11"/><path d="M22 16l3-7h14l3 7"/><circle class="record" cx="49" cy="24" r="2"/>',
};

class CLControlSystemCard extends HTMLElement{
 constructor(){super();this.attachShadow({mode:'open'});this._config={};}
 setConfig(config){this._config={...config};this._glyph=null;this.shadowRoot.innerHTML=`<style>${HOME_GLASS}
 .tile{width:100%;min-height:116px;display:flex;align-items:center;gap:13px;padding:16px;text-align:left;border:1px solid #b2daff55;border-radius:25px;background:radial-gradient(ellipse at 0% 0%,#29496a66,transparent 75%),var(--ha-card-background);box-shadow:var(--ha-card-box-shadow);cursor:pointer}
 .icon{width:54px;height:60px;flex-shrink:0;display:grid;place-items:center;color:var(--accent,#b8c1ce);background:linear-gradient(145deg,#ffffff10,#ffffff03);border:1px solid color-mix(in srgb,var(--accent,#b8c1ce) 45%,transparent);border-radius:18px}.icon svg{width:42px;height:42px;overflow:visible}.copy{min-width:0;flex:1}strong{display:block;font-size:16px;overflow-wrap:anywhere}.state{display:block;margin-top:6px;font-size:13px;line-height:1.5;color:#bdcadd;overflow-wrap:anywhere}.arrow{color:#bdcadd}.slats{transform-origin:32px 12px;transform:scaleY(var(--slats,1))}.bar{transform-origin:32px 32px}
 [data-motion=moving] .slats{animation:slats 1.3s ease-in-out infinite alternate}[data-motion=playing] .bar{animation:equalizer .9s ease-in-out infinite alternate}[data-motion=playing] .b2{animation-delay:-.4s}[data-motion=playing] .b3{animation-delay:-.7s}[data-motion=climate] svg,[data-motion=alert] svg{animation:pulse 1.5s ease-in-out infinite}[data-motion=live] .record{fill:currentColor;animation:pulse 1.2s ease-in-out infinite}
 @keyframes slats{to{opacity:.45}}@keyframes equalizer{to{transform:scaleY(.35)}}@keyframes pulse{50%{opacity:.45}}
 @media(max-width:420px){.tile{padding:13px;gap:10px;flex-wrap:wrap}.icon{width:46px;height:50px}.icon svg{width:34px;height:34px}.arrow{display:none}strong{font-size:15px}}
 @media(max-width:350px){.tile{padding:12px;gap:8px}.icon{width:36px;height:44px}.icon svg{width:30px;height:34px}strong{font-size:14px}.state{font-size:12px}}
 @media(prefers-reduced-motion:reduce){.tile *{animation:none!important}}
 </style><button class="tile" type="button"><span class="icon" aria-hidden="true"></span><span class="copy"><strong></strong><span class="state"></span></span><span class="arrow" aria-hidden="true">›</span></button>`;
 this.shadowRoot.querySelector('button').onclick=()=>{
  const target=new URL(this._config.path||'',window.location.href);
  if(target.origin!==window.location.origin||!this._config.path)return;
  window.history.pushState(null,'',target.pathname+target.search+target.hash);window.dispatchEvent(new Event('location-changed'));
 };this._sync();}
 set hass(value){this._hass=value;this._sync();}
 getCardSize(){return 2;}
 getGridOptions(){return {columns:6,rows:'auto',min_columns:6};}
 _sync(){
  const tile=this.shadowRoot.querySelector('.tile');if(!tile)return;
  const cfg=this._config,p=systemPresentation(cfg.module,cfg.entities||[],this._hass);
  const colors={neutral:'#b8c1ce',unavailable:'#8794a8',warm:'#ffd075',cool:'#77d1ff',blue:'#8ac8ff',good:'#6ce0c5',purple:'#c3a0ff',alert:'#ff9bae',mixed:'#d8b5ff'};
  tile.dataset.motion=p.motion;tile.dataset.tone=p.tone;tile.style.setProperty('--accent',colors[p.tone]);tile.style.setProperty('--slats',p.position===null?1:Math.max(.05,1-p.position/100));
  this.shadowRoot.querySelector('strong').textContent=cfg.name||'Sistema';const status=this.shadowRoot.querySelector('.state');status.textContent=p.text;status.hidden=!p.text;
  const icon=this.shadowRoot.querySelector('.icon'),drawing=glyphs[cfg.module];
  if(drawing){const svg=`<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${drawing}</svg>`;if(this._glyph!==svg){icon.innerHTML=svg;this._glyph=svg;}}
  else if(!icon.firstChild){const fallback=document.createElement('ha-icon');fallback.setAttribute('icon',cfg.icon||'mdi:view-grid-outline');icon.append(fallback);}
  icon.style.boxShadow=cfg.module==='lights'&&p.brightness?`0 0 ${8+14*p.brightness}px #ffd07555`:'none';
 }
}

// Native area/status/navigation cards retain their own interactions and state logic.
class CLControlHomeSurface extends HTMLElement{
 constructor(){super();this.attachShadow({mode:'open'});this._generation=0;}
 setConfig(config){this._config=config;this._generation++;this._native=null;this.shadowRoot.innerHTML=`<style>${HOME_GLASS}</style><div id="native"></div><p hidden role="status"></p>`;this._mount();}
 set hass(value){this._hass=value;if(this._native)this._native.hass=value;}
 getCardSize(){return this._native?.getCardSize?.()||2;}
 getGridOptions(){return this._native?.getGridOptions?.()||{columns:12,rows:'auto'};}
 async _mount(){const generation=this._generation;try{const helpers=await window.loadCardHelpers();if(generation!==this._generation)return;const native=helpers.createCardElement(this._config.card);native.hass=this._hass;this.shadowRoot.querySelector('#native').replaceChildren(native);this._native=native;}catch{if(generation!==this._generation)return;const error=this.shadowRoot.querySelector('p');error.hidden=false;error.textContent='Card non disponibile';}}
}
for(const [name,card] of [['cl-control-system-card',CLControlSystemCard],['cl-control-home-surface',CLControlHomeSurface]])if(!customElements.get(name))customElements.define(name,card);

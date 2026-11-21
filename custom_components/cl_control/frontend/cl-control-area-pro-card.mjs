// Responsive Home area card for the Pro profile. Presentation only; no device commands.
const KINDS=[
  ['temperature','Temperatura','mdi:thermometer'],
  ['humidity','Umidità','mdi:water-percent'],
  ['carbon_dioxide','CO₂','mdi:molecule-co2'],
  ['power','Potenza','mdi:flash'],
];
const ALERTS=[
  ['motion','Movimento','mdi:motion-sensor'],
  ['occupancy','Occupazione','mdi:account-eye'],
  ['presence','Presenza','mdi:account-check'],
];
const INVALID=new Set(['','unknown','unavailable','none','null']);

export function areaMetric(kind,entities,hass){
  // Pick one valid source. For multiple room temperature/humidity sensors,
  // prefer the sensor with finer reported precision over whole-degree values.
  let best=null, bestPrecision=-1;
  for(const id of Array.isArray(entities)?entities:[]){
    const state=hass?.states?.[id];
    if(!state||INVALID.has(String(state.state).trim().toLowerCase()))continue;
    const value=Number(state.state);
    if(!Number.isFinite(value)||value<0&&kind!=='temperature')continue;
    const unit=String(state.attributes?.unit_of_measurement||'').trim();
    let display=value, suffix='';
    if(kind==='temperature'){
      if(!['°C','°F'].includes(unit))continue;
      suffix=unit;display=new Intl.NumberFormat('it-IT',{maximumFractionDigits:1}).format(value);
    }else if(kind==='humidity'){
      if(unit!=='%'||value>100)continue;
      suffix=unit;display=new Intl.NumberFormat('it-IT',{maximumFractionDigits:1}).format(value);
    }else if(kind==='carbon_dioxide'){
      if(unit!=='ppm')continue;
      suffix=unit;display=new Intl.NumberFormat('it-IT',{maximumFractionDigits:0}).format(value);
    }else if(kind==='power'){
      if(!['W','kW'].includes(unit))continue;
      const watts=unit==='kW'?value*1000:value;
      if(!Number.isFinite(watts))continue;
      suffix=watts>=1000?'kW':'W';
      display=new Intl.NumberFormat('it-IT',{maximumFractionDigits:watts>=1000?2:1}).format(watts>=1000?watts/1000:watts);
    }else continue;
    const precise=(String(state.state).split('.')[1]||'').replace(/0+$/,'').length;
    const precision=Math.min(precise,3);
    if(!best||(['temperature','humidity'].includes(kind)&&precision>bestPrecision)){
      best={id,value,unit:suffix,text:`${display} ${suffix}`};bestPrecision=precision;
    }
  }
  return best;
}

export function areaAlerts(config,hass){
  const result=[];
  for(const [kind,label] of ALERTS){
    const ids=config?.[kind]||[];
    if(ids.some(id=>hass?.states?.[id]?.state==='on'))result.push({kind,label});
  }
  return result;
}

const STYLE=`
:host{display:block;min-width:0;color:#f3f8ff;container-type:inline-size}
*,*::before,*::after{box-sizing:border-box}
[hidden]{display:none!important}
button{font:inherit}
.card{
 display:block;width:100%;min-width:0;padding:0;text-align:left;overflow:hidden;
 border:1px solid transparent;border-radius:20px;
 background:
  radial-gradient(ellipse at 12% 35%,#16426a 0%,transparent 64%) padding-box,
  linear-gradient(115deg,#102438,#0b1524 66%,#1e1938) padding-box,
  linear-gradient(130deg,#9adcff 0%,#3084bd 37%,#234976 68%,#9976c9 100%) border-box;
 box-shadow:0 0 16px #3184d042,inset 0 0 7px #56b5ff25;
 color:inherit;cursor:pointer
}
.card:focus-visible{outline:3px solid #7bd0ff;outline-offset:3px}
.picture{display:block;width:100%;aspect-ratio:16/9;object-fit:cover;max-height:220px;border:0;border-bottom:1px solid #9adcff45}
.content{display:block;padding:12px 12px 13px}
.card:not(.has-metrics):not(.has-alerts) .content{padding-block:9px}
.top{display:flex;align-items:center;gap:9px;min-width:0}
.areaIcon{
 display:grid;place-items:center;flex:0 0 35px;height:34px;color:#80c8ff;
 background:linear-gradient(145deg,#72c6ff42,#1d466625);border:1px solid #80c8ff65;
 border-radius:10px;box-shadow:inset 0 0 5px #79c7ff26
}
.areaIcon ha-icon{--mdc-icon-size:22px}
.name{font-size:16px;line-height:1.23;font-weight:700;overflow-wrap:anywhere;min-width:0;flex:1}
.arrow{flex:0 0 auto;color:#f3f8ff;font-size:24px;line-height:1}
.metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-top:9px;min-width:0}
.metric{
 display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:7px;min-width:0;
 padding:7px;border-radius:11px;background:linear-gradient(150deg,#a9dfff20,#b3b4e916);
 border:1px solid #acc9e344;box-shadow:inset 0 1px 0 #d5ebff14
}
.metric ha-icon{--mdc-icon-size:18px;color:#8dccff}
.metric[data-kind=power] ha-icon{color:#ffd075}
.metric .copy{display:grid;min-width:0;gap:2px}
.metric .label{color:#d7e7f7;font-size:11px;line-height:1.16;overflow-wrap:anywhere}
.metric .value{color:#f5f8ff;font-size:14px;font-weight:650;line-height:1.2;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.alerts{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}
.alert{display:flex;align-items:center;gap:4px;font-size:11px;color:#ffdb9a;background:#ffbb4a1b;border:1px solid #ffcf7c40;padding:5px 7px;border-radius:10px}
.alert ha-icon{--mdc-icon-size:16px}
@container (max-width:300px){
 .card{border-radius:17px}
 .content{padding:7px 7px 8px}
 .top{gap:6px}
 .areaIcon{flex-basis:27px;height:26px;border-radius:8px}
 .areaIcon ha-icon{--mdc-icon-size:17px}
 .name{font-size:13px}
 .arrow{font-size:19px}
 .metrics{gap:5px;margin-top:7px}
 .metric{grid-template-columns:12px minmax(0,1fr);gap:3px;padding:5px 4px;border-radius:8px}
 .metric .label{font-size:clamp(9px,5.2cqi,11px)}
 .metric .value{font-size:clamp(10px,6.2cqi,13px)}
 .metric ha-icon{--mdc-icon-size:12px}
 .alerts{margin-top:7px}
 .alert{font-size:10px;padding:4px 5px}
}
@container (max-width:175px){
 .content{padding-inline:5px}
 .top{gap:4px}
 .name{font-size:12px}
 .metric{
  grid-template-columns:11px minmax(0,1fr);grid-template-rows:auto 1fr;
  row-gap:2px;align-items:start;padding-inline:3px
 }
 .metric .copy{display:contents}
 .metric .label{grid-row:1;grid-column:1/-1}
 .metric .value{grid-row:2;grid-column:2}
 .metric ha-icon{grid-row:2;grid-column:1;--mdc-icon-size:11px}
}
`;
export class CLControlAreaProCard extends HTMLElement{
  constructor(){super();this.attachShadow({mode:'open'});this._config={};}
  setConfig(config){
    if(!config?.area||!config?.navigation_path)throw new Error('CL Control Pro Area: area and navigation_path required');
    this._config={...config};this.shadowRoot.innerHTML=`<style>${STYLE}</style><button type="button" class="card" aria-label="Apri area"><img class="picture" alt="" hidden><span class="content"><span class="top"><span class="areaIcon"><ha-icon></ha-icon></span><span class="name"></span><span class="arrow" aria-hidden="true">›</span></span><span class="metrics" hidden></span><span class="alerts" hidden></span></span></button>`;
    this.shadowRoot.querySelector('button').addEventListener('click',()=>{
      const path=this._config.navigation_path;
      if(typeof path!=='string'||!path||path.startsWith('//'))return;
      // Resolve relative area paths against the dashboard root whether Home
      // is open as /dashboard or /dashboard/home (both are valid HA URLs).
      const here=window.location.pathname.replace(/\/+$/,'');
      const base=(here.endsWith('/home')?here.slice(0,-5):here)+'/';
      const url=new URL(path,window.location.origin+base);
      if(url.origin!==window.location.origin)return;
      window.history.pushState(null,'',url.pathname+url.search+url.hash);
      window.dispatchEvent(new Event('location-changed'));
    });
    const icon=this.shadowRoot.querySelector('.areaIcon ha-icon');
    icon.setAttribute('icon',this._config.icon||'mdi:home-outline');
    this.shadowRoot.querySelector('.name').textContent=this._config.name||this._config.area;
    const pic=this.shadowRoot.querySelector('.picture');
    const url=this._config.picture;
    if(typeof url==='string'&&url.trim()){
      pic.src=url;pic.hidden=false;
      pic.onerror=()=>{pic.hidden=true;};
    }
    this._sync();
  }
  set hass(hass){this._hass=hass;this._sync();}
  getCardSize(){return 2;}
  getGridOptions(){return {columns:6,rows:'auto',min_columns:6};}
  _sync(){
    const root=this.shadowRoot,metrics=root.querySelector('.metrics');
    if(!metrics)return;
    // Reuse existing nodes when only the live sensor values change.
    const active=[];
    for(const [kind,label,icon] of KINDS){
      const ids=this._config.telemetry?.[kind]||[];
      const metric=areaMetric(kind,ids,this._hass);
      let el=metrics.querySelector(`[data-kind="${kind}"]`);
      if(!metric){el?.remove();continue;}
      if(!el){
        el=document.createElement('span');el.className='metric';el.dataset.kind=kind;
        const image=document.createElement('ha-icon');image.setAttribute('icon',icon);image.setAttribute('aria-hidden','true');
        const copy=document.createElement('span');copy.className='copy';
        const title=document.createElement('span');title.className='label';
        title.textContent=label;
        const value=document.createElement('span');value.className='value';
        copy.append(title,value);el.append(image,copy);
      }
      el.querySelector('.value').textContent=metric.text;active.push(el);
    }
    metrics.replaceChildren(...active);
    metrics.hidden=!active.length;
    const alerts=areaAlerts(this._config.telemetry||{},this._hass);
    const target=root.querySelector('.alerts');
    target.replaceChildren(...alerts.map(({kind,label})=>{
      const pill=document.createElement('span');pill.className='alert';
      const i=document.createElement('ha-icon');i.setAttribute('icon',ALERTS.find(a=>a[0]===kind)[2]);
      const caption=document.createElement('span');caption.textContent=label+(kind==='motion'?' rilevato':' rilevata');pill.append(i,caption);return pill;
    }));
    target.hidden=!alerts.length;
    const button=root.querySelector('button');
    button.classList.toggle('has-metrics',active.length>0);
    button.classList.toggle('has-alerts',alerts.length>0);
    button.setAttribute('aria-label',`Apri area ${this._config.name||this._config.area}${active.length?', '+active.map(e=>e.querySelector('.label').textContent+' '+e.querySelector('.value').textContent).join(', '):''}`);
  }
}
if(!customElements.get('cl-control-area-pro-card'))customElements.define('cl-control-area-pro-card',CLControlAreaProCard);

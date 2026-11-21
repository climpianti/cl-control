// Responsive Home area card for the Pro profile. Presentation only; no device commands.
const KINDS=[
  ['temperature','Temperatura','mdi:thermometer','°C'],
  ['humidity','Umidità','mdi:water-percent','%'],
  ['carbon_dioxide','CO₂','mdi:molecule-co2','ppm'],
  ['power','Potenza','mdi:flash','W'],
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
:host{display:block;min-width:0;color:#f5f7fc}
*{box-sizing:border-box}
button{font:inherit}
.card{display:block;width:100%;min-width:0;padding:15px 17px;text-align:left;border:1px solid #94caff50;border-radius:26px;background:radial-gradient(ellipse at 0% 0%,#21456b8a,transparent 68%),linear-gradient(115deg,#182431,#121922 62%,#271e36);box-shadow:0 10px 28px #0003,inset 0 1px 2px #e7f7ff33;color:inherit;cursor:pointer}
.card:focus-visible{outline:3px solid #7bd0ff;outline-offset:3px}
.top{display:flex;align-items:center;gap:11px;min-width:0}
.areaIcon{display:grid;place-items:center;flex:0 0 40px;height:42px;color:#8dcaff;background:#80bbff16;border:1px solid #b2daff38;border-radius:14px}
.areaIcon ha-icon{--mdc-icon-size:26px}
.name{font-size:17px;line-height:1.35;font-weight:650;overflow-wrap:anywhere;min-width:0;flex:1}
.arrow{flex:0 0 auto;color:#aac5dc;font-size:24px}
.picture{width:56px;height:48px;object-fit:cover;border-radius:10px;border:1px solid #b2daff35}
.metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px 12px;margin-top:13px}
.metric{display:flex;align-items:start;gap:7px;min-width:0;padding:9px;border-radius:13px;background:#ffffff0a;border:1px solid #b2daff14}
.metric ha-icon{--mdc-icon-size:20px;flex:0 0 auto;color:#8dcaff;margin-top:3px}
.metric[data-kind=power] ha-icon{color:#ffd075}
.metric .copy{display:flex;flex-direction:column;min-width:0;gap:2px}
.metric .label{color:#b6c9dc;font-size:12px;line-height:1.2}
.metric .value{color:#f4f7ff;font-size:15px;font-weight:650;line-height:1.3;white-space:normal;overflow-wrap:normal;word-break:normal}
.alerts{display:flex;gap:7px;flex-wrap:wrap;margin-top:11px}
.alert{display:flex;align-items:center;gap:4px;font-size:12px;color:#ffdb9a;background:#ffbb4a1b;border:1px solid #ffcf7c40;padding:5px 8px;border-radius:12px}
.alert ha-icon{--mdc-icon-size:17px}
.empty{color:#bdcadd;font-size:13px;margin:10px 0 0}
@media(max-width:360px){.card{padding:13px}.metrics{gap:7px}.metric{padding:7px}.metric .value{font-size:14px}.name{font-size:15px}}
@media(prefers-reduced-motion:reduce){.card{transition:none}}
`;
export class CLControlAreaProCard extends HTMLElement{
  constructor(){super();this.attachShadow({mode:'open'});this._config={};}
  setConfig(config){
    if(!config?.area||!config?.navigation_path)throw new Error('CL Control Pro Area: area and navigation_path required');
    this._config={...config};this.shadowRoot.innerHTML=`<style>${STYLE}</style><button type="button" class="card" aria-label="Apri area"><span class="top"><span class="areaIcon"><ha-icon></ha-icon></span><span class="name"></span><img class="picture" alt="" hidden><span class="arrow" aria-hidden="true">›</span></span><span class="metrics"></span><span class="alerts" hidden></span><p class="empty" hidden>Nessuna misura disponibile</p></button>`;
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
  getGridOptions(){return {columns:12,rows:'auto',min_columns:12};}
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
        const image=document.createElement('ha-icon');image.setAttribute('icon',icon);
        const copy=document.createElement('span');copy.className='copy';
        const title=document.createElement('span');title.className='label';title.textContent=label;
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
    root.querySelector('.empty').hidden=active.length>0||alerts.length>0;
    const button=root.querySelector('button');
    button.setAttribute('aria-label',`Apri area ${this._config.name||this._config.area}${active.length?', '+active.map(e=>e.querySelector('.label').textContent+' '+e.querySelector('.value').textContent).join(', '):''}`);
  }
}
if(!customElements.get('cl-control-area-pro-card'))customElements.define('cl-control-area-pro-card',CLControlAreaProCard);

import { readInstantPower, INSTANT_POWER_BADGE_CSS } from './cl-control-power-badge.mjs';
/* CL Control Blue Tech Glass switch — circular power, no slider. */
class CLSwitchGlassCard extends HTMLElement {
  constructor(){super();this.attachShadow({mode:'open'});this._config={};this._hass=null;this._busy=false;}
  setConfig(config){if(!config.entity)throw Error('entity required');this._config={...config};this._render();}
  set hass(hass){this._hass=hass;this._render();}
  getCardSize(){return 2;}
  getGridOptions(){return {columns:12,rows:'auto',min_columns:6};}
  _render(){
    const s=this._hass?.states?.[this._config.entity],on=s?.state==='on',available=!!s&&!['unavailable','unknown'].includes(s.state);
    const name=this._config.name||s?.attributes?.friendly_name||this._config.entity||'Interruttore';
    const defaultIcon=s?.attributes?.device_class==='outlet'?'mdi:power-socket-eu':'mdi:toggle-switch-outline';
    const watts=readInstantPower(this._hass,this._config.power_entity);
    const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&quot;'}[c]));
    this.shadowRoot.innerHTML=`<style>
      :host{display:block;min-width:0;color:#f5f7fc}
      ha-card{position:relative;isolation:isolate;box-sizing:border-box;min-height:154px;display:flex;align-items:center;gap:15px;padding:19px 20px;
        background:radial-gradient(ellipse at 90% 15%,rgba(117,72,157,.38),transparent 54%),linear-gradient(135deg,#122846,#151a29 62%,#251b35);
        border:1px solid rgba(155,190,255,.28);border-radius:24px;box-shadow:0 12px 28px rgba(0,0,0,.22);overflow:hidden}
      ha-card:before{content:"";position:absolute;inset:0;background:linear-gradient(120deg,rgba(40,120,229,.09),transparent 65%);pointer-events:none}
      .device,.identity,.power{position:relative;z-index:1}
      .device{width:57px;min-width:57px;height:57px;border:0;border-radius:18px;background:rgba(112,175,225,.12);color:#9daab8;display:grid;place-items:center;cursor:pointer}
      .device ha-icon{--mdc-icon-size:32px}
      ha-card:has(.power[aria-checked=true]) .device{color:#ffd16e;background:rgba(232,170,54,.13)}
      .identity{flex:1;min-width:0}
      strong{display:block;font-size:18px;font-weight:700;line-height:1.3;letter-spacing:-.3px;overflow-wrap:anywhere;color:#fff}
      small{display:block;margin-top:7px;font-size:13px;color:#bac6dc}
      ${INSTANT_POWER_BADGE_CSS}
      .power{width:58px;height:58px;min-width:58px;display:grid;place-items:center;border:1px solid rgba(142,178,211,.42);border-radius:50%;
        background:linear-gradient(145deg,#303a49,#202936);color:#9ca8b8;cursor:pointer;box-shadow:inset 0 1px 1px #ffffff24,0 3px 10px #0004;transition:background .18s,box-shadow .18s}
      .power[aria-checked=true]{color:#422d0d;background:linear-gradient(140deg,#ffe09a,#e9aa34);border-color:#ffe5ab;box-shadow:0 0 18px #f3bd4b77,inset 0 1px 2px #ffffff88}
      .power ha-icon{--mdc-icon-size:28px}
      button:focus-visible{outline:2px solid #8ed1ff;outline-offset:3px}
      button:disabled{opacity:.45;cursor:default}
      @media(max-width:520px){ha-card{padding:14px;border-radius:19px;gap:12px}.device{width:46px;min-width:46px;height:50px}.device ha-icon{--mdc-icon-size:28px}strong{font-size:16px}.power{width:54px;min-width:54px;height:54px}}
      @media(prefers-reduced-motion:reduce){.power{transition:none}}
    </style>
    <ha-card><button class="device" id="details" aria-label="Dettagli ${esc(name)}"><ha-icon icon="${esc(this._config.icon||s?.attributes?.icon||defaultIcon)}"></ha-icon></button>
    <div class="identity"><strong>${esc(name)}</strong><small>${available?(on?'Acceso':'Spento'):'Non disponibile'}</small>${watts?`<small class="cl-power-meter" aria-label="Potenza istantanea ${esc(watts)}"><span class="cl-power-symbol" aria-hidden="true">⚡</span><span class="cl-power-value">${esc(watts)}</span></small>`:''}</div>
    <button class="power" id="power" role="switch" aria-label="Accensione ${esc(name)}" aria-checked="${on}" ${!available||this._busy?'disabled':''}><ha-icon icon="mdi:power"></ha-icon></button></ha-card>`;
    this.shadowRoot.querySelector('#details').onclick=()=>this.dispatchEvent(new CustomEvent('hass-more-info',{detail:{entityId:this._config.entity},bubbles:true,composed:true}));
    this.shadowRoot.querySelector('#power').onclick=async()=>{
      if(this._busy||!available||!this._hass)return;
      this._busy=true;this._render();
      try{await this._hass.callService('switch',on?'turn_off':'turn_on',{entity_id:this._config.entity});}
      catch(e){console.warn('CL Control switch command failed',e);}
      finally{this._busy=false;this._render();}
    };
  }
}
if(!customElements.get('cl-control-switch-glass-card'))customElements.define('cl-control-switch-glass-card',CLSwitchGlassCard);

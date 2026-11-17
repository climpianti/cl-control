/* CL Control Blue Tech Glass: full-width high-contrast select/input_select. */
class CLControlModeGlassCard extends HTMLElement {
  constructor(){super();this.attachShadow({mode:'open'});this._config={};this._hass=null;this._open=false;this._busy=false;}
  setConfig(config){if(!config.entity)throw Error('entity required');this._config={...config};this._render();}
  set hass(hass){this._hass=hass;this._render();}
  getCardSize(){return 2;}
  getGridOptions(){return {columns:12,rows:'auto',min_columns:6};}
  _render(){
    const state=this._hass?.states?.[this._config.entity];
    const unavailable=!state||['unavailable','unknown'].includes(state.state);
    const options=Array.isArray(state?.attributes?.options)?state.attributes.options:[];
    const current=state?.state||'Non disponibile';
    const name=this._config.name||state?.attributes?.friendly_name||this._config.entity||'Modalità';
    const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    this.shadowRoot.innerHTML=`<style>
      :host{display:block;min-width:0;color:#fff}
      ha-card{box-sizing:border-box;min-height:154px;display:flex;align-items:center;gap:15px;padding:19px 20px;position:relative;
        background:radial-gradient(ellipse at 90% 15%,rgba(117,72,157,.32),transparent 55%),linear-gradient(135deg,#122846,#151a29 62%,#251b35);
        border:1px solid rgba(155,190,255,.28);border-radius:24px;box-shadow:0 12px 28px #0003}
      .device{width:57px;min-width:57px;height:57px;border:0;border-radius:18px;background:rgba(112,175,225,.12);color:#95c7f0;display:grid;place-items:center;cursor:pointer}
      .device ha-icon{--mdc-icon-size:30px}
      .content{flex:1;min-width:0}
      strong{display:block;color:#fff;font-size:18px;line-height:1.35;overflow-wrap:anywhere}
      .state{color:#bac6dc;font-size:14px;margin:5px 0 10px}
      .chooser{width:100%;min-height:46px;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 13px;border-radius:13px;
        border:1px solid #849cb56e;background:linear-gradient(110deg,#2b3749,#262b3d);color:#fff;font:inherit;font-size:16px;cursor:pointer;text-align:left}
      .chooser ha-icon{--mdc-icon-size:20px;color:#d7e6fa}
      .options{margin:8px 0 0;padding:5px;background:#1d2b3a;border:1px solid #7e9cb8;border-radius:13px;box-shadow:0 10px 22px #0005}
      .option{width:100%;min-height:43px;padding:10px 12px;background:transparent;color:#fff;border:0;border-radius:9px;text-align:left;font:inherit;font-size:15px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:10px;overflow-wrap:anywhere}
      .option[aria-selected=true]{background:#344b62;color:#ffe0a0}
      .option:hover,.option:focus-visible{background:#3b5873}
      button:focus-visible{outline:2px solid #9ed0ff;outline-offset:2px}
      button:disabled{opacity:.55;cursor:default}
      @media(max-width:520px){ha-card{padding:14px;gap:12px;border-radius:19px}.device{width:46px;min-width:46px;height:50px}strong{font-size:16px}}
    </style><ha-card>
      <button id="details" class="device" aria-label="Dettagli ${esc(name)}"><ha-icon icon="${esc(this._config.icon||state?.attributes?.icon||'mdi:tune-variant')}"></ha-icon></button>
      <div class="content"><strong>${esc(name)}</strong><div class="state">${esc(current)}</div>
      <button id="chooser" class="chooser" aria-label="Seleziona ${esc(name)}" aria-expanded="${this._open}" ${unavailable||this._busy?'disabled':''}><span>${esc(current)}</span><ha-icon icon="mdi:chevron-down"></ha-icon></button>
      ${this._open?`<div class="options" role="listbox" aria-label="${esc(name)}">${options.map((value,i)=>`<button class="option" role="option" data-index="${i}" aria-selected="${value===current}">${esc(value)}${value===current?'<ha-icon icon="mdi:check"></ha-icon>':''}</button>`).join('')}</div>`:''}
      </div></ha-card>`;
    this.shadowRoot.querySelector('#details').onclick=()=>this.dispatchEvent(new CustomEvent('hass-more-info',{detail:{entityId:this._config.entity},bubbles:true,composed:true}));
    this.shadowRoot.querySelector('#chooser').onclick=()=>{this._open=!this._open;this._render();if(this._open)this.shadowRoot.querySelector('.option[aria-selected=true]')?.focus();};
    this.shadowRoot.querySelectorAll('.option').forEach(button=>button.onclick=async()=>{
      const value=options[Number(button.dataset.index)];if(value===undefined||this._busy)return;
      this._busy=true;this._open=false;this._render();
      try{const domain=this._config.entity.split('.')[0];await this._hass.callService(domain,domain==='input_select'?'select_option':'select_option',{entity_id:this._config.entity,option:value});}
      catch(e){console.warn('CL Control mode selection failed',e);this._error=e?.message||'Comando non riuscito';}
      finally{this._busy=false;this._render();}
    });
  }
}
if(!customElements.get('cl-control-mode-glass-card'))customElements.define('cl-control-mode-glass-card',CLControlModeGlassCard);

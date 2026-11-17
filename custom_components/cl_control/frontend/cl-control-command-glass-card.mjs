/* CL Control - area momentary command card for input_button/button entities. */
class CLControlCommandGlassCard extends HTMLElement {
 constructor(){super();this.attachShadow({mode:'open'});this._config={};this._busy=false;}
 setConfig(config){if(!config.entity)throw Error('Entity required');this._config={...config};this._render();}
 set hass(hass){this._hass=hass;this._render();}
 getCardSize(){return 2;}
 getGridOptions(){return {columns:12,rows:'auto'};}
 _render(){
  const entity=this._hass?.states?.[this._config.entity];
  const name=this._config.name||entity?.attributes?.friendly_name||this._config.entity;
  const unavailable=!entity||['unavailable','unknown'].includes(entity.state);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  this.shadowRoot.innerHTML=`<style>
  :host{display:block;min-width:0}ha-card{box-sizing:border-box;display:flex;align-items:center;gap:16px;min-height:148px;padding:20px;border-radius:24px;color:#fff;background:radial-gradient(ellipse at 95% 5%,#6a467644,transparent 60%),linear-gradient(125deg,#132943,#191c2d 75%,#261c35);border:1px solid #91b6de66;box-shadow:0 12px 26px #0003}
  .device{width:58px;height:58px;flex:none;border-radius:18px;background:#8bbdeb20;color:#9ac7f0;display:grid;place-items:center}.device ha-icon{--mdc-icon-size:32px}
  .body{flex:1;min-width:0}.name{font-size:19px;line-height:1.35;font-weight:650;overflow-wrap:anywhere}.hint{font-size:14px;color:#bac8db;margin-top:7px}
  button{width:66px;height:66px;flex:none;border-radius:50%;border:2px solid #a6cbe8;background:linear-gradient(145deg,#345773,#23394f);color:#fff;display:grid;place-items:center;cursor:pointer;box-shadow:0 0 12px #7db5e533}
  button ha-icon{--mdc-icon-size:30px}button:active{background:#e7b650;color:#2d281e}button:focus-visible{outline:3px solid #ffdf8a;outline-offset:3px}button:disabled{opacity:.5;cursor:default}
  @media(max-width:520px){ha-card{padding:15px;gap:12px;border-radius:20px}.device{width:46px;height:50px}.name{font-size:17px}button{width:56px;height:56px}}
  </style><ha-card><div class="device"><ha-icon icon="${esc(this._config.icon||entity?.attributes?.icon||'mdi:gesture-tap-button')}"></ha-icon></div><div class="body"><div class="name">${esc(name)}</div><div class="hint">${this._busy?'Invio comando…':unavailable?'Non disponibile':'Premi per attivare'}</div></div><button aria-label="Esegui ${esc(name)}" ${unavailable||this._busy?'disabled':''}><ha-icon icon="mdi:gesture-tap"></ha-icon></button></ha-card>`;
  this.shadowRoot.querySelector('button').onclick=async()=>{
   if(this._busy||unavailable)return;
   const domain=this._config.entity.split('.')[0];
   if(!['input_button','button'].includes(domain))return;
   if(this._config.confirmation!==false&&/(apertura|apri|sblocca|unlock|cancello|porta)/i.test(name)){
     if(!window.confirm(`Confermi il comando: ${name}?`))return;
   }
   this._busy=true;this._render();
   try{await this._hass.callService(domain,'press',{entity_id:this._config.entity});}
   catch(e){console.warn('CL Control command failed',e);}
   finally{this._busy=false;this._render();}
  };
 }
}
if(!customElements.get('cl-control-command-glass-card'))customElements.define('cl-control-command-glass-card',CLControlCommandGlassCard);

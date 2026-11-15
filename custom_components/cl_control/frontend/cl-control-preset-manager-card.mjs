/* Preset manager mounted only inside Home > Scenari luci. */
class CLControlPresetManagerCard extends HTMLElement {
 constructor(){super();this.attachShadow({mode:'open'});this._config={entities:[]};this._selected='';this._card=null;this._hass=null;}
 setConfig(config){this._config={...config,entities:config.entities||[]};this._selected=this._config.entities[0]?.entity_id||'';this._render();}
 set hass(hass){this._hass=hass;if(this._card)this._card.hass=hass;}
 getCardSize(){return 4;}
 getGridOptions(){return {columns:12,rows:'auto'};}
 async _renderCard(){
   const target=this.shadowRoot.querySelector('#target');if(!target)return;
   target.replaceChildren();this._card=null;if(!this._selected)return;
   try{
     const helpers=await window.loadCardHelpers();
     const card=helpers.createCardElement({type:'custom:cl-control-light-memories-card',entity:this._selected,preset_manager:true,name:this._config.entities.find(e=>e.entity_id===this._selected)?.name||this._selected});
     this._card=card;if(this._hass)card.hass=this._hass;target.append(card);
   }catch(e){target.textContent='Impossibile caricare i preset.';console.warn(e);}
 }
 _render(){
   const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
   this.shadowRoot.innerHTML=`<style>:host{display:block;min-width:0;color:#fff}.shell{background:linear-gradient(125deg,#152c40,#171f2c 60%,#261c35);border:1px solid #789ab155;border-radius:22px;padding:17px;box-shadow:0 9px 25px #0004}h3{font-size:19px;margin:0 0 7px}p{color:#bdcadd;font-size:13px;margin:0 0 14px}select{width:100%;box-sizing:border-box;padding:13px 14px;background:#1b293b;color:#fff;border:1px solid #7d9cbd77;border-radius:13px;font:inherit}#target{margin-top:12px}</style>
   <div class="shell"><h3>Preset luce</h3><p>Scegli una luce per salvare, richiamare o eliminare i preset di luminosità e colore.</p><select aria-label="Seleziona luce">${this._config.entities.map(e=>`<option value="${esc(e.entity_id)}" ${e.entity_id===this._selected?'selected':''}>${esc(e.name||e.entity_id)}</option>`).join('')}</select><div id="target"></div></div>`;
   this.shadowRoot.querySelector('select').onchange=e=>{this._selected=e.target.value;this._renderCard();};
   this._renderCard();
 }
}
if(!customElements.get('cl-control-preset-manager-card'))customElements.define('cl-control-preset-manager-card',CLControlPresetManagerCard);

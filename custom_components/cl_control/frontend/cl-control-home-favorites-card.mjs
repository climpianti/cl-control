/* Live Home favorites, backed by CL Control's persistent customer_ui favorites. */
class CLControlHomeFavoritesCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode:'open'});
    this._config={};
    this._hass=null;
    this._cards=new Map();
    this._refresh=()=>this._load();
    this._loading=false;
  }
  setConfig(config){this._config={...config};this._renderShell();}
  set hass(hass){const first=!this._hass;this._hass=hass;for(const card of this._cards.values())card.hass=hass;if(first&&this.isConnected)this._load();}
  connectedCallback(){window.addEventListener('cl-control-home-favorites-changed',this._refresh);if(this._hass)this._load();}
  disconnectedCallback(){window.removeEventListener('cl-control-home-favorites-changed',this._refresh);}
  getCardSize(){return 3;}
  getGridOptions(){return {columns:12,rows:'auto'};}
  _renderShell(){
    this.shadowRoot.innerHTML=`<style>
      :host{display:block;min-width:0}
      #title{font-size:19px;font-weight:650;display:none;align-items:center;gap:9px;margin:5px 0 13px;color:var(--primary-text-color,#fff)}
      #title ha-icon{color:#ffcb48;--mdc-icon-size:22px}
      #cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:14px}
      @media(max-width:600px){#cards{grid-template-columns:minmax(0,1fr)}}
    </style><div id="title"><ha-icon icon="mdi:star"></ha-icon><span></span></div><div id="cards"></div>`;
  }
  async _load(){
    if(!this._hass||this._loading)return;
    this._loading=true;
    try{
      const result=await this._hass.callWS({type:'cl_control/dashboard/native_config'});
      const model=result?.model||{};
      const entities=model.favorites||[];
      if(!this.shadowRoot.querySelector('#cards'))this._renderShell();
      const container=this.shadowRoot.querySelector('#cards');
      const title=this.shadowRoot.querySelector('#title');
      title.style.display=entities.length?'flex':'none';
      title.querySelector('span').textContent=model.favorites_label||'Preferiti';
      const ids=new Set(entities.map(x=>x.entity_id));
      for(const id of this._cards.keys())if(!ids.has(id))this._cards.delete(id);
      container.replaceChildren();
      const helpers=await window.loadCardHelpers();
      for(const entity of entities){
        let card=this._cards.get(entity.entity_id);
        if(!card){
          const type=entity.domain==='light'?'custom:cl-control-light-memories-card':
            entity.domain==='cover'?'custom:cl-control-cover-card':
            entity.domain==='climate'?'custom:cl-control-climate-glass-card':
            entity.domain==='media_player'?'custom:cl-control-media-card':
            entity.domain==='switch'&&entity.power_entity?'custom:cl-control-switch-glass-card':'tile';
          card=helpers.createCardElement({type,entity:entity.entity_id,name:entity.name,
            ...(entity.power_entity?{power_entity:entity.power_entity}:{})});
          this._cards.set(entity.entity_id,card);
        }
        card.hass=this._hass;
        container.append(card);
      }
    }catch(e){console.warn('CL Control favorites refresh failed',e);}
    finally{this._loading=false;}
  }
}
if(!customElements.get('cl-control-home-favorites-card'))customElements.define('cl-control-home-favorites-card',CLControlHomeFavoritesCard);

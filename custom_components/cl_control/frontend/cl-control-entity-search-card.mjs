/* CL Control searchable systems: filter by name without changing entity states. */
const norm = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim();
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
class CLControlEntitySearchCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode:'open'});
    this._groups = [];
    this._query = '';
    this._cards = new Map();
    this._hass = null;
  }
  setConfig(config) {
    if (!Array.isArray(config.groups)) throw Error('groups is required');
    this._config = config;
    this._groups = config.groups.map((group, index) => ({
      id: index,
      name: String(group.name || ''),
      icon: String(group.icon || ''),
      heading_card: group.heading_card || null,
      entities: (group.entities || []).filter(item => item?.entity).map(item => ({
        entity: String(item.entity),
        name: String(item.name || item.entity),
        config: {...item},
      })),
    }));
    this._cards.clear();
    this._render();
  }
  set hass(hass) {
    this._hass = hass;
    for (const card of this._cards.values()) card.hass = hass;
  }
  getCardSize() { return Math.max(2, Math.ceil(this._groups.reduce((n,g)=>n+g.entities.length,0)/2)); }
  _makeCard(item) {
    let card = this._cards.get(item.entity);
    if (card) return card;
    // Native HA card: preserves more-info, light controls, tile features and state updates.
    card = document.createElement('hui-card');
    const config = {...item.config};
    delete config.name_search;
    card.setConfig(config);
    if (this._hass) card.hass = this._hass;
    this._cards.set(item.entity, card);
    return card;
  }
  _render() {
    if (!this.shadowRoot || !this._config) return;
    this.shadowRoot.innerHTML = `
      <style>
        :host{display:block;min-width:0}
        .search{display:flex;align-items:center;gap:11px;padding:12px 15px;border:1px solid rgba(115,175,236,.33);border-radius:20px;
          background:linear-gradient(110deg,rgba(28,49,69,.96),rgba(35,30,54,.96));box-shadow:0 3px 22px rgba(21,100,185,.12),inset 0 1px 0 rgba(220,242,255,.13);
          color:var(--primary-text-color,#fff)}
        .search:focus-within{border-color:rgba(83,174,255,.85);box-shadow:0 0 0 2px rgba(38,138,248,.16)}
        .search ha-icon{color:#70bfff;--mdc-icon-size:23px}
        input{flex:1;min-width:0;border:0;outline:0;background:transparent;color:inherit;font:inherit;font-size:16px}
        input::placeholder{color:var(--secondary-text-color,#aeb7c7)}
        button{border:0;background:rgba(150,185,220,.15);color:inherit;border-radius:50%;width:29px;height:29px;cursor:pointer;display:none;align-items:center;justify-content:center}
        button[aria-hidden="false"]{display:flex}
        button ha-icon{--mdc-icon-size:17px;color:inherit}
        .meta{padding:10px 5px 3px;color:var(--secondary-text-color,#b3bfcd);font-size:12px}
        .group{margin-top:17px}
        .heading{display:flex;align-items:center;gap:9px;font-size:18px;font-weight:500;padding:0 7px 12px}
        .heading ha-icon{--mdc-icon-size:22px}
        .tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:14px}
        .tiles hui-card{min-width:0}
        .empty{padding:30px 15px;text-align:center;border-radius:19px;border:1px solid rgba(130,180,220,.23);background:rgba(25,40,61,.5);margin-top:16px}
        .empty ha-icon{color:#70bfff;--mdc-icon-size:32px}
        .empty p{color:var(--secondary-text-color,#b3bfcd)}
        @media(max-width:600px){.tiles{grid-template-columns:minmax(0,1fr)}.search{padding:12px 14px}}
      </style>
      <div class="search" role="search">
        <ha-icon icon="mdi:magnify"></ha-icon>
        <input type="search" autocomplete="off" enterkeyhint="search" aria-label="Cerca dispositivo" placeholder="${esc(this._config.placeholder || 'Cerca un dispositivo...')}" value="${esc(this._query)}">
        <button type="button" aria-label="Cancella ricerca" aria-hidden="${this._query ? 'false':'true'}"><ha-icon icon="mdi:close"></ha-icon></button>
      </div>
      <div class="meta" aria-live="polite"></div>
      <div class="results"></div>`;
    const input = this.shadowRoot.querySelector('input');
    input.addEventListener('input', () => {
      this._query = input.value;
      this.shadowRoot.querySelector('button').setAttribute('aria-hidden',this._query ? 'false':'true');
      this._renderResults();
    });
    this.shadowRoot.querySelector('button').addEventListener('click',()=>{
      input.value='';this._query='';this.shadowRoot.querySelector('button').setAttribute('aria-hidden','true');this._renderResults();input.focus();
    });
    this._renderResults();
  }
  _renderResults() {
    const root=this.shadowRoot.querySelector('.results');
    if (!root) return;
    const q=norm(this._query);
    const groups=this._groups.map(group=>({...group,entities:group.entities.filter(item=>norm(item.name).includes(q)||norm(item.entity).includes(q))})).filter(group=>group.entities.length);
    const total=groups.reduce((n,g)=>n+g.entities.length,0);
    const all=this._groups.reduce((n,g)=>n+g.entities.length,0);
    this.shadowRoot.querySelector('.meta').textContent=q ? `${total} di ${all} dispositivi` : `${all} dispositivi`;
    root.replaceChildren();
    if (!total) {
      const empty=document.createElement('div');empty.className='empty';
      empty.innerHTML='<ha-icon icon="mdi:magnify-close"></ha-icon><strong style="display:block;margin-top:9px">Nessun risultato</strong><p>Prova con un altro nome.</p>';
      root.append(empty);return;
    }
    for (const group of groups) {
      const section=document.createElement('section');section.className='group';
      if (group.heading_card) {
        const heading = document.createElement('hui-card');
        heading.setConfig(group.heading_card);
        if (this._hass) heading.hass = this._hass;
        section.append(heading);
      } else {
        const heading=document.createElement('div');heading.className='heading';
        const icon=document.createElement('ha-icon');icon.setAttribute('icon',group.icon||'mdi:lightbulb-group');
        const label=document.createElement('span');label.textContent=group.name;
        heading.append(icon,label);section.append(heading);
      }
      const tiles=document.createElement('div');tiles.className='tiles';
      for (const item of group.entities) tiles.append(this._makeCard(item));
      section.append(tiles);root.append(section);
    }
  }
}
if (!customElements.get('cl-control-entity-search-card')) customElements.define('cl-control-entity-search-card',CLControlEntitySearchCard);
window.customCards=window.customCards||[];
if (!window.customCards.some(x=>x.type==='cl-control-entity-search-card')) window.customCards.push({
  type:'cl-control-entity-search-card',name:'CL Control Search',description:'Ricerca Blue Tech Glass per i sistemi CL Control.'
});

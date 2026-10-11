const esc = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

function greetingFor(date) {
  const hour = date.getHours();
  if (hour < 12) return 'Buongiorno';
  if (hour < 18) return 'Buon pomeriggio';
  return 'Buonasera';
}

function localizedDate(date) {
  try {
    const text = new Intl.DateTimeFormat('it-IT', {
      weekday: 'long', day: 'numeric', month: 'long',
    }).format(date);
    return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : '';
  } catch (_err) {
    return '';
  }
}

class CLControlWelcomeCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode: 'open'});
    this._hass = null;
    this._config = {};
  }

  setConfig(config) {
    this._config = {...(config || {})};
    this._render();
  }

  set hass(value) {
    this._hass = value;
    this._render();
  }

  getCardSize() {
    return this._config?.mode === 'extended' ? 2 : 1;
  }

  _render() {
    if (!this.shadowRoot) return;
    const now = new Date();
    const mode = this._config?.mode === 'extended' ? 'extended' : 'compact';
    const userName = String(this._hass?.user?.name || '').trim() || 'utente';
    const greeting = `${greetingFor(now)}, ${userName}`;
    const site = String(this._config?.site_name || 'Casa').trim() || 'Casa';
    const secondaryMode = String(this._config?.secondary_mode || 'auto');
    let secondary = '';
    if (secondaryMode === 'custom') secondary = String(this._config?.secondary_text || '').trim();
    else if (secondaryMode !== 'off') secondary = `Benvenuto a ${site}`;
    const dateLine = mode === 'extended' ? localizedDate(now) : '';

    this.shadowRoot.innerHTML = `
      <style>
        :host{display:block}
        ha-card{box-sizing:border-box;min-height:${mode === 'extended' ? '92px' : '68px'};padding:${mode === 'extended' ? '18px 20px' : '14px 18px'};display:flex;align-items:center;background:var(--ha-card-background,var(--card-background-color));color:var(--primary-text-color)}
        .wrap{min-width:0;width:100%}.title{font-size:${mode === 'extended' ? '24px' : '19px'};font-weight:700;line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.secondary{margin-top:5px;color:var(--secondary-text-color);font-size:13px;line-height:1.3}.date{margin-top:4px;color:var(--secondary-text-color);font-size:12px}
        @media(max-width:600px){ha-card{padding:${mode === 'extended' ? '16px' : '13px 15px'}}.title{font-size:${mode === 'extended' ? '22px' : '18px'}}}
      </style>
      <ha-card><div class="wrap"><div class="title">${esc(greeting)} 👋</div>${secondary ? `<div class="secondary">${esc(secondary)}</div>` : ''}${dateLine ? `<div class="date">${esc(dateLine)}</div>` : ''}</div></ha-card>
    `;
  }
}

if (!customElements.get('cl-control-welcome-card')) {
  customElements.define('cl-control-welcome-card', CLControlWelcomeCard);
}

window.customCards = window.customCards || [];
if (!window.customCards.some(card => card.type === 'cl-control-welcome-card')) {
  window.customCards.push({
    type: 'cl-control-welcome-card',
    name: 'CL Control Welcome',
    description: 'Benvenuto personalizzato CL Control basato sull’utente Home Assistant.',
  });
}

export {CLControlWelcomeCard};

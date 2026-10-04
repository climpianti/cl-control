const WEATHER = {
  'clear-night': ['mdi:weather-night', 'Sereno'],
  cloudy: ['mdi:weather-cloudy', 'Nuvoloso'],
  exceptional: ['mdi:alert-circle-outline', 'Eccezionale'],
  fog: ['mdi:weather-fog', 'Nebbia'],
  hail: ['mdi:weather-hail', 'Grandine'],
  lightning: ['mdi:weather-lightning', 'Temporale'],
  'lightning-rainy': ['mdi:weather-lightning-rainy', 'Temporale'],
  partlycloudy: ['mdi:weather-partly-cloudy', 'Parzialmente nuvoloso'],
  pouring: ['mdi:weather-pouring', 'Pioggia intensa'],
  rainy: ['mdi:weather-rainy', 'Pioggia'],
  snowy: ['mdi:weather-snowy', 'Neve'],
  'snowy-rainy': ['mdi:weather-snowy-rainy', 'Nevischio'],
  sunny: ['mdi:weather-sunny', 'Sereno'],
  windy: ['mdi:weather-windy', 'Ventoso'],
  'windy-variant': ['mdi:weather-windy-variant', 'Vento forte'],
};

const esc = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

class CLControlHeaderCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
    this._hass = null;
  }

  setConfig(config) {
    this._config = { ...config };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  getCardSize() { return 2; }

  _goHome() {
    if (this._config?.is_home) return;
    const url = new URL(window.location.href);
    const parts = url.pathname.split('/').filter(Boolean);
    if (!parts.length) return;
    parts[parts.length - 1] = 'home';
    const target = `/${parts.join('/')}`;
    if (url.pathname === target) return;
    window.history.pushState(null, '', target);
    window.dispatchEvent(new Event('location-changed'));
  }

  _moreInfo(entityId) {
    this.dispatchEvent(new CustomEvent('hass-more-info', {
      bubbles: true,
      composed: true,
      detail: { entityId },
    }));
  }

  _render() {
    if (!this.shadowRoot) return;
    const cfg = this._config || {};
    const entityId = String(cfg.weather_entity || '');
    const weather = entityId && this._hass?.states ? this._hass.states[entityId] : null;
    const [weatherIcon, weatherLabel] = WEATHER[String(weather?.state || '')] || ['mdi:weather-partly-cloudy', String(weather?.state || 'Meteo')];
    const temp = weather?.attributes?.temperature;
    const unit = weather?.attributes?.temperature_unit || this._hass?.config?.unit_system?.temperature || '°C';
    const tempText = temp === undefined || temp === null || temp === '' ? '' : `${temp} ${unit}`;
    const weatherHtml = entityId ? `
      <button class="weather" type="button" title="Apri meteo" ${weather ? '' : 'disabled'}>
        <ha-icon icon="${esc(weatherIcon)}"></ha-icon>
        <span class="weatherText">
          <b>${esc(tempText || weatherLabel)}</b>
          <small>${esc(tempText ? weatherLabel : (weather ? '' : 'Non disponibile'))}</small>
        </span>
      </button>` : '';

    this.shadowRoot.innerHTML = `
      <style>
        :host{display:block}
        ha-card{padding:14px 16px;border-radius:var(--ha-card-border-radius,12px);overflow:hidden}
        .wrap{display:flex;align-items:center;gap:14px;min-height:86px}
        .brand{display:flex;align-items:center;gap:14px;min-width:0;flex:1}
        .logoButton{border:0;background:transparent;padding:0;margin:0;display:block;flex:0 0 84px;cursor:pointer;border-radius:10px}.logoButton:focus-visible{outline:2px solid var(--primary-color);outline-offset:3px}
        .logo{width:84px;height:84px;object-fit:contain;display:block}
        .fallback{width:84px;height:84px;display:grid;place-items:center;font-weight:800;line-height:1;text-align:center}
        .titles{min-width:0;display:flex;flex-direction:column;justify-content:center}
        .title{font-size:18px;font-weight:700;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .site{font-size:14px;color:var(--secondary-text-color);margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .weather{border:0;background:transparent;color:var(--primary-text-color);display:flex;align-items:center;gap:9px;padding:8px 2px 8px 12px;cursor:pointer;min-width:0;text-align:left}
        .weather:disabled{cursor:default;opacity:.55}
        .weather ha-icon{--mdc-icon-size:34px;color:var(--state-weather-sunny-color,var(--primary-color));flex:0 0 auto}
        .weatherText{display:flex;flex-direction:column;align-items:flex-start;min-width:0;max-width:150px}
        .weatherText b{font-size:16px;line-height:1.15;white-space:nowrap}
        .weatherText small{font-size:12px;color:var(--secondary-text-color);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
        @media (max-width:520px){
          ha-card{padding:12px 14px}
          .wrap{gap:10px;min-height:80px}
          .brand{gap:10px}
          .logoButton{flex-basis:78px}.logo,.fallback{width:78px;height:78px}
          .title{font-size:16px}
          .site{font-size:13px;margin-top:4px}
          .weather{padding-left:6px;gap:6px}
          .weather ha-icon{--mdc-icon-size:30px}
          .weatherText{max-width:92px}
          .weatherText b{font-size:14px}
          .weatherText small{font-size:11px}
        }
      </style>
      <ha-card>
        <div class="wrap">
          <div class="brand">
            <button class="logoButton" type="button" title="Torna alla Home" aria-label="Torna alla Home CL Control">${cfg.logo ? `<img class="logo" src="${esc(cfg.logo)}" alt="CL Impianti">` : '<div class="fallback">CL<br>Impianti</div>'}</button>
            <div class="titles">
              <div class="title">${esc(cfg.title || 'CL Control')}</div>
              <div class="site">${esc(cfg.site_name || 'Casa')}</div>
            </div>
          </div>
          ${weatherHtml}
        </div>
      </ha-card>`;

    this.shadowRoot.querySelector('.logoButton')?.addEventListener('click', () => this._goHome());
    this.shadowRoot.querySelector('.weather')?.addEventListener('click', () => {
      if (weather && entityId) this._moreInfo(entityId);
    });
  }
}

if (!customElements.get('cl-control-header-card')) {
  customElements.define('cl-control-header-card', CLControlHeaderCard);
}

window.customCards = window.customCards || [];
if (!window.customCards.some(card => card.type === 'cl-control-header-card')) {
  window.customCards.push({
    type: 'cl-control-header-card',
    name: 'CL Control Header',
    description: 'Intestazione compatta CL Control con meteo integrato.',
  });
}

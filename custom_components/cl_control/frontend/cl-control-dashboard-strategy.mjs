// Optional Home Assistant dashboard strategy backed by the same CL Control runtime.
import './cl-control-panel.js';

const CARD_TAG = 'cl-control-dashboard-card';
const STRATEGY_TAG = 'll-strategy-dashboard-cl-control';

class CLControlDashboardCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._panel = document.createElement('cl-control-panel');
    this._panel.setAttribute('dashboard-context', '');
    this.shadowRoot.append(this._panel);
  }

  setConfig(config = {}) {
    this._config = { ...config };
    this._panel.panel = { config: { dashboard_context: true } };
  }

  set hass(value) { this._panel.hass = value; }
  get hass() { return this._panel.hass; }
  getCardSize() { return 12; }
}

class CLControlDashboardStrategy extends HTMLElement {
  static noEditor = true;

  static getCreateSuggestions(hass) {
    return { title: 'CL Control', icon: 'mdi:home-automation' };
  }

  static async generate(config = {}) {
    return {
      title: config.title || 'CL Control',
      views: [{
        title: config.home_title || 'Panoramica',
        path: 'home',
        panel: true,
        cards: [{ type: 'custom:cl-control-dashboard-card' }],
      }],
    };
  }
}

if (!customElements.get(CARD_TAG)) customElements.define(CARD_TAG, CLControlDashboardCard);
if (!customElements.get(STRATEGY_TAG)) customElements.define(STRATEGY_TAG, CLControlDashboardStrategy);

window.customCards = window.customCards || [];
if (!window.customCards.some(card => card.type === CARD_TAG)) {
  window.customCards.push({ type: CARD_TAG, name: 'CL Control', description: 'Dashboard CL Control con runtime condiviso.' });
}

window.customStrategies = window.customStrategies || [];
if (!window.customStrategies.some(strategy => strategy.type === 'cl-control' && strategy.strategyType === 'dashboard')) {
  window.customStrategies.push({
    type: 'cl-control',
    strategyType: 'dashboard',
    name: 'CL Control',
    description: 'Panoramica, aree e moduli CL Control nello spazio dashboard Home Assistant.',
    documentationURL: 'https://github.com/climpianti/cl-control',
  });
}

export { CLControlDashboardCard, CLControlDashboardStrategy };

import './cl-control-security-card.mjs';
import './cl-control-header-card.mjs';
import './cl-control-entity-search-card.mjs';
import './cl-control-installer-card.mjs';
import './cl-control-discovery-card.mjs';
import './cl-control-modbus-card.mjs';
import './cl-control-assistance-card.mjs';
import './cl-control-welcome-card.mjs';
import './cl-control-home-card.mjs';
import './cl-control-area-pro-card.mjs';
import './cl-control-home-favorites-card.mjs';
import './cl-control-energy-card.mjs';
import './cl-control-light-memories-card.mjs';
import './cl-control-switch-glass-card.mjs';
import './cl-control-mode-glass-card.mjs';
import './cl-control-command-glass-card.mjs';
import './cl-control-preset-manager-card.mjs';
import './cl-control-media-card.mjs';
import './cl-control-cover-card.mjs';
import './cl-control-climate-card.mjs';
import './cl-control-climate-glass-card.mjs';

// CL Control 3.5 lightweight Home Assistant dashboard strategy.
// The backend returns native Lovelace configuration; Home Assistant owns
// rendering, state updates, gestures, responsiveness and more-info dialogs.

const STRATEGY_TAG = 'll-strategy-dashboard-cl-control';
const NATIVE_SURFACES = new Set(['tile', 'area', 'picture-entity', 'button', 'shortcut']);

function styleNativeCards(config) {
  if (!config || typeof config !== 'object') return config;
  if (NATIVE_SURFACES.has(config.type)) {
    const { grid_options, visibility, ...card } = config;
    return {
      type: 'custom:cl-control-home-surface', card,
      ...(grid_options ? { grid_options } : {}),
      ...(visibility ? { visibility } : {}),
    };
  }
  if (config.type === 'custom:cl-control-home-surface') return config;
  const styled = { ...config };
  for (const key of ['views', 'sections', 'cards']) {
    if (Array.isArray(config[key])) styled[key] = config[key].map(styleNativeCards);
  }
  if (config.card) styled.card = styleNativeCards(config.card);
  return styled;
}

class CLControlDashboardStrategy extends HTMLElement {
  static noEditor = true;

  static getCreateSuggestions() {
    return { title: 'CL Control', icon: 'mdi:home-automation' };
  }

  static async generate(config = {}, hass) {
    if (!hass || typeof hass.callWS !== 'function') {
      throw new Error('CL Control native dashboard requires Home Assistant');
    }

    const response = await hass.callWS({
      type: 'cl_control/dashboard/native_config',
    });
    const generated = response?.config;
    if (!generated || !Array.isArray(generated.views)) {
      throw new Error('CL Control native dashboard configuration is unavailable');
    }

    return {
      ...styleNativeCards(generated),
      title: config.title || generated.title || 'CL Control',
    };
  }
}

if (!customElements.get(STRATEGY_TAG)) {
  customElements.define(STRATEGY_TAG, CLControlDashboardStrategy);
}

window.customStrategies = window.customStrategies || [];
if (!window.customStrategies.some(
  strategy => strategy.type === 'cl-control' && strategy.strategyType === 'dashboard'
)) {
  window.customStrategies.push({
    type: 'cl-control',
    strategyType: 'dashboard',
    name: 'CL Control',
    description: 'Dashboard CL Control leggera basata su Sections e card native Home Assistant.',
    documentationURL: 'https://github.com/climpianti/cl-control',
  });
}

export { CLControlDashboardStrategy };

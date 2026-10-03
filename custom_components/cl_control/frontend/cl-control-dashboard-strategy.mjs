// CL Control 3.5 lightweight Home Assistant dashboard strategy.
// The backend returns native Lovelace configuration; Home Assistant owns
// rendering, state updates, gestures, responsiveness and more-info dialogs.

const STRATEGY_TAG = 'll-strategy-dashboard-cl-control';

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
      ...generated,
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

// CL Control assistance shortcut.
// Uses a real anchor instead of a Lovelace tap_action so external WhatsApp
// handoffs behave consistently in Home, Area and System subviews.

class CLControlAssistanceCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
  }

  setConfig(config) {
    if (!config || !config.url) {
      throw new Error('CL Control Assistance requires a URL');
    }
    this._config = { ...config };
    this._render();
  }

  set hass(value) {
    this._hass = value;
  }

  getCardSize() {
    return 1;
  }

  getGridOptions() {
    return {
      columns: 'full',
      rows: 'auto',
      min_rows: 1,
    };
  }

  _render() {
    if (!this.shadowRoot) return;
    this.shadowRoot.replaceChildren();

    const style = document.createElement('style');
    style.textContent = `
      :host {
        display: block;
        width: 100%;
        min-width: 0;
        --primary-text-color: #f5f7fc;
        --secondary-text-color: #bdcadd;
        --primary-color: #78c5ff;
      }
      a {
        box-sizing: border-box;
        width: 100%;
        min-height: 72px;
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 14px 18px;
        text-decoration: none;
        color: var(--primary-text-color);
        background: radial-gradient(ellipse at 0% 0%,#29496a66,transparent 75%),linear-gradient(115deg,#18222b,#121721 60%,#211c30);
        border: 1px solid #b2daff55;
        border-radius: 25px;
        box-shadow: 0 9px 25px #0004,inset 0 1px 2px #e7f7ff33;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
      }
      a:focus-visible {
        outline: 2px solid var(--primary-color);
        outline-offset: 2px;
      }
      .icon {
        width: 42px;
        height: 42px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
        color: var(--primary-color);
        border: 1px solid #b2daff55;
        border-radius: 14px;
        background: linear-gradient(145deg,#478ccc44,#70439933);
      }
      ha-icon {
        --mdc-icon-size: 32px;
      }
      .copy {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 3px;
      }
      .title {
        font-size: 16px;
        line-height: 1.25;
        font-weight: 600;
        overflow-wrap: anywhere;
      }
      .subtitle {
        font-size: 13px;
        line-height: 1.3;
        color: var(--secondary-text-color);
        overflow-wrap: anywhere;
        white-space: normal;
      }
      @media(max-width:520px){a{gap:12px;padding:13px 15px}.icon{width:40px;height:40px}.title{font-size:15px}.subtitle{font-size:12px}}
    `;

    const link = document.createElement('a');
    link.href = String(this._config.url);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', String(this._config.label || 'Assistenza CL'));

    const iconBox = document.createElement('div');
    iconBox.className = 'icon';
    const icon = document.createElement('ha-icon');
    icon.setAttribute('icon', String(this._config.icon || 'mdi:headset'));
    iconBox.appendChild(icon);

    const copy = document.createElement('div');
    copy.className = 'copy';
    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = String(this._config.label || 'Assistenza CL');
    const subtitle = document.createElement('div');
    subtitle.className = 'subtitle';
    subtitle.textContent = String(this._config.subtitle || 'Supporto rapido CL Impianti');
    copy.append(title, subtitle);

    link.append(iconBox, copy);
    this.shadowRoot.append(style, link);
  }
}

if (!customElements.get('cl-control-assistance-card')) {
  customElements.define('cl-control-assistance-card', CLControlAssistanceCard);
}

export { CLControlAssistanceCard };

import { GLASS_SURFACE } from './cl-control-glass.mjs';
const ALARM_FEATURES = Object.freeze({
  arm_home: 1,
  arm_away: 2,
  arm_night: 4,
  arm_vacation: 8,
  arm_custom_bypass: 32,
});

const ALARM_COMMANDS = Object.freeze([
  ['arm_away', 'Inserisci', 2],
  ['arm_home', 'Parziale', 1],
  ['arm_night', 'Notte', 4],
  ['arm_vacation', 'Vacanza', 8],
  ['arm_custom_bypass', 'Personalizzato', 32],
  ['disarm', 'Disinserisci', 0],
]);


const LOCKS = [
  ['partial','Inserisci parziale','mdi:lock'],
  ['disarmed','Disinserisci','mdi:lock-open-variant'],
  ['total','Inserisci totale','mdi:lock'],
];
const PANEL_LOCK = {arm_home:'partial',disarm:'disarmed',arm_away:'total'};
const VISIBILITY_EVENT = 'cl-control-security-visibility';

function lockMode(mode) {
  if (isDisarmPartitionMode(mode)) return 'disarmed';
  const label = partitionModeLabel(mode);
  return label === 'Parziale' ? 'partial' : label === 'Totale' ? 'total' : '';
}

function isAvailable(state) {
  return Boolean(state) && !['unknown','unavailable'].includes(state);
}

function partitionOptions(entity) {
  const options = entity?.attributes?.options;
  return Array.isArray(options)
    ? [...new Set(options.filter(option => typeof option === 'string' && option.trim()))]
    : [];
}

function normalizePartitionMode(value) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replaceAll('_', ' ')
    .replaceAll('-', ' ')
    .replace(/\s+/g, ' ');
}

function partitionModeLabel(value, {action = false} = {}) {
  const mode = normalizePartitionMode(value);
  const labels = {
    'TOTAL': 'Totale',
    'ARM AWAY': 'Totale',
    'ARMED AWAY': 'Totale',
    'AWAY': 'Totale',
    'PARTIAL': 'Parziale',
    'ARM HOME': 'Parziale',
    'ARMED HOME': 'Parziale',
    'HOME': 'Parziale',
    'ARM STAY': 'Parziale',
    'ARMED STAY': 'Parziale',
    'STAY': 'Parziale',
    'INSTANT': 'Istantaneo',
    'ARM INSTANT': 'Istantaneo',
    'ARM AWAY INSTANT': 'Totale istantaneo',
    'ARM HOME INSTANT': 'Parziale istantaneo',
    'NIGHT': 'Notte',
    'ARM NIGHT': 'Notte',
    'ARMED NIGHT': 'Notte',
    'DISARMED': action ? 'Disinserisci' : 'Disinserita',
    'DISARM': action ? 'Disinserisci' : 'Disinserita',
    'DISINSERITA': action ? 'Disinserisci' : 'Disinserita',
    'DISINSERITO': action ? 'Disinserisci' : 'Disinserita',
  };
  return labels[mode] || pretty(value);
}

function isDisarmPartitionMode(value) {
  return ['DISARMED', 'DISARM', 'DISINSERITA', 'DISINSERITO'].includes(
    normalizePartitionMode(value),
  );
}

const ALARM_STATES = Object.freeze({
  disarmed: 'Disinserito',
  armed_home: 'Parziale',
  armed_away: 'Totale',
  armed_night: 'Notte',
  armed_vacation: 'Vacanza',
  armed_custom_bypass: 'Personalizzato',
  arming: 'Inserimento in corso',
  pending: 'In attesa',
  triggered: 'ALLARME',
  unavailable: 'Non disponibile',
  unknown: 'Sconosciuto',
});

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function pretty(value) {
  return String(value ?? '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

function zoneLabel(deviceClass, active) {
  const labels = {
    door: active ? 'Aperta' : 'Chiusa',
    window: active ? 'Aperta' : 'Chiusa',
    garage_door: active ? 'Aperto' : 'Chiuso',
    opening: active ? 'Aperta' : 'Chiusa',
    motion: active ? 'Movimento' : 'Riposo',
    occupancy: active ? 'Presenza' : 'Libera',
    smoke: active ? 'Fumo rilevato' : 'Regolare',
    moisture: active ? 'Perdita rilevata' : 'Asciutta',
    gas: active ? 'Gas rilevato' : 'Regolare',
    tamper: active ? 'Manomissione' : 'Regolare',
    vibration: active ? 'Vibrazione' : 'Riposo',
  };
  return labels[deviceClass] || (active ? 'Attiva' : 'Regolare');
}

function zoneType(deviceClass) {
  return ({
    door: 'Porta',
    window: 'Finestra',
    garage_door: 'Garage',
    opening: 'Apertura',
    motion: 'Movimento',
    occupancy: 'Presenza',
    smoke: 'Fumo',
    moisture: 'Allagamento',
    gas: 'Gas',
    tamper: 'Manomissione',
    vibration: 'Vibrazione',
    generic: 'Zona sicurezza',
  })[deviceClass] || 'Zona sicurezza';
}

function zoneIcon(deviceClass) {
  return ({
    door: 'mdi:door-closed',
    window: 'mdi:window-closed-variant',
    garage_door: 'mdi:garage',
    opening: 'mdi:door',
    motion: 'mdi:motion-sensor',
    occupancy: 'mdi:account-check-outline',
    smoke: 'mdi:smoke-detector',
    moisture: 'mdi:water-alert-outline',
    gas: 'mdi:gas-cylinder',
    tamper: 'mdi:shield-alert-outline',
    vibration: 'mdi:vibrate',
  })[deviceClass] || 'mdi:shield-outline';
}

class CLSecurityCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode: 'open'});
    this._hass = null;
    this._config = {panels: [], partitions: [], zones: [], pin_configured: false, group_by_floor: true};
    this._busy = new Set();
    this._pending = new Map();
    this._modeNotice = '';
    this._hidden = new Set();
    this._visibilityKey = '';
    this._onVisibility = event => {
      if (!this._visibilityKey || (event.detail?.key ?? event.key) !== this._visibilityKey) return;
      this._loadVisibility();
      this._render();
    };
    this._openControls = new Set();
    this.shadowRoot.innerHTML = `
      <style>
        :host{display:block;--cl-sec-gap:12px}
        ha-card{overflow:hidden;padding:18px;color:var(--primary-text-color);${GLASS_SURFACE}}
        .header{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:14px}.headerCopy{min-width:0}.header h2{margin:0;font-size:21px}.header p{margin:4px 0 0;color:var(--secondary-text-color);font-size:13px}.shield{display:grid;place-items:center;width:40px;height:40px;border-radius:14px;background:color-mix(in srgb,var(--primary-color) 10%,transparent);color:var(--primary-color)}.shield ha-icon{--mdc-icon-size:24px}
        .summaryGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:0 0 16px}.summary{padding:10px 11px;border:1px solid var(--divider-color);border-radius:13px;background:var(--secondary-background-color)}.summary b{display:block;font-size:17px}.summary small{display:block;margin-top:2px;color:var(--secondary-text-color);font-size:11px}.summary.attention b{color:var(--warning-color,#f59e0b)}
        .notice{margin:0 0 14px;padding:10px 12px;border-radius:12px;background:color-mix(in srgb,var(--warning-color,#f59e0b) 14%,transparent);border:1px solid color-mix(in srgb,var(--warning-color,#f59e0b) 45%,transparent);font-size:13px}
        .floorGroup+.floorGroup{margin-top:18px}.floorTitle{display:flex;align-items:center;gap:8px;margin:0 0 9px;font-size:16px;font-weight:700}.floorTitle ha-icon{--mdc-icon-size:20px;color:var(--primary-color)}.areaGroup{padding:13px;border:1px solid var(--divider-color);border-radius:16px;background:color-mix(in srgb,var(--secondary-background-color) 45%,transparent)}.areaGroup+.areaGroup{margin-top:10px}.areaHeader{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}.areaHeader h3{margin:0;font-size:15px}.areaCount{font-size:11px;color:var(--secondary-text-color)}
        .subTitle{display:flex;align-items:center;gap:7px;margin:12px 0 7px;font-size:12px;font-weight:700;color:var(--secondary-text-color);text-transform:uppercase;letter-spacing:.03em}.subTitle:first-child{margin-top:0}.subTitle ha-icon{--mdc-icon-size:16px}
        .panelGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,270px),1fr));gap:var(--cl-sec-gap)}.panel{padding:13px;border:1px solid var(--divider-color);border-radius:14px;background:var(--ha-card-background,var(--card-background-color));box-shadow:0 1px 2px rgba(0,0,0,.04)}.panelTop{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.panelName{font-weight:700}.panelArea{margin-top:3px;color:var(--secondary-text-color);font-size:12px}.alarmState{padding:5px 9px;border-radius:999px;font-size:12px;font-weight:700;background:var(--secondary-background-color)}.alarmState.triggered{background:color-mix(in srgb,var(--error-color,#db4437) 18%,transparent);color:var(--error-color,#db4437)}.alarmState.armed{background:color-mix(in srgb,var(--warning-color,#f59e0b) 16%,transparent);color:var(--warning-color,#f59e0b)}
        .actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:11px}.cmd{min-height:38px;padding:0 12px;border-radius:10px;border:1px solid var(--divider-color);background:var(--primary-background-color);color:var(--primary-text-color);font:inherit;cursor:pointer}.cmd.primary{background:color-mix(in srgb,var(--primary-color) 12%,transparent);border-color:color-mix(in srgb,var(--primary-color) 42%,transparent);color:var(--primary-color)}.cmd.danger{background:color-mix(in srgb,var(--error-color,#db4437) 10%,transparent);border-color:color-mix(in srgb,var(--error-color,#db4437) 38%,transparent);color:var(--error-color,#db4437)}.cmd:disabled{opacity:.45;cursor:not-allowed}
        .partitionList,.zoneList{display:grid;gap:9px}.partitionCard{padding:13px;border:1px solid var(--divider-color);border-radius:14px;background:var(--ha-card-background,var(--card-background-color));box-shadow:0 1px 2px rgba(0,0,0,.04)}.partitionTop{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.partitionIdentity{display:flex;align-items:center;gap:10px;min-width:0}.partitionIcon{display:grid;place-items:center;width:38px;height:38px;border-radius:12px;background:color-mix(in srgb,var(--primary-color) 9%,transparent);color:var(--primary-color);flex:0 0 auto}.partitionIcon ha-icon{--mdc-icon-size:21px}.partitionCopy{min-width:0}.partitionCopy b,.partitionCopy small{display:block}.partitionCopy b{font-size:14px}.partitionCopy small{margin-top:3px;color:var(--secondary-text-color);font-size:11px;overflow:hidden;text-overflow:ellipsis}.partitionState{padding:5px 9px;border-radius:999px;font-size:12px;font-weight:700;background:var(--secondary-background-color);white-space:nowrap}.partitionState.armed{background:color-mix(in srgb,var(--warning-color,#f59e0b) 14%,transparent);color:var(--warning-color,#f59e0b)}.partitionState.disarmed{background:color-mix(in srgb,var(--success-color,#43a047) 12%,transparent);color:var(--success-color,#43a047)}.partitionState.bad{background:color-mix(in srgb,var(--error-color,#db4437) 12%,transparent);color:var(--error-color,#db4437)}.partitionActions{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin-top:11px}.partitionActions .cmd{min-width:0;padding:0 8px}.partitionActions .cmd.active{box-shadow:inset 0 0 0 1px currentColor;font-weight:700}
        .zone{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;min-height:52px;padding:9px 10px;border:1px solid var(--divider-color);border-radius:12px;background:var(--ha-card-background,var(--card-background-color))}.zoneIcon{display:grid;place-items:center;width:34px;height:34px;border-radius:10px;background:var(--secondary-background-color);color:var(--secondary-text-color)}.zoneIcon ha-icon{--mdc-icon-size:19px}.zone.attention{border-color:color-mix(in srgb,var(--warning-color,#f59e0b) 55%,var(--divider-color));background:color-mix(in srgb,var(--warning-color,#f59e0b) 7%,var(--card-background-color))}.zone.attention .zoneIcon{color:var(--warning-color,#f59e0b)}.zone.bypassed{border-color:color-mix(in srgb,var(--primary-color) 48%,var(--divider-color));background:color-mix(in srgb,var(--primary-color) 6%,var(--card-background-color))}.zone.bypassed .zoneIcon{color:var(--primary-color)}.zone.unavailable{opacity:.65}.zone b,.zone small{display:block}.zone small{margin-top:3px;color:var(--secondary-text-color);font-size:12px}.zoneRight{display:flex;align-items:center;gap:10px}.zoneState{font-size:12px;font-weight:700;white-space:nowrap}.zoneState.warn{color:var(--warning-color,#f59e0b)}.zoneState.bad{color:var(--error-color,#db4437)}
        .toggle{position:relative;width:44px;height:24px;border:0;padding:0;border-radius:999px;background:var(--disabled-color,#777);cursor:pointer;transition:.16s}.toggle:before{content:'';position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:white;transition:.16s}.toggle.on{background:var(--primary-color)}.toggle.on:before{transform:translateX(20px)}.toggle:disabled{opacity:.45;cursor:not-allowed}
        .empty{padding:14px;border:1px dashed var(--divider-color);border-radius:12px;color:var(--secondary-text-color);font-size:13px}
        .overlay{position:fixed;inset:0;z-index:1000;display:none;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,.45)}.overlay.open{display:flex}.dialog{width:min(100%,420px);padding:18px;border-radius:18px;background:var(--ha-card-background,var(--card-background-color));box-shadow:0 18px 50px rgba(0,0,0,.3)}.dialog h3{margin:0 0 5px}.dialog p{margin:0 0 14px;color:var(--secondary-text-color);font-size:13px}.dialog input{box-sizing:border-box;width:100%;height:46px;padding:0 12px;border:1px solid var(--divider-color);border-radius:10px;background:var(--primary-background-color);color:var(--primary-text-color);font:inherit;font-size:20px;letter-spacing:.12em}.dialogActions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}.dialogError{min-height:18px;margin-top:8px;color:var(--error-color,#db4437);font-size:12px}
        @media(max-width:700px){ha-card{padding:13px}.summaryGrid{grid-template-columns:repeat(2,minmax(0,1fr))}.areaGroup{padding:10px}.zone{grid-template-columns:auto minmax(0,1fr)}.zoneRight{grid-column:2;justify-content:space-between}.actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.cmd{width:100%}.partitionActions{grid-template-columns:repeat(2,minmax(0,1fr))}}
        /* Glass presentation only: existing PIN and command handlers are retained. */
        :host{--primary-text-color:#f5f7fc;--secondary-text-color:#bdcadd;--divider-color:#ffffff20;--secondary-background-color:#ffffff0c;--primary-background-color:#121721;--card-background-color:#18222b;--ha-card-background:#18222b;--primary-color:#9b83ff;--error-color:#ff8599;--warning-color:#ffd08a;--success-color:#7bdec3}
        ha-card{border-radius:25px;${GLASS_SURFACE}}
        .panel,.partitionCard{border-radius:20px;background:linear-gradient(120deg,#ffffff08,#9b83ff08);box-shadow:inset 0 1px 1px #ffffff18}
        .areaGroup{background:transparent;border-color:#ffffff18;border-radius:20px}.zone{background:#ffffff06;border-radius:15px}.summary{background:#ffffff08;border-radius:16px}.summary.attention{border-color:#ffd08a88}
        .partitionIcon,.shield,.zoneIcon{background:linear-gradient(140deg,#39adff22,#bd65f322);color:#c5caff;border:1px solid #b2daff33}
        .cmd{min-height:44px;border-radius:12px}.cmd.primary{background:linear-gradient(120deg,#256ba466,#65439e66);color:#f5f7fc}.cmd.danger{background:#ff859918;color:#ffc2cc;border-color:#ff85994d}
        .securityControls{margin-top:10px;border-top:1px solid #ffffff18}.securityControls summary{min-height:44px;display:flex;align-items:center;cursor:pointer;color:#bdcadd;font-size:13px}.securityControls summary:before{content:'▸';margin-right:8px}.securityControls[open] summary:before{content:'▾'}.securityControls summary:focus-visible{outline:2px solid #67c5ff;outline-offset:2px}
        .dialog{background:linear-gradient(120deg,#18222b,#211a29);border:1px solid #b2daff66;color:#f5f7fc;border-radius:25px}.partitionTop,.panelTop{flex-wrap:wrap}.partitionCopy b,.panelName{overflow-wrap:anywhere}.toggle{min-height:44px}.partitionActions{grid-template-columns:repeat(auto-fit,minmax(min(100%,95px),1fr))}

        .header{align-items:center;flex-wrap:wrap}.headerCopy{flex:1}.header .cmd{width:auto}
        .summaryGrid{grid-template-columns:repeat(auto-fit,minmax(106px,1fr))}
        .partitionCard,.panel{padding:7px 9px;border-radius:13px;background:linear-gradient(116deg,#18324a,#151e32)}
        .panelGrid{grid-template-columns:1fr}
        .securityRow{display:flex;align-items:center;justify-content:space-between;gap:6px}
        .securityIdentity{min-width:0}.securityIdentity b,.securityIdentity small{display:block;overflow-wrap:anywhere}
        .securityIdentity small{font-size:12px;color:#bdcadd}
        .securityIdentity .armed,.securityIdentity .pending{color:#ffd075}
        .securityIdentity .disarmed{color:#71e5ab}.securityIdentity .bad,.securityIdentity .triggered{color:#ff9aa5}
        .quickModes{display:flex;flex:none}
        .quickLock{display:grid;place-items:center;width:44px;height:44px;padding:0;border:0;border-radius:10px;background:transparent;cursor:pointer}
        .quickLock:disabled{cursor:default}.quickLock:disabled:not([data-current="true"]){opacity:.58}
        .quickLock:focus-visible{outline:2px solid #8bcfff;outline-offset:1px}
        .quickLock.partial{--lock-color:#ffc45c}.quickLock.disarmed{--lock-color:#51e494}.quickLock.total{--lock-color:#ff7d88}
        .lockDisc{display:grid;place-items:center;width:32px;height:32px;border:1px solid transparent;border-radius:50%;background:#273241;color:color-mix(in srgb,var(--lock-color) 75%,#adbac7)}
        .lockDisc ha-icon{--mdc-icon-size:17px}
        .quickLock[data-current="true"] .lockDisc{color:var(--lock-color);border-color:currentColor;background:color-mix(in srgb,var(--lock-color) 14%,#0b1726);box-shadow:0 0 7px color-mix(in srgb,var(--lock-color) 35%,transparent),inset 0 0 5px color-mix(in srgb,var(--lock-color) 18%,transparent)}
        .securityControls{margin-top:4px}.securityControls summary{min-height:36px}
        .visibility{border:1px solid #6398c780;background:#112337;border-radius:14px;padding:12px;margin-bottom:14px}
        .visibility h3{margin:0}.visibility p,.visibleCount{color:#bdcadd;font-size:12px;margin:5px 0}
        .visibilityList{display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:4px 10px;margin:8px 0}
        .visibilityList label{min-height:44px;display:flex;align-items:center;gap:8px;overflow-wrap:anywhere}.visibilityList input{accent-color:#8bcfff;width:17px;height:17px;flex:none}
        .visibilityActions{display:flex;flex-wrap:wrap;gap:8px}.visibilityActions .cmd{width:auto}
        .zoneDetails>summary{font-size:13px;color:#d4e7ff;min-height:42px;align-content:center;cursor:pointer}
        @media(max-width:430px){.header .cmd{flex:1 1 100%}.areaGroup{padding:7px}.partitionCard,.panel{padding:6px 7px}}
      </style>
      <ha-card><div id="overview"></div><div id="visibility"></div><div id="main"></div></ha-card>
      <div id="overlay" class="overlay" aria-hidden="true"></div>
    `;
  }


  connectedCallback() {
    window.addEventListener(VISIBILITY_EVENT, this._onVisibility);
    window.addEventListener('storage', this._onVisibility);
    this._loadVisibility();
    this._render();
  }

  disconnectedCallback() {
    window.removeEventListener(VISIBILITY_EVENT, this._onVisibility);
    window.removeEventListener('storage', this._onVisibility);
    for (const id of this._pending.keys()) this._clearPending(id);
  }

  _items() { return [...this._config.partitions, ...this._config.panels]; }

  _loadVisibility() {
    if (!this._visibilityKey) return;
    try {
      const hidden = JSON.parse(localStorage.getItem(this._visibilityKey) || '[]');
      this._hidden = new Set(Array.isArray(hidden) ? hidden.filter(id => typeof id === 'string') : []);
    } catch {
      // Keep the in-memory selection when storage is unavailable.
    }
  }

  _editVisibility() {
    const host = this.shadowRoot.getElementById('visibility');
    if (host.firstChild) { host.replaceChildren(); this._render(); return; }
    host.innerHTML = `<form class="visibility"><h3>Partizioni visibili</h3><p>Il riepilogo include anche le partizioni nascoste.</p><div class="visibilityList">${this._items().map(item => `<label><input type="checkbox" value="${esc(item.entity_id)}" ${this._hidden.has(item.entity_id) ? '' : 'checked'}><span>${esc(item.name)}</span></label>`).join('')}</div><div class="visibilityActions"><button type="button" class="cmd">Annulla</button><button type="submit" class="cmd primary">Applica</button></div></form>`;
    const form = host.firstElementChild;
    const close = () => {
      host.replaceChildren();
      this._render();
      this.shadowRoot.querySelector('[data-visibility]')?.focus();
    };
    form.querySelector('button[type=button]').onclick = close;
    form.onsubmit = event => {
      event.preventDefault();
      const hidden = new Set(this._hidden);
      for (const input of form.querySelectorAll('input')) {
        if (input.checked) hidden.delete(input.value);
        else hidden.add(input.value);
      }
      this._hidden = hidden;
      if (this._visibilityKey) {
        try {
          localStorage.setItem(this._visibilityKey, JSON.stringify([...hidden]));
          window.dispatchEvent(new CustomEvent(VISIBILITY_EVENT, {detail:{key:this._visibilityKey}}));
        } catch {
          // Apply to the current card even when storage is unavailable.
        }
      }
      close();
    };
    this.shadowRoot.querySelector('[data-visibility]')?.setAttribute('aria-expanded','true');
    form.querySelector('input')?.focus();
  }

  setConfig(config) {
    this._config = {
      title: config?.title || 'Sicurezza',
      panels: Array.isArray(config?.panels) ? config.panels : [],
      partitions: Array.isArray(config?.partitions) ? config.partitions : [],
      zones: Array.isArray(config?.zones) ? config.zones : [],
      pin_configured: Boolean(config?.pin_configured),
      group_by_floor: config?.group_by_floor !== false,
    };
    this._render();
  }

  set hass(value) {
    this._hass = value;
    const key = value?.user?.id ? 'cl-control.security.hidden:' + value.user.id : '';
    if (key !== this._visibilityKey) {
      this._visibilityKey = key;
      this._hidden = new Set();
      this.shadowRoot.getElementById('visibility').replaceChildren();
      this._loadVisibility();
    }
    for (const [id, pending] of this._pending) {
      const state = this._state(id)?.state;
      if (normalizePartitionMode(state) === pending.expected) this._clearPending(id);
    }
    this._render();
  }

  getCardSize() { return 8; }
  _state(entityId) { return this._hass?.states?.[entityId]; }

  _attentionCount() {
    return (this._config.zones || []).filter(zone => {
      const state = this._state(zone.entity_id)?.state;
      const bypass = zone.bypass_entity_id ? this._state(zone.bypass_entity_id)?.state === 'on' : false;
      return bypass || state === 'on' || ['unknown', 'unavailable'].includes(state);
    }).length;
  }

  _groupItems() {
    const groups = new Map();
    const add = (kind, item) => {
      const floorId = item.floor_id || '__no_floor__';
      const floorName = item.floor_name || 'Altre aree';
      const floorOrder = Number(item.floor_order ?? 1000000000);
      const areaId = item.area_id || '__unassigned__';
      const areaName = item.area_name || 'Altri dispositivi';
      if (!groups.has(floorId)) groups.set(floorId, {id: floorId, name: floorName, icon: item.floor_icon || (floorId === '__no_floor__' ? 'mdi:home-outline' : 'mdi:home-floor-1'), order: floorOrder, areas: new Map()});
      const floor = groups.get(floorId);
      if (!floor.areas.has(areaId)) floor.areas.set(areaId, {id: areaId, name: areaName, panels: [], partitions: [], zones: []});
      floor.areas.get(areaId)[kind].push(item);
    };
    for (const item of this._config.panels) if (!this._hidden.has(item.entity_id)) add('panels', item);
    for (const item of this._config.partitions) if (!this._hidden.has(item.entity_id)) add('partitions', item);
    for (const item of this._config.zones || []) add('zones', item);
    return [...groups.values()]
      .sort((a,b) => a.order - b.order || a.name.localeCompare(b.name, 'it'))
      .map(floor => ({...floor, areas: [...floor.areas.values()].sort((a,b) => a.name.localeCompare(b.name, 'it'))}));
  }

  _render() {
    const main = this.shadowRoot?.getElementById('main');
    if (!main) return;
    const cfg = this._config;
    const items = this._items();
    const states = items.map(item => this._state(item.entity_id)?.state);
    const disarmed = states.filter(state => isAvailable(state) && isDisarmPartitionMode(state)).length;
    const inserted = states.filter(state => isAvailable(state) && !isDisarmPartitionMode(state) &&
      !['triggered','arming','pending','disarming'].includes(state)).length;
    const offline = states.filter(state => !isAvailable(state)).length;
    const attention = this._attentionCount();
    const shown = items.filter(item => !this._hidden.has(item.entity_id)).length;
    const overview = this.shadowRoot.getElementById('overview');
    const editing = Boolean(this.shadowRoot.querySelector('#visibility form'));
    overview.innerHTML = `<div class="header"><div class="shield"><ha-icon icon="mdi:shield-home-outline"></ha-icon></div><div class="headerCopy"><h2>${esc(cfg.title)}</h2></div>${items.length ? `<button type="button" class="cmd" data-visibility aria-controls="visibility" aria-expanded="${editing}">Partizioni visibili</button>` : ''}</div>
      <div class="summaryGrid"><div class="summary"><b>${inserted}</b><small>Inserite</small></div><div class="summary"><b>${disarmed}</b><small>Disinserite</small></div><div class="summary ${offline ? 'attention' : ''}"><b>${offline}</b><small>Non disponibili</small></div><div class="summary ${attention ? 'attention' : ''}"><b>${attention}</b><small>Zone da verificare</small></div></div>
      ${this._modeNotice ? '<div class="notice" role="status">' + esc(this._modeNotice) + '</div>' : ''}
      ${states.includes('triggered') ? '<div class="notice" role="alert"><b>Allarme attivo</b></div>' : ''}
      ${items.length ? `<p class="visibleCount">${shown} di ${items.length} partizioni visibili</p>` : ''}
      ${cfg.pin_configured ? '' : '<div class="notice"><b>Codice Sicurezza non configurato.</b> Impostalo da CL Control → Installatore → Sicurezza per abilitare i comandi.</div>'}`;
    const visibilityButton = overview.querySelector('[data-visibility]');
    if (visibilityButton) visibilityButton.onclick = () => this._editVisibility();
    const groups = this._groupItems();
    main.innerHTML = groups.length ? groups.map(group => this._groupMarkup(group, cfg.group_by_floor)).join('') :
      '<div class="empty">Nessuna entità di sicurezza visibile.</div>';
    main.querySelectorAll('[data-controls]').forEach(details=>details.addEventListener('toggle',()=>{if(details.open)this._openControls.add(details.dataset.controls);else this._openControls.delete(details.dataset.controls);}));
    main.querySelectorAll('[data-panel-command]').forEach(button => button.addEventListener('click', () => this._panelCommand(button)));
    main.querySelectorAll('[data-partition-command]').forEach(button => button.addEventListener('click', () => this._partitionCommand(button)));
    main.querySelectorAll('[data-bypass-zone]').forEach(button => button.addEventListener('click', () => this._toggleBypass(button)));
  }

  _controlsMarkup(entityId, controls) {
    return `<details class="securityControls" data-controls="${esc(entityId)}" ${this._openControls.has(entityId)?'open':''}><summary>Altre modalità</summary>${controls}</details>`;
  }

  _groupMarkup(group, showFloor) {
    const areas = group.areas.map(area => this._areaMarkup(area)).join('');
    if (!showFloor && group.areas.length === 1) return areas;
    return `<section class="floorGroup">${showFloor ? `<div class="floorTitle"><ha-icon icon="${esc(group.icon || 'mdi:home-floor-1')}"></ha-icon><span>${esc(group.name)}</span></div>` : ''}${areas}</section>`;
  }

  _areaMarkup(area) {
    const count = area.panels.length + area.partitions.length + area.zones.length;
    const panels = area.panels.length ? `<div class="subTitle"><ha-icon icon="mdi:shield-home-outline"></ha-icon>Partizioni impianto</div><div class="panelGrid">${area.panels.map(panel => this._panelMarkup(panel)).join('')}</div>` : '';
    const partitions = area.partitions.length ? `<div class="subTitle"><ha-icon icon="mdi:shield-key-outline"></ha-icon>Partizioni INIM</div><div class="partitionList">${area.partitions.map(partition => this._partitionCard(partition)).join('')}</div>` : '';
    const zoneKey = 'zones:' + area.id;
    const zones = area.zones.length ? `<details class="zoneDetails" data-controls="${esc(zoneKey)}" ${this._openControls.has(zoneKey) ? 'open' : ''}><summary>Zone · ${area.zones.length}</summary><div class="zoneList">${area.zones.map(zone => this._zoneRow(zone)).join('')}</div></details>` : '';
    return `<div class="areaGroup"><div class="areaHeader"><h3>${esc(area.name)}</h3><span class="areaCount">${count} elementi</span></div>${panels}${partitions}${zones}</div>`;
  }

  _modeRow(item, {state, label, options, target, stateTone}) {
    const pending = this._pending.has(item.entity_id);
    const disabled = pending || this._busy.has(item.entity_id) || !isAvailable(state) || !this._config.pin_configured;
    const matched = new Set();
    const quick = LOCKS.map(([variant, label, icon]) => {
      const option = options.find(entry => entry.variant === variant);
      if (!option) return '';
      matched.add(option.command);
      const text = label + (option.current ? ' · modalità attiva' : '');
      return `<button type="button" class="quickLock ${variant}" ${target(option.command)} data-current="${option.current}" aria-label="${esc(item.name + ' · ' + text)}" title="${esc(text)}" ${disabled || option.current ? 'disabled' : ''}><span class="lockDisc"><ha-icon icon="${icon}" aria-hidden="true"></ha-icon></span></button>`;
    }).join('');
    const more = options.filter(option => !matched.has(option.command)).map(option =>
      `<button type="button" class="cmd primary" ${target(option.command)} ${disabled || option.current ? 'disabled' : ''}>${esc(option.label)}</button>`
    ).join('');
    const platform = String(item.platform || (item.entity_id.startsWith('select.') ? 'INIM' : 'Allarme')).toUpperCase();
    return `<div class="partitionCard"><div class="securityRow"><div class="securityIdentity"><b>${esc(item.name)}</b><small class="${pending ? 'pending' : stateTone}">${esc(pending ? 'In attesa di conferma' : label)} · ${esc(platform)}</small></div><div class="quickModes" role="group" aria-label="${esc('Comandi rapidi · ' + item.name)}">${quick}</div></div>${more ? this._controlsMarkup(item.entity_id, `<div class="partitionActions">${more}</div>`) : ''}</div>`;
  }

  _panelMarkup(panel) {
    const entity = this._state(panel.entity_id);
    const state = entity?.state || 'unknown';
    const features = Number(entity?.attributes?.supported_features ?? panel.supported_features ?? 0);
    const options = ALARM_COMMANDS.filter(([, , bit]) => !bit || (features & bit)).map(([command, label]) => ({
      command, label, variant:PANEL_LOCK[command], current:state === this._panelTarget(command),
    }));
    return this._modeRow(panel, {
      state, options, label:ALARM_STATES[state] || pretty(state),
      stateTone:state === 'triggered' ? 'triggered' : !isAvailable(state) ? 'bad' : state.startsWith('armed_') ? 'armed' : 'disarmed',
      target:command => `data-panel-command="${command}" data-panel-id="${esc(panel.entity_id)}"`,
    });
  }

  _partitionCard(partition) {
    const entity = this._state(partition.entity_id);
    const state = String(entity?.state || 'unknown');
    const active = normalizePartitionMode(state);
    const variant = lockMode(state);
    const options = partitionOptions(entity).map(command => {
      const kind = lockMode(command);
      return {command, variant:kind, label:partitionModeLabel(command, {action:true}),
        current:active === normalizePartitionMode(command) || Boolean(kind && variant === kind)};
    });
    return this._modeRow(partition, {
      state, options,
      label:isAvailable(state) ? partitionModeLabel(state) : ALARM_STATES[state] || 'Non disponibile',
      stateTone:isAvailable(state) ? (variant === 'disarmed' ? 'disarmed' : 'armed') : 'bad',
      target:command => `data-partition-command="${esc(command)}" data-partition-id="${esc(partition.entity_id)}"`,
    });
  }

  _zoneRow(zone) {
    const entity = this._state(zone.entity_id);
    const state = entity?.state || 'unknown';
    const unavailable = ['unknown', 'unavailable'].includes(state);
    const active = state === 'on';
    const bypassEntity = zone.bypass_entity_id ? this._state(zone.bypass_entity_id) : null;
    const bypassed = bypassEntity?.state === 'on';
    const bypassBusy = zone.bypass_entity_id && this._busy.has(zone.bypass_entity_id);
    const label = unavailable ? 'Non disponibile' : bypassed ? 'Esclusa' : zoneLabel(zone.device_class, active);
    const cls = unavailable ? 'bad' : (bypassed || active) ? 'warn' : '';
    const toggle = zone.bypass_entity_id ? `<button class="toggle ${bypassed ? 'on' : ''}" data-bypass-zone="${esc(zone.entity_id)}" data-bypass-id="${esc(zone.bypass_entity_id)}" data-bypass-pin="${zone.bypass_requires_pin ? '1' : '0'}" data-bypass-state="${bypassed ? '1' : '0'}" aria-label="${bypassed ? 'Reincludi' : 'Escludi'} ${esc(zone.name)}" ${bypassBusy || unavailable || (zone.bypass_requires_pin && !this._config.pin_configured) ? 'disabled' : ''}></button>` : '';
    return `<div class="zone ${unavailable ? 'unavailable' : ''} ${active ? 'attention' : ''} ${bypassed ? 'bypassed' : ''}"><div class="zoneIcon"><ha-icon icon="${zoneIcon(zone.device_class)}"></ha-icon></div><div><b>${esc(zone.name)}</b><small>${esc(zoneType(zone.device_class))}${zone.platform ? ` · ${esc(zone.platform.toUpperCase())}` : ''}</small></div><div class="zoneRight"><span class="zoneState ${cls}">${esc(label)}</span>${toggle}</div></div>`;
  }

  _clearPending(id) {
    clearTimeout(this._pending.get(id)?.timer);
    this._pending.delete(id);
  }

  async _sendMode(item, label, expected, canSend, payload) {
    const id = item.entity_id;
    if (!this._config.pin_configured || this._pending.has(id) || this._busy.has(id) ||
      this.shadowRoot.getElementById('overlay').classList.contains('open') || !canSend()) return;
    const pin = await this._askPin('Codice Sicurezza', item.name + ' · ' + label);
    if (pin === null || !this.isConnected) return;
    if (!this._config.pin_configured || !canSend()) {
      this._openMessage('Comando non eseguito', 'La modalità non è più disponibile per questa partizione.');
      return;
    }
    this._modeNotice = '';
    this._busy.add(id);
    const timer = setTimeout(() => {
      this._clearPending(id);
      this._modeNotice = 'Stato non confermato · ' + item.name;
      this._render();
    }, 10000);
    this._pending.set(id, {expected:normalizePartitionMode(expected), timer});
    this._render();
    try {
      await this._hass.callWS({...payload, pin});
    } catch (error) {
      this._clearPending(id);
      this._modeNotice = item.name + ' · ' + this._friendlyError(error);
    } finally {
      this._busy.delete(id);
      this._render();
    }
  }

  _panelTarget(command) {
    return command === 'disarm' ? 'disarmed' : command.replace('arm_', 'armed_');
  }

  _panelCommand(button) {
    const {panelId, panelCommand:command} = button.dataset;
    const item = this._config.panels.find(panel => panel.entity_id === panelId);
    const option = ALARM_COMMANDS.find(([value]) => value === command);
    if (!item || !option) return;
    const label = LOCKS.find(([variant]) => variant === PANEL_LOCK[command])?.[1] || option[1];
    const expected = this._panelTarget(command);
    const canSend = () => {
      const entity = this._state(panelId);
      const features = Number(entity?.attributes?.supported_features ?? item.supported_features ?? 0);
      return isAvailable(entity?.state) && entity.state !== expected && (!option[2] || Boolean(features & option[2]));
    };
    return this._sendMode(item, label, expected, canSend, {
      type:'cl_control/security/alarm_command', entity_id:panelId, command,
    });
  }

  _partitionCommand(button) {
    const {partitionId, partitionCommand:mode} = button.dataset;
    const item = this._config.partitions.find(partition => partition.entity_id === partitionId);
    if (!item || !mode) return;
    const variant = lockMode(mode);
    const canSend = () => {
      const entity = this._state(partitionId);
      return isAvailable(entity?.state) && partitionOptions(entity).includes(mode) &&
        normalizePartitionMode(entity.state) !== normalizePartitionMode(mode) &&
        !(variant && variant === lockMode(entity.state));
    };
    const label = LOCKS.find(([kind]) => kind === variant)?.[1] || partitionModeLabel(mode, {action:true});
    return this._sendMode(item, label, mode, canSend, {
      type:'cl_control/security/partition_command', mode, entity_ids:[partitionId],
    });
  }

  async _toggleBypass(button) {
    const zoneEntityId = button.dataset.bypassZone;
    const entityId = button.dataset.bypassId;
    const excluded = button.dataset.bypassState !== '1';
    const requiresPin = button.dataset.bypassPin === '1';
    let pin;
    if (requiresPin) {
      pin = await this._askPin('Codice Sicurezza', excluded ? 'Conferma esclusione zona.' : 'Conferma reinclusione zona.');
      if (pin === null) return;
    }
    this._busy.add(entityId); this._render();
    try {
      const payload = {type: 'cl_control/security/zone_exclusion', zone_entity_id: zoneEntityId, entity_id: entityId, excluded};
      if (requiresPin) payload.pin = pin;
      await this._hass.callWS(payload);
      this._closeDialog();
    } catch (error) {
      if (requiresPin) this._showDialogError(this._friendlyError(error));
      else this._openMessage('Comando non eseguito', this._friendlyError(error));
      return;
    } finally {
      this._busy.delete(entityId); this._render();
    }
  }

  _friendlyError(error) {
    const code = String(error?.code || error?.error?.code || '');
    const message = String(error?.message || error?.error?.message || '');
    if (code === 'invalid_auth') return 'Codice non valido.';
    if (code === 'rate_limited') return message || 'Troppi tentativi. Riprova più tardi.';
    if (code === 'not_configured') return 'Codice Sicurezza non configurato.';
    if (code === 'not_allowed') return 'Comando non autorizzato per questa entità.';
    if (code === 'state_not_confirmed') return 'La zona non ha confermato il nuovo stato.';
    if (code === 'security_validation_error') return message || 'Impossibile verificare il Codice Sicurezza.';
    if (code === 'service_error') return message || 'Home Assistant non ha eseguito il comando.';
    if (message) return message;
    return 'Impossibile completare il comando.';
  }

  _askPin(title, description) {
    return new Promise(resolve => {
      const overlay = this.shadowRoot.getElementById('overlay');
      overlay.innerHTML = `<div class="dialog" role="dialog" aria-modal="true"><form id="pinForm"><h3>${esc(title)}</h3><p>${esc(description)}</p><input id="pinInput" type="password" inputmode="numeric" autocomplete="one-time-code" maxlength="12" required aria-label="PIN Sicurezza"><div id="dialogError" class="dialogError"></div><div class="dialogActions"><button type="button" class="cmd" id="dialogCancel">Annulla</button><button type="submit" class="cmd primary">Conferma</button></div></form></div>`;
      overlay.classList.add('open'); overlay.setAttribute('aria-hidden', 'false');
      overlay.querySelector('#dialogCancel')?.addEventListener('click', () => { this._closeDialog(); resolve(null); });
      overlay.querySelector('#pinForm')?.addEventListener('submit', event => {
        event.preventDefault();
        const value = overlay.querySelector('#pinInput')?.value || '';
        if (!/^\d{4,12}$/.test(value)) { this._showDialogError('Usa un PIN numerico da 4 a 12 cifre.'); return; }
        this._closeDialog();
        resolve(value);
      });
      queueMicrotask(() => overlay.querySelector('#pinInput')?.focus());
    });
  }

  _openMessage(title, description) {
    const overlay = this.shadowRoot.getElementById('overlay');
    overlay.innerHTML = `<div class="dialog" role="dialog" aria-modal="true"><h3>${esc(title)}</h3><p>${esc(description)}</p><div class="dialogActions"><button type="button" class="cmd primary" id="dialogClose">Chiudi</button></div></div>`;
    overlay.classList.add('open'); overlay.setAttribute('aria-hidden', 'false');
    overlay.querySelector('#dialogClose')?.addEventListener('click', () => this._closeDialog());
  }

  _showDialogError(message) {
    const node = this.shadowRoot.getElementById('dialogError');
    if (node) node.textContent = message;
    else this._openMessage('Comando non eseguito', message);
  }

  _closeDialog() {
    const overlay = this.shadowRoot.getElementById('overlay');
    if (!overlay) return;
    overlay.classList.remove('open'); overlay.setAttribute('aria-hidden', 'true'); overlay.innerHTML = '';
  }
}

if (!customElements.get('cl-security-card')) customElements.define('cl-security-card', CLSecurityCard);

window.customCards = window.customCards || [];
if (!window.customCards.some(card => card.type === 'cl-security-card')) {
  window.customCards.push({
    type: 'cl-security-card',
    name: 'CL Security',
    description: 'Controllo allarme CL Control con PIN backend, partizioni, zone e bypass.',
  });
}

export {CLSecurityCard, ALARM_FEATURES};

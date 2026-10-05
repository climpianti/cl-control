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

const PARTITION_FALLBACK_MODES = Object.freeze([
  'TOTAL',
  'PARTIAL',
  'INSTANT',
  'DISARMED',
]);

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
  armed_away: 'Inserito',
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
    this.shadowRoot.innerHTML = `
      <style>
        :host{display:block;--cl-sec-gap:12px}
        ha-card{overflow:hidden;padding:18px;background:var(--ha-card-background,var(--card-background-color));color:var(--primary-text-color)}
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
      </style>
      <ha-card><div id="main"></div></ha-card>
      <div id="overlay" class="overlay" aria-hidden="true"></div>
    `;
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
    for (const item of this._config.panels || []) add('panels', item);
    for (const item of this._config.partitions || []) add('partitions', item);
    for (const item of this._config.zones || []) add('zones', item);
    return [...groups.values()]
      .sort((a,b) => a.order - b.order || a.name.localeCompare(b.name, 'it'))
      .map(floor => ({...floor, areas: [...floor.areas.values()].sort((a,b) => a.name.localeCompare(b.name, 'it'))}));
  }

  _render() {
    const main = this.shadowRoot?.getElementById('main');
    if (!main) return;
    const cfg = this._config;
    const panels = cfg.panels || [];
    const partitions = cfg.partitions || [];
    const zones = cfg.zones || [];
    const attention = this._attentionCount();
    const pinNotice = cfg.pin_configured ? '' : '<div class="notice"><b>Codice Sicurezza non configurato.</b> Impostalo da CL Control → Installatore → Sicurezza per abilitare inserimento e disinserimento.</div>';
    const summary = `<div class="summaryGrid"><div class="summary"><b>${panels.length}</b><small>Impianti allarme</small></div><div class="summary"><b>${partitions.length}</b><small>Partizioni</small></div><div class="summary"><b>${zones.length}</b><small>Zone</small></div><div class="summary ${attention ? 'attention' : ''}"><b>${attention}</b><small>Attenzioni</small></div></div>`;
    const groups = this._groupItems();
    const grouped = groups.length ? groups.map(group => this._groupMarkup(group, cfg.group_by_floor)).join('') : '<div class="empty">Nessuna entità di sicurezza riconosciuta.</div>';
    main.innerHTML = `
      <div class="header"><div class="headerCopy"><h2>${esc(cfg.title)}</h2><p>Stato impianto, partizioni, zone e bypass organizzati per area.</p></div><div class="shield"><ha-icon icon="mdi:shield-home-outline"></ha-icon></div></div>
      ${summary}
      ${pinNotice}
      ${grouped}
    `;
    main.querySelectorAll('[data-panel-command]').forEach(button => button.addEventListener('click', () => this._panelCommand(button)));
    main.querySelectorAll('[data-partition-command]').forEach(button => button.addEventListener('click', () => this._partitionCommand(button)));
    main.querySelectorAll('[data-bypass-zone]').forEach(button => button.addEventListener('click', () => this._toggleBypass(button)));
  }

  _groupMarkup(group, showFloor) {
    const areas = group.areas.map(area => this._areaMarkup(area)).join('');
    if (!showFloor && group.areas.length === 1) return areas;
    return `<section class="floorGroup">${showFloor ? `<div class="floorTitle"><ha-icon icon="${esc(group.icon || 'mdi:home-floor-1')}"></ha-icon><span>${esc(group.name)}</span></div>` : ''}${areas}</section>`;
  }

  _areaMarkup(area) {
    const count = area.panels.length + area.partitions.length + area.zones.length;
    const panels = area.panels.length ? `<div class="subTitle"><ha-icon icon="mdi:shield-home-outline"></ha-icon>Impianto / partizioni</div><div class="panelGrid">${area.panels.map(panel => this._panelMarkup(panel)).join('')}</div>` : '';
    const partitions = area.partitions.length ? `<div class="subTitle"><ha-icon icon="mdi:shield-key-outline"></ha-icon>Partizioni INIM</div><div class="partitionList">${area.partitions.map(partition => this._partitionCard(partition)).join('')}</div>` : '';
    const zones = area.zones.length ? `<div class="subTitle"><ha-icon icon="mdi:shield-check-outline"></ha-icon>Zone</div><div class="zoneList">${area.zones.map(zone => this._zoneRow(zone)).join('')}</div>` : '';
    return `<div class="areaGroup"><div class="areaHeader"><h3>${esc(area.name)}</h3><span class="areaCount">${count} elementi</span></div>${panels}${partitions}${zones}</div>`;
  }

  _panelMarkup(panel) {
    const entity = this._state(panel.entity_id);
    const state = entity?.state || 'unknown';
    const features = Number(entity?.attributes?.supported_features ?? panel.supported_features ?? 0);
    const stateClass = state === 'triggered' ? 'triggered' : state.startsWith('armed_') || state === 'arming' ? 'armed' : '';
    const busy = this._busy.has(panel.entity_id);
    const buttons = ALARM_COMMANDS
      .filter(([command, _label, bit]) => command === 'disarm' || !features || (features & bit))
      .map(([command, label]) => `<button class="cmd ${command === 'disarm' ? 'danger' : 'primary'}" data-panel-command="${command}" data-panel-id="${esc(panel.entity_id)}" ${busy || !this._config.pin_configured ? 'disabled' : ''}>${label}</button>`)
      .join('');
    return `<div class="panel"><div class="panelTop"><div><div class="panelName">${esc(panel.name)}</div><div class="panelArea">${esc(panel.platform ? panel.platform.toUpperCase() : 'Allarme')}</div></div><span class="alarmState ${stateClass}">${esc(ALARM_STATES[state] || pretty(state))}</span></div><div class="actions">${buttons}</div></div>`;
  }

  _partitionCard(partition) {
    const entity = this._state(partition.entity_id);
    const state = String(entity?.state || 'unknown');
    const normalizedState = normalizePartitionMode(state);
    const rawOptions = Array.isArray(entity?.attributes?.options) && entity.attributes.options.length
      ? entity.attributes.options.map(value => String(value))
      : [...PARTITION_FALLBACK_MODES];
    const options = [];
    const seen = new Set();
    for (const option of rawOptions) {
      const normalized = normalizePartitionMode(option);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      options.push(option);
    }
    const busy = this._busy.has(partition.entity_id);
    const unavailable = ['UNKNOWN', 'UNAVAILABLE'].includes(normalizedState);
    const stateClass = unavailable ? 'bad' : isDisarmPartitionMode(state) ? 'disarmed' : 'armed';
    const buttons = options.map(option => {
      const isDisarm = isDisarmPartitionMode(option);
      const active = normalizePartitionMode(option) === normalizedState ? ' active' : '';
      const label = partitionModeLabel(option, {action: true});
      return `<button class="cmd ${isDisarm ? 'danger' : 'primary'}${active}" data-partition-command="${esc(option)}" data-partition-id="${esc(partition.entity_id)}" ${busy || unavailable || !this._config.pin_configured ? 'disabled' : ''}>${esc(label)}</button>`;
    }).join('');
    const stateLabel = unavailable
      ? (normalizedState === 'UNAVAILABLE' ? 'Non disponibile' : 'Sconosciuta')
      : partitionModeLabel(state);
    return `<div class="partitionCard"><div class="partitionTop"><div class="partitionIdentity"><div class="partitionIcon"><ha-icon icon="mdi:shield-key-outline"></ha-icon></div><div class="partitionCopy"><b>${esc(partition.name)}</b><small>${esc(partition.area_name || '')}${partition.entity_id ? ` · ${esc(partition.entity_id)}` : ''}</small></div></div><span class="partitionState ${stateClass}">${esc(stateLabel)}</span></div><div class="partitionActions">${buttons || '<span class="empty">Nessun comando disponibile.</span>'}</div></div>`;
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

  async _panelCommand(button) {
    if (!this._config.pin_configured) return;
    const entityId = button.dataset.panelId;
    const command = button.dataset.panelCommand;
    const label = button.textContent?.trim() || 'Comando';
    const pin = await this._askPin('Codice Sicurezza', `${label}: ${this._config.panels.find(item => item.entity_id === entityId)?.name || entityId}`);
    if (pin === null) return;
    this._busy.add(entityId); this._render();
    try {
      await this._hass.callWS({type: 'cl_control/security/alarm_command', pin, entity_id: entityId, command});
      this._closeDialog();
    } catch (error) {
      this._openMessage('Comando non eseguito', this._friendlyError(error));
      return;
    } finally {
      this._busy.delete(entityId); this._render();
    }
  }

  async _partitionCommand(button) {
    if (!this._config.pin_configured) return;
    const entityId = String(button?.dataset?.partitionId || '');
    const mode = String(button?.dataset?.partitionCommand || '').trim();
    if (!entityId || !mode) return;
    const partition = (this._config.partitions || []).find(item => item.entity_id === entityId);
    const label = partitionModeLabel(mode, {action: true});
    const pin = await this._askPin('Codice Sicurezza', `${label}: ${partition?.name || entityId}`);
    if (pin === null) return;
    this._busy.add(entityId); this._render();
    try {
      await this._hass.callWS({type: 'cl_control/security/partition_command', pin, mode, entity_ids: [entityId]});
      this._closeDialog();
    } catch (error) {
      this._openMessage('Comando non eseguito', this._friendlyError(error));
      return;
    } finally {
      this._busy.delete(entityId); this._render();
    }
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

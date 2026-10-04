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

class CLSecurityCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode: 'open'});
    this._hass = null;
    this._config = {panels: [], partitions: [], zones: [], pin_configured: false};
    this._selectedPartitions = new Set();
    this._busy = new Set();
    this.shadowRoot.innerHTML = `
      <style>
        :host{display:block;--cl-sec-gap:12px}
        ha-card{overflow:hidden;padding:16px;background:var(--ha-card-background,var(--card-background-color));color:var(--primary-text-color)}
        .header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px}.header h2{margin:0;font-size:20px}.header p{margin:4px 0 0;color:var(--secondary-text-color);font-size:13px}.shield{font-size:24px;line-height:1}
        .notice{margin:0 0 14px;padding:10px 12px;border-radius:12px;background:color-mix(in srgb,var(--warning-color,#f59e0b) 14%,transparent);border:1px solid color-mix(in srgb,var(--warning-color,#f59e0b) 45%,transparent);font-size:13px}
        .section+.section{margin-top:18px}.sectionTitle{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}.sectionTitle h3{margin:0;font-size:15px}.count{padding:3px 8px;border-radius:999px;background:var(--secondary-background-color);font-size:12px;color:var(--secondary-text-color)}
        .panelGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:var(--cl-sec-gap)}.panel{padding:14px;border:1px solid var(--divider-color);border-radius:14px;background:var(--secondary-background-color)}.panelTop{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.panelName{font-weight:600}.panelArea{margin-top:3px;color:var(--secondary-text-color);font-size:12px}.alarmState{padding:5px 9px;border-radius:999px;font-size:12px;font-weight:700;background:var(--primary-background-color)}.alarmState.triggered{background:color-mix(in srgb,var(--error-color,#db4437) 18%,transparent);color:var(--error-color,#db4437)}.alarmState.armed{background:color-mix(in srgb,var(--warning-color,#f59e0b) 16%,transparent);color:var(--warning-color,#f59e0b)}
        .actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:12px}.cmd{min-height:38px;padding:0 12px;border-radius:10px;border:1px solid var(--divider-color);background:var(--primary-background-color);color:var(--primary-text-color);font:inherit;cursor:pointer}.cmd.primary{background:color-mix(in srgb,var(--primary-color) 12%,transparent);border-color:color-mix(in srgb,var(--primary-color) 42%,transparent);color:var(--primary-color)}.cmd.danger{background:color-mix(in srgb,var(--error-color,#db4437) 10%,transparent);border-color:color-mix(in srgb,var(--error-color,#db4437) 38%,transparent);color:var(--error-color,#db4437)}.cmd:disabled{opacity:.45;cursor:not-allowed}
        .partitionList,.zoneGroups{display:grid;gap:8px}.partition{display:flex;align-items:center;gap:10px;min-height:46px;padding:9px 10px;border:1px solid var(--divider-color);border-radius:12px}.partition input{width:18px;height:18px}.partitionCopy{min-width:0;flex:1}.partitionCopy b,.partitionCopy small{display:block}.partitionCopy small{margin-top:2px;color:var(--secondary-text-color)}
        .areaTitle{margin:10px 0 6px;font-size:13px;font-weight:700;color:var(--secondary-text-color)}.zone{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:12px;min-height:52px;padding:10px 11px;border:1px solid var(--divider-color);border-radius:12px}.zone.attention{border-color:color-mix(in srgb,var(--warning-color,#f59e0b) 55%,var(--divider-color));background:color-mix(in srgb,var(--warning-color,#f59e0b) 8%,transparent)}.zone.bypassed{border-color:color-mix(in srgb,var(--primary-color) 48%,var(--divider-color));background:color-mix(in srgb,var(--primary-color) 7%,transparent)}.zone.unavailable{opacity:.65}.zone b,.zone small{display:block}.zone small{margin-top:3px;color:var(--secondary-text-color);font-size:12px}.zoneRight{display:flex;align-items:center;gap:10px}.zoneState{font-size:12px;font-weight:700;white-space:nowrap}.zoneState.warn{color:var(--warning-color,#f59e0b)}.zoneState.bad{color:var(--error-color,#db4437)}
        .toggle{position:relative;width:44px;height:24px;border:0;padding:0;border-radius:999px;background:var(--disabled-color,#777);cursor:pointer;transition:.16s}.toggle:before{content:'';position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:white;transition:.16s}.toggle.on{background:var(--primary-color)}.toggle.on:before{transform:translateX(20px)}.toggle:disabled{opacity:.45;cursor:not-allowed}
        .empty{padding:14px;border:1px dashed var(--divider-color);border-radius:12px;color:var(--secondary-text-color);font-size:13px}
        .overlay{position:fixed;inset:0;z-index:1000;display:none;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,.45)}.overlay.open{display:flex}.dialog{width:min(100%,420px);padding:18px;border-radius:18px;background:var(--ha-card-background,var(--card-background-color));box-shadow:0 18px 50px rgba(0,0,0,.3)}.dialog h3{margin:0 0 5px}.dialog p{margin:0 0 14px;color:var(--secondary-text-color);font-size:13px}.dialog input{box-sizing:border-box;width:100%;height:46px;padding:0 12px;border:1px solid var(--divider-color);border-radius:10px;background:var(--primary-background-color);color:var(--primary-text-color);font:inherit;font-size:20px;letter-spacing:.12em}.dialogActions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}.dialogError{min-height:18px;margin-top:8px;color:var(--error-color,#db4437);font-size:12px}
        @media(max-width:600px){ha-card{padding:13px}.zone{grid-template-columns:1fr}.zoneRight{justify-content:space-between}.actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.cmd{width:100%}}
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
    };
    const valid = new Set(this._config.partitions.map(item => item.entity_id));
    for (const id of [...this._selectedPartitions]) if (!valid.has(id)) this._selectedPartitions.delete(id);
    if (!this._selectedPartitions.size) valid.forEach(id => this._selectedPartitions.add(id));
    this._render();
  }

  set hass(value) {
    this._hass = value;
    this._render();
  }

  getCardSize() { return 6; }

  _state(entityId) { return this._hass?.states?.[entityId]; }

  _render() {
    const main = this.shadowRoot?.getElementById('main');
    if (!main) return;
    const cfg = this._config;
    const panels = cfg.panels || [];
    const partitions = cfg.partitions || [];
    const zones = cfg.zones || [];
    const attention = zones.filter(zone => {
      const state = this._state(zone.entity_id)?.state;
      const bypass = zone.bypass_entity_id ? this._state(zone.bypass_entity_id)?.state === 'on' : false;
      return bypass || state === 'on' || ['unknown', 'unavailable'].includes(state);
    }).length;
    const pinNotice = cfg.pin_configured ? '' : '<div class="notice"><b>Codice Sicurezza non configurato.</b> Impostalo da CL Control → Installatore → Sicurezza per abilitare inserimento e disinserimento.</div>';
    const panelMarkup = panels.length ? `<div class="panelGrid">${panels.map(panel => this._panelMarkup(panel)).join('')}</div>` : '';
    const partitionMarkup = partitions.length ? this._partitionMarkup(partitions) : '';
    const zoneMarkup = zones.length ? this._zoneMarkup(zones) : '<div class="empty">Nessuna zona di sicurezza riconosciuta.</div>';
    main.innerHTML = `
      <div class="header"><div><h2>${esc(cfg.title)}</h2><p>Impianto, partizioni, zone e bypass.</p></div><div class="shield">🛡️</div></div>
      ${pinNotice}
      ${panels.length ? `<section class="section"><div class="sectionTitle"><h3>Impianto / Partizioni</h3><span class="count">${panels.length}</span></div>${panelMarkup}</section>` : ''}
      ${partitionMarkup}
      <section class="section"><div class="sectionTitle"><h3>Zone</h3><span class="count">${attention ? `${attention} attenzioni` : `${zones.length} OK`}</span></div>${zoneMarkup}</section>
    `;
    main.querySelectorAll('[data-panel-command]').forEach(button => button.addEventListener('click', () => this._panelCommand(button)));
    main.querySelectorAll('[data-partition-id]').forEach(input => input.addEventListener('change', () => {
      input.checked ? this._selectedPartitions.add(input.dataset.partitionId) : this._selectedPartitions.delete(input.dataset.partitionId);
    }));
    main.querySelectorAll('[data-partition-command]').forEach(button => button.addEventListener('click', () => this._partitionCommand(button.dataset.partitionCommand)));
    main.querySelectorAll('[data-bypass-zone]').forEach(button => button.addEventListener('click', () => this._toggleBypass(button)));
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
    return `<div class="panel"><div class="panelTop"><div><div class="panelName">${esc(panel.name)}</div><div class="panelArea">${esc(panel.area_name || '')}</div></div><span class="alarmState ${stateClass}">${esc(ALARM_STATES[state] || pretty(state))}</span></div><div class="actions">${buttons}</div></div>`;
  }

  _partitionMarkup(partitions) {
    const rows = partitions.map(partition => {
      const entity = this._state(partition.entity_id);
      return `<label class="partition"><input type="checkbox" data-partition-id="${esc(partition.entity_id)}" ${this._selectedPartitions.has(partition.entity_id) ? 'checked' : ''}><span class="partitionCopy"><b>${esc(partition.name)}</b><small>${esc(partition.area_name || '')} · ${esc(pretty(entity?.state || 'unknown'))}</small></span></label>`;
    }).join('');
    const disabled = !this._config.pin_configured ? 'disabled' : '';
    return `<section class="section"><div class="sectionTitle"><h3>Partizioni INIM</h3><span class="count">${partitions.length}</span></div><div class="partitionList">${rows}</div><div class="actions"><button class="cmd primary" data-partition-command="TOTAL" ${disabled}>Totale</button><button class="cmd primary" data-partition-command="PARTIAL" ${disabled}>Parziale</button><button class="cmd primary" data-partition-command="INSTANT" ${disabled}>Istantaneo</button><button class="cmd danger" data-partition-command="DISARMED" ${disabled}>Disinserisci</button></div></section>`;
  }

  _zoneMarkup(zones) {
    const groups = new Map();
    for (const zone of zones) {
      const area = zone.area_name || 'Altri dispositivi';
      if (!groups.has(area)) groups.set(area, []);
      groups.get(area).push(zone);
    }
    return [...groups.entries()].map(([area, items]) => `<div class="zoneGroup"><div class="areaTitle">${esc(area)}</div>${items.map(zone => this._zoneRow(zone)).join('')}</div>`).join('');
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
    return `<div class="zone ${unavailable ? 'unavailable' : ''} ${active ? 'attention' : ''} ${bypassed ? 'bypassed' : ''}"><div><b>${esc(zone.name)}</b><small>${esc(zoneType(zone.device_class))}${zone.platform ? ` · ${esc(zone.platform.toUpperCase())}` : ''}</small></div><div class="zoneRight"><span class="zoneState ${cls}">${esc(label)}</span>${toggle}</div></div>`;
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

  async _partitionCommand(mode) {
    if (!this._config.pin_configured) return;
    const entityIds = [...this._selectedPartitions];
    if (!entityIds.length) {
      this._openMessage('Seleziona una partizione', 'Scegli almeno una partizione prima di inviare il comando.');
      return;
    }
    const pin = await this._askPin('Codice Sicurezza', `Conferma comando ${pretty(mode)} sulle partizioni selezionate.`);
    if (pin === null) return;
    entityIds.forEach(id => this._busy.add(id)); this._render();
    try {
      await this._hass.callWS({type: 'cl_control/security/partition_command', pin, mode, entity_ids: entityIds});
      this._closeDialog();
    } catch (error) {
      this._openMessage('Comando non eseguito', this._friendlyError(error));
      return;
    } finally {
      entityIds.forEach(id => this._busy.delete(id)); this._render();
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

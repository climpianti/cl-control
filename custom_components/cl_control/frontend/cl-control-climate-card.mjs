const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const MODE_META = {
  off: ['power', 'Spento'],
  heat: ['fire', 'Caldo'],
  cool: ['snowflake', 'Freddo'],
  heat_cool: ['autorenew', 'Auto C/F'],
  auto: ['autorenew', 'Auto'],
  dry: ['water-percent', 'Deumidifica'],
  fan_only: ['fan', 'Ventola'],
};

const ACTION_META = {
  off: ['power', 'Spento'],
  idle: ['pause-circle-outline', 'In attesa'],
  heating: ['fire', 'Riscaldamento'],
  cooling: ['snowflake', 'Raffrescamento'],
  drying: ['water-percent', 'Deumidificazione'],
  fan: ['fan', 'Ventilazione'],
  preheating: ['fire-circle', 'Preriscaldamento'],
  defrosting: ['snowflake-melt', 'Sbrinamento'],
};

const humanize = value => String(value || '')
  .replace(/_/g, ' ')
  .replace(/\b\w/g, c => c.toUpperCase());

const num = value => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const decimalsFor = step => {
  const text = String(step);
  return text.includes('.') ? Math.min(2, text.split('.')[1].length) : 0;
};

export class CLControlClimateCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode:'open'});
    this._config = {};
    this._hass = null;
    this._busy = false;
    this._error = '';
    this._lastKey = '';
  }

  setConfig(config) {
    if (!config?.entity) throw Error('CL Control climate: entity richiesta');
    this._config = {...config};
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    const s = hass?.states?.[this._config.entity];
    const a = s?.attributes || {};
    const key = JSON.stringify([
      s?.state,
      a.friendly_name,
      a.current_temperature,
      a.temperature,
      a.target_temp_low,
      a.target_temp_high,
      a.current_humidity,
      a.hvac_action,
      a.hvac_modes,
      a.preset_modes,
      a.preset_mode,
      a.fan_modes,
      a.fan_mode,
      a.min_temp,
      a.max_temp,
      a.target_temp_step,
      a.supported_features,
    ]);
    if (key !== this._lastKey) {
      this._lastKey = key;
      this._render();
    }
  }

  getCardSize() { return 3; }
  getGridOptions() { return {columns:12, rows:'auto', min_columns:6}; }

  _state() {
    return this._hass?.states?.[this._config.entity];
  }

  _moreInfo() {
    this.dispatchEvent(new CustomEvent('hass-more-info', {
      detail: {entityId: this._config.entity},
      bubbles: true,
      composed: true,
    }));
  }

  async _call(action, data = {}) {
    const s = this._state();
    if (this._busy || !s || ['unavailable','unknown'].includes(s.state)) return;
    this._busy = true;
    this._error = '';
    this._syncBusy();
    try {
      await this._hass.callService(
        'climate',
        action,
        data,
        {entity_id: this._config.entity}
      );
    } catch (err) {
      this._error = err?.message || 'Comando non riuscito';
      this._render();
    } finally {
      this._busy = false;
      this._syncBusy();
    }
  }

  _syncBusy() {
    const s = this._state();
    const disabled = this._busy || !s || ['unavailable','unknown'].includes(s.state);
    this.shadowRoot.querySelectorAll('button, select').forEach(el => {
      if (el.dataset.capable === '0') el.disabled = true;
      else el.disabled = disabled;
    });
  }

  _setTarget(delta) {
    const s = this._state();
    const a = s?.attributes || {};
    const current = num(a.temperature);
    if (current === null) return;
    const rawStep = num(a.target_temp_step);
    const step = rawStep && rawStep > 0 ? rawStep : 0.5;
    const min = num(a.min_temp);
    const max = num(a.max_temp);
    let next = current + (delta * step);
    if (min !== null) next = Math.max(min, next);
    if (max !== null) next = Math.min(max, next);
    next = Number(next.toFixed(decimalsFor(step)));
    this._call('set_temperature', {temperature: next});
  }

  _mode(mode) {
    if (mode) this._call('set_hvac_mode', {hvac_mode: mode});
  }

  _preset(mode) {
    if (mode) this._call('set_preset_mode', {preset_mode: mode});
  }

  _fan(mode) {
    if (mode) this._call('set_fan_mode', {fan_mode: mode});
  }

  _render() {
    const s = this._state();
    const a = s?.attributes || {};
    const available = Boolean(s) && !['unavailable','unknown'].includes(s.state);
    const name = this._config.name || a.friendly_name || this._config.entity;
    const current = num(a.current_temperature);
    const target = num(a.temperature);
    const low = num(a.target_temp_low);
    const high = num(a.target_temp_high);
    const humidity = num(a.current_humidity);
    const modes = Array.isArray(a.hvac_modes) ? a.hvac_modes : [];
    const presets = Array.isArray(a.preset_modes) ? a.preset_modes : [];
    const fanModes = Array.isArray(a.fan_modes) ? a.fan_modes : [];
    const hvacMode = s?.state || 'off';
    const hvacAction = String(a.hvac_action || (hvacMode === 'off' ? 'off' : 'idle'));
    const actionMeta = ACTION_META[hvacAction] || ['thermostat', humanize(hvacAction)];
    const tone = hvacAction === 'heating' || hvacMode === 'heat' ? 'heat'
      : hvacAction === 'cooling' || hvacMode === 'cool' ? 'cool'
      : hvacMode === 'off' ? 'off' : 'idle';
    const currentText = current === null ? '--' : current.toFixed(1);
    const targetText = target !== null
      ? target.toFixed(1) + ' °C'
      : (low !== null && high !== null ? low.toFixed(1) + '–' + high.toFixed(1) + ' °C' : '—');
    const canTarget = target !== null;
    const modeButtons = modes.map(mode => {
      const meta = MODE_META[mode] || ['thermostat', humanize(mode)];
      const selected = mode === hvacMode;
      return '<button class="mode' + (selected ? ' selected' : '') + '" data-mode="' + esc(mode) + '" aria-pressed="' + selected + '" aria-label="Modalità ' + esc(meta[1]) + '"><ha-icon icon="mdi:' + esc(meta[0]) + '"></ha-icon><span>' + esc(meta[1]) + '</span></button>';
    }).join('');
    const presetControl = presets.length
      ? '<label class="field"><span>Preset</span><select id="preset" aria-label="Preset clima">' +
        presets.map(p => '<option value="' + esc(p) + '"' + (p === a.preset_mode ? ' selected' : '') + '>' + esc(humanize(p)) + '</option>').join('') +
        '</select></label>'
      : '';
    const fanControl = fanModes.length
      ? '<label class="field"><span>Ventola</span><select id="fan" aria-label="Velocità ventola">' +
        fanModes.map(p => '<option value="' + esc(p) + '"' + (p === a.fan_mode ? ' selected' : '') + '>' + esc(humanize(p)) + '</option>').join('') +
        '</select></label>'
      : '';
    const extras = presetControl || fanControl
      ? '<div class="extras">' + presetControl + fanControl + '</div>'
      : '';
    const humidityChip = humidity !== null
      ? '<span class="chip"><ha-icon icon="mdi:water-percent"></ha-icon>' + Math.round(humidity) + '% UR</span>'
      : '';
    const targetControls = canTarget
      ? '<div class="target"><button class="adjust" id="minus" aria-label="Diminuisci temperatura"><ha-icon icon="mdi:minus"></ha-icon></button><div class="setpoint"><span>Target</span><strong>' + esc(targetText) + '</strong></div><button class="adjust" id="plus" aria-label="Aumenta temperatura"><ha-icon icon="mdi:plus"></ha-icon></button></div>'
      : '<div class="target readonly"><div class="setpoint"><span>Target</span><strong>' + esc(targetText) + '</strong></div></div>';

    this.shadowRoot.innerHTML = '<style>' +
      ':host{display:block;min-width:0;color:#f6f8ff}ha-card{--accent:#6aa7ff;--glow:#5f75ff55;position:relative;overflow:hidden;border-radius:24px;border:1px solid rgba(169,198,255,.24);background:radial-gradient(ellipse at 88% 12%,rgba(85,92,168,.32),transparent 52%),linear-gradient(135deg,#10223b,#111722 64%,#1d1830);box-shadow:0 12px 28px rgba(0,0,0,.24);color:#f6f8ff;isolation:isolate}ha-card[data-tone="heat"]{--accent:#ff9a54;--glow:#ff8f3f55;background:radial-gradient(ellipse at 88% 12%,rgba(188,86,48,.38),transparent 52%),linear-gradient(135deg,#2a1b1a,#171722 64%,#311c21)}ha-card[data-tone="cool"]{--accent:#61c8ff;--glow:#42c2ff55;background:radial-gradient(ellipse at 88% 12%,rgba(48,134,188,.36),transparent 52%),linear-gradient(135deg,#10243a,#111722 64%,#14263b)}ha-card[data-tone="off"]{--accent:#8ea0b7;--glow:#7b8fa533}ha-card:before{content:"";position:absolute;inset:0;background:linear-gradient(120deg,var(--glow),transparent 62%);pointer-events:none}.inner{position:relative;padding:20px}.top{display:flex;align-items:center;gap:13px}.device{width:48px;height:48px;border-radius:15px;background:#ffffff12;display:grid;place-items:center;color:var(--accent);box-shadow:inset 0 0 0 1px #ffffff10}.device ha-icon{--mdc-icon-size:27px}.identity{flex:1;min-width:0}.identity strong{display:block;font-size:18px;font-weight:700;letter-spacing:-.2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.status{display:flex;align-items:center;gap:6px;margin-top:4px;color:#bac7dc;font-size:13px}.status ha-icon{--mdc-icon-size:16px;color:var(--accent)}.more{border:0;background:#ffffff0b;color:#eaf1ff;width:40px;height:40px;border-radius:12px;cursor:pointer;display:grid;place-items:center}.hero{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:16px;align-items:end;margin-top:18px}.current span{display:block;color:#aebbd0;font-size:12px;text-transform:uppercase;letter-spacing:.08em}.current strong{display:flex;align-items:flex-start;gap:3px;font-size:46px;line-height:1;font-weight:650;letter-spacing:-1.8px;margin-top:5px}.current strong small{font-size:18px;color:#c7d4e7;margin-top:5px;font-weight:500}.chips{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}.chip{display:inline-flex;align-items:center;gap:5px;border:1px solid #ffffff16;background:#ffffff0a;border-radius:999px;padding:7px 9px;font-size:12px;color:#d9e3f1}.chip ha-icon{--mdc-icon-size:16px;color:var(--accent)}.target{display:grid;grid-template-columns:48px minmax(120px,1fr) 48px;gap:10px;align-items:center;margin-top:18px;padding:12px;background:#080f1b75;border:1px solid #c9d7ff18;border-radius:18px}.target.readonly{grid-template-columns:1fr}.setpoint{text-align:center}.setpoint span{display:block;color:#9eadc3;font-size:11px;text-transform:uppercase;letter-spacing:.08em}.setpoint strong{display:block;font-size:21px;margin-top:3px}.adjust{width:48px;height:48px;border-radius:15px;border:1px solid #ffffff1d;background:#ffffff0e;color:#fff;display:grid;place-items:center;cursor:pointer}.adjust ha-icon{--mdc-icon-size:25px}.modes{display:grid;grid-template-columns:repeat(auto-fit,minmax(86px,1fr));gap:8px;margin-top:12px}.mode{min-height:48px;border-radius:14px;border:1px solid #ffffff18;background:#ffffff09;color:#cbd6e6;display:flex;align-items:center;justify-content:center;gap:7px;cursor:pointer;padding:8px 10px;font:inherit;font-size:12px}.mode ha-icon{--mdc-icon-size:19px}.mode.selected{background:color-mix(in srgb,var(--accent) 22%,transparent);border-color:color-mix(in srgb,var(--accent) 58%,transparent);color:#fff;box-shadow:0 0 0 1px color-mix(in srgb,var(--accent) 18%,transparent) inset}.extras{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-top:12px}.field{display:block}.field>span{display:block;color:#aebbd0;font-size:11px;margin:0 0 5px 3px;text-transform:uppercase;letter-spacing:.06em}.field select{width:100%;min-height:43px;border-radius:13px;border:1px solid #ffffff1c;background:#0d1725;color:#edf4ff;padding:0 36px 0 12px;font:inherit}.error{margin-top:10px;padding:9px 11px;border-radius:11px;background:#ff5b691d;border:1px solid #ff7f8a45;color:#ffd4d8;font-size:12px}.more:focus-visible,.adjust:focus-visible,.mode:focus-visible,select:focus-visible{outline:2px solid #9dd0ff;outline-offset:3px}button:disabled,select:disabled{opacity:.42;cursor:default}@media(max-width:520px){.inner{padding:15px}.identity strong{font-size:16px}.hero{grid-template-columns:1fr;align-items:start}.chips{justify-content:flex-start}.current strong{font-size:41px}.target{grid-template-columns:44px minmax(100px,1fr) 44px}.adjust{width:44px;height:44px}.modes{grid-template-columns:repeat(3,minmax(0,1fr))}.mode{padding:7px 5px}.mode span{font-size:11px}}@media(prefers-reduced-motion:reduce){*{transition:none!important}}' +
      '</style>' +
      '<ha-card data-tone="' + esc(tone) + '"><div class="inner">' +
      '<div class="top"><div class="device"><ha-icon icon="mdi:thermostat"></ha-icon></div><div class="identity"><strong>' + esc(name) + '</strong><div class="status"><ha-icon icon="mdi:' + esc(actionMeta[0]) + '"></ha-icon><span>' + esc(available ? actionMeta[1] : 'Non disponibile') + '</span></div></div><button class="more" id="info" aria-label="Apri dettagli clima"><ha-icon icon="mdi:dots-vertical"></ha-icon></button></div>' +
      '<div class="hero"><div class="current"><span>Temperatura ambiente</span><strong>' + esc(currentText) + '<small>°C</small></strong></div><div class="chips">' + humidityChip + '</div></div>' +
      targetControls +
      (modeButtons ? '<div class="modes" role="group" aria-label="Modalità HVAC">' + modeButtons + '</div>' : '') +
      extras +
      (this._error ? '<div class="error" role="alert">' + esc(this._error) + '</div>' : '') +
      '</div></ha-card>';

    this.shadowRoot.querySelector('#info')?.addEventListener('click', () => this._moreInfo());
    this.shadowRoot.querySelector('#minus')?.addEventListener('click', () => this._setTarget(-1));
    this.shadowRoot.querySelector('#plus')?.addEventListener('click', () => this._setTarget(1));
    this.shadowRoot.querySelectorAll('[data-mode]').forEach(el => el.addEventListener('click', () => this._mode(el.dataset.mode)));
    this.shadowRoot.querySelector('#preset')?.addEventListener('change', e => this._preset(e.target.value));
    this.shadowRoot.querySelector('#fan')?.addEventListener('change', e => this._fan(e.target.value));
    this._syncBusy();
  }
}

if (!customElements.get('cl-control-climate-card')) {
  customElements.define('cl-control-climate-card', CLControlClimateCard);
}

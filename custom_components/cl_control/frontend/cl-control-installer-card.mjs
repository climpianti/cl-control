const esc = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

class CLControlInstallerCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._hass = null;
    this._config = {};
    this._runtime = null;
    this._unlocked = false;
    this._retryAfter = 0;
    this._loading = false;
    this._areas = [];
    this._entities = [];
    this._devices = [];
    this._dashboardModel = null;
    this._resetOrders = new Set();
    this._securityPinConfigured = false;
  }

  setConfig(config) {
    this._config = { ...config };
    this._render();
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) this._bootstrap();
  }

  getCardSize() { return 10; }

  async _bootstrap() {
    if (!this._hass || this._loading) return;
    if (!this._hass.user?.is_admin) {
      this._render();
      return;
    }
    this._loading = true;
    this._render();
    try {
      const status = await this._hass.callWS({ type: 'cl_control/installer/status' });
      this._unlocked = Boolean(status?.unlocked);
      this._retryAfter = Number(status?.retry_after || 0);
      if (this._unlocked) await this._loadData();
    } catch (_err) {
      this._toast('Impossibile leggere lo stato Installatore.', 'error');
    } finally {
      this._loading = false;
      this._render();
    }
  }

  async _loadData() {
    const [runtime, areas, entities, devices, dashboard] = await Promise.all([
      this._hass.callWS({ type: 'cl_control/config/get' }),
      this._hass.callWS({ type: 'config/area_registry/list' }).catch(() => []),
      this._hass.callWS({ type: 'config/entity_registry/list' }).catch(() => []),
      this._hass.callWS({ type: 'config/device_registry/list' }).catch(() => []),
      this._hass.callWS({ type: 'cl_control/dashboard/native_config' }).catch(() => null),
    ]);
    this._runtime = runtime || {};
    this._areas = Array.isArray(areas) ? areas : [];
    this._entities = Array.isArray(entities) ? entities : [];
    this._devices = Array.isArray(devices) ? devices : [];
    this._dashboardModel = dashboard?.model || null;
    try {
      const pinStatus = await this._hass.callWS({ type: 'cl_control/security/pin/status' });
      this._securityPinConfigured = Boolean(pinStatus?.configured);
    } catch (_err) {
      this._securityPinConfigured = false;
    }
  }

  _areaForEntity(entityId) {
    const entry = this._entities.find(item => item.entity_id === entityId);
    let areaId = entry?.area_id || '';
    if (!areaId && entry?.device_id) {
      const device = this._devices.find(item => item.id === entry.device_id);
      areaId = device?.area_id || '';
    }
    return areaId;
  }

  _name(entityId) {
    const state = this._hass?.states?.[entityId];
    return state?.attributes?.friendly_name || entityId;
  }

  _powerSensors() {
    return Object.values(this._hass?.states || {})
      .filter(state => {
        if (!state?.entity_id?.startsWith('sensor.')) return false;
        const registryEntry = this._entities.find(item => item.entity_id === state.entity_id);
        if (String(registryEntry?.platform || '').toLowerCase() === 'cl_control') return false;
        const dc = String(state.attributes?.device_class || '').toLowerCase();
        const unit = String(state.attributes?.unit_of_measurement || '').toLowerCase();
        return dc === 'power' || ['w', 'kw', 'mw'].includes(unit);
      })
      .sort((a, b) => this._name(a.entity_id).localeCompare(this._name(b.entity_id), 'it'));
  }

  _wireSearchInputs() {
    this.shadowRoot.querySelectorAll('[data-entity-search]').forEach(input => {
      const listId = input.dataset.entitySearch;
      const list = this.shadowRoot.getElementById(listId);
      if (!list) return;
      const apply = () => {
        const query = String(input.value || '').trim().toLocaleLowerCase('it');
        let visible = 0;
        list.querySelectorAll('[data-search-text]').forEach(row => {
          const haystack = String(row.dataset.searchText || '').toLocaleLowerCase('it');
          const show = !query || haystack.includes(query);
          row.hidden = !show;
          if (show) visible += 1;
        });
        const empty = list.querySelector('[data-search-empty]');
        if (empty) empty.hidden = visible !== 0;
      };
      input.addEventListener('input', apply);
      input.addEventListener('search', apply);
      apply();
    });
  }

  _weatherEntities() {
    return Object.values(this._hass?.states || {})
      .filter(state => state?.entity_id?.startsWith('weather.'))
      .sort((a, b) => this._name(a.entity_id).localeCompare(this._name(b.entity_id), 'it'));
  }

  _cameraEntities() {
    return Object.values(this._hass?.states || {})
      .filter(state => state?.entity_id?.startsWith('camera.'))
      .sort((a, b) => this._name(a.entity_id).localeCompare(this._name(b.entity_id), 'it'));
  }

  _securityEntities() {
    const security = this._dashboardModel?.security || {};
    const visibility = this._runtime?.entity_visibility || {};
    const byId = new Map();
    const add = (item, kind) => {
      if (!item?.entity_id) return;
      const entityId = String(item.entity_id);
      byId.set(entityId, {
        entity_id: entityId,
        name: item.name || this._name(entityId),
        kind,
        area_id: item.area_id || this._areaForEntity(entityId) || '',
        area_name: item.area_name || '',
        floor_name: item.floor_name || '',
        platform: item.platform || '',
      });
    };
    (security.panels || []).forEach(item => add(item, 'Impianto / Partizione'));
    (security.partitions || []).forEach(item => add(item, 'Partizione INIM'));
    (security.zones || []).forEach(item => add(item, 'Zona'));

    // Keep entities hidden from CL Control available in the Installer so they can
    // always be re-enabled later. Panels and INIM partitions are deterministic;
    // hidden binary sensors are recovered only from known security platforms.
    const securityPlatforms = new Set(['risco', 'irisco', 'inim', 'alarmo', 'paradox', 'dsc', 'texecom', 'jablotron']);
    for (const entry of this._entities) {
      const entityId = String(entry?.entity_id || '');
      if (!entityId || visibility[entityId] !== false || byId.has(entityId)) continue;
      const domain = entityId.split('.', 1)[0];
      const platform = String(entry?.platform || '').toLowerCase();
      if (domain === 'alarm_control_panel') add({...entry, name: this._name(entityId)}, 'Impianto / Partizione');
      else if (/^select\.partition_[a-z0-9_]+_mode$/.test(entityId)) add({...entry, name: this._name(entityId)}, 'Partizione INIM');
      else if (domain === 'binary_sensor' && securityPlatforms.has(platform)) add({...entry, name: this._name(entityId)}, 'Zona');
    }

    const areaNames = new Map(this._areas.map(area => [area.area_id || area.id, area.name || area.area_id || area.id]));
    return [...byId.values()].map(item => ({
      ...item,
      area_name: item.area_name || areaNames.get(item.area_id) || 'Altri dispositivi',
    })).sort((a, b) =>
      String(a.floor_name || '').localeCompare(String(b.floor_name || ''), 'it') ||
      String(a.area_name || '').localeCompare(String(b.area_name || ''), 'it') ||
      String(a.kind || '').localeCompare(String(b.kind || ''), 'it') ||
      String(a.name || '').localeCompare(String(b.name || ''), 'it')
    );
  }

  _sortBySaved(items, savedOrder, keyOf, labelOf) {
    const rank = new Map((savedOrder || []).map((key, index) => [String(key), index]));
    return [...items].sort((a, b) => {
      const aKey = String(keyOf(a));
      const bKey = String(keyOf(b));
      const aRank = rank.has(aKey) ? rank.get(aKey) : Number.MAX_SAFE_INTEGER;
      const bRank = rank.has(bKey) ? rank.get(bKey) : Number.MAX_SAFE_INTEGER;
      if (aRank !== bRank) return aRank - bRank;
      return String(labelOf(a)).localeCompare(String(labelOf(b)), 'it');
    });
  }

  _orderRow(key, label, subtitle = '') {
    return `<div class="orderRow" draggable="true" data-order-key="${esc(key)}"><ha-icon class="dragHandle" icon="mdi:drag"></ha-icon><div class="orderText"><b>${esc(label)}</b>${subtitle ? `<small>${esc(subtitle)}</small>` : ''}</div><div class="orderActions"><button type="button" data-move-order="up" title="Sposta su"><ha-icon icon="mdi:chevron-up"></ha-icon></button><button type="button" data-move-order="down" title="Sposta giù"><ha-icon icon="mdi:chevron-down"></ha-icon></button></div></div>`;
  }

  _areaOrderRow(area, visible, showPicture) {
    return `<div class="orderRow areaOrderRow" draggable="true" data-order-key="${esc(area.id)}" data-area-presentation="${esc(area.id)}"><ha-icon class="dragHandle" icon="mdi:drag"></ha-icon><div class="orderText"><b>${esc(area.name)}</b><small>${esc(area.id)}</small></div><div class="areaOptions"><label title="Mostra o nascondi questa area nella Home CL Control"><input type="checkbox" data-area-visible ${visible ? 'checked' : ''}> Mostra</label><label title="Usa la foto dell'area nella Home CL Control"><input type="checkbox" data-area-picture ${showPicture ? 'checked' : ''}> Immagine</label></div><div class="orderActions"><button type="button" data-move-order="up" title="Sposta su"><ha-icon icon="mdi:chevron-up"></ha-icon></button><button type="button" data-move-order="down" title="Sposta giù"><ha-icon icon="mdi:chevron-down"></ha-icon></button></div></div>`;
  }

  _wireOrderLists() {
    this.shadowRoot.querySelectorAll('.orderList').forEach(list => {
      let dragged = null;
      list.querySelectorAll('.orderRow').forEach(row => {
        row.addEventListener('dragstart', event => {
          dragged = row;
          row.classList.add('dragging');
          event.dataTransfer?.setData('text/plain', row.dataset.orderKey || '');
          if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
        });
        row.addEventListener('dragend', () => {
          row.classList.remove('dragging');
          dragged = null;
        });
        row.addEventListener('dragover', event => {
          if (!dragged || dragged === row || dragged.parentElement !== row.parentElement) return;
          event.preventDefault();
          const rect = row.getBoundingClientRect();
          if (event.clientY < rect.top + rect.height / 2) row.before(dragged);
          else row.after(dragged);
          this._resetOrders.delete(String(list.dataset.orderKind || ''));
        });
      });
      list.querySelectorAll('[data-move-order]').forEach(button => {
        button.addEventListener('click', () => {
          const row = button.closest('.orderRow');
          if (!row) return;
          if (button.dataset.moveOrder === 'up' && row.previousElementSibling) row.parentElement.insertBefore(row, row.previousElementSibling);
          if (button.dataset.moveOrder === 'down' && row.nextElementSibling) row.parentElement.insertBefore(row.nextElementSibling, row);
          this._resetOrders.delete(String(list.dataset.orderKind || ''));
        });
      });
    });
    this.shadowRoot.querySelectorAll('[data-reset-order]').forEach(button => {
      button.addEventListener('click', () => {
        const kind = String(button.dataset.resetOrder || '');
        if (!kind) return;
        this._resetOrders.add(kind);
        this._toast('Ordine automatico selezionato. Premi SALVA CONFIGURAZIONE per applicarlo.');
        this._render();
      });
    });
  }

  async _unlock() {
    const pin = String(this.shadowRoot.querySelector('#installerPin')?.value || '');
    if (!pin) return this._toast('Inserisci il PIN Installatore.', 'error');
    this._loading = true;
    this._render();
    try {
      const result = await this._hass.callWS({ type: 'cl_control/installer/unlock', pin });
      this._unlocked = Boolean(result?.unlocked);
      this._retryAfter = Number(result?.retry_after || 0);
      if (!this._unlocked) {
        this._toast(this._retryAfter ? `PIN errato. Riprova tra ${Math.ceil(this._retryAfter)} s.` : 'PIN Installatore errato.', 'error');
      } else {
        await this._loadData();
        this._toast('Modalità Installatore sbloccata.', 'success');
      }
    } catch (_err) {
      this._toast('Impossibile sbloccare la modalità Installatore.', 'error');
    } finally {
      this._loading = false;
      this._render();
    }
  }

  async _lock() {
    try { await this._hass.callWS({ type: 'cl_control/installer/lock' }); } catch (_err) {}
    this._unlocked = false;
    this._runtime = null;
    this._dashboardModel = null;
    this._resetOrders.clear();
    this._securityPinConfigured = false;
    this._render();
  }

  _collectRuntime() {
    const current = structuredClone(this._runtime || {});
    current.experience_level = this.shadowRoot.querySelector('#experienceLevel')?.value || 'standard';
    current.weather = {
      mode: this.shadowRoot.querySelector('#weatherMode')?.value || 'auto',
      entity: this.shadowRoot.querySelector('#weatherEntity')?.value || '',
    };
    current.power_monitoring = current.power_monitoring || { home: {}, areas: {} };
    current.power_monitoring.home = {
      mode: this.shadowRoot.querySelector('#homePowerMode')?.value || 'auto',
      entities: [...this.shadowRoot.querySelectorAll('[data-home-power]:checked')].map(input => input.value),
    };
    const areas = {};
    this.shadowRoot.querySelectorAll('[data-area-box]').forEach(box => {
      const areaId = box.dataset.areaBox;
      areas[areaId] = {
        mode: box.querySelector('[data-area-mode]')?.value || 'auto',
        entities: [...box.querySelectorAll('[data-area-power]:checked')].map(input => input.value),
      };
    });
    current.power_monitoring.areas = areas;

    const visibility = { ...(current.entity_visibility || {}) };
    const entityAreas = { ...(current.entity_areas || {}) };
    this.shadowRoot.querySelectorAll('[data-camera-config]').forEach(row => {
      const entityId = row.dataset.cameraConfig;
      const visible = Boolean(row.querySelector('[data-camera-visible]')?.checked);
      const area = String(row.querySelector('[data-camera-area]')?.value || '').trim();
      visibility[entityId] = visible;
      if (area) entityAreas[entityId] = area;
      else delete entityAreas[entityId];
    });
    this.shadowRoot.querySelectorAll('[data-security-visible]').forEach(input => {
      const entityId = String(input.value || '').trim();
      if (entityId) visibility[entityId] = Boolean(input.checked);
    });
    current.entity_visibility = visibility;
    current.entity_areas = entityAreas;

    const areaVisibility = { ...(current.area_visibility || {}) };
    const areaPictureVisibility = { ...(current.area_picture_visibility || {}) };
    this.shadowRoot.querySelectorAll('[data-area-presentation]').forEach(row => {
      const areaId = String(row.dataset.areaPresentation || '').trim();
      if (!areaId) return;
      areaVisibility[areaId] = Boolean(row.querySelector('[data-area-visible]')?.checked);
      areaPictureVisibility[areaId] = Boolean(row.querySelector('[data-area-picture]')?.checked);
    });
    current.area_visibility = areaVisibility;
    current.area_picture_visibility = areaPictureVisibility;

    const mergeOrder = (ordered, previous) => {
      const seen = new Set(ordered);
      return [...ordered, ...(previous || []).filter(value => !seen.has(value))];
    };
    const areaRows = [...this.shadowRoot.querySelectorAll('#areaOrderList [data-order-key]')].map(row => row.dataset.orderKey).filter(Boolean);
    const homeRows = [...this.shadowRoot.querySelectorAll('[data-home-order-list] [data-order-key]')].map(row => row.dataset.orderKey).filter(Boolean);
    const entityRows = [...this.shadowRoot.querySelectorAll('[data-entity-order-list] [data-order-key]')].map(row => row.dataset.orderKey).filter(Boolean);
    if (this._resetOrders.has('areas')) current.area_order = [];
    else if (areaRows.length) current.area_order = mergeOrder(areaRows, current.area_order || []);
    if (this._resetOrders.has('home')) current.home_order = [];
    else if (homeRows.length) current.home_order = mergeOrder(homeRows, current.home_order || []);
    if (this._resetOrders.has('entities')) current.entity_order = [];
    else if (entityRows.length) current.entity_order = mergeOrder(entityRows, current.entity_order || []);

    current.shell_title = {
      mode: this.shadowRoot.querySelector('#shellTitleMode')?.value || 'cl_control',
      custom: this.shadowRoot.querySelector('#shellTitleCustom')?.value?.trim() || '',
    };

    const support = { ...(current.support || {}) };
    support.site_name = this.shadowRoot.querySelector('#siteName')?.value?.trim() || 'Casa';
    support.customer = this.shadowRoot.querySelector('#customerName')?.value?.trim() || '';
    support.whatsapp = this.shadowRoot.querySelector('#supportWhatsapp')?.value?.trim() || '';
    support.phone = this.shadowRoot.querySelector('#supportPhone')?.value?.trim() || '';
    current.support = support;
    return current;
  }

  async _saveGeneral({ reload = false, message = 'Configurazione salvata.' } = {}) {
    try {
      const config = this._collectRuntime();
      const saved = await this._hass.callWS({ type: 'cl_control/config/set', config });
      this._runtime = saved || config;
      this._resetOrders.clear();
      await this._loadData();
      this._toast(message, 'success');
      if (reload) {
        window.setTimeout(() => window.location.reload(), 180);
        return;
      }
      this._render();
    } catch (_err) {
      this._toast('Errore durante il salvataggio della configurazione.', 'error');
    }
  }

  async _saveExperienceLevel() {
    const select = this.shadowRoot.querySelector('#experienceLevel');
    if (!select || !this._runtime) return;
    const current = structuredClone(this._runtime);
    current.experience_level = select.value || 'standard';
    try {
      const saved = await this._hass.callWS({ type: 'cl_control/config/set', config: current });
      this._runtime = saved || current;
      this._toast(`Profilo ${select.options[select.selectedIndex]?.text || select.value} applicato.`, 'success');
      window.setTimeout(() => window.location.reload(), 180);
    } catch (_err) {
      this._toast('Impossibile applicare il livello esperienza.', 'error');
    }
  }

  async _saveSecurityPin() {
    const pin = String(this.shadowRoot.querySelector('#securityPin')?.value || '');
    const confirm = String(this.shadowRoot.querySelector('#securityPinConfirm')?.value || '');
    if (!/^\d{4,12}$/.test(pin)) return this._toast('Usa un Codice Sicurezza numerico da 4 a 12 cifre.', 'error');
    if (pin !== confirm) return this._toast('I due Codici Sicurezza non coincidono.', 'error');
    try {
      const result = await this._hass.callWS({ type: 'cl_control/security/pin/set', pin });
      this._securityPinConfigured = Boolean(result?.configured);
      this._toast('Codice Sicurezza salvato.', 'success');
      this._render();
    } catch (_err) {
      this._toast('Impossibile salvare il Codice Sicurezza.', 'error');
    }
  }

  _toast(message, type = 'info') {
    this.dispatchEvent(new CustomEvent('hass-notification', {
      bubbles: true,
      composed: true,
      detail: { message },
    }));
    if (type === 'error') console.warn(`CL Control: ${message}`);
  }

  _styles() {
    return `<style>
      :host{display:block}ha-card{padding:18px;border-radius:var(--ha-card-border-radius,12px)}
      h2{font-size:20px;margin:0}h3{font-size:16px;margin:0 0 12px}.top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}
      .muted{color:var(--secondary-text-color);font-size:13px;line-height:1.45}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.full{grid-column:1/-1}
      .section{border:1px solid var(--divider-color);border-radius:12px;padding:14px;margin-top:12px}.field{display:flex;flex-direction:column;gap:6px}.field label{font-size:12px;font-weight:700;color:var(--secondary-text-color)}
      input,select{box-sizing:border-box;width:100%;min-height:44px;border:1px solid var(--divider-color);border-radius:10px;background:var(--card-background-color);color:var(--primary-text-color);padding:9px 11px;font:inherit}
      button{min-height:42px;border:0;border-radius:10px;padding:0 14px;font-weight:700;cursor:pointer;background:var(--secondary-background-color);color:var(--primary-text-color)}button.primary{background:var(--primary-color);color:var(--text-primary-color,#fff)}button.danger{color:var(--error-color)}button:disabled{opacity:.55;cursor:default}
      .actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.sectionTitle{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.sectionTitle h3{margin-bottom:5px}.sectionTitle .muted{margin:0}.compact{min-height:36px;white-space:nowrap}.list{max-height:250px;overflow:auto;border:1px solid var(--divider-color);border-radius:10px;margin-top:8px}.searchBox{position:relative;margin-top:8px}.searchBox input{padding-left:38px}.searchBox ha-icon{position:absolute;left:11px;top:50%;transform:translateY(-50%);--mdc-icon-size:19px;color:var(--secondary-text-color);pointer-events:none}.check{display:flex;align-items:center;gap:9px;padding:9px 10px;border-bottom:1px solid var(--divider-color);font-size:13px}.check:last-child{border-bottom:0}.check[hidden]{display:none}.check input{width:auto;min-height:auto}.check span{min-width:0}.check b{display:block;font-size:13px}.check small{display:block;color:var(--secondary-text-color);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.searchEmpty{padding:12px;color:var(--secondary-text-color);font-size:13px}.area{margin-top:10px;padding-top:10px;border-top:1px solid var(--divider-color)}.badge{display:inline-flex;align-items:center;border-radius:999px;padding:4px 8px;font-size:11px;font-weight:700;background:var(--secondary-background-color)}
      .locked{max-width:430px;margin:0 auto;padding:8px 0 2px}.lockIcon{display:grid;place-items:center;margin:4px auto 12px;width:56px;height:56px;border-radius:50%;background:var(--secondary-background-color)}.lockIcon ha-icon{--mdc-icon-size:30px;color:var(--primary-color)}
      @media(max-width:680px){ha-card{padding:14px}.grid{grid-template-columns:1fr}.section{padding:12px}.top{align-items:flex-start}.sectionTitle{flex-direction:column}.sectionTitle button{width:100%}.actions button{flex:1 1 auto}}
    .cameraRow{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(190px,.65fr);gap:10px;align-items:center;padding:10px 12px;border-bottom:1px solid var(--divider-color)}.cameraInfo{display:flex;flex-direction:column}.cameraInfo small{color:var(--secondary-text-color);margin-top:3px}.cameraToggle{display:flex;align-items:center;gap:6px}.cameraToggle input{width:auto;min-height:auto}.orderGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.orderPanel{border:1px solid var(--divider-color);border-radius:10px;padding:10px}.orderPanelHead{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}.orderPanelHead h4{margin:0;font-size:14px}.orderPanelHead button{min-height:34px;font-size:11px}.orderList{border:1px solid var(--divider-color);border-radius:10px;overflow:hidden}.orderRow{display:flex;align-items:center;gap:9px;min-height:48px;padding:6px 7px;border-bottom:1px solid var(--divider-color);background:var(--card-background-color)}.orderRow:last-child{border-bottom:0}.orderRow.dragging{opacity:.5}.dragHandle{cursor:grab;color:var(--secondary-text-color)}.orderText{min-width:0;flex:1}.orderText b{display:block;font-size:13px}.orderText small{display:block;color:var(--secondary-text-color);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.areaOptions{display:flex;align-items:center;gap:9px;flex-wrap:wrap}.areaOptions label{display:flex;align-items:center;gap:4px;font-size:11px;color:var(--secondary-text-color);white-space:nowrap}.areaOptions input{width:auto;min-height:auto}.orderActions{display:flex;gap:3px}.orderActions button{min-width:34px;min-height:34px;padding:0}.orderActions ha-icon{--mdc-icon-size:20px}.areaOrderDetails{border:1px solid var(--divider-color);border-radius:10px;margin-top:8px;padding:0 10px}.areaOrderDetails summary{cursor:pointer;font-weight:700;padding:12px 2px}.entityGroup{margin:0 0 12px}.entityGroup h5{font-size:12px;margin:8px 0;color:var(--secondary-text-color)}@media(max-width:760px){.cameraRow{grid-template-columns:1fr}.orderGrid{grid-template-columns:1fr}.areaOrderRow{flex-wrap:wrap}.areaOrderRow .orderText{min-width:130px}.areaOptions{order:4;width:100%;padding-left:32px}}</style>`;
  }

  _render() {
    if (!this.shadowRoot) return;
    if (!this._hass) {
      this.shadowRoot.innerHTML = `${this._styles()}<ha-card><div class="muted">Caricamento…</div></ha-card>`;
      return;
    }
    if (!this._hass.user?.is_admin) {
      this.shadowRoot.innerHTML = `${this._styles()}<ha-card><h2>Configurazione Installatore</h2><p class="muted">Accesso consentito solo agli amministratori Home Assistant.</p></ha-card>`;
      return;
    }
    if (!this._unlocked) {
      this.shadowRoot.innerHTML = `${this._styles()}<ha-card><div class="locked"><div class="lockIcon"><ha-icon icon="mdi:shield-lock-outline"></ha-icon></div><h2>Configurazione Installatore</h2><p class="muted">Inserisci il PIN Installatore per accedere alle impostazioni tecniche CL Control.</p><div class="field"><label>PIN Installatore</label><input id="installerPin" type="password" inputmode="numeric" autocomplete="current-password" placeholder="PIN"></div><div class="actions"><button class="primary" id="unlockInstaller" ${this._loading ? 'disabled' : ''}>${this._loading ? 'ATTENDI…' : 'SBLOCCA'}</button></div>${this._retryAfter ? `<p class="muted">Riprova tra ${Math.ceil(this._retryAfter)} secondi.</p>` : ''}</div></ha-card>`;
      this.shadowRoot.querySelector('#unlockInstaller')?.addEventListener('click', () => this._unlock());
      this.shadowRoot.querySelector('#installerPin')?.addEventListener('keydown', event => { if (event.key === 'Enter') this._unlock(); });
      return;
    }
    if (!this._runtime) {
      this.shadowRoot.innerHTML = `${this._styles()}<ha-card><div class="muted">Caricamento configurazione…</div></ha-card>`;
      return;
    }

    const r = this._runtime;
    const weather = r.weather || { mode: 'auto', entity: '' };
    const monitoring = r.power_monitoring || { home: { mode: 'auto', entities: [] }, areas: {} };
    const support = r.support || {};
    const shellTitle = r.shell_title || { mode: 'cl_control', custom: '' };
    const power = this._powerSensors();
    const weatherEntities = this._weatherEntities();
    const cameras = this._cameraEntities();
    const securityEntities = this._securityEntities();
    const cameraVisibility = r.entity_visibility || {};
    const cameraAreas = r.entity_areas || {};
    const deviceArea = new Map(this._areas.map(area => [area.area_id || area.id, area.name || area.area_id || area.id]));
    const homeSelected = new Set(monitoring.home?.entities || []);
    const areaBlocks = this._areas
      .map(area => ({ id: area.area_id || area.id, name: area.name || area.area_id || area.id }))
      .filter(area => area.id)
      .sort((a, b) => a.name.localeCompare(b.name, 'it'))
      .map(area => {
        const cfg = monitoring.areas?.[area.id] || { mode: 'auto', entities: [] };
        const selected = new Set(cfg.entities || []);
        const areaSensorCount = power.filter(state => this._areaForEntity(state.entity_id) === area.id).length;
        const candidates = power;
        const listId = `areaPowerList-${String(area.id).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
        return `<div class="area" data-area-box="${esc(area.id)}"><div class="grid"><div class="field"><label>${esc(area.name)}</label><select data-area-mode><option value="auto" ${cfg.mode !== 'manual' && cfg.mode !== 'off' ? 'selected' : ''}>Automatico</option><option value="manual" ${cfg.mode === 'manual' ? 'selected' : ''}>Selezione manuale</option><option value="off" ${cfg.mode === 'off' ? 'selected' : ''}>Disattivato</option></select></div><div class="field"><label>Sensori rilevati</label><div class="muted">${areaSensorCount} nell'area · ${power.length} disponibili</div></div></div><div class="searchBox"><ha-icon icon="mdi:magnify"></ha-icon><input type="search" data-entity-search="${esc(listId)}" placeholder="Cerca o incolla entity_id…" autocomplete="off"></div><div class="list" id="${esc(listId)}">${candidates.length ? candidates.map(state => { const sourceArea = deviceArea.get(this._areaForEntity(state.entity_id)) || ''; return `<label class="check" data-search-text="${esc(`${this._name(state.entity_id)} ${state.entity_id} ${sourceArea}`)}"><input type="checkbox" data-area-power value="${esc(state.entity_id)}" ${selected.has(state.entity_id) ? 'checked' : ''}><span><b>${esc(this._name(state.entity_id))}</b><small>${esc(state.entity_id)} · ${esc(state.attributes?.unit_of_measurement || '')}${sourceArea ? ` · ${esc(sourceArea)}` : ''}</small></span></label>`; }).join('') : '<div class="check"><span class="muted">Nessun sensore di potenza rilevato.</span></div>'}<div class="searchEmpty" data-search-empty hidden>Nessuna entità corrispondente.</div></div></div>`;
      }).join('');

    const cameraAreaOptions = [...this._areas]
      .map(area => ({ id: area.area_id || area.id, name: area.name || area.area_id || area.id }))
      .filter(area => area.id)
      .sort((a, b) => a.name.localeCompare(b.name, 'it'));
    const cameraRows = cameras.map(state => {
      const entityId = state.entity_id;
      const registryAreaId = this._areaForEntity(entityId);
      const configuredArea = cameraAreas[entityId] || '';
      const effectiveArea = configuredArea || registryAreaId || '';
      const visible = cameraVisibility[entityId] !== false;
      const available = !['unavailable', 'unknown', ''].includes(String(state.state || '').toLowerCase());
      const areaName = deviceArea.get(effectiveArea) || effectiveArea || 'Nessuna area';
      return `<div class="cameraRow" data-camera-config="${esc(entityId)}" data-search-text="${esc(`${this._name(entityId)} ${entityId} ${areaName}`)}"><div class="cameraInfo"><b>${esc(this._name(entityId))}</b><small>${esc(entityId)} · ${available ? 'Online' : 'Non disponibile'} · ${esc(areaName)}</small></div><label class="cameraToggle"><input type="checkbox" data-camera-visible ${visible ? 'checked' : ''}> Visibile</label><select data-camera-area><option value="">Area automatica (Home Assistant)</option>${cameraAreaOptions.map(area => `<option value="${esc(area.id)}" ${configuredArea === area.id ? 'selected' : ''}>${esc(area.name)}</option>`).join('')}</select></div>`;
    }).join('');

    const securityRows = securityEntities.map(item => {
      const entityId = item.entity_id;
      const visible = cameraVisibility[entityId] !== false;
      const location = [item.floor_name, item.area_name].filter(Boolean).join(' · ') || 'Altri dispositivi';
      return `<label class="check" data-search-text="${esc(`${item.name} ${entityId} ${item.kind} ${location}`)}"><input type="checkbox" data-security-visible value="${esc(entityId)}" ${visible ? 'checked' : ''}><span><b>${esc(item.name)}</b><small>${esc(item.kind)} · ${esc(location)} · ${esc(entityId)}</small></span></label>`;
    }).join('');

    const dashboardAreas = Array.isArray(this._dashboardModel?.areas) ? this._dashboardModel.areas : [];
    const savedAreaOrder = this._resetOrders.has('areas') ? [] : (r.area_order || []);
    const orderedAreas = this._sortBySaved(
      dashboardAreas.map(area => ({ id: area.id, name: area.name || area.id, entities: area.entities || {} })),
      savedAreaOrder,
      area => area.id,
      area => area.name,
    );
    const areaVisibility = r.area_visibility || {};
    const areaPictureVisibility = r.area_picture_visibility || {};
    const areaOrderRows = orderedAreas.map(area => this._areaOrderRow(
      area,
      areaVisibility[area.id] !== false,
      areaPictureVisibility[area.id] !== false,
    )).join('');

    const moduleLabels = { lights: 'Luci', outlets: 'Prese', switches: 'Interruttori', covers: 'Aperture', fans: 'Ventilatori', locks: 'Serrature', sirens: 'Sirene', valves: 'Valvole', climate: 'Clima', cameras: 'Telecamere' };
    const savedEntityOrder = this._resetOrders.has('entities') ? [] : (r.entity_order || []);
    const entityOrderBlocks = orderedAreas.map(area => {
      const groups = Object.entries(moduleLabels).map(([module, label]) => {
        const items = Array.isArray(area.entities?.[module]) ? area.entities[module] : [];
        if (!items.length) return '';
        const ordered = this._sortBySaved(items, savedEntityOrder, item => item.entity_id, item => item.name || item.entity_id);
        return `<div class="entityGroup"><h5>${esc(label)}</h5><div class="orderList" data-order-kind="entities" data-entity-order-list>${ordered.map(item => this._orderRow(item.entity_id, item.name || this._name(item.entity_id), item.entity_id)).join('')}</div></div>`;
      }).join('');
      if (!groups) return '';
      return `<details class="areaOrderDetails"><summary>${esc(area.name)}</summary>${groups}</details>`;
    }).join('');

    const coreSpecs = [
      ['lights', 'Luci'], ['covers', 'Aperture'], ['climate', 'Clima'], ['cameras', 'Telecamere'], ['security', 'Sicurezza'],
    ];
    const savedHomeOrder = this._resetOrders.has('home') ? [] : (r.home_order || []);
    const coreSystems = this._sortBySaved(
      coreSpecs.filter(([id]) => Number(this._dashboardModel?.modules?.[id]?.count || 0) > 0),
      savedHomeOrder,
      item => item[0],
      item => item[1],
    );
    const clSystems = this._sortBySaved(
      (this._dashboardModel?.cl_modules || []).filter(item => item?.customer_visible && item?.route),
      savedHomeOrder,
      item => `cl:${item.module_id || item.domain}`,
      item => item.customer_label || item.display_name || item.module_id || item.domain,
    );
    const systemOrderRows = coreSystems.map(item => this._orderRow(item[0], item[1], 'Sistema CL Control')).join('');
    const clSystemOrderRows = clSystems.map(item => this._orderRow(`cl:${item.module_id || item.domain}`, item.customer_label || item.display_name || item.module_id || item.domain, item.display_name || item.domain || '')).join('');
    const organizationHtml = `<div class="section" id="dashboardOrganization"><div class="sectionTitle"><div><h3>Organizzazione dashboard</h3><p class="muted">Trascina gli elementi oppure usa ↑ / ↓. Per ogni area puoi anche decidere se mostrarla nella Home e se usare la relativa immagine. Le preferenze sono uniche per l'impianto e vengono applicate a tutti gli utenti.</p></div><button type="button" class="primary compact" id="saveDashboardOrder">SALVA ORDINE</button></div><div class="orderGrid"><div class="orderPanel"><div class="orderPanelHead"><h4>Aree</h4><button type="button" data-reset-order="areas">ORDINE AUTOMATICO</button></div><div class="orderList" id="areaOrderList" data-order-kind="areas">${areaOrderRows || '<div class="muted" style="padding:10px">Nessuna area attiva.</div>'}</div></div><div class="orderPanel"><div class="orderPanelHead"><h4>Sistemi</h4><button type="button" data-reset-order="home">ORDINE AUTOMATICO</button></div><div class="orderList" data-order-kind="home" data-home-order-list>${systemOrderRows || '<div class="muted" style="padding:10px">Nessun sistema disponibile.</div>'}</div>${clSystemOrderRows ? `<h5 style="margin:12px 0 6px">Sistemi CL</h5><div class="orderList" data-order-kind="home" data-home-order-list>${clSystemOrderRows}</div>` : ''}</div></div><div class="orderPanelHead" style="margin-top:14px"><h4>Dispositivi nelle aree</h4><button type="button" data-reset-order="entities">ORDINE AUTOMATICO</button></div><p class="muted">Apri una stanza e ordina i dispositivi nella sezione coerente con il relativo “Mostra come” di Home Assistant: luci, prese, interruttori, aperture, ventilatori, serrature, sirene, valvole, clima e telecamere.</p>${entityOrderBlocks || '<div class="muted">Nessun dispositivo ordinabile nelle aree.</div>'}</div>`;

    this.shadowRoot.innerHTML = `${this._styles()}<ha-card>
      <div class="top"><div><h2>Configurazione Installatore</h2><div class="muted">Configurazione tecnica della nuova CL Control 3.5.</div></div><button class="danger" id="lockInstaller">TERMINA SESSIONE</button></div>
      <div class="section"><div class="sectionTitle"><div><h3>Dashboard</h3><p class="muted">Il livello esperienza viene applicato subito. Essential nasconde la telemetria ambientale e di potenza; Standard aggiunge i sensori ambiente; Pro aggiunge anche la potenza.</p></div><button type="button" id="goDashboardOrganization">ORGANIZZA</button></div><div class="grid"><div class="field"><label>Livello esperienza</label><select id="experienceLevel"><option value="essential" ${r.experience_level === 'essential' ? 'selected' : ''}>Essential</option><option value="standard" ${r.experience_level === 'standard' ? 'selected' : ''}>Standard</option><option value="pro" ${r.experience_level === 'pro' ? 'selected' : ''}>Pro</option></select></div></div></div>
      <div class="section"><h3>Titolo Home Assistant</h3><p class="muted">Personalizza la scritta principale mostrata in alto nella barra laterale di Home Assistant. Il valore predefinito è CL Control. Puoi usare il nome impianto, un testo personalizzato oppure ripristinare il nome originale di Home Assistant.</p><div class="grid"><div class="field"><label>Titolo principale</label><select id="shellTitleMode"><option value="cl_control" ${shellTitle.mode === 'cl_control' || !shellTitle.mode ? 'selected' : ''}>CL Control</option><option value="site" ${shellTitle.mode === 'site' ? 'selected' : ''}>Nome impianto (${esc(support.site_name || 'Casa')})</option><option value="custom" ${shellTitle.mode === 'custom' ? 'selected' : ''}>Personalizzato</option><option value="original" ${shellTitle.mode === 'original' ? 'selected' : ''}>Mantieni nome Home Assistant</option></select></div><div class="field"><label>Titolo personalizzato</label><input id="shellTitleCustom" value="${esc(shellTitle.custom || '')}" placeholder="Es. Villa Rossi" ${shellTitle.mode === 'custom' ? '' : 'disabled'}></div></div></div>
      ${organizationHtml}
      <div class="section"><h3>Meteo</h3><div class="grid"><div class="field"><label>Modalità</label><select id="weatherMode"><option value="auto" ${weather.mode !== 'manual' && weather.mode !== 'off' ? 'selected' : ''}>Automatico</option><option value="manual" ${weather.mode === 'manual' ? 'selected' : ''}>Selezione manuale</option><option value="off" ${weather.mode === 'off' ? 'selected' : ''}>Disattivato</option></select></div><div class="field"><label>Entità meteo</label><input id="weatherEntity" list="weatherEntityOptions" value="${esc(weather.entity || '')}" placeholder="Scrivi o incolla weather.…" autocomplete="off"><datalist id="weatherEntityOptions">${weatherEntities.map(state => `<option value="${esc(state.entity_id)}" label="${esc(this._name(state.entity_id))}"></option>`).join('')}</datalist></div></div><p class="muted">In Manuale puoi scrivere o incollare direttamente l'entity_id; Home Assistant propone le entità weather.* compatibili. In Automatico CL Control utilizza la prima entità disponibile.</p></div>
      <div class="section"><h3>Potenza totale casa</h3><div class="grid"><div class="field"><label>Modalità</label><select id="homePowerMode"><option value="auto" ${(monitoring.home?.mode || 'auto') === 'auto' ? 'selected' : ''}>Automatico</option><option value="manual" ${monitoring.home?.mode === 'manual' ? 'selected' : ''}>Selezione manuale</option><option value="off" ${monitoring.home?.mode === 'off' ? 'selected' : ''}>Disattivato</option></select></div><div class="field"><label>Sensori disponibili</label><div class="muted">${power.length} sensori power rilevati</div></div></div><div class="searchBox"><ha-icon icon="mdi:magnify"></ha-icon><input type="search" data-entity-search="homePowerList" placeholder="Cerca per nome o entity_id…" autocomplete="off"></div><div class="list" id="homePowerList">${power.length ? power.map(state => `<label class="check" data-search-text="${esc(`${this._name(state.entity_id)} ${state.entity_id} ${deviceArea.get(this._areaForEntity(state.entity_id)) || ''}`)}"><input type="checkbox" data-home-power value="${esc(state.entity_id)}" ${homeSelected.has(state.entity_id) ? 'checked' : ''}><span><b>${esc(this._name(state.entity_id))}</b><small>${esc(state.entity_id)} · ${esc(state.attributes?.unit_of_measurement || '')}${this._areaForEntity(state.entity_id) ? ` · ${esc(deviceArea.get(this._areaForEntity(state.entity_id)) || '')}` : ''}</small></span></label>`).join('') : '<div class="check"><span class="muted">Nessun sensore di potenza rilevato.</span></div>'}<div class="searchEmpty" data-search-empty hidden>Nessuna entità corrispondente.</div></div></div>
      <div class="section"><h3>Potenza per area</h3><p class="muted">Auto somma i sensori power assegnati all'area. Manuale usa solo i sensori selezionati.</p>${areaBlocks || '<p class="muted">Nessuna area disponibile.</p>'}</div>
      <div class="section"><h3>Telecamere</h3><p class="muted">Scegli quali telecamere CL Control deve mostrare e, se necessario, correggi manualmente l'area. La stessa associazione viene usata per proporre le telecamere pertinenti nella schermata Sicurezza.</p><div class="searchBox"><ha-icon icon="mdi:magnify"></ha-icon><input type="search" data-entity-search="cameraEntityList" placeholder="Cerca per nome o entity_id…" autocomplete="off"></div><div class="cameraList list" id="cameraEntityList">${cameraRows || '<div class="check"><span class="muted">Nessuna telecamera rilevata.</span></div>'}<div class="searchEmpty" data-search-empty hidden>Nessuna telecamera corrispondente.</div></div></div>
      <div class="section"><h3>Sicurezza <span class="badge">${this._securityPinConfigured ? 'CODICE ATTIVO' : 'DA CONFIGURARE'}</span></h3><p class="muted">Scegli quali pannelli, partizioni INIM e zone mostrare nella schermata Sicurezza. Per INIM puoi lasciare visibili solo le partizioni che vuoi gestire: ogni partizione avrà la propria card con comandi indipendenti. Le entità restano in Home Assistant: questa opzione modifica soltanto la visualizzazione CL Control.</p><div class="searchBox"><ha-icon icon="mdi:magnify"></ha-icon><input type="search" data-entity-search="securityEntityList" placeholder="Cerca partizione, zona o entity_id…" autocomplete="off"></div><div class="list" id="securityEntityList">${securityRows || '<div class="check"><span class="muted">Nessuna entità di sicurezza rilevata.</span></div>'}<div class="searchEmpty" data-search-empty hidden>Nessuna entità corrispondente.</div></div><div class="grid" style="margin-top:14px"><div class="field"><label>Nuovo Codice Sicurezza</label><input id="securityPin" type="password" inputmode="numeric" maxlength="12" placeholder="4–12 cifre"></div><div class="field"><label>Conferma Codice Sicurezza</label><input id="securityPinConfirm" type="password" inputmode="numeric" maxlength="12" placeholder="Ripeti il codice"></div></div><div class="actions"><button id="saveSecurityPin">SALVA CODICE SICUREZZA</button></div></div>
      <div class="section"><h3>Impianto e Assistenza</h3><div class="grid"><div class="field"><label>Nome impianto</label><input id="siteName" value="${esc(support.site_name || 'Casa')}"></div><div class="field"><label>Cliente</label><input id="customerName" value="${esc(support.customer || '')}"></div><div class="field"><label>WhatsApp</label><input id="supportWhatsapp" value="${esc(support.whatsapp || '')}"></div><div class="field"><label>Telefono</label><input id="supportPhone" value="${esc(support.phone || '')}"></div></div></div>
      <div class="actions"><button class="primary" id="saveGeneral">SALVA CONFIGURAZIONE</button></div>
    </ha-card>`;

    this.shadowRoot.querySelector('#lockInstaller')?.addEventListener('click', () => this._lock());
    this.shadowRoot.querySelector('#saveGeneral')?.addEventListener('click', () => this._saveGeneral({ reload: true }));
    this.shadowRoot.querySelector('#saveSecurityPin')?.addEventListener('click', () => this._saveSecurityPin());
    this.shadowRoot.querySelector('#experienceLevel')?.addEventListener('change', () => this._saveExperienceLevel());
    this.shadowRoot.querySelector('#shellTitleMode')?.addEventListener('change', event => {
      const input = this.shadowRoot.querySelector('#shellTitleCustom');
      if (input) input.disabled = event.target.value !== 'custom';
    });
    this.shadowRoot.querySelector('#saveDashboardOrder')?.addEventListener('click', () => this._saveGeneral({ reload: true, message: 'Ordine dashboard salvato.' }));
    this.shadowRoot.querySelector('#goDashboardOrganization')?.addEventListener('click', () => this.shadowRoot.querySelector('#dashboardOrganization')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    this._wireSearchInputs();
    this._wireOrderLists();
  }
}

if (!customElements.get('cl-control-installer-card')) {
  customElements.define('cl-control-installer-card', CLControlInstallerCard);
}

window.customCards = window.customCards || [];
if (!window.customCards.some(card => card.type === 'cl-control-installer-card')) {
  window.customCards.push({
    type: 'cl-control-installer-card',
    name: 'CL Control Installer',
    description: 'Configurazione Installatore integrata nella dashboard CL Control.',
  });
}

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
    this._page = 'home';
    this._securityTab = 'partitions';
    this._dirtyKeys = new Set();
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
    this._page = 'home';
    this._securityTab = 'partitions';
    this._dirtyKeys = new Set();
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

  _energySensors() {
    return Object.values(this._hass?.states || {})
      .filter(state => {
        if (!state?.entity_id?.startsWith('sensor.')) return false;
        const registryEntry = this._entities.find(item => item.entity_id === state.entity_id);
        if (String(registryEntry?.platform || '').toLowerCase() === 'cl_control') return false;
        const dc = String(state.attributes?.device_class || '').toLowerCase();
        const sc = String(state.attributes?.state_class || '').toLowerCase();
        const unit = String(state.attributes?.unit_of_measurement || '').toLowerCase();
        return dc === 'energy' && ['total','total_increasing'].includes(sc) && ['wh','kwh','mwh'].includes(unit);
      })
      .sort((a, b) => this._name(a.entity_id).localeCompare(this._name(b.entity_id), 'it'));
  }

  _energyCommandEntities() {
    const domains = new Set(['switch', 'light']);
    return Object.values(this._hass?.states || {})
      .filter(state => {
        const entityId = String(state?.entity_id || '');
        if (!domains.has(entityId.split('.', 1)[0])) return false;
        const registry = this._entities.find(item => item.entity_id === entityId);
        return !registry?.disabled_by;
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

  _favoriteEntities() {
    const domains = new Set([
      'alarm_control_panel', 'button', 'camera', 'climate', 'cover', 'fan',
      'humidifier', 'input_boolean', 'input_button', 'lawn_mower', 'light',
      'lock', 'media_player', 'scene', 'script', 'select', 'siren', 'switch',
      'valve', 'vacuum',
    ]);
    return Object.values(this._hass?.states || {})
      .filter(state => {
        const entityId = String(state?.entity_id || '');
        const domain = entityId.split('.', 1)[0];
        if (!domains.has(domain)) return false;
        const registry = this._entities.find(item => item.entity_id === entityId);
        return !registry?.disabled_by;
      })
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

  _wireOrderList(list) {
    if (!list) return;
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
        this._markDirty(`order-${String(list.dataset.orderKind || 'items')}`);
      });
    });
    list.querySelectorAll('[data-move-order]').forEach(button => {
      button.addEventListener('click', () => {
        const row = button.closest('.orderRow');
        if (!row) return;
        if (button.dataset.moveOrder === 'up' && row.previousElementSibling) row.parentElement.insertBefore(row, row.previousElementSibling);
        if (button.dataset.moveOrder === 'down' && row.nextElementSibling) row.parentElement.insertBefore(row.nextElementSibling, row);
        this._resetOrders.delete(String(list.dataset.orderKind || ''));
        this._markDirty(`order-${String(list.dataset.orderKind || 'items')}`);
      });
    });
  }

  _wireOrderLists() {
    this.shadowRoot.querySelectorAll('.orderList').forEach(list => this._wireOrderList(list));
    this.shadowRoot.querySelectorAll('[data-reset-order]').forEach(button => {
      button.addEventListener('click', () => {
        const kind = String(button.dataset.resetOrder || '');
        if (!kind) return;
        if (this._runtime) this._runtime = this._collectRuntime();
        this._resetOrders.add(kind);
        this._markDirty(`order-${kind}`);
        this._toast('Ordine automatico selezionato. Premi SALVA per applicarlo.');
        this._render();
      });
    });
  }

  _syncFavoriteOrder() {
    const list = this.shadowRoot.getElementById('favoriteOrderList');
    if (!list) return;
    const checked = [...this.shadowRoot.querySelectorAll('[data-favorite-select]:checked')]
      .map(input => String(input.value || ''))
      .filter(Boolean);
    const checkedSet = new Set(checked);
    const existing = [...list.querySelectorAll('[data-order-key]')]
      .map(row => String(row.dataset.orderKey || ''))
      .filter(id => checkedSet.has(id));
    const existingSet = new Set(existing);
    const ordered = [...existing, ...checked.filter(id => !existingSet.has(id))];
    list.innerHTML = ordered.length
      ? ordered.map(entityId => {
          const areaId = this._areaForEntity(entityId);
          const area = this._areas.find(item => (item.area_id || item.id) === areaId);
          const subtitle = [entityId, area?.name || ''].filter(Boolean).join(' · ');
          return this._orderRow(entityId, this._name(entityId), subtitle);
        }).join('')
      : '<div class="muted" style="padding:10px">Nessun preferito selezionato.</div>';
    this._wireOrderList(list);
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
    this._page = 'home';
    this._securityTab = 'partitions';
    this._dirtyKeys = new Set();
    this._render();
  }

  _collectRuntime() {
    const current = structuredClone(this._runtime || {});
    const value = (selector, fallback = '') => {
      const node = this.shadowRoot.querySelector(selector);
      return node ? node.value : fallback;
    };
    const checkedValues = selector => [...this.shadowRoot.querySelectorAll(selector)]
      .filter(input => input.checked)
      .map(input => String(input.value || ''))
      .filter(Boolean);

    const experience = this.shadowRoot.querySelector('#experienceLevel');
    if (experience) current.experience_level = experience.value || 'standard';

    const welcomeMode = this.shadowRoot.querySelector('#welcomeMode');
    if (welcomeMode) {
      current.welcome = {
        mode: welcomeMode.value || 'compact',
        secondary_mode: value('#welcomeSecondaryMode', current.welcome?.secondary_mode || 'auto') || 'auto',
        secondary_text: value('#welcomeSecondaryText', current.welcome?.secondary_text || '').trim(),
      };
    }

    const favoritesLabel = this.shadowRoot.querySelector('#favoritesLabel');
    if (favoritesLabel) current.favorites_label = favoritesLabel.value.trim() || 'Preferiti';
    if (this.shadowRoot.querySelector('[data-favorite-select]')) {
      const selectedFavoriteIds = new Set(checkedValues('[data-favorite-select]'));
      const favoriteOrder = [...this.shadowRoot.querySelectorAll('#favoriteOrderList [data-order-key]')]
        .map(row => String(row.dataset.orderKey || ''))
        .filter(entityId => selectedFavoriteIds.has(entityId));
      const favoriteOrderSet = new Set(favoriteOrder);
      current.favorites = [...favoriteOrder, ...[...selectedFavoriteIds].filter(entityId => !favoriteOrderSet.has(entityId))];
    }

    const weatherMode = this.shadowRoot.querySelector('#weatherMode');
    if (weatherMode) {
      current.weather = {
        mode: weatherMode.value || 'auto',
        entity: value('#weatherEntity', current.weather?.entity || ''),
      };
    }

    const homePowerMode = this.shadowRoot.querySelector('#homePowerMode');
    if (homePowerMode || this.shadowRoot.querySelector('[data-area-box]')) {
      current.power_monitoring = current.power_monitoring || { home: {}, areas: {} };
      if (homePowerMode) {
        current.power_monitoring.home = {
          mode: homePowerMode.value || 'auto',
          entities: checkedValues('[data-home-power]'),
        };
      }
      if (this.shadowRoot.querySelector('[data-area-box]')) {
        const areas = { ...(current.power_monitoring.areas || {}) };
        this.shadowRoot.querySelectorAll('[data-area-box]').forEach(box => {
          const areaId = box.dataset.areaBox;
          areas[areaId] = {
            mode: box.querySelector('[data-area-mode]')?.value || 'auto',
            entities: [...box.querySelectorAll('[data-area-power]:checked')].map(input => input.value),
          };
        });
        current.power_monitoring.areas = areas;
      }
    }

    if (this.shadowRoot.querySelector('[data-monitored-load]')) {
      current.energy = { ...(current.energy || {}) };
      current.energy.monitored_loads = [...this.shadowRoot.querySelectorAll('[data-monitored-load]')].map(row => ({
        id: String(row.dataset.monitoredLoad || '').trim(),
        name: String(row.querySelector('[data-load-name]')?.value || '').trim(),
        area_id: String(row.querySelector('[data-load-area]')?.value || '').trim(),
        power_entity: String(row.querySelector('[data-load-power]')?.value || '').trim(),
        energy_entity: String(row.querySelector('[data-load-energy]')?.value || '').trim(),
        command_entity: String(row.querySelector('[data-load-command]')?.value || '').trim(),
        icon: String(row.querySelector('[data-load-icon]')?.value || '').trim(),
        visible: Boolean(row.querySelector('[data-load-visible]')?.checked),
        ranking: Boolean(row.querySelector('[data-load-ranking]')?.checked),
      })).filter(item => item.id);
    }

    const homeEnergyMode = this.shadowRoot.querySelector('#homeEnergyHistoryMode');
    if (homeEnergyMode) {
      current.energy = { ...(current.energy || {}) };
      current.energy.sources = { ...(current.energy.sources || {}) };
      const mode = homeEnergyMode.value || 'auto';
      const entity = value('#homeEnergyHistoryEntity', '').trim();
      if (mode === 'manual_power') {
        current.energy.sources.home_energy_total = {mode:'off', ids:[]};
        current.energy.sources.home_power_history = {mode:'manual', ids:entity ? [entity] : []};
      } else if (mode === 'manual_energy') {
        current.energy.sources.home_energy_total = {mode:'manual', ids:entity ? [entity] : []};
        current.energy.sources.home_power_history = {mode:'off', ids:[]};
      } else if (mode === 'off') {
        current.energy.sources.home_energy_total = {mode:'off', ids:[]};
        current.energy.sources.home_power_history = {mode:'off', ids:[]};
      } else {
        current.energy.sources.home_energy_total = {mode:'auto', ids:[]};
        current.energy.sources.home_power_history = {mode:'off', ids:[]};
      }
    }

    const visibility = { ...(current.entity_visibility || {}) };
    const entityAreas = { ...(current.entity_areas || {}) };
    let visibilityTouched = false;
    this.shadowRoot.querySelectorAll('[data-camera-config]').forEach(row => {
      visibilityTouched = true;
      const entityId = row.dataset.cameraConfig;
      const visible = Boolean(row.querySelector('[data-camera-visible]')?.checked);
      const area = String(row.querySelector('[data-camera-area]')?.value || '').trim();
      visibility[entityId] = visible;
      if (area) entityAreas[entityId] = area;
      else delete entityAreas[entityId];
    });
    this.shadowRoot.querySelectorAll('[data-security-visible]').forEach(input => {
      visibilityTouched = true;
      const entityId = String(input.value || '').trim();
      if (entityId) visibility[entityId] = Boolean(input.checked);
    });
    if (visibilityTouched) {
      current.entity_visibility = visibility;
      current.entity_areas = entityAreas;
    }

    if (this.shadowRoot.querySelector('[data-area-presentation]')) {
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
    }

    const mergeOrder = (ordered, previous) => {
      const seen = new Set(ordered);
      return [...ordered, ...(previous || []).filter(value => !seen.has(value))];
    };
    const areaRows = [...this.shadowRoot.querySelectorAll('#areaOrderList [data-order-key]')].map(row => row.dataset.orderKey).filter(Boolean);
    const homeRows = [...this.shadowRoot.querySelectorAll('[data-home-order-list] [data-order-key]')].map(row => row.dataset.orderKey).filter(Boolean);
    const homeSectionRows = [...this.shadowRoot.querySelectorAll('#homeSectionOrderList [data-order-key]')].map(row => row.dataset.orderKey).filter(Boolean);
    const entityRows = [...this.shadowRoot.querySelectorAll('[data-entity-order-list] [data-order-key]')].map(row => row.dataset.orderKey).filter(Boolean);
    if (this.shadowRoot.querySelector('#areaOrderList')) {
      if (this._resetOrders.has('areas')) current.area_order = [];
      else if (areaRows.length) current.area_order = mergeOrder(areaRows, current.area_order || []);
    }
    if (this.shadowRoot.querySelector('[data-home-order-list]')) {
      if (this._resetOrders.has('home')) current.home_order = [];
      else if (homeRows.length) current.home_order = mergeOrder(homeRows, current.home_order || []);
    }
    if (this.shadowRoot.querySelector('#homeSectionOrderList')) {
      if (this._resetOrders.has('home-sections')) current.home_section_order = [];
      else if (homeSectionRows.length) current.home_section_order = mergeOrder(homeSectionRows, current.home_section_order || []);
    }
    if (this.shadowRoot.querySelector('[data-entity-order-list]')) {
      if (this._resetOrders.has('entities')) current.entity_order = [];
      else if (entityRows.length) current.entity_order = mergeOrder(entityRows, current.entity_order || []);
    }

    const shellTitleMode = this.shadowRoot.querySelector('#shellTitleMode');
    if (shellTitleMode) {
      current.shell_title = {
        mode: shellTitleMode.value || 'cl_control',
        custom: value('#shellTitleCustom', current.shell_title?.custom || '').trim(),
      };
    }

    if (this.shadowRoot.querySelector('#siteName')) {
      const support = { ...(current.support || {}) };
      support.site_name = value('#siteName', support.site_name || 'Casa').trim() || 'Casa';
      support.customer = value('#customerName', support.customer || '').trim();
      current.support = support;
    }
    if (this.shadowRoot.querySelector('#supportWhatsapp')) {
      const support = { ...(current.support || {}) };
      support.whatsapp = value('#supportWhatsapp', support.whatsapp || '').trim();
      support.phone = value('#supportPhone', support.phone || '').trim();
      current.support = support;
    }
    return current;
  }

  async _saveGeneral({ reload = false, message = 'Configurazione salvata.' } = {}) {
    try {
      const config = this._collectRuntime();
      const saved = await this._hass.callWS({ type: 'cl_control/config/set', config });
      this._runtime = saved || config;
      this._resetOrders.clear();
      this._dirtyKeys.clear();
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
      :host{display:block}ha-card{padding:18px;border-radius:var(--ha-card-border-radius,12px);overflow:hidden}
      h2{font-size:21px;margin:0}h3{font-size:17px;margin:0}h4{font-size:14px;margin:0}.top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px}
      .muted{color:var(--secondary-text-color);font-size:13px;line-height:1.45}.tiny{font-size:11px;color:var(--secondary-text-color)}
      .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.full{grid-column:1/-1}
      .field{display:flex;flex-direction:column;gap:6px}.field label{font-size:12px;font-weight:700;color:var(--secondary-text-color)}
      input,select{box-sizing:border-box;width:100%;min-height:44px;border:1px solid var(--divider-color);border-radius:10px;background:var(--card-background-color);color:var(--primary-text-color);padding:9px 11px;font:inherit}
      button{min-height:42px;border:0;border-radius:10px;padding:0 14px;font-weight:700;cursor:pointer;background:var(--secondary-background-color);color:var(--primary-text-color)}button.primary{background:var(--primary-color);color:var(--text-primary-color,#fff)}button.danger{color:var(--error-color)}button:disabled{opacity:.55;cursor:default}
      .actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.compact{min-height:36px;white-space:nowrap}
      .locked{max-width:430px;margin:0 auto;padding:8px 0 2px}.lockIcon{display:grid;place-items:center;margin:4px auto 12px;width:56px;height:56px;border-radius:50%;background:var(--secondary-background-color)}.lockIcon ha-icon{--mdc-icon-size:30px;color:var(--primary-color)}
      .installerHome{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.navCard{display:flex;align-items:center;gap:13px;text-align:left;padding:14px;border:1px solid var(--divider-color);background:var(--card-background-color);min-height:88px}.navCard:hover{background:var(--secondary-background-color)}.navIcon{display:grid;place-items:center;width:44px;height:44px;min-width:44px;border-radius:13px;background:color-mix(in srgb,var(--primary-color) 12%,transparent);color:var(--primary-color)}.navIcon ha-icon{--mdc-icon-size:24px}.navCopy{min-width:0;flex:1}.navCopy b{display:block;font-size:14px}.navCopy small{display:block;margin-top:4px;color:var(--secondary-text-color);font-weight:500;line-height:1.35}.navArrow{color:var(--secondary-text-color)}
      .pageHead{display:flex;align-items:flex-start;gap:10px;margin-bottom:14px}.pageHead button{min-width:42px;padding:0}.pageHeadCopy{flex:1}.pageHeadCopy p{margin:5px 0 0}
      .section{border:1px solid var(--divider-color);border-radius:13px;padding:14px;margin-top:12px}.sectionTitle{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.sectionTitle p{margin:5px 0 0}.badge{display:inline-flex;align-items:center;border-radius:999px;padding:4px 8px;font-size:11px;font-weight:700;background:var(--secondary-background-color)}
      .summaryLine{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:1px solid var(--divider-color)}.summaryLine:last-child{border-bottom:0}.summaryLine b{font-size:13px}.summaryLine span{font-size:12px;color:var(--secondary-text-color);text-align:right}
      .energyContractGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:10px}.energySource{border:1px solid var(--divider-color);border-radius:11px;padding:10px;min-width:0}.energySourceTop{display:flex;align-items:center;justify-content:space-between;gap:8px}.energySourceTop b{font-size:12px}.energyStatus{font-size:10px;font-weight:800;border-radius:999px;padding:3px 7px;background:var(--secondary-background-color);white-space:nowrap}.energyStatus.ok{color:var(--success-color,#43a047);background:color-mix(in srgb,var(--success-color,#43a047) 12%,transparent)}.energyStatus.missing{color:var(--secondary-text-color)}.energySource small{display:block;margin-top:5px;color:var(--secondary-text-color);font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:9px}.chip{display:inline-flex;align-items:center;gap:5px;padding:5px 8px;border-radius:999px;background:var(--secondary-background-color);font-size:11px;max-width:100%}.chip span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .picker{margin-top:10px;border:1px solid var(--divider-color);border-radius:12px;background:var(--primary-background-color);padding:10px}.picker[hidden]{display:none}.searchBox{position:relative}.searchBox input{padding-left:38px}.searchBox ha-icon{position:absolute;left:11px;top:50%;transform:translateY(-50%);--mdc-icon-size:19px;color:var(--secondary-text-color);pointer-events:none}.list{max-height:320px;overflow:auto;border:1px solid var(--divider-color);border-radius:10px;margin-top:8px}.check{display:flex;align-items:center;gap:9px;padding:9px 10px;border-bottom:1px solid var(--divider-color);font-size:13px}.check:last-child{border-bottom:0}.check[hidden]{display:none}.check input{width:auto;min-height:auto}.check span{min-width:0}.check b{display:block;font-size:13px}.check small{display:block;color:var(--secondary-text-color);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.searchEmpty{padding:12px;color:var(--secondary-text-color);font-size:13px}
      .areaConfig{border:1px solid var(--divider-color);border-radius:12px;margin-top:9px;padding:11px}.areaHead{display:flex;align-items:center;justify-content:space-between;gap:10px}.areaHead b{font-size:14px}.areaHead span{font-size:11px;color:var(--secondary-text-color)}
      .cameraRow{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(190px,.65fr);gap:10px;align-items:center;padding:10px 12px;border-bottom:1px solid var(--divider-color)}.cameraInfo{display:flex;flex-direction:column}.cameraInfo small{color:var(--secondary-text-color);margin-top:3px}.cameraToggle{display:flex;align-items:center;gap:6px}.cameraToggle input{width:auto;min-height:auto}
      .tabs{display:flex;gap:6px;overflow:auto;margin:10px 0}.tab{min-height:36px;padding:0 12px;border:1px solid var(--divider-color);white-space:nowrap}.tab.active{background:var(--primary-color);color:var(--text-primary-color,#fff);border-color:var(--primary-color)}
      .securityGroup{margin-top:12px}.securityGroupTitle{font-size:12px;font-weight:800;color:var(--secondary-text-color);padding:5px 2px}.securityArea{margin:6px 0;border:1px solid var(--divider-color);border-radius:10px;overflow:hidden}.securityAreaTitle{padding:8px 10px;background:var(--secondary-background-color);font-size:12px;font-weight:700}
      .orderGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.orderPanel{border:1px solid var(--divider-color);border-radius:10px;padding:10px}.orderPanelHead{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}.orderPanelHead h4{margin:0;font-size:14px}.orderPanelHead button{min-height:34px;font-size:11px}.orderList{border:1px solid var(--divider-color);border-radius:10px;overflow:hidden}.orderRow{display:flex;align-items:center;gap:9px;min-height:48px;padding:6px 7px;border-bottom:1px solid var(--divider-color);background:var(--card-background-color)}.orderRow:last-child{border-bottom:0}.orderRow.dragging{opacity:.5}.dragHandle{cursor:grab;color:var(--secondary-text-color)}.orderText{min-width:0;flex:1}.orderText b{display:block;font-size:13px}.orderText small{display:block;color:var(--secondary-text-color);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.areaOptions{display:flex;align-items:center;gap:9px;flex-wrap:wrap}.areaOptions label{display:flex;align-items:center;gap:4px;font-size:11px;color:var(--secondary-text-color);white-space:nowrap}.areaOptions input{width:auto;min-height:auto}.orderActions{display:flex;gap:3px}.orderActions button{min-width:34px;min-height:34px;padding:0}.orderActions ha-icon{--mdc-icon-size:20px}.areaOrderDetails{border:1px solid var(--divider-color);border-radius:10px;margin-top:8px;padding:0 10px}.areaOrderDetails summary{cursor:pointer;font-weight:700;padding:12px 2px}.entityGroup{margin:0 0 12px}.entityGroup h5{font-size:12px;margin:8px 0;color:var(--secondary-text-color)}
      .monitoredList{display:grid;gap:10px;margin-top:12px}.monitoredLoad{border:1px solid var(--divider-color);border-radius:12px;padding:12px;background:var(--card-background-color)}.monitoredLoadHead{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}.monitoredLoadHead b{font-size:14px}.monitoredLoadActions{display:flex;align-items:center;gap:7px}.monitoredLoadActions button{min-height:34px;padding:0 10px}.toggleLine{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-top:10px}.toggleLine label{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--secondary-text-color)}.toggleLine input{width:auto;min-height:auto}.sourceBadge{font-size:10px;font-weight:800;padding:4px 7px;border-radius:999px;background:var(--secondary-background-color)}.sourceBadge.ok{color:var(--success-color,#43a047);background:color-mix(in srgb,var(--success-color,#43a047) 12%,transparent)}.pcLoadList{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:10px}.pcLoadItem{border:1px solid var(--divider-color);border-radius:10px;padding:9px 10px}.pcLoadItem b{font-size:12px}.pcLoadItem small{display:block;margin-top:3px;color:var(--secondary-text-color);font-size:10px}
      .saveBar{position:sticky;bottom:10px;z-index:5;display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:18px;padding:10px 12px;border:1px solid var(--divider-color);border-radius:13px;background:color-mix(in srgb,var(--card-background-color) 94%,transparent);backdrop-filter:blur(10px);box-shadow:0 6px 22px rgba(0,0,0,.12)}.saveBar.clean{opacity:.72}.saveBarText{font-size:12px}.saveBarText b{display:block}.saveBarActions{display:flex;gap:7px}
      @media(max-width:760px){ha-card{padding:14px}.grid,.installerHome,.orderGrid,.energyContractGrid,.pcLoadList{grid-template-columns:1fr}.cameraRow{grid-template-columns:1fr}.top{align-items:flex-start}.sectionTitle{flex-direction:column}.sectionTitle button{width:100%}.areaHead{align-items:flex-start;flex-direction:column}.saveBar{bottom:6px}.saveBarActions button{padding:0 10px}.areaOrderRow{flex-wrap:wrap}.areaOrderRow .orderText{min-width:130px}.areaOptions{order:4;width:100%;padding-left:32px}}
    </style>`;
  }

  _markDirty(key = 'config') {
    this._dirtyKeys.add(String(key || 'config'));
    this._updateSaveBar();
  }

  _updateSaveBar() {
    const bar = this.shadowRoot?.querySelector('.saveBar');
    if (!bar) return;
    const count = this._dirtyKeys.size;
    bar.classList.toggle('clean', count === 0);
    const text = bar.querySelector('.saveBarText');
    if (text) text.innerHTML = count ? `<b>${count} ${count === 1 ? 'modifica' : 'modifiche'} non salvate</b><span>Salva per applicare alla dashboard.</span>` : '<b>Configurazione salvata</b><span>Nessuna modifica in sospeso.</span>';
    const save = bar.querySelector('[data-global-save]');
    if (save) save.disabled = count === 0;
  }

  _goPage(page) {
    if (this._page !== 'home' && this._runtime) this._runtime = this._collectRuntime();
    this._page = page || 'home';
    this._render();
  }

  _pageHead(title, description) {
    return `<div class="pageHead"><button type="button" data-back-home title="Indietro"><ha-icon icon="mdi:arrow-left"></ha-icon></button><div class="pageHeadCopy"><h2>${esc(title)}</h2><p class="muted">${esc(description)}</p></div></div>`;
  }

  _chips(entityIds, empty = 'Nessuna entità selezionata') {
    if (!entityIds?.length) return `<div class="muted" style="margin-top:8px">${esc(empty)}</div>`;
    return `<div class="chips">${entityIds.map(entityId => `<span class="chip"><ha-icon icon="mdi:check"></ha-icon><span>${esc(this._name(entityId))}</span></span>`).join('')}</div>`;
  }

  _securityGroupedRows(items, visibility) {
    if (!items.length) return '<div class="muted">Nessuna entità in questa categoria.</div>';
    const floors = new Map();
    for (const item of items) {
      const floor = item.floor_name || 'Altri piani';
      const area = item.area_name || 'Altri dispositivi';
      if (!floors.has(floor)) floors.set(floor, new Map());
      if (!floors.get(floor).has(area)) floors.get(floor).set(area, []);
      floors.get(floor).get(area).push(item);
    }
    return [...floors.entries()].map(([floor, areas]) => `<div class="securityGroup"><div class="securityGroupTitle">${esc(floor)}</div>${[...areas.entries()].map(([area, rows]) => `<div class="securityArea"><div class="securityAreaTitle">${esc(area)}</div>${rows.map(item => { const id=item.entity_id; return `<label class="check" data-search-text="${esc(`${item.name} ${id} ${item.kind} ${floor} ${area}`)}"><input type="checkbox" data-security-visible value="${esc(id)}" ${visibility[id] !== false ? 'checked' : ''}><span><b>${esc(item.name)}</b><small>${esc(item.kind)} · ${esc(id)}</small></span></label>`; }).join('')}</div>`).join('')}</div>`).join('');
  }

  _saveBar() {
    const count = this._dirtyKeys.size;
    return `<div class="saveBar ${count ? '' : 'clean'}"><div class="saveBarText">${count ? `<b>${count} ${count===1?'modifica':'modifiche'} non salvate</b><span>Salva per applicare alla dashboard.</span>` : '<b>Configurazione salvata</b><span>Nessuna modifica in sospeso.</span>'}</div><div class="saveBarActions"><button type="button" data-discard ${count ? '' : 'disabled'}>ANNULLA</button><button type="button" class="primary" data-global-save ${count ? '' : 'disabled'}>SALVA</button></div></div>`;
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
    const support = r.support || {};
    const weather = r.weather || {mode:'auto',entity:''};
    const monitoring = r.power_monitoring || {home:{mode:'auto',entities:[]},areas:{}};
    const shellTitle = r.shell_title || {mode:'cl_control',custom:''};
    const welcome = r.welcome || {mode:'compact',secondary_mode:'auto',secondary_text:''};
    const power = this._powerSensors();
    const energySensors = this._energySensors();
    const energyCommands = this._energyCommandEntities();
    const weatherEntities = this._weatherEntities();
    const cameras = this._cameraEntities();
    const securityEntities = this._securityEntities();
    const favoriteEntities = this._favoriteEntities();
    const selectedFavorites = new Set(r.favorites || []);
    const visibility = r.entity_visibility || {};
    const cameraAreas = r.entity_areas || {};
    const areaNames = new Map(this._areas.map(area => [area.area_id || area.id, area.name || area.area_id || area.id]));
    const areas = this._areas.map(area => ({id:area.area_id||area.id,name:area.name||area.area_id||area.id})).filter(area=>area.id).sort((a,b)=>a.name.localeCompare(b.name,'it'));
    const visibleCameraCount = cameras.filter(state => visibility[state.entity_id] !== false).length;
    const visibleSecurityCount = securityEntities.filter(item => visibility[item.entity_id] !== false).length;
    const configuredAreaPower = Object.values(monitoring.areas || {}).filter(cfg => cfg?.mode && cfg.mode !== 'auto').length;
    const energyContract = this._dashboardModel?.energy || {};
    const energyCapabilities = energyContract.capabilities || {};
    const energySources = energyContract.sources || {};
    const energyReadyCount = Object.values(energySources).filter(source => Array.isArray(source?.ids) && source.ids.length && !['not_configured','unsupported','disabled','unavailable'].includes(source.quality)).length;
    const homeEnergyOverride = r.energy?.sources?.home_energy_total || {};
    const homePowerHistoryOverride = r.energy?.sources?.home_power_history || {};
    const homeEnergyMode = String(homePowerHistoryOverride.mode || '') === 'manual' ? 'manual_power' : String(homeEnergyOverride.mode || '') === 'manual' ? 'manual_energy' : String(homeEnergyOverride.mode || '') === 'off' ? 'off' : 'auto';
    const homeEnergyEntity = homeEnergyMode === 'manual_power' ? (Array.isArray(homePowerHistoryOverride.ids) ? String(homePowerHistoryOverride.ids[0] || '') : '') : (Array.isArray(homeEnergyOverride.ids) ? String(homeEnergyOverride.ids[0] || '') : '');

    let body = '';
    if (this._page === 'home') {
      const cards = [
        ['dashboard','mdi:view-dashboard-outline','Dashboard & Home',`${String(r.experience_level || 'standard').toUpperCase()} · ${selectedFavorites.size} preferiti · benvenuto ${welcome.mode || 'compatto'}`],
        ['areas','mdi:floor-plan','Aree & organizzazione',`${areas.length} aree · ordine, visibilità, immagini e dispositivi`],
        ['weather','mdi:weather-partly-cloudy','Meteo',weather.mode === 'off' ? 'Disattivato' : weather.mode === 'manual' ? `Manuale · ${weather.entity || 'nessuna entità'}` : 'Automatico'],
        ['energy','mdi:flash','Energia',`Data Contract v${energyContract.contract_version || 2} · realtime ${energyContract.realtime_provider || 'none'} · ${Array.isArray(r.energy?.monitored_loads) ? r.energy.monitored_loads.length : 0} utenze monitorate`],
        ['security','mdi:shield-home-outline','Sicurezza',`${visibleSecurityCount}/${securityEntities.length} entità visibili · ${this._securityPinConfigured ? 'codice attivo' : 'codice da configurare'}`],
        ['cameras','mdi:cctv','Telecamere',`${visibleCameraCount}/${cameras.length} visibili`],
        ['plant','mdi:home-cog-outline','Impianto',`${support.site_name || 'Casa'}${support.customer ? ` · ${support.customer}` : ''}`],
        ['assistance','mdi:headset','Assistenza',support.whatsapp ? `WhatsApp configurato${support.phone ? ' · telefono configurato' : ''}` : 'Da configurare'],
      ];
      body = `<div class="top"><div><h2>Configurazione Installatore</h2><p class="muted" style="margin:5px 0 0">Scegli cosa configurare. Le liste tecniche compaiono solo quando servono.</p></div><button class="danger" id="lockInstaller">BLOCCA</button></div><div class="installerHome">${cards.map(([page,icon,title,summary]) => `<button type="button" class="navCard" data-open-page="${page}"><span class="navIcon"><ha-icon icon="${icon}"></ha-icon></span><span class="navCopy"><b>${esc(title)}</b><small>${esc(summary)}</small></span><ha-icon class="navArrow" icon="mdi:chevron-right"></ha-icon></button>`).join('')}</div>${this._saveBar()}`;
    } else if (this._page === 'dashboard') {
      const favoriteRows = favoriteEntities.map(state => { const id=state.entity_id; const area=areaNames.get(this._areaForEntity(id))||''; return `<label class="check" data-search-text="${esc(`${this._name(id)} ${id} ${area}`)}"><input type="checkbox" data-favorite-select value="${esc(id)}" ${selectedFavorites.has(id)?'checked':''}><span><b>${esc(this._name(id))}</b><small>${esc(id)}${area?` · ${esc(area)}`:''}</small></span></label>`; }).join('');
      const orderIds=(r.favorites||[]).filter(id=>selectedFavorites.has(id));
      body = `${this._pageHead('Dashboard & Home','Profilo, benvenuto e comandi rapidi della Home CL Control.')}
        <div class="section"><h3>Profilo dashboard</h3><div class="grid" style="margin-top:10px"><div class="field"><label>Livello esperienza</label><select id="experienceLevel"><option value="essential" ${r.experience_level==='essential'?'selected':''}>Essential</option><option value="standard" ${r.experience_level==='standard'?'selected':''}>Standard</option><option value="pro" ${r.experience_level==='pro'?'selected':''}>Pro</option></select></div></div></div>
        <div class="section"><div class="sectionTitle"><div><h3>Benvenuto</h3><p class="muted">Personalizza il saluto mostrato tra stato rapido e preferiti.</p></div></div><div class="grid" style="margin-top:10px"><div class="field"><label>Modalità</label><select id="welcomeMode"><option value="off" ${welcome.mode==='off'?'selected':''}>Disattivato</option><option value="compact" ${welcome.mode!=='off'&&welcome.mode!=='extended'?'selected':''}>Compatto</option><option value="extended" ${welcome.mode==='extended'?'selected':''}>Esteso</option></select></div><div class="field"><label>Testo secondario</label><select id="welcomeSecondaryMode"><option value="auto" ${welcome.secondary_mode!=='custom'&&welcome.secondary_mode!=='off'?'selected':''}>Automatico</option><option value="custom" ${welcome.secondary_mode==='custom'?'selected':''}>Personalizzato</option><option value="off" ${welcome.secondary_mode==='off'?'selected':''}>Nascosto</option></select></div><div class="field full"><label>Testo personalizzato</label><input id="welcomeSecondaryText" value="${esc(welcome.secondary_text||'')}" placeholder="Es. Tutto sotto controllo a Casa" ${welcome.secondary_mode==='custom'?'':'disabled'}></div></div></div>
        <div class="section"><div class="sectionTitle"><div><h3>Preferiti</h3><p class="muted">${selectedFavorites.size} selezionati. Apri il selettore solo quando devi modificarli.</p></div><button type="button" data-toggle-picker="favoritePicker">SELEZIONA</button></div><div class="field" style="margin-top:10px"><label>Titolo sezione</label><input id="favoritesLabel" value="${esc(r.favorites_label||'Preferiti')}"></div>${this._chips(r.favorites||[],'Nessun preferito configurato.')}<div class="picker" id="favoritePicker" hidden><div class="searchBox"><ha-icon icon="mdi:magnify"></ha-icon><input type="search" data-entity-search="favoriteEntityList" placeholder="Cerca nome o entity_id…"></div><div class="list" id="favoriteEntityList">${favoriteRows}<div class="searchEmpty" data-search-empty hidden>Nessuna entità corrispondente.</div></div><h4 style="margin:12px 0 7px">Ordine</h4><div class="orderList" id="favoriteOrderList" data-order-kind="favorites">${orderIds.length?orderIds.map(id=>this._orderRow(id,this._name(id),id)).join(''):'<div class="muted" style="padding:10px">Nessun preferito selezionato.</div>'}</div></div></div>${this._saveBar()}`;
    } else if (this._page === 'weather') {
      body = `${this._pageHead('Meteo','Scegli il provider meteo senza scorrere liste di entità.')}
        <div class="section"><div class="grid"><div class="field"><label>Modalità</label><select id="weatherMode"><option value="auto" ${weather.mode!=='manual'&&weather.mode!=='off'?'selected':''}>Automatico</option><option value="manual" ${weather.mode==='manual'?'selected':''}>Manuale</option><option value="off" ${weather.mode==='off'?'selected':''}>Disattivato</option></select></div><div class="field"><label>Entità meteo</label><input id="weatherEntity" list="weatherEntityOptions" value="${esc(weather.entity||'')}" placeholder="weather.…"><datalist id="weatherEntityOptions">${weatherEntities.map(state=>`<option value="${esc(state.entity_id)}" label="${esc(this._name(state.entity_id))}"></option>`).join('')}</datalist></div></div><p class="muted">In Automatico CL Control usa la prima entità compatibile. In Manuale puoi cercare o incollare direttamente l'entity_id.</p></div>${this._saveBar()}`;
    } else if (this._page === 'energy') {
      const homeSelected = monitoring.home?.entities || [];
      const energyLabels = {
        pv_power:'Realtime · FV', home_power:'Realtime · Casa', grid_power:'Realtime · Rete', grid_import_power:'Realtime · Prelievo rete', grid_export_power:'Realtime · Immissione rete',
        battery_power:'Realtime · Batteria', battery_charge_power:'Realtime · Carica batteria', battery_discharge_power:'Realtime · Scarica batteria', battery_soc:'Realtime · SOC batteria',
        energy_control_status:'Energy Control · stato', power_control_status:'Power Control · attivo', control_power:'Power Control · potenza di controllo', grid_limit:'Power Control · limite', warning_limit:'Power Control · soglia ritardata', restore_limit:'Power Control · soglia riattivazione',
        headroom:'Power Control · margine tecnico', grid_margin:'Energy Control · margine contatore', surplus_available:'Energy Control · surplus FV', flexible_available:'Energy Control · disponibile flessibili', dynamic_limit:'Power Control · limite dinamico',
        suspended_power:'Power Control · potenza sospesa', suspended_count:'Power Control · carichi sospesi', last_event:'Power Control · ultimo evento', intervention_history:'Power Control · storico interventi',
        pv_energy_total:'Statistiche · FV', home_energy_total:'Statistiche · Casa kWh', home_power_history:'Statistiche · Casa da potenza W', grid_import_energy_total:'Statistiche · Import rete', grid_export_energy_total:'Statistiche · Export rete',
        battery_charge_energy_total:'Statistiche · Carica batteria', battery_discharge_energy_total:'Statistiche · Scarica batteria'
      };
      const energyContractRows = Object.entries(energyLabels).map(([key,label]) => {
        const source = energySources[key] || {};
        const ids = Array.isArray(source.ids) ? source.ids : [];
        const ok = ids.length && !['not_configured','unsupported','disabled','unavailable'].includes(source.quality);
        const status = source.quality === 'unsupported' ? 'NON SUPPORTATO' : source.quality === 'disabled' ? 'DISATTIVATO' : ok ? 'RILEVATO' : 'DA CONFIGURARE';
        const provider = source.provider && source.provider !== 'none' ? source.provider : '—';
        return `<div class="energySource"><div class="energySourceTop"><b>${esc(label)}</b><span class="energyStatus ${ok?'ok':'missing'}">${esc(status)}</span></div><small>${esc(provider)}${ids.length ? ` · ${esc(ids.join(' + '))}` : ''}</small></div>`;
      }).join('');
      const homeRows = power.map(state=>{const id=state.entity_id; const area=areaNames.get(this._areaForEntity(id))||''; return `<label class="check" data-search-text="${esc(`${this._name(id)} ${id} ${area}`)}"><input type="checkbox" data-home-power value="${esc(id)}" ${homeSelected.includes(id)?'checked':''}><span><b>${esc(this._name(id))}</b><small>${esc(id)} · ${esc(state.attributes?.unit_of_measurement||'')}${area?` · ${esc(area)}`:''}</small></span></label>`;}).join('');
      const areaBlocks = areas.map(area=>{ const cfg=monitoring.areas?.[area.id]||{mode:'auto',entities:[]}; const local=power.filter(s=>this._areaForEntity(s.entity_id)===area.id); const selected=cfg.entities||[]; const listId=`areaPower-${String(area.id).replace(/[^a-zA-Z0-9_-]/g,'-')}`; const sorted=[...local,...power.filter(s=>this._areaForEntity(s.entity_id)!==area.id)]; return `<div class="areaConfig" data-area-box="${esc(area.id)}"><div class="areaHead"><div><b>${esc(area.name)}</b><div class="tiny">${local.length} sensori nell'area · ${selected.length} selezionati</div></div><select data-area-mode style="max-width:190px"><option value="auto" ${cfg.mode!=='manual'&&cfg.mode!=='off'?'selected':''}>Automatico</option><option value="manual" ${cfg.mode==='manual'?'selected':''}>Manuale</option><option value="off" ${cfg.mode==='off'?'selected':''}>Disattivato</option></select></div>${this._chips(selected,'Nessun sensore manuale selezionato.')}<div class="actions"><button type="button" data-toggle-picker="${esc(listId)}">MODIFICA SENSORI</button></div><div class="picker" id="${esc(listId)}" hidden><div class="searchBox"><ha-icon icon="mdi:magnify"></ha-icon><input type="search" data-entity-search="${esc(listId)}-list" placeholder="Cerca nome o entity_id…"></div><div class="list" id="${esc(listId)}-list">${sorted.map(state=>{const id=state.entity_id; const own=this._areaForEntity(id)===area.id; const src=areaNames.get(this._areaForEntity(id))||'Nessuna area'; return `<label class="check" data-search-text="${esc(`${this._name(id)} ${id} ${src}`)}"><input type="checkbox" data-area-power value="${esc(id)}" ${selected.includes(id)?'checked':''}><span><b>${esc(this._name(id))}</b><small>${own?'Nell’area':'Altra area'} · ${esc(src)} · ${esc(id)}</small></span></label>`;}).join('')}<div class="searchEmpty" data-search-empty hidden>Nessun sensore corrispondente.</div></div></div></div>`; }).join('');

      const configuredLoads = Array.isArray(r.energy?.monitored_loads) ? r.energy.monitored_loads : [];
      const builtLoads = new Map((energyContract.monitored_loads || []).map(item => [String(item.id || ''), item]));
      const areaOptions = [`<option value="">Nessuna area</option>`, ...areas.map(area => `<option value="${esc(area.id)}">${esc(area.name)}</option>`)].join('');
      const powerOptions = power.map(state => `<option value="${esc(state.entity_id)}" label="${esc(this._name(state.entity_id))}"></option>`).join('');
      const energyOptions = energySensors.map(state => `<option value="${esc(state.entity_id)}" label="${esc(this._name(state.entity_id))}"></option>`).join('');
      const commandOptions = energyCommands.map(state => `<option value="${esc(state.entity_id)}" label="${esc(this._name(state.entity_id))}"></option>`).join('');
      const monitoredRows = configuredLoads.map((load,index) => {
        const id = String(load.id || `monitored_${index+1}`);
        const built = builtLoads.get(id) || {};
        const statsOk = Boolean(built.energy_statistics_valid);
        const powerOk = Boolean(built.power_available);
        const status = load.energy_entity ? (statsOk ? 'STORICO OK' : 'STORICO DA VERIFICARE') : load.power_entity ? (powerOk ? 'REALTIME OK' : 'REALTIME DA VERIFICARE') : 'DA CONFIGURARE';
        const statusClass = statsOk || powerOk ? 'ok' : '';
        const selectedArea = String(load.area_id || '');
        return `<div class="monitoredLoad" data-monitored-load="${esc(id)}"><div class="monitoredLoadHead"><div><b>${esc(load.name || `Utenza ${index+1}`)}</b><div class="tiny">Monitorata solo da CL Control · non partecipa ai distacchi Power Control</div></div><div class="monitoredLoadActions"><span class="sourceBadge ${statusClass}">${esc(status)}</span><button type="button" class="danger" data-remove-monitored="${esc(id)}">RIMUOVI</button></div></div><div class="grid"><div class="field"><label>Nome utenza</label><input data-load-name value="${esc(load.name || '')}" placeholder="Es. Frigorifero"></div><div class="field"><label>Area</label><select data-load-area>${areaOptions.replace(`value="${esc(selectedArea)}"`, `value="${esc(selectedArea)}" selected`)}</select></div><div class="field"><label>Sensore potenza</label><input data-load-power list="monitoredPowerOptions" value="${esc(load.power_entity || '')}" placeholder="sensor.…_power"></div><div class="field"><label>Sensore energia opzionale</label><input data-load-energy list="monitoredEnergyOptions" value="${esc(load.energy_entity || '')}" placeholder="sensor.…_energy"></div><div class="field"><label>Entità comando opzionale</label><input data-load-command list="monitoredCommandOptions" value="${esc(load.command_entity || '')}" placeholder="switch.… / light.…"></div><div class="field"><label>Icona opzionale</label><input data-load-icon value="${esc(load.icon || '')}" placeholder="mdi:fridge-outline"></div></div><div class="toggleLine"><label><input type="checkbox" data-load-visible ${load.visible !== false ? 'checked' : ''}> Mostra in Energia</label><label><input type="checkbox" data-load-ranking ${load.ranking !== false ? 'checked' : ''}> Includi nella classifica</label></div></div>`;
      }).join('');
      const pcLoads = Array.isArray(energyContract.power_control?.loads) ? energyContract.power_control.loads : [];
      const pcRows = pcLoads.map(load => `<div class="pcLoadItem"><b>${esc(load.name || load.load_id || 'Carico')}</b><small>${load.power_entity_id ? `Potenza: ${esc(load.power_entity_id)}` : 'Sensore potenza non disponibile'} · gestione CL Power Control</small></div>`).join('');

      body = `${this._pageHead('Energia','Configura sorgenti, utenze monitorate e diagnostica. CL Power Control resta il motore; CL Control può monitorare utenze indipendenti.')}
        <div class="section"><div class="sectionTitle"><div><h3>Consumo casa storico</h3><p class="muted">Scegli la sorgente autorevole per “Consumo oggi”, giorno, mese e anno. Puoi usare un contatore energia kWh oppure, se hai solo la potenza istantanea, un sensore W/kW con statistiche Recorder.</p></div></div><div class="grid" style="margin-top:10px"><div class="field"><label>Modalità</label><select id="homeEnergyHistoryMode"><option value="auto" ${homeEnergyMode==='auto'?'selected':''}>Automatico / bilancio</option><option value="manual_energy" ${homeEnergyMode==='manual_energy'?'selected':''}>Sensore energia (kWh)</option><option value="manual_power" ${homeEnergyMode==='manual_power'?'selected':''}>Sensore potenza (W/kW)</option><option value="off" ${homeEnergyMode==='off'?'selected':''}>Disattivato</option></select></div><div class="field"><label>${homeEnergyMode==='manual_power'?'Sensore potenza casa':'Sensore energia casa'}</label><input id="homeEnergyHistoryEntity" list="${homeEnergyMode==='manual_power'?'homePowerHistoryOptions':'homeEnergyHistoryOptions'}" value="${esc(homeEnergyEntity)}" placeholder="${homeEnergyMode==='manual_power'?'sensor.…_power':'sensor.…_energy'}" ${homeEnergyMode==='manual_energy'||homeEnergyMode==='manual_power'?'':'disabled'}><datalist id="homeEnergyHistoryOptions">${energyOptions}</datalist><datalist id="homePowerHistoryOptions">${powerOptions}</datalist></div></div><div class="notice" style="margin-top:10px"><b>Come funziona:</b> con un sensore kWh CL Control usa direttamente le Long-Term Statistics. Con un sensore W/kW integra le medie registrate da Home Assistant nel periodo e mostra il risultato come <i>Calcolato da potenza</i>. In Automatico resta disponibile il bilancio FV + Import + Scarica − Export − Carica.</div></div>
        <div class="section"><div class="sectionTitle"><div><h3>Energy Data Contract v${esc(energyContract.contract_version || 2)}</h3><p class="muted">Riferimento realtime: CL Power Control ${esc(energyContract.reference?.cl_power_control || '0.4.0-beta.5')}. CL Control non ricrea distacchi, surplus, margini o logiche di controllo.</p></div><span class="badge">${energyContract.available ? 'DATI DISPONIBILI' : 'DA CONFIGURARE'}</span></div><div class="summaryLine"><b>Sorgente realtime</b><span>${esc(energyContract.realtime_provider || 'none')}</span></div><div class="summaryLine"><b>CL Power Control</b><span>${energyContract.power_control?.installed ? `Rilevato ${energyContract.power_control.version ? `v${esc(energyContract.power_control.version)}` : ''} · ${energyContract.power_control.loads?.length || 0} carichi · Energy Control ${energyContract.power_control.energy_control_detected ? 'rilevato' : 'non rilevato'}` : 'Non installato'}</span></div><div class="summaryLine"><b>Home Assistant Energy / Statistics</b><span>${energyContract.ha_energy?.configured ? `${energyContract.ha_energy.source_count || 0} sorgenti · ${energyContract.ha_energy.statistics_checked ? `${energyContract.ha_energy.statistics_valid || 0} statistiche valide${energyContract.ha_energy.statistics_missing ? ` · ${energyContract.ha_energy.statistics_missing} mancanti` : ''}` : 'statistiche da verificare'}` : 'Non configurato'}</span></div><div class="summaryLine"><b>Funzioni pronte</b><span>${Object.entries(energyCapabilities).filter(([,v])=>v).map(([k])=>k.replaceAll('_',' ')).join(' · ') || 'Nessuna'}</span></div><div class="notice" style="margin-top:10px"><b>Baseline beta.5:</b> il surplus è l’immissione istantanea normalizzata verso rete. Il limite dinamico equivalente e la potenza di controllo vengono letti direttamente da CL Power Control quando esposti.</div><div class="energyContractGrid">${energyContractRows}</div></div>
        <div class="section"><div class="sectionTitle"><div><h3>Utenze Energia</h3><p class="muted">I carichi Power Control sono rilevati automaticamente. Qui puoi aggiungere utenze solo monitorate da CL Control, senza inserirle nelle priorità o nei distacchi.</p></div><button type="button" class="primary" id="addMonitoredLoad">+ AGGIUNGI UTENZA</button></div>${pcRows ? `<h4 style="margin-top:12px">Gestite da CL Power Control</h4><div class="pcLoadList">${pcRows}</div>` : '<div class="muted" style="margin-top:10px">Nessun carico configurato in CL Power Control.</div>'}<h4 style="margin-top:14px">Monitorate da CL Control</h4><div class="monitoredList">${monitoredRows || '<div class="muted">Nessuna utenza monitorata configurata.</div>'}</div><datalist id="monitoredPowerOptions">${powerOptions}</datalist><datalist id="monitoredEnergyOptions">${energyOptions}</datalist><datalist id="monitoredCommandOptions">${commandOptions}</datalist><p class="muted" style="margin-top:10px">Il sensore potenza abilita il realtime. Il sensore energia, se compatibile con Long-Term Statistics, abilita kWh oggi/7g/30g. L’entità comando è solo manuale e non entra nel Power Control.</p></div>
        <div class="section"><div class="sectionTitle"><div><h3>Potenza totale casa</h3><p class="muted">${power.length} sensori power rilevati.</p></div><button type="button" data-toggle-picker="homePowerPicker">SELEZIONA SENSORI</button></div><div class="field" style="margin-top:10px"><label>Modalità</label><select id="homePowerMode"><option value="auto" ${(monitoring.home?.mode||'auto')==='auto'?'selected':''}>Automatico</option><option value="manual" ${monitoring.home?.mode==='manual'?'selected':''}>Manuale</option><option value="off" ${monitoring.home?.mode==='off'?'selected':''}>Disattivato</option></select></div>${this._chips(homeSelected,'Nessun sensore manuale selezionato.')}<div class="picker" id="homePowerPicker" hidden><div class="searchBox"><ha-icon icon="mdi:magnify"></ha-icon><input type="search" data-entity-search="homePowerList" placeholder="Cerca nome o entity_id…"></div><div class="list" id="homePowerList">${homeRows}<div class="searchEmpty" data-search-empty hidden>Nessun sensore corrispondente.</div></div></div></div>
        <div class="section"><h3>Potenza per area</h3><p class="muted">In Automatico vengono usati solo i sensori power assegnati all'area. Apri MODIFICA SENSORI soltanto per le aree in modalità Manuale.</p>${areaBlocks||'<div class="muted">Nessuna area disponibile.</div>'}</div>${this._saveBar()}`;
    } else if (this._page === 'security') {
      const tab = this._securityTab || 'partitions';
      const tabItems = securityEntities.filter(item => tab === 'zones' ? item.kind === 'Zona' : tab === 'partitions' ? item.kind === 'Partizione INIM' : item.kind !== 'Zona' && item.kind !== 'Partizione INIM');
      body = `${this._pageHead('Sicurezza','Gestisci impianti, partizioni e zone separatamente, organizzati per Piano e Area.')}
        <div class="section"><div class="sectionTitle"><div><h3>Codice Sicurezza</h3><p class="muted">${this._securityPinConfigured?'Codice attivo':'Da configurare'}</p></div><span class="badge">${this._securityPinConfigured?'ATTIVO':'DA CONFIGURARE'}</span></div><div class="grid" style="margin-top:10px"><div class="field"><label>Nuovo codice</label><input id="securityPin" type="password" inputmode="numeric" maxlength="12" placeholder="4–12 cifre"></div><div class="field"><label>Conferma</label><input id="securityPinConfirm" type="password" inputmode="numeric" maxlength="12" placeholder="Ripeti il codice"></div></div><div class="actions"><button id="saveSecurityPin">SALVA CODICE</button></div></div>
        <div class="section"><div class="sectionTitle"><div><h3>Entità visualizzate</h3><p class="muted">${visibleSecurityCount} di ${securityEntities.length} visibili.</p></div><div class="actions" style="margin-top:0"><button type="button" data-security-bulk="on">MOSTRA TUTTE</button><button type="button" data-security-bulk="off">NASCONDI TUTTE</button></div></div><div class="tabs"><button type="button" class="tab ${tab==='panels'?'active':''}" data-security-tab="panels">Impianti</button><button type="button" class="tab ${tab==='partitions'?'active':''}" data-security-tab="partitions">Partizioni</button><button type="button" class="tab ${tab==='zones'?'active':''}" data-security-tab="zones">Zone</button></div><div class="searchBox"><ha-icon icon="mdi:magnify"></ha-icon><input type="search" data-security-search placeholder="Cerca nome, area o entity_id…"></div><div id="securityEntityList">${this._securityGroupedRows(tabItems,visibility)}</div></div>${this._saveBar()}`;
    } else if (this._page === 'cameras') {
      const opts=areas.map(area=>`<option value="${esc(area.id)}">${esc(area.name)}</option>`).join('');
      const rows=cameras.map(state=>{const id=state.entity_id; const configured=cameraAreas[id]||''; const effective=configured||this._areaForEntity(id)||''; const area=areaNames.get(effective)||effective||'Nessuna area'; const available=!['unavailable','unknown',''].includes(String(state.state||'').toLowerCase()); return `<div class="cameraRow" data-camera-config="${esc(id)}" data-search-text="${esc(`${this._name(id)} ${id} ${area}`)}"><div class="cameraInfo"><b>${esc(this._name(id))}</b><small>${available?'Online':'Non disponibile'} · ${esc(area)} · ${esc(id)}</small></div><label class="cameraToggle"><input type="checkbox" data-camera-visible ${visibility[id]!==false?'checked':''}> Visibile</label><select data-camera-area><option value="">Area automatica</option>${areas.map(a=>`<option value="${esc(a.id)}" ${configured===a.id?'selected':''}>${esc(a.name)}</option>`).join('')}</select></div>`;}).join('');
      body = `${this._pageHead('Telecamere','Visibilità e associazione area in una schermata dedicata.')}
        <div class="section"><div class="searchBox"><ha-icon icon="mdi:magnify"></ha-icon><input type="search" data-entity-search="cameraList" placeholder="Cerca telecamera o entity_id…"></div><div class="list" id="cameraList">${rows||'<div class="muted" style="padding:10px">Nessuna telecamera rilevata.</div>'}<div class="searchEmpty" data-search-empty hidden>Nessuna telecamera corrispondente.</div></div></div>${this._saveBar()}`;
    } else if (this._page === 'plant') {
      body = `${this._pageHead("Impianto","Identità dell'impianto e titolo principale di Home Assistant.")}
        <div class="section"><h3>Identità</h3><div class="grid" style="margin-top:10px"><div class="field"><label>Nome impianto</label><input id="siteName" value="${esc(support.site_name||'Casa')}"></div><div class="field"><label>Cliente</label><input id="customerName" value="${esc(support.customer||'')}"></div></div></div>
        <div class="section"><h3>Titolo Home Assistant</h3><div class="grid" style="margin-top:10px"><div class="field"><label>Modalità</label><select id="shellTitleMode"><option value="cl_control" ${shellTitle.mode==='cl_control'||!shellTitle.mode?'selected':''}>CL Control</option><option value="site" ${shellTitle.mode==='site'?'selected':''}>Nome impianto</option><option value="custom" ${shellTitle.mode==='custom'?'selected':''}>Personalizzato</option><option value="original" ${shellTitle.mode==='original'?'selected':''}>Mantieni originale</option></select></div><div class="field"><label>Titolo personalizzato</label><input id="shellTitleCustom" value="${esc(shellTitle.custom||'')}" ${shellTitle.mode==='custom'?'':'disabled'}></div></div></div>${this._saveBar()}`;
    } else if (this._page === 'assistance') {
      body = `${this._pageHead('Assistenza','Configura i riferimenti mostrati nella card Assistenza CL.')}
        <div class="section"><div class="grid"><div class="field"><label>WhatsApp</label><input id="supportWhatsapp" value="${esc(support.whatsapp||'')}" placeholder="Es. 393... "></div><div class="field"><label>Telefono</label><input id="supportPhone" value="${esc(support.phone||'')}"></div></div><p class="muted">Il numero WhatsApp viene usato per il passaggio contestualizzato dalla dashboard CL Control.</p></div>${this._saveBar()}`;
    } else if (this._page === 'areas') {
      const dashboardAreas=Array.isArray(this._dashboardModel?.areas)?this._dashboardModel.areas:[];
      const ordered=this._sortBySaved(dashboardAreas.map(a=>({id:a.id,name:a.name||a.id,entities:a.entities||{}})),this._resetOrders.has('areas')?[]:(r.area_order||[]),a=>a.id,a=>a.name);
      const areaVisibility=r.area_visibility||{}; const areaPictures=r.area_picture_visibility||{};
      const areaRows=ordered.map(area=>this._areaOrderRow(area,areaVisibility[area.id]!==false,areaPictures[area.id]!==false)).join('');
      const moduleLabels={lights:'Luci',outlets:'Prese',switches:'Interruttori',covers:'Aperture',fans:'Ventilatori',locks:'Serrature',sirens:'Sirene',valves:'Valvole',climate:'Clima',cameras:'Telecamere'};
      const savedEntityOrder=this._resetOrders.has('entities')?[]:(r.entity_order||[]);
      const entityBlocks=ordered.map(area=>{const groups=Object.entries(moduleLabels).map(([m,label])=>{const items=Array.isArray(area.entities?.[m])?area.entities[m]:[]; if(!items.length)return''; const sorted=this._sortBySaved(items,savedEntityOrder,i=>i.entity_id,i=>i.name||i.entity_id); return `<div class="entityGroup"><h5>${esc(label)}</h5><div class="orderList" data-order-kind="entities" data-entity-order-list>${sorted.map(i=>this._orderRow(i.entity_id,i.name||this._name(i.entity_id),i.entity_id)).join('')}</div></div>`;}).join(''); return groups?`<details class="areaOrderDetails"><summary>${esc(area.name)}</summary>${groups}</details>`:'';}).join('');
      const coreSpecs=[['lights','Luci'],['covers','Aperture'],['climate','Clima'],['cameras','Telecamere'],['security','Sicurezza']];
      const savedHomeOrder=this._resetOrders.has('home')?[]:(r.home_order||[]);
      const coreSystems=this._sortBySaved(coreSpecs.filter(([id])=>Number(this._dashboardModel?.modules?.[id]?.count||0)>0),savedHomeOrder,item=>item[0],item=>item[1]);
      const clSystems=this._sortBySaved((this._dashboardModel?.cl_modules||[]).filter(item=>item?.customer_visible&&item?.route),savedHomeOrder,item=>`cl:${item.module_id||item.domain}`,item=>item.customer_label||item.display_name||item.module_id||item.domain);
      const systemRows=coreSystems.map(item=>this._orderRow(item[0],item[1],'Sistema CL Control')).join('');
      const clSystemRows=clSystems.map(item=>this._orderRow(`cl:${item.module_id||item.domain}`,item.customer_label||item.display_name||item.module_id||item.domain,item.display_name||item.domain||'')).join('');
      const homeSectionSpecs=[];
      if (dashboardAreas.some(a=>a?.home_visible!==false)) homeSectionSpecs.push(['areas','Aree','Stanze e piani']);
      if (coreSystems.length || this._dashboardModel?.energy?.available) homeSectionSpecs.push(['systems','Sistemi','Luci, clima, sicurezza, energia…']);
      if (clSystems.length) homeSectionSpecs.push(['cl_systems','Sistemi CL','Integrazioni CL Impianti']);
      const savedHomeSectionOrder=this._resetOrders.has('home-sections')?[]:(r.home_section_order||[]);
      const orderedHomeSections=this._sortBySaved(homeSectionSpecs,savedHomeSectionOrder,item=>item[0],item=>item[1]);
      const homeSectionRows=orderedHomeSections.map(item=>this._orderRow(item[0],item[1],item[2])).join('');
      body = `${this._pageHead('Aree & organizzazione','Ordina e personalizza le aree senza mescolare le altre configurazioni.')}
        <div class="section"><div class="sectionTitle"><div><h3>Ordine blocchi Home</h3><p class="muted">Scegli liberamente se mostrare prima Aree, Sistemi o Sistemi CL. Brand, stato rapido, benvenuto e preferiti restano in alto; Assistenza resta in fondo.</p></div><button type="button" data-reset-order="home-sections">ORDINE AUTOMATICO</button></div><div class="orderList" id="homeSectionOrderList" data-order-kind="home-sections" style="margin-top:10px">${homeSectionRows||'<div class="muted" style="padding:10px">Nessun blocco Home disponibile.</div>'}</div></div>
        <div class="section"><div class="sectionTitle"><div><h3>Aree</h3><p class="muted">Ordine, visibilità e immagine della Home.</p></div><button type="button" data-reset-order="areas">ORDINE AUTOMATICO</button></div><div class="orderList" id="areaOrderList" data-order-kind="areas" style="margin-top:10px">${areaRows||'<div class="muted" style="padding:10px">Nessuna area attiva.</div>'}</div></div>
        <div class="section"><div class="sectionTitle"><div><h3>Sistemi Home</h3><p class="muted">Ordina Sistemi e Sistemi CL senza modificare le entità.</p></div><button type="button" data-reset-order="home">ORDINE AUTOMATICO</button></div><div class="orderGrid" style="margin-top:10px"><div class="orderPanel"><h4 style="margin-bottom:8px">Sistemi</h4><div class="orderList" data-order-kind="home" data-home-order-list>${systemRows||'<div class="muted" style="padding:10px">Nessun sistema disponibile.</div>'}</div></div><div class="orderPanel"><h4 style="margin-bottom:8px">Sistemi CL</h4><div class="orderList" data-order-kind="home" data-home-order-list>${clSystemRows||'<div class="muted" style="padding:10px">Nessun Sistema CL disponibile.</div>'}</div></div></div></div>
        <div class="section"><div class="sectionTitle"><div><h3>Dispositivi nelle aree</h3><p class="muted">Apri soltanto la stanza che vuoi riordinare.</p></div><button type="button" data-reset-order="entities">ORDINE AUTOMATICO</button></div>${entityBlocks||'<div class="muted">Nessun dispositivo ordinabile.</div>'}</div>${this._saveBar()}`;
    }

    this.shadowRoot.innerHTML = `${this._styles()}<ha-card>${body}</ha-card>`;
    this.shadowRoot.querySelector('#lockInstaller')?.addEventListener('click', () => this._lock());
    this.shadowRoot.querySelectorAll('[data-open-page]').forEach(button => button.addEventListener('click', () => this._goPage(button.dataset.openPage)));
    this.shadowRoot.querySelectorAll('[data-back-home]').forEach(button => button.addEventListener('click', () => this._goPage('home')));
    this.shadowRoot.querySelectorAll('[data-toggle-picker]').forEach(button => button.addEventListener('click', () => { const picker=this.shadowRoot.getElementById(button.dataset.togglePicker); if(picker) picker.hidden=!picker.hidden; }));
    this.shadowRoot.querySelectorAll('[data-global-save]').forEach(button => button.addEventListener('click', () => this._saveGeneral({reload:true})));
    this.shadowRoot.querySelectorAll('[data-discard]').forEach(button => button.addEventListener('click', async () => { await this._loadData(); this._dirtyKeys.clear(); this._render(); }));
    this.shadowRoot.querySelector('#saveSecurityPin')?.addEventListener('click', () => this._saveSecurityPin());
    this.shadowRoot.querySelector('#shellTitleMode')?.addEventListener('change', event => { const input=this.shadowRoot.querySelector('#shellTitleCustom'); if(input) input.disabled=event.target.value!=='custom'; });
    this.shadowRoot.querySelector('#welcomeSecondaryMode')?.addEventListener('change', event => { const input=this.shadowRoot.querySelector('#welcomeSecondaryText'); if(input) input.disabled=event.target.value!=='custom'; });
    this.shadowRoot.querySelector('#homeEnergyHistoryMode')?.addEventListener('change', event => { const input=this.shadowRoot.querySelector('#homeEnergyHistoryEntity'); const mode=event.target.value; if(input){ input.disabled=!['manual_energy','manual_power'].includes(mode); input.setAttribute('list',mode==='manual_power'?'homePowerHistoryOptions':'homeEnergyHistoryOptions'); input.placeholder=mode==='manual_power'?'sensor.…_power':'sensor.…_energy'; } this._markDirty('energy-home-history'); });
    this.shadowRoot.querySelectorAll('[data-favorite-select]').forEach(input => input.addEventListener('change', () => this._syncFavoriteOrder()));
    this.shadowRoot.querySelectorAll('[data-security-tab]').forEach(button => button.addEventListener('click', () => { this._runtime=this._collectRuntime(); this._securityTab=button.dataset.securityTab; this._render(); }));
    this.shadowRoot.querySelectorAll('[data-security-bulk]').forEach(button => button.addEventListener('click', () => { const on=button.dataset.securityBulk==='on'; this.shadowRoot.querySelectorAll('[data-security-visible]').forEach(input=>{input.checked=on;}); this._markDirty(`security-${this._securityTab}`); }));
    this.shadowRoot.querySelector('#addMonitoredLoad')?.addEventListener('click', () => {
      this._runtime = this._collectRuntime();
      this._runtime.energy = { ...(this._runtime.energy || {}) };
      const loads = Array.isArray(this._runtime.energy.monitored_loads) ? [...this._runtime.energy.monitored_loads] : [];
      loads.push({id:`mon_${Date.now().toString(36)}`,name:'',area_id:'',power_entity:'',energy_entity:'',command_entity:'',icon:'',visible:true,ranking:true});
      this._runtime.energy.monitored_loads = loads;
      this._markDirty('energy-monitored-loads');
      this._render();
    });
    this.shadowRoot.querySelectorAll('[data-remove-monitored]').forEach(button => button.addEventListener('click', () => {
      this._runtime = this._collectRuntime();
      const id = String(button.dataset.removeMonitored || '');
      this._runtime.energy = { ...(this._runtime.energy || {}) };
      this._runtime.energy.monitored_loads = (this._runtime.energy.monitored_loads || []).filter(item => String(item.id || '') !== id);
      this._markDirty('energy-monitored-loads');
      this._render();
    }));
    const securitySearch=this.shadowRoot.querySelector('[data-security-search]');
    if(securitySearch) securitySearch.addEventListener('input',()=>{const q=securitySearch.value.trim().toLocaleLowerCase('it'); this.shadowRoot.querySelectorAll('#securityEntityList [data-search-text]').forEach(row=>{row.hidden=Boolean(q)&&!String(row.dataset.searchText||'').toLocaleLowerCase('it').includes(q);});});
    this.shadowRoot.querySelectorAll('input,select').forEach((node,index)=>{ if(node.id==='installerPin'||node.id==='securityPin'||node.id==='securityPinConfirm') return; const mark=()=>this._markDirty(node.id||node.dataset?.cameraConfig||node.name||`field-${index}`); node.addEventListener('change',mark); if(node.tagName==='INPUT'&&['text','search'].includes(node.type)) node.addEventListener('input',mark); });
    this._wireSearchInputs();
    this._wireOrderLists();
    this._updateSaveBar();
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

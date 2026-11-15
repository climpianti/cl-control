// Recorder failures and incomplete power totals; all inputs are simulated.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../custom_components/cl_control/frontend/cl-control-energy-card.mjs'), 'utf8');
const context = vm.createContext({HTMLElement: class {}, customElements: {get() {}, define() {}}, window: {}});
vm.runInContext(source.replace('export {CLEnergyCard};', '') + '\nthis.Card = CLEnergyCard;', context);
const t = Date.UTC(2026, 10, 12, 12);
const row = mean => [{start: t, mean}];
function card(sources) {
  const c = Object.create(context.Card.prototype);
  Object.assign(c, {_config: {energy: {sources}}, _range: '24h', _statsCache: new Map(),
    _statsLoading: new Set(), _rangeStats: null, _statsError: '', _render() {}});
  return c;
}

test('a partial aggregate is a gap, rather than a smaller total', () => {
  const c = card({pv_power: {ids: ['sensor.pv1', 'sensor.pv2']}});
  assert.equal(c._powerSeriesFromResult({'sensor.pv1': row(1000)}, {}).points[0].pv, null);
  assert.equal(c._powerSeriesFromResult({'sensor.pv1': row(1000), 'sensor.pv2': row(null)}, {}).points[0].pv, null);
  assert.equal(c._powerSeriesFromResult({'sensor.pv1': row(1000), 'sensor.pv2': row(0)}, {}).points[0].pv, 1);
  assert.equal(c._powerSeriesFromResult({'sensor.pv1': row(1000), 'sensor.pv2': row(500)}, {}).points[0].pv, 1.5);
});

test('incomplete power can use the complete energy fallback', () => {
  const c = card({pv_power: {ids: ['sensor.pv1', 'sensor.pv2']}, pv_energy_total: {ids: ['sensor.energy']}});
  const points = c._powerSeriesFromResult({'sensor.pv1': row(1000)}, {'sensor.energy': [{start: t, change: 0.2}]}).points;
  assert.ok(Math.abs(points[0].pv - 2.4) < 1e-10);
});

test('failed Recorder reads report an error and are not cached as empty success', async () => {
  for (const sources of [
    {home_power: {ids: ['sensor.home']}},
    {home_energy_total: {ids: ['sensor.energy']}},
    {home_power: {ids: ['sensor.home']}, home_energy_total: {ids: ['sensor.energy']}},
  ]) {
    const c = card(sources);
    c._hass = {callWS: async () => {throw new Error('Recorder unavailable');}};
    await c._ensureRange('24h');
    assert.match(c._statsError, /Impossibile leggere/);
    assert.equal(c._statsCache.size, 0);
    assert.equal(c._statsLoading.size, 0);
    c._hass = {callWS: async request => request.types.includes('mean') ? {'sensor.home': row(500)} : {}};
    await c._ensureRange('24h');
    assert.equal(c._statsError, '');
    assert.equal(c._statsCache.size, 1);
  }
});

test('energy fallback remains usable when the power request fails', async () => {
  const c = card({pv_power: {ids: ['sensor.pv']}, pv_energy_total: {ids: ['sensor.energy']}});
  c._hass = {callWS: async request => {
    if (request.types.includes('mean')) throw new Error('No power statistics');
    return {'sensor.energy': [{start: t, change: 0.1}]};
  }};
  await c._ensureRange('24h');
  assert.equal(c._statsError, '');
  assert.ok(Math.abs(c._rangeStats.points[0].pv - 1.2) < 1e-10);
});

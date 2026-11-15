const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../custom_components/cl_control/frontend/cl-control-energy-card.mjs'), 'utf8').replace('export {CLEnergyCard};', '');
const context = vm.createContext({HTMLElement: class {}, customElements: {get() {}, define() {}}, window: {}});
vm.runInContext(source + '\nthis.check = {number, formatPower, isEnergyStatusGood};', context);
const {number, formatPower, isEnergyStatusGood} = context.check;
for (const input of [null, undefined, '', '  ', false, true, 'unknown', 'unavailable', 'non disponibile']) {
  assert.equal(number(input), null, String(input));
  assert.equal(formatPower(input), '—', String(input));
}
assert.equal(formatPower(0), '0 W');
assert.equal(formatPower('0'), '0 W');
assert.equal(number('-125'), -125);
for (const state of ['Sensore non disponibile', 'Non configurato', 'connection_error', 'unknown', 'unavailable', 'off', 'Disattivo', '']) {
  assert.equal(isEnergyStatusGood(state), false, state);
}
for (const state of ['Attivo', 'Rilevato', 'on', 'online', 'OK', ' enabled ']) {
  assert.equal(isEnergyStatusGood(state), true, state);
}
console.log('Energy regression OK: missing data remain unavailable; real zero preserved; status uses complete known values.');

// Pure preview tests; no browser, Home Assistant or KNX connection.
import assert from 'node:assert/strict';
globalThis.HTMLElement = class {};
globalThis.customElements = {get: () => true};
const {buildKnxPreview} = await import('../custom_components/cl_control/frontend/cl-control-discovery-card.mjs');
const fixture = category => ({
  group_addresses: [{address:'0/0/1'},{address:'0/1/1'}],
  pairs: [{command:'0/0/1',state:'0/1/1',name:'Luce soggiorno',category}],
});
assert.deepEqual(buildKnxPreview(fixture('light_candidate')).counts, {light:1,switch:0});
for (const category of ['access_control_review','unassigned','hvac_load','unknown_review']) {
  assert.deepEqual(buildKnxPreview(fixture(category), {'0/0/1':{domain:'light'}}).counts, {light:0,switch:0});
}
assert.equal(buildKnxPreview(fixture('light_candidate'), {'0/0/1':{domain:'skip'}}).counts.light, 0);
assert.equal(buildKnxPreview(fixture('light_candidate'), {'0/0/1':{state:'31/7/255'}}).counts.light, 0);
const duplicate = fixture('light_candidate'); duplicate.pairs.push({...duplicate.pairs[0]});
assert.equal(buildKnxPreview(duplicate).counts.light, 1);
const title = 'Luce "test"\n  malicious: true';
assert.ok(buildKnxPreview(fixture('light_candidate'), {'0/0/1':{name:title}}).yaml.includes(JSON.stringify(title)));
assert.deepEqual(buildKnxPreview(null).counts, {light:0,switch:0});
console.log('10 anteprime Discovery: OK (categorie escluse, selezione, indirizzi, duplicati, escaping, dati vuoti)');

// CL Control beta.14: 12/24h must use mean power in kW; 7/30d use energy in kWh.
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../custom_components/cl_control/frontend/cl-control-energy-card.mjs'),'utf8');
const sandbox=vm.createContext({HTMLElement:class{},customElements:{get(){},define(){}},window:{}});
vm.runInContext(src.replace('export {CLEnergyCard};','')+'\nthis.exposed={CLEnergyCard,formatChartKw}',sandbox);
const {CLEnergyCard,formatChartKw}=sandbox.exposed;
assert.equal(formatChartKw(0.54),'0,54 kW');
assert.equal(formatChartKw(null),'—');
const card=Object.create(CLEnergyCard.prototype);
card._config={energy:{sources:{
  pv_power:{ids:['sensor.pv']},home_power:{ids:['sensor.home']},
  grid_power:{ids:['sensor.grid']},
  pv_energy_total:{ids:['sensor.pv_energy']},
  grid_import_energy_total:{ids:['sensor.import_energy']},
  grid_export_energy_total:{ids:['sensor.export_energy']},
}}};
const t=Date.UTC(2026,10,10,20);
const power={
 'sensor.pv':[{start:t,mean:0},{start:t+300000,mean:1200}],
 'sensor.home':[{start:t,mean:540},{start:t+300000,mean:650}],
 'sensor.grid':[{start:t,mean:540},{start:t+300000,mean:-550}],
};
const energy={
 'sensor.pv_energy':[{start:t,change:0},{start:t+300000,change:0.1}],
 'sensor.import_energy':[{start:t,change:.05},{start:t+300000,change:0}],
 'sensor.export_energy':[{start:t,change:0},{start:t+300000,change:.04}],
};
const points=card._powerSeriesFromResult(power,energy).points;
assert.equal(points.length,2);
assert.equal(points[0].pv,0);
assert.equal(points[0].home,.54);
assert.equal(points[0].import,.54);
assert.equal(points[0].export,0);
assert.equal(points[1].home,.65);
assert.equal(points[1].import,0);
assert.equal(points[1].export,.55);
assert.equal(points[1].pv,1.2);
// If no valid power statistics, fall back to kWh per 5-minute interval converted into kW.
const emptyPower=card._powerSeriesFromResult({},energy).points;
assert.ok(Math.abs(emptyPower[0].import-.6)<1e-10);
assert.ok(Math.abs(emptyPower[1].pv-1.2)<1e-10);
// A missing reading must never be turned into zero; absence of a whole series means null.
const missing=card._powerSeriesFromResult({'sensor.home':[{start:t,mean:540}]},{}).points;
assert.equal(missing[0].pv,null);
assert.equal(missing[0].home,.54);
assert.equal(missing[0].import,null);
assert.equal(missing[0].export,null);
assert.match(card._svgChart(points),/Grafico potenza media in kW/);
assert.match(card._svgChart(points),/>kW<\/text><\/svg>/);
card._rangeStats={points};card._range='24h';card._statsLoading=new Set();card._barMetric='home';
const powerMarkup=card._chartMarkup();
assert.ok(powerMarkup.includes('Andamento potenza'));
assert.ok(powerMarkup.includes('kW'));
assert.ok(!powerMarkup.includes('Dettaglio fino a 5 minuti nel periodo selezionato.'));
card._range='7d';card._rangeStats=card._seriesFromResult(energy);
const energyMarkup=card._chartMarkup();
assert.ok(energyMarkup.includes('Storico energia'));
assert.match(card._svgBarChart(card._rangeStats.points),/>kWh<\/text><\/svg>/);
card._render=()=>{};card._statsCache=new Map();card._statsLoading=new Set();card._statsError='';
card._rangeStats=null;
const calls=[];
card._hass={callWS:async req=>{
  calls.push(req);
  if(req.types.includes('mean'))return power;
  return energy;
}};
(async()=>{
  card._range='24h';
  await card._ensureRange('24h');
  assert.equal(card._rangeStats.mode,'power');
  assert.ok(calls.some(q=>q.period==='5minute' && q.types[0]==='mean' && q.units.power==='W'));
  assert.ok(calls.some(q=>q.period==='5minute' && q.types[0]==='change'));
  calls.length=0;
  card._range='7d';card._rangeStats=null;
  await card._ensureRange('7d');
  assert.ok(calls.length===1 && calls[0].period==='day' && calls[0].types[0]==='change');
  assert.ok(card._rangeStats.points.length>0);
  console.log('Power chart beta.14 OK: kW mean, signed grid, zero/missing, kWh fallback and daily kWh historical.');
})().catch(err=>{console.error(err);process.exit(1);});

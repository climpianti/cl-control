const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
(async()=>{
  const url=pathToFileURL(path.resolve(__dirname,'../custom_components/cl_control/frontend/cl-control-power-badge.mjs'));
  const {readInstantPower}=await import(url.href);
  const states={
    'sensor.w':{state:'86.4',attributes:{unit_of_measurement:'W'}},
    'sensor.kw':{state:'1.234',attributes:{unit_of_measurement:'kW'}},
    'sensor.zero':{state:'0',attributes:{unit_of_measurement:'W'}},
    'sensor.unavailable':{state:'unavailable',attributes:{unit_of_measurement:'W'}},
    'sensor.energy':{state:'12',attributes:{unit_of_measurement:'kWh'}}
  };
  const hass={states};
  assert.equal(readInstantPower(hass,'sensor.w'),'86,4 W');
  assert.equal(readInstantPower(hass,'sensor.kw'),'1,23 kW');
  assert.equal(readInstantPower(hass,'sensor.zero'),'0 W');
  assert.equal(readInstantPower(hass,'sensor.unavailable'),'');
  assert.equal(readInstantPower(hass,'sensor.energy'),'');
  assert.equal(readInstantPower(hass,'sensor.missing'),'');
  console.log('CL Control card power formatting OK');
})().catch(e=>{console.error(e);process.exitCode=1;});

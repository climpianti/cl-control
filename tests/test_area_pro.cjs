// Browser regression for beta.40 two-column photo-first Area Pro; simulated states only.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=path.resolve(process.env.CL_TEST_ARTIFACTS||'test-artifacts','area-pro-local');
fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true,channel:process.env.CL_TEST_BROWSER_CHANNEL||undefined});
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('http://cl.local/**',route=>route.fulfill({contentType:'text/html',body:'<html></html>'}));
 await page.goto('http://cl.local/cl-control/home');
 await page.setContent('<html lang="it"><style>body{margin:0;padding:8px;background:#f4f6f9;font:14px Arial}.container{max-width:700px;margin:auto;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}</style><main class="container"></main></html>');
 const js=fs.readFileSync('custom_components/cl_control/frontend/cl-control-area-pro-card.mjs','utf8').replace(/export /g,'');
 await page.evaluate(js);
 await page.evaluate(()=>{
  window.hass={states:{
   'sensor.temperature':{state:'19.3714027404785',attributes:{unit_of_measurement:'°C'}},
   'sensor.temperature_coarse':{state:'20',attributes:{unit_of_measurement:'°C'}},
   'sensor.humidity':{state:'54.9758911132812',attributes:{unit_of_measurement:'%'}},
   'sensor.co2':{state:'445.0',attributes:{unit_of_measurement:'ppm'}},
   'sensor.power':{state:'0',attributes:{unit_of_measurement:'W'}},
   'binary_sensor.motion':{state:'off',attributes:{}}
  }};
  window.card=document.createElement('cl-control-area-pro-card');
  card.setConfig({area:'camera_da_letto',name:'Camera da letto',icon:'mdi:bed',
   navigation_path:'area-camera-da-letto',picture:'data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%20160%2090%22%3E%3Crect%20width=%22160%22%20height=%2290%22%20fill=%22%23234567%22/%3E%3C/svg%3E',
   telemetry:{temperature:['sensor.temperature_coarse','sensor.temperature'],humidity:['sensor.humidity'],
    carbon_dioxide:['sensor.co2'],power:['sensor.power'],motion:['binary_sensor.motion']}});
  card.hass=hass;document.querySelector('main').append(card);
  window.empty=document.createElement('cl-control-area-pro-card');
  empty.setConfig({area:'empty',name:'Area senza misurazioni',icon:'mdi:home',navigation_path:'area-empty',telemetry:{}});
  empty.hass=hass;document.querySelector('main').append(empty);
 });
 const value=async(kind)=>page.evaluate(k=>document.querySelector('cl-control-area-pro-card').shadowRoot.querySelector('[data-kind="'+k+'"] .value')?.textContent,kind);
 assert.equal(await value('temperature'),'19,4 °C');
 assert.equal(await value('humidity'),'55 %');
 assert.equal(await value('carbon_dioxide'),'445 ppm');
 assert.equal(await value('power'),'0 W');
 assert.equal(await page.evaluate(()=>card.getGridOptions().columns),6);
 assert.equal(await page.evaluate(()=>empty.shadowRoot.querySelector('.card').classList.contains('has-metrics')),false);
 assert.equal(await page.evaluate(()=>empty.shadowRoot.querySelector('.metrics').hidden),true);
 assert.equal(await page.evaluate(()=>empty.shadowRoot.textContent.includes('Nessuna misura disponibile')),false);
 for(const width of [320,360,390,768,1024]){
  await page.setViewportSize({width,height:900});
  const dims=await page.evaluate(()=>{
   const root=document.querySelector('cl-control-area-pro-card').shadowRoot;
   const box=root.querySelector('.card').getBoundingClientRect();
   const other=empty.shadowRoot.querySelector('.card').getBoundingClientRect();
   const image=root.querySelector('.picture').getBoundingClientRect();
   const metric=[...root.querySelectorAll('.metric')].map(e=>e.getBoundingClientRect());
   return {scroll:document.documentElement.scrollWidth,viewport:innerWidth,
    cardWidth:box.width,columnsSideBySide:Math.abs(box.top-other.top)<1&&other.left>box.right,
    compact:other.height<box.height,photo:root.querySelector('.picture').hidden===false&&Math.abs(image.width/image.height-16/9)<.05,
    inside:metric.every(b=>b.left>=box.left&&b.right<=box.right+1),
    values:[...root.querySelectorAll('.value')].every(el=>{const a=el.getBoundingClientRect();return a.width>0 && a.right<=box.right+1;})};
  });
  assert.ok(dims.scroll<=dims.viewport,'horizontal overflow at '+width+JSON.stringify(dims));
  assert.ok(dims.inside&&dims.values,'clipped metric at '+width+JSON.stringify(dims));
  assert.ok(dims.columnsSideBySide&&dims.compact&&dims.photo,'photo/compact/two columns '+width+JSON.stringify(dims));
  await page.screenshot({path:path.join(out,'area-pro-'+width+'.png'),fullPage:true});
 }
 await page.evaluate(()=>{
  hass.states['sensor.power'].state='unavailable';
  hass.states['sensor.humidity'].state='unknown';
  hass.states['binary_sensor.motion'].state='on';
  card.hass={...hass};
 });
 assert.equal(await value('power'),undefined);
 assert.equal(await value('humidity'),undefined);
 assert.equal(await value('temperature'),'19,4 °C');
 assert.match(await page.evaluate(()=>card.shadowRoot.querySelector('.alerts').textContent),/Movimento rilevato/);
 await page.evaluate(()=>{hass.states['sensor.power']={state:'1.259',attributes:{unit_of_measurement:'kW'}};card.hass=hass});
 assert.equal(await value('power'),'1,26 kW');
 await page.evaluate(()=>{hass.states['sensor.power'].state='0';card.hass=hass});
 assert.equal(await value('power'),'0 W');
 await page.evaluate(()=>card.shadowRoot.querySelector('button').click());
 assert.equal(await page.evaluate(()=>location.pathname),'/cl-control/area-camera-da-letto');
 await page.evaluate(()=>{history.replaceState(null,'','/cl-control');card.shadowRoot.querySelector('button').click()});
 assert.equal(await page.evaluate(()=>location.pathname),'/cl-control/area-camera-da-letto');
 assert.deepEqual(errors,[]);await browser.close();
 console.log('Pro area UI OK: five widths, all metrics, missing states, zero W and navigation');
})().catch(e=>{console.error(e);process.exit(1)});

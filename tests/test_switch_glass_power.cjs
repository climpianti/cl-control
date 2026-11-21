const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const dir=path.resolve(__dirname,'../custom_components/cl_control/frontend');
const server=http.createServer((req,res)=>{
  if(req.url==='/cl-control-switch-glass-card.mjs'||req.url==='/cl-control-power-badge.mjs'){
    res.setHeader('content-type','text/javascript');res.end(fs.readFileSync(path.join(dir,req.url.slice(1))));return;
  }
  res.setHeader('content-type','text/html');res.end(`<!doctype html><html><meta name="viewport" content="width=device-width, initial-scale=1">
  <style>body{margin:8px;background:#e9eef4}main{max-width:440px;margin:auto}</style>
  <main></main><script type="module">
    customElements.define('ha-card',class extends HTMLElement{});
    customElements.define('ha-icon',class extends HTMLElement{});
    await import('/cl-control-switch-glass-card.mjs');
    window.calls=[];
    window.hass={states:{
      'switch.socket':{state:'on',attributes:{friendly_name:'Presa prova'}},
      'sensor.power':{state:'43.3',attributes:{device_class:'power',unit_of_measurement:'W'}}
    },callService:async(...args)=>calls.push(args)};
    window.card=document.createElement('cl-control-switch-glass-card');
    card.setConfig({entity:'switch.socket',name:'Presa prova',power_entity:'sensor.power'});
    card.hass=hass;document.querySelector('main').append(card);window.ready=true;
  </script></html>`);
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try{
  browser=await chromium.launch({headless:true,channel:process.env.CL_TEST_BROWSER_CHANNEL||undefined});
  const page=await browser.newPage({viewport:{width:390,height:800}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.waitForFunction(()=>window.ready);
  const card=page.locator('cl-control-switch-glass-card');
  assert.equal(await card.locator('.cl-power-value').textContent(),'43,3 W');
  assert.equal(await card.locator('.cl-power-meter').getAttribute('aria-label'),'Potenza istantanea 43,3 W');
  await page.evaluate(()=>{hass.states['sensor.power'].state='0';card.hass={...hass};});
  assert.equal(await card.locator('.cl-power-value').textContent(),'0 W');
  await page.evaluate(()=>{hass.states['sensor.power'].state='unavailable';card.hass={...hass};});
  assert.equal(await card.locator('.cl-power-meter').count(),0);
  await page.evaluate(()=>{hass.states['sensor.power']={state:'1.234',attributes:{device_class:'power',unit_of_measurement:'kW'}};card.hass={...hass};});
  assert.equal(await card.locator('.cl-power-value').textContent(),'1,23 kW');
  for(const width of [320,390,768,1024]){
    await page.setViewportSize({width,height:800});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Overflow '+width);
  }
  assert.equal(await page.evaluate(()=>calls.length),0);
  assert.deepEqual(errors,[]);
  console.log('Switch/outlet Blue Tech power badges OK: live W/kW, zero, invalid and 4 widths; no device commands');
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});

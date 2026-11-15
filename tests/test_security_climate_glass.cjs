// Local render only. No device connection, no real PIN, no native thermostat commands.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=path.resolve(process.env.CL_TEST_ARTIFACTS||'test-artifacts', 'security-climate-glass-local');fs.mkdirSync(out,{recursive:true});
const security='custom_components/cl_control/frontend/cl-control-security-card.mjs';
async function setup(page,source){
 await page.setContent('<html lang="it"><style>body{background:#f4f6f8;margin:16px;font:14px Arial}main{max-width:850px;margin:auto;display:grid;gap:20px}h1{font-size:20px}</style><main><h1>Anteprima locale · dati simulati</h1><p>Icone e controlli nativi sostituiti · nessun dispositivo connesso</p></main></html>');
 await page.evaluate(source.replace(/export \{[^}]+\};?/g,''));
 await page.evaluate(()=>{
  customElements.define('ha-card',class extends HTMLElement{connectedCallback(){this.style.display='block'}});
  window.calls=[];window.nativeConfigs=[];window.hass={states:{'alarm_control_panel.fixture':{state:'armed_home',attributes:{supported_features:7}},'binary_sensor.door':{state:'on',attributes:{}},'select.partition':{state:'DISARMED',attributes:{options:['TOTAL','PARTIAL','DISARMED']}},'climate.fixture':{state:'heat',attributes:{current_temperature:20.3,temperature:21.5,hvac_action:'heating'}}},config:{unit_system:{temperature:'°C'}},callService:async(...args)=>calls.push(args),callWS:async(...args)=>calls.push(args)};
  window.loadCardHelpers=async()=>({createCardElement:config=>{nativeConfigs.push(config);const element=document.createElement('div');element.setConfig=next=>nativeConfigs.push(next);element.textContent='Controlli nativi HA · segnaposto locale';element.style.padding='20px';return element;}});
  window.security=document.createElement('cl-security-card');security.setConfig({title:'Sicurezza',pin_configured:true,panels:[{entity_id:'alarm_control_panel.fixture',name:'Allarme Casa',area_name:'Ingresso',area_id:'hall'}],partitions:[{entity_id:'select.partition',name:'Partizione piano terra',area_name:'Ingresso',area_id:'hall'}],zones:[{entity_id:'binary_sensor.door',name:'Porta ingresso',area_name:'Ingresso',area_id:'hall',device_class:'door'}]});security.hass=hass;document.querySelector('main').append(security);
 });
}
(async()=>{
 const browser=await chromium.launch({headless:true,channel:process.env.CL_TEST_BROWSER_CHANNEL||undefined});
 if(process.env.CL_BASELINE_REF){const before=await browser.newPage({viewport:{width:390,height:900}});await setup(before,cp.execFileSync('git',['show',process.env.CL_BASELINE_REF+':'+security],{encoding:'utf8'}));await before.screenshot({path:path.join(out,'security-before-390.png'),fullPage:true});await before.close();}
 const page=await browser.newPage({viewport:{width:390,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));await setup(page,fs.readFileSync(security,'utf8'));
 const sec=page.locator('cl-security-card');assert.equal(await sec.locator('[data-panel-command]').first().isVisible(),false);
 await sec.locator('summary').first().click();await page.evaluate(()=>new Promise(r=>setTimeout(r,0)));assert.equal(await page.evaluate(()=>calls.length),0);
 await page.evaluate(()=>{security.hass={...hass};});assert.equal(await sec.locator('details').first().getAttribute('open'),'');
 await sec.locator('[data-panel-command="arm_away"]').click();assert.equal(await sec.locator('#pinInput').isVisible(),true);assert.equal(await page.evaluate(()=>calls.length),0);await sec.locator('#dialogCancel').click();
 await sec.locator('summary').first().click();await page.evaluate(()=>new Promise(r=>setTimeout(r,0)));
 assert.equal(await sec.locator('[data-panel-command="arm_vacation"]').count(),0);
 await page.evaluate(()=>{hass.states['alarm_control_panel.fixture'].state='unavailable';security.hass={...hass};});assert.equal(await sec.locator('[data-panel-command]:not([disabled])').count(),0);
 await page.evaluate(()=>{hass.states['alarm_control_panel.fixture'].state='disarmed';hass.states['alarm_control_panel.fixture'].attributes.supported_features=0;security.hass={...hass};});assert.equal(await sec.locator('[data-panel-command]').count(),1);assert.equal(await sec.locator('[data-panel-command="disarm"]').count(),1);
 await page.evaluate(()=>{hass.states['alarm_control_panel.fixture'].state='armed_home';hass.states['alarm_control_panel.fixture'].attributes.supported_features=7;security.hass={...hass};});
 for(const width of [320,390,768,1024,1440,1920]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(out,`security-after-${width}.png`),fullPage:true});}
 // Existing beta.6 preview registers the old tag first. Glass must coexist.
 await page.evaluate(()=>customElements.define('cl-control-climate-card',class extends HTMLElement{}));
 await page.evaluate(fs.readFileSync('custom_components/cl_control/frontend/cl-control-climate-glass-card.mjs','utf8').replace('export class ','class '));
 await page.evaluate(()=>{security.remove();window.climate=document.createElement('cl-control-climate-glass-card');climate.setConfig({entity:'climate.fixture',name:'Clima soggiorno'});climate.hass=hass;document.querySelector('main').append(climate);});
 const cl=page.locator('cl-control-climate-glass-card');assert.match(await cl.locator('.temperature').innerText(),/20,3 °C/);assert.match(await cl.locator('.target').innerText(),/21,5 °C/);
 for(const width of [320,390,768,1024,1440,1920]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(out,`climate-after-${width}.png`),fullPage:true});}
 await cl.locator('#expand').click();assert.deepEqual(await page.evaluate(()=>nativeConfigs),[{type:'thermostat',entity:'climate.fixture',name:'Clima soggiorno',features:[]}]);assert.equal(await page.evaluate(()=>calls.length),0);
 await page.evaluate(()=>{window.native=climate.shadowRoot.querySelector('#native').firstElementChild;hass.states['climate.fixture'].attributes.current_temperature=20.6;climate.hass={...hass};});assert.equal(await page.evaluate(()=>native===climate.shadowRoot.querySelector('#native').firstElementChild),true);
 assert.equal(await page.evaluate(()=>nativeConfigs.length),1);
 // A full climate with temperature range, fan, presets, both swing axes and humidity.
 await page.evaluate(()=>{hass.states['climate.fixture']={state:'heat_cool',attributes:{supported_features:2|4|8|16|32|512,hvac_modes:['off','heat','cool','heat_cool','dry','fan_only'],fan_modes:['auto','low','high'],preset_modes:['eco','comfort'],swing_modes:['off','vertical'],swing_horizontal_modes:['off','horizontal'],current_temperature:21,target_temp_low:19,target_temp_high:24,current_humidity:47,humidity:50}};climate.hass={...hass};});
 assert.deepEqual(await page.evaluate(()=>nativeConfigs.at(-1).features),[{type:'climate-hvac-modes',style:'dropdown'},{type:'climate-fan-modes',style:'dropdown'},{type:'climate-preset-modes',style:'dropdown'},{type:'climate-swing-modes',style:'dropdown'},{type:'climate-swing-horizontal-modes',style:'dropdown'},{type:'target-humidity'}]);
 assert.match(await cl.locator('.target').innerText(),/19 °C – 24 °C/);assert.equal(await cl.locator('.humidity').innerText(),'Umidità: 47% · Obiettivo: 50%');
 await page.evaluate(()=>{hass.states['climate.fixture'].attributes.current_humidity=48;climate.hass={...hass};});assert.equal(await page.evaluate(()=>nativeConfigs.length),2);assert.equal(await page.evaluate(()=>native===climate.shadowRoot.querySelector('#native').firstElementChild),true);
 await page.setViewportSize({width:320,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(out,'climate-capabilities-placeholder-320.png'),fullPage:true});
 // Options without the corresponding supported-feature flag must not create controls.
 await page.evaluate(()=>{hass.states['climate.fixture'].attributes.supported_features=1;climate.hass={...hass};});assert.deepEqual(await page.evaluate(()=>nativeConfigs.at(-1).features),[{type:'climate-hvac-modes',style:'dropdown'}]);
 const info=await page.evaluate(()=>{let detail;climate.addEventListener('hass-more-info',e=>detail=e.detail,{once:true});climate.shadowRoot.querySelector('.more').click();return detail;});assert.deepEqual(info,{entityId:'climate.fixture'});
 await page.evaluate(()=>{hass.states['climate.fixture'].state='unavailable';climate.hass=hass;});assert.equal(await cl.locator('.temperature').innerText(),'—');assert.match(await cl.locator('.state').innerText(),/Non disponibile/);
 await page.evaluate(()=>{hass.states['climate.fixture']={state:'cool',attributes:{current_temperature:75,temperature:72,hvac_action:'cooling'}};hass.config.unit_system.temperature='°F';climate.hass=hass;});assert.equal(await cl.locator('.temperature').innerText(),'75 °F');
 await page.evaluate(()=>{hass.states['climate.fixture'].state='off';hass.states['climate.fixture'].attributes.hvac_action='heating';climate.hass=hass;});assert.equal(await cl.locator('.state').innerText(),'Spento');
 await cl.locator('#expand').click();await page.setViewportSize({width:390,height:900});
 for(const [mode,action,activity] of [['heat','heating','heating'],['cool','cooling','cooling'],['off','heating','off'],['heat','idle','idle'],['unavailable','heating','unavailable']]){
   await page.evaluate(({mode,action})=>{hass.config.unit_system.temperature='°C';hass.states['climate.fixture']={state:mode,attributes:{current_temperature:20.3,temperature:21.5,hvac_action:action}};climate.hass=hass;},{mode,action});
   assert.equal(await cl.locator('ha-card').getAttribute('data-activity'),activity);
   if(['off','idle','unavailable'].includes(activity))assert.equal(await cl.locator('ha-card').evaluate(e=>e.style.getPropertyValue('--climate-accent')),'#b8c1ce');
   await page.screenshot({path:path.join(out,`climate-tone-${activity}-390.png`),fullPage:true});
 }
 assert.equal(await page.evaluate(()=>calls.length),0);
 assert.deepEqual(errors,[]);await browser.close();console.log('Security/Climate Glass OK: six widths, PIN dialog preserved, no calls on expansion, native climate mounted once, realtime identity, units and unavailable.');
})().catch(e=>{console.error(e);process.exit(1)});

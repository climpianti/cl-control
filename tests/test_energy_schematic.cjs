// Isolated browser rendering. All values simulated; commands intercepted.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const file='custom_components/cl_control/frontend/cl-control-energy-card.mjs';
const out=path.resolve(process.env.CL_TEST_ARTIFACTS||'test-artifacts', 'energy-schematic-local');fs.mkdirSync(out,{recursive:true});
async function setup(page,source){
 await page.setContent('<html lang="it"><style>body{margin:16px;background:#f4f6f9;font:14px Arial;color:#17324f;--primary-text-color:#17324f;--secondary-text-color:#52677e}main{max-width:1100px;margin:auto}h1{font-size:20px}</style><main><h1>Energia · anteprima locale</h1><p>Dati simulati · nessun dispositivo connesso</p></main></html>');
 await page.evaluate(source.replace('export {CLEnergyCard};',''));
 await page.evaluate(()=>{
  window.commands=[];window.reads=[];window.config={type:'custom:cl-control-energy-card',energy:{available:true,realtime_provider:'home_assistant_energy',capabilities:{power_control:false},sources:{pv_power:{ids:['sensor.pv']},home_power:{ids:['sensor.home']},grid_power:{ids:['sensor.grid']},battery_power:{ids:['sensor.battery']},battery_soc:{ids:['sensor.soc']},surplus_available:{ids:['sensor.surplus']}},monitored_loads:[{id:'oven',name:'Forno e cucina · nome molto lungo per verifica leggibilità',power_entity_id:'sensor.oven',energy_statistics_valid_ids:[],command_entity_id:'switch.fixture'}]}};
  window.hass={states:Object.fromEntries(Object.entries({'sensor.pv':3600,'sensor.home':1800,'sensor.grid':-1000,'sensor.battery':-800,'sensor.soc':64,'sensor.surplus':1000,'sensor.oven':450,'switch.fixture':'off'}).map(([id,value])=>[id,{entity_id:id,state:String(value),attributes:{}}])),callService:async(...args)=>commands.push(args),callWS:async request=>{reads.push(request);return {};}};
  window.card=document.createElement('cl-control-energy-card');card.setConfig(config);card.hass=hass;
  card._todayStats={pv:12.3,home:8.1,import:1.2,export:5.4};
  card._rangeStats={points:Array.from({length:12},(_,i)=>({t:Date.now()-(12-i)*3600000,pv:i/10,home:.2+i/20,import:.1,export:i/30}))};
  card._render();document.querySelector('main').append(card);
 });
}
(async()=>{
 const browser=await chromium.launch({headless:true,channel:process.env.CL_TEST_BROWSER_CHANNEL||undefined});
 if(process.env.CL_BASELINE_REF){const before=await browser.newPage({viewport:{width:390,height:900}});await setup(before,cp.execFileSync('git',['show',process.env.CL_BASELINE_REF+':'+file],{encoding:'utf8'}));await before.screenshot({path:path.join(out,'before-390.png'),fullPage:true});await before.close();}
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await setup(page,fs.readFileSync(file,'utf8'));const card=page.locator('cl-control-energy-card');
 for(const width of [320,390,768,1024,1440,1920]){
  await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`overflow ${width}`);
  const overlap=await card.locator('.energyNode').evaluateAll(nodes=>nodes.some((node,i)=>nodes.slice(i+1).some(other=>{const a=node.getBoundingClientRect(),b=other.getBoundingClientRect();return Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;})));
  assert.equal(overlap,false,`node overlap ${width}`);await page.screenshot({path:path.join(out,`after-${width}.png`),fullPage:true});
  if([390,1440].includes(width))await card.locator('.flowCard').screenshot({path:path.join(out,`schema-${width}.png`)});
 }
 assert.equal(await card.locator('.flowPath.grid.forward').count(),1);assert.equal(await card.locator('.flowPath.battery.forward').count(),1);
 await page.evaluate(()=>{hass.states['sensor.grid'].state='1200';hass.states['sensor.battery'].state='400';card.hass={...hass};});assert.equal(await card.locator('.flowPath.grid.reverse').count(),1);assert.equal(await card.locator('.flowPath.battery.reverse').count(),1);
 await page.evaluate(()=>{hass.states['sensor.home'].state='unavailable';card.hass={...hass};});assert.equal(await card.locator('.flowPath.active').count(),0);assert.equal(await card.locator('.flowPath.missing').count(),3);assert.equal(await card.locator('.home .nodeValue').innerText(),'—');assert.equal(await card.locator('.flowAvailability.complete').count(),0);
 await page.setViewportSize({width:390,height:900});await page.screenshot({path:path.join(out,'missing-390.png'),fullPage:true});
 await page.evaluate(()=>{for(const id of ['sensor.pv','sensor.home','sensor.grid','sensor.battery'])hass.states[id].state='0';card.hass={...hass};});assert.equal(await card.locator('.flowPath.active').count(),0);assert.equal(await card.locator('.home .nodeValue').innerText(),'0 W');assert.equal(await card.locator('.flowAvailability.complete').count(),1);
 await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>{hass.states['sensor.pv'].state='2000';hass.states['sensor.home'].state='2000';card.hass={...hass};});assert.equal(await card.locator('.flowPath.active').evaluate(e=>getComputedStyle(e).animationName),'none');
 await page.evaluate(()=>{delete config.energy.sources.battery_power;delete config.energy.sources.battery_soc;card.setConfig(config);card.hass=hass;});assert.equal(await card.locator('.energyNode.battery,.flowPath.battery').count(),0);
 await card.locator('[data-view="history"]').click();assert.equal(await card.locator('.flowScene').count(),0);
 for(const width of [320,390,768,1024,1440,1920]){
  await page.setViewportSize({width,height:900});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  await page.evaluate(()=>{card._historyStats={pv:12.3,home:8.1,import:1.2,export:5.4,selfConsumption:55,selfSufficiency:72};card._range='7d';card._rangeStats={points:Array.from({length:7},(_,i)=>({t:Date.now()-(7-i)*86400000,pv:10+i,home:8+i,import:1,export:3}))};card._render();});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`history overflow ${width}`);
  await page.screenshot({path:path.join(out,`history-${width}.png`),fullPage:true});
  if(width===390)await card.locator('.historyOnly > .card').nth(1).screenshot({path:path.join(out,'chart-history-390.png')});
 }
 await page.setViewportSize({width:390,height:900});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 await card.locator('[data-energy-chart]').click({position:{x:120,y:100}});assert.equal(await card.locator('[data-chart-tooltip]').isVisible(),true);assert.equal(await page.evaluate(()=>card._chartSelection!==null),true);
 await page.evaluate(()=>card._render());await page.evaluate(()=>new Promise(r=>requestAnimationFrame(r)));assert.equal(await card.locator('[data-chart-tooltip]').isVisible(),true);
 await card.locator('[data-history-period="month"]').click();assert.equal(await card.locator('[data-history-period="month"]').getAttribute('class'),'historyPeriod active');await card.locator('[data-history-shift="-1"]').click();await card.locator('[data-history-now]').click();
 await card.locator('[data-view="realtime"]').click();
 await card.locator('[data-load-detail]').first().click();assert.equal(await card.locator('[role="dialog"]').count(),1);
 await page.evaluate(()=>new Promise(r=>setTimeout(r,0)));
 await page.evaluate(()=>{card._ensureLoadDetail=async()=>{};card._loadDetailError='';card._loadDetailStats={averageW:400,maxW:1200,energyKwh:2.3,points:Array.from({length:12},(_,i)=>({t:Date.now()-(12-i)*3600000,value:300+i*50,max:1200}))};card._render();});
 for(const width of [320,390,768,1024,1440,1920]){await page.setViewportSize({width,height:900});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));assert.equal(await card.locator('.loadModal').evaluate(e=>e.scrollWidth>e.clientWidth),false,`modal overflow ${width}`);await page.screenshot({path:path.join(out,`detail-${width}.png`)});}
 await card.locator('[data-load-detail-close]').click();
 await page.evaluate(()=>{config.energy.capabilities.power_control=true;card.setConfig(config);card.hass=hass;});assert.equal(await card.locator('.statePill').innerText(),'Non disponibile');assert.equal(await card.locator('.statusTile').last().locator('.statusValue').innerText(),'—');assert.equal(await card.locator('.statePill ha-icon').getAttribute('icon'),'mdi:information-outline');
 assert.equal(await page.evaluate(()=>commands.length),0);assert.deepEqual(errors,[]);await browser.close();console.log('Energy schematic OK: six widths, no overlap/overflow, directions, zero/missing, absent battery, reduced motion, history/details and no device commands.');
})().catch(e=>{console.error(e);process.exit(1)});

// Isolated browser: all device services are mocked.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const out=path.resolve(process.env.CL_TEST_ARTIFACTS||'test-artifacts', 'covers-glass-local');fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({headless:true,channel:process.env.CL_TEST_BROWSER_CHANNEL||undefined}),page=await browser.newPage({viewport:{width:390,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setContent('<html lang="it"><style>body{margin:16px;background:#f4f6f8;font-family:Arial}main{display:grid;gap:16px;max-width:820px;margin:auto}h1{font-size:20px}p{font-size:13px}</style><main><h1>Aperture · anteprima locale</h1><p>Dati simulati · nessun dispositivo connesso</p></main></html>');
 await page.evaluate(fs.readFileSync('custom_components/cl_control/frontend/cl-control-cover-card.mjs','utf8').replace('export class ','class '));
 await page.evaluate(()=>{
  window.calls=[];window.hass={states:{'cover.fixture':{state:'open',attributes:{current_position:35,supported_features:255}}},callService:async(...args)=>calls.push(args)};
  window.card=document.createElement('cl-control-cover-card');card.setConfig({entity:'cover.fixture',name:'Tapparella soggiorno'});card.hass=hass;document.querySelector('main').append(card);
 });
 const card=page.locator('cl-control-cover-card');
 await page.emulateMedia({reducedMotion:'reduce'});
 for(const [state,pos,height] of [['closed',0,'32'],['open',50,'16'],['open',100,'0'],['opening',40,'19.2'],['closing',60,'12.8'],['unavailable',null,'32']]){
   await page.evaluate(({state,pos})=>{hass.states['cover.fixture']={state,attributes:{current_position:pos,supported_features:255}};card.hass={...hass};},{state,pos});
   const icon=page.locator('cl-control-cover-card').locator('.aperture-icon');
   assert.equal(await icon.getAttribute('data-state'),state);
   assert.ok(Math.abs(Number(await icon.locator('#slatsClip').getAttribute('height'))-Number(height))<.001);
   assert.equal(await icon.getAttribute('data-position-known'),String(pos!==null));
   assert.equal(await icon.locator('.motion').isVisible(),['opening','closing'].includes(state));
   await page.screenshot({path:path.join(out,`icon-${state}-${pos===null?'unknown':pos}.png`)});
 }
 assert.equal(await page.evaluate(()=>calls.length),0);
 await page.evaluate(()=>{hass.states['cover.fixture']={state:'open',attributes:{current_position:35,supported_features:255}};card.hass={...hass};});

 assert.equal(await card.locator('#details').isVisible(),false);
 for(const action of ['open_cover','stop_cover','close_cover'])assert.equal(await card.locator(`[data-action="${action}"]`).isVisible(),true);
 for(const width of [320,390,768,1024,1440,1920]){
  await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:path.join(out,`compact-${width}.png`)});
 }
 await card.locator('#adjust').click();assert.equal(await page.evaluate(()=>calls.length),0);
 assert.equal(await card.locator('#details').isVisible(),true);
 await card.locator('[data-step="position"][data-delta="5"]').click();
 assert.equal(await card.locator('#position').inputValue(),'40');assert.equal(await page.evaluate(()=>calls.length),0);
 await card.locator('#cancelPosition').click();assert.equal(await card.locator('#position').inputValue(),'35');assert.equal(await card.locator('#draftActions').isVisible(),false);
 await card.locator('#position').fill('100');await card.locator('[data-step="position"][data-delta="5"]').click();assert.equal(await card.locator('#position').inputValue(),'100');
 await card.locator('#cancelPosition').click();
 await card.locator('#position').fill('65');
 await page.evaluate(()=>{hass.states['cover.fixture'].attributes.current_position=40;card.hass={...hass};});
 assert.equal(await card.locator('#position').inputValue(),'65');assert.equal(await page.evaluate(()=>calls.length),0);
 await card.locator('[data-apply="position"]').click();
 assert.deepEqual(await page.evaluate(()=>calls.at(-1)),['cover','set_cover_position',{position:65},{entity_id:'cover.fixture'}]);
 await page.setViewportSize({width:390,height:900});await page.screenshot({path:path.join(out,'details-390.png'),fullPage:true});
 await page.evaluate(()=>{hass.states['cover.fixture'].attributes.current_position=null;card.hass={...hass};});
 assert.equal(await card.locator('[data-apply="position"]').isDisabled(),true);
 assert.match(await card.locator('#state').innerText(),/Posizione non disponibile/);
 await card.locator('[data-step="position"][data-delta="5"]').click();assert.equal(await card.locator('[data-apply="position"]').isDisabled(),false);
 await page.evaluate(()=>{hass.states['cover.fixture'].state='unavailable';card.hass={...hass};});
 assert.equal(await card.locator('[data-apply="position"]').isDisabled(),true);
 assert.equal(await card.locator('[data-action="stop_cover"]').isDisabled(),true);
 // Even while a move request is pending, Stop is usable. No real command is sent.
 await page.evaluate(()=>{hass.states['cover.fixture'].state='opening';hass.callService=(...args)=>{calls.push(args);return new Promise(resolve=>window.resolveMove=resolve);};card.hass=hass;});
 await card.locator('[data-action="open_cover"]').click();
 assert.equal(await card.locator('[data-action="stop_cover"]').isDisabled(),false);
 await card.locator('[data-action="stop_cover"]').click();assert.equal(await page.evaluate(()=>calls.at(-1)[1]),'stop_cover');
 await page.evaluate(()=>{hass.states['cover.fixture'].attributes.supported_features=3;card.hass=hass;});
 assert.equal(await card.locator('[data-section="position"]').isVisible(),false);
 assert.equal(await card.locator('[data-section="tilt"]').isVisible(),false);
 assert.equal(await card.locator('[data-action="stop_cover"]').isVisible(),false);
 assert.deepEqual(errors,[]);await browser.close();console.log('Cover Glass OK: six widths, explicit Apply, realtime drafts, missing position, unavailable, capabilities, Stop during pending move.');
})().catch(e=>{console.error(e);process.exit(1)});

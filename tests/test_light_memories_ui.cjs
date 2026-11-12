// UI acceptance on localhost with a fake HA API and a native-tile placeholder.
// This does not test HA's own tile rendering or a physical light.
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const asset=path.join(__dirname,'../custom_components/cl_control/frontend/cl-control-light-memories-card.mjs');
const fixture=`<!doctype html><html lang="it"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:14px system-ui;margin:12px;background:#081b2c;color:white;--primary-color:#087fb8;--primary-text-color:#f5f8ff;--secondary-text-color:#b3c8d8;--divider-color:#345;--secondary-background-color:#12324a;--card-background-color:#0c253b}main{max-width:760px;margin:auto}</style><main></main><script type="module">
import {lightTileConfig,memoryDescription} from '/card.mjs';
window.lightTileConfig=lightTileConfig;window.memoryDescription=memoryDescription;
customElements.define('ha-card',class extends HTMLElement{connectedCallback(){this.style.display='block'}});
window.loadCardHelpers=async()=>({createCardElement:config=>{const e=document.createElement('div');e.textContent=config.name||config.entity;e.style.padding='16px';return e;}});
window.calls=[];window.items=[];window.serviceCalls=[];
window.hass={callService:async(...args)=>{serviceCalls.push(args);},user:{id:'fixture-user'},states:{'light.fixture':{state:'on',attributes:{supported_color_modes:['rgb'],color_mode:'rgb',brightness:100,rgb_color:[32,64,128]}}},callWS:async m=>{
 calls.push(m);
 if(m.type.endsWith('/list'))return {items:items.filter(i=>i.kind===m.kind)};
 if(m.type.endsWith('/capture')){items.push({id:String(items.length+1),name:m.name,kind:m.kind,available:true,states:Object.fromEntries(m.entity_ids.map(e=>[e,{state:'on',brightness:100,color_mode:'rgb',rgb_color:[32,64,128]}]))});return {};}
 if(m.type.endsWith('/create')){items.push({id:String(items.length+1),name:m.name,kind:'scene',available:true,states:JSON.parse(JSON.stringify(m.states))});return {};}
 if(m.type.endsWith('/delete')){window.items=items.filter(i=>i.id!==m.item_id);return {};}
 if(m.type.endsWith('/apply'))return {dispatched:true};
 throw Error('Unexpected API');
}};
const card=document.createElement('cl-control-light-memories-card');window.card=card;
card.setConfig(location.search.includes('scenes')?{entities:[{entity_id:'light.fixture',name:'Luce prova'}]}:{entity:'light.fixture',name:'Luce prova'});
card.hass=hass;document.querySelector('main').append(card);window.ready=true;
</script></html>`;

module.exports={fixture,asset};
if(require.main===module)(async()=>{
 const server=http.createServer((req,res)=>{if(req.url==='/card.mjs'){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(asset));}else{res.setHeader('Content-Type','text/html');res.end(fixture);}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let browser;
 try{
   const alternate=process.env.CHROMIUM_MODULE?(await import(process.env.CHROMIUM_MODULE)).default:null;
   const channel=process.env.CL_TEST_BROWSER_CHANNEL||process.env.BROWSER_CHANNEL;
   browser=await chromium.launch({headless:true,...(channel?{channel}:{}),...(alternate?{
     args:alternate.args,executablePath:await alternate.executablePath(),
   }:{})});
   const url=`http://127.0.0.1:${server.address().port}`;
   const page=await browser.newPage({viewport:{width:390,height:844}});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   page.on('dialog',dialog=>dialog.accept());
   await page.goto(url);await page.waitForFunction(()=>window.ready);
   const root=page.locator('cl-control-light-memories-card');
   assert.equal(await root.locator('#presetPanel').isVisible(),false);
   assert.equal(await root.locator('[data-control="white"]').count(),0);
   assert.equal(await root.locator('#lightAdjustments').isVisible(),false);
   const initialCalls=await page.evaluate(()=>serviceCalls.length);
   for(const width of [320,390,768,1024,1440,1920]){
     await page.setViewportSize({width,height:900});
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
     if(process.env.SCREENSHOT_DIR){fs.mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,`summary-light-${width}.png`)});}
   }
   await root.locator('#adjust').click();
   assert.equal(await page.evaluate(()=>serviceCalls.length),initialCalls);
   assert.equal(await root.locator('#lightAdjustments').isVisible(),true);
   await root.locator('[data-control="hue"]').fill('120');
   assert.deepEqual(await page.evaluate(()=>serviceCalls.at(-1).slice(0,3)),['light','turn_on',{hs_color:[120,100]}]);
   for(const width of [320,390,768,1024,1440,1920]){
     await page.setViewportSize({width,height:900});
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
     if(process.env.SCREENSHOT_DIR){fs.mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,`details-light-${width}.png`)});}
   }
   await root.locator('#favorites').click();
   await root.locator('#name').fill('Lettura <img src=x onerror=alert(1)>');
   await root.locator('#capture').click();
   await root.locator('[data-apply]').waitFor();
   assert.equal(await root.locator('img').count(),0);
   assert.equal((await page.evaluate(()=>calls.find(x=>x.type.endsWith('/capture')))).kind,'preset');
   await root.locator('[data-apply]').click();
   await page.waitForFunction(()=>calls.some(x=>x.type.endsWith('/apply')));
   await root.locator('[data-delete]').click();
   await page.waitForFunction(()=>items.length===0);
   await page.evaluate(()=>{hass.states['light.fixture'].state='off';card.hass={...hass};});
   await root.locator('#name').fill('Nuovo');
   assert.equal(await root.locator('#capture').isDisabled(),true);
   // RGBW channel preservation, focused draft during realtime, offline gating.
   await page.evaluate(()=>{hass.states['light.fixture']={state:'on',attributes:{supported_color_modes:['rgbw'],brightness:128,rgbw_color:[32,64,128,80]}};card.hass={...hass};});
   await root.locator('[data-control="hue"]').fill('120');
   assert.deepEqual(await page.evaluate(()=>serviceCalls.at(-1)[2]),{rgbw_color:[0,255,0,80]});
   await root.locator('[data-control="white"]').fill('50');
   assert.deepEqual(await page.evaluate(()=>serviceCalls.at(-1)[2]),{rgbw_color:[32,64,128,128]});
   await root.locator('[data-control="brightness"]').focus();
   await page.evaluate(()=>{window.focused=card.shadowRoot.activeElement;focused.value='73';hass.states['light.fixture'].attributes.brightness=50;card.hass={...hass};});
   assert.equal(await page.evaluate(()=>card.shadowRoot.activeElement===focused&&focused.value==='73'),true);
   if(process.env.SCREENSHOT_DIR){
     await page.setViewportSize({width:390,height:900});
     await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'rgbw-390.png')});
   }
   await page.evaluate(()=>{hass.states['light.fixture'].state='unavailable';card.hass={...hass};});
   assert.equal(await root.locator('#power').isDisabled(),true);
   assert.equal(await root.locator('[data-control="white"]').isDisabled(),true);
   await page.evaluate(()=>{hass.states['light.fixture']={state:'on',attributes:{supported_color_modes:['rgbw'],brightness:64,rgbw_color:[255,0,0,0]}};card.hass={...hass};});
   assert.equal(await root.locator('ha-card').evaluate(e=>e.style.getPropertyValue('--light-rgb')),'255,0,0');
   assert.ok(Math.abs(parseFloat(await root.locator('ha-card').evaluate(e=>e.style.getPropertyValue('--light-level')))-64/255*100)<.01);
   await root.locator('#adjust').click();
   assert.equal(await root.locator('#lightAdjustments').isVisible(),false);
   if(await root.locator('#presetPanel').isVisible())await root.locator('#favorites').click();
   if(process.env.SCREENSHOT_DIR){await page.setViewportSize({width:390,height:900});await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'summary-red-25.png')});}
   await page.evaluate(()=>{hass.states['light.fixture'].attributes.brightness=255;hass.states['light.fixture'].attributes.rgbw_color=[0,255,0,0];card.hass={...hass};});
   assert.equal(await root.locator('ha-card').evaluate(e=>e.style.getPropertyValue('--light-rgb')),'0,255,0');
   assert.equal(await root.locator('ha-card').evaluate(e=>e.style.getPropertyValue('--light-level')),'100%');
   if(process.env.SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'summary-green-100.png')});
   await page.goto(url+'/?scenes');await page.waitForFunction(()=>window.ready);
   await root.locator('#createScene').click();
   assert.equal(await root.locator('#nextScene').isDisabled(),true);
   await root.locator('[data-target]').check();
   await root.locator('#nextScene').click();
   await root.locator('#nextScene').click();
   await root.locator('#name').fill('Serata');
   await root.locator('#capture').click();await root.locator('[data-apply]').waitFor();
   assert.deepEqual(Object.keys((await page.evaluate(()=>calls.find(x=>x.type.endsWith('/create')))).states),['light.fixture']);
   await root.locator('[data-apply]').click();
   await page.waitForFunction(()=>calls.some(x=>x.type.endsWith('/apply')));
   for(const width of [320,390,768,1024,1440,1920]){
     await page.setViewportSize({width,height:900});
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`overflow at ${width}`);
     if(process.env.SCREENSHOT_DIR&&[390,1200].includes(width)){
       fs.mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});
       await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,`scene-${width}.png`),fullPage:true});
     }
   }
   const configs=await page.evaluate(()=>[
     lightTileConfig('light.fixture','Test',{attributes:{supported_color_modes:['onoff']}}),
     lightTileConfig('light.fixture','Test',{attributes:{supported_color_modes:['color_temp']}})
   ]);
   assert.equal(configs[0].features.length,0);
   assert.deepEqual(configs[1].features.map(f=>f.type),['light-brightness','light-color-temp']);
   assert.equal(await page.evaluate(()=>memoryDescription({'light.fixture':{state:'off'}})),'Spenta');
   assert.deepEqual(errors,[]);
   console.log('UI OK: preferiti, snapshot, applicazione, eliminazione, escaping, luce spenta, 6 viewport, capacità native; nessun errore browser.');
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});

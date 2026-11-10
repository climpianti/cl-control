// Real CL component; synthetic HA API only. No connection to a home installation.
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const {fixture,asset}=require('./test_light_memories_ui.cjs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const output=path.resolve(process.env.CL_TEST_ARTIFACTS||'test-artifacts','scenes-guided');fs.mkdirSync(output,{recursive:true});
const baseline=process.env.CL_BASELINE_REF?cp.execFileSync('git',['show',process.env.CL_BASELINE_REF+':custom_components/cl_control/frontend/cl-control-light-memories-card.mjs'],{encoding:'utf8'}):null;
const html=fixture.replace('<html lang="it">','<html lang="it"><meta charset="utf-8">').replace('<main></main>','<main><p>Anteprima locale · dati simulati · nessun dispositivo connesso</p></main>')
 .replace('--primary-text-color:#f5f8ff','--primary-text-color:#111111')
 .replace("this.style.display='block'","this.style.display='block';this.style.color='var(--primary-text-color, #111111)'");
const server=http.createServer((req,res)=>{
 res.setHeader('Content-Type',req.url.endsWith('.mjs')?'text/javascript':'text/html');
 res.end(req.url==='/card.mjs'?fs.readFileSync(asset):req.url==='/baseline.mjs'?baseline:html.replace("from '/card.mjs'",req.url.startsWith('/before')?"from '/baseline.mjs'":"from '/card.mjs'"));
});
async function prepare(page,url){
 await page.goto(url);await page.waitForFunction(()=>window.ready);
 await page.evaluate(async()=>{
  window.items=[{id:'relax',kind:'scene',name:'Relax',states:{'light.a':{state:'on',brightness:100,color_mode:'rgb',rgb_color:[255,170,70]},'light.b':{state:'off'}},available:true},{id:'night',kind:'scene',name:'Buonanotte',states:{'light.a':{state:'off'},'light.b':{state:'off'}},available:true}];
  hass.states={
   'light.a':{state:'on',attributes:{supported_color_modes:['rgb'],color_mode:'rgb',brightness:100,rgb_color:[255,170,70]}},
   'light.b':{state:'off',attributes:{supported_color_modes:['onoff']}},
   'light.c':{state:'on',attributes:{supported_color_modes:['color_temp'],color_mode:'color_temp',brightness:150,color_temp_kelvin:2700}},
   'light.d':{state:'unavailable',attributes:{supported_color_modes:['rgbw']}}
  };
  card.setConfig({entities:[{entity_id:'light.a',name:'Lampada divano',area_name:'Salotto'},{entity_id:'light.b',name:'Faretti tavolo con un nome particolarmente lungo',area_name:'Salotto'},{entity_id:'light.c',name:'Luce cucina',area_name:'Cucina'},{entity_id:'light.d',name:'Strip RGBW',area_name:'Cucina'}]});
  const original=hass.callWS;hass.callWS=async message=>{
   if(message.type.endsWith('/capture')){
    calls.push(message);const states=Object.fromEntries(message.entity_ids.map(id=>{const s=hass.states[id];return [id,s.state==='off'?{state:'off'}:{state:'on',brightness:s.attributes.brightness,color_mode:s.attributes.color_mode,rgb_color:s.attributes.rgb_color}];}));
    items.push({id:'new-'+items.length,kind:message.kind,name:message.name,states,available:true});return {};
   }
   const reply=await original(message);if(message.type.endsWith('/list'))for(const item of reply.items)item.available=Object.keys(item.states).every(id=>['on','off'].includes(hass.states[id]?.state));return reply;
  };
  card.hass={...hass};await card._load();
 });
}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({headless:true,channel:process.env.CL_TEST_BROWSER_CHANNEL||undefined});
  const page=await browser.newPage({viewport:{width:390,height:950}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const base=`http://127.0.0.1:${server.address().port}`;
  if(baseline){await prepare(page,base+'/before?scenes');await page.locator('cl-control-light-memories-card').screenshot({path:path.join(output,'before-390.png')});}
  await prepare(page,base+'/?scenes');const root=page.locator('cl-control-light-memories-card');
  assert.equal(await root.locator('#sceneEditor').isVisible(),false);
  // Native ha-card inherits the active HA theme, including a dark text color in light mode.
  const contrastText=await root.locator('h3').evaluate(el=>getComputedStyle(el).color);
  assert.ok(contrastText.match(/[0-9]+/g).slice(0,3).every(value=>Number(value)>180),'Glass heading must stay readable under the native light theme: '+contrastText);
  await page.evaluate(()=>{window.originalIcon=null;window.dialogs=[];});
  const verifyWidths=async label=>{for(const width of [320,390,768,1024,1440,1920]){
   await page.setViewportSize({width,height:950});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,label+' '+width);
   await page.screenshot({path:path.join(output,label+'-'+width+'.png'),fullPage:true});
   if(label==='list'&&width===390)await root.screenshot({path:path.join(output,'after-390.png')});
  }};
  await verifyWidths('list');
  await root.locator('#createScene').click();assert.equal(await root.locator('#nextScene').isDisabled(),true);
  assert.deepEqual(await root.locator('.area-name').allTextContents(),['Salotto','Cucina']);
  assert.equal(await root.locator('[data-target="light.d"]').isDisabled(),true);
  await root.locator('[data-target="light.a"]').check();await root.locator('[data-target="light.b"]').check();
  await verifyWidths('selection');
  await root.locator('#nextScene').click();await root.locator('#name').fill('Cena <img src=x onerror=alert(1)>');
  await root.locator('#name').focus();
  await page.evaluate(()=>{window.field=card.shadowRoot.querySelector('#name');field.setSelectionRange(3,7);hass.states['light.a'].attributes.brightness=200;card.hass={...hass};});
  assert.equal(await page.evaluate(()=>card.shadowRoot.activeElement===field&&field.selectionStart===3&&field.selectionEnd===7),true);
  await page.evaluate(()=>card._load());
  assert.equal(await page.evaluate(()=>card.shadowRoot.querySelector('#name')===field&&card.shadowRoot.activeElement===field&&field.selectionStart===3),true);
  await verifyWidths('name');
  await root.locator('#nextScene').click();
  assert.match(await root.locator('#selectionSummary').innerText(),/1 accesa · 1 spenta/);
  assert.equal(await root.locator('img').count(),0);
  await verifyWidths('review');
  const captures=()=>page.evaluate(()=>calls.filter(c=>c.type.endsWith('/capture')).length);
  assert.equal(await captures(),0);
  await page.evaluate(()=>{hass.states['light.a'].state='unavailable';card.hass={...hass};});
  assert.equal(await root.locator('#capture').isDisabled(),true);
  assert.equal(await root.locator('[data-apply="relax"]').isDisabled(),true);
  await root.locator('#previousScene').click();await root.locator('#previousScene').click();
  assert.equal(await root.locator('[data-target="light.a"]').isEnabled(),true);
  await root.locator('[data-target="light.a"]').uncheck();
  assert.equal(await root.locator('#nextScene').isEnabled(),true);
  await root.locator('#nextScene').click();assert.match(await root.locator('#name').inputValue(),/Cena/);
  await root.locator('#nextScene').click();assert.match(await root.locator('#selectionHint').innerText(),/spegnerà tutte/);
  await page.screenshot({path:path.join(output,'review-all-off.png'),fullPage:true});
  await page.evaluate(()=>{hass.states['light.a'].state='on';card.hass={...hass};});
  assert.equal(await root.locator('[data-apply="relax"]').isEnabled(),true);
  await page.evaluate(()=>{window.workingAPI=hass.callWS;hass.callWS=async message=>{if(message.type.endsWith('/capture'))throw Error('Salvataggio non riuscito: prova locale');return workingAPI(message);};card.hass={...hass};});
  await root.locator('#capture').click();await page.waitForFunction(()=>!card._busy&&card._error.includes('prova locale'));
  assert.equal(await page.evaluate(()=>card._sceneStep),3);assert.equal(await captures(),0);
  assert.equal(await root.locator('#sceneError').isVisible(),true);
  await page.evaluate(()=>{hass.callWS=workingAPI;card.hass={...hass};});
  await root.locator('#capture').click();await page.waitForFunction(()=>card._sceneStep===0&&!card._busy&&card._items.length===3);
  assert.deepEqual(await page.evaluate(()=>calls.find(c=>c.type.endsWith('/capture')).entity_ids),['light.b']);
  assert.equal(await root.locator('img').count(),0);assert.match(await root.locator('#sceneList').innerText(),/Cena <img/);
  assert.equal(await root.locator('#sceneEditor').isVisible(),false);
  // Cancel clears an unsaved draft, without touching the persisted library.
  await root.locator('#createScene').click();assert.equal(await root.locator('[data-target]:checked').count(),0);
  await root.locator('[data-target="light.a"]').check();await root.locator('#nextScene').click();await root.locator('#name').fill('Da annullare');await root.locator('#cancelScene').click();
  assert.equal(await captures(),1);assert.equal(await page.evaluate(()=>items.length),3);
  // An explicit invocation keeps the existing confirmation; dismissing sends nothing.
  page.once('dialog',dialog=>dialog.dismiss());await root.locator('[data-apply="relax"]').click();
  assert.equal(await page.evaluate(()=>calls.filter(c=>c.type.endsWith('/apply')).length),0);
  page.once('dialog',dialog=>dialog.accept());await root.locator('[data-apply="relax"]').click();
  await page.waitForFunction(()=>calls.some(c=>c.type.endsWith('/apply')));
  await page.evaluate(()=>{
   const entities=Array.from({length:33},(_,index)=>({entity_id:'light.limit_'+index,name:'Luce '+index,area_name:'Area di prova'}));
   for(const e of entities)hass.states[e.entity_id]={state:'off',attributes:{supported_color_modes:['onoff']}};
   card.setConfig({entities});card.hass={...hass};
  });
  await root.locator('#createScene').click();
  for(let index=0;index<32;index++)await root.locator('[data-target]').nth(index).check();
  assert.equal(await root.locator('[data-target]').nth(32).isDisabled(),true);
  await root.locator('[data-target]').nth(0).uncheck();
  assert.equal(await root.locator('[data-target]').nth(32).isEnabled(),true);
  assert.equal(await captures(),1);
  assert.equal(await page.evaluate(()=>serviceCalls.length),0);assert.deepEqual(errors,[]);
  console.log('Guided scenes OK: six widths at four steps, area grouping, live selection/application availability, all-off review, focus/cursor across realtime and refresh, escaping, cancel, explicit save and confirmation on mocked API.');
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});

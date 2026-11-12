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
   if(message.type.endsWith('/create')){
    calls.push(message);const states=JSON.parse(JSON.stringify(message.states));
    items.push({id:'new-'+items.length,kind:'scene',name:message.name,states,available:true});return {};
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
  if(baseline){
    await prepare(page,base+'/before?scenes');
    const before=page.locator('cl-control-light-memories-card');
    await before.locator('#createScene').click();await before.locator('[data-target="light.a"]').check();await before.locator('#nextScene').click();
    await before.screenshot({path:path.join(output,'before-editor-390.png')});
  }
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
  await root.locator('#nextScene').click();
  const a=root.locator('[data-draft-id="light.a"]'),b=root.locator('[data-draft-id="light.b"]');
  assert.equal(await b.locator('[data-draft-control="brightness"]').count(),0);
  await a.locator('[data-draft-control="brightness"]').fill('52');
  await a.locator('[data-draft-control="color"]').fill('#112233');
  await b.locator('[data-draft-on="on"]').click();
  await b.locator('[data-draft-on="off"]').click();
  await a.locator('[data-draft-control="brightness"]').focus();
  await page.evaluate(()=>{window.rangeField=card.shadowRoot.activeElement;hass.states['light.a'].state='off';hass.states['light.a'].attributes.brightness=200;card.hass={...hass};});
  assert.equal(await page.evaluate(()=>card.shadowRoot.activeElement===rangeField&&rangeField.value==='52'),true);
  await page.evaluate(()=>card._load());
  assert.equal(await page.evaluate(()=>card.shadowRoot.activeElement===rangeField&&rangeField.value==='52'),true);
  assert.equal(await page.evaluate(()=>card._sceneDrafts['light.a'].brightness),133);
  assert.equal(await page.evaluate(()=>serviceCalls.length),0);
  await verifyWidths('adjustments');
  await root.locator('#nextScene').click();await root.locator('#name').fill('Cena <img src=x onerror=alert(1)>');
  await root.locator('#name').focus();
  await page.evaluate(()=>{window.field=card.shadowRoot.querySelector('#name');field.setSelectionRange(3,7);hass.states['light.a'].attributes.brightness=200;card.hass={...hass};});
  assert.equal(await page.evaluate(()=>card.shadowRoot.activeElement===field&&field.selectionStart===3&&field.selectionEnd===7),true);
  await page.evaluate(()=>card._load());
  assert.equal(await page.evaluate(()=>card.shadowRoot.querySelector('#name')===field&&card.shadowRoot.activeElement===field&&field.selectionStart===3),true);
  await verifyWidths('name');
  assert.match(await root.locator('#selectionSummary').innerText(),/1 accesa · 1 spenta/);
  assert.match(await root.locator('[data-review="light.a"]').innerText(),/52%/);
  assert.equal(await root.locator('img').count(),0);
  await verifyWidths('review');
  const captures=()=>page.evaluate(()=>calls.filter(c=>c.type.endsWith('/create')).length);
  assert.equal(await captures(),0);
  await page.evaluate(()=>{hass.states['light.a'].state='unavailable';card.hass={...hass};});
  assert.equal(await root.locator('#capture').isDisabled(),true);
  assert.equal(await root.locator('[data-apply="relax"]').isDisabled(),true);
  await root.locator('#previousScene').click();await root.locator('#previousScene').click();
  assert.equal(await root.locator('[data-target="light.a"]').isEnabled(),true);
  await root.locator('[data-target="light.a"]').uncheck();
  assert.equal(await root.locator('#nextScene').isEnabled(),true);
  await root.locator('#nextScene').click();await root.locator('#nextScene').click();assert.match(await root.locator('#name').inputValue(),/Cena/);
  assert.match(await root.locator('#selectionHint').innerText(),/spegnerà tutte/);
  await page.screenshot({path:path.join(output,'review-all-off.png'),fullPage:true});
  await page.evaluate(()=>{hass.states['light.a'].state='on';card.hass={...hass};});
  assert.equal(await root.locator('[data-apply="relax"]').isEnabled(),true);
  await page.evaluate(()=>{window.workingAPI=hass.callWS;hass.callWS=async message=>{if(message.type.endsWith('/create'))throw Error('Salvataggio non riuscito: prova locale');return workingAPI(message);};card.hass={...hass};});
  await root.locator('#capture').click();await page.waitForFunction(()=>!card._busy&&card._error.includes('prova locale'));
  assert.equal(await page.evaluate(()=>card._sceneStep),3);assert.equal(await captures(),0);
  assert.equal(await root.locator('#sceneError').isVisible(),true);
  await page.evaluate(()=>{hass.callWS=workingAPI;card.hass={...hass};});
  await root.locator('#capture').click();await page.waitForFunction(()=>card._sceneStep===0&&!card._busy&&card._items.length===3);
  assert.deepEqual(await page.evaluate(()=>calls.find(c=>c.type.endsWith('/create')).states),{'light.b':{state:'off'}});
  assert.match(await root.locator('#sceneNotice').innerText(),/Premi Avvia/);
  assert.equal(await root.locator('img').count(),0);assert.match(await root.locator('#sceneList').innerText(),/Cena <img/);
  assert.equal(await root.locator('#sceneEditor').isVisible(),false);
  // Cancel clears an unsaved draft, without touching the persisted library.
  await root.locator('#createScene').click();assert.equal(await root.locator('[data-target]:checked').count(),0);
  await root.locator('[data-target="light.a"]').check();await root.locator('#nextScene').click();await root.locator('#nextScene').click();await root.locator('#name').fill('Da annullare');await root.locator('#cancelScene').click();
  assert.equal(await captures(),1);assert.equal(await page.evaluate(()=>items.length),3);
  // An explicit invocation keeps the existing confirmation; dismissing sends nothing.
  page.once('dialog',dialog=>dialog.dismiss());await root.locator('[data-apply="relax"]').click();
  assert.equal(await page.evaluate(()=>calls.filter(c=>c.type.endsWith('/apply')).length),0);
  page.once('dialog',dialog=>dialog.accept());await root.locator('[data-apply="relax"]').click();
  await page.waitForFunction(()=>calls.some(c=>c.type.endsWith('/apply')));
  // Native capabilities control which draft fields exist. No service is invoked.
  for(const mode of ['brightness','color_temp','rgb','rgbw','rgbww','hs','xy']){
    await page.evaluate(mode=>{
      hass.states['light.cap']={state:'off',attributes:{supported_color_modes:[mode],color_mode:null,brightness:null,min_color_temp_kelvin:2200,max_color_temp_kelvin:6000,effect_list:['Relax','Rainbow']}};
      card.setConfig({entities:[{entity_id:'light.cap',name:'Faretti tavernetta · prova '+mode,area_name:'Tavernetta'}]});card.hass={...hass};
    },mode);
    await root.locator('#createScene').click();await root.locator('[data-target="light.cap"]').check();await root.locator('#nextScene').click();
    assert.equal(await root.locator('#sceneNotice').isVisible(),false);
    const row=root.locator('[data-draft-id="light.cap"]');
    await row.locator('[data-draft-on="on"]').click();await row.locator('[data-draft-control="brightness"]').fill('52');
    if(['rgb','rgbw','rgbww'].includes(mode))await row.locator('[data-draft-control="color"]').fill('#112233');
    if(mode==='rgbw')await row.locator('[data-draft-control="white"]').fill('37');
    if(mode==='rgbww'){await row.locator('[data-draft-control="coldWhite"]').fill('20');await row.locator('[data-draft-control="warmWhite"]').fill('60');}
    if(mode==='color_temp')await row.locator('[data-draft-control="kelvin"]').fill('2800');
    if(mode==='hs'){await row.locator('[data-draft-control="hue"]').fill('180');await row.locator('[data-draft-control="saturation"]').fill('45');}
    if(mode==='xy'){await row.locator('[data-draft-control="x"]').fill('0.3');await row.locator('[data-draft-control="y"]').fill('0.4');}
    await row.locator('[data-draft-control="effect"]').selectOption('Relax');
    const snapshot=await page.evaluate(()=>card._sceneSnapshot('light.cap'));
    assert.equal(snapshot.state,'on');assert.equal(snapshot.brightness,133);assert.equal(snapshot.effect,'Relax');
    if(mode==='rgbw')assert.deepEqual(snapshot.rgbw_color,[17,34,51,94]);
    if(mode==='rgbww')assert.deepEqual(snapshot.rgbww_color,[17,34,51,51,153]);
    if(mode==='color_temp')assert.equal(snapshot.color_temp_kelvin,2800);
    if(mode==='hs')assert.deepEqual(snapshot.hs_color,[180,45]);
    if(mode==='xy')assert.deepEqual(snapshot.xy_color,[.3,.4]);
    if(mode==='rgbw'){
      await verifyWidths('rgbw-adjustments');
      await row.locator('[data-draft-on="off"]').click();
      assert.deepEqual(await page.evaluate(()=>card._sceneSnapshot('light.cap')),{state:'off'});
      await row.locator('[data-draft-on="on"]').click();
      assert.deepEqual(await page.evaluate(()=>card._sceneSnapshot('light.cap').rgbw_color),[17,34,51,94]);
      await row.locator('[data-draft-current]').click();
      assert.equal(await row.locator('[data-draft-settings]').isVisible(),false);
      assert.deepEqual(await page.evaluate(()=>card._sceneSnapshot('light.cap')),{state:'off'});
    }
    if(mode==='brightness'){
      await page.evaluate(()=>{hass.states['light.cap'].attributes.supported_color_modes=['onoff'];card.hass={...hass};});
      assert.equal(await root.locator('#nextScene').isDisabled(),true);
      await row.locator('[data-draft-current]').click();
      assert.equal(await row.locator('[data-draft-control="brightness"]').count(),0);
      assert.equal(await root.locator('#nextScene').isEnabled(),true);
    }
    await root.locator('#cancelScene').click();
  }
  // A supported mode change only replaces draft controls after explicit input.
  await page.evaluate(()=>{
    hass.states['light.cap']={state:'off',attributes:{supported_color_modes:['rgbw','color_temp'],min_color_temp_kelvin:2200,max_color_temp_kelvin:6000}};
    card.setConfig({entities:[{entity_id:'light.cap',name:'Faretti dimmerabili',area_name:'Tavernetta'}]});card.hass={...hass};
  });
  await root.locator('#createScene').click();await root.locator('[data-target]').check();await root.locator('#nextScene').click();
  await root.locator('[data-draft-on="on"]').click();await root.locator('[data-draft-control="mode"]').selectOption('color_temp');
  await root.locator('[data-draft-control="brightness"]').fill('52');await root.locator('[data-draft-control="kelvin"]').fill('2800');
  await root.locator('#nextScene').click();await root.locator('#name').fill('Relax tavernetta');await root.locator('#capture').click();
  await page.waitForFunction(()=>card._sceneStep===0&&!card._busy&&items.length===4);
  assert.deepEqual(await page.evaluate(()=>calls.filter(c=>c.type.endsWith('/create')).at(-1).states),{'light.cap':{state:'on',brightness:133,color_mode:'color_temp',color_temp_kelvin:2800}});
  assert.equal(await root.locator('[aria-label="Avvia Relax tavernetta"]').count(),1);
  // Use a normal sample name for the customer-facing screenshot after the escaping checks.
  await page.evaluate(async()=>{items.find(item=>item.name.includes('<img')).name='Cena';await card._load();});
  await page.setViewportSize({width:390,height:950});
  await page.screenshot({path:path.join(output,'saved-list-390.png'),fullPage:true});
  assert.equal(await captures(),2);
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
  assert.equal(await captures(),2);
  assert.equal(await page.evaluate(()=>serviceCalls.length),0);assert.deepEqual(errors,[]);
  console.log('Scene editor OK: six widths, draft on/off/brightness and all colour modes, RGBW whites, current-state shortcut, live capability validation, focus/cursor, explicit save, saved Avvia and confirmation; no device services.');
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});

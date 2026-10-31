// DOM behavior only: no graphical layout/native HA tile verification.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require(process.env.JSDOM_MODULE||'jsdom');
const {fixture,asset}=require('./test_light_memories_ui.cjs');
const source=fs.readFileSync(asset,'utf8').replace(/export (function|class) /g,'$1 ');
const fixtureScript=fixture.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(/^import .*;$/m,'');
const flush=()=>new Promise(resolve=>setTimeout(resolve,0));
async function mount(scenes=false){
 const dom=new JSDOM(fixture.replace(/<script[\s\S]*?<\/script>/,''),{runScripts:'outside-only',url:'http://localhost/'+(scenes?'?scenes':'')});
 dom.window.confirm=()=>true;
 dom.window.eval(source+'\nwindow.lightTileConfig=lightTileConfig;window.memoryDescription=memoryDescription;');
 dom.window.eval(fixtureScript);await flush();await flush();
 return dom;
}
function name(w,value){const n=w.card.shadowRoot.querySelector('#name');n.value=value;n.dispatchEvent(new w.Event('input',{bubbles:true}));}
(async()=>{
 let dom=await mount();let w=dom.window;let root=()=>w.card.shadowRoot;
 root().querySelector('#favorites').click();
 name(w,'Lettura <img src=x onerror=alert(1)>');
 assert.equal(root().querySelector('#capture').disabled,false);
 root().querySelector('#capture').click();await flush();await flush();
 assert.equal(root().querySelectorAll('[data-apply]').length,1);
 assert.equal(root().querySelectorAll('img').length,0);
 assert.equal(w.calls.find(x=>x.type.endsWith('/capture')).kind,'preset');
 root().querySelector('[data-apply]').click();await flush();
 assert.ok(w.calls.some(x=>x.type.endsWith('/apply')));
 root().querySelector('[data-delete]').click();await flush();await flush();
 assert.equal(w.items.length,0);
 w.hass.states['light.fixture'].state='off';w.card.hass={...w.hass};name(w,'Nuovo');
 assert.equal(root().querySelector('#capture').disabled,true);
 // RGBW must preserve white while selecting hue, and RGB while adjusting W.
 w.hass.states['light.fixture']={state:'on',attributes:{supported_color_modes:['rgbw'],brightness:128,rgbw_color:[32,64,128,80]}};w.card.hass={...w.hass};
 w.card._setLight('hue',120);await flush();
 assert.equal(JSON.stringify(w.serviceCalls.at(-1)),JSON.stringify(['light','turn_on',{rgbw_color:[0,255,0,80]},{entity_id:'light.fixture'}]));
 w.card._setLight('white',50);await flush();
 assert.equal(JSON.stringify(w.serviceCalls.at(-1)[2]),JSON.stringify({rgbw_color:[32,64,128,128]}));
 w.card._setLight('brightness',0);await flush();assert.equal(w.serviceCalls.at(-1)[1],'turn_off');
 w.card._expanded=false;w.hass.callService=async()=>{throw Error('Test service error');};w.card.hass={...w.hass};
 await w.card._control('turn_on');assert.equal(root().querySelector('[role="alert"]').textContent,'Test service error');
 w.hass.states['light.fixture'].state='unavailable';w.card.hass={...w.hass};assert.equal(root().querySelector('#power').disabled,true);
 w.hass.states['light.fixture']={state:'off',attributes:{supported_color_modes:['onoff']}};w.card.hass={...w.hass};
 assert.equal(root().querySelectorAll('[data-control]').length,0);
 dom.window.close();dom=await mount(true);w=dom.window;
 w.hass.states['light.fixture'].state='unavailable';w.card.hass={...w.hass};
 assert.equal(root().querySelector('[data-target]').disabled,true);
 w.hass.states['light.fixture'].state='off';w.card.hass={...w.hass};
 assert.equal(root().querySelector('[data-target]').disabled,false);
 assert.equal(root().querySelector('.targets small').textContent,'Spenta');
 name(w,'Serata');assert.equal(root().querySelector('#capture').disabled,true);
 const target=root().querySelector('[data-target]');target.checked=true;target.dispatchEvent(new w.Event('change'));
 root().querySelector('#capture').click();await flush();await flush();
 assert.equal(w.calls.find(x=>x.type.endsWith('/capture')).entity_ids.join(','),'light.fixture');
 root().querySelector('[data-apply]').click();await flush();
 assert.ok(w.calls.some(x=>x.type.endsWith('/apply')));
 const off=w.lightTileConfig('light.fixture','Test',{attributes:{supported_color_modes:['onoff']}});
 const dim=w.lightTileConfig('light.fixture','Test',{attributes:{supported_color_modes:['color_temp']}});
 assert.equal(off.features.length,0);assert.equal(dim.features.map(f=>f.type).join(','),'light-brightness,light-color-temp');
 assert.equal(w.memoryDescription({'light.fixture':{state:'off'}}),'Spenta');
 dom.window.close();console.log('DOM OK: controlli su salvataggio, selezione, applicazione, eliminazione, escaping, stato live e capacità native. Nessuna verifica grafica.');
})().catch(e=>{console.error(e);process.exitCode=1;});

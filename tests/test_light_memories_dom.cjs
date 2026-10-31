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
 dom.window.close();dom=await mount(true);w=dom.window;
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
 dom.window.close();console.log('DOM OK: 13 controlli su salvataggio, selezione, applicazione, eliminazione, escaping, luce spenta e capacità native. Nessuna verifica grafica.');
})().catch(e=>{console.error(e);process.exitCode=1;});

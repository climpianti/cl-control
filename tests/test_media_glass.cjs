// Isolated browser: mock states/services, no connection to Home Assistant.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const cp=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const asset='custom_components/cl_control/frontend/cl-control-media-card.mjs';
const out=path.resolve(process.env.CL_TEST_ARTIFACTS||'test-artifacts', 'media-glass-local');
async function mount(page,source){
 await page.setContent('<html lang="it"><style>body{margin:16px;background:#f4f6f8;font-family:Arial}h1{font-size:20px}p{font-size:13px}main{display:grid;gap:20px;max-width:850px;margin:auto}</style><main><h1>Multimedia · anteprima locale</h1><p>Dati simulati · comandi intercettati · icone sostitutive</p><div id="cards"></div></main></html>');
 await page.evaluate(source.replace('export class ','class '));
 await page.evaluate(()=>{
  customElements.define('ha-icon',class extends HTMLElement{connectedCallback(){this.textContent=({'mdi:play':'▶','mdi:pause':'Ⅱ','mdi:skip-previous':'⏮','mdi:skip-next':'⏭','mdi:dots-vertical':'⋮','mdi:volume-high':'♪','mdi:music-note':'♫','mdi:speaker':'▣','mdi:television':'▭'})[this.getAttribute('icon')]||'◇';this.style.fontSize='24px';}});
  customElements.define('ha-card',class extends HTMLElement{connectedCallback(){this.style.display='block';}}); window.calls=[]; window.hass={states:{},callService:async(...args)=>calls.push(args)};
  for(const [id,name,state] of [['salotto','Sonos · Salotto','playing'],['living','LG · Living con un nome molto lungo da verificare','paused'],['camera','Samsung · Camera','unavailable']]){
   hass.states['media_player.'+id]={state,attributes:{friendly_name:name,media_title:'Audio TV e musica',volume_level:.35,supported_features:1|4|8|16|32|128|256|2048|16384,source:'TV',source_list:['TV','Musica']}};
   const card=document.createElement('cl-control-media-card');card.setConfig({entity:'media_player.'+id,name,subtitle:'Audio TV e musica',show_power:false});card.hass=hass;document.querySelector('#cards').append(card);
  }
  window.card=document.querySelector('cl-control-media-card');
 });
}
(async()=>{
 fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({headless:true,channel:process.env.CL_TEST_BROWSER_CHANNEL||undefined});
 if(process.env.CL_BASELINE_REF){const page=await browser.newPage({viewport:{width:390,height:900}});await mount(page,cp.execFileSync('git',['show',process.env.CL_BASELINE_REF+':'+asset],{encoding:'utf8'}));await page.screenshot({path:path.join(out,'before-390.png'),fullPage:true});await page.close();}
 const p=await browser.newPage({viewport:{width:390,height:900}});let errors=[];p.on('pageerror',e=>errors.push(e.message));
 await mount(p,fs.readFileSync(asset,'utf8'));
 await p.evaluate(async()=>{
  const root=card.shadowRoot;window.slider=root.querySelector('input');slider.focus();slider.value='72';
  hass.states['media_player.salotto'].attributes.volume_level=.21;card.hass={...hass};
  if(root.querySelector('input')!==slider||slider.value!=='72'||root.activeElement!==slider)throw Error('Realtime lost volume focus/draft');
  slider.dispatchEvent(new Event('change'));await Promise.resolve();
  const select=root.querySelector('select');select.focus();select.value='Musica';card.hass={...hass};if(select.value!=='Musica')throw Error('Source draft lost');
  select.dispatchEvent(new Event('change'));await Promise.resolve();
 });
 const calls=await p.evaluate(()=>calls);assert.equal(calls.length,2);assert.equal(calls[0][1],'volume_set');assert.equal(calls[0][2].volume_level,.72);assert.equal(calls[1][1],'select_source');
 assert.equal(await p.evaluate(()=>document.querySelectorAll('cl-control-media-card')[2].shadowRoot.querySelector('.play').disabled),true);
 assert.equal(await p.evaluate(()=>card.shadowRoot.querySelector('.power').hidden),true);
 for(const width of [320,390,768,1024,1440,1920]){
  await p.setViewportSize({width,height:900});await p.screenshot({path:path.join(out,'after-'+width+'.png'),fullPage:true});
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Page overflow at '+width);
 }
 await p.evaluate(async()=>{
  hass.services={webostv:{button:{}}};card.setConfig({entity:'media_player.salotto',remote_type:'webostv'});card.hass=hass;
  const before=calls.length;card.shadowRoot.querySelector('.remote').click();
  const dialog=card.shadowRoot.querySelector('dialog');if(!dialog?.open||calls.length!==before)throw Error('Opening remote sent command');
  [...dialog.querySelectorAll('button')].find(b=>b.textContent==='OK').click();await Promise.resolve();
  const call=calls.at(-1);if(call[0]!=='webostv'||call[1]!=='button'||call[2].button!=='ENTER')throw Error('Wrong remote payload');
  hass.states['media_player.salotto'].state='unavailable';card.hass=hass;if([...dialog.querySelectorAll('button[data-remote-key]')].some(b=>!b.disabled))throw Error('Offline remote enabled');
  dialog.close();
  hass.states['media_player.salotto'].state='playing';hass.services={remote:{send_command:{}}};
  card.setConfig({entity:'media_player.salotto',remote_entity:'remote.living',remote_commands:{ENTER:'KEY_OK'}});card.hass=hass;
  if(card.shadowRoot.querySelector('.remote').getAttribute('aria-label')!=='Telecomando completo')throw Error('Remote entity not detected');
  card.shadowRoot.querySelector('.remote').click();const universal=card.shadowRoot.querySelector('dialog');
  if(!universal?.open)throw Error('Universal remote did not open');
  [...universal.querySelectorAll('button')].find(b=>b.textContent==='OK').click();await Promise.resolve();
  const mapped=calls.at(-1);if(mapped[0]!=='remote'||mapped[1]!=='send_command'||mapped[2].entity_id!=='remote.living'||mapped[2].command!=='KEY_OK')throw Error('Incorrect remote command mapping');
  universal.close();
    card.setConfig({entity:'media_player.salotto',remote_entity:'remote.living',remote_platform:'samsungtv'});card.hass=hass;
    card.shadowRoot.querySelector('.remote').click();let panel=card.shadowRoot.querySelector('dialog');
    [...panel.querySelectorAll('button')].find(b=>b.textContent==='OK').click();await Promise.resolve();
    if(calls.at(-1)?.[2]?.command!=='KEY_ENTER')throw Error('Samsung key mapping failed');
    panel.close();
    card.setConfig({entity:'media_player.salotto',remote_entity:'remote.living',remote_platform:'androidtv'});card.hass=hass;
    card.shadowRoot.querySelector('.remote').click();panel=card.shadowRoot.querySelector('dialog');
    [...panel.querySelectorAll('button')].find(b=>b.textContent==='OK').click();await Promise.resolve();
    if(calls.at(-1)?.[2]?.command!=='CENTER')throw Error('Fire TV ADB mapping failed');
    panel.close();
    card.setConfig({entity:'media_player.salotto',remote_entity:'remote.living',remote_platform:'androidtv_remote'});card.hass=hass;
    card.shadowRoot.querySelector('.remote').click();panel=card.shadowRoot.querySelector('dialog');
    [...panel.querySelectorAll('button')].find(b=>b.textContent==='OK').click();await Promise.resolve();
    if(calls.at(-1)?.[2]?.command!=='DPAD_CENTER')throw Error('Android TV Remote mapping failed');
    panel.close();
    card.setConfig({entity:'media_player.salotto',remote_entity:'remote.living',remote_platform:'unknown'});card.hass=hass;
    card.shadowRoot.querySelector('.remote').click();panel=card.shadowRoot.querySelector('dialog');
    if(![...panel.querySelectorAll('button')].find(b=>b.textContent==='OK').disabled)throw Error('Unknown profile sent guessed key');
    panel.close();
    card.setConfig({entity:'media_player.salotto',name:'Samsung Salotto',remote_entity:'remote.living',remote_platform:'samsungtv'});
    card.hass=hass;
    card.shadowRoot.querySelector('.remote').click();
    panel=card.shadowRoot.querySelector('dialog.cl-remote-modal');
    if(!panel?.open)throw Error('Glass remote modal did not open');
    if(!panel.querySelector('.cl-remote-dpad'))throw Error('Directional pad missing');
    if(!panel.querySelector('.cl-remote-quick')||!panel.querySelector('.cl-remote-volume'))throw Error('Grouped controls missing');
    if(!panel.querySelector('button[data-remote-key=ENTER]')?.getAttribute('aria-label'))throw Error('Accessible OK button missing');
    if(panel.querySelectorAll('button[data-remote-key]').length!==15)throw Error('Some existing remote commands were lost');
    if(panel.querySelector('button[data-remote-key=ENTER]').disabled)throw Error('Online OK key should be enabled');
    if(panel.querySelector('h2')?.textContent!=='Samsung TV')throw Error('Device remote title missing');
    if(panel.querySelector('.cl-remote-state')?.dataset.available!=='true')throw Error('Remote connection state missing');
    const countBefore=calls.length;
    panel.querySelector('button[data-remote-key=ENTER]').click();await Promise.resolve();
    if(calls.length!==countBefore+1)throw Error('Remote did not send one command');
    if(calls.at(-1)?.[2]?.command!=='KEY_ENTER')throw Error('Glass remote changed Samsung command mapping');
    hass.states['media_player.salotto'].state='unavailable';card.hass={...hass};
    if([...panel.querySelectorAll('button[data-remote-key]')].some(b=>!b.disabled))throw Error('Remote command not disabled offline');
    if(panel.querySelector('.cl-remote-state')?.dataset.available!=='false')throw Error('Offline status not synchronized');
    hass.states['media_player.salotto'].state='playing';card.hass={...hass};
    if(panel.querySelector('button[data-remote-key=ENTER]').disabled)throw Error('Remote did not recover online');
    panel.querySelector('.cl-remote-close').click();
    if(card.shadowRoot.querySelector('dialog'))throw Error('Remote dialog not removed on close');
 });
 for(const width of [320,390,768,1024]){
   await p.setViewportSize({width,height:900});
   await p.evaluate(()=>{
     card.shadowRoot.querySelector('.remote').click();
   });
   const state=await p.evaluate(()=>{
     const dialog=card.shadowRoot.querySelector('dialog.cl-remote-modal');
     if(!dialog?.open)throw Error('Dialog not open for responsive test');
     const rect=dialog.getBoundingClientRect();
     const overflow=rect.left<0||rect.right>innerWidth||document.documentElement.scrollWidth>innerWidth;
     return {overflow,width:rect.width};
   });
   if(state.overflow)throw Error('Remote overflows at '+width);
   await p.screenshot({path:path.join(out,'remote-'+width+'.png'),fullPage:true});
   await p.evaluate(()=>card.shadowRoot.querySelector('dialog.cl-remote-modal')?.close());
 }
 assert.deepEqual(errors,[]);await browser.close();console.log('Glass media OK: realtime focus/drafts, mocked service payloads, unavailable, power visibility, six widths, no page errors.');
})().catch(e=>{console.error(e);process.exit(1)});

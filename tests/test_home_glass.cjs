// Actual custom components, simulated states, native area card placeholder.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=path.resolve(process.env.CL_TEST_ARTIFACTS||'test-artifacts', 'home-glass-local');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true,channel:process.env.CL_TEST_BROWSER_CHANNEL||undefined}),page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://cl.local/logo.png',route=>route.fulfill({path:path.resolve('custom_components/cl_control/frontend/logo.png'),contentType:'image/png'}));
 await page.route('http://cl.local/**',route=>route.fulfill({contentType:'text/html',body:'<html></html>'}));await page.goto('http://cl.local/cl-control/home');
 await page.setContent('<html lang="it"><style>body{margin:16px;background:#f4f6f9;font:14px Arial}main{max-width:1100px;margin:auto;display:grid;gap:16px}h1{font-size:20px}.systems{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}h2{font-size:18px;margin:0}@media(min-width:900px){.systems{grid-template-columns:repeat(3,minmax(0,1fr))}}</style><main><h1>Home · anteprima locale</h1><p>Dati simulati · nessun dispositivo connesso</p></main></html>');
 await page.evaluate(()=>customElements.define('ha-card',class extends HTMLElement{constructor(){super();this.attachShadow({mode:'open'}).innerHTML='<style>:host{display:block}</style><slot></slot>';}}));
 for(const file of ['cl-control-header-card.mjs','cl-control-welcome-card.mjs','cl-control-home-card.mjs','cl-control-assistance-card.mjs']){
  let source=fs.readFileSync('custom_components/cl_control/frontend/'+file,'utf8').replace(/export \{[^}]*\};?/g,'').replace('export function ','function ');
  if(file==='cl-control-home-card.mjs')source+='\nwindow.presentation=systemPresentation;';await page.evaluate(source);
 }
 await page.evaluate(()=>{
  window.calls=[];window.hass={user:{name:'Luigi'},config:{unit_system:{temperature:'°C'}},states:{},callService:async(...args)=>calls.push(args),callWS:async(...args)=>calls.push(args)};
  const state=(id,value,attributes={})=>hass.states[id]={entity_id:id,state:value,attributes};
  state('light.fixture','on',{brightness:180});state('light.other','off');state('cover.fixture','opening',{current_position:45});state('climate.fixture','heat',{hvac_action:'heating'});state('alarm_control_panel.fixture','armed_away');state('media_player.fixture','playing');state('camera.fixture','streaming');state('weather.fixture','rainy',{temperature:16,temperature_unit:'°C'});
  const main=document.querySelector('main');window.header=document.createElement('cl-control-header-card');header.setConfig({is_home:true,title:'CL Control',site_name:'Casa CL Impianti',logo:'https://cl.local/logo.png',weather_entity:'weather.fixture'});header.hass=hass;main.append(header);
  const welcome=document.createElement('cl-control-welcome-card');welcome.setConfig({mode:'extended',site_name:'Casa CL Impianti'});welcome.hass=hass;main.append(welcome);
  main.insertAdjacentHTML('beforeend','<h2>Sistemi</h2><div class="systems"></div>');window.cards={};
  for(const [module,name,entities] of [['lights','Luci',['light.fixture','light.other']],['covers','Aperture',['cover.fixture']],['climate','Clima',['climate.fixture']],['security','Sicurezza',['alarm_control_panel.fixture']],['media','Multimedia',['media_player.fixture']],['cameras','Telecamere',['camera.fixture']]]){const card=document.createElement('cl-control-system-card');card.setConfig({module,name,entities,path:module});card.hass=hass;document.querySelector('.systems').append(card);cards[module]=card;}
 });
 for(const width of [320,390,768,1024,1440,1920]){await page.setViewportSize({width,height:950});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(out,`home-${width}.png`),fullPage:true});if(width===390)await page.locator('.systems').screenshot({path:path.join(out,'systems-390.png')});}
 assert.equal(await page.evaluate(()=>cards.covers.shadowRoot.querySelector('.tile').dataset.motion),'moving');
 await page.evaluate(()=>{window.lightIcon=cards.lights.shadowRoot.querySelector('svg');window.logoButton=header.shadowRoot.querySelector('.logoButton');cards.lights.shadowRoot.querySelector('button').focus();cards.lights.hass={...hass};header.hass={...hass};});assert.equal(await page.evaluate(()=>cards.lights.shadowRoot.querySelector('svg')===lightIcon&&cards.lights.shadowRoot.activeElement===cards.lights.shadowRoot.querySelector('button')&&header.shadowRoot.querySelector('.logoButton')===logoButton),true);
 await page.evaluate(()=>cards.media.shadowRoot.querySelector('button').click());assert.equal(await page.evaluate(()=>location.pathname),'/cl-control/media');
 await page.evaluate(()=>{hass.states['cover.fixture'].state='closed';hass.states['cover.fixture'].attributes.current_position=0;cards.covers.hass=hass;});assert.equal(await page.evaluate(()=>cards.covers.shadowRoot.querySelector('.tile').dataset.motion),'none');
 await page.evaluate(()=>{hass.states['climate.fixture'].attributes.hvac_action='idle';cards.climate.hass=hass;});assert.equal(await page.evaluate(()=>cards.climate.shadowRoot.querySelector('.tile').dataset.tone),'blue');assert.match(await page.evaluate(()=>cards.climate.shadowRoot.querySelector('.state').textContent),/attesa/);
 await page.evaluate(()=>{hass.states['climate.fixture'].state='off';hass.states['climate.fixture'].attributes.hvac_action='heating';cards.climate.hass=hass;});assert.equal(await page.evaluate(()=>cards.climate.shadowRoot.querySelector('.tile').dataset.motion),'none');
 await page.evaluate(()=>{hass.states['alarm_control_panel.fixture'].state='triggered';cards.security.hass=hass;});assert.equal(await page.evaluate(()=>cards.security.shadowRoot.querySelector('.tile').dataset.tone),'alert');
 await page.evaluate(()=>{hass.states['light.fixture'].state='unavailable';cards.lights.hass=hass;});assert.match(await page.evaluate(()=>cards.lights.shadowRoot.querySelector('.state').textContent),/non disponibile/);assert.doesNotMatch(await page.evaluate(()=>cards.lights.shadowRoot.querySelector('.state').textContent),/Tutte spente/);
 await page.evaluate(()=>{hass.states['light.other'].state='unavailable';cards.lights.hass=hass;});assert.equal(await page.evaluate(()=>cards.lights.shadowRoot.querySelector('.tile').dataset.tone),'unavailable');
 await page.evaluate(()=>{hass.states['weather.fixture'].state='unavailable';header.hass=hass;});assert.match(await page.locator('cl-control-header-card .weather').innerText(),/Non disponibile/);assert.equal(await page.locator('cl-control-header-card .weather').isDisabled(),true);
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.evaluate(()=>getComputedStyle(cards.media.shadowRoot.querySelector('.bar')).animationName),'none');
 await page.evaluate(()=>{window.nativeConfigs=[];window.loadCardHelpers=async()=>({createCardElement:config=>{nativeConfigs.push(config);const node=document.createElement('div');node.textContent='Card nativa HA · segnaposto';return node;}});window.surface=document.createElement('cl-control-home-surface');surface.setConfig({card:{type:'area',area:'living',navigation_path:'area-living'}});surface.hass=hass;document.querySelector('main').append(surface);});
 await page.evaluate(()=>new Promise(r=>setTimeout(r,0)));await page.evaluate(()=>{window.native=surface.shadowRoot.querySelector('#native').firstChild;surface.hass={...hass};});assert.equal(await page.evaluate(()=>surface.shadowRoot.querySelector('#native').firstChild===native),true);assert.equal(await page.evaluate(()=>nativeConfigs.length),1);
 assert.deepEqual(await page.evaluate(()=>nativeConfigs[0]),{type:'area',area:'living',navigation_path:'area-living'});
 await page.evaluate(()=>{const main=document.querySelector('main');main.replaceChildren();main.insertAdjacentHTML('beforeend','<h1>Barra e Assistenza CL</h1><p>Anteprima locale · dati simulati</p>');main.append(header);window.support=document.createElement('cl-control-assistance-card');support.setConfig({url:'https://example.invalid/support?text=fixture',label:'Assistenza CL',subtitle:'Supporto rapido CL Impianti · ambiente con un nome particolarmente lungo'});main.append(support);hass.states['weather.fixture'].state='rainy';});
 for(const width of [320,390,768,1024,1440,1920]){
  await page.setViewportSize({width,height:900});
  for(const title of ['CL Control · Energia','CL Control · Multimedia','CL Control · Area con nome molto lungo']){
   await page.evaluate(title=>{header.setConfig({...header._config,is_home:false,title});header.hass=hass;},title);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`header ${width} ${title}`);
  }
  await page.screenshot({path:path.join(out,`header-support-${width}.png`),fullPage:true});
 }
 const support=page.locator('cl-control-assistance-card a');assert.equal(await support.getAttribute('href'),'https://example.invalid/support?text=fixture');assert.equal(await support.getAttribute('target'),'_blank');assert.equal(await support.getAttribute('rel'),'noopener noreferrer');
 assert.equal(await page.evaluate(()=>calls.length),0);assert.deepEqual(errors,[]);await browser.close();console.log('Home/header/support Glass OK: six widths, live states, native identity, safe support link, zero commands/messages.');
})().catch(e=>{console.error(e);process.exit(1)});

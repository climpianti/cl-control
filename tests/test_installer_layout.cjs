// Unlocked state is simulated only in this isolated fixture. No PIN/API calls.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=path.resolve(process.env.CL_TEST_ARTIFACTS||'test-artifacts', 'installer-overlap-local');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:process.env.CL_TEST_BROWSER_CHANNEL||undefined}),page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setContent('<html lang="it"><style>body{margin:16px;background:#f4f6f9;font:14px Arial}main{max-width:900px;margin:auto;display:grid;gap:16px}h1{font-size:20px}</style><main><h1>Installatore · test layout locale</h1><p>Stato sbloccato simulato · nessun PIN e nessuna connessione HA</p></main></html>');
 await page.evaluate(()=>customElements.define('ha-card',class extends HTMLElement{constructor(){super();this.attachShadow({mode:'open'}).innerHTML='<style>:host{display:block}</style><slot></slot>';}}));
 for(const file of ['cl-control-installer-card.mjs','cl-control-discovery-card.mjs','cl-control-modbus-card.mjs'])await page.evaluate(fs.readFileSync('custom_components/cl_control/frontend/'+file,'utf8').replace(/export (class|function) /g,'$1 ').replace(/export\s*\{[^}]+\};?/g,''));
 await page.evaluate(()=>{window.calls=[];window.installer=document.createElement('cl-control-installer-card');installer.setConfig({});installer._hass={user:{is_admin:true},states:{},callWS:async(...args)=>{calls.push(args);throw Error('Unexpected write/read')}};installer._unlocked=true;installer._runtime={site_name:'Casa di prova',site:{site_name:'Casa di prova'},experience_level:'standard'};installer._render();document.querySelector('main').append(installer);for(const name of ['cl-control-discovery-card','cl-control-modbus-card']){const card=document.createElement(name);card.setConfig({});document.querySelector('main').append(card);}});
 const card=page.locator('cl-control-installer-card');
 for(const width of [320,390,768,1024,1440,1920]){
  await page.setViewportSize({width,height:850});
  for(const dirty of [false,true]){
   await page.evaluate(dirty=>{installer._dirtyKeys.clear();if(dirty)installer._dirtyKeys.add('fixture');installer._updateSaveBar();},dirty);
   for(const scrollY of [0,500,2000]){await page.evaluate(y=>scrollTo(0,y),scrollY);
    const geometry=await page.evaluate(()=>{const root=installer.shadowRoot,b=root.querySelector('.saveBar').getBoundingClientRect(),c=root.querySelector('ha-card').getBoundingClientRect(),nav=[...root.querySelectorAll('.navCard')].map(e=>e.getBoundingClientRect()),discovery=document.querySelector('cl-control-discovery-card').getBoundingClientRect();return {inside:b.bottom<=c.bottom+1&&b.top>=c.top,afterNav:nav.every(r=>b.top>=r.bottom),afterCard:discovery.top>=c.bottom,overflow:document.documentElement.scrollWidth>innerWidth,position:getComputedStyle(root.querySelector('.saveBar')).position};});
    assert.deepEqual(geometry,{inside:true,afterNav:true,afterCard:true,overflow:false,position:'static'},`layout ${width}, dirty ${dirty}, scroll ${scrollY}`);
   }
  }
  await page.evaluate(()=>{installer._dirtyKeys.clear();installer._updateSaveBar();scrollTo(0,0);});await page.screenshot({path:path.join(out,`after-${width}.png`),fullPage:true});
 }
 assert.equal(await page.evaluate(()=>calls.length),0);assert.deepEqual(errors,[]);await browser.close();console.log('Installer layout OK: six widths, clean/dirty and three scroll positions, no overlap, no calls.');
})().catch(e=>{console.error(e);process.exit(1)});

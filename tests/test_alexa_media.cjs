// Browser regression for grouped Alexa controls. Entirely mocked HA state and services.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {inlineSharedImports}=require('./frontend_source.cjs');

(async()=>{
  const browser=await chromium.launch({headless:true,channel:process.env.CL_TEST_BROWSER_CHANNEL||undefined});
  const page=await browser.newPage({viewport:{width:390,height:880}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.setContent('<html lang="it"><body style="margin:12px;background:#071421"><div id="app" style="max-width:640px"></div></body></html>');
  const mediaFile='custom_components/cl_control/frontend/cl-control-media-card.mjs';
  await page.evaluate(inlineSharedImports(fs.readFileSync(mediaFile,'utf8')).replace('export class ','class '));
  await page.evaluate(()=>{
    customElements.define('ha-icon',class extends HTMLElement{
      connectedCallback(){this.textContent='◇';}
    });
    customElements.define('ha-card',class extends HTMLElement{connectedCallback(){this.style.display='block';}});
    window.calls=[];window.details=[];
    window.hass={
      states:{
        'media_player.echo_bed':{state:'idle',attributes:{friendly_name:'Echo camera',supported_features:4|8|16|32|16384,volume_level:.25}},
        'switch.echo_shuffle':{state:'off',attributes:{}},
        'switch.echo_dnd':{state:'on',attributes:{}},
        'select.echo_mode':{state:'Normale',attributes:{options:['Normale','Notte']}},
        'sensor.echo_temperature':{state:'22.5',attributes:{unit_of_measurement:'°C'}},
        'button.echo_refresh':{state:'unknown',attributes:{}},
        'binary_sensor.echo_motion':{state:'off',attributes:{}}
      },
      services:{},
      callService:async(...params)=>{calls.push(params);}
    };
    // HA button entities generally expose a timestamp as state.
    hass.states['button.echo_refresh'].state='2026-11-21T20:00:00+00:00';
    window.card=document.createElement('cl-control-media-card');
    card.setConfig({entity:'media_player.echo_bed',name:'Echo Show camera da letto',
      alexa_entities:[
        {entity:'switch.echo_shuffle',domain:'switch',name:'Mescolare'},
        {entity:'switch.echo_dnd',domain:'switch',name:'Non disturbare'},
        {entity:'select.echo_mode',domain:'select',name:'Modalità'},
        {entity:'sensor.echo_temperature',domain:'sensor',name:'Temperatura'},
        {entity:'button.echo_refresh',domain:'button',name:'Aggiorna'},
        {entity:'binary_sensor.echo_motion',domain:'binary_sensor',name:'Movimento'}
      ]});
    card.addEventListener('hass-more-info',event=>details.push(event.detail.entityId));
    document.querySelector('#app').append(card);card.hass=hass;
    const alexa=card.shadowRoot.querySelector('.alexa');
    if(alexa.hidden)throw Error('Alexa button should be visible');
    alexa.click();
    const dialog=card.shadowRoot.querySelector('dialog.cl-alexa-modal');
    if(!dialog?.open)throw Error('Alexa panel not opened');
    if(dialog.querySelectorAll('.alexa-row').length!==6)throw Error('Missing Alexa rows');
    if(!dialog.textContent.includes('22.5 °C'))throw Error('Sensor status not rendered');
  });
  await page.evaluate(()=>card.shadowRoot.querySelector('.alexa-row[data-entity="switch.echo_shuffle"] button').click());
  await page.waitForFunction(()=>calls.length===1);
  await page.evaluate(()=>{
    const d=card.shadowRoot.querySelector('dialog');
    const select=d.querySelector('.alexa-row[data-entity="select.echo_mode"] select');
    select.value='Notte';select.dispatchEvent(new Event('change'));
  });
  await page.waitForFunction(()=>calls.length===2);
  await page.evaluate(()=>card.shadowRoot.querySelector('.alexa-row[data-entity="button.echo_refresh"] button').click());
  await page.waitForFunction(()=>calls.length===3);
  const actions=await page.evaluate(()=>calls);
  assert.deepEqual(actions[0],['switch','turn_on',{entity_id:'switch.echo_shuffle'}]);
  assert.deepEqual(actions[1],['select','select_option',{option:'Notte',entity_id:'select.echo_mode'}]);
  assert.deepEqual(actions[2],['button','press',{entity_id:'button.echo_refresh'}]);
  await page.evaluate(()=>{
    hass.states['switch.echo_shuffle'].state='unavailable';
    card.hass={...hass};
    const row=card.shadowRoot.querySelector('.alexa-row[data-entity="switch.echo_shuffle"]');
    if(!row.querySelector('button').disabled||row.dataset.available!=='false')throw Error('Unavailable control enabled');
    if(!card.shadowRoot.querySelector('dialog').textContent.includes('Non disponibile'))throw Error('Offline status missing');
    card.shadowRoot.querySelector('.alexa-row[data-entity="sensor.echo_temperature"] button').click();
    if(details.at(-1)!=='sensor.echo_temperature')throw Error('Entity details does not point to member');
  });
  for(const width of [320,390,768]){
    await page.setViewportSize({width,height:900});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Mobile overflow '+width);
  }
  const out=path.resolve('test-artifacts/beta47-preview');
  fs.mkdirSync(out,{recursive:true});
  await page.setViewportSize({width:390,height:900});
  await page.screenshot({path:path.join(out,'alexa-unified-390.png'),fullPage:true});
  await page.evaluate(()=>{
    card.shadowRoot.querySelector('dialog .alexa-head button').click();
    const plain=document.createElement('cl-control-media-card');
    plain.setConfig({entity:'media_player.echo_bed',name:'Standalone'});
    document.querySelector('#app').append(plain);plain.hass=hass;
    if(!plain.shadowRoot.querySelector('.alexa').hidden)throw Error('Non-Alexa widget changed');
  });
  assert.deepEqual(errors,[]);
  await browser.close();
  console.log('Alexa unified media OK: grouping, status, services, details, offline, mobile widths');
})().catch(error=>{console.error(error);process.exitCode=1;});

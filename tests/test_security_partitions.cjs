const assert = require('node:assert/strict');
const { mkdir } = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const { mdiLock, mdiLockOpenVariant, mdiShieldHomeOutline, mdiShieldKeyOutline, mdiHomeOutline, mdiDoorClosed } = require('@mdi/js');

const assets = path.resolve('custom_components/cl_control/frontend');
const output = path.resolve('test-artifacts/beta45-preview');
const icons = {
  'mdi:lock': mdiLock,
  'mdi:lock-open-variant': mdiLockOpenVariant,
  'mdi:shield-home-outline': mdiShieldHomeOutline,
  'mdi:shield-key-outline': mdiShieldKeyOutline,
  'mdi:home-outline': mdiHomeOutline,
  'mdi:door-closed': mdiDoorClosed,
};
const html = '<!doctype html><html lang="it"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<style>body{background:#eef3f9;color:#173048;margin:0;font:15px system-ui}main{max-width:630px;margin:auto;padding:10px}h1{margin:10px 0 15px;font-size:18px}</style>' +
  '<main><h1>CL Control · Anteprima con dati simulati</h1></main></html>';

async function main() {
  await mkdir(output, { recursive:true });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport:{width:390,height:900}, deviceScaleFactor:2 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('http://security-preview.local/**', route => {
      const file = new URL(route.request().url()).pathname.slice(1);
      if (['cl-control-security-card.mjs','cl-control-glass.mjs'].includes(file)) {
        return route.fulfill({contentType:'text/javascript',path:path.join(assets,file)});
      }
      return route.fulfill({contentType:'text/html',body:html});
    });
    await page.goto('http://security-preview.local/security');
    await page.evaluate(async iconPaths => {
      customElements.define('ha-card', class extends HTMLElement {
        connectedCallback() { this.style.display = 'block'; }
      });
      customElements.define('ha-icon', class extends HTMLElement {
        static observedAttributes = ['icon'];
        attributeChangedCallback() {
          this.style.cssText = 'display:inline-flex;width:var(--mdc-icon-size,20px);height:var(--mdc-icon-size,20px)';
          this.innerHTML = '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor" aria-hidden="true"><path d="' +
            (iconPaths[this.getAttribute('icon')] || '') + '"/></svg>';
        }
      });
      await import('/cl-control-security-card.mjs');
      const inim = (id,name) => ({entity_id:'select.'+id,name,platform:'inim',area_name:'Casa',area_id:'home'});
      window.config = {
        title:'Sicurezza',pin_configured:true,group_by_floor:false,
        panels:[{entity_id:'alarm_control_panel.perimetro',name:'Perimetro',platform:'risco',area_name:'Casa',area_id:'home'}],
        partitions:[inim('esterno','Esterno'),inim('interno','Interno'),inim('finestre','Finestre'),inim('garage','Garage')],
        zones:[{entity_id:'binary_sensor.porta',name:'Porta ingresso',area_name:'Casa',area_id:'home',device_class:'door'}],
      };
      const options = ['ARM_AWAY','ARM_STAY','ARM_INSTANT','DISARMED'];
      window.calls = [];
      window.hass = {
        user:{id:'preview-a'},
        states:{
          'alarm_control_panel.perimetro':{state:'disarmed',attributes:{supported_features:3}},
          'select.esterno':{state:'ARM_AWAY',attributes:{options}},
          'select.interno':{state:'DISARMED',attributes:{options}},
          'select.finestre':{state:'ARM_STAY',attributes:{options}},
          'select.garage':{state:'unavailable',attributes:{options:['ARM_AWAY','DISARMED']}},
          'binary_sensor.porta':{state:'on',attributes:{}},
        },
        callWS: async payload => { calls.push(payload); },
      };
      window.mount = () => {
        const card = document.createElement('cl-security-card');
        card.setConfig(config);
        card.hass = hass;
        document.querySelector('main').append(card);
        return card;
      };
      window.card = mount();
    }, icons);

    const card = page.locator('cl-security-card');
    const button = (id, mode) => card.locator('[data-partition-id="select.'+id+'"][data-partition-command="'+mode+'"]');
    const active = id => card.locator('.quickLock[data-partition-id="select.'+id+'"][data-current="true"]');
    assert.equal(await active('esterno').getAttribute('data-partition-command'),'ARM_AWAY');
    assert.equal(await active('finestre').getAttribute('data-partition-command'),'ARM_STAY');
    assert.match(await card.locator('.securityIdentity').filter({hasText:'Finestre'}).innerText(),/Parziale/);
    assert.equal(await button('garage','ARM_STAY').count(),0);
    assert.ok(await button('garage','DISARMED').isDisabled());
    assert.equal(await button('esterno','ARM_INSTANT').isVisible(),false);
    assert.equal(await card.locator('[data-panel-command="arm_night"]').count(),0);
    await card.locator('[data-panel-command="arm_away"]').click();
    assert.match(await card.locator('.dialog').innerText(),/Perimetro · Inserisci totale/);
    assert.equal(await page.evaluate(()=>calls.length),0);
    await card.locator('#dialogCancel').click();
    for (const width of [320,390,780]) {
      await page.setViewportSize({width,height:900});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow '+width);
      assert.ok(await active('esterno').evaluate(el=>el.offsetWidth>=44&&el.offsetHeight>=44&&el.querySelector('.lockDisc').offsetWidth===32));
      await page.screenshot({path:path.join(output,'sicurezza-'+width+'.png'),fullPage:true});
    }
    await page.setViewportSize({width:390,height:900});
    await button('esterno','ARM_STAY').click();
    assert.match(await card.locator('.dialog').innerText(),/Esterno · Inserisci parziale/);
    assert.equal(await page.evaluate(()=>calls.length),0);
    await page.screenshot({path:path.join(output,'sicurezza-conferma-390.png'),fullPage:true});
    await card.locator('#dialogCancel').click();

    await button('esterno','ARM_STAY').click();
    await page.evaluate(()=>{hass.states['select.esterno'].attributes.options=['ARM_AWAY','DISARMED'];card.hass={...hass};});
    await card.locator('#pinInput').fill('1234');
    await card.getByRole('button',{name:'Conferma',exact:true}).click();
    assert.equal(await page.evaluate(()=>calls.length),0);
    await card.locator('#dialogClose').click();
    await page.evaluate(()=>{hass.states['select.esterno'].attributes.options=['ARM_AWAY','ARM_STAY','ARM_INSTANT','DISARMED'];card.hass={...hass};});

    await button('esterno','ARM_STAY').click();
    await card.locator('#pinInput').fill('1234');
    await card.getByRole('button',{name:'Conferma',exact:true}).click();
    assert.deepEqual(await page.evaluate(()=>calls),[
      {type:'cl_control/security/partition_command',mode:'ARM_STAY',entity_ids:['select.esterno'],pin:'1234'},
    ]);
    await card.locator('.securityIdentity').filter({hasText:'Esterno'}).getByText(/In attesa/).waitFor();
    assert.equal(await active('esterno').getAttribute('data-partition-command'),'ARM_AWAY');
    await page.evaluate(()=>{hass.states['select.esterno'].state='ARM_STAY';card.hass={...hass};});
    assert.equal(await active('esterno').getAttribute('data-partition-command'),'ARM_STAY');

    const counts = await card.locator('.summaryGrid').innerText();
    await card.getByRole('button',{name:'Partizioni visibili'}).click();
    await card.getByRole('checkbox',{name:'Garage'}).uncheck();
    await page.screenshot({path:path.join(output,'sicurezza-partizioni-visibili-390.png'),fullPage:true});
    await card.getByRole('button',{name:'Applica'}).click();
    assert.equal(await button('garage','DISARMED').count(),0);
    assert.equal(await card.locator('.summaryGrid').innerText(),counts);
    assert.match(await card.locator('.visibleCount').innerText(),/4 di 5/);
    await page.evaluate(()=>{card.remove();window.card=mount();});
    assert.equal(await button('garage','DISARMED').count(),0);
    await page.evaluate(()=>{card.hass={...hass,user:{id:'preview-b'}};});
    assert.equal(await button('garage','DISARMED').count(),1);
    assert.deepEqual(errors,[]);
  } finally {
    await browser.close();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});

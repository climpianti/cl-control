const assert = require('node:assert/strict');
const { mkdir } = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const mdi = require('@mdi/js');

const assets = path.resolve('custom_components/cl_control/frontend');
const output = path.resolve('test-artifacts/beta46-preview');
const icons = {
  'mdi:shield-home-outline':mdi.mdiShieldHomeOutline, 'mdi:shield-off-outline':mdi.mdiShieldOffOutline,
  'mdi:shield-check-outline':mdi.mdiShieldCheckOutline, 'mdi:smoke-detector':mdi.mdiSmokeDetector,
  'mdi:door-closed':mdi.mdiDoorClosed, 'mdi:motion-sensor':mdi.mdiMotionSensor,
  'mdi:alert-outline':mdi.mdiAlertOutline, 'mdi:check':mdi.mdiCheck, 'mdi:lan-disconnect':mdi.mdiLanDisconnect,
};
const html = '<!doctype html><html lang="it"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<style>body{background:#eef3f9;color:#173048;margin:0;font:15px system-ui}main{max-width:630px;margin:auto;padding:10px}h1{margin:10px 0 15px;font-size:18px}</style>' +
  '<main><h1>CL Control · Anteprima con dati simulati</h1></main></html>';

async function main() {
  await mkdir(output,{recursive:true});
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({viewport:{width:390,height:860},deviceScaleFactor:2});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('http://zones-preview.local/**',route => {
      const file = new URL(route.request().url()).pathname.slice(1);
      return ['cl-control-security-card.mjs','cl-control-glass.mjs'].includes(file)
        ? route.fulfill({contentType:'text/javascript',path:path.join(assets,file)})
        : route.fulfill({contentType:'text/html',body:html});
    });
    await page.goto('http://zones-preview.local/');
    await page.evaluate(async paths => {
      customElements.define('ha-card',class extends HTMLElement {
        connectedCallback() { this.style.display = 'block'; }
      });
      customElements.define('ha-icon',class extends HTMLElement {
        static observedAttributes = ['icon'];
        attributeChangedCallback() {
          this.style.cssText = 'display:inline-flex;width:var(--mdc-icon-size,20px);height:var(--mdc-icon-size,20px)';
          this.innerHTML = '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor" aria-hidden="true"><path d="' +
            (paths[this.getAttribute('icon')] || '') + '"/></svg>';
        }
      });
      await import('/cl-control-security-card.mjs');
      const info = (id,name,type,area,bypass='',pin=false) => ({
        entity_id:'binary_sensor.'+id,name,device_class:type,area_id:area.toLowerCase(),area_name:area,
        bypass_entity_id:bypass,bypass_requires_pin:pin,
      });
      const zones = [
        info('fumo','Fumo','smoke','Cucina','switch.mock_smoke',true),
        info('porta','Porta cucina','door','Cucina','switch.mock_door',true),
        info('movimento','Movimento','motion','Cucina'),
        info('garage','Contatto garage','door','Esterno','switch.mock_garage'),
        info('laterale','Ingresso laterale','door','Esterno'),
      ];
      window.fixtureCalls = [];
      window.fixtureFail = false;
      window.hass = {
        user:{id:'preview'}, states:Object.fromEntries(Object.entries({
          'binary_sensor.fumo':'off','binary_sensor.porta':'on','binary_sensor.movimento':'off',
          'binary_sensor.garage':'off','binary_sensor.laterale':'unavailable',
          'switch.mock_smoke':'off','switch.mock_door':'off','switch.mock_garage':'on',
        }).map(([id,state])=>[id,{state,attributes:{}}])),
        callWS: async payload => {
          fixtureCalls.push(payload);
          if (fixtureFail) throw {code:'state_not_confirmed'};
          return {confirmed:true};
        },
      };
      window.card = document.createElement('cl-security-card');
      card.setConfig({title:'Sicurezza',zones,pin_configured:true,group_by_floor:false});
      card.hass = hass;
      document.querySelector('main').append(card);
    },icons);

    const card = page.locator('cl-security-card');
    const row = id => card.locator('[data-zone-id="binary_sensor.' + id + '"]');
    const action = id => row(id).locator('.zoneAction');
    const status = id => row(id).locator('.zoneBadge');
    const attention = card.locator('[data-zone-filter="attention"]');
    const all = card.locator('[data-zone-filter="all"]');
    const dialog = card.locator('[role="dialog"]');
    const confirm = dialog.getByRole('button',{name:'Conferma',exact:true});
    assert.equal(await row('fumo').isVisible(),true);
    assert.equal(await status('fumo').innerText(),'Regolare');
    assert.equal(await status('porta').innerText(),'Aperta');
    assert.equal(await action('movimento').count(),0);
    assert.equal(await attention.innerText(),'Da verificare · 3');
    await page.screenshot({path:path.join(output,'zone-tutte-390.png'),fullPage:true});
    await attention.click();
    assert.equal(await row('movimento').count(),0);
    assert.equal(await status('garage').innerText(),'Esclusa');
    assert.equal(await status('laterale').innerText(),'Non disponibile');
    assert.equal(await card.locator('.zoneArea[open]').count(),2);

    for (const width of [320,390,780]) {
      await page.setViewportSize({width,height:860});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow '+width);
      assert.ok(await action('garage').evaluate(node=>node.offsetWidth>=44&&node.offsetHeight>=44&&node.querySelector('.zoneDisc').offsetWidth===30));
      await page.screenshot({path:path.join(output,'zone-da-verificare-'+width+'.png'),fullPage:true});
    }
    await page.setViewportSize({width:390,height:860});
    await action('porta').click();
    assert.match(await dialog.innerText(),/Escludi · Porta cucina/);
    assert.ok(await dialog.locator('#pinInput').isVisible());
    assert.equal(await page.evaluate(()=>fixtureCalls.length),0);
    await page.screenshot({path:path.join(output,'zone-conferma-390.png'),fullPage:true});
    await dialog.locator('#dialogCancel').click();

    await action('porta').click();
    await dialog.locator('#pinInput').fill('1234');
    await confirm.click();
    assert.deepEqual(await page.evaluate(()=>fixtureCalls),[{
      type:'cl_control/security/zone_exclusion',zone_entity_id:'binary_sensor.porta',
      entity_id:'switch.mock_door',excluded:true,pin:'1234',
    }]);
    assert.equal(await status('porta').innerText(),'Aperta');
    await page.evaluate(()=>{hass.states['switch.mock_door'].state='on';card.hass={...hass};});
    assert.equal(await status('porta').innerText(),'Esclusa');
    assert.match(await action('porta').getAttribute('aria-label'),/Reincludi/);

    await action('garage').click();
    assert.match(await dialog.innerText(),/Reincludi · Contatto garage/);
    assert.equal(await dialog.locator('#pinInput').count(),0);
    await page.evaluate(()=>{hass.states['switch.mock_garage'].state='off';card.hass={...hass};});
    await confirm.click();
    assert.equal(await page.evaluate(()=>fixtureCalls.length),1);
    assert.match(await card.locator('.zoneSection [role="status"]').innerText(),/Stato cambiato/);
    await page.evaluate(()=>{hass.states['switch.mock_garage'].state='on';fixtureFail=true;card.hass={...hass};});
    await action('garage').click();
    await confirm.click();
    const calls = await page.evaluate(()=>fixtureCalls);
    assert.deepEqual(calls.at(-1),{type:'cl_control/security/zone_exclusion',zone_entity_id:'binary_sensor.garage',entity_id:'switch.mock_garage',excluded:false});
    assert.match(await card.locator('.zoneSection [role="status"]').innerText(),/non ha confermato/);
    assert.equal(await status('garage').innerText(),'Esclusa');

    await all.click();
    assert.equal(await row('garage').isVisible(),false,'attention filter must not reset expanded areas');
    await page.evaluate(()=>{hass.states['binary_sensor.porta'].state='on';hass.states['switch.mock_door'].state='unavailable';card.hass={...hass};});
    assert.equal(await status('porta').innerText(),'Aperta');
    assert.ok(await action('porta').isDisabled());
    assert.deepEqual(errors,[]);
  } finally {
    await browser.close();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});

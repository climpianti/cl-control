const assert = require('node:assert/strict');
const { mkdir } = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const { mdiFlash, mdiPowerSocketEu, mdiPower, mdiHome, mdiGestureTap, mdiGate } = require('@mdi/js');

const assets = path.resolve('custom_components/cl_control/frontend');
const iconPaths = {
  'mdi:flash': mdiFlash, 'mdi:power-socket-eu': mdiPowerSocketEu, 'mdi:power': mdiPower,
  'mdi:home': mdiHome, 'mdi:gesture-tap': mdiGestureTap, 'mdi:gate': mdiGate,
};
const html = `<!doctype html><html lang="it"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>CL Control · Blue Tech Glass</title>
<style>
  body{margin:0;background:#f3f6fb;color:#142437;font:15px Roboto,Arial,sans-serif}
  main{max-width:830px;margin:auto;padding:16px;display:grid;gap:12px}
  h1,h2{margin:0;color:#15283e}h1{font-size:22px}h2{font-size:16px;margin-top:5px}
  .pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
  .devices{display:grid;gap:10px}
</style>
<main><h1>CL Control</h1><h2>Aree e potenza</h2><div id="areas" class="pair"></div>
<h2>Sistemi</h2><div id="systems" class="pair"></div>
<h2>Dispositivi</h2><div id="devices" class="devices"></div></main></html>`;

async function main() {
  const output = path.resolve('test-artifacts/beta44-preview');
  await mkdir(output, { recursive: true });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 960 }, deviceScaleFactor: 2 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('http://preview.local/**', route => {
      const file = new URL(route.request().url()).pathname.slice(1);
      if (/^cl-control-[a-z0-9-]+\.mjs$/.test(file)) {
        return route.fulfill({ contentType: 'text/javascript', path: path.join(assets, file) });
      }
      return route.fulfill({ contentType: 'text/html', body: html });
    });
    await page.goto('http://preview.local/cl-control/home');
    const result = await page.evaluate(async (paths) => {
      customElements.define('ha-icon', class extends HTMLElement {
        static observedAttributes = ['icon'];
        attributeChangedCallback() {
          this.style.display = 'inline-flex';
          this.style.width = 'var(--mdc-icon-size, 20px)';
          this.style.height = 'var(--mdc-icon-size, 20px)';
          this.innerHTML = '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor"><path d="' +
            (paths[this.getAttribute('icon')] || '') + '"/></svg>';
        }
      });
      customElements.define('ha-card', class extends HTMLElement {
        constructor() {
          super();
          this.attachShadow({ mode:'open' }).innerHTML =
            '<style>:host{display:block;box-sizing:border-box;background:var(--ha-card-background);border:var(--ha-card-border-width,1px) solid var(--ha-card-border-color);border-radius:var(--ha-card-border-radius);box-shadow:var(--ha-card-box-shadow);color:var(--primary-text-color)}</style><slot></slot>';
        }
      });
      const { CLControlDashboardStrategy } = await import('/cl-control-dashboard-strategy.mjs');
      const grid = { columns: 6, rows: 1 };
      const status = { type:'tile', entity:'sensor.area_power', name:'Potenza area', icon:'mdi:flash',
        color:'#ffd075', tap_action:{action:'more-info'} };
      const surface = { type:'custom:cl-control-home-surface', card:status, grid_options:grid };
      const hass = {
        states: {
          'sensor.area_power': { state:'61.2', attributes:{unit_of_measurement:'W'} },
          'sensor.light_power': { state:'19.2', attributes:{unit_of_measurement:'W'} },
          'sensor.outlet_power': { state:'42', attributes:{unit_of_measurement:'W'} },
          'light.example': { state:'on', attributes:{supported_color_modes:['onoff']} },
          'switch.example': { state:'on', attributes:{device_class:'outlet'} },
          'cover.example': { state:'closed', attributes:{current_position:0} },
        },
        callWS: async ({type}) => type==='cl_control/dashboard/native_config'
          ? { config:{ views:[{ sections:[{ cards:[surface] }] }] }, model:{favorites:[]} } : {items:[]},
      };
      window.loadCardHelpers = async () => ({
        createCardElement(config) {
          const renderer = document.createElement('div');
          const tile = document.createElement('ha-card');
          tile.style.cssText = 'padding:12px;min-height:63px;display:flex;gap:8px;align-items:center';
          const icon = document.createElement('ha-icon');
          icon.setAttribute('icon', config.icon);
          icon.style.color = config.color;
          tile.append(icon);
          const label = document.createElement('span');
          label.textContent = config.name;
          const value = document.createElement('strong');
          value.style.display = 'block';
          value.textContent = '61,2 W';
          label.append(value);
          tile.append(label);
          renderer.append(tile);
          return renderer;
        },
      });
      function mount(slot, tag, config) {
        const card = document.createElement(tag);
        card.setConfig(config);
        card.hass = hass;
        document.querySelector(slot).append(card);
        return card;
      }
      const rendered = await CLControlDashboardStrategy.generate({}, hass);
      const wrapped = rendered.views[0].sections[0].cards[0];
      const area = mount('#areas','cl-control-area-pro-card',{
        area:'cucina',name:'Cucina',icon:'mdi:home',navigation_path:'area-cucina',
        telemetry:{power:['sensor.area_power']},
      });
      const native = mount('#areas','cl-control-home-surface',wrapped);
      const system = mount('#systems','cl-control-system-card',{module:'lights',name:'Luci',entities:['light.example'],path:'lights'});
      mount('#systems','cl-control-system-card',{module:'covers',name:'Aperture',entities:['cover.example'],path:'covers'});
      const light = mount('#devices','cl-control-light-memories-card',{entity:'light.example',name:'Faretti cucina',power_entity:'sensor.light_power'});
      const outlet = mount('#devices','cl-control-switch-glass-card',{entity:'switch.example',name:'Presa studio',power_entity:'sensor.outlet_power'});
      await new Promise(resolve=>requestAnimationFrame(resolve));
      const icons = [
        area.shadowRoot.querySelector('.metric[data-kind=power] ha-icon'),
        native.shadowRoot.querySelector('#native ha-icon'),
        light.shadowRoot.querySelector('.cl-power-symbol'),
        outlet.shadowRoot.querySelector('.cl-power-symbol'),
      ];
      const shells = [
        area.shadowRoot.querySelector('.card'),
        native.shadowRoot.querySelector('#native ha-card'),
        system.shadowRoot.querySelector('.tile'),
        light.shadowRoot.querySelector('ha-card'),
        outlet.shadowRoot.querySelector('ha-card'),
      ];
      return {
        icons:icons.map(icon=>[icon.getAttribute('icon'),getComputedStyle(icon).color]),
        backgrounds:shells.map(shell=>getComputedStyle(shell).backgroundClip),
        borders:shells.map(shell=>getComputedStyle(shell).borderTopColor),
        grid:wrapped.grid_options, existingAction:wrapped.card.tap_action,
      };
    }, iconPaths);
    assert.deepEqual(result.icons,Array(4).fill(['mdi:flash','rgb(255, 208, 117)']));
    assert.ok(result.backgrounds.every(clip=>clip==='padding-box, padding-box, padding-box, border-box'), result.backgrounds);
    assert.ok(result.borders.every(color=>color==='rgba(0, 0, 0, 0)'),result.borders);
    assert.deepEqual(result.grid,{columns:6,rows:1});
    assert.deepEqual(result.existingAction,{action:'more-info'});
    for (const width of [320,390,820]) {
      await page.setViewportSize({width,height:900});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth), 'overflow at '+width);
      await page.screenshot({path:path.join(output,'shared-glass-'+width+'.png'),fullPage:true});
    }
    assert.deepEqual(errors,[]);
  } finally {
    await browser.close();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});

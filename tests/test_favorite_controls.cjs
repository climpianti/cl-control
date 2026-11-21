// Browser regression and preview for the real favorites, switch and command cards.
const assert = require('node:assert/strict');
const { mkdir } = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const { mdiGate, mdiGestureTap, mdiPower, mdiPowerSocketEu, mdiStar, mdiToggleSwitchOutline } = require('@mdi/js');

const frontend = path.resolve('custom_components/cl_control/frontend');
const modules = new Set([
  'cl-control-home-favorites-card.mjs', 'cl-control-command-glass-card.mjs',
  'cl-control-switch-glass-card.mjs', 'cl-control-power-badge.mjs',
]);
const iconPaths = {
  'mdi:gate': mdiGate, 'mdi:gesture-tap': mdiGestureTap, 'mdi:power': mdiPower,
  'mdi:power-socket-eu': mdiPowerSocketEu, 'mdi:star': mdiStar,
  'mdi:toggle-switch-outline': mdiToggleSwitchOutline,
};
const pageHtml = `<!doctype html><html lang="it"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CL Control</title>
<style>
  body{margin:0;background:radial-gradient(ellipse at top left,#163959,#0c1423 58%);color:#f4f8ff;font:15px Roboto,Arial,sans-serif}
  header{padding:14px 16px;background:#12304b;border-bottom:1px solid #70a7cf66;font-size:20px}
  main{max-width:430px;margin:auto;padding:12px}
  h2{font-size:19px;margin:24px 0 12px}
</style>
<header>CL Control</header><main><div id="favorites"></div><h2>Prese e interruttori</h2><div id="devices"></div></main>
<script type="module">
  import '/cl-control-home-favorites-card.mjs';
  import '/cl-control-command-glass-card.mjs';
  import '/cl-control-switch-glass-card.mjs';
</script></html>`;

async function main() {
  const out = path.resolve(process.env.CL_TEST_ARTIFACTS || 'test-artifacts', 'beta44-preview');
  await mkdir(out, { recursive: true });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 850 }, deviceScaleFactor: 2 });
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.route('http://preview.local/**', route => {
      const file = new URL(route.request().url()).pathname.slice(1);
      return modules.has(file)
        ? route.fulfill({ contentType: 'text/javascript', path: path.join(frontend, file) })
        : route.fulfill({ contentType: 'text/html', body: pageHtml });
    });
    await page.goto('http://preview.local/cl-control/home');
    await page.evaluate(async paths => {
      customElements.define('ha-icon', class extends HTMLElement {
        static observedAttributes = ['icon'];
        attributeChangedCallback() {
          this.style.display = 'inline-flex';
          this.style.width = 'var(--mdc-icon-size, 20px)';
          this.style.height = 'var(--mdc-icon-size, 20px)';
          this.innerHTML = '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor" aria-hidden="true"><path d="' +
            (paths[this.getAttribute('icon')] || '') + '"/></svg>';
        }
      });
      await customElements.whenDefined('cl-control-home-favorites-card');
      window.serviceCalls = [];
      const entities = [
        { entity_id: 'button.mock_gate', name: 'Apri cancello', domain: 'button' },
        { entity_id: 'switch.mock_socket', name: 'Presa cucina', domain: 'switch', module: 'outlets' },
      ];
      const hass = {
        states: {
          'button.mock_gate': { state: 'unknown', attributes: {} },
          'switch.mock_socket': { state: 'off', attributes: { device_class: 'outlet' } },
          'switch.mock_metered': { state: 'on', attributes: { device_class: 'outlet' } },
          'switch.mock_relay': { state: 'off', attributes: {} },
          'sensor.mock_power': { state: '42.5', attributes: { unit_of_measurement: 'W' } },
        },
        callWS: async () => ({ model: { favorites: entities } }),
        callService: async (...args) => window.serviceCalls.push(args),
      };
      window.loadCardHelpers = async () => ({
        createCardElement(config) {
          const card = document.createElement(config.type.replace(/^custom:/, ''));
          card.setConfig(config);
          return card;
        },
      });
      const favorites = document.createElement('cl-control-home-favorites-card');
      favorites.setConfig({});
      favorites.hass = hass;
      document.querySelector('#favorites').append(favorites);
      for (const config of [
        { entity: 'switch.mock_metered', name: 'Presa studio', power_entity: 'sensor.mock_power', icon: 'mdi:power-socket-eu' },
        { entity: 'switch.mock_relay', name: 'Interruttore ripostiglio' },
      ]) {
        const card = document.createElement('cl-control-switch-glass-card');
        card.setConfig(config);
        card.hass = hass;
        document.querySelector('#devices').append(card);
      }
    }, iconPaths);

    const favorite = page.locator('cl-control-home-favorites-card');
    const gate = favorite.locator('cl-control-command-glass-card');
    const outlet = favorite.locator('cl-control-switch-glass-card');
    const gateButton = gate.getByRole('button', { name: 'Esegui Apri cancello' });
    await gateButton.waitFor();
    assert.equal(await gate.locator('.device ha-icon').getAttribute('icon'), 'mdi:gate');
    assert.equal(await outlet.locator('.device ha-icon').getAttribute('icon'), 'mdi:power-socket-eu');
    assert.equal(await outlet.locator('.cl-power-meter').count(), 0);
    assert.match(await page.locator('#devices .cl-power-meter').innerText(), /42[,.]5\s*W/);
    page.once('dialog', dialog => dialog.dismiss());
    await gateButton.click();
    assert.deepEqual(await page.evaluate(() => window.serviceCalls), []);
    page.once('dialog', dialog => dialog.accept());
    await gateButton.click();
    assert.deepEqual(await page.evaluate(() => window.serviceCalls), [
      ['button', 'press', { entity_id: 'button.mock_gate' }],
    ]);

    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 850 });
      const sizes = await page.locator('cl-control-command-glass-card, cl-control-switch-glass-card').evaluateAll(cards => cards.map(card => {
        const shell = card.shadowRoot.querySelector('ha-card');
        return shell.scrollWidth <= shell.clientWidth + 1;
      }));
      assert.equal(sizes.length, 4);
      assert.ok(sizes.every(Boolean), 'Card content overflows at ' + width);
      await page.screenshot({ path: path.join(out, 'favorite-controls-' + width + '.png'), fullPage: true });
    }
    assert.deepEqual(pageErrors, []);
  } finally {
    await browser.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

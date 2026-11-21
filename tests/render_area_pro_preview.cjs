// Render the shipped card in Chromium with sample photos and sensor states.
const { mkdir } = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const icons = require('@mdi/js');

const rooms = [
  ['Esterno', 'mdi:tree', '1600596542815-ffad4c1539a9', 18.9, 63.2, 412, 635.5],
  ['Cucina', 'mdi:pot-steam', '1600607687920-4e2a09cf159d', 20.2, 52.6, 445, 0],
  ['Living', 'mdi:sofa-outline', '1600210492486-724fe5c67fb0', 20.7, 58.8, 432, 0],
  ['Camera da letto', 'mdi:bed', '1616594039964-ae9021a400a0', 19.9, 57.2, 448, 0],
  ['Bagno', 'mdi:toilet', '1620626011761-996317b8d101', 19.5, 54.7, 438, 0],
  ['Bagno Ospiti', 'mdi:human-male-female', '1584622650111-993a426fbf0a', 20, 56.2, 430, 0],
];
const iconNames = [
  ...rooms.map(room => room[1]), 'mdi:home', 'mdi:thermometer',
  'mdi:water-percent', 'mdi:molecule-co2', 'mdi:flash',
];
const iconPaths = Object.fromEntries(iconNames.map(name => [
  name, icons['mdi' + name.slice(4).replace(/(^|-)([a-z])/g, (_, separator, letter) => letter.toUpperCase())],
]));

async function samplePhoto(photoId) {
  try {
    const response = await fetch('https://images.unsplash.com/photo-' + photoId + '?fit=crop&w=480&h=270&q=78&fm=jpg', {
      signal: AbortSignal.timeout(8000),
    });
    if (response.ok && response.headers.get('content-type')?.startsWith('image/')) {
      return 'data:image/jpeg;base64,' + Buffer.from(await response.arrayBuffer()).toString('base64');
    }
  } catch {
    // The preview can still render if sample photos are temporarily unreachable.
  }
  return 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 270"><rect width="480" height="270" fill="#223a52"/><text x="240" y="140" text-anchor="middle" fill="#d6e6f8" font-size="24" font-family="sans-serif">Foto di esempio</text></svg>',
  );
}

async function main() {
  const output = path.resolve(process.env.CL_TEST_ARTIFACTS || 'test-artifacts', 'beta42-preview');
  await mkdir(output, { recursive: true });
  const photos = await Promise.all(rooms.map(room => samplePhoto(room[2])));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 720 }, deviceScaleFactor: 2 });
    await page.route('http://preview.local/**', async route => {
      if (route.request().url().endsWith('/area-card.mjs')) {
        await route.fulfill({
          contentType: 'text/javascript',
          path: 'custom_components/cl_control/frontend/cl-control-area-pro-card.mjs',
        });
      } else {
        await route.fulfill({ contentType: 'text/html', body: `<!doctype html>
<html lang="it"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>CL Control Area Pro</title>
<style>
 *{box-sizing:border-box}
 body{margin:0;color:#f3f8ff;font:14px Roboto,Arial,sans-serif;background:
   radial-gradient(ellipse at 25% 15%,#15426c,transparent 55%),
   linear-gradient(125deg,#0b1725,#0c1424 65%,#16162a)}
 header{display:flex;align-items:center;gap:18px;padding:13px 16px;font-size:20px;
   border-bottom:1px solid #69beff85;background:linear-gradient(112deg,#12527b80,#171834)}
 .more{margin-left:auto}
 main{padding:9px}
 h1{font-size:15px;font-weight:600;margin:2px 4px 10px;display:flex;align-items:center;gap:8px}
 .rooms{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;align-items:start}
</style>
<header><span aria-hidden="true">☰</span> Home <span class="more" aria-hidden="true">⋮</span></header>
<main><h1><ha-icon icon="mdi:home"></ha-icon> My Home</h1><div class="rooms"></div></main>
<script type="module" src="/area-card.mjs"></script></html>` });
      }
    });
    await page.goto('http://preview.local/cl-control/home');
    await page.evaluate(async ({ rooms, photos, iconPaths }) => {
      customElements.define('ha-icon', class extends HTMLElement {
        static observedAttributes = ['icon'];
        attributeChangedCallback() {
          this.style.display = 'inline-flex';
          this.style.width = 'var(--mdc-icon-size, 18px)';
          this.style.height = 'var(--mdc-icon-size, 18px)';
          this.innerHTML = '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor" aria-hidden="true"><path d="' +
            (iconPaths[this.getAttribute('icon')] || '') + '"/></svg>';
        }
      });
      await customElements.whenDefined('cl-control-area-pro-card');
      const kinds = ['temperature', 'humidity', 'carbon_dioxide', 'power'];
      const units = ['°C', '%', 'ppm', 'W'];
      const grid = document.querySelector('.rooms');
      rooms.forEach(([name, icon, , ...values], index) => {
        const telemetry = {};
        const states = {};
        kinds.forEach((kind, kindIndex) => {
          const id = 'sensor.' + kind;
          telemetry[kind] = [id];
          states[id] = { state: String(values[kindIndex]), attributes: { unit_of_measurement: units[kindIndex] } };
        });
        const card = document.createElement('cl-control-area-pro-card');
        card.setConfig({ area: 'area-' + index, name, icon, picture: photos[index], navigation_path: 'area-' + index, telemetry });
        card.hass = { states };
        grid.append(card);
      });
    }, { rooms, photos, iconPaths });
    await page.evaluate(async () => {
      const cards = [...document.querySelectorAll('cl-control-area-pro-card')];
      await Promise.all(cards.map(card => card.shadowRoot.querySelector('img').decode()));
    });

    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 720 });
      await page.screenshot({ path: path.join(output, 'area-pro-' + width + '.png'), fullPage: true });
    }
  } finally {
    await browser.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

import assert from 'node:assert/strict';

const { chromium } = await import(process.env.CL_PLAYWRIGHT_URL || 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.CL_CHROME_PATH ? { executablePath: process.env.CL_CHROME_PATH } : {}) });

for (const viewport of [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 768, height: 1024 }, { width: 1200, height: 900 }, { width: 1920, height: 1080 }]) {
  const page = await browser.newPage({ viewport, hasTouch: viewport.width < 768 });
  await page.goto('http://127.0.0.1:8765/tests/ui3-harness.html', { waitUntil: 'networkidle' });
  const panel = page.locator('cl-control-panel');
  assert.match(await panel.locator('[data-layout-module="environment"]').textContent(), /Aria buona/);
  await panel.locator('[data-page="lights"]').click();
  await panel.locator('[data-light-controls]').first().click();
  const dialog = panel.locator('.dialog');
  const dialogBox = await dialog.boundingBox();
  assert.ok(dialogBox && dialogBox.x >= 0 && dialogBox.y >= 0);
  assert.ok(dialogBox.x + dialogBox.width <= viewport.width + 1);
  assert.ok(dialogBox.y + dialogBox.height <= viewport.height + 1);

  const wheel = panel.locator('[data-color-wheel]');
  const box = await wheel.boundingBox();
  assert.ok(box);
  const pointForHue = hue => {
    const radians = (hue - 90) * Math.PI / 180;
    return { x: box.x + box.width / 2 + box.width * 0.4 * Math.cos(radians), y: box.y + box.height / 2 + box.height * 0.4 * Math.sin(radians) };
  };
  for (const expected of [0, 120, 240]) {
    const point = pointForHue(expected);
    await page.mouse.click(point.x, point.y);
    assert.equal(Number(await panel.locator('[name="hue"]').inputValue()), expected);
  }
  const red = pointForHue(0), green = pointForHue(120);
  await page.mouse.move(red.x, red.y);
  await page.mouse.down();
  await page.mouse.move(green.x, green.y, { steps: 6 });
  await page.mouse.up();
  assert.equal(Number(await panel.locator('[name="hue"]').inputValue()), 120);
  await panel.locator('[data-hue-preset="35"]').click();
  assert.equal(Number(await panel.locator('[name="hue"]').inputValue()), 35);
  await panel.evaluate(element => {
    window.__clServiceCalls = [];
    element.hass.callService = async (...args) => window.__clServiceCalls.push(args);
  });
  const brightness=panel.locator('[name="brightness"]'),brightnessBox=await brightness.boundingBox(),initialBrightness=await brightness.inputValue();assert.ok(brightnessBox);
  await page.mouse.click(brightnessBox.x+brightnessBox.width*.85,brightnessBox.y+brightnessBox.height/2);assert.equal(await brightness.inputValue(),initialBrightness,'brightness track tap must not change value');
  await page.mouse.move(brightnessBox.x+brightnessBox.width*.45,brightnessBox.y+brightnessBox.height/2);await page.mouse.down();await page.mouse.move(brightnessBox.x+brightnessBox.width*.75,brightnessBox.y+brightnessBox.height/2+2,{steps:4});await page.mouse.up();assert.notEqual(await brightness.inputValue(),initialBrightness,'intentional brightness drag must update local preview');
  assert.equal(await page.evaluate(()=>window.__clServiceCalls.length),0,'brightness drag must not call HA before Apply');
  await panel.locator('#clDialogForm .primary').click();
  const serviceCall = await page.evaluate(() => window.__clServiceCalls.at(-1));
  assert.equal(serviceCall[0], 'light');
  assert.equal(serviceCall[1], 'turn_on');
  assert.deepEqual(serviceCall[2].rgb_color, [255, 149, 0]);

  await panel.locator('[data-page="climate"]').click();
  assert.equal(await panel.locator('[data-environment-entity]').count(), 4);
  assert.equal(await panel.locator('[data-environment-entity="sensor.qualita_aria_incerta"]').count(), 0);
  assert.match(await panel.locator('.environmentSection').textContent(), /CO2 salone/);
  assert.match(await panel.locator('.environmentSection').textContent(), /PM2.5 camera/);
  assert.doesNotMatch(await panel.locator('.environmentSection').textContent(), /sensor\./);

  await panel.locator('[data-page="covers"]').click();
  const coverSlider = panel.locator('[data-cover-position]').first();
  const coverBox = await coverSlider.boundingBox();
  assert.ok(coverBox);
  await panel.evaluate(element => { window.__clServiceCalls = []; element.hass.callService = async (...args) => window.__clServiceCalls.push(args); });
  await page.mouse.click(coverBox.x + coverBox.width * .8, coverBox.y + coverBox.height / 2);
  assert.equal(await page.evaluate(() => window.__clServiceCalls.length), 0, 'track tap must not command a cover');
  await page.mouse.move(coverBox.x + coverBox.width * .5, coverBox.y + coverBox.height / 2);await page.mouse.down();await page.mouse.move(coverBox.x + coverBox.width * .52, coverBox.y + coverBox.height / 2 + 28);await page.mouse.up();
  assert.equal(await page.evaluate(() => window.__clServiceCalls.length), 0, 'vertical scroll gesture must not command a cover');
  await page.mouse.move(coverBox.x + coverBox.width * .35, coverBox.y + coverBox.height / 2);await page.mouse.down();await page.mouse.move(coverBox.x + coverBox.width * .7, coverBox.y + coverBox.height / 2 + 2, { steps: 4 });await page.mouse.up();
  const coverCalls = await page.evaluate(() => window.__clServiceCalls);
  assert.equal(coverCalls.length, 1, 'horizontal drag must emit exactly one cover command');
  assert.equal(coverCalls[0][1], 'set_cover_position');

  const installerNav = panel.locator('[data-page="more"]');
  if (await installerNav.isVisible()) await installerNav.click();
  else {
    await panel.locator('[data-page="overflow"]').click();
    await panel.locator('[data-overflow-open="more"]').click();
  }
  await panel.locator('#unlockInstaller').click();
  await panel.locator('#clPin').fill('1234');
  await panel.locator('#clDialogForm .primary').click();
  const sections = panel.locator('.installerSection');
  for (const index of [6, 7]) if (!(await sections.nth(index).getAttribute('open'))) await sections.nth(index).locator('summary').click();
  await panel.evaluate(element => { element.hass = { ...element.hass, states: { ...element.hass.states } }; });
  await page.waitForTimeout(50);
  assert.notEqual(await sections.nth(6).getAttribute('open'), null, 'Assistenza collapsed after state refresh');
  assert.notEqual(await sections.nth(7).getAttribute('open'), null, 'Diagnostica collapsed after state refresh');

  if (!(await sections.nth(3).getAttribute('open'))) await sections.nth(3).locator('summary').click();
  await sections.nth(3).locator('[data-layout-start]').click();
  await panel.locator('#clDialogForm .primary').click();
  assert.equal(await panel.locator('.layoutEditorBar').count(), 1);
  assert.match(await panel.locator('.layoutEditorIdentity').textContent(), /Stai modificando il layout/);
  const beforeCalls = await page.evaluate(() => window.__clServiceCalls.length);
  await panel.locator('[data-layout-id="home:module:lights"]').click({ position: { x: 8, y: 8 } });
  assert.equal(await page.evaluate(() => window.__clServiceCalls.length), beforeCalls, 'edit mode must not execute device commands');
  assert.match(await panel.locator('#clDialogTitle').textContent(), /Personalizza card/);
  await panel.locator('[data-dialog-cancel]').first().click();
  const dragHandle = panel.locator('#page-home .layoutDragHandle').first();
  const [dragBox,targetBox]=await panel.evaluate(element=>{const nodes=[element.shadowRoot.querySelector('#page-home .layoutDragHandle'),element.shadowRoot.querySelectorAll('#page-home [data-layout-id]')[1]];return nodes.map(node=>{const r=node?.getBoundingClientRect();return r&&r.width&&r.height?{x:r.x,y:r.y,width:r.width,height:r.height}:null;});});
  assert.ok(dragBox && targetBox);
  await page.mouse.move(dragBox.x + dragBox.width / 2, dragBox.y + dragBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 5 });
  await page.mouse.up();
  assert.match(await panel.locator('.layoutEditorStatus').textContent(), /non salvate/, 'pointer drag must update the draft');
  const keyboardBefore=await panel.evaluate(element=>element._layoutEditor.drafts.get('base:home').map(card=>card.id));await panel.locator(`#page-home [data-layout-drag="${keyboardBefore[0]}"]`).press('ArrowDown');const keyboardAfter=await panel.evaluate(element=>element._layoutEditor.drafts.get('base:home').map(card=>card.id));assert.notDeepEqual(keyboardAfter,keyboardBefore,'keyboard reorder must remain available');
  await panel.locator('[data-layout-id="home:status"]').click({ position: { x: 12, y: 55 } });
  await panel.locator('button[name="action"][value="down"]').click();
  assert.match(await panel.locator('.layoutEditorStatus').textContent(), /non salvate/);
  await panel.locator('.layoutOptions > summary').click();
  await panel.locator('[data-layout-device]').selectOption('mobile');
  const boxPreview = await panel.locator('#page-home').boundingBox();
  assert.ok(boxPreview && boxPreview.width <= Math.min(viewport.width, 390) + 2);
  await panel.locator('[data-layout-view-button="lights"]').click();
  assert.equal(await panel.locator('#page-lights.layoutEditing').count(), 1);
  const lightServiceCount = await page.evaluate(() => window.__clServiceCalls.length);
  assert.equal(await panel.locator('[data-toggle-light]').first().isDisabled(), true);
  await panel.locator('[data-toggle-light]').first().click({ force: true });
  assert.equal(await page.evaluate(() => window.__clServiceCalls.length), lightServiceCount, 'light commands must be disabled in edit mode');
  await panel.evaluate(element=>{const card=element.shadowRoot.querySelector('#page-lights [data-layout-edit-card]');element._editLayoutCard('lights',card.dataset.layoutEditCard);});
  await panel.locator('#clDialogTitle').waitFor();
  assert.equal(await panel.locator('[name="size"] option[value="xl"]').count(), 0, 'light cards must expose capability-safe sizes');
  await panel.locator('[data-dialog-cancel]').first().click();
  await panel.locator('#page-lights [data-layout-save]').click();
  const layoutSaves = await page.evaluate(() => window.__clWsCalls.filter(call => call.type === 'cl_control/layout/set'));
  assert.equal(layoutSaves.length, 2, 'save must persist the Home and Lights drafts only on explicit save');
  assert.equal(layoutSaves[0].context, 'base');
  assert.equal(layoutSaves[0].view, 'home');
  assert.ok(layoutSaves[0].cards['home:status']);
  assert.equal(layoutSaves[1].view, 'lights');
  assert.ok(Object.keys(layoutSaves[1].cards).some(id => id.startsWith('lights:entity:')));
  await panel.locator('#page-lights [data-layout-cancel]').click();
  assert.equal(await panel.locator('.layoutEditorBar').count(), 0);

  if (viewport.width === 390) {
    await panel.evaluate(element => { element._installerUnlocked = true; element._editEntity('sensor.qualita_aria_incerta'); });
    await panel.locator('input[name="alias"]').fill('Aria salone');
    await panel.evaluate(element => { const root=element.shadowRoot; root.querySelector('input[name="module"][value="environment"]').checked=true; root.querySelector('input[name="area"]').value='Zona giorno'; root.querySelector('input[name="type"][value="tecnico"]').checked=true; root.querySelector('input[name="subtype"][value="aqi"]').checked=true; root.querySelector('input[name="level"][value="standard"]').checked=true; root.querySelector('input[name="visible"]').checked=true; root.querySelector('input[name="favorite"]').checked=true; root.querySelector('#clDialogForm').requestSubmit(); });
    await page.waitForTimeout(40);
    await panel.evaluate(async element => { element._config=null; await element._loadConfig(); });
    const persisted = await panel.evaluate(element => ({alias:element._config.aliases['sensor.qualita_aria_incerta'],module:element._config.entity_modules['sensor.qualita_aria_incerta'],area:element._config.entity_areas['sensor.qualita_aria_incerta'],type:element._config.switch_types['sensor.qualita_aria_incerta'],subtype:element._config.entity_subtypes['sensor.qualita_aria_incerta'],level:element._config.entity_levels['sensor.qualita_aria_incerta'],visible:element._config.entity_visibility['sensor.qualita_aria_incerta'],favorite:element._config.favorites.includes('sensor.qualita_aria_incerta')}));
    assert.deepEqual(persisted,{alias:'Aria salone',module:'environment',area:'Zona giorno',type:'tecnico',subtype:'aqi',level:'standard',visible:true,favorite:true});
  }
  await page.close();
}

await browser.close();
console.log('ui interaction 3.3.0-dev: ok');

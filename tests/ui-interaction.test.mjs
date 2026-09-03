import assert from 'node:assert/strict';

const { chromium } = await import(process.env.CL_PLAYWRIGHT_URL || 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.CL_CHROME_PATH ? { executablePath: process.env.CL_CHROME_PATH } : {}) });

for (const viewport of [{ width: 390, height: 844 }, { width: 1200, height: 900 }]) {
  const page = await browser.newPage({ viewport });
  await page.goto('http://127.0.0.1:8765/tests/ui3-harness.html', { waitUntil: 'networkidle' });
  const panel = page.locator('cl-control-panel');
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
  await panel.locator('#clDialogForm .primary').click();
  const serviceCall = await page.evaluate(() => window.__clServiceCalls.at(-1));
  assert.equal(serviceCall[0], 'light');
  assert.equal(serviceCall[1], 'turn_on');
  assert.deepEqual(serviceCall[2].rgb_color, [255, 149, 0]);

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
  assert.equal(await panel.locator('.layoutEditorBar').count(), 1);
  const beforeCalls = await page.evaluate(() => window.__clServiceCalls.length);
  await panel.locator('[data-layout-id="home:module:lights"]').click({ position: { x: 8, y: 8 } });
  assert.equal(await page.evaluate(() => window.__clServiceCalls.length), beforeCalls, 'edit mode must not execute device commands');
  const dragHandle = panel.locator('[data-layout-drag="home:status"]');
  const dragTarget = panel.locator('[data-layout-id="home:module:lights"]');
  const dragBox = await dragHandle.boundingBox(), targetBox = await dragTarget.boundingBox();
  assert.ok(dragBox && targetBox);
  await page.mouse.move(dragBox.x + dragBox.width / 2, dragBox.y + dragBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 5 });
  await page.mouse.up();
  assert.match(await panel.locator('.layoutEditorStatus').textContent(), /non salvate/, 'pointer drag must update the draft');
  await panel.locator('[data-layout-down="home:status"]').click();
  assert.match(await panel.locator('.layoutEditorStatus').textContent(), /non salvate/);
  await panel.locator('[data-layout-device]').selectOption('mobile');
  const boxPreview = await panel.locator('#page-home').boundingBox();
  assert.ok(boxPreview && boxPreview.width <= Math.min(viewport.width, 390) + 2);
  await panel.locator('[data-layout-view]').selectOption('lights');
  assert.equal(await panel.locator('#page-lights.layoutEditing').count(), 1);
  const lightServiceCount = await page.evaluate(() => window.__clServiceCalls.length);
  assert.equal(await panel.locator('[data-toggle-light]').first().isDisabled(), true);
  await panel.locator('[data-toggle-light]').first().click({ force: true });
  assert.equal(await page.evaluate(() => window.__clServiceCalls.length), lightServiceCount, 'light commands must be disabled in edit mode');
  await panel.locator('#page-lights [data-layout-edit]').first().click();
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
  await page.close();
}

await browser.close();
console.log('ui interaction 3.3.0-dev: ok');

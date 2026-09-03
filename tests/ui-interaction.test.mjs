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

  await panel.locator('[data-page="more"]').click();
  await panel.locator('#unlockInstaller').click();
  await panel.locator('#clPin').fill('1234');
  await panel.locator('#clDialogForm .primary').click();
  const sections = panel.locator('.installerSection');
  for (const index of [5, 6]) if (!(await sections.nth(index).getAttribute('open'))) await sections.nth(index).locator('summary').click();
  await panel.evaluate(element => { element.hass = { ...element.hass, states: { ...element.hass.states } }; });
  await page.waitForTimeout(50);
  assert.notEqual(await sections.nth(5).getAttribute('open'), null, 'Assistenza collapsed after state refresh');
  assert.notEqual(await sections.nth(6).getAttribute('open'), null, 'Diagnostica collapsed after state refresh');
  await page.close();
}

await browser.close();
console.log('ui interaction 3.2.3: ok');

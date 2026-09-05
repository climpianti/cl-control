import assert from 'node:assert/strict';

const { chromium } = await import(process.env.CL_PLAYWRIGHT_URL || 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.CL_CHROME_PATH ? { executablePath: process.env.CL_CHROME_PATH } : {}) });
const themeByWidth = new Map([[390, 'light'], [768, 'dark'], [1200, 'cl_blue']]);
const requestedWidth = Number(process.env.CL_TEST_VIEWPORT) || 0;
const viewports = [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 768, height: 1024 }, { width: 1200, height: 900 }, { width: 1920, height: 1080 }].filter(viewport => !requestedWidth || viewport.width === requestedWidth);

for (const viewport of viewports) {
  const page = await browser.newPage({ viewport, hasTouch: viewport.width < 768 });
  page.setDefaultTimeout(7000);
  console.log(`ui viewport ${viewport.width}x${viewport.height}`);
  const requestedTheme = themeByWidth.get(viewport.width) || 'cl_blue';
  await page.goto(`http://127.0.0.1:8765/tests/ui3-harness.html?theme=${requestedTheme}`, { waitUntil: 'networkidle' });
  const panel = page.locator('cl-control-panel');
  assert.equal(await panel.getAttribute('data-theme'), requestedTheme);
  assert.match(await panel.locator('[data-layout-module="environment"]').textContent(), /Aria buona/);
  const homeCards = panel.locator('#page-home [data-layout-id]');
  assert.ok(await homeCards.count() >= 7, 'standard Home must expose the expected modules');
  assert.equal(await panel.locator('[data-layout-id="home:status"]').getAttribute('data-layout-size'), 'l');
  assert.equal(await panel.locator('[data-layout-id="home:status"]').getAttribute('data-layout-span'), '2');
  for (let index=0; index<await homeCards.count(); index++) {
    const card=homeCards.nth(index),box=await card.boundingBox();assert.ok(box);
    assert.ok(box.x >= -1 && box.x + box.width <= viewport.width + 1, 'Home card must remain inside the viewport');
    assert.equal(await card.evaluate(element => element.scrollWidth <= element.clientWidth + 1), true, 'Home card must not overflow horizontally');
  }
  assert.doesNotMatch(await panel.locator('#page-home').textContent(), /(?:sensor|binary_sensor|light|cover|climate)\./, 'Home must not expose technical labels');
  if (viewport.width === 390) {
    await panel.evaluate(element => { element._config.support.site_name='Impianto residenziale con una denominazione volutamente molto lunga'; element._renderHome(); });
    assert.equal(await panel.locator('#page-home').evaluate(element => element.scrollWidth <= element.clientWidth + 1), true, 'long site names must not create horizontal overflow');
  }
  await panel.evaluate(element => {
    window.__clServiceCalls = [];
    element.hass.callService = async (...args) => window.__clServiceCalls.push(args);
  });
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
    const before = await page.evaluate(() => window.__clServiceCalls.length);
    const point = pointForHue(expected);
    await page.mouse.click(point.x, point.y);
    assert.equal(Number(await panel.locator('[name="hue"]').inputValue()), expected);
    await page.waitForTimeout(25);
    assert.equal(await page.evaluate(() => window.__clServiceCalls.length), before + 1, 'wheel tap must command immediately on release');
  }
  const beforeDrag = await page.evaluate(() => window.__clServiceCalls.length);
  const red = pointForHue(0), green = pointForHue(120);
  await page.mouse.move(red.x, red.y);
  await page.mouse.down();
  await page.mouse.move(green.x, green.y, { steps: 6 });
  await page.mouse.up();
  assert.equal(Number(await panel.locator('[name="hue"]').inputValue()), 120);
  await page.waitForTimeout(25);
  const dragCalls = await page.evaluate(before => window.__clServiceCalls.slice(before), beforeDrag);
  assert.ok(dragCalls.length >= 1 && dragCalls.length <= 2, 'color drag must be debounced');
  assert.deepEqual(dragCalls.at(-1)[2].rgbw_color, [0, 255, 0, 0], 'final color command must match the last pointer position');
  const beforePreset = await page.evaluate(() => window.__clServiceCalls.length);
  await panel.locator('[data-hue-preset="35"]').click();
  assert.equal(Number(await panel.locator('[name="hue"]').inputValue()), 35);
  await page.waitForTimeout(25);
  assert.equal(await page.evaluate(() => window.__clServiceCalls.length), beforePreset + 1, 'preset must command immediately');
  if (viewport.width === 390) {
    const beforeCancel=await page.evaluate(() => window.__clServiceCalls.length),cancelStart=pointForHue(0),cancelMove=pointForHue(120),cancelPointer={pointerId:91,pointerType:'touch',button:0};
    await wheel.evaluate((element,{cancelPointer,cancelStart,cancelMove})=>{
      element.dispatchEvent(new PointerEvent('pointerdown',{...cancelPointer,clientX:cancelStart.x,clientY:cancelStart.y,bubbles:true}));
      element.dispatchEvent(new PointerEvent('pointermove',{...cancelPointer,clientX:cancelMove.x,clientY:cancelMove.y,bubbles:true}));
      element.dispatchEvent(new PointerEvent('pointercancel',{...cancelPointer,clientX:cancelMove.x,clientY:cancelMove.y,bubbles:true}));
    },{cancelPointer,cancelStart,cancelMove});
    await page.waitForTimeout(220);
    assert.equal(await page.evaluate(() => window.__clServiceCalls.length), beforeCancel, 'pointercancel must not flush a color command');
    assert.equal(Number(await panel.locator('[name="hue"]').inputValue()),38,'pointercancel must reconcile to the latest real HA state');
  }
  const brightness=panel.locator('[name="brightness"]'),brightnessBox=await brightness.boundingBox(),initialBrightness=await brightness.inputValue();assert.ok(brightnessBox);
  const callsBeforeBrightness = await page.evaluate(() => window.__clServiceCalls.length);
  await page.mouse.click(brightnessBox.x+brightnessBox.width*.85,brightnessBox.y+brightnessBox.height/2);assert.equal(await brightness.inputValue(),initialBrightness,'brightness track tap must not change value');
  assert.equal(await page.evaluate(() => window.__clServiceCalls.length), callsBeforeBrightness, 'brightness track tap must not command');
  await page.mouse.move(brightnessBox.x+brightnessBox.width*.45,brightnessBox.y+brightnessBox.height/2);await page.mouse.down();await page.mouse.move(brightnessBox.x+brightnessBox.width*.75,brightnessBox.y+brightnessBox.height/2+2,{steps:4});await page.mouse.up();assert.notEqual(await brightness.inputValue(),initialBrightness,'intentional brightness drag must update local preview');
  await page.waitForTimeout(25);
  assert.equal(await page.evaluate(() => window.__clServiceCalls.length), callsBeforeBrightness + 1, 'brightness drag must emit one command on release');
  const serviceCall = await page.evaluate(() => window.__clServiceCalls.at(-1));
  assert.equal(serviceCall[0], 'light');
  assert.equal(serviceCall[1], 'turn_on');
  assert.ok(Number.isFinite(serviceCall[2].brightness));
  assert.equal('rgbw_color' in serviceCall[2], false, 'brightness release must not alter color');
  await panel.evaluate((element,value) => { const current=element.hass.states['light.cucina']; element.hass={...element.hass,states:{...element.hass.states,'light.cucina':{...current,attributes:{...current.attributes,brightness:value}}}}; }, serviceCall[2].brightness);
  assert.match(await panel.locator('[data-light-live-status]').textContent(), /Aggiornato/);

  if ([390, 768, 1200].includes(viewport.width)) {
    await panel.locator('#clDialogForm [data-dialog-cancel]').click();
    await panel.locator('[data-light-controls]').first().click();
    await panel.locator('[data-light-mode="temperature"]').click();
    const kelvin=panel.locator('[name="kelvin"]'),kelvinBox=await kelvin.boundingBox();assert.ok(kelvinBox);
    const callsBeforeTemperature = await page.evaluate(() => window.__clServiceCalls.length);
    await page.mouse.move(kelvinBox.x+kelvinBox.width*.3,kelvinBox.y+kelvinBox.height/2);await page.mouse.down();await page.mouse.move(kelvinBox.x+kelvinBox.width*.47,kelvinBox.y+kelvinBox.height/2+1,{steps:4});await page.mouse.up();await page.waitForTimeout(25);
    const temperatureCall = await page.evaluate(() => window.__clServiceCalls.at(-1));
    assert.ok(temperatureCall[2].color_temp_kelvin >= 4000 && temperatureCall[2].color_temp_kelvin <= 4300);
    assert.equal(callsBeforeTemperature + 1, await page.evaluate(() => window.__clServiceCalls.length));
    await panel.evaluate((element,value) => { const current=element.hass.states['light.cucina']; element.hass={...element.hass,states:{...element.hass.states,'light.cucina':{...current,attributes:{...current.attributes,color_temp_kelvin:value,color_mode:'color_temp'}}}}; }, temperatureCall[2].color_temp_kelvin);
    assert.match(await panel.locator('[data-light-live-status]').textContent(), /Aggiornato/);
    await panel.locator('#clDialogForm [data-dialog-cancel]').click();
    await panel.locator('[data-light-controls]').first().click();
    const callsBeforeWhite = await page.evaluate(() => window.__clServiceCalls.length);
    await panel.locator('button[data-light-mode="white"]').click();
    await page.waitForTimeout(120);
    const whiteCall = await page.evaluate(() => window.__clServiceCalls.at(-1));
    assert.deepEqual(whiteCall[2].rgbw_color, [0, 0, 0, 255]);
    assert.equal(callsBeforeWhite + 1, await page.evaluate(() => window.__clServiceCalls.length));
    await panel.locator('#clDialogForm [data-dialog-cancel]').click();
    await panel.evaluate(element => { element._openLightControls('light.portico'); });
    assert.match(await panel.locator('[data-light-live-status]').textContent(), /non disponibile/i);
    assert.equal(await panel.locator('[data-color-wheel]').count(), 0);
  }
  if (await panel.locator('.dialogLayer.open').count()) await panel.locator('[data-dialog-cancel]').first().click();
  console.log(`rgb ${viewport.width}: ok`);

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
  console.log(`modules ${viewport.width}: ok`);

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
  console.log(`installer ${viewport.width}: ok`);

  if (!(await sections.nth(3).getAttribute('open'))) await sections.nth(3).locator('summary').click();
  await sections.nth(3).locator('[data-layout-start]').click();
  await panel.locator('#clDialogForm .primary').click();
  assert.equal(await panel.locator('.layoutEditorBar').count(), 1);
  assert.match(await panel.locator('.layoutEditorIdentity').textContent(), /Stai modificando il layout/);
  const beforeCalls = await page.evaluate(() => window.__clServiceCalls.length);
  await panel.locator('[data-layout-id="home:module:lights"]').click({ position: { x: 8, y: 8 } });
  assert.equal(await page.evaluate(() => window.__clServiceCalls.length), beforeCalls, 'edit mode must not execute device commands');
  assert.match(await panel.locator('#clDialogTitle').textContent(), /Personalizza card/);
  assert.deepEqual(await panel.locator('[name="size"] option').allTextContents(), ['M','L']);
  assert.deepEqual(await panel.locator('[name="span"] option').allTextContents(), ['1 colonna','2 colonne']);
  assert.equal(await panel.locator('[name="shape"] option[value="square"]').count(),0);
  assert.equal(await panel.locator('[name="show_state"]').isDisabled(),true,'Home state is required for a useful card');
  await panel.locator('[data-dialog-cancel]').first().click();
  const dragHandle = panel.locator('#page-home .layoutDragHandle').first();
  const [dragBox,targetBox]=await panel.evaluate(element=>{const nodes=[element.shadowRoot.querySelector('#page-home .layoutDragHandle'),element.shadowRoot.querySelectorAll('#page-home [data-layout-id]')[1]];return nodes.map(node=>{const r=node?.getBoundingClientRect();return r&&r.width&&r.height?{x:r.x,y:r.y,width:r.width,height:r.height}:null;});});
  assert.ok(dragBox && targetBox);
  await page.mouse.move(dragBox.x + dragBox.width / 2, dragBox.y + dragBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 5 });
  await page.mouse.up();
  assert.match(await panel.locator('.layoutEditorStatus').textContent(), /non salvate/, 'pointer drag must update the draft');
  console.log(`home layout ${viewport.width}: ok`);
  const keyboardBefore=await panel.evaluate(element=>element._layoutEditor.drafts.get('base:home').map(card=>card.id));await panel.locator(`#page-home [data-layout-drag="${keyboardBefore[0]}"]`).press('ArrowDown');const keyboardAfter=await panel.evaluate(element=>element._layoutEditor.drafts.get('base:home').map(card=>card.id));assert.notDeepEqual(keyboardAfter,keyboardBefore,'keyboard reorder must remain available');
  await panel.locator('[data-layout-id="home:status"]').click({ position: { x: 12, y: 55 } });
  assert.deepEqual(await panel.locator('[name="size"] option').allTextContents(), ['L','XL']);
  assert.deepEqual(await panel.locator('[name="span"] option').allTextContents(), ['2 colonne']);
  assert.deepEqual(await panel.locator('[name="shape"] option').allTextContents(), ['rectangle']);
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
  const sameAreaCards = panel.locator('#page-lights [data-order-area="Zona giorno"][data-order-kind="light"][data-layout-id]');
  assert.ok(await sameAreaCards.count() >= 2, 'test requires multiple lights in the same area');
  const touchDragBefore = await panel.evaluate(element => element._layoutEditor.drafts.get('base:lights').map(card => card.id));
  const sourceHandle = sameAreaCards.nth(0).locator('.layoutDragHandle');
  const sourceBox = await sourceHandle.boundingBox(), sameAreaTargetBox = await sameAreaCards.nth(1).boundingBox();
  assert.ok(sourceBox && sameAreaTargetBox);
  const touchPointer = { pointerId: 77, pointerType: 'touch', button: 0, clientX: sourceBox.x + sourceBox.width / 2, clientY: sourceBox.y + sourceBox.height / 2 };
  await sourceHandle.dispatchEvent('pointerdown', touchPointer);
  assert.equal(await panel.locator('.layoutDragGhost').count(), 1, 'dragged card must visibly follow touch');
  await sourceHandle.dispatchEvent('pointermove', { ...touchPointer, clientX: sameAreaTargetBox.x + sameAreaTargetBox.width / 2, clientY: sameAreaTargetBox.y + sameAreaTargetBox.height * .75 });
  assert.equal(await panel.locator('.layoutDropTarget').count(), 1, 'drop placeholder must be visible');
  await sourceHandle.dispatchEvent('pointerup', { ...touchPointer, clientX: sameAreaTargetBox.x + sameAreaTargetBox.width / 2, clientY: sameAreaTargetBox.y + sameAreaTargetBox.height * .75 });
  const touchDragAfter = await panel.evaluate(element => element._layoutEditor.drafts.get('base:lights').map(card => card.id));
  assert.notDeepEqual(touchDragAfter, touchDragBefore, 'touch drag must reorder lights in the same area');
  assert.equal(await page.evaluate(() => window.__clServiceCalls.length), lightServiceCount, 'drag must not command lights');
  const handleTouchAction = await panel.locator('#page-lights .layoutDragHandle').first().evaluate(element => getComputedStyle(element).touchAction);
  const cardTouchAction = await panel.locator('#page-lights [data-layout-id]').first().evaluate(element => getComputedStyle(element).touchAction);
  assert.equal(handleTouchAction, 'none');
  assert.notEqual(cardTouchAction, 'none', 'scroll must remain available outside the drag handle');
  const crossAreaBefore = await panel.evaluate(element => element._layoutEditor.drafts.get('base:lights').map(card => card.id));
  const crossSource = panel.locator('#page-lights [data-order-entity="light.cucina"] .layoutDragHandle'), crossTarget = panel.locator('#page-lights [data-order-entity="light.camera"]');
  await crossTarget.scrollIntoViewIfNeeded();
  const crossSourceBox = await crossSource.boundingBox(), crossTargetBox = await crossTarget.boundingBox();
  assert.ok(crossSourceBox && crossTargetBox);
  const crossPointer = { pointerId: 78, pointerType: 'touch', button: 0, clientX: crossSourceBox.x + crossSourceBox.width / 2, clientY: crossSourceBox.y + crossSourceBox.height / 2 };
  await crossSource.dispatchEvent('pointerdown', crossPointer);
  await crossSource.dispatchEvent('pointermove', { ...crossPointer, clientX: crossTargetBox.x + crossTargetBox.width / 2, clientY: crossTargetBox.y + crossTargetBox.height / 2 });
  assert.equal(await panel.locator('.layoutDropTarget').count(), 0, 'a different technical area must not accept the drop');
  await crossSource.dispatchEvent('pointerup', { ...crossPointer, clientX: crossTargetBox.x + crossTargetBox.width / 2, clientY: crossTargetBox.y + crossTargetBox.height / 2 });
  assert.deepEqual(await panel.evaluate(element => element._layoutEditor.drafts.get('base:lights').map(card => card.id)), crossAreaBefore, 'cross-area drag must not alter graphical order or technical area');
  console.log(`lights drag ${viewport.width}: ok`);

  const primaryCardId = 'lights:entity:light.cucina';
  await panel.evaluate((element,id)=>{ element._editLayoutCard('lights',id); }, primaryCardId);
  await panel.locator('#clDialogTitle').waitFor();
  assert.equal(await panel.locator('[name="size"] option[value="l"]').count(), 1);
  assert.equal(await panel.locator('[name="size"] option[value="xl"]').count(), 0, 'light cards must expose capability-safe sizes');
  await panel.locator('[name="size"]').selectOption('l');
  await panel.locator('[name="span"]').selectOption('2');
  await panel.locator('[name="shape"]').selectOption('square');
  await panel.locator('[name="icon"]').fill('mdi:lightbulb');
  await panel.locator('[name="icon_size"]').selectOption('l');
  await panel.locator('[name="show_title"]').uncheck();
  await panel.locator('[name="show_state"]').uncheck();
  await panel.locator('[name="show_secondary"]').uncheck();
  await panel.locator('[name="favorite"]').check();
  await panel.locator('#clDialogForm .primary').click();
  const draftCard = await panel.evaluate((element,id)=>element._layoutEditor.drafts.get('base:lights').find(card=>card.id===id), primaryCardId);
  assert.deepEqual({size:draftCard.size,span:draftCard.span,shape:draftCard.shape,icon:draftCard.icon,icon_size:draftCard.icon_size,show_title:draftCard.show_title,show_state:draftCard.show_state,show_secondary:draftCard.show_secondary,visible:draftCard.visible,favorite:draftCard.favorite},{size:'l',span:2,shape:'square',icon:'mdi:lightbulb',icon_size:'l',show_title:false,show_state:false,show_secondary:false,visible:true,favorite:true});
  const renderedPrimary = panel.locator(`[data-layout-id="${primaryCardId}"]`);
  assert.equal(await renderedPrimary.getAttribute('data-layout-size'), 'l');
  assert.equal(await renderedPrimary.getAttribute('data-layout-span'), '2');
  assert.equal(await renderedPrimary.getAttribute('data-layout-shape'), 'square');
  assert.equal(await renderedPrimary.getAttribute('data-layout-icon-size'), 'l');
  assert.match(await renderedPrimary.getAttribute('class'), /layoutHiddenTitle.*layoutHiddenState.*layoutHiddenSecondary|layoutHiddenTitle/);
  assert.equal(await renderedPrimary.locator('ha-icon').getAttribute('icon'), 'mdi:lightbulb');
  assert.match(await renderedPrimary.getAttribute('style'), /grid-column: span 2/);
  assert.equal(await renderedPrimary.locator('.name').evaluate(element => getComputedStyle(element).display), 'none');
  assert.equal(await renderedPrimary.locator('.lightState').evaluate(element => getComputedStyle(element).display), 'none');
  assert.equal(await renderedPrimary.locator('.lightDetail').evaluate(element => getComputedStyle(element).display), 'none');
  assert.equal(await renderedPrimary.locator('.lightDetailAction').evaluate(element => getComputedStyle(element).display), 'none');

  const hiddenCardId = 'lights:entity:light.soggiorno';
  await panel.evaluate((element,id)=>{ element._editLayoutCard('lights',id); }, hiddenCardId);
  await panel.locator('[name="visible"]').uncheck();
  await panel.locator('#clDialogForm .primary').click();
  assert.equal(await panel.locator(`[data-layout-id="${hiddenCardId}"].layoutCardHidden`).count(), 1, 'hidden card must remain editable in the draft');
  console.log(`lights properties ${viewport.width}: ok`);
  await panel.locator('#page-lights [data-layout-save]').click();
  const layoutSaves = await page.evaluate(() => window.__clWsCalls.filter(call => call.type === 'cl_control/layout/set'));
  assert.equal(layoutSaves.length, 2, 'save must persist the Home and Lights drafts only on explicit save');
  assert.equal(layoutSaves[0].context, 'base');
  assert.equal(layoutSaves[0].view, 'home');
  assert.ok(layoutSaves[0].cards['home:status']);
  assert.equal(layoutSaves[1].view, 'lights');
  assert.deepEqual({size:layoutSaves[1].cards[primaryCardId].size,span:layoutSaves[1].cards[primaryCardId].span,shape:layoutSaves[1].cards[primaryCardId].shape,icon:layoutSaves[1].cards[primaryCardId].icon,icon_size:layoutSaves[1].cards[primaryCardId].icon_size,show_title:layoutSaves[1].cards[primaryCardId].show_title,show_state:layoutSaves[1].cards[primaryCardId].show_state,show_secondary:layoutSaves[1].cards[primaryCardId].show_secondary,visible:layoutSaves[1].cards[primaryCardId].visible,favorite:layoutSaves[1].cards[primaryCardId].favorite},{size:'l',span:2,shape:'square',icon:'mdi:lightbulb',icon_size:'l',show_title:false,show_state:false,show_secondary:false,visible:true,favorite:true});
  assert.equal(layoutSaves[1].cards[hiddenCardId].visible, false);
  await panel.locator('#page-lights [data-layout-cancel]').click();
  assert.equal(await panel.locator('.layoutEditorBar').count(), 0);
  await panel.evaluate(async element => { element._config=null; await element._loadConfig(); element._switchPage('lights'); element._renderLights(); });
  assert.equal(await panel.locator(`[data-layout-id="${hiddenCardId}"]`).isHidden(), true, 'hidden card must remain hidden after storage/bootstrap reload');
  assert.equal(await panel.locator(`[data-layout-id="${primaryCardId}"]`).getAttribute('data-layout-size'), 'l');
  assert.equal(await panel.locator(`[data-layout-id="${primaryCardId}"]`).evaluate(element => Number(element.style.order)), layoutSaves[1].cards[primaryCardId].order);
  assert.match(await panel.locator(`[data-layout-id="${primaryCardId}"] [data-favorite]`).getAttribute('class'), /active/, 'layout favorite must affect the rendered card');
  await panel.locator('[data-light-filter="favorites"]').click();
  assert.equal(await panel.locator(`[data-layout-id="${primaryCardId}"]`).count(), 1, 'layout favorite must participate in the Favorites filter');
  await panel.locator('[data-page="home"]').click();
  assert.equal(await panel.locator('.statusCard').count(), 1, 'Home status card regression');
  assert.ok(await panel.locator('[data-layout-module]').count() > 0, 'Home modules regression');
  console.log(`layout reload ${viewport.width}: ok`);

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

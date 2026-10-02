import assert from 'node:assert/strict';

const { chromium } = await import(process.env.CL_PLAYWRIGHT_URL || 'playwright');
const browser = await chromium.launch({headless:true, ...(process.env.CL_CHROME_PATH ? {executablePath:process.env.CL_CHROME_PATH} : {})});
const base = 'http://127.0.0.1:8765';
const stable = '/cl_control_static/cl-control-dashboard-strategy.mjs';
try {
  for (const version of ['3.4.2-beta.1','3.4.3-beta.1','3.4.2-beta.1']) {
    await fetch(`${base}/_test/install/${version}`, {method:'POST'});
    // Fresh document after restart/upgrade: ES module instances are page-scoped.
    const page = await browser.newPage();
    const errors = [], urls = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => urls.push(request.url()));
    await page.goto(`${base}/tests/ui3-harness.html`);
    const result = await page.evaluate(async stableUrl => {
      const existing = document.querySelector('cl-control-panel');
      const originalClass = customElements.get('cl-control-panel');
      const first = await import(stableUrl);
      const second = await import(stableUrl);
      const strategy = customElements.get('ll-strategy-dashboard-cl-control');
      const config = await strategy.generate({title:'Fixture dashboard'});
      const card = document.createElement('cl-control-dashboard-card');
      card.setConfig(config.views[0].cards[0]);
      card.hass = existing.hass;
      document.body.append(card);
      await new Promise(resolve => setTimeout(resolve, 200));
      return {
        sameModule:first===second,
        samePanelClass:originalClass===customElements.get('cl-control-panel'),
        cardType:config.views[0].cards[0].type,
        strategyCount:window.customStrategies.filter(item=>item.type==='cl-control').length,
        cardCount:window.customCards.filter(item=>item.type==='cl-control-dashboard-card').length,
        sharedHass:card.hass===existing.hass,
        panels:card.shadowRoot.querySelectorAll('cl-control-panel').length,
        context:card.shadowRoot.querySelector('cl-control-panel').runtimeContext,
        panelContext:existing.runtimeContext,
      };
    }, stable);
    assert.equal(result.sameModule, true);
    assert.equal(result.samePanelClass, true);
    assert.equal(result.cardType, 'custom:cl-control-dashboard-card');
    assert.equal(result.strategyCount, 1);
    assert.equal(result.cardCount, 1);
    assert.equal(result.sharedHass, true);
    assert.equal(result.panels, 1);
    assert.equal(result.context, 'dashboard');
    assert.equal(result.panelContext, 'panel');
    assert.ok(urls.includes(`${base}/cl_control_static/${version}/cl-control-dashboard-strategy.mjs`));
    assert.ok(urls.includes(`${base}/cl_control_static/${version}/cl-control-panel.js`));
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`stable strategy browser: ${version} PASS`);
  }
} finally { await browser.close(); }

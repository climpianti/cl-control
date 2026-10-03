import assert from 'node:assert/strict';

const { chromium } = await import(process.env.CL_PLAYWRIGHT_URL || 'playwright');
const browser = await chromium.launch({headless:true, ...(process.env.CL_CHROME_PATH ? {executablePath:process.env.CL_CHROME_PATH} : {})});
const base = 'http://127.0.0.1:8765';
const stable = '/cl_control_static/cl-control-dashboard-strategy.mjs';
try {
  for (const version of ['3.5.0-dev','3.5.1-dev','3.5.0-dev']) {
    await fetch(`${base}/_test/install/${version}`, {method:'POST'});
    const page = await browser.newPage();
    const errors = [], urls = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => urls.push(request.url()));
    await page.goto(`${base}/tests/ui3-harness.html`);
    const result = await page.evaluate(async stableUrl => {
      const first = await import(stableUrl);
      const second = await import(stableUrl);
      const strategy = customElements.get('ll-strategy-dashboard-cl-control');
      const calls = [];
      const hass = {
        callWS: async message => {
          calls.push(message);
          return {
            revision: 7,
            config: {
              title: 'CL Control',
              views: [{
                type: 'sections',
                title: 'Home',
                path: 'home',
                sections: [{
                  type: 'grid',
                  cards: [{type:'markdown', content:'# CL Control'}],
                }],
              }],
            },
          };
        },
      };
      const config = await strategy.generate({title:'Fixture dashboard'}, hass);
      return {
        sameModule:first===second,
        title:config.title,
        viewType:config.views[0].type,
        cardType:config.views[0].sections[0].cards[0].type,
        strategyCount:window.customStrategies.filter(item=>item.type==='cl-control').length,
        customCustomerCardDefined:Boolean(customElements.get('cl-control-dashboard-card')),
        calls,
        customConfig:JSON.stringify(config).includes('custom:cl-control-dashboard-card'),
      };
    }, stable);
    assert.equal(result.sameModule, true);
    assert.equal(result.title, 'Fixture dashboard');
    assert.equal(result.viewType, 'sections');
    assert.equal(result.cardType, 'markdown');
    assert.equal(result.strategyCount, 1);
    assert.equal(result.customCustomerCardDefined, false);
    assert.equal(result.customConfig, false);
    assert.deepEqual(result.calls, [{type:'cl_control/dashboard/native_config'}]);
    assert.ok(urls.includes(`${base}/cl_control_static/${version}/cl-control-dashboard-strategy.mjs`));
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`stable native strategy browser: ${version} PASS`);
  }
} finally { await browser.close(); }

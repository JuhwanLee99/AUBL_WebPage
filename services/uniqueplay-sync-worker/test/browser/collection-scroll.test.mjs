import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { scrollCollectionDom } from '../../src/collection-scroll.mjs';
import { collectLazyList, collectUntilStable, scrollPageList } from '../../src/adapter.mjs';

test('Chromium CSS layout: overflowing cards, lazy batches, table and document scroll', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 1200 } });
    // All inputs are synthetic public-shaped fields. Never connect to production
    // or load a user profile for this regression test.
    await page.route('**/*', (route) => route.abort());
    await page.setContent(`<style>
      html,body { margin:0; height:100%; overflow:hidden; }
      #list { height:1120px; overflow-y:auto; }
      .card { height:192px; overflow:visible; margin-bottom:12px; }
      .extra { height:196px; }
      .date { height:18px; }
    </style><div id="list"></div>`);
    await page.evaluate(() => {
      const list = document.querySelector('#list');
      // The provider also owns this method on its game-list DOM element.
      list.scrollTo = () => {};
      let count = 0;
      let loading = false;
      const append = () => {
        for (let index = 0; index < 8; index += 1) {
          const card = document.createElement('div');
          card.className = 'card';
          const date = document.createElement('div');
          date.className = 'date';
          date.textContent = `09/${String(++count).padStart(2, '0')} 토 09:00`;
          const extra = document.createElement('div');
          extra.className = 'extra';
          card.append(date, extra);
          list.append(card);
        }
      };
      append();
      list.addEventListener('scroll', () => {
        if (!loading && count < 24 && list.scrollTop + list.clientHeight >= list.scrollHeight - 2) {
          loading = true;
          setTimeout(() => { append(); loading = false; }, 150);
        }
      });
    });
    const geometry = await page.locator('.card').first().evaluate((card) => ({
      height: card.clientHeight, total: card.scrollHeight, overflow: getComputedStyle(card).overflowY,
    }));
    assert.deepEqual(geometry, { height: 192, total: 214, overflow: 'visible' });
    const dates = await collectLazyList({
      read: () => page.locator('.date').allTextContents(), identify: (date) => date,
      advance: () => scrollPageList(page), wait: () => page.waitForTimeout(100),
    });
    assert.equal(dates.length, 24);
    assert.equal(await page.locator('.card').first().evaluate((card) => card.scrollTop), 0);
    assert.equal((await page.evaluate(scrollCollectionDom, {})).atEnd, true);

    await page.setContent(`<style>body{margin:0} #table{height:200px;overflow-y:auto} .wrap{height:192px;overflow:visible} .values{height:800px}</style>
      <div id="table"><div class="wrap"><div class="values"><div><span>게임수</span><span>승률</span></div></div></div></div>`);
    const table = await page.evaluate(scrollCollectionDom, { kind: 'table', anchor: '게임수', expectedHeaders: ['게임수', '승률'] });
    assert.equal(table.advanced, true);
    assert.equal(await page.locator('.wrap').evaluate((element) => element.scrollTop), 0);

    await page.setContent('<style>body{margin:0}</style><div style="height:2400px"><span>09/05 토 09:00</span></div>');
    const documentResult = await page.evaluate(scrollCollectionDom, {});
    assert.equal(documentResult.advanced, true);
    assert.equal(documentResult.atEnd, false);
    assert.ok(await page.evaluate(() => document.scrollingElement.scrollTop > 0));
  } finally {
    await browser.close();
  }
});

test('provider-owned scrollTo reproduces NAS 20-row stall; native property reaches all 40 rows', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.route('**/*', (route) => route.abort());
    await page.setContent(`<!doctype html><style>
      html,body{height:100%;margin:0;overflow:hidden}
      #list{height:620px;overflow-y:auto;scroll-behavior:auto}
      #padding{height:528px} #header{height:25px} .row{height:45px}
    </style><div id="list"><div id="padding"></div><div><div id="values"><div id="header"><span>타율</span><span>팀게임</span></div></div></div></div>`);
    await page.evaluate(() => {
      const list = document.querySelector('#list');
      const values = document.querySelector('#values');
      let count = 0;
      let loading = false;
      const append = () => {
        for (let index = 0; index < 20; index += 1) {
          const row = document.createElement('div');
          row.className = 'row';
          row.textContent = String(++count);
          values.append(row);
        }
      };
      append();
      // Public observation: own non-native method + {top} is a no-op. Do not
      // depend on or copy the provider's private framework implementation.
      list.scrollTo = () => {};
      list.addEventListener('scroll', () => {
        if (!loading && count < 40 && list.scrollTop + list.clientHeight >= list.scrollHeight - 2) {
          loading = true;
          setTimeout(() => { append(); loading = false; }, 150);
        }
      });
    });
    const legacy = await page.locator('#list').evaluate((list) => {
      list.scrollTo({ top: 496, behavior: 'instant' });
      return { top: list.scrollTop, height: list.clientHeight, total: list.scrollHeight,
        own: Object.hasOwn(list, 'scrollTo') };
    });
    assert.deepEqual(legacy, { top: 0, height: 620, total: 1453, own: true });
    assert.equal(await page.locator('.row').count(), 20);
    const options = { kind: 'table', anchor: '타율', expectedHeaders: ['타율', '팀게임'] };
    assert.equal((await page.evaluate(scrollCollectionDom, { ...options, inspectOnly: true })).top, 0);
    const first = await page.evaluate(scrollCollectionDom, options);
    assert.deepEqual({ top: first.top, advanced: first.advanced, atEnd: first.atEnd }, { top: 496, advanced: true, atEnd: false });
    const rows = await collectUntilStable({
      read: async () => ({ rows: (await page.locator('.row').allTextContents()).map((value) => ({ fixed: [value], values: [value] })) }),
      advance: () => page.evaluate(scrollCollectionDom, options),
      wait: () => page.waitForTimeout(100), maxPasses: 20,
    });
    assert.equal(rows.length, 40);
    const end = await page.evaluate(scrollCollectionDom, options);
    assert.deepEqual({ top: end.top, height: end.height, total: end.total, atEnd: end.atEnd, advanced: end.advanced },
      { top: 1733, height: 620, total: 2353, atEnd: true, advanced: false });
  } finally {
    await browser.close();
  }
});

test('standards-mode body overflow: fitted standings complete and viewport-only lists use HTML', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of [{ width: 1280, height: 720 }, { width: 2236, height: 1320 }]) {
      const page = await browser.newPage({ viewport });
      await page.route('**/*', (route) => route.abort());
      await page.setContent(`<!doctype html><style>
        html,body{margin:0;height:100%} body{overflow:auto;display:flex}
        #root{height:${viewport.height + 76}px;width:100%}
        #list{overflow-y:auto;height:${viewport.height - 120}px} #values{height:250px}
      </style><div id="root"><div id="list"><div><div id="values"><div><span>게임수</span><span>승률</span></div></div></div></div></div>`);
      // This is the v11 regression: BODY reports height overflow but cannot
      // scroll. Verify the browser's behavior, not a mock that assumes it can.
      const bodyAttempt = await page.evaluate(() => {
        document.body.scrollTo({ top: 76, behavior: 'instant' });
        return { top: document.body.scrollTop, extra: document.body.scrollHeight - document.body.clientHeight, root: document.scrollingElement.tagName };
      });
      assert.deepEqual(bodyAttempt, { top: 0, extra: 76, root: 'HTML' });
      let passes = 0;
      const rows = await collectUntilStable({
        read: async () => ({ rows: Array.from({ length: 5 }, (_, i) => ({ fixed: [String(i + 1), `팀${i + 1}`], values: ['6'] })) }),
        advance: async () => { passes += 1; return page.evaluate(scrollCollectionDom, { kind: 'table', anchor: '게임수', expectedHeaders: ['게임수', '승률'] }); },
        maxPasses: 6,
      });
      assert.equal(rows.length, 5);
      assert.equal(passes, 4);
      assert.equal(await page.evaluate(() => document.scrollingElement.scrollTop), 0);

      // Without an explicit nested scroll surface, use the actual viewport.
      await page.setContent(`<!doctype html><style>html,body{margin:0;height:100%}body{overflow:auto;display:flex}#root{height:${viewport.height + 76}px}</style><div id="root"><span>09/05 토 09:00</span></div>`);
      const documentResult = await page.evaluate(scrollCollectionDom, {});
      assert.equal(documentResult.advanced, true);
      assert.equal(documentResult.atEnd, true);
      assert.equal(await page.evaluate(() => document.body.scrollTop), 0);
      assert.equal(await page.evaluate(() => document.scrollingElement.scrollTop), 76);
      await page.close();
    }
  } finally {
    await browser.close();
  }
});

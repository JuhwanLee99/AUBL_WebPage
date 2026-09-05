import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
import { chromium } from '../services/uniqueplay-sync-worker/node_modules/playwright/index.mjs';

// Isolated public fixture: no Firebase, API, login or remote content mutations.
const fixture = {
  landing: {
    heroBadgeText: '전국대학아마추어야구연합회 · SINCE 1981',
    heroDescription: '40개 대학이 함께하는 2026 AUBL 시즌',
    heroSubDescription: '2026 연합회교 중앙대학교(서울)와 함께하는 시즌 — 실시간 기록과 중계, 디지털화를 핵심 가치로 리그의 새로운 도약을 준비했습니다.',
    snapshotCards: ['연합회교', 'FORMAT', 'VISION'].map(label => ({ label, value: '이전 카드', desc: '제거 대상' })),
  },
  announcement: { enabled: false }, matches: [], groups: [], notices: [], teamNotices: [],
  schedulePhase: 'ready', scheduleCheckedAt: Date.parse('2026-09-05T15:30:00+09:00'),
  recordPhase: 'ready', noticePhase: 'ready', teamNoticePhase: 'idle',
  userSignedIn: false, myTeamId: null, myTeamName: null, allstarEnabled: false,
  nowTs: Date.parse('2026-09-05T15:30:00+09:00'),
  recordPayload: { batters: [], pitchers: [], warnings: [], sourceFreshness: { status: 'CURRENT', publishedRevision: 'fixture-revision', publishedAt: '2026-09-05T15:29:00' } },
};
const vite = await createServer({
  configFile: false, envDir: false, cacheDir: '.tmp/season-home-hero-test-cache', esbuild: { jsx: 'automatic' },
  optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-router-dom'] },
  server: { host: '127.0.0.1', port: 5189, strictPort: true, watch: null, hmr: false, ws: false }, appType: 'custom',
  plugins: [{
    name: 'season-home-hero-fixture',
    resolveId(id) { if (id === '/__home-entry') return '\0home-entry'; },
    load(id) {
      if (id !== '\0home-entry') return;
      return `import React from 'react'; import { createRoot } from 'react-dom/client'; import { MemoryRouter } from 'react-router-dom';
        import Home from '/src/features/front/components/season2026/Season2026Home.tsx';
        import '/src/index.css'; import '/src/features/front/styles/season2026-home.css';
        const root = createRoot(document.getElementById('root')); const fixture = ${JSON.stringify(fixture)};
        window.updateHomeFixture = changes => root.render(React.createElement(MemoryRouter, null, React.createElement(Home, {...fixture, ...changes})));
        window.updateHomeFixture({});`;
    },
    configureServer(server) {
      server.middlewares.use('/__home-fixture', async (_req, res) => {
        res.setHeader('Content-Type', 'text/html');
        res.end(await server.transformIndexHtml('/__home-fixture', '<!doctype html><html lang="ko"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/__home-entry"></script></body></html>'));
      });
    },
  }],
});
let browser;
try {
  await vite.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.goto('http://127.0.0.1:5189/__home-fixture');
  await page.locator('.s26-hero').waitFor();
  await test('hero embeds one freshness panel in place of remote snapshot cards and removes the retired sentence', async () => {
    assert.equal(await page.locator('.s26-freshness').count(), 1);
    assert.equal(await page.locator('.s26-hero > .s26-freshness').count(), 1);
    assert.equal(await page.locator('.s26-home > .s26-freshness, .s26-hero__facts').count(), 0);
    const text = await page.locator('.s26-hero').innerText();
    assert.doesNotMatch(text, /FORMAT|VISION|이전 카드|새로운 도약|실시간 기록과 중계/);
    assert.match(text, /2026 연합회교 중앙대학교\(서울\)와 함께하는 시즌/);
    assert.match(text, /일정 · 결과/); assert.match(text, /조별 · 개인 기록/); assert.match(text, /원본 대조/);
    assert.match(text, /15:29/); assert.match(text, /fixture-/);
    assert.equal(await page.locator('.s26-hero a[href="/schedule"]').count(), 1);
  });
  for (const width of [360, 768, 1280]) for (const theme of ['light', 'dark']) {
    await test(`hero ${width}px ${theme}: contained layout, readable data and source link`, async () => {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
      await page.evaluate(() => document.fonts.ready);
      const bounds = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
      assert.ok(bounds.scroll <= bounds.client + 1, JSON.stringify(bounds));
      const hero = await page.locator('.s26-hero').boundingBox();
      const status = await page.locator('.s26-freshness').boundingBox();
      assert.ok(status.x >= hero.x && status.x + status.width <= hero.x + hero.width + 1);
      assert.ok(status.y + status.height <= hero.y + hero.height);
      assert.ok(await page.locator('.s26-freshness dd').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize)) >= 13);
      const link = page.locator('.s26-freshness a');
      assert.ok((await link.boundingBox()).height >= 44);
      await link.focus(); assert.equal(await link.evaluate(el => el === document.activeElement), true);
      await page.locator('.s26-hero').screenshot({ path: `.tmp/season-hero-${theme}-${width}.png` });
    });
  }
  await test('embedded freshness preserves loading and failed-data feedback', async () => {
    await page.evaluate(() => window.updateHomeFixture({ schedulePhase: 'loading', recordPhase: 'loading', recordPayload: null }));
    await page.waitForFunction(() => document.querySelector('.s26-freshness').textContent.includes('확인 중'));
    await page.evaluate(() => window.updateHomeFixture({ schedulePhase: 'error', recordPhase: 'unavailable', recordPayload: { batters: [], pitchers: [], warnings: ['원본 연결을 확인해 주세요.'], sourceFreshness: null } }));
    await page.waitForFunction(() => document.querySelector('.s26-freshness').textContent.includes('연결 확인 필요'));
    assert.match(await page.locator('.s26-freshness [role="status"]').innerText(), /원본 연결/);
    assert.deepEqual(errors, []);
  });
} finally { await browser?.close(); await vite.close(); }

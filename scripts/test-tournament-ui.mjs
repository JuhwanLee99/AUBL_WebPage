import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
import { chromium } from '../services/uniqueplay-sync-worker/node_modules/playwright/index.mjs';

assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8789');
assert.equal(process.env.GCLOUD_PROJECT, 'demo-aubl-tournament');
const fixture = {
  landing: { heroBadgeText: '2026 AUBL', heroDescription: '검증', heroSubDescription: '', snapshotCards: [] },
  announcement: { enabled: false }, matches: [], groups: [{ group: 'A', rows: [], source: 'team-directory', completedGames: 0, expectedGames: 20 }],
  notices: [], teamNotices: [], schedulePhase: 'ready', recordPhase: 'ready', noticePhase: 'ready', teamNoticePhase: 'idle',
  userSignedIn: false, myTeamId: null, myTeamName: null, allstarEnabled: false, nowTs: Date.parse('2026-09-22'),
  recordPayload: { batters: [], pitchers: [], warnings: [], sourceFreshness: null },
};
const vite = await createServer({
  configFile: false, envDir: false, cacheDir: '.tmp/tournament-ui-cache', esbuild: { jsx: 'automatic' },
  resolve: { alias: [
    { find: /^@shared\/firebase\/client$/, replacement: '\0t26-firebase' },
    ...['features', 'shared', 'core', 'app'].map(name => ({ find: `@${name}`, replacement: path.resolve('src', name) })),
  ] },
  optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-router-dom', 'firebase/app', 'firebase/firestore'] },
  server: { host: '127.0.0.1', port: 5197, strictPort: true, watch: null, hmr: false, ws: false }, appType: 'custom',
  plugins: [{ name: 'tournament-emulator-fixture',
    resolveId(id) { if (id === '/__tournament-entry') return '\0t26-entry'; if (id === '\0t26-firebase') return id; },
    load(id) {
      if (id === '\0t26-firebase') return `import { initializeApp } from 'firebase/app';
        import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
        const role = new URLSearchParams(location.search).get('role');
        const app = initializeApp({ projectId: 'demo-aubl-tournament', apiKey: 'local-test-only' });
        export const firestore = getFirestore(app);
        connectFirestoreEmulator(firestore, '127.0.0.1', 8789, role === 'admin' ? { mockUserToken: { sub: 'TEST_UI_ADMIN', admin: true } } : undefined);`;
      if (id !== '\0t26-entry') return;
      return `import React from 'react'; import { createRoot } from 'react-dom/client'; import { MemoryRouter } from 'react-router-dom';
        import Admin from '/src/app/pages/admin/AdminTournamentPage.tsx';
        import Public from '/src/features/tournament/TournamentPage.tsx';
        import Home from '/src/features/front/components/season2026/Season2026Home.tsx';
        import '/src/index.css'; import '/src/features/front/styles/season2026-home.css';
        const mode = new URLSearchParams(location.search).get('mode');
        createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter, null,
          React.createElement(mode === 'admin' ? Admin : mode === 'home' ? Home : Public, mode === 'home' ? ${JSON.stringify(fixture)} : {})));`;
    },
    configureServer(server) { server.middlewares.use('/__tournament', async (_request, response) => {
      response.setHeader('Content-Type', 'text/html');
      response.end(await server.transformIndexHtml('/__tournament', '<!doctype html><html lang="ko"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0"><div id="root"></div><script type="module" src="/__tournament-entry"></script></body></html>'));
    }); },
  }],
});
let browser;
const errors = [];
try {
  await mkdir('.tmp/tournament-tests', { recursive: true });
  await vite.listen(); browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' && ['5197', '8789'].includes(url.port) ? route.continue() : route.abort();
  });
  const admin = await context.newPage(); const publicPage = await context.newPage(); const home = await context.newPage();
  for (const page of [admin, publicPage, home]) { page.setDefaultTimeout(7000); page.on('pageerror', error => errors.push(error.message)); page.on('dialog', dialog => dialog.accept()); }
  await publicPage.goto('http://127.0.0.1:5197/__tournament?mode=public');
  await home.goto('http://127.0.0.1:5197/__tournament?mode=home');
  await admin.goto('http://127.0.0.1:5197/__tournament?mode=admin&role=admin');
  await admin.getByRole('button', { name: '비공개 초안 저장', exact: true }).waitFor();
  await test('unpublished public route and home expose no draft', async () => {
    await publicPage.getByText('아직 공개된 토너먼트 대진표가 없습니다.').waitFor();
    await home.locator('.s26-groups').waitFor(); assert.equal(await home.locator('.t26-home-toggle').count(), 0);
  });
  await test('admin preview renders 15 matches and exact image seeds', async () => {
    assert.equal(await admin.locator('.t26-preview .t26-match').count(), 15);
    assert.deepEqual(await admin.locator('.t26-preview .t26-match').nth(0).locator('.t26-seed').allTextContents(), ['D2', 'G1']);
    const toggle = admin.locator('.t26-preview').getByRole('group', { name: '토너먼트 선택' });
    await toggle.getByRole('button', { name: '버금 토너먼트' }).click();
    assert.deepEqual(await admin.locator('.t26-preview .t26-match').nth(0).locator('.t26-seed').allTextContents(), ['D4', 'B3']);
    await toggle.getByRole('button', { name: '으뜸 토너먼트' }).click();
  });
  await test('draft save persists without public exposure', async () => {
    await admin.getByLabel('D2 확정 팀명', { exact: true }).fill('검증대학교 야구동아리');
    await admin.getByRole('button', { name: '비공개 초안 저장', exact: true }).click();
    await admin.getByRole('status').filter({ hasText: '비공개 초안을 저장했습니다.' }).waitFor();
    assert.equal(await publicPage.locator('.t26-bracket').count(), 0);
    await admin.reload(); await admin.getByLabel('D2 확정 팀명', { exact: true }).waitFor();
    assert.equal(await admin.getByLabel('D2 확정 팀명', { exact: true }).inputValue(), '검증대학교 야구동아리');
  });
  await test('start and publish update public page and default home tab', async () => {
    await admin.getByRole('combobox', { name: /^운영 단계/ }).selectOption('active');
    assert.equal(await admin.getByRole('combobox', { name: /^홈 기본 화면/ }).inputValue(), 'tournament');
    await admin.getByRole('textbox', { name: /^공개 안내 문구/ }).fill('로컬 검증용 공개 안내');
    await admin.getByRole('button', { name: '현재 내용 공개 · 갱신', exact: true }).click();
    await admin.getByRole('status').filter({ hasText: '현재 내용을 공개했습니다.' }).waitFor();
    await publicPage.locator('.t26-bracket').waitFor(); await home.locator('.t26-bracket').waitFor();
    assert.equal(await home.getByRole('button', { name: '토너먼트 대진 · 일정', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.equal(await publicPage.locator('.t26-match').count(), 15);
  });
  await test('home toggles preserve groups and expose both tournament divisions', async () => {
    await home.getByRole('button', { name: '조별예선 현황', exact: true }).click();
    assert.equal(await home.locator('.s26-groups').isVisible(), true); assert.equal(await home.locator('.t26-bracket').count(), 0);
    await home.getByRole('button', { name: '토너먼트 대진 · 일정', exact: true }).click();
    await home.getByRole('button', { name: '버금 토너먼트', exact: true }).click();
    assert.deepEqual(await home.locator('.t26-match').first().locator('.t26-seed').allTextContents(), ['D4', 'B3']);
  });
  await test('match edit advances winner, preserves schedule and publishes result', async () => {
    const first = admin.locator('.t26-game-editor').first();
    await first.getByLabel('일시 (KST)', { exact: true }).fill('2026-10-10T14:00');
    await first.getByLabel('장소', { exact: true }).fill('로컬 검증 구장');
    await first.getByLabel('D2 점수', { exact: true }).fill('3'); await first.getByLabel('G1 점수', { exact: true }).fill('1');
    await first.getByRole('combobox', { name: /^상태/ }).selectOption('completed');
    assert.match(await admin.locator('.t26-game-editor').nth(8).innerText(), /D2/);
    assert.equal(await admin.getByLabel('D2 확정 팀명', { exact: true }).isDisabled(), true);
    await admin.getByRole('button', { name: '현재 내용 공개 · 갱신', exact: true }).click();
    await admin.getByRole('status').filter({ hasText: '현재 내용을 공개했습니다.' }).waitFor();
    await publicPage.getByRole('cell', { name: '로컬 검증 구장', exact: true }).waitFor();
    assert.equal(await publicPage.locator('.t26-team.is-winner').first().locator('.t26-seed').innerText(), 'D2');
  });
  for (const width of [390, 1440]) await test(`public/admin/home layout contained at ${width}px`, async () => {
    for (const [name, page] of [['public', publicPage], ['admin', admin], ['home', home]]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${name} page overflow`);
      const scroll = page.locator('.t26-scroll').first();
      assert.equal(await scroll.evaluate(node => node.scrollWidth > node.clientWidth), true);
      assert.equal(await page.locator('.t26-toggle button').first().evaluate(node => getComputedStyle(node).borderRadius), '0px');
      await page.screenshot({ path: `.tmp/tournament-tests/${name}-${width}.png`, fullPage: true });
    }
  });
  await test('withdrawal hides bracket immediately and returns home to groups', async () => {
    await admin.getByRole('button', { name: '공개 해제', exact: true }).click();
    await publicPage.getByText('아직 공개된 토너먼트 대진표가 없습니다.').waitFor();
    await home.locator('.s26-groups').waitFor(); assert.equal(await home.locator('.t26-home-toggle').count(), 0);
    assert.equal(await admin.locator('.t26-preview .t26-match').count(), 15);
  });
  await test('no browser runtime errors', () => assert.deepEqual(errors, []));
} finally { await browser?.close(); await vite.close(); }

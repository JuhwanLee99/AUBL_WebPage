import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from '../services/uniqueplay-sync-worker/node_modules/playwright/index.mjs';
import { analyzeGroupPlayoffScenarios } from '../src/features/front/components/season2026/qualificationScenarios.ts';
const teams = Array.from({ length: 5 }, (_, i) => ({ teamId: i + 1, teamName: `검증팀${i + 1}`, wins: [8, 6, 4, 0, 0][i], losses: [0, 2, 4, 6, 6][i], ties: 0 }));
const pending = [0, 1].map(i => ({ id: `p${i}`, homeTeamName: teams[3].teamName, awayTeamName: teams[4].teamName, status: 'scheduled', startTime: '', venue: '' }));
const analysis = analyzeGroupPlayoffScenarios(teams, pending, { includeDrawsInProjection: true });
const rows = teams.map((t, i) => ({ ...t, rank: i + 1, tied: false, winPct: t.wins / (t.wins + t.losses || 1), qualification: i < 2 ? 'current-eutteum' : i < 4 ? 'current-beogeum' : 'out', qualificationLabel: '현재 구간', projection: analysis.projections[i] }));
const groups = [{ group: 'A', rows, source: 'records-api', completedGames: 18, expectedGames: 20, matchups: [{ teamA: '검증팀4', teamB: '검증팀5', completed: 0, scheduled: 0, unscheduled: 2, remaining: 2 }] }, { group: 'B', rows: [], source: 'team-directory', completedGames: 0, expectedGames: 20, matchups: [] }];
const fixture = { landing: { heroBadgeText: '2026 AUBL', heroDescription: '검증', heroSubDescription: '', snapshotCards: [] }, announcement: { enabled: false }, matches: [], groups, notices: [], teamNotices: [], schedulePhase: 'ready', recordPhase: 'ready', noticePhase: 'ready', teamNoticePhase: 'idle', userSignedIn: false, myTeamId: null, myTeamName: null, allstarEnabled: false, nowTs: Date.parse('2026-09-21'), recordPayload: { batters: [], pitchers: [], warnings: [], sourceFreshness: null } };
const vite = await createServer({ configFile: false, envDir: false, cacheDir: '.tmp/ranking-ui-cache', esbuild: { jsx: 'automatic' }, optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-router-dom'] }, server: { host: '127.0.0.1', port: 5193, strictPort: true, watch: null, hmr: false, ws: false }, appType: 'custom', plugins: [{
  name: 'ranking-fixture', resolveId(id) { if (id === '/__ranking-entry') return '\0ranking-entry'; },
  load(id) { if (id !== '\0ranking-entry') return; return `import React from 'react'; import { createRoot } from 'react-dom/client'; import { MemoryRouter, Routes, Route } from 'react-router-dom';
    import Home from '/src/features/front/components/season2026/Season2026Home.tsx';
    import Detail from '/src/features/front/components/season2026/StandingsScenariosView.tsx';
    import '/src/index.css'; import '/src/features/front/styles/season2026-home.css';
    const fixture = ${JSON.stringify(fixture)}; const root = createRoot(document.getElementById('root')); let version = 0;
    window.renderRanking = (path = '/', overrides = {}) => { version++; root.render(React.createElement(MemoryRouter, { initialEntries: [path], key: version }, React.createElement(Routes, null,
      React.createElement(Route, { path: '/', element: React.createElement(Home, { ...fixture, ...overrides }) }),
      React.createElement(Route, { path: '/standings/scenarios', element: React.createElement(Detail, { groups: fixture.groups, checkedAt: fixture.nowTs, ...overrides }) })))); };
    window.renderRanking();`; },
  configureServer(server) { server.middlewares.use('/__ranking', async (_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(await server.transformIndexHtml('/__ranking', '<!doctype html><html lang="ko"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/__ranking-entry"></script></body></html>')); }); },
}] });
let browser;
try {
  await vite.listen(); browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.goto('http://127.0.0.1:5193/__ranking');
  await page.locator('.s26-groups').waitFor();
  await test('home forecast content and all probability columns share the same horizontal alignment', async () => {
    const boxes = await page.locator('.s26-projection-cell').evaluateAll(nodes => nodes.map(n => ({ x: n.getBoundingClientRect().x, width: n.getBoundingClientRect().width, columns: [...n.querySelectorAll('.s26-odds__value')].map(c => c.getBoundingClientRect().x) })));
    assert.equal(boxes.length, 5);
    for (const box of boxes) { assert.equal(box.x, boxes[0].x); assert.equal(box.width, boxes[0].width); assert.deepEqual(box.columns, boxes[0].columns); }
  });
  await test('home has concise statuses and no repeated combination counts; links drill down to the selected team', async () => {
    assert.match(await page.locator('.s26-groups').innerText(), /1위 고정/);
    assert.doesNotMatch(await page.locator('.s26-groups').innerText(), /\(\d+경우\)/);
    assert.equal(await page.locator('.s26-groups .s26-odds__confirmed').count(), 0);
    assert.deepEqual(await page.locator('.s26-projection-cell').first().locator('.s26-odds__value > strong').allTextContents(), ['100%', '0%', '0%']);
    await page.locator('.s26-projection-cell').nth(3).click();
    await page.getByRole('heading', { name: '순위가 바뀌는 조건' }).waitFor();
    assert.equal(await page.locator('.s26-scenarios__team').count(), 1);
    assert.match(await page.locator('.s26-scenarios__team').innerText(), /검증팀4/);
    assert.match(await page.locator('.s26-scenarios__movement').innerText(), /버금권 → 탈락권/);
  });
  await test('team buttons are below groups, sorted by rank and support direct selection', async () => {
    assert.equal(await page.locator('select').count(), 0);
    const buttons = page.getByRole('navigation', { name: '팀 선택' });
    assert.deepEqual(await buttons.locator('button strong').allTextContents(), ['검증팀1', '검증팀2', '검증팀3', '검증팀4', '검증팀5']);
    assert.equal(await buttons.getByRole('button', { name: '4위 검증팀4' }).getAttribute('aria-pressed'), 'true');
    const groupBox = await page.getByRole('navigation', { name: '분석할 조' }).boundingBox();
    const teamBox = await buttons.boundingBox();
    assert.ok(teamBox.y >= groupBox.y + groupBox.height);
    await buttons.getByRole('button', { name: '2위 검증팀2' }).click();
    await page.getByRole('heading', { name: '검증팀2', exact: true }).waitFor();
    await buttons.getByRole('button', { name: '4위 검증팀4' }).click();
  });
  await test('rank example opens and shows the complete representative remaining matchup outcome', async () => {
    await page.locator('.s26-scenarios__case summary').first().click();
    const c = page.locator('.s26-scenarios__case').first();
    assert.match(await c.innerText(), /검증팀4 vs 검증팀5/);
    assert.match(await c.innerText(), /검증팀4 기준 2승 0패 0무/);
    assert.match(await page.locator('.s26-scenarios__hint').innerText(), /이 외의 조건/);
  });
  await test('team filter, group navigation, empty group and direct link', async () => {
    await page.getByRole('button', { name: '전체 팀', exact: true }).click();
    assert.equal(await page.locator('.s26-scenarios__team').count(), 5);
    await page.getByRole('link', { name: 'B조', exact: true }).click();
    assert.equal(await page.locator('.s26-scenarios__team').count(), 0);
    await page.evaluate(() => window.renderRanking('/standings/scenarios?group=A&team=1'));
    await page.getByRole('heading', { name: '검증팀1', exact: true }).waitFor();
    assert.match(await page.locator('.s26-scenarios__status').innerText(), /1위 고정/);
  });
  await test('partial result does not claim fixed ranks and loading/error states hide calculations', async () => {
    const partial = structuredClone(groups); partial[0].rows.forEach(r => r.projection.exhausted = true);
    await page.evaluate(g => window.renderRanking('/standings/scenarios?group=A&team=1', { groups: g }), partial);
    await page.getByText('계산 미완료', { exact: true }).waitFor();
    assert.doesNotMatch(await page.locator('.s26-scenarios__status').innerText(), /고정/);
    assert.equal(await page.locator('.s26-odds__values').count(), 0);
    assert.equal(await page.locator('.s26-odds__confirmed').count(), 0);
    await page.evaluate(() => window.renderRanking('/standings/scenarios', { loading: true }));
    await page.getByRole('status').waitFor(); assert.equal(await page.locator('.s26-scenarios__team').count(), 0);
    await page.evaluate(() => window.renderRanking('/standings/scenarios', { error: '조회 실패' }));
    await page.getByRole('alert').waitFor(); assert.equal(await page.locator('.s26-scenarios__team').count(), 0);
  });
  await test('tie explanation spells out deciding game instead of conditional jargon', async () => {
    const tied = structuredClone(groups);
    tied[0].rows[3].projection.rankCases.forEach(c => { c.conditional = true; c.reasons = ['결정경기 필요']; });
    await page.evaluate(g => window.renderRanking('/standings/scenarios?group=A&team=4', { groups: g }), tied);
    await page.locator('.s26-scenarios__case summary').first().waitFor();
    assert.match(await page.locator('.s26-scenarios__case summary').first().innerText(), /4위 조건.*결정경기 필요/);
    await page.locator('.s26-scenarios__case summary').first().click();
    assert.match(await page.locator('.s26-scenarios__case').first().innerText(), /별도 결정경기의 승패/);
    assert.doesNotMatch(await page.locator('main').innerText(), /추가 판정 조건부|이 결과 조합에서 도달/);
  });
  await test('bucket shares show weighted uncertainty ranges and the equal-outcome assumption', async () => {
    await page.evaluate(() => window.renderRanking('/standings/scenarios?group=A&team=4'));
    await page.getByRole('heading', { name: '검증팀4', exact: true }).waitFor();
    assert.deepEqual(await page.locator('.s26-odds__value > strong').allTextContents(), ['0%', '33.3~66.7%', '33.3~66.7%']);
    assert.match(await page.locator('.s26-odds').innerText(), /승·패·무가 각각 1\/3/);
    assert.match(await page.locator('.s26-odds').innerText(), /팀 전력을 반영한 승부 예측은 아닙니다/);
    assert.match(await page.locator('.s26-odds').innerText(), /33.3%는/);
  });
  await test('official confirmation wins over contradictory calculations without displaying misleading shares', async () => {
    const official = structuredClone(groups); official[0].rows[0].qualification = 'confirmed-beogeum';
    await page.evaluate(g => window.renderRanking('/standings/scenarios?group=A&team=1', { groups: g }), official);
    await page.getByRole('heading', { name: '검증팀1', exact: true }).waitFor();
    assert.match(await page.locator('.s26-odds__confirmed').innerText(), /버금권 확정\s*공식/);
    assert.equal(await page.locator('.s26-odds__values').count(), 0);
    assert.equal(await page.locator('.s26-scenarios__case').count(), 0);
  });
  await mkdir('.tmp', { recursive: true });
  for (const width of [390, 1280]) await test(`detail readable without page overflow at ${width}px`, async () => {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => window.renderRanking('/standings/scenarios?group=A&team=4'));
    await page.getByRole('heading', { name: '검증팀4', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: `.tmp/ranking-detail-${width}.png`, fullPage: true });
  });
  assert.deepEqual(errors, []);
} finally { await browser?.close(); await vite.close(); }

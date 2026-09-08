import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import path from 'node:path';
import { koreaBattingFixture, kyungheeBattingFixture } from './fixtures/official-batting-flow.mjs';

const fixture = {
  sourceGameId: 'up-view-fixture', backendGameId: 1, seasonId: 12, provider: 'UNIQUE_PLAY',
  syncRevision: 'fixture-revision', capturedAt: '2026-09-05T13:00:00', publishedAt: '2026-09-05T15:29:00', status: 'AVAILABLE',
  quality: 'CORRECTION_PENDING', issues: [], resolutionSource: null, resolvedAt: null,
  game: { status: 'COMPLETED', playedAt: '2026-09-04T06:00:00Z', groupCode: 'A', venue: '테스트 구장', awayTeamName: '원정대학교 아주 긴 팀명', homeTeamName: '홈대학교 야구부', awayScore: 3, homeScore: 0 },
  detail: { schemaVersion: 1, sourceGameId: 'up-view-fixture', providerGameId: 'fixture', status: 'AVAILABLE', teams: [
    { teamName: '원정대학교 아주 긴 팀명', innings: [{ inning: 1, runs: 3, notPlayed: false }, { inning: 2, runs: null, notPlayed: false }], totals: { runs: 3, hits: 1, errors: null, walks: 0 },
      batters: [{ rowKey: 'b1', playerName: '원정타자', jerseyNumber: '0', battingOrder: 1, position: '유격', stats: { atBats: 2, hits: 1, rbi: 0, runs: 1, stolenBases: null, battingAverage: 0.5, seasonBattingAverage: null }, plateAppearances: [{ inning: 1, result: '좌안,도루,폭투' }, { inning: 1, result: '볼넷' }, { inning: 2, result: '삼진' }, { inning: null, result: '<script>표기</script>' }] }],
      pitchers: [{ rowKey: 'p1', playerName: '원정투수', jerseyNumber: '99', decision: '승', stats: { outs: 5, inningsPitched: '1.2', hitsAllowed: 0, runsAllowed: 0, earnedRuns: 0, walksAndHitByPitch: null, strikeouts: 2, era: 0 } }] },
    { teamName: '홈대학교 야구부', innings: [{ inning: 1, runs: 0, notPlayed: false }, { inning: 2, runs: null, notPlayed: true }], totals: { runs: 0, hits: 0, errors: 1, walks: null }, batters: [], pitchers: [] },
  ] },
};
const storageKey = 'aubl:official-game-view:v1';
const browserTests = process.argv.includes('--browser');
const vite = await createServer({
  configFile: false, envDir: false, cacheDir: '.tmp/official-game-view-test-cache',
  esbuild: { jsx: 'automatic' },
  resolve: { alias: { '@core': path.resolve('src/core'), '@shared': path.resolve('src/shared') } },
  optimizeDeps: { noDiscovery: true, include: browserTests ? ['react', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime'] : [] },
  server: { middlewareMode: !browserTests, host: '127.0.0.1', port: 5188, strictPort: true, watch: null, hmr: false, ws: false },
  appType: 'custom',
  plugins: [{
    name: 'isolated-official-record-fixture',
    resolveId(id) { if (id === '/__record-view-entry') return '\0record-view-entry'; },
    load(id) {
      if (id !== '\0record-view-entry') return;
      return `import React from 'react'; import { createRoot } from 'react-dom/client';
        import { OfficialGameDetailView } from '/src/features/scoreboard/components/OfficialGameDetailView.tsx';
        import '/src/index.css'; import '/src/features/scoreboard/pages/ScoreboardTextPage.css';
        const root = createRoot(document.getElementById('root')); const fixture = ${JSON.stringify(fixture)};
        window.changeFixtureGame = sourceGameId => root.render(React.createElement(OfficialGameDetailView, { payload: { ...fixture, sourceGameId }, onRetry() {} }));
        window.changeFixtureGame(fixture.sourceGameId);`;
    },
    configureServer(server) {
      server.middlewares.use('/__record-view-fixture', async (_req, res) => {
        res.setHeader('Content-Type', 'text/html');
        res.end(await server.transformIndexHtml('/__record-view-fixture', '<!doctype html><html lang="ko"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/__record-view-entry"></script></body></html>'));
      });
    },
  }],
});
try {
  if (browserTests) await vite.listen();
  const { OfficialGameDetailView, OfficialGameDetailContent } = await vite.ssrLoadModule('/src/features/scoreboard/components/OfficialGameDetailView.tsx');
  const { buildOfficialLegacyRecord } = await vite.ssrLoadModule('/src/features/scoreboard/model/officialLegacyRecord.ts');
  const { buildOfficialBattingFlow } = await vite.ssrLoadModule('/src/features/scoreboard/model/officialBattingFlow.ts');
  const render = (mode, payload = fixture) => {
    globalThis.window = { localStorage: { getItem: () => mode }, matchMedia: () => ({ matches: false }) };
    try { return renderToStaticMarkup(createElement(OfficialGameDetailContent, { payload, viewMode: mode, onViewChange() {}, onRetry() {} })); }
    finally { delete globalThis.window; }
  };
  await test('official data always defaults to details, ignoring all previous stored preferences', () => {
    for (const preference of [null, 'future', 'detail', 'commentary']) {
      globalThis.window = { localStorage: { getItem: () => preference } };
      try {
        const html = renderToStaticMarkup(createElement(OfficialGameDetailView, { payload: fixture, onRetry() {} }));
        assert.match(html, /official-game-detail--detail/);
        assert.match(html, /aria-pressed="true">상세 기록/);
        assert.doesNotMatch(html, /official-game-detail--commentary/);
      } finally { delete globalThis.window; }
    }
  });
  await test('both layouts preserve the same team tables, 0, missing values and source innings', () => {
    for (const mode of ['detail', 'commentary']) {
      const html = render(mode);
      assert.equal((html.match(/<table/g) ?? []).length, 5);
      for (const text of ['원정타자', '원정투수', '1.2', '좌안,도루,폭투', '#0', 'fixture-revision', '오류 수정 중']) assert.ok(html.includes(text), `${mode}: ${text}`);
      assert.match(html, /<td>0<\/td>/);
      assert.match(html, /<td>—<\/td>/);
      assert.ok(html.includes('공격하지 않음') || html.includes('×'));
      assert.doesNotMatch(html, /<script>표기<\/script>/);
    }
  });
  await test('commentary reuses the production scoreboard, now-playing, summary, stats and scorecard components', () => {
    const html = render('commentary');
    assert.match(html, /aria-pressed="true">문자중계 스타일/);
    assert.match(html, /이전 이닝에서 이어지는 타순과 타자일순/);
    for (const selector of ['scoreboard-panel__score-grid', 'scoreboard-panel__game-grid', 'scoreboard-panel__last-play', 'now-playing-card', 'live-feed-section game-over', 'stats-table-card--compact', 'removed-players-grid', 'csv-preview']) assert.ok(html.includes(selector), selector);
    assert.match(html, /투구별 문자중계 미제공/);
    assert.match(html, /이닝 미상/);
    assert.doesNotMatch(html, /0구|0타수 0안타|실시간 자동 집계|퇴장 선수 없음|official-commentary__layout/);
  });
  await test('unavailable and review-blocked details cannot be exposed by a saved view preference', () => {
    for (const mode of ['detail', 'commentary']) for (const status of ['NOT_COLLECTED', 'NOT_PUBLISHED', 'REVIEW_REQUIRED']) {
      const html = render(mode, { ...fixture, status });
      assert.doesNotMatch(html, /<table|원정타자|경기 기록 화면 방식/);
      assert.match(html, /기존 AUBL 수기 기록/);
    }
  });
  await test('quality resolved notice remains in both layouts', () => {
    for (const mode of ['detail', 'commentary']) {
      const html = render(mode, { ...fixture, quality: 'RESOLVED', resolutionSource: 'SOURCE' });
      assert.match(html, /오류 해결/);
      assert.match(html, /UniquePlay 재동기화/);
    }
  });
  await test('KST display does not depend on viewer timezone and disabled storage is safe', () => {
    const oldTimezone = process.env.TZ;
    process.env.TZ = 'America/Los_Angeles';
    try {
      assert.match(render('detail'), /오후 03:29/);
      globalThis.window = { localStorage: { getItem() { throw new Error('unavailable'); } } };
      assert.match(renderToStaticMarkup(createElement(OfficialGameDetailView, { payload: fixture, onRetry() {} })), /official-game-detail--detail/);
    } finally {
      delete globalThis.window;
      if (oldTimezone === undefined) delete process.env.TZ;
      else process.env.TZ = oldTimezone;
    }
  });
  await test('legacy adapter never derives uncollected stats, pitch order or innings from strings', () => {
    const original = JSON.stringify(fixture);
    const record = buildOfficialLegacyRecord(fixture);
    const batter = record.tableRows[0].batters[0];
    assert.equal(batter.rbi, 0);
    assert.equal(batter.pa, '—');
    assert.equal(batter.hr, '—');
    assert.equal(batter.bb, '—');
    assert.equal(batter.obp, '—');
    assert.equal(record.tableRows[0].pitchers[0].outsIp, '1.2');
    assert.equal(record.tableRows[0].pitchers[0].era, '0.00');
    assert.equal(record.tableRows[0].pitchers[0].pitchCombo, '—');
    assert.equal(record.tableRows[0].pitchers[0].appearanceLabel, '—'); // Win/loss is not a starting/relief appearance label.
    assert.equal(record.boxScore.rows[0].errors, '—');
    assert.equal(record.boxScore.rows[1].innings[1], '×');
    assert.ok(record.sections.flatMap(section => section.items).every(item => item.half === null));
    assert.equal(JSON.stringify(fixture), original);
  });
  await test('legacy source projection keeps away/home order independently of source tab order', () => {
    const record = buildOfficialLegacyRecord({ ...fixture, detail: { ...fixture.detail, teams: [...fixture.detail.teams].reverse() } });
    assert.equal(record.boxScore.rows[0].name, fixture.game.awayTeamName);
    assert.equal(record.tableRows[0].teamName, fixture.game.awayTeamName);
    assert.equal(record.summary.totals.away.runs, 3);
    assert.equal(record.summary.totals.home.runs, 0);
  });
  await test('existing live stats preserve pitch data and require explicit earned-run confirmation', async () => {
    const { default: StatsTable } = await vite.ssrLoadModule('/src/shared/components/StatsTable.tsx');
    const { NowPlayingCard } = await vite.ssrLoadModule('/src/features/scoreboard/components/LegacyTextComponents.tsx');
    const row = { name: '기존투수', bf: 7, pitches: 25, strikes: 15, balls: 10, outs: 5, h: 1, hr: 0, bb: 0, hbp: 0, so: 3, r: 1, er: 1, appearanceOrder: 0 };
    const html = renderToStaticMarkup(createElement(StatsTable, { title: '기존 투수', stats: [row], variant: 'pitcher' }));
    assert.match(html, /실시간 자동 집계/);
    assert.match(html, /25 \(15\/10\)/);
    assert.match(html, /1\.2/);
    assert.match(html, /미확정/);
    assert.doesNotMatch(html, /5\.40/);
    const confirmed = renderToStaticMarkup(createElement(StatsTable, {
      title: '확인된 투수', stats: [{ ...row, earnedRunsStatus: 'confirmed' }], variant: 'pitcher',
    }));
    assert.match(confirmed, /5\.40/);
    assert.match(confirmed, /기록원 확인/);
    const now = renderToStaticMarkup(createElement(NowPlayingCard, { batter: '타자', pitcher: '투수', balls: 2, strikes: 1,
      batterToday: { pa: 2, ab: 2, hits: 1, hr: 0, doubles: 0, triples: 0, bb: 0, hbp: 0, so: 1, sac: 0 },
      pitcherToday: { bf: 7, outs: 5, hits: 1, hr: 0, bb: 0, hbp: 0, so: 3, pitches: 25, strikes: 15, balls: 10 } }));
    assert.match(now, /2타수 1안타/);
    assert.match(now, /볼 2, 스트라이크 1/);
    assert.doesNotMatch(now, /미제공/);
  });

  const orders = flow => flow.map(inning => inning.appearances.map(entry => entry.row.battingOrder));
  await test('Korea: carries the last batter across innings and splits a 14-PA bat-around', () => {
    const before = JSON.stringify(koreaBattingFixture);
    const flow = buildOfficialBattingFlow(koreaBattingFixture);
    assert.ok(flow.every(inning => inning.mode === 'reconstructed'));
    assert.deepEqual(orders(flow), [[1, 2, 3], [4, 5, 6, 7, 8, 9, 1, 2, 3, 4, 5, 6, 7, 8], [9, 1, 2, 3], [4, 5, 6, 7], [8, 9, 1, 2, 3]]);
    assert.deepEqual(flow[1].appearances.map(entry => entry.result), ['사구', '2직', '좌2', '삼진', '3실', '볼넷', '우중3', '볼넷', '볼넷', '사구', '좌안', '좌안', '사구', '삼진']);
    assert.equal(flow[1].nextOrder, 9);
    assert.deepEqual(flow[0].appearances[2].context, ['도루', '도루자']);
    assert.deepEqual(flow[1].appearances[0].context, ['송구실책']);
    assert.equal(JSON.stringify(koreaBattingFixture), before);
    // No mutation of the all-null statistics or generated PA for an empty substitute row.
    assert.ok(flow.every(inning => inning.appearances.every(entry => entry.row.playerName !== '정인웅')));
  });
  await test('Kyunghee: each team has its own next batter; leading wild pitch is not another PA', () => {
    const flow = buildOfficialBattingFlow(kyungheeBattingFixture);
    assert.deepEqual(orders(flow), [[1, 2, 3, 4], [5, 6, 7, 8], [9, 1, 2, 3, 4, 5], [6, 7, 8, 9, 1, 2], [3, 4, 5, 6, 7, 8]]);
    assert.equal(flow[2].appearances[2].result, '우안');
    assert.deepEqual(flow[2].appearances[2].context, ['폭투', '도루']);
  });
  await test('adapter feeds reconstructed sequence into the original replay but preserves raw CSV and stats', () => {
    const payload = { ...fixture, game: { ...fixture.game, homeTeamName: kyungheeBattingFixture.teamName, awayTeamName: koreaBattingFixture.teamName }, detail: { ...fixture.detail, teams: [kyungheeBattingFixture, koreaBattingFixture] } };
    const record = buildOfficialLegacyRecord(payload);
    const second = record.sections.find(section => section.inning === 2);
    assert.match(second.items[0].text, /고려대학교 백구회 · 4번부터 · 14타석/);
    assert.deepEqual(second.items.filter(item => item.type === 'batter').map(item => item.order), [4, 5, 6, 7, 8, 9, 1, 2, 3, 4, 5, 6, 7, 8, 5, 6, 7, 8]);
    assert.ok(second.items.filter(item => item.type === 'batter').every(item => item.reconstructedPlateAppearance));
    assert.match(record.csv, /사구,송구실책,사구/);
    assert.equal(record.tableRows[0].batters[0].pa, '—');
    assert.equal(record.tableRows[0].batters[0].rbi, null);
    assert.equal(new Set(record.sections.flatMap(section => section.items.map(item => item.key))).size, record.sections.flatMap(section => section.items).length);
  });
  await test('missing lineup slot, unknown notation, unknown inning or a gap never fabricate a timeline', () => {
    const variants = [
      team => { team.batters[4].plateAppearances = team.batters[4].plateAppearances.filter(entry => entry.inning !== 2); },
      team => { team.batters[3].plateAppearances[0].result = '새로운미분류결과'; },
      team => { team.batters[3].battingOrder = null; },
      team => { team.batters[0].plateAppearances[0].inning = null; },
      team => { team.batters.forEach(row => { row.plateAppearances = row.plateAppearances.filter(entry => entry.inning !== 1); }); },
    ];
    for (const change of variants) {
      const team = structuredClone(koreaBattingFixture); change(team);
      const flow = buildOfficialBattingFlow(team);
      const second = flow.find(inning => inning.inning === 2);
      assert.equal(second.mode, 'source');
      assert.deepEqual(second.appearances, []);
      assert.ok(second.reason);
      assert.equal(flow.find(inning => inning.inning === 3).mode, 'source');
    }
  });
  await test('substitute PA ambiguity falls back; between-inning substitutions and runner-only notes remain safe', () => {
    const ambiguous = structuredClone(koreaBattingFixture);
    ambiguous.batters[9].plateAppearances = [{ inning: 2, result: '삼진' }];
    assert.match(buildOfficialBattingFlow(ambiguous)[1].reason, /교체 순서/);
    const replacement = structuredClone(koreaBattingFixture);
    replacement.batters[9].plateAppearances = replacement.batters[8].plateAppearances.filter(entry => entry.inning >= 3);
    replacement.batters[8].plateAppearances = replacement.batters[8].plateAppearances.filter(entry => entry.inning < 3);
    replacement.batters[9].plateAppearances.unshift({ inning: 2, result: '대주자,도루' });
    const flow = buildOfficialBattingFlow(replacement);
    assert.ok(flow.every(inning => inning.mode === 'reconstructed'));
    assert.equal(flow[1].appearances.length, 14);
    assert.equal(flow[1].contextEntries[0].result, '대주자,도루');
    assert.equal(flow[2].appearances[0].row.playerName, '정인웅');
  });
  await test('three lineup rounds and collected sacrifice/interference/dropped-third-strike notations', () => {
    const team = structuredClone(koreaBattingFixture);
    team.batters = team.batters.slice(0, 9);
    const notation = ['투희번,좌희플출,낫아웃+', '타격방해,3번안,고의사구', '2직병,투희번출,낫아웃-'];
    team.batters.forEach((row, index) => { row.plateAppearances = [{ inning: 1, result: notation[index % 3] }]; });
    const [flow] = buildOfficialBattingFlow(team);
    assert.equal(flow.mode, 'reconstructed');
    assert.deepEqual(flow.appearances.map(entry => entry.row.battingOrder), [...Array(3)].flatMap(() => [1, 2, 3, 4, 5, 6, 7, 8, 9]));
    assert.equal(flow.nextOrder, 1);
  });

  if (browserTests) {
    const { chromium } = await import('../services/uniqueplay-sync-worker/node_modules/playwright/index.mjs');
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      // This fixture mounts only the public view component. It has no auth, API or Firestore access.
      await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
      const url = `http://127.0.0.1:${vite.httpServer.address().port}/__record-view-fixture`;
      await page.goto(url);
      const detail = page.getByRole('button', { name: '상세 기록', exact: true });
      const commentary = page.getByRole('button', { name: '문자중계 스타일', exact: true });
      try { await commentary.waitFor({ timeout: 15000 }); }
      catch (error) { throw new Error(`Fixture did not mount. Browser errors: ${JSON.stringify(errors)}`, { cause: error }); }
      await test('browser: keyboard toggle, original replay controls, scorecard tabs, fullscreen and detail-first reload', async () => {
        assert.equal(await detail.getAttribute('aria-pressed'), 'true');
        await page.evaluate(key => localStorage.setItem(key, 'commentary'), storageKey);
        await commentary.focus();
        await page.keyboard.press('Enter');
        assert.equal(await commentary.getAttribute('aria-pressed'), 'true');
        assert.equal(await page.locator('.scoreboard-section .scoreboard-panel').count(), 1);
        assert.equal(await page.locator('.now-playing-card').count(), 1);
        await page.getByRole('button', { name: '문자중계 접기', exact: true }).click();
        await page.getByRole('button', { name: '문자중계 불러오기', exact: true }).click();
        await page.getByRole('button', { name: '홈대학교 야구부 (홈)', exact: true }).click();
        assert.doesNotMatch(await page.locator('.csv-preview').innerText(), /원정타자/);
        await page.getByRole('button', { name: '원정대학교 아주 긴 팀명 (원정)', exact: true }).click();
        assert.match(await page.locator('.csv-preview').innerText(), /좌안,도루,폭투/);
        await page.getByRole('button', { name: '전광판 크게 보기', exact: true }).click();
        assert.equal(await page.getByRole('dialog').isVisible(), true);
        await page.keyboard.press('Escape');
        assert.equal(await page.getByRole('dialog').isVisible(), false);
        await page.reload();
        await commentary.waitFor();
        assert.equal(await detail.getAttribute('aria-pressed'), 'true');
        assert.equal(await page.locator('table').count(), 5);
        // The retired setting is ignored; the view does not touch local storage.
        assert.equal(await page.evaluate(key => localStorage.getItem(key), storageKey), 'commentary');
      });
      await test('browser: another game and returning to the first game each start at details', async () => {
        await commentary.click();
        await page.evaluate(() => window.changeFixtureGame('up-other-fixture'));
        await page.waitForFunction(() => document.querySelector('.official-game-detail--detail'));
        assert.equal(await detail.getAttribute('aria-pressed'), 'true');
        await commentary.click();
        await page.evaluate(() => window.changeFixtureGame('up-view-fixture'));
        await page.waitForFunction(() => document.querySelector('.official-game-detail--detail'));
        assert.equal(await detail.getAttribute('aria-pressed'), 'true');
      });
      for (const width of [360, 390, 768, 1280, 1920]) for (const theme of ['light', 'dark']) for (const mode of ['detail', 'commentary']) {
        await test(`browser: ${width}px ${theme} ${mode} layout and touch targets`, async () => {
          await page.setViewportSize({ width, height: 900 });
          await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
          await (mode === 'detail' ? detail : commentary).click();
          await page.evaluate(() => document.fonts.ready);
          const size = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
          assert.ok(size.scroll <= size.width + 1, `horizontal overflow ${JSON.stringify(size)}`);
          for (const button of [detail, commentary]) {
            const box = await button.boundingBox();
            assert.ok(box.height >= 44, `small touch target: ${JSON.stringify(box)}`);
          }
          const colors = await page.locator('.official-game-detail__view-toggle [aria-pressed="true"]').evaluate(el => ({ text: getComputedStyle(el).color, bg: getComputedStyle(el).backgroundColor }));
          const luminance = color => {
            const values = color.match(/\d+(?:\.\d+)?/g).slice(0, 3).map(Number).map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
            return values[0] * .2126 + values[1] * .7152 + values[2] * .0722;
          };
          const [low, high] = [luminance(colors.text), luminance(colors.bg)].sort((a, b) => a - b);
          assert.ok((high + .05) / (low + .05) >= 4.5, `toggle contrast ${JSON.stringify(colors)}`);
          if ([360, 1280, 1920].includes(width)) await page.screenshot({ path: `.tmp/official-game-${mode}-${theme}-${width}.png`, fullPage: true });
        });
      }
      await test('browser: blocked storage still allows toggling; no browser errors', async () => {
        await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('blocked'); }; });
        await detail.click(); await commentary.click();
        assert.equal(await commentary.getAttribute('aria-pressed'), 'true');
        assert.deepEqual(errors, []);
      });
    } finally { await browser.close(); }
  }
} finally { await vite.close(); }

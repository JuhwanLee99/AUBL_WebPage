import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
import { chromium } from '../services/uniqueplay-sync-worker/node_modules/playwright/index.mjs';

// Public component fixtures only: never connect to Firebase, production APIs,
// UniquePlay or the user's signed-in browser while testing match selection.
const nowTs = Date.parse('2026-09-05T18:00:00+09:00');
const fixture = {
  landing: { heroBadgeText: '2026 AUBL', heroDescription: '시즌 안내', heroSubDescription: '', snapshotCards: [] },
  announcement: { enabled: false }, matches: [], groups: [], notices: [], teamNotices: [],
  schedulePhase: 'ready', scheduleCheckedAt: nowTs, recordPhase: 'ready',
  noticePhase: 'ready', teamNoticePhase: 'idle', userSignedIn: false,
  myTeamId: null, myTeamName: null, allstarEnabled: false, nowTs,
  recordPayload: { batters: [], pitchers: [], warnings: [], sourceFreshness: null },
};
const game = (id, startTime, status = 'scheduled', changes = {}) => ({
  id, startTime, status, recordMode: 'official', homeTeamName: `${id} 홈팀`,
  awayTeamName: `${id} 원정팀`, venue: '테스트 야구장', ...changes,
});
const morning = game('today-final', '2026-09-05T09:00:00+09:00', 'completed', { homeScore: 2, awayScore: 7 });
const evening = game('today-next', '2026-09-05T18:00:00+09:00');
const yesterday = game('yesterday', '2026-09-04T14:00:00+09:00', 'completed', { homeScore: 0, awayScore: 1 });
const tomorrow = game('tomorrow', '2026-09-06T09:00:00+09:00');

const vite = await createServer({
  configFile: false, envDir: false, cacheDir: '.tmp/season-home-matches-test-cache', esbuild: { jsx: 'automatic' },
  optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-router-dom'] },
  server: { host: '127.0.0.1', port: 5187, strictPort: true, watch: null, hmr: false, ws: false }, appType: 'custom',
  plugins: [{
    name: 'season-home-matches-fixture',
    resolveId(id) { if (id === '/__matches-entry') return '\0matches-entry'; },
    load(id) {
      if (id !== '\0matches-entry') return;
      return `import React from 'react'; import { createRoot } from 'react-dom/client'; import { MemoryRouter } from 'react-router-dom';
        import Home from '/src/features/front/components/season2026/Season2026Home.tsx';
        import '/src/index.css'; import '/src/features/front/styles/season2026-home.css';
        const root = createRoot(document.getElementById('root')); const fixture = ${JSON.stringify(fixture)};
        window.updateHomeFixture = (changes, version) => root.render(React.createElement('div', {'data-fixture-version': version},
          React.createElement(MemoryRouter, null, React.createElement(Home, {...fixture, ...changes}))));
        window.updateHomeFixture({}, 0);`;
    },
    configureServer(server) {
      server.middlewares.use('/__matches-fixture', async (_req, res) => {
        res.setHeader('Content-Type', 'text/html');
        res.end(await server.transformIndexHtml('/__matches-fixture', '<!doctype html><html lang="ko"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/__matches-entry"></script></body></html>'));
      });
    },
  }],
});
let browser;
try {
  await vite.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ timezoneId: 'America/Los_Angeles', viewport: { width: 1280, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.goto('http://127.0.0.1:5187/__matches-fixture');
  await page.locator('.s26-match-board').waitFor();
  let version = 0;
  const render = async changes => {
    version += 1;
    await page.evaluate(({ changes, version }) => window.updateHomeFixture(changes, version), { changes, version });
    await page.locator(`[data-fixture-version="${version}"]`).waitFor();
  };
  const featured = page.locator('.s26-match-board__columns > div').nth(0);
  const recent = page.locator('.s26-match-board__columns > div').nth(1);
  const ids = locator => locator.locator('.s26-match-card__detail').evaluateAll(nodes => nodes.map(n => n.getAttribute('href').split('/').at(-1)));

  await test('score synchronization keeps today game in both today and recent results without duplication inside either list', async () => {
    await render({ matches: [{ ...morning, status: 'scheduled', homeScore: null, awayScore: null }, evening, yesterday, tomorrow] });
    assert.deepEqual(await ids(featured), [morning.id, evening.id]);
    assert.deepEqual(await ids(recent), [yesterday.id]);
    await render({ matches: [evening, tomorrow, morning, yesterday] });
    assert.equal(await featured.locator('h3').innerText(), '오늘의 경기');
    assert.deepEqual(await ids(featured), [morning.id, evening.id]);
    assert.deepEqual(await ids(recent), [morning.id, yesterday.id]);
    const card = featured.locator('.s26-match-card').first();
    assert.equal(await card.locator('.s26-match-state').innerText(), '경기 종료');
    assert.deepEqual(await card.locator('.s26-match-card__teams b').allTextContents(), ['2', '7']);
  });

  await test('when every today game is final, today is not replaced with tomorrow', async () => {
    await render({ matches: [tomorrow, { ...evening, status: 'completed', homeScore: 0, awayScore: 0 }, morning] });
    assert.equal(await featured.locator('h3').innerText(), '오늘의 경기');
    assert.deepEqual(await ids(featured), [morning.id, evening.id]);
    assert.deepEqual(await featured.locator('.s26-match-card').last().locator('.s26-match-card__teams b').allTextContents(), ['0', '0']);
  });

  const busyDay = Array.from({ length: 6 }, (_, index) => game(`day-${index}`, `2026-09-05T${String(9 + index).padStart(2, '0')}:00:00+09:00`,
    ['completed', 'completed', 'inProgress', 'scheduled', 'canceled', 'scheduled'][index], { homeScore: 0, awayScore: 2 }));
  await test('all today games remain chronological across states, even over four; off-day live games do not displace them', async () => {
    await render({ matches: [{ ...yesterday, status: 'inProgress' }, ...[...busyDay].reverse(), tomorrow] });
    assert.equal(await featured.locator('h3').innerText(), '오늘의 경기');
    assert.deepEqual(await ids(featured), busyDay.map(g => g.id));
    assert.match(await featured.locator('.s26-subheading').innerText(), /6경기/);
    assert.deepEqual(await featured.locator('.s26-match-state').allTextContents(), ['경기 종료', '경기 종료', '진행 중', '경기 예정', '취소', '경기 예정']);
  });

  await test('when there is no today game, nearest scheduled day and existing live fallback remain available', async () => {
    await render({ matches: [tomorrow, yesterday, { ...yesterday, id: 'stale-scheduled', status: 'scheduled' }, game('later', '2026-09-07T09:00:00+09:00')] });
    assert.deepEqual(await ids(featured), [tomorrow.id]);
    assert.match(await featured.locator('h3').innerText(), /다음 경기/);
    await render({ matches: [tomorrow, { ...yesterday, status: 'inProgress' }] });
    assert.equal(await featured.locator('h3').innerText(), '지금 진행 중인 경기');
    assert.deepEqual(await ids(featured), [yesterday.id, tomorrow.id]);
  });

  await test('KST midnight determines today even in a US browser, and the list changes at the next KST midnight', async () => {
    const dates = [
      game('before', '2026-09-04T14:59:59Z', 'completed'),
      game('midnight', '2026-09-04T15:00:00Z', 'completed'),
      game('last-second', '2026-09-05T14:59:59Z', 'completed'),
      game('next-midnight', '2026-09-05T15:00:00Z', 'completed'),
    ];
    await render({ matches: dates, nowTs: Date.parse('2026-09-04T15:00:00Z') });
    assert.deepEqual(await ids(featured), ['midnight', 'last-second']);
    await render({ matches: dates, nowTs: Date.parse('2026-09-05T15:00:00Z') });
    assert.deepEqual(await ids(featured), ['next-midnight']);
  });

  await test('deleted, practice and other-season games stay excluded; recent results retain their four-game cap', async () => {
    const past = Array.from({ length: 5 }, (_, i) => game(`past-${i}`, `2026-09-0${i + 1}T08:00:00+09:00`, 'completed'));
    await render({ matches: [...past, { ...morning, id: 'deleted', deleted: true }, { ...morning, id: 'practice', recordMode: 'practice' }, game('old-season', '2025-09-05T09:00:00+09:00', 'completed')] });
    assert.deepEqual(await ids(featured), ['past-4']);
    assert.deepEqual(await ids(recent), ['past-4', 'past-3', 'past-2', 'past-1']);
    await render({ matches: [yesterday] });
    assert.deepEqual(await ids(featured), []);
    assert.match(await featured.innerText(), /등록된 예정 경기가 없습니다/);
  });

  await test('calendar and list both keep completed today games with their detail links', async () => {
    await render({ matches: [morning, evening] });
    await page.getByRole('button', { name: '달력 보기', exact: true }).click();
    const agenda = page.locator('.s26-calendar__agenda');
    await agenda.waitFor();
    assert.deepEqual(await ids(agenda), [morning.id, evening.id]);
    assert.match(await agenda.locator('.s26-match-card').first().innerText(), /경기 종료/);
    await page.getByRole('button', { name: '목록 보기', exact: true }).click();
    assert.deepEqual(await ids(featured), [morning.id, evening.id]);
    assert.deepEqual(await ids(recent), [morning.id]);
  });

  for (const width of [360, 768, 1280]) for (const theme of ['light', 'dark']) {
    await test(`today list ${width}px ${theme}: six games, no overflow and accessible detail links`, async () => {
      await render({ matches: busyDay });
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
      await page.evaluate(() => document.fonts.ready);
      const bounds = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
      assert.ok(bounds.scroll <= bounds.client + 1, JSON.stringify(bounds));
      assert.equal(await featured.locator('.s26-match-card').count(), 6);
      const detail = featured.locator('.s26-match-card__detail').first();
      assert.ok((await detail.boundingBox()).height >= 44);
      await detail.focus();
      assert.equal(await detail.evaluate(node => node === document.activeElement), true);
    });
  }
  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  await vite.close();
}

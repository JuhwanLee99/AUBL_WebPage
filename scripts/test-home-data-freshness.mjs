import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { chromium } from '../services/uniqueplay-sync-worker/node_modules/playwright/index.mjs';

// Exercise the actual LandingPage -> loadFullSchedule -> FreshnessBar flow.
// Only Firebase/auth/content/API boundaries are stubbed; all external traffic
// and every write operation are blocked. No user's browser/session is used.
const virtual = new Map([
  ['fixture-state', `
    export let scenario = {};
    export const telemetry = { reads: 0, writes: 0, results: [] };
    export const configure = value => { scenario = value; telemetry.reads = 0; telemetry.writes = 0; telemetry.results = []; };
  `],
  ['fixture-firestore', `
    import { scenario, telemetry } from '/fixture-state';
    export const collection = (...parts) => parts;
    export const doc = collection, query = collection, where = collection, limit = collection, orderBy = collection;
    export const getDocs = async () => {
      telemetry.reads++;
      if (scenario.read === 'error') throw new Error('fixture permission/network failure');
      return { metadata: { fromCache: scenario.read === 'cache' }, docs: (scenario.games ?? []).map(game => ({ id: game.id, data: () => game })) };
    };
    export const getDoc = getDocs;
    export const onSnapshot = (_query, next) => { next({ docs: [] }); return () => {}; };
    export const setDoc = () => { telemetry.writes++; throw new Error('Writes forbidden in fixture'); };
    export const runTransaction = setDoc;
  `],
  ['fixture-firebase', `export const auth = { currentUser: null }; export const firestore = {};`],
  ['fixture-auth', `export const useAuth = () => ({ user: null });`],
  ['fixture-role', `export const useTeamRole = () => ({ isCoach: false, coachTeamId: null });`],
  ['fixture-memberships', `export const getMembershipsByUid = async () => ({ empty: true, docs: [] });`],
  ['fixture-flags', `export const useFeatureFlags = () => ({ allstarEnabled: false });`],
  ['fixture-content', `
    const content = { landing: { heroBadgeText: '2026 AUBL', heroDescription: '시즌 안내', heroSubDescription: '', snapshotCards: [] }, announcement: { enabled: false }, teams: { entries: [] } };
    export const useContent = () => ({ content });
  `],
  ['fixture-api', `
    import { scenario } from '/fixture-state';
    export const getSeasons = async () => {
      if (scenario.apiError) throw new Error('fixture API unavailable');
      return [{ id: 12, year: 2026 }];
    };
    export const getSeasonPublicOverview = async () => ({
      groups: 'ABCDEFGH'.split('').map((group, i) => ({ groupCode: group, standings: [{
        teamId: i + 1, teamName: group + '팀', group, rank: 1, wins: 1, losses: 0, ties: 0, winPct: 1, syncRevision: 'fixture-revision',
      }] })), batterLeaders: [], pitcherLeaders: [], sourceFreshness: scenario.freshness,
    });
    export const getBatterRankings = async () => [];
    export const getPitcherRankings = getBatterRankings, getTeamRecordStandings = getBatterRankings;
  `],
  ['fixture-store', `
    import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
    import { useScheduleActions } from '/src/shared/state/demoStore.scheduleActions.ts';
    import { scenario, telemetry } from '/fixture-state';
    const Context = createContext(null);
    const noop = () => {};
    export const useDemoStore = () => useContext(Context);
    export function FixtureStore({ children }) {
      const [state, setState] = useState(() => ({ matches: scenario.initialGames ?? [] }));
      const ref = useRef(state);
      const dispatch = useCallback(action => {
        if (action.type !== 'setMatches') throw new Error('Unexpected action: ' + action.type);
        ref.current = { ...ref.current, matches: action.matches }; setState(ref.current);
      }, []);
      const params = useMemo(() => ({
        dispatch, getState: () => ref.current, canRecordGame: Boolean(scenario.canRecordGame), canControlCurrentPointer: false,
        markMatchesReady: noop, markSkipMatchesWrite: noop, markSkipFirestoreWrite: noop,
        setLastFeedLength: noop, setLastEventsLength: noop, pushMatchUpdate: noop,
        purgeMatchFromFirestore: noop, updateCurrentMatchPointer: noop, initialState: ref.current,
      }), [dispatch]);
      const realActions = useScheduleActions(params);
      const actions = useMemo(() => ({ ...realActions, loadFullSchedule: async () => {
        const result = await realActions.loadFullSchedule(); telemetry.results.push(result); return result;
      } }), [realActions]);
      return React.createElement(Context.Provider, { value: { state, actions } }, children);
    }
  `],
  ['fixture-entry', `
    import React from 'react'; import { createRoot } from 'react-dom/client'; import { MemoryRouter } from 'react-router-dom';
    import LandingPage from '/src/features/front/pages/LandingPage.tsx';
    import { FixtureStore } from '/fixture-store'; import { configure, telemetry } from '/fixture-state';
    import '/src/index.css';
    const root = createRoot(document.getElementById('root'));
    const originalNow = Date.now;
    window.configureHome = (value, version) => {
      configure(value); Date.now = value.nowTs == null ? originalNow : () => value.nowTs;
      root.render(React.createElement('div', { key: version, 'data-version': version },
        React.createElement(MemoryRouter, null, React.createElement(FixtureStore, null, React.createElement(LandingPage)))));
    };
    window.fixtureTelemetry = telemetry;
  `],
]);
const mocks = new Map([
  ['firebase/firestore', 'fixture-firestore'],
  ['@shared/firebase/client', 'fixture-firebase'],
  ['../firebase/client', 'fixture-firebase'],
  ['@shared/auth/AuthProvider', 'fixture-auth'],
  ['@shared/auth/useTeamRole', 'fixture-role'],
  ['@shared/auth/membershipLookup', 'fixture-memberships'],
  ['@shared/config/FeatureFlagsProvider', 'fixture-flags'],
  ['@shared/state/contentProvider', 'fixture-content'],
  ['@shared/state/demoStore', 'fixture-store'],
  ['@core/api/backendClient', 'fixture-api'],
]);
const vite = await createServer({
  configFile: false, envDir: false, cacheDir: '.tmp/home-data-freshness-test-cache', esbuild: { jsx: 'automatic' },
  optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-router-dom'] },
  server: { host: '127.0.0.1', port: 5186, strictPort: true, watch: null, hmr: false, ws: false }, appType: 'custom',
  plugins: [{
    name: 'home-data-freshness-fixture', enforce: 'pre',
    resolveId(id) {
      const name = mocks.get(id) ?? id.replace(/^\//, '');
      if (virtual.has(name)) return '\0' + name;
      if (id.startsWith('@shared/')) return resolve('src/shared', id.slice('@shared/'.length) + '.ts');
    },
    load(id) { return virtual.get(id.replace(/^\0/, '')); },
    configureServer(server) {
      server.middlewares.use('/__freshness-fixture', async (_req, res) => {
        res.setHeader('Content-Type', 'text/html');
        res.end(await server.transformIndexHtml('/__freshness-fixture', '<!doctype html><html lang="ko"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/fixture-entry"></script></body></html>'));
      });
    },
  }],
});
const freshness = { status: 'CURRENT', publishedRevision: 'fixture-revision', publishedAt: '2026-09-05T18:26:00' };
const game = { id: 'up-fixture', recordMode: 'official', sourceProvider: 'UNIQUE_PLAY', syncRevision: 'fixture-revision', sourceActive: true,
  startTime: '2026-09-05T09:00:00+09:00', status: 'completed', homeTeamName: '서경 테스트팀', awayTeamName: '동국 테스트팀', homeScore: 2, awayScore: 7 };
let browser;
try {
  await vite.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ timezoneId: 'America/Los_Angeles', viewport: { width: 1280, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.goto('http://127.0.0.1:5186/__freshness-fixture');
  await page.waitForFunction(() => typeof window.configureHome === 'function');
  let version = 0;
  const render = async changes => {
    version++;
    await page.evaluate(({ scenario, version }) => window.configureHome(scenario, version), {
      scenario: { nowTs: Date.parse('2026-09-05T18:34:00+09:00'), read: 'server', games: [game], freshness, ...changes }, version,
    });
    await page.locator(`[data-version="${version}"]`).waitFor();
    await page.waitForFunction(() => window.fixtureTelemetry.results.length > 0 &&
      !document.querySelector('.s26-freshness dd')?.textContent?.startsWith('확인 중') &&
      !document.querySelectorAll('.s26-freshness dd')[1]?.textContent?.startsWith('확인 중'));
  };
  const values = () => page.locator('.s26-freshness dd').allTextContents();
  const stats = () => page.evaluate(() => window.fixtureTelemetry);

  await test('real schedule server read returns ready and both sections use the publication, never the visit clock', async () => {
    await render({});
    const rows = await values();
    assert.equal(rows[0], rows[1]);
    assert.match(rows[0], /조회 완료 · 게시 기준 09\. 05\. 18:26/);
    assert.doesNotMatch(rows[0], /18:34/);
    assert.deepEqual((await stats()).results, [{ status: 'ready' }]);
    assert.equal((await stats()).reads, 1);
    await render({ nowTs: Date.parse('2026-09-06T12:00:00+09:00') });
    assert.deepEqual(await values(), rows);
  });
  await test('a new published revision changes both baselines and a UTC timestamp is rendered in KST', async () => {
    await render({ freshness: { ...freshness, publishedRevision: 'new-revision', publishedAt: '2026-09-05T10:10:00Z' } });
    const rows = await values();
    assert.equal(rows[0], rows[1]); assert.match(rows[0], /19:10/); assert.match(rows[2], /new-revi/);
  });
  await test('real Firestore failure reaches home as error, preserves existing games and never reports successful schedule read', async () => {
    await render({ read: 'error', initialGames: [game] });
    assert.deepEqual((await stats()).results, [{ status: 'error' }]);
    assert.match((await values())[0], /연결 확인 필요 · 게시 기준/);
    assert.doesNotMatch((await values())[0], /조회 완료/);
    assert.match(await page.locator('.s26-match-board [role="status"]').innerText(), /일정 조회에 실패/);
    assert.equal(await page.locator(`.s26-match-board a[href="/scoreboard-text/${game.id}"]`).count(), 2);
  });
  await test('failed or cache-only empty queries do not claim that no games are scheduled', async () => {
    for (const read of ['error', 'cache']) {
      await render({ read, games: [], initialGames: [] });
      const text = await page.locator('.s26-match-board').innerText();
      assert.doesNotMatch(text, /등록된 예정 경기가 없습니다|아직 완료된 경기가 없습니다/);
      assert.match(text, /새로고침/);
    }
  });
  await test('Firestore cache read is explicitly stale/unverified and a subsequent server read recovers', async () => {
    await render({ read: 'cache' });
    assert.deepEqual((await stats()).results, [{ status: 'cached' }]);
    assert.match((await values())[0], /저장된 일정 · 최신 여부 확인 필요 · 게시 기준/);
    assert.doesNotMatch((await values())[0], /조회 완료/);
    assert.match(await page.locator('.s26-match-board [role="status"]').innerText(), /저장된 일정/);
    await render({});
    assert.match((await values())[0], /조회 완료/);
    assert.equal(await page.locator('.s26-match-board [role="status"]').count(), 0);
  });
  await test('metadata lookup failure and malformed/missing publication never use the browser clock or imply unpublished data', async () => {
    for (const scenario of [{ apiError: true }, { freshness: null }, { freshness: { ...freshness, publishedAt: null } }, { freshness: { ...freshness, publishedAt: 'invalid-date' } }]) {
      await render(scenario);
      const rows = await values();
      assert.match(rows[0], /게시 기준 확인 필요/); assert.match(rows[1], /게시 기준 확인 필요/);
      assert.doesNotMatch(rows.join(' '), /18:34|게시 전/);
    }
  });
  await test('only confirmed no-publication metadata says unpublished; pending materialization is not reported as fully ready', async () => {
    await render({ freshness: { status: 'UNAVAILABLE', publishedRevision: null, publishedAt: null } });
    assert.match((await values())[0], /게시 전/);
    await render({ freshness: { ...freshness, status: 'PENDING_MATERIALIZATION' } });
    const rows = await values();
    assert.match(rows[0], /반영 확인 필요 · 게시 기준/); assert.match(rows[1], /반영 확인 필요 · 게시 기준/);
    assert.doesNotMatch(rows.join(' '), /조회 완료|게시 완료/);
  });
  await test('spectator and scorekeeper callers can ignore the result without rejected promises or writes', async () => {
    for (const canRecordGame of [false, true]) for (const read of ['server', 'error']) {
      await render({ canRecordGame, read });
      assert.equal((await stats()).writes, 0);
      assert.equal((await stats()).results.length, 1);
    }
    assert.deepEqual(errors, []);
  });
  for (const width of [360, 768, 1280]) for (const theme of ['light', 'dark']) {
    await test(`publication and error feedback ${width}px ${theme}: readable and no horizontal overflow`, async () => {
      await render({ read: 'cache' });
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
      await page.evaluate(() => document.fonts.ready);
      const bounds = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
      assert.ok(bounds.scroll <= bounds.width + 1, JSON.stringify(bounds));
      assert.match((await values())[0], /18:26/);
    });
  }
  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  await vite.close();
}

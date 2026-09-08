import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { fixtures as buildFixtures } from './e2e/record-sources/fixtures.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const host = process.env.FIRESTORE_EMULATOR_HOST;
const projectId = process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT;
assert.match(host ?? '', /^(127\.0\.0\.1|localhost):\d+$/);
assert.equal(projectId, 'demo-aubl-scoring', 'Never run against a production project');
const [hostname, port] = host.split(':');
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch { playwright = createRequire(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json'))('playwright'); }
const output = path.join(repo, 'outputs/record-source-store-e2e', new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(output, { recursive: true });
const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aubl-store-e2e-'));
const admin = initializeApp({ projectId }, `store-browser-${Date.now()}`), db = getFirestore(admin);
const seeds = new Map(), results = [], blocked = [];
let server, browser, origin;
const harness = path.join(repo, 'scripts/e2e/record-sources');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function seed(label, role = 'anonymous') {
  const matchId = `LOCAL_TEST_STORE_${label.replaceAll('-', '_')}_${seeds.size}_${Date.now()}`;
  const f = { ...buildFixtures(matchId), matchId, marker: `PRIVATE_${matchId}` };
  const player = { name: f.marker, pos: 'P', number: '1', order: 1, throws: 'R', bats: 'R' };
  f.core = { ...f.core, inning: 1, half: 'top', balls: 0, strikes: 0, outs: 0, bases: [null, null, null],
    lastPlay: f.marker, scorerUid: role === 'administrator' ? 'LOCAL_STORE_ADMIN' : 'LOCAL_STORE_SCORER',
    scorerLockedAt: Date.now(), scorerPaused: false,
    lineups: { home: [player], away: [player] }, benches: { home: [], away: [] }, removed: { home: [], away: [] } };
  f.schedule.lineups = f.core.lineups;
  f.schedule.lineupPublic = true;
  const log = { eventId: f.marker, inning: 1, half: 'top', order: 1, batter: f.marker,
    pitch: 1, result: f.marker, createdAt: 1 };
  const batch = db.batch();
  batch.set(db.doc(`matches/${matchId}`), f.schedule);
  batch.set(db.doc(`matchStates/${matchId}`), f.core);
  batch.set(db.doc(`matchStates/${matchId}/feed/f1`), log);
  batch.set(db.doc(`matchStates/${matchId}/events/e1`), { ...log, type: 'note', runners: [], notes: f.marker });
  await batch.commit();
  seeds.set(matchId, f);
  return f;
}
async function cutover(f) {
  // Install the server's atomic public/private boundary. Backend promotion validation has a separate real-transaction suite.
  await db.runTransaction(async tx => {
    const schedule = await tx.get(db.doc(`matches/${f.matchId}`));
    tx.set(db.doc(`recordArchives/${f.matchId}`), { schemaVersion: 1, matchId: f.matchId,
      schedule: schedule.data(), liveStatePath: `matchStates/${f.matchId}`, firstRevision: f.source.revision });
    tx.set(db.doc(`recordSources/${f.matchId}`), f.source);
    tx.update(db.doc(`matches/${f.matchId}`), { recordAuthority: 'UNIQUE_PLAY', officialRecordRevision: f.source.revision,
      homeScore: 1, awayScore: 3, postGame: FieldValue.delete(), manualEntryDraft: FieldValue.delete(),
      lineups: FieldValue.delete(), benches: FieldValue.delete(), notes: FieldValue.delete() });
  });
}
const state = page => page.evaluate(() => window.store.state);
async function loaded(page, f) {
  await page.waitForFunction(({ id, marker }) => window.store?.state.activeMatchId === id
    && window.store.state.lastPlay === marker && window.store.state.source === 'live'
    && window.store.state.feed.some(row => row.result === marker)
    && window.store.state.events.some(row => row.notes === marker), { id: f.matchId, marker: f.marker });
}
async function selected(page, f) {
  await page.evaluate(id => window.store.actions.selectMatch(id), f.matchId);
  await loaded(page, f);
}
async function hold(page, kind, target) {
  return page.evaluate(({ kind, target }) => window.storeIO.hold(kind, target), { kind, target });
}
const received = (page, index) => page.waitForFunction(index => window.storeIO.received(index), index);
async function release(page, index) { await page.evaluate(index => window.storeIO.release(index), index); await pause(350); }
function assertCleared(s, f) {
  assert.equal(s.activeMatchId, f.matchId);
  assert.equal(s.source, 'official');
  assert.equal(JSON.stringify({ ...s, matches: [] }).includes(f.marker), false, 'Private payload must not return to shared Store');
  assert.deepEqual(s.feed, []); assert.deepEqual(s.events, []);
  assert.equal(s.history, 0); assert.equal(s.futureHistory, 0);
  assert.equal(s.scorerUid, null); assert.equal(s.scorerPaused, true);
}
async function cleared(page, f) {
  await page.waitForFunction(id => window.store?.state.activeMatchId === id && window.store.state.source === 'official'
    && window.store.state.feed.length === 0 && window.store.state.events.length === 0
    && window.store.state.scorerPaused, f.matchId);
  await pause(100);
  assertCleared(await state(page), f);
}
async function privateListeners(page, id) {
  return page.evaluate(id => window.storeIO.listeners.filter(row => row.active
    && (row.path === `matchStates/${id}` || row.path === `matchStates/${id}/feed` || row.path === `matchStates/${id}/events`)).length, id);
}
async function writes(page, id) {
  return page.evaluate(id => window.storeIO.requests.filter(row => ['setDoc', 'batchWrite'].includes(row.kind)
    && (row.path === `matchStates/${id}` || row.path === `matchStates/${id}/feed` || row.path.startsWith(`matchStates/${id}/feed/`)
      || row.path === `matchStates/${id}/events` || row.path.startsWith(`matchStates/${id}/events/`))).length, id);
}
const scenarios = [
  'live-hydration', 'anonymous-cutover', 'administrator-cutover', 'administrator-direct-official',
  'stale-core-switch', 'stale-feed-switch', 'stale-core-cutover', 'stale-feed-cutover',
  'delayed-lock-ack', 'pending-write-cancel', 'heartbeat-cancel', 'offline-unknown', 'reconnect-cutover', 'unmount-cancel',
];
const only = process.argv.find(arg => arg.startsWith('--only='))?.slice(7).split(',');
if (only) for (const name of only) assert.ok(scenarios.includes(name), `Unknown scenario: ${name}`);
try {
  await db.doc('roles/LOCAL_STORE_SCORER').set({ role: 'scorer' });
  server = await createServer({ configFile: false, envFile: false, root: repo, cacheDir,
    plugins: [{ name: 'actual-store-emulator-only', enforce: 'pre',
      resolveId(id, importer) {
        const fromProduct = importer?.startsWith(path.join(repo, 'src'));
        const absolute = id.replace(/\.(?:ts|tsx)$/, '');
        if (fromProduct && id === 'firebase/firestore') return path.join(harness, 'store-firestore.js');
        if (fromProduct && id === 'firebase/auth') return path.join(harness, 'store-auth.js');
        if (id === '@shared/firebase/client' || (fromProduct && id === '../firebase/client')
          || absolute === path.join(repo, 'src/shared/firebase/client') || absolute === path.join(repo, 'src/core/firebase/client'))
          return path.join(harness, 'store-client.js');
      },
      configureServer(vite) {
        vite.middlewares.use(async (req, res, next) => {
          const url = new URL(req.url ?? '/', 'http://localhost');
          if (url.pathname !== '/__store-test') return next();
          const f = seeds.get(url.searchParams.get('matchId'));
          if (!f) { res.statusCode = 404; res.end('Unknown LOCAL_TEST fixture'); return; }
          const config = { projectId, host: hostname, port: Number(port), role: url.searchParams.get('role') ?? 'anonymous' };
          res.setHeader('Content-Type', 'text/html');
          res.end(await vite.transformIndexHtml(url.pathname, `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script>window.__storeFixture=${JSON.stringify(config)};</script><script type="module" src="/scripts/e2e/record-sources/store-entry.jsx"></script></body></html>`));
        });
      },
    }, react()],
    resolve: { alias: { '@shared': path.join(repo, 'src/shared'), '@core': path.join(repo, 'src/core'), '@features': path.join(repo, 'src/features') } },
    optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom/client', 'react/jsx-runtime', 'firebase/app', 'firebase/firestore'] },
    server: { host: '127.0.0.1', port: 0, watch: null, hmr: false, ws: false, fs: { allow: [repo] } },
  });
  await server.listen(); origin = server.resolvedUrls.local[0].replace(/\/$/, '');
  browser = await playwright.chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  for (const viewport of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }]) {
    for (const scenario of scenarios.filter(name => !only || only.includes(name))) {
      const role = scenario.startsWith('administrator') ? 'administrator'
        : ['delayed-lock-ack', 'pending-write-cancel', 'heartbeat-cancel'].includes(scenario) ? 'scorer' : 'anonymous';
      const f = await seed(`${viewport.name}_${scenario}`, role);
      const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
      await context.tracing.start({ screenshots: true, snapshots: true });
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin === origin || url.origin === `http://${host}`) return route.continue();
        blocked.push({ scenario, url: url.toString() }); return route.abort();
      });
      const page = await context.newPage(), errors = [];
      page.setDefaultTimeout(12000);
      page.on('pageerror', error => errors.push(error.message));
      page.on('response', response => { if (response.url().startsWith(origin + '/') && response.status() >= 400)
        errors.push(`LOCAL_ASSET_ERROR ${response.status()} ${response.url()}`); });
      const prefix = `${viewport.name}-${scenario}`;
      try {
        if (scenario === 'administrator-direct-official') await cutover(f);
        await page.goto(`${origin}/__store-test?matchId=${f.matchId}&role=${role}`);
        await page.waitForFunction(id => window.store?.state.matches.some(match => match.id === id), f.matchId);
        if (scenario === 'administrator-direct-official') {
          await page.evaluate(id => window.store.actions.selectMatch(id), f.matchId);
          await cleared(page, f);
          await pause(500);
          assertCleared(await state(page), f);
          const attempts = await page.evaluate(id => window.storeIO.requests.filter(row => row.path === `matchStates/${id}`
            && row.kind === 'getDoc').length, f.matchId);
          assert.equal(attempts, 0, 'Shared Store must not fetch archived records even for an administrator');
        } else {
          await selected(page, f);
          if (scenario === 'live-hydration') {
            assert.equal((await state(page)).score.away, 4);
            assert.ok(await privateListeners(page, f.matchId) > 0);
          } else if (scenario === 'anonymous-cutover' || scenario === 'administrator-cutover') {
            if (role === 'administrator') {
              await page.evaluate(() => { window.store.actions.setScore('away', 5); });
              await page.waitForFunction(() => window.store.state.history > 0);
              await page.evaluate(() => window.store.actions.undo());
              await page.waitForFunction(() => window.store.state.futureHistory > 0);
            }
            await cutover(f); await cleared(page, f);
            assert.equal(await privateListeners(page, f.matchId), 0);
          } else if (scenario.startsWith('stale-')) {
            const kind = scenario.includes('-core-') ? 'getDoc' : 'getDocs';
            const barrier = await hold(page, kind, `matchStates/${f.matchId}${kind === 'getDocs' ? '/feed' : ''}`);
            await page.evaluate(id => window.store.actions.selectMatch(id), f.matchId);
            await received(page, barrier);
            if (scenario.endsWith('-switch')) {
              const next = await seed(`${prefix}_target`);
              await selected(page, next);
              const start = await page.evaluate(() => window.storeRenders.length);
              await release(page, barrier);
              assert.equal((await state(page)).activeMatchId, next.matchId, 'Late core response must not switch back to the old match');
              const renders = await page.evaluate(start => window.storeRenders.slice(start), start);
              assert.equal(renders.some(s => JSON.stringify({ ...s, matches: [] }).includes(f.marker)), false, 'Late response must not inject another match private data');
            } else {
              await cutover(f); await cleared(page, f);
              await release(page, barrier); assertCleared(await state(page), f);
            }
          } else if (scenario === 'delayed-lock-ack') {
            const barrier = await hold(page, 'setDoc', `matchStates/${f.matchId}`);
            await page.evaluate(() => window.store.actions.setScorerMode(true));
            await received(page, barrier);
            await cutover(f); await cleared(page, f);
            await release(page, barrier); assertCleared(await state(page), f);
          } else if (scenario === 'pending-write-cancel' || scenario === 'heartbeat-cancel') {
            await page.evaluate(() => window.store.actions.setScorerMode(true));
            await page.waitForFunction(() => window.storeTimers.intervals.size > 0);
            await pause(1200);
            if (scenario === 'pending-write-cancel') {
              await page.evaluate(() => window.store.actions.setPlay('LOCAL_TEST_PENDING_WRITE'));
              await page.waitForFunction(() => window.storeTimers.timeouts.size > 0);
            }
            await cutover(f); await cleared(page, f);
            const count = await writes(page, f.matchId);
            const before = (await db.doc(`matchStates/${f.matchId}`).get()).data();
            await pause(1400);
            assert.equal(await writes(page, f.matchId), count, 'No post-cutover write attempts');
            assert.deepEqual((await db.doc(`matchStates/${f.matchId}`).get()).data(), before, 'Archive must remain unchanged');
            assert.deepEqual(await page.evaluate(() => [window.storeTimers.timeouts.size, window.storeTimers.intervals.size]), [0, 0]);
          } else if (scenario === 'offline-unknown') {
            const next = await seed(`${prefix}_target`);
            await page.evaluate(async id => { await window.storeNetwork(false); window.store.actions.selectMatch(id); }, next.matchId);
            await page.waitForFunction(id => window.store.state.activeMatchId === id && window.store.state.source === 'loading', next.matchId);
            assert.equal(JSON.stringify({ ...(await state(page)), matches: [] }).includes(f.marker), false);
            assert.equal(await privateListeners(page, next.matchId), 0);
            await page.evaluate(() => window.storeNetwork(true)); await loaded(page, next);
          } else if (scenario === 'reconnect-cutover') {
            await page.evaluate(() => window.storeNetwork(false));
            await cutover(f);
            await page.evaluate(() => window.storeNetwork(true));
            await cleared(page, f); assert.equal(await privateListeners(page, f.matchId), 0);
          } else {
            const barrier = await hold(page, 'getDocs', `matchStates/${f.matchId}/feed`);
            await page.evaluate(id => window.store.actions.selectMatch(id), f.matchId);
            await received(page, barrier);
            await page.evaluate(() => window.unmountStore());
            await release(page, barrier);
            assert.equal(await page.evaluate(() => window.storeIO.listeners.filter(row => row.active).length), 0);
          }
        }
        assert.deepEqual(errors, [], 'No browser runtime errors');
        results.push({ viewport: viewport.name, scenario, status: 'passed' });
      } catch (error) {
        results.push({ viewport: viewport.name, scenario, status: 'failed', error: String(error), browserErrors: errors });
      } finally {
        const diagnostics = await page.evaluate(() => ({ state: window.store?.state,
          requests: window.storeIO?.requests, listeners: window.storeIO?.listeners, renders: window.storeRenders })).catch(() => null);
        fs.writeFileSync(path.join(output, prefix + '.json'), JSON.stringify(diagnostics, null, 2));
        await page.screenshot({ path: path.join(output, prefix + '.png'), fullPage: true }).catch(() => {});
        await context.tracing.stop({ path: path.join(output, prefix + '.zip') });
        await context.close();
      }
      process.stdout.write(JSON.stringify(results.at(-1)) + '\n');
      if (errors.some(error => error.startsWith('LOCAL_ASSET_ERROR'))) throw new Error('Test infrastructure failed; remaining cases not executed');
    }
  }
} finally {
  await browser?.close(); await server?.close();
  for (const id of seeds.keys()) {
    assert.match(id, /^LOCAL_TEST_STORE_/);
    for (const collection of ['matches', 'matchStates', 'recordSources', 'recordArchives']) await db.recursiveDelete(db.doc(`${collection}/${id}`));
  }
  await db.doc('roles/LOCAL_STORE_SCORER').delete();
  // The actual administrator selectMatch action updates this pointer in the isolated emulator.
  const pointer = await db.doc('app/current').get();
  if (pointer.exists && seeds.has(pointer.data().activeMatchId)) await pointer.ref.delete();
  await deleteApp(admin); fs.rmSync(cacheDir, { recursive: true, force: true });
  const report = { testedAt: new Date().toISOString(), productionAccess: false, results, blocked,
    scope: 'Actual DemoStoreProvider/reducer/actions/effects/normalizers/source hook and real Firestore SDK/rules. Auth transport and atomic promotion boundary are fixtures. Read/ACK barriers delay real responses, not substitute data.',
    cleanup: 'Only LOCAL_TEST_STORE fixtures, local role and owned local current pointer deleted; no production data or deployment.' };
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(output, 'report.md'), `# Actual Store Provider lifecycle E2E\n\n${report.scope}\n\n| Viewport | Scenario | Result |\n| --- | --- | --- |\n${results.map(row => `| ${row.viewport} | ${row.scenario} | ${row.status} |`).join('\n')}\n\nExternal requests blocked: ${blocked.length}\n\n${report.cleanup}\n`);
  fs.appendFileSync(path.join(repo, 'docs/records-store-provider-validation-2026-09-08.md'),
    `\n## E2E run: ${report.testedAt}\n\n- Passed: ${results.filter(row => row.status === 'passed').length}/${results.length}\n- Failed: ${results.filter(row => row.status === 'failed').length}\n- Unexpected external requests: ${blocked.length}\n- Production access: false\n- Artifacts: [report](../${path.relative(repo, output)}/report.md), [details](../${path.relative(repo, output)}/results.json)\n- ${report.cleanup}\n`);
  process.stdout.write(`RECORD_SOURCE_STORE_E2E_OUTPUT=${output}\n`);
  if (!results.length || results.some(row => row.status !== 'passed') || blocked.length) process.exitCode = 1;
}

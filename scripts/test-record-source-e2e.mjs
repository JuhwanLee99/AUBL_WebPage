import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import ts from 'typescript';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { archiveReviewEvent } from './e2e/record-sources/archive-review-fixtures.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const host = process.env.FIRESTORE_EMULATOR_HOST;
const projectId = process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT;
assert.match(host ?? '', /^(127\.0\.0\.1|localhost):\d+$/);
assert.equal(projectId, 'demo-aubl-scoring');
const [emulatorHost, emulatorPort] = host.split(':');
const run = promisify(execFile);
const python = path.join(repo, 'functions/venv/bin/python');
const driver = path.join(repo, 'scripts/e2e/record-sources/backend_fixture.py');
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch { playwright = createRequire(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json'))('playwright'); }
const output = path.join(repo, 'outputs/record-source-e2e', new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(output, { recursive: true });
const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aubl-source-e2e-'));
const admin = initializeApp({ projectId }, `source-browser-${Date.now()}`), db = getFirestore(admin);
const fixtures = new Map(), results = [], blocked = [];
let server, browser, origin;
const virtual = name => `\0source-test:${name}`;
async function backend(action, matchId) {
  assert.match(matchId, /^LOCAL_TEST_SOURCE_[A-Za-z0-9_-]+$/);
  const result = await run(python, [driver, action, matchId], { cwd: repo, timeout: 60000, maxBuffer: 2_000_000, env: process.env });
  return JSON.parse(result.stdout);
}
async function seed(label) {
  const matchId = `LOCAL_TEST_SOURCE_BROWSER_${label}_${fixtures.size}_${Date.now()}`;
  const f = await backend('seed', matchId); fixtures.set(matchId, f); return { matchId, ...f };
}
async function seedReviewEvents(matchId, partial = false) {
  assert.match(matchId, /^LOCAL_TEST_SOURCE_/);
  const missing = archiveReviewEvent(matchId, 'missing'), broken = archiveReviewEvent(matchId, 'broken');
  const clean = value => JSON.parse(JSON.stringify(value));
  const batch = db.batch();
  batch.set(db.doc(`matchStates/${matchId}/events/a-missing`), clean(missing));
  batch.set(db.doc(`matchStates/${matchId}/events/b-broken`), clean(broken));
  batch.set(db.doc(`matchStates/${matchId}`), { events: [clean({ ...missing, _documentId: 'NOT_A_COLLECTION_ID' })] }, { merge: true });
  if (partial) for (let i = 0; i < 98; i++) batch.set(db.doc(`matchStates/${matchId}/events/z-${String(i).padStart(3, '0')}`), {
    eventId: `LOCAL_REVIEW_NOTE_${i}`, inning: 1, half: 'top', order: 0, pitch: 0, batter: '', type: 'note', runners: [], notes: 'LOCAL TEST ONLY',
  });
  await batch.commit();
}
const modules = {
  client: `import { initializeApp } from 'firebase/app';
    import { getFirestore, connectFirestoreEmulator, disableNetwork, enableNetwork, doc, getDocFromServer } from 'firebase/firestore';
    const role = window.__sourceFixture.role;
    const uid = role === 'administrator' ? 'LOCAL_SOURCE_ADMIN' : 'LOCAL_SOURCE_SCORER';
    const app = initializeApp({ projectId: '${projectId}', apiKey: 'emulator-only', appId: 'emulator-only' });
    export const firestore = getFirestore(app);
    connectFirestoreEmulator(firestore, '${emulatorHost}', ${Number(emulatorPort)}, role === 'anonymous' ? undefined : { mockUserToken: { sub: uid, user_id: uid, admin: role === 'administrator' } });
    export const auth = { currentUser: role === 'anonymous' ? null : { uid } };
    window.sourceNetwork = enabled => enabled ? enableNetwork(firestore) : disableNetwork(firestore);
    window.readPrivateSource = async id => { try { await getDocFromServer(doc(firestore, 'matchStates', id)); return 'allowed'; } catch (error) { return error.code; } };`,
  auth: `export function useAdmin() { return { isAdmin: window.__sourceFixture.role === 'administrator', loading: false }; }`,
  store: `import { useEffect, useState } from 'react'; import { doc, onSnapshot } from 'firebase/firestore'; import { firestore } from 'virtual:source-client';
    export function useDemoStore() { const [matches, setMatches] = useState([window.__sourceFixture.schedule]);
      useEffect(() => onSnapshot(doc(firestore, 'matches', window.__sourceFixture.schedule.id), snap => { if (snap.exists()) setMatches([{ ...snap.data(), id: snap.id }]); }), []);
      return { state: { matches } }; }`,
  api: `export async function getOfficialGameDetails(id, season) { const f = window.__sourceFixture;
    if (f.failApi) throw new Error('LOCAL_OFFICIAL_API_UNAVAILABLE');
    return id === f.official.sourceGameId && season === f.official.seasonId ? structuredClone(f.official) : null; }`,
  calls: `export function getFunctions() { return {}; }
    export function httpsCallable(_functions, name) { if (name !== 'promote_uniqueplay_record_source') throw new Error('Unexpected callable');
      return async data => { const response = await fetch('/__source-test/promote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        if (!response.ok) throw new Error(await response.text()); return { data: await response.json() }; }; }`,
  entry: `import React, { useEffect, useState } from 'react'; import { createRoot } from 'react-dom/client'; import { MemoryRouter } from 'react-router-dom';
    import RecordSourceGate from '/src/shared/components/RecordSourceGate.tsx';
    import AdminRecordComparisonPage from '/src/app/pages/admin/AdminRecordComparisonPage.tsx';
    import { useRecordSource } from '/src/shared/state/useRecordSource.ts';
    import { firestore } from 'virtual:source-client'; import { doc, onSnapshot } from 'firebase/firestore';
    function PrivateLive({ matchId }) { const [text, setText] = useState('');
      useEffect(() => onSnapshot(doc(firestore, 'matchStates', matchId), snap => setText(snap.data()?.lastPlay ?? ''), () => {}), [matchId]);
      return <div data-testid="private-live">{text}</div>; }
    function GateView() { const [id, setId] = useState(window.__sourceFixture.schedule.id); const source = useRecordSource(id);
      useEffect(() => { window.changeSourceMatch = setId; }, []);
      return <><pre data-testid="source-probe">{JSON.stringify({ status: source.status, matchId: source.status === 'official' ? source.source.matchId : null })}</pre>
        <RecordSourceGate matchId={id}><PrivateLive key={id} matchId={id} /></RecordSourceGate></>; }
    const f = window.__sourceFixture;
    createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={['/admin/record-comparison?matchId=' + f.schedule.id]}>{f.mode === 'admin' ? <AdminRecordComparisonPage /> : <GateView />}</MemoryRouter>);`,
};

try {
  server = await createServer({
    configFile: false, envFile: false, root: repo, cacheDir,
    plugins: [{
      name: 'isolated-record-source-fixtures', enforce: 'pre',
      resolveId(id) {
        if (id.startsWith('/virtual:source-')) return virtual(id.slice('/virtual:source-'.length));
        if (id.startsWith('virtual:source-')) return virtual(id.slice('virtual:source-'.length));
        if (id === 'firebase/functions') return virtual('calls');
        const absolute = id.replace(/\.(?:ts|tsx)$/, '');
        if (id === '@shared/state/demoStore' || absolute === path.join(repo, 'src/shared/state/demoStore')) return virtual('store');
        if (id === '@core/api/backendClient' || absolute === path.join(repo, 'src/core/api/backendClient')) return virtual('api');
        if (id === '@shared/auth/useAdmin' || id === '../auth/useAdmin' || absolute === path.join(repo, 'src/shared/auth/useAdmin')) return virtual('auth');
        if (id === '@shared/firebase/client' || id === '../firebase/client' || absolute === path.join(repo, 'src/shared/firebase/client') || absolute === path.join(repo, 'src/core/firebase/client')) return virtual('client');
      },
      load(id) {
        if (!id.startsWith('\0source-test:')) return;
        const name = id.slice('\0source-test:'.length);
        return name === 'entry' ? ts.transpileModule(modules.entry, {
          compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
        }).outputText : modules[name];
      },
      transform(code, id) { if (id === virtual('entry')) return { code: code, map: null }; },
      configureServer(vite) {
        vite.middlewares.use(async (req, res, next) => {
          const url = new URL(req.url ?? '/', 'http://localhost');
          if (url.pathname === '/__source-test/promote' && req.method === 'POST') {
            try {
              const chunks = []; for await (const chunk of req) chunks.push(chunk);
              const data = JSON.parse(Buffer.concat(chunks).toString()); const f = fixtures.get(data.matchId);
              assert.ok(f, 'Only a seeded emulator fixture may be promoted'); assert.equal(data.expectedRevision, f.official.syncRevision);
              const result = await backend('promote', data.matchId); res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(result));
            } catch (error) { res.statusCode = 409; res.end(String(error)); }
            return;
          }
          if (url.pathname !== '/__source-test') return next();
          const f = fixtures.get(url.searchParams.get('matchId'));
          if (!f) { res.statusCode = 404; res.end('Unknown local fixture'); return; }
          const config = { ...f, role: url.searchParams.get('role') ?? 'anonymous', mode: url.searchParams.get('mode') ?? 'gate', failApi: url.searchParams.get('failApi') === '1' };
          res.setHeader('Content-Type', 'text/html');
          res.end(await vite.transformIndexHtml(url.pathname, `<!doctype html><html lang="ko"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main id="root"></main><script>window.__sourceFixture=${JSON.stringify(config).replaceAll('<', '\\u003c')};</script><script type="module" src="/virtual:source-entry"></script></body></html>`));
        });
      },
    }, react({ include: [/\.[jt]sx?$/, /source-test:entry/] })],
    resolve: { alias: { '@shared': path.join(repo, 'src/shared'), '@core': path.join(repo, 'src/core'), '@features': path.join(repo, 'src/features') } },
    esbuild: { include: /(?:\.[jt]sx?$|source-test:entry)/, loader: 'tsx', jsx: 'automatic' },
    optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom/client', 'react/jsx-runtime', 'react-router-dom', 'firebase/app', 'firebase/firestore'] },
    server: { host: '127.0.0.1', port: 0, watch: null, hmr: false, ws: false, fs: { allow: [repo] } },
  });
  await server.listen(); origin = server.resolvedUrls.local[0].replace(/\/$/, '');
  browser = await playwright.chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const viewports = [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }];
  const cases = ['anonymous-cutover', 'scorer-cutover', 'administrator-archive-link', 'administrator-promote-compare-issue', 'official-api-outage', 'route-switch', 'offline-unknown-source', 'malformed-source',
    'administrator-review-comparison-draft', 'administrator-review-integrity-draft', 'administrator-review-fielding-draft',
    'administrator-review-legacy-separate', 'administrator-review-draft-replacement', 'administrator-review-stale-draft',
    'administrator-review-partial-page', 'scorer-admin-review-denied', 'anonymous-admin-review-denied'];
  for (const viewport of viewports) for (const scenario of cases) {
    const f = await seed(`${viewport.name}_${scenario.replaceAll('-', '_')}`);
    const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
    const errors = [], prefix = `${viewport.name}-${scenario}`;
    await context.tracing.start({ screenshots: true, snapshots: true });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      const allowed = url.origin === origin || url.origin === `http://${host}`;
      if (allowed) return route.continue();
      blocked.push({ scenario: prefix, url: url.toString(), method: route.request().method() }); return route.abort();
    });
    const page = await context.newPage(); page.setDefaultTimeout(12000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
      if (response.url().startsWith(origin + '/') && response.status() >= 400) errors.push(`LOCAL_ASSET_ERROR ${response.status()} ${response.url()}`);
    });
    const role = scenario.startsWith('administrator') || scenario === 'official-api-outage' ? 'administrator' : scenario.startsWith('scorer') ? 'scorer' : 'anonymous';
    const reviewing = scenario.startsWith('administrator-review-');
    const deniedReview = scenario.endsWith('-admin-review-denied');
    const mode = ['administrator-promote-compare-issue', 'official-api-outage'].includes(scenario) || reviewing || deniedReview ? 'admin' : 'gate';
    try {
      if (reviewing) await seedReviewEvents(f.matchId, scenario === 'administrator-review-partial-page');
      if (['administrator-archive-link', 'official-api-outage'].includes(scenario) || reviewing || deniedReview) await backend('promote', f.matchId);
      if (scenario === 'malformed-source') await db.doc(`recordSources/${f.matchId}`).set({ schemaVersion: 999 });
      await page.goto(`${origin}/__source-test?matchId=${f.matchId}&role=${role}&mode=${mode}&failApi=${scenario === 'official-api-outage' ? '1' : '0'}`);
      if (deniedReview) {
        await page.getByText('관리자만 비교 원본을 조회할 수 있습니다.', { exact: true }).waitFor();
        assert.equal(await page.getByTestId('archive-scoring-review').count(), 0);
        assert.equal(await page.getByTestId('raw-archive-events').count(), 0);
        assert.equal(await page.getByRole('button', { name: '검수 이력 추가', exact: true }).count(), 0);
        assert.match(await page.evaluate(id => window.readPrivateSource(id), f.matchId), /permission-denied/);
      } else if (reviewing) {
        await page.getByRole('table').waitFor();
        const originalCore = (await db.doc(`matchStates/${f.matchId}`).get()).data();
        const issueCollection = db.collection(`recordArchives/${f.matchId}/issues`);
        const sourceBinding = (await db.doc(`recordSources/${f.matchId}`).get()).data();
        const formNote = page.getByLabel(/^관찰·재현·수정·검증 내용/);
        const formEvidence = page.getByLabel(/근거 \(비교 키/);
        const preview = page.getByTestId('archive-issue-draft');
        const openComparison = () => page.getByRole('button', { name: '비교 이슈 초안', exact: true }).first().click();
        const readProof = async () => JSON.parse(await page.getByTestId('archive-draft-evidence').textContent());
        const openEvents = async () => {
          const raw = page.getByTestId('raw-archive-events');
          await raw.locator(':scope > summary').click();
          await raw.getByRole('button', { name: '100건 더 조회', exact: true }).click();
          await page.waitForFunction(() => document.querySelector('[data-testid="archive-review-coverage"]')?.textContent.includes('3건') || document.querySelector('[data-testid="archive-review-coverage"]')?.textContent.includes('100건'));
          return raw;
        };
        const openFinding = async (kind, eventId) => {
          await page.locator(`[data-testid="archive-review-finding"][data-finding-kind="${kind}"][data-event-id="${eventId}"]`)
            .getByRole('button', { name: '이슈 초안 보기', exact: true }).click();
          await preview.waitFor();
        };
        const applyAndSave = async () => {
          assert.equal((await issueCollection.get()).size, 0, 'Preparing a draft must not write an issue');
          const proof = await readProof();
          assert.equal(proof.matchId, f.matchId); assert.equal(proof.revision, sourceBinding.revision); assert.equal(proof.payloadHash, sourceBinding.payloadHash);
          await page.getByRole('button', { name: '초안을 이슈 폼에 적용', exact: true }).click();
          assert.deepEqual(JSON.parse(await formEvidence.inputValue()), proof);
          assert.equal((await issueCollection.get()).size, 0, 'Applying a draft must not save it automatically');
          await page.getByRole('button', { name: '검수 이력 추가', exact: true }).click();
          await page.getByText('최근 검수 이력 1건 (최대 100건)', { exact: true }).waitFor();
          const issues = await issueCollection.get(); assert.equal(issues.size, 1);
          const saved = issues.docs[0].data(); assert.equal(saved.actorUid, 'LOCAL_SOURCE_ADMIN'); assert.equal(saved.status, 'OPEN');
          assert.deepEqual(JSON.parse(saved.evidence), proof); return saved;
        };
        if (scenario === 'administrator-review-comparison-draft') {
          await openComparison(); assert.equal((await readProof()).kind, 'comparison'); await applyAndSave();
        } else if (scenario === 'administrator-review-draft-replacement') {
          await formNote.fill('LOCAL_UNSAVED_NOTE'); await formEvidence.fill('LOCAL_UNSAVED_EVIDENCE');
          await openComparison(); assert.equal(await formNote.inputValue(), 'LOCAL_UNSAVED_NOTE');
          await page.getByRole('button', { name: '초안 취소', exact: true }).click();
          assert.equal(await formEvidence.inputValue(), 'LOCAL_UNSAVED_EVIDENCE');
          await openComparison(); await applyAndSave();
        } else if (scenario === 'administrator-review-stale-draft') {
          await openComparison(); await page.getByRole('button', { name: '초안을 이슈 폼에 적용', exact: true }).click();
          await openComparison(); await db.doc(`recordSources/${f.matchId}`).update({ payloadHash: '0'.repeat(64) });
          await preview.waitFor({ state: 'detached' });
          await page.waitForFunction(() => Array.from(document.querySelectorAll('textarea')).every(input => input.value === ''));
          assert.equal(await page.getByRole('button', { name: '검수 이력 추가', exact: true }).isEnabled(), false);
          assert.equal((await issueCollection.get()).size, 0);
        } else {
          const raw = await openEvents();
          if (scenario === 'administrator-review-integrity-draft') {
            await openFinding('integrity', 'LOCAL_ARCHIVE_BROKEN');
            const proof = await readProof(); assert.deepEqual(proof.documentIds, ['b-broken']); assert.equal(proof.origin, 'documents');
            await applyAndSave();
          } else if (scenario === 'administrator-review-fielding-draft') {
            await openFinding('defense', 'LOCAL_ARCHIVE_MISSING');
            const proof = await readProof(); assert.deepEqual(proof.documentIds, ['a-missing']); assert.equal(proof.position, '6');
            const saved = await applyAndSave(); assert.equal(saved.category, 'MAPPING');
          } else if (scenario === 'administrator-review-legacy-separate') {
            await raw.getByLabel('검토할 사건 원본', { exact: false }).selectOption('legacy');
            assert.match(await page.getByTestId('archive-review-coverage').innerText(), /구형 루트 배열만 1건/);
            assert.equal(await raw.locator('[data-event-id="LOCAL_ARCHIVE_BROKEN"]').count(), 0);
            await openFinding('defense', 'LOCAL_ARCHIVE_MISSING'); const proof = await readProof();
            assert.equal(proof.coverage, 'legacy-array-only'); assert.deepEqual(proof.documentIds, []); await applyAndSave();
          } else {
            assert.match(await page.getByTestId('archive-review-coverage').innerText(), /부분 자료만 100건/);
            await openFinding('defense', 'LOCAL_ARCHIVE_MISSING');
            assert.equal((await readProof()).coverage, 'partial-page'); assert.equal((await readProof()).reviewedRows, 100);
            await page.getByRole('button', { name: '초안 취소', exact: true }).click();
            await raw.getByRole('button', { name: '100건 더 조회', exact: true }).click();
            await page.waitForFunction(() => document.querySelector('[data-testid="archive-review-coverage"]')?.textContent.includes('101건'));
            await openFinding('defense', 'LOCAL_ARCHIVE_MISSING'); assert.equal((await readProof()).coverage, 'loaded-collection');
            assert.equal((await readProof()).reviewedRows, 101); await applyAndSave();
          }
        }
        assert.deepEqual((await db.doc(`matchStates/${f.matchId}`).get()).data(), originalCore, 'Review must not rewrite the archived core or legacy events');
        assert.equal((await db.doc(`matchStates/${f.matchId}/events/b-broken`).get()).data().compositePlay.runs, 99, 'Invalid original must remain intact');
        assert.equal((await db.doc(`matchStates/${f.matchId}/events/a-missing`).get()).data().defensiveSnapshot.lineup[5].number, '', 'Missing identity must not be silently filled');
      } else if (scenario.endsWith('-cutover')) {
        await page.getByTestId('private-live').getByText('PRIVATE_TEST_FEED').waitFor();
        await backend('promote', f.matchId);
        await page.getByRole('heading', { name: '유니크플레이 공식 기록', exact: true }).waitFor();
        assert.equal(await page.getByTestId('private-live').count(), 0);
        assert.equal(await page.getByRole('link', { name: '자체 기록 비교·검수' }).count(), 0);
        assert.match(await page.evaluate(id => window.readPrivateSource(id), f.matchId), /permission-denied/);
      } else if (scenario === 'administrator-archive-link') {
        await page.getByRole('link', { name: '자체 기록 비교·검수' }).waitFor();
        assert.equal(await page.getByTestId('private-live').count(), 0);
        assert.equal(await page.evaluate(id => window.readPrivateSource(id), f.matchId), 'allowed');
      } else if (scenario === 'administrator-promote-compare-issue') {
        const promoteButton = page.getByRole('button', { name: '게시된 공식 기록으로 전환 / 재동기화', exact: true });
        await page.getByText(/게시 후보:/).waitFor(); assert.equal(await promoteButton.isEnabled(), false);
        await page.getByRole('checkbox', { name: /경기 매핑과 자체 기록/ }).check(); await promoteButton.click();
        await page.getByRole('heading', { name: '2. 고정된 원본 비교', exact: true }).waitFor();
        await page.getByRole('table').waitFor();
        assert.match(await page.getByRole('table').innerText(), /LOCAL AWAY 득점/);
        assert.match(await page.getByRole('table').innerText(), /Alice/);
        await page.getByLabel('원인 분류', { exact: false }).selectOption('MODAL');
        await page.getByLabel('관찰·재현·수정·검증 내용', { exact: true }).fill('LOCAL_TEST_MODAL_REVIEW');
        await page.getByLabel(/근거 \(비교 키/).fill('away/runs; LOCAL_PRIVATE_EVENT');
        await page.getByRole('button', { name: '검수 이력 추가', exact: true }).click();
        await page.getByText('최근 검수 이력 1건 (최대 100건)', { exact: true }).waitFor();
        const issues = await db.collection(`recordArchives/${f.matchId}/issues`).get();
        assert.equal(issues.size, 1); assert.equal(issues.docs[0].data().actorUid, 'LOCAL_SOURCE_ADMIN');
        assert.equal(issues.docs[0].data().revision, 'LOCAL_REVISION_1');
        await page.getByText('원본 문자중계 (0건 조회)', { exact: true }).click();
        await page.getByRole('button', { name: '100건 더 조회', exact: true }).first().click();
        await page.getByText('원본 문자중계 (1건 조회)', { exact: true }).waitFor();
        assert.equal((await db.doc(`matchStates/${f.matchId}`).get()).data().score.away, 4);
      } else if (scenario === 'official-api-outage') {
        await page.getByRole('table').waitFor(); await page.getByRole('alert').getByText('LOCAL_OFFICIAL_API_UNAVAILABLE').waitFor();
        assert.match(await page.getByRole('table').innerText(), /LOCAL AWAY 득점/);
      } else if (scenario === 'route-switch') {
        await page.getByTestId('private-live').getByText('PRIVATE_TEST_FEED').waitFor();
        const next = await seed(`${viewport.name}_route_target`); await backend('promote', next.matchId);
        await page.evaluate(id => window.changeSourceMatch(id), next.matchId);
        await page.getByRole('heading', { name: '유니크플레이 공식 기록', exact: true }).waitFor();
        const probe = JSON.parse(await page.getByTestId('source-probe').textContent());
        assert.equal(probe.matchId, next.matchId); assert.equal(await page.getByTestId('private-live').count(), 0);
      } else if (scenario === 'offline-unknown-source') {
        await page.getByTestId('private-live').getByText('PRIVATE_TEST_FEED').waitFor();
        const next = await seed(`${viewport.name}_offline_target`);
        await page.evaluate(async id => { await window.sourceNetwork(false); window.changeSourceMatch(id); }, next.matchId);
        await page.getByTestId('source-probe').getByText(/"status":"loading"/).waitFor();
        assert.equal(await page.getByTestId('private-live').count(), 0);
        await page.evaluate(() => window.sourceNetwork(true));
        await page.getByTestId('private-live').getByText('PRIVATE_TEST_FEED').waitFor();
      } else {
        await page.getByRole('status').getByText(/기록 공개 상태를 확인하지 못했습니다/).waitFor();
        assert.equal(await page.getByTestId('private-live').count(), 0);
      }
      assert.deepEqual(errors, [], 'No browser runtime errors');
      await page.screenshot({ path: path.join(output, prefix + '.png'), fullPage: true });
      results.push({ viewport: viewport.name, scenario, status: 'passed' });
    } catch (error) {
      await page.screenshot({ path: path.join(output, prefix + '-failed.png'), fullPage: true }).catch(() => {});
      results.push({ viewport: viewport.name, scenario, status: 'failed', error: String(error), browserErrors: errors });
    } finally {
      await context.tracing.stop({ path: path.join(output, prefix + '.zip') }); await context.close();
    }
    process.stdout.write(JSON.stringify(results.at(-1)) + '\n');
    if (errors.some(error => error.startsWith('LOCAL_ASSET_ERROR'))) throw new Error('Local fixture infrastructure failed; remaining browser cases not executed');
  }
} finally {
  await browser?.close(); await server?.close();
  for (const matchId of fixtures.keys()) await backend('clean', matchId);
  await deleteApp(admin);
  fs.rmSync(cacheDir, { recursive: true, force: true });
  const report = { results, blocked, testedAt: new Date().toISOString(), productionAccess: false,
    scope: 'Actual source hook/gate/admin comparison, actual Firestore Rules and Python transaction; fixture auth/API/callable transport; no production Store Provider or production HTTP callable mounted.' };
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(output, 'report.md'), `# Record source E2E\n\n${report.scope}\n\n| Viewport | Scenario | Result |\n| --- | --- | --- |\n${results.map(row => `| ${row.viewport} | ${row.scenario} | ${row.status} |`).join('\n')}\n\nUnexpected external requests blocked: ${blocked.length}\n`);
  process.stdout.write(`RECORD_SOURCE_E2E_OUTPUT=${output}\n`);
  if (!results.length || results.some(row => row.status !== 'passed') || blocked.length) process.exitCode = 1;
}

import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';
import { chromium } from '../services/uniqueplay-sync-worker/node_modules/playwright/index.mjs';

const manifest = { version: 1, matchId: 'TEST_SCORING_ADAPTER', ruleProfileVersion: 'test-profile-v1',
  engineVersion: 'test-engine-v1', projectionVersion: 'test-projection-v1',
  blocks: ['state', 'feed', 'events', 'stats'].map(kind => ({ kind, blockId: 'a'.repeat(64), sha256: 'b'.repeat(64), size: 3 })) };
const probes = [manifest, { text: '한글😀\u007f\n\\"', value: 9007199254740991, flag: true, empty: null }];
const expected = JSON.parse(execFileSync('functions/venv/bin/python', ['-c',
  'import json,sys; from scoring_test_transfer import _digest; values=json.loads(sys.argv[1]); print(json.dumps([{"canonical":json.dumps(v,sort_keys=True,ensure_ascii=True,separators=(",",":"),allow_nan=False),"hash":_digest(v)} for v in values]))',
  JSON.stringify(probes)], { env: { ...process.env, PYTHONPATH: 'functions' }, encoding: 'utf8' }));
const bundle = await build({ stdin: { contents: "export * from './src/shared/lib/durableScoringQueue'; export * from './src/shared/lib/durableScoringCommitAdapter';",
  resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, format: 'iife', globalName: 'AdapterTest', platform: 'browser' });
const server = createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', req.url === '/bundle.js' ? 'application/javascript' : 'text/html');
  res.end(req.url === '/bundle.js' ? bundle.outputFiles[0].text : '<!doctype html><title>Local commit adapter tests</title><script src="/bundle.js"></script>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
const results = [];
try {
  browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const context = await browser.newContext();
  await context.route('**/*', route => route.request().url().startsWith(`${origin}/`) ? route.continue() : route.abort());
  const page = await context.newPage(); await page.goto(origin);
  results.push(...await page.evaluate(async ({ manifest, probes, expected }) => {
    const { DurableScoringQueue, DurableScoringCommitAdapter, canonicalCommitJson } = AdapterTest;
    const results = [];
    const check = (value, message) => { if (!value) throw new Error(message); };
    const reject = async (fn, text) => {
      try { await fn(); } catch (error) { check(String(error).includes(text), String(error)); return; }
      throw new Error(`Expected ${text}`);
    };
    const test = async (name, work) => {
      const scope = { environment: 'local-emulator', projectId: 'demo-aubl-scoring', uid: 'tester',
        matchId: manifest.matchId, testRunId: `TEST_RUN_${name}`, writerSessionId: 'tab_one', lockEpoch: 1 };
      const q = new DurableScoringQueue(scope, 0);
      const ack = request => ({ ...request, uid: scope.uid, committedRevision: request.expectedRevision + 1,
        headRevision: request.expectedRevision + 1, commitId: 'c'.repeat(64), replayed: false });
      try { await work({ q, scope, ack }); results.push({ name, status: 'passed' }); }
      catch (error) { results.push({ name, status: 'failed', error: String(error) }); }
      finally { await q.close(); }
    };
    await test('python_canonical_and_hash', async ({ q, scope, ack }) => {
      for (let i = 0; i < probes.length; i++) {
        const canonical = canonicalCommitJson(probes[i]);
        check(canonical === expected[i].canonical, 'canonical JSON differs');
        const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
        const digest = Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, '0')).join('');
        check(digest === expected[i].hash, 'Python hash differs');
      }
      await q.enqueue('one', 'snapshot');
      const adapter = new DurableScoringCommitAdapter(scope, q, { commit: async request => {
        check(request.payloadHash === expected[0].hash, 'manifest hash differs'); return ack(request);
      } });
      await adapter.prepare(manifest, 'one', 1); await adapter.flush();
    });
    await test('delayed_ack_and_single_flush', async ({ q, scope, ack }) => {
      let release, started;
      const entered = new Promise(resolve => { started = resolve; });
      let calls = 0;
      const adapter = new DurableScoringCommitAdapter(scope, q, { commit: request => {
        calls++; started(); return new Promise(resolve => { release = () => resolve(ack(request)); });
      } });
      await q.enqueue('one', 'first'); await adapter.prepare(manifest, 'one', 1);
      const first = adapter.flush(), second = adapter.flush();
      check(first === second, 'flush did not share promise');
      await entered; await q.enqueue('two', 'second'); release(); await first;
      const saved = await q.recover();
      check(calls === 1 && saved.inputs.length === 1 && saved.inputs[0].sequence === 2, 'late input lost or duplicate call');
    });
    await test('response_loss_exact_retry', async ({ q, scope, ack }) => {
      const requests = []; const receipts = new Map();
      const adapter = new DurableScoringCommitAdapter(scope, q, { commit: async request => {
        requests.push(canonicalCommitJson(request));
        if (!receipts.has(request.requestId)) {
          receipts.set(request.requestId, ack(request)); throw new Error('response-lost');
        }
        return { ...receipts.get(request.requestId), replayed: true };
      } });
      await q.enqueue('one', 'first'); await adapter.prepare(manifest, 'one', 1);
      await reject(() => adapter.flush(), 'response-lost');
      check((await q.recover()).inputs.length === 1, 'lost response deleted input');
      await adapter.flush();
      check(requests.length === 2 && requests[0] === requests[1] && receipts.size === 1, 'non-idempotent retry');
      check((await q.recover()).inputs.length === 0, 'valid retry not acknowledged');
    });
    await test('forged_ack_scope_and_hash', async ({ q, scope, ack }) => {
      let mutation = { uid: 'other' };
      const adapter = new DurableScoringCommitAdapter(scope, q, { commit: async request => ({ ...ack(request), ...mutation }) });
      await q.enqueue('one', 'first'); await adapter.prepare(manifest, 'one', 1);
      for (const wrong of [{ uid: 'other' }, { writerSessionId: 'other' }, { lockEpoch: 2 }, { runId: 'TEST_RUN_other' }]) {
        mutation = wrong; await reject(() => adapter.flush(), 'server-ack-scope-mismatch');
      }
      mutation = { payloadHash: 'd'.repeat(64) };
      await reject(() => adapter.flush(), 'server-ack-binding-mismatch');
      check((await q.recover()).inputs.length === 1, 'invalid ACK deleted input');
    });
    await test('new_adapter_recovers_frozen_request', async ({ q, scope, ack }) => {
      const first = new DurableScoringCommitAdapter(scope, q, { commit: async () => { throw new Error('offline'); } });
      await q.enqueue('one', 'first'); await first.prepare(manifest, 'one', 1);
      await reject(() => first.flush(), 'offline');
      const before = (await q.recover()).metadata.pending.payload;
      const reopened = new DurableScoringQueue(scope, 99);
      try {
        const second = new DurableScoringCommitAdapter(scope, reopened, { commit: async request => {
          check(canonicalCommitJson(request) === before, 'recovery changed request'); return ack(request);
        } });
        await second.flush();
        check((await reopened.recover()).metadata.serverRevision === 1, 'recovery revision wrong');
      } finally { await reopened.close(); }
    });
    await test('remote_head_blocks_remaining', async ({ q, scope, ack }) => {
      const adapter = new DurableScoringCommitAdapter(scope, q, { commit: async request => ({ ...ack(request), headRevision: 2 }) });
      await q.enqueue('one', 'first'); await adapter.prepare(manifest, 'one', 1); await q.enqueue('two', 'second');
      await adapter.flush();
      const saved = await q.recover();
      check(saved.inputs.length === 1 && saved.metadata.blockedReason === 'remote-head-ahead', 'remote conflict not preserved');
      await reject(() => adapter.flush(), 'queue-blocked');
    });
    await test('empty_queue_does_not_send', async ({ q, scope }) => {
      const adapter = new DurableScoringCommitAdapter(scope, q, { commit: async () => { throw new Error('unexpected-send'); } });
      check(await adapter.flush() === false, 'empty queue sent request');
    });
    return results;
  }, { manifest, probes, expected }));
  await context.close();
} catch (error) { results.push({ name: 'browser_harness', status: 'failed', error: String(error) }); }
finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
const dir = `outputs/durable-commit-adapter-browser/${new Date().toISOString().replaceAll(':', '-')}`;
mkdirSync(dir, { recursive: true });
writeFileSync(`${dir}/summary.json`, JSON.stringify({ results, productionAccess: false, externalNetwork: false,
  transport: 'stub; actual IndexedDB and Python digest', limitations: ['no real callable or modal connection'] }, null, 2));
for (const result of results) console.log(JSON.stringify(result));
console.log(`DURABLE_ADAPTER_E2E_OUTPUT=${dir}`);
if (results.some(result => result.status !== 'passed')) process.exitCode = 1;

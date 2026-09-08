import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';
import { chromium } from '../services/uniqueplay-sync-worker/node_modules/playwright/index.mjs';

const bundle = await build({ entryPoints: ['src/shared/lib/durableScoringQueue.ts'], bundle: true,
  write: false, format: 'iife', globalName: 'QueueApi', platform: 'browser' });
const server = createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.url === '/queue.js') {
    res.setHeader('Content-Type', 'application/javascript');
    res.end(bundle.outputFiles[0].text);
  } else {
    res.setHeader('Content-Type', 'text/html');
    res.end('<!doctype html><title>Local durable queue test</title><script src="/queue.js"></script>');
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const results = [];
let browser;
try {
  browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const context = await browser.newContext();
  await context.route('**/*', route => route.request().url().startsWith(`${origin}/`) ? route.continue() : route.abort());
  const page = await context.newPage();
  await page.goto(origin);
  results.push(...await page.evaluate(async () => {
    const results = [];
    const scope = name => ({ environment: 'local-emulator', projectId: 'demo-aubl-scoring', uid: 'tester',
      matchId: name, testRunId: 'TEST_RUN_QUEUE', writerSessionId: 'tab_one', lockEpoch: 1 });
    const request = (id = 'request_one') => ({ requestId: id, firstInputSequence: 1, lastInputSequence: 1,
      expectedRevision: 0, payloadHash: 'a'.repeat(64), payload: '{"manifest":"one"}' });
    const ack = () => ({ requestId: 'request_one', firstInputSequence: 1, lastInputSequence: 1,
      payloadHash: 'a'.repeat(64), commitId: 'b'.repeat(64), committedRevision: 1, headRevision: 1 });
    const check = (condition, message) => { if (!condition) throw new Error(message); };
    const rejects = async (call, code) => {
      try { await call(); } catch (error) { check(String(error).includes(code), String(error)); return; }
      throw new Error(`Expected rejection: ${code}`);
    };
    const test = async (name, run) => {
      const q = new QueueApi.DurableScoringQueue(scope(name), 0);
      try { await run(q); results.push({ name, status: 'passed' }); }
      catch (error) { results.push({ name, status: 'failed', error: String(error) }); }
      finally { await q.close(); }
    };
    await test('ack_preserves_later_inputs', async q => {
      await q.enqueue('one', 'first');
      await q.freeze(request());
      await q.enqueue('two', 'second');
      await q.acknowledge(ack());
      const saved = await q.recover();
      check(saved.inputs.length === 1 && saved.inputs[0].sequence === 2 && saved.inputs[0].snapshot === 'second', 'later input lost');
      check(saved.metadata.serverRevision === 1 && !saved.metadata.pending, 'wrong metadata');
    });
    await test('same_length_correction_and_frozen_request', async q => {
      await q.enqueue('one', 'hit');
      const frozen = request();
      await q.freeze(frozen);
      frozen.payload = 'changed';
      await q.enqueue('correction', 'err');
      const saved = await q.recover();
      check(saved.inputs.length === 2 && saved.inputs[1].snapshot === 'err', 'correction lost');
      check(saved.metadata.pending.payload === '{"manifest":"one"}', 'request mutated');
    });
    await test('wrong_ack_preserves_queue', async q => {
      await q.enqueue('one', 'first'); await q.freeze(request());
      await rejects(() => q.acknowledge({ ...ack(), payloadHash: 'c'.repeat(64) }), 'queue-ack-mismatch');
      const saved = await q.recover();
      check(saved.inputs.length === 1 && saved.metadata.pending.requestId === 'request_one', 'wrong ack changed queue');
    });
    await test('quota_failure_does_not_accept_input', async q => {
      const original = IDBObjectStore.prototype.add;
      IDBObjectStore.prototype.add = function () { throw new DOMException('Injected quota', 'QuotaExceededError'); };
      try { await rejects(() => q.enqueue('one', 'first'), 'QuotaExceededError'); }
      finally { IDBObjectStore.prototype.add = original; }
      const saved = await q.recover();
      check(saved.inputs.length === 0 && saved.metadata.nextSequence === 1, 'failed input was accepted');
    });
    await test('ack_storage_failure_rolls_back', async q => {
      await q.enqueue('one', 'first'); await q.freeze(request());
      const original = IDBObjectStore.prototype.delete;
      IDBObjectStore.prototype.delete = function () { throw new DOMException('Injected write failure', 'AbortError'); };
      try { await rejects(() => q.acknowledge(ack()), 'AbortError'); }
      finally { IDBObjectStore.prototype.delete = original; }
      const saved = await q.recover();
      check(saved.inputs.length === 1 && saved.metadata.pending && saved.metadata.serverRevision === 0, 'partial ack');
      await q.acknowledge(ack());
      check((await q.recover()).inputs.length === 0, 'ack retry failed');
    });
    await test('remote_head_conflict_preserves_remaining', async q => {
      await q.enqueue('one', 'first'); await q.freeze(request()); await q.enqueue('two', 'second');
      await q.acknowledge({ ...ack(), headRevision: 2 });
      const saved = await q.recover();
      check(saved.inputs.length === 1 && saved.metadata.blockedReason === 'remote-head-ahead', 'conflict lost');
      await rejects(() => q.enqueue('three', 'third'), 'queue-blocked');
    });
    await test('scope_isolation', async q => {
      await q.enqueue('one', 'private');
      for (const changes of [{ uid: 'other' }, { projectId: 'other' }, { testRunId: 'other' }, { lockEpoch: 2 }, { matchId: 'other' }]) {
        const other = new QueueApi.DurableScoringQueue({ ...scope('scope_isolation'), ...changes }, 0);
        try { check((await other.recover()).inputs.length === 0, 'scope leak'); }
        finally { await other.close(); }
      }
    });
    return results;
  }));
  const sharedScope = { environment: 'local-emulator', projectId: 'demo-aubl-scoring', uid: 'tester',
    matchId: 'reload_and_tabs', testRunId: 'TEST_RUN_QUEUE', writerSessionId: 'same_owner', lockEpoch: 1 };
  await page.evaluate(async scope => {
    const q = new QueueApi.DurableScoringQueue(scope, 0);
    await q.enqueue('before_reload', 'persisted');
    await q.freeze({ requestId: 'retry_exact', firstInputSequence: 1, lastInputSequence: 1, expectedRevision: 0,
      payloadHash: 'a'.repeat(64), payload: 'immutable request' });
    await q.close();
  }, sharedScope);
  await page.reload();
  const restored = await page.evaluate(async scope => {
    const q = new QueueApi.DurableScoringQueue(scope, 999);
    const result = await q.recover(); await q.close(); return result;
  }, sharedScope);
  assert.equal(restored.metadata.pending.payload, 'immutable request');
  assert.equal(restored.metadata.serverRevision, 0);
  assert.equal(restored.inputs[0].snapshot, 'persisted');
  results.push({ name: 'reload_restores_exact_pending_request', status: 'passed' });
  const second = await context.newPage(); await second.goto(origin);
  const enqueue = (target, id) => target.evaluate(async ({ scope, id }) => {
    const q = new QueueApi.DurableScoringQueue(scope, 0);
    try { return await q.enqueue(id, id); } finally { await q.close(); }
  }, { scope: sharedScope, id });
  const sequences = await Promise.all([enqueue(page, 'tab_a'), enqueue(second, 'tab_b')]);
  assert.deepEqual(sequences.sort(), [2, 3]);
  results.push({ name: 'two_tabs_atomic_sequence_allocation', status: 'passed' });
  await page.close(); await second.close();
  const reopened = await context.newPage(); await reopened.goto(origin);
  const count = await reopened.evaluate(async scope => {
    const q = new QueueApi.DurableScoringQueue(scope, 0);
    try { return (await q.recover()).inputs.length; } finally { await q.close(); }
  }, sharedScope);
  assert.equal(count, 3);
  results.push({ name: 'closed_tabs_reopen_queue', status: 'passed' });
  await context.close();
} catch (error) {
  results.push({ name: 'browser_harness', status: 'failed', error: String(error) });
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
const directory = `outputs/durable-scoring-queue-browser/${new Date().toISOString().replaceAll(':', '-')}`;
mkdirSync(directory, { recursive: true });
writeFileSync(`${directory}/summary.json`, JSON.stringify({ results, productionAccess: false,
  browser: 'Chrome headless, ephemeral context', limitations: ['not process crash or physical disk failure', 'not actual modal/transport integration'] }, null, 2));
for (const result of results) console.log(JSON.stringify(result));
console.log(`DURABLE_QUEUE_E2E_OUTPUT=${directory}`);
if (results.some(result => result.status !== 'passed')) process.exitCode = 1;

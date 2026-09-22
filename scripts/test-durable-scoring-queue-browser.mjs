import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';
import { chromium } from '../services/uniqueplay-sync-worker/node_modules/playwright/index.mjs';

const bundle = await build({ stdin: { contents: "export * from './src/shared/lib/durableScoringQueue'; export * from './src/shared/lib/durableScoringCommitAdapter';", resolveDir: process.cwd() }, bundle: true,
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
    await test('same_input_returns_original_sequence', async q => {
      check(await q.enqueue('one', 'first') === 1, 'first sequence');
      check(await q.enqueue('one', 'first') === 1, 'retry sequence');
      const saved = await q.recover();
      check(saved.inputs.length === 1 && saved.metadata.nextSequence === 2, 'duplicate accepted');
    });
    await test('same_id_changed_snapshot_rejected', async q => {
      await q.enqueue('one', 'first');
      await rejects(() => q.enqueue('one', 'other'), 'input-id-conflict');
      check((await q.recover()).inputs[0].snapshot === 'first', 'original replaced');
    });
    await test('ack_retains_idempotency_receipt', async q => {
      await q.enqueue('one', 'first'); await q.freeze(request()); await q.acknowledge(ack());
      check(await q.enqueue('one', 'first') === 1, 'acknowledged input accepted again');
      await rejects(() => q.enqueue('one', 'other'), 'input-id-conflict');
      const saved = await q.recover();
      check(saved.inputs.length === 0 && saved.metadata.nextSequence === 2, 'ack retry grew queue');
    });
    await test('prototype_like_input_ids_are_ordinary_keys', async q => {
      for (const [index, id] of ['__proto__', 'constructor', 'toString'].entries()) {
        check(await q.enqueue(id, id) === index + 1, 'wrong new sequence');
        check(await q.enqueue(id, id) === index + 1, 'wrong retry sequence');
        await rejects(() => q.enqueue(id, 'different'), 'input-id-conflict');
      }
      check((await q.recover()).inputs.length === 3, 'key collision');
    });
    await test('failed_input_has_no_receipt_and_can_retry', async q => {
      const original = IDBObjectStore.prototype.add;
      IDBObjectStore.prototype.add = function () { throw new DOMException('Quota', 'QuotaExceededError'); };
      try { await rejects(() => q.enqueue('one', 'first'), 'QuotaExceededError'); }
      finally { IDBObjectStore.prototype.add = original; }
      check(!Object.hasOwn((await q.recover()).metadata.inputReceipts, 'one'), 'receipt committed without input');
      check(await q.enqueue('one', 'first') === 1, 'retry after failure skipped sequence');
    });
    const seedLegacy = async (name, duplicates = false, snapshot = 'original') => {
      const key = JSON.stringify(['local-emulator', 'demo-aubl-scoring', 'tester', name, 'TEST_RUN_QUEUE', 'tab_one', 1]);
      await new Promise((resolve, reject) => {
        const open = indexedDB.open('aubl-scoring-durable-v1', 1);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result, tx = db.transaction(['streams', 'inputs'], 'readwrite');
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onabort = () => { db.close(); reject(tx.error); };
          tx.objectStore('streams').put({ scopeKey: key, nextSequence: duplicates ? 3 : 2, acknowledgedSequence: 0, serverRevision: 0 });
          tx.objectStore('inputs').add({ scopeKey: key, sequence: 1, inputId: 'legacy', snapshot });
          if (duplicates) tx.objectStore('inputs').add({ scopeKey: key, sequence: 2, inputId: 'legacy', snapshot: 'original' });
        };
      });
    };
    await test('legacy_pending_input_migrates_without_duplication', async q => {
      await q.recover(); await seedLegacy('legacy_pending_input_migrates_without_duplication');
      check(await q.enqueue('legacy', 'original') === 1, 'legacy retry duplicated');
      check((await q.recover()).inputs.length === 1, 'legacy input changed');
    });
    await test('legacy_duplicate_ids_fail_closed_preserving_data', async q => {
      await q.recover(); await seedLegacy('legacy_duplicate_ids_fail_closed_preserving_data', true);
      await rejects(() => q.enqueue('next', 'next'), 'legacy-input-id-conflict');
      const saved = await q.recover();
      check(saved.inputs.length === 2 && saved.metadata.nextSequence === 3, 'legacy evidence changed');
    });
    await test('legacy_ack_creates_receipt_before_deleting_payload', async q => {
      await q.recover(); await seedLegacy('legacy_ack_creates_receipt_before_deleting_payload');
      await q.freeze(request()); await q.acknowledge(ack());
      check(await q.enqueue('legacy', 'original') === 1, 'legacy ack lost identity');
      check((await q.recover()).inputs.length === 0, 'legacy ack retry duplicated');
    });
    const composite = '{"kind":"composite-play","version":1}';
    await test('unapplied_composite_blocks_freeze_and_new_inputs', async q => {
      await q.enqueue('one', composite);
      await rejects(() => q.freeze(request()), 'local-application-review-required');
      await rejects(() => q.enqueue('two', 'next'), 'local-application-review-required');
      const saved = await q.recover();
      check(saved.inputs.length === 1 && !saved.metadata.pending, 'unsafe request frozen');
      check(saved.metadata.inputReceipts.one.localApplication === 'pending', 'missing durable barrier');
    });
    await test('confirm_requires_exact_payload_then_allows_commit', async q => {
      await q.enqueue('one', composite);
      await rejects(() => q.confirmApplied('one', 'changed'), 'input-id-conflict');
      await q.confirmApplied('one', composite); await q.freeze(request()); await q.acknowledge(ack());
      check((await q.recover()).inputs.length === 0, 'confirmed input cannot commit');
    });
    await test('confirmation_disk_failure_preserves_barrier', async q => {
      await q.enqueue('one', composite);
      const original = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function () { throw new DOMException('Injected confirm failure', 'QuotaExceededError'); };
      try { await rejects(() => q.confirmApplied('one', composite), 'QuotaExceededError'); }
      finally { IDBObjectStore.prototype.put = original; }
      await rejects(() => q.freeze(request()), 'local-application-review-required');
      check((await q.recover()).metadata.inputReceipts.one.localApplication === 'pending', 'barrier lost on failed confirmation');
    });
    await test('legacy_composite_migrates_to_pending_not_ready', async q => {
      await q.recover(); await seedLegacy('legacy_composite_migrates_to_pending_not_ready', false, composite);
      await rejects(() => q.freeze(request()), 'local-application-review-required');
      const saved = await q.review();
      check(saved.metadata.inputReceipts.legacy.localApplication === 'pending', 'legacy composite implicitly approved');
    });
    await test('confirmed_prefix_can_ack_without_accepting_pending_suffix', async q => {
      await q.enqueue('one', 'first'); await q.enqueue('two', composite);
      await q.freeze(request()); await q.acknowledge(ack());
      const saved = await q.recover();
      check(saved.inputs.length === 1 && saved.inputs[0].inputId === 'two', 'suffix lost');
      await rejects(() => q.enqueue('three', 'third'), 'local-application-review-required');
    });
    await test('pending_barrier_survives_new_queue_instance', async q => {
      await q.enqueue('one', composite);
      const other = new QueueApi.DurableScoringQueue(scope('pending_barrier_survives_new_queue_instance'), 0);
      try {
        await rejects(() => other.freeze(request()), 'local-application-review-required');
        await other.confirmApplied('one', composite); await other.freeze(request());
      } finally { await other.close(); }
    });
    await test('legacy_frozen_request_is_blocked_before_transport', async q => {
      await q.enqueue('one', composite); await q.confirmApplied('one', composite);
      let calls = 0;
      const transport = { commit: async () => { calls++; throw new Error('must not send'); } };
      const key = scope('legacy_frozen_request_is_blocked_before_transport');
      const adapter = new QueueApi.DurableScoringCommitAdapter(key, q, transport);
      await adapter.prepare({ version: 1, matchId: key.matchId, ruleProfileVersion: 'test', engineVersion: 'test', projectionVersion: 'test', blocks: [] }, 'frozen_old', 1);
      const captured = await q.recover();
      await new Promise((resolve, reject) => {
        const open = indexedDB.open('aubl-scoring-durable-v1', 1);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result, tx = db.transaction('streams', 'readwrite');
          tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => { db.close(); reject(tx.error); };
          delete captured.metadata.inputReceipts.one.localApplication;
          tx.objectStore('streams').put(captured.metadata);
        };
      });
      const reopened = new QueueApi.DurableScoringQueue(key, 0);
      try {
        const old = new QueueApi.DurableScoringCommitAdapter(key, reopened, transport);
        await rejects(() => old.flush(), 'local-application-review-required');
        const saved = await reopened.recover();
        check(calls === 0 && saved.inputs.length === 1 && saved.metadata.pending.requestId === 'frozen_old', 'unsafe transport or evidence loss');
        await rejects(() => reopened.acknowledge({ ...ack(), requestId: 'frozen_old', payloadHash: saved.metadata.pending.payloadHash }), 'local-application-review-required');
      } finally { await reopened.close(); }
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
  const duplicateSequences = await Promise.all([enqueue(page, 'shared_retry'), enqueue(second, 'shared_retry')]);
  assert.deepEqual(duplicateSequences, [4, 4]);
  results.push({ name: 'two_tabs_same_id_allocate_one_sequence', status: 'passed' });
  await page.close(); await second.close();
  const reopened = await context.newPage(); await reopened.goto(origin);
  const count = await reopened.evaluate(async scope => {
    const q = new QueueApi.DurableScoringQueue(scope, 0);
    try { return (await q.recover()).inputs.length; } finally { await q.close(); }
  }, sharedScope);
  assert.equal(count, 4);
  results.push({ name: 'closed_tabs_reopen_queue', status: 'passed' });
  assert.equal(await enqueue(reopened, 'shared_retry'), 4);
  results.push({ name: 'reopen_retains_input_receipt', status: 'passed' });
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

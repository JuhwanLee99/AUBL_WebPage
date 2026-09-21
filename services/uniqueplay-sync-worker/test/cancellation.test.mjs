import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DurableRuns } from '../src/durable-runs.mjs';

const ID = '11111111-1111-4111-8111-111111111111';
const CANCEL = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
class Store {
  records = new Map();
  async load() { return structuredClone([...this.records.values()]); }
  async write(record) { this.records.set(record.runId, structuredClone(record)); }
}
function setup(options = {}) {
  const store = options.store ?? new Store();
  const runtime = new DurableRuns({ store, callbackBase: 'http://fixture.invalid', token: 'fixture-only', log: () => {},
    collect: async () => ({}), retryDelay: 0,
    fetchImpl: async (_url, request) => ({ ok: true, status: 200, json: async () => ({ runId: ID,
      deliveryId: request.headers['x-sync-delivery-id'], sequence: Number(request.headers['x-sync-sequence']),
      payloadHash: request.headers['x-sync-payload-sha256'], outcome: 'APPLIED' }) }), ...options });
  return { runtime, store };
}
function waitingCollector(entered, stopped, code = 'ADMIN_CANCELLED') {
  return async (_payload, _progress, signal) => {
    entered.resolve(signal);
    await new Promise((_resolve, reject) => signal.addEventListener('abort', () => {
      stopped.resolve(); reject(Object.assign(new Error(code), { code }));
    }, { once: true }));
  };
}

test('cancellation capability is explicit', () => {
  assert.equal(setup().runtime.health().cancellationProtocolVersion, 1);
});
test('absent legacy run receives a durable tombstone, not an automatic collection', async () => {
  const { runtime, store } = setup();
  const proof = await runtime.cancel(ID, CANCEL);
  assert.deepEqual(proof, { runId: ID, cancellationId: CANCEL, fenced: true, stopped: true, protocolVersion: 2, cancellationProtocolVersion: 1 });
  assert.equal(store.records.get(ID).phase, 'FENCED');
  await assert.rejects(runtime.submit({ runId: ID }), { code: 'RUN_ID_CONFLICT' });
});
test('same cancellation is idempotent and different IDs conflict', async () => {
  const { runtime } = setup();
  assert.deepEqual(await runtime.cancel(ID, CANCEL), await runtime.cancel(ID, CANCEL));
  await assert.rejects(runtime.cancel(ID, OTHER), { code: 'CANCELLATION_ID_CONFLICT' });
});
for (const [id, cancellation] of [['bad', CANCEL], [ID, 'bad']]) test(`invalid cancellation identity ${id}/${cancellation}`, async () => {
  const { runtime, store } = setup();
  await assert.rejects(runtime.cancel(id, cancellation), { code: 'INVALID_CANCELLATION_ID' });
  assert.equal(store.records.size, 0);
});
test('active collection is aborted before stopped proof and never produces a failed callback', async () => {
  const entered = deferred(), stopped = deferred(); let delivered = 0;
  const { runtime, store } = setup({ collect: waitingCollector(entered, stopped), fetchImpl: async () => { delivered++; throw new Error('unexpected'); } });
  await runtime.submit({ runId: ID }); const signal = await entered.promise;
  const proof = await runtime.cancel(ID, CANCEL); await stopped.promise; await runtime.idle();
  assert.equal(signal.aborted, true); assert.equal(proof.stopped, true);
  assert.equal(runtime.status(ID).active, false); assert.equal(delivered, 0);
  assert.deepEqual(store.records.get(ID).pending, []);
});
test('in-flight delivery abort preserves original bytes and prevents retry', async () => {
  const entered = deferred(); let attempts = 0;
  const { runtime, store } = setup({ fetchImpl: async (_url, request) => {
    attempts++; entered.resolve(request.body);
    return new Promise((_resolve, reject) => request.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
  } });
  await runtime.submit({ runId: ID }); const original = await entered.promise;
  await runtime.cancel(ID, CANCEL); await runtime.idle();
  assert.equal(attempts, 1); assert.equal(store.records.get(ID).pending[0].body, original);
  assert.equal(runtime.draining.has(ID), false);
  await assert.rejects(runtime.retry(ID), { code: 'RUN_ALREADY_TERMINAL' });
});
test('already acknowledged candidate cannot be cancelled', async () => {
  const { runtime } = setup(); await runtime.submit({ runId: ID }); await runtime.idle();
  await assert.rejects(runtime.cancel(ID, CANCEL), { code: 'CANDIDATE_MUST_BE_PRESERVED' });
  assert.equal(runtime.status(ID).state, 'COMPLETED');
});
test('persisted cancellation survives restart without collecting or delivering', async () => {
  const store = new Store();
  await store.write({ version: 2, runId: ID, phase: 'CANCELLING', cancellationId: CANCEL,
    requestHash: null, terminal: null, pending: [], blocked: null, lastSequence: 0 });
  let calls = 0;
  const { runtime } = setup({ store, collect: async () => { calls++; }, fetchImpl: async () => { calls++; } });
  await runtime.initialize(); await runtime.idle();
  assert.equal(calls, 0); assert.equal(runtime.status(ID).state, 'FENCED');
});
test('concurrent cancellation callers preserve one cancellation ID', async () => {
  const { runtime } = setup();
  const results = await Promise.allSettled([runtime.cancel(ID, CANCEL), runtime.cancel(ID, OTHER)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(runtime.status(ID).cancellationId, CANCEL);
});
test('cancellation persistence failure never returns stopped proof', async () => {
  const store = new Store(); const write = store.write.bind(store);
  store.write = async record => { if (record.phase === 'FENCED') throw new Error('disk full'); await write(record); };
  const { runtime } = setup({ store });
  await assert.rejects(runtime.cancel(ID, CANCEL), { code: 'SYNC_STORAGE_UNAVAILABLE' });
  assert.equal(store.records.get(ID).phase, 'CANCELLING'); assert.equal(runtime.health().ok, false);
});
test('unconfirmed browser close prevents proof and future submissions', async () => {
  const entered = deferred(), stopped = deferred();
  const { runtime } = setup({ collect: waitingCollector(entered, stopped, 'BROWSER_STOP_NOT_CONFIRMED') });
  await runtime.submit({ runId: ID }); await entered.promise;
  await assert.rejects(runtime.cancel(ID, CANCEL), { code: 'WORKER_STOP_NOT_CONFIRMED' });
  await runtime.idle(); assert.equal(runtime.health().ok, false);
  await assert.rejects(runtime.submit({ runId: OTHER }), { code: 'WORKER_STOP_NOT_CONFIRMED' });
});
test('legacy recovery cannot replace an in-progress cancellation', async () => {
  const { runtime, store } = setup();
  await store.write({ version: 2, runId: ID, phase: 'CANCELLING', cancellationId: CANCEL, pending: [], lastSequence: 0 });
  runtime.records.set(ID, structuredClone(store.records.get(ID)));
  await assert.rejects(runtime.fence(ID, OTHER), { code: 'RUN_BUSY' });
  await assert.rejects(runtime.enqueue(ID, 'progress', { stage: 'GAMES' }), { code: 'RUN_ALREADY_TERMINAL' });
});
test('acceptance must finish its first disk write before cancellation', async () => {
  const store = new Store(); const enteredWrite = deferred(), release = deferred(), entered = deferred(), stopped = deferred();
  const write = store.write.bind(store); let first = true;
  store.write = async record => { if (first) { first = false; enteredWrite.resolve(); await release.promise; } await write(record); };
  const { runtime } = setup({ store, collect: waitingCollector(entered, stopped) });
  const submitted = runtime.submit({ runId: ID }); await enteredWrite.promise;
  await assert.rejects(runtime.cancel(ID, CANCEL), { code: 'RUN_BUSY' });
  release.resolve(); await submitted; await entered.promise;
  await runtime.cancel(ID, CANCEL); await runtime.idle();
});

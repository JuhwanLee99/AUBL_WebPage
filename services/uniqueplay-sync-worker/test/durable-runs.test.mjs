import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, readFile, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DiskRunStore, DurableRuns, payloadHash } from '../src/durable-runs.mjs';

const ID = '2c0f5b0a-863a-46ea-a091-f1041306f516';
const OTHER = '9c0f5b0a-863a-46ea-a091-f1041306f516';
const RECOVERY = '8c0f5b0a-863a-46ea-a091-f1041306f516';
const request = { runId: ID, seasonYear: 2026, collectionScope: { version: 1, mode: 'SINCE_LAST_SYNC', fromDate: '2026-09-11' } };
class MemoryStore {
  records = new Map(); fail = false;
  async load() { return structuredClone([...this.records.values()]); }
  async write(record) {
    if (this.fail) throw new Error('disk unavailable');
    this.records.set(record.runId, structuredClone(record));
  }
}
function success(_url, init) {
  return Promise.resolve({ ok: true, status: 200, json: async () => ({ runId: ID,
    deliveryId: init.headers['x-sync-delivery-id'], sequence: Number(init.headers['x-sync-sequence']),
    payloadHash: init.headers['x-sync-payload-sha256'], outcome: 'APPLIED' }) });
}
function setup(options = {}) {
  const store = options.store || new MemoryStore(); const logs = [];
  const runtime = new DurableRuns({ store, callbackBase: 'http://fixture.invalid/', token: 'never-print-this-token',
    collect: async () => ({ candidate: { checksum: 'fixture' } }), fetchImpl: success,
    maxAttempts: 2, retryDelay: 0, log: message => logs.push(message), ...options });
  return { runtime, store, logs };
}
test('acknowledged candidate is delivered once and finished', async () => {
  let collected = 0;
  const { runtime } = setup({ collect: async () => { collected += 1; return { candidate: {} }; } });
  await runtime.initialize(); await runtime.submit(request); await runtime.idle();
  assert.equal(runtime.status(ID).state, 'COMPLETED');
  await runtime.submit(request); await runtime.idle(); assert.equal(collected, 1);
});
test('progress persists in sequence before candidate and carries immutable hashes', async () => {
  const delivered = [];
  const { runtime } = setup({ collect: async (_payload, progress) => {
    await progress({ stage: 'STANDINGS', groupCode: 'A', count: 5 });
    await progress({ stage: 'GAMES', count: 17 }); return { candidate: {} };
  }, fetchImpl: async (url, init) => {
    delivered.push({ url, ...init }); assert.equal(init.headers['x-sync-payload-sha256'], payloadHash(init.body));
    return success(url, init);
  } });
  await runtime.initialize(); await runtime.submit(request); await runtime.idle();
  assert.deepEqual(delivered.map(x => x.headers['x-sync-sequence']), ['1', '2', '3']);
  assert.ok(delivered[2].url.endsWith('/candidate'));
});
test('response loss retries identical delivery ID and bytes rather than recollecting', async () => {
  const requests = []; let calls = 0;
  const { runtime } = setup({ fetchImpl: async (url, init) => {
    requests.push(init); if (++calls === 1) throw new Error('response lost after commit'); return success(url, init);
  } });
  await runtime.initialize(); await runtime.submit(request); await runtime.idle();
  assert.equal(runtime.status(ID).state, 'COMPLETED');
  assert.deepEqual(requests[0].headers, requests[1].headers); assert.equal(requests[0].body, requests[1].body);
});
for (const status of [400, 401, 403, 404, 409, 413, 422]) test(`HTTP ${status} retains delivery and does not fall back to legacy`, async () => {
  let calls = 0;
  const { runtime, store } = setup({ fetchImpl: async url => {
    assert.match(url, /\/v2\/runs\//); calls += 1; return { ok: false, status };
  } });
  await runtime.initialize(); await runtime.submit(request); await runtime.idle();
  assert.equal(calls, 1); assert.equal(runtime.status(ID).blocked, 'CALLBACK_HTTP_ERROR');
  assert.equal(store.records.get(ID).pending[0].kind, 'candidate');
});
for (const status of [408, 425, 429, 500, 502, 503, 504]) test(`HTTP ${status} retries within the bounded attempt budget`, async () => {
  let calls = 0;
  const { runtime } = setup({ fetchImpl: async () => { calls += 1; return { ok: false, status }; } });
  await runtime.initialize(); await runtime.submit(request); await runtime.idle();
  assert.equal(calls, 2); assert.equal(runtime.status(ID).blocked, 'CALLBACK_RETRIES_EXHAUSTED');
  assert.equal(runtime.health().pendingDeliveries, 1);
});
test('wrong ACK cannot remove a candidate', async () => {
  const { runtime } = setup({ fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({}) }) });
  await runtime.initialize(); await runtime.submit(request); await runtime.idle();
  assert.equal(runtime.status(ID).blocked, 'CALLBACK_ACK_MISMATCH'); assert.equal(runtime.status(ID).pendingDeliveries, 1);
});
test('candidate delivery failure is never replaced by a collection-failed callback', async () => {
  const { runtime, store } = setup({ fetchImpl: async () => { throw new Error('offline'); } });
  await runtime.initialize(); await runtime.submit(request); await runtime.idle();
  assert.deepEqual(store.records.get(ID).pending.map(x => x.kind), ['candidate']);
});
test('collection error is retained and confidential messages are not logged', async () => {
  const { runtime, store, logs } = setup({ collect: async () => { throw Object.assign(new Error('secret-token@example.invalid'), { code: 'REAUTH_REQUIRED' }); },
    fetchImpl: async () => ({ ok: false, status: 401 }) });
  await runtime.initialize(); await runtime.submit(request); await runtime.idle();
  assert.equal(JSON.parse(store.records.get(ID).pending[0].body).code, 'REAUTH_REQUIRED');
  assert.ok(logs.some(x => x.includes('collection_failed')));
  assert.ok(!logs.join('').includes('secret-token')); assert.ok(!logs.join('').includes('never-print-this-token'));
});
test('failure acknowledgement finishes as REAUTH_REQUIRED', async () => {
  const { runtime } = setup({ collect: async () => { throw Object.assign(new Error(), { code: 'REAUTH_REQUIRED' }); } });
  await runtime.initialize(); await runtime.submit(request); await runtime.idle();
  assert.equal(runtime.status(ID).state, 'REAUTH_REQUIRED');
});
test('disk failure rejects acceptance and further writes', async () => {
  const { runtime, store } = setup(); await runtime.initialize(); store.fail = true;
  await assert.rejects(runtime.submit(request), { code: 'SYNC_STORAGE_UNAVAILABLE' });
  assert.equal(runtime.health().ok, false);
  await assert.rejects(runtime.submit({ ...request, runId: OTHER }), { code: 'SYNC_STORAGE_UNAVAILABLE' });
});
test('duplicate request must wait for the first durable acceptance', async () => {
  let entered; let release;
  const writing = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const store = new MemoryStore(); const write = store.write.bind(store); let firstWrite = true;
  store.write = async record => { if (firstWrite) { firstWrite = false; entered(); await gate; } await write(record); };
  const { runtime } = setup({ store }); await runtime.initialize();
  const first = runtime.submit(request); await writing;
  let accepted = false; const duplicate = runtime.submit(request).then(() => { accepted = true; });
  try { await Promise.resolve(); assert.equal(accepted, false, 'no ACK before durable write'); }
  finally { release(); await Promise.allSettled([first, duplicate]); await runtime.idle(); }
});
test('all simultaneous duplicates reject when the initial durable write fails', async () => {
  let entered; let release;
  const writing = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const store = new MemoryStore();
  store.write = async () => { entered(); await gate; throw new Error('disk failed'); };
  let collections = 0;
  const { runtime } = setup({ store, collect: async () => { collections += 1; return {}; } });
  await runtime.initialize(); const first = runtime.submit(request); await writing;
  const duplicates = Array.from({ length: 8 }, () => runtime.submit(request));
  const settled = Promise.allSettled([first, ...duplicates]); release();
  for (const result of await settled) {
    assert.equal(result.status, 'rejected'); assert.equal(result.reason.code, 'SYNC_STORAGE_UNAVAILABLE');
  }
  await runtime.idle(); assert.equal(collections, 0);
  assert.equal(runtime.status(ID).active, false); assert.equal(runtime.health().activeRuns, 0);
});
test('initial durable acceptance is busy for status, fence and retry until persisted', async () => {
  let entered; let release;
  const writing = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const store = new MemoryStore(); const write = store.write.bind(store); let firstWrite = true;
  store.write = async record => { if (firstWrite) { firstWrite = false; entered(); await gate; } await write(record); };
  const { runtime } = setup({ store }); await runtime.initialize();
  const first = runtime.submit(request); await writing;
  try {
    assert.equal(runtime.status(ID).active, true); assert.equal(runtime.health().activeRuns, 1);
    await assert.rejects(runtime.fence(ID, RECOVERY), { code: 'RUN_BUSY' });
    await assert.rejects(runtime.retry(ID), { code: 'RUN_BUSY' });
    await assert.rejects(runtime.submit({ ...request, runId: OTHER }), { code: 'ANOTHER_RUN_PENDING' });
  } finally { release(); await first; await runtime.idle(); }
  assert.equal(runtime.status(ID).state, 'COMPLETED');
});
test('simultaneous duplicate acceptance invokes collection only once', async () => {
  let entered; let release;
  const writing = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const store = new MemoryStore(); const write = store.write.bind(store); let firstWrite = true; let collections = 0;
  store.write = async record => { if (firstWrite) { firstWrite = false; entered(); await gate; } await write(record); };
  const { runtime } = setup({ store, collect: async () => { collections += 1; return { candidate: {} }; } });
  await runtime.initialize(); const first = runtime.submit(request); await writing;
  const duplicates = Array.from({ length: 16 }, () => runtime.submit(request));
  const all = Promise.all([first, ...duplicates]); release();
  assert.equal((await all).length, 17); await runtime.idle(); assert.equal(collections, 1);
});
test('pending delivery prevents a second collection', async () => {
  const { runtime } = setup({ fetchImpl: async () => ({ ok: false, status: 401 }) });
  await runtime.initialize(); await runtime.submit(request); await runtime.idle();
  await assert.rejects(runtime.submit({ ...request, runId: OTHER }), { code: 'ANOTHER_RUN_PENDING' });
  await assert.rejects(runtime.submit({ ...request, seasonYear: 2025 }), { code: 'RUN_ID_CONFLICT' });
});
test('restart retains candidate and explicit retry sends the same ID', async () => {
  const first = setup({ fetchImpl: async () => ({ ok: false, status: 401 }) });
  await first.runtime.initialize(); await first.runtime.submit(request); await first.runtime.idle();
  const id = first.store.records.get(ID).pending[0].deliveryId;
  let delivered;
  const second = setup({ store: first.store, collect: async () => assert.fail('must not recollect'), fetchImpl: async (url, init) => {
    delivered = init.headers['x-sync-delivery-id']; return success(url, init);
  } });
  await second.runtime.initialize(); assert.equal(second.runtime.status(ID).blocked, 'CALLBACK_HTTP_ERROR');
  await second.runtime.retry(ID); await second.runtime.idle();
  assert.equal(delivered, id); assert.equal(second.runtime.status(ID).state, 'COMPLETED');
});
test('interrupted collection is failed without silently starting over', async () => {
  const store = new MemoryStore();
  await store.write({ version: 2, runId: ID, phase: 'COLLECTING', requestHash: 'old', lastSequence: 0, terminal: null, pending: [], blocked: null });
  const { runtime } = setup({ store, collect: async () => assert.fail('must not recollect') });
  await runtime.initialize(); await runtime.idle(); assert.equal(runtime.status(ID).state, 'FAILED');
});
test('fence is durable, idempotent and prevents the same run ID being restarted', async () => {
  const { runtime, store } = setup(); await runtime.initialize();
  const proof = await runtime.fence(ID, RECOVERY);
  assert.deepEqual(await runtime.fence(ID, RECOVERY), proof);
  assert.equal(store.records.get(ID).phase, 'FENCED');
  await assert.rejects(runtime.submit(request), { code: 'RUN_ID_CONFLICT' });
  await assert.rejects(runtime.fence(ID, OTHER), { code: 'RECOVERY_ID_CONFLICT' });
});
test('fence refuses a retained candidate', async () => {
  const { runtime } = setup({ fetchImpl: async () => ({ ok: false, status: 401 }) });
  await runtime.initialize(); await runtime.submit(request); await runtime.idle();
  await assert.rejects(runtime.fence(ID, RECOVERY), { code: 'CANDIDATE_MUST_BE_PRESERVED' });
});
test('fenced failure evidence survives restart without automatic callbacks', async () => {
  const { runtime, store } = setup({ collect: async () => { throw new Error('failed'); }, fetchImpl: async () => ({ ok: false, status: 401 }) });
  await runtime.initialize(); await runtime.submit(request); await runtime.idle(); await runtime.fence(ID, RECOVERY);
  const next = setup({ store, fetchImpl: async () => assert.fail('fenced callbacks must not restart') });
  await next.runtime.initialize(); await next.runtime.idle();
  assert.equal(next.runtime.status(ID).state, 'FENCED'); assert.equal(store.records.get(ID).pending.length, 1);
});
test('disk store survives a new instance, preserves mode and rejects corrupt files', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'aubl-durable-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new DiskRunStore(directory); await store.load();
  const record = { version: 2, runId: ID, phase: 'COMPLETED', lastSequence: 1, pending: [] };
  await store.write(record);
  assert.deepEqual(await new DiskRunStore(directory).load(), [record]);
  assert.equal((await stat(join(directory, `${ID}.json`))).mode & 0o777, 0o600);
  assert.equal(JSON.parse(await readFile(join(directory, `${ID}.json`), 'utf8')).runId, ID);
  await writeFile(join(directory, `${ID}.json`), '{broken');
  await assert.rejects(new DiskRunStore(directory).load());
});
test('missing durable directory fails closed', () => assert.throws(() => new DiskRunStore(''), { code: 'SYNC_STATE_DIR_REQUIRED' }));

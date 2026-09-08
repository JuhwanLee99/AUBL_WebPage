import test from 'node:test';
import assert from 'node:assert/strict';
import { AtomicScoringOutbox, AtomicScoringError, prepareAtomicRequest, validateAtomicRequest, serializeAtomicPayload, decideAtomicCommit } from '../src/shared/lib/atomicScoring.ts';
import { atomicPayload, atomicHead, memoryStorage, memoryTransport } from './e2e/scoring/atomic-fixtures.mjs';
const scope = { matchId: 'LOCAL_ATOMIC_ONLY', actorUid: 'LOCAL_E2E_SCORER', lockEpoch: 0, expectedRevision: 0 };
const request = (id = 'request-1', revision = 0, payload = atomicPayload()) => prepareAtomicRequest({ ...scope, id, expectedRevision: revision }, payload);
const client = (transport = memoryTransport(), storage = memoryStorage(), extra = {}) => new AtomicScoringOutbox({ ...scope, revision: 0, transport, storage, ...extra });
const rejects = (fn, code) => assert.rejects(fn, error => error.code === code);

test('ATOMIC exact retry returns the original receipt with one write', async () => {
  const transport = memoryTransport(), r = await request();
  const first = await transport.commit(r), second = await transport.commit(r);
  assert.equal(first.revision, 1); assert.equal(second.replayed, true); assert.equal(transport.writes, 1);
});
test('ATOMIC a same-length correction changes both event and feed', async () => {
  const transport = memoryTransport(); await transport.commit(await request());
  await transport.commit(await request('correction-2', 1, atomicPayload(scope.matchId, 1)));
  const saved = JSON.parse(transport.head.payload);
  assert.equal(saved.events.length, 1); assert.equal(saved.feed.length, 1);
  assert.equal(saved.events[0].outcome, 'single'); assert.equal(saved.core.score.away, 1); assert.equal(transport.head.revision, 2);
});
test('ATOMIC undo is a new revision, not deletion of the audit receipt', async () => {
  const transport = memoryTransport(); await transport.commit(await request());
  const undone = atomicPayload(); undone.feed = []; undone.events = [];
  await transport.commit(await request('undo-2', 1, undone));
  assert.equal(JSON.parse(transport.head.payload).events.length, 0); assert.equal(transport.receipts.size, 2);
});
test('ATOMIC concurrent writers sharing an expected revision do not overwrite', async () => {
  const transport = memoryTransport(), a = await request('writer-a'), b = await request('writer-b');
  const outcomes = await Promise.allSettled([transport.commit(a), transport.commit(b)]);
  assert.equal(outcomes.filter(x => x.status === 'fulfilled').length, 1); assert.equal(transport.writes, 1);
});
test('ATOMIC same ID with different content is not a retry', async () => {
  const transport = memoryTransport(); await transport.commit(await request());
  const changed = await request('request-1', 0, atomicPayload(scope.matchId, 1));
  await rejects(() => transport.commit(changed), 'idempotency-conflict');
  assert.equal(transport.writes, 1);
});
for (const patch of [{ ownerUid: 'OTHER' }, { paused: true }, { lockEpoch: 1 }]) test(`ATOMIC revoked lease ${JSON.stringify(patch)}`, async () => {
  const transport = memoryTransport(); transport.setHead(patch);
  await rejects(async () => transport.commit(await request()), 'permission-denied'); assert.equal(transport.writes, 0);
});
test('ATOMIC no implicit migration of an absent stream', async () => assert.throws(() => decideAtomicCommit(null, null, { ...scope }, scope.actorUid), { code: 'migration-required' }));
test('ATOMIC scope rejects the wrong match', async () => assert.throws(() => decideAtomicCommit(atomicHead('OTHER'), null, { ...scope }, scope.actorUid), { code: 'wrong-match' }));
test('ATOMIC canonical encoding is independent of object key order', async () => {
  const payload = atomicPayload(), reordered = { events: payload.events, core: payload.core, matchId: payload.matchId, feed: payload.feed };
  assert.deepEqual(await request('canonical', 0, payload), await request('canonical', 0, reordered));
});
test('ATOMIC tampered persisted request is rejected before writing', async () => {
  const r = await request(); r.payload = r.payload.replace('아웃', '안타');
  await rejects(() => validateAtomicRequest(r), 'invalid-request');
});
for (const patch of [{ outs: 4 }, { outs: -1 }, { balls: 4 }, { strikes: 3 }, { inning: 0 }, { half: 'wrong' }, { bases: ['A', 'A', null] }, { bases: [null] }, { score: { home: -1, away: 0 } }]) test(`ATOMIC rejects invalid state ${JSON.stringify(patch)}`, () => {
  const payload = atomicPayload(); Object.assign(payload.core, patch);
  assert.throws(() => serializeAtomicPayload(payload), { code: 'invalid-state' });
});
test('ATOMIC duplicate event identity and orphan feed are blocked', () => {
  const payload = atomicPayload(); payload.events.push(payload.events[0]);
  assert.throws(() => serializeAtomicPayload(payload), { code: 'invalid-event-identity' });
  payload.events = []; assert.throws(() => serializeAtomicPayload(payload), { code: 'orphan-feed' });
});
test('ATOMIC UTF-8 payload budget fails closed', () => {
  const payload = atomicPayload(); payload.core.note = '가'.repeat(240000);
  assert.throws(() => serializeAtomicPayload(payload), { code: 'payload-too-large' });
});
test('OUTBOX persists before any transport call and clears only after ACK', async () => {
  const transport = memoryTransport(), storage = memoryStorage(), box = client(transport, storage);
  await box.stage(atomicPayload()); assert.equal(storage.entries.size, 1); assert.equal(transport.calls, 0);
  await box.flush(); assert.equal(box.getSnapshot().phase, 'saved'); assert.equal(storage.entries.size, 0);
});
for (const mode of ['offline', 'fail-before', 'response-lost']) test(`OUTBOX ${mode}: manual retry uses the same ID`, async () => {
  const transport = memoryTransport(), storage = memoryStorage(), box = client(transport, storage); transport.setMode(mode);
  await box.stage(atomicPayload()); const id = box.getSnapshot().requestId;
  await box.flush(); assert.equal(box.getSnapshot().phase, 'retry-required'); assert.equal(box.getSnapshot().requestId, id);
  transport.setMode('online'); await box.flush(); assert.equal(box.getSnapshot().phase, 'saved'); assert.equal(transport.writes, 1);
});
test('OUTBOX reload restores a failed command without changing its ID', async () => {
  const transport = memoryTransport(), storage = memoryStorage(), box = client(transport, storage); transport.setMode('offline');
  await box.stage(atomicPayload()); await box.flush(); const restored = client(transport, storage);
  assert.equal(restored.getSnapshot().requestId, box.getSnapshot().requestId);
  transport.setMode('online'); await restored.flush(); assert.equal(restored.getSnapshot().revision, 1);
});
test('OUTBOX refuses to replace a queued command', async () => {
  const box = client(); await box.stage(atomicPayload()); const id = box.getSnapshot().requestId;
  await rejects(() => box.stage(atomicPayload(scope.matchId, 1)), 'outbox-not-ready'); assert.equal(box.getSnapshot().requestId, id);
});
test('OUTBOX concurrent stage is serialized', async () => {
  const box = client(); const first = box.stage(atomicPayload());
  await rejects(() => box.stage(atomicPayload()), 'outbox-not-ready'); await first;
});
test('OUTBOX duplicate flush shares a single transport attempt', async () => {
  const transport = memoryTransport(), box = client(transport); await box.stage(atomicPayload());
  await Promise.all([box.flush(), box.flush(), box.flush()]); assert.equal(transport.calls, 1);
});
for (const mode of ['denied', 'conflict']) test(`OUTBOX ${mode} never automatically retries or clears pending data`, async () => {
  const transport = memoryTransport(), storage = memoryStorage(), box = client(transport, storage);
  if (mode === 'denied') transport.setMode('denied'); else transport.setHead({ revision: 1 });
  await box.stage(atomicPayload()); await box.flush(); await box.flush();
  assert.equal(box.getSnapshot().phase, mode === 'denied' ? 'blocked' : 'conflict'); assert.equal(transport.calls, 1); assert.equal(storage.entries.size, 1);
});
test('OUTBOX storage quota failure prevents network writes', async () => {
  const transport = memoryTransport(), storage = memoryStorage(); storage.setItem = () => { throw Error('quota'); };
  const box = client(transport, storage); await rejects(() => box.stage(atomicPayload()), 'outbox-write-failed');
  await box.flush(); assert.equal(transport.calls, 0); assert.equal(box.getSnapshot().phase, 'storage-error');
});
test('OUTBOX failed receipt cleanup can retry without duplicating a commit', async () => {
  const transport = memoryTransport(), storage = memoryStorage(), remove = storage.removeItem;
  storage.removeItem = () => { throw Error('storage'); }; const box = client(transport, storage);
  await box.stage(atomicPayload()); await box.flush(); assert.equal(box.getSnapshot().phase, 'storage-error');
  storage.removeItem = remove; await box.flush(); assert.equal(transport.writes, 1); assert.equal(box.getSnapshot().phase, 'saved');
});
test('OUTBOX account-scoped queue is not replayed by another actor', async () => {
  const transport = memoryTransport(), storage = memoryStorage(); await client(transport, storage).stage(atomicPayload());
  const other = client(transport, storage, { actorUid: 'OTHER' }); await other.flush();
  assert.equal(transport.calls, 0); assert.equal(storage.entries.size, 1);
});
test('OUTBOX invalid ACK cannot advertise server confirmation', async () => {
  const box = client({ commit: async () => ({ id: 'wrong' }) }); await box.stage(atomicPayload()); await box.flush();
  assert.equal(box.getSnapshot().phase, 'retry-required'); assert.equal(box.getSnapshot().error, 'invalid-ack');
});
test('OUTBOX late receipt after a newer remote commit requires reconciliation', async () => {
  const transport = memoryTransport(), box = client(transport); transport.setMode('response-lost');
  await box.stage(atomicPayload()); await box.flush();
  await transport.commit(await request('newer', 1, atomicPayload(scope.matchId, 1)));
  await box.flush(); assert.equal(box.getSnapshot().phase, 'conflict'); assert.equal(transport.writes, 2);
});

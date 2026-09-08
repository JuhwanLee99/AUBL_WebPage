import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp as adminApp, deleteApp as deleteAdminApp } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { initializeApp, deleteApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, doc, getDoc, updateDoc, setDoc, deleteDoc, writeBatch, terminate, setLogLevel } from 'firebase/firestore';
import { createFirestoreScoringTransport } from '../src/shared/lib/atomicScoringFirestore.ts';
import { prepareAtomicRequest, AtomicScoringOutbox, AtomicScoringError } from '../src/shared/lib/atomicScoring.ts';
import { atomicHead, atomicPayload, memoryStorage } from './e2e/scoring/atomic-fixtures.mjs';
import { firestoreNetworkGate } from './e2e/scoring/firestore-network-gate.mjs';

const host = process.env.FIRESTORE_EMULATOR_HOST;
const projectId = process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT;
assert.match(host ?? '', /^(127\.0\.0\.1|localhost):\d+$/, 'Refusing non-loopback or missing emulator');
assert.match(projectId ?? '', /^demo-aubl-scoring$/, 'Refusing real or unrelated Firebase project');
const [hostname, port] = host.split(':');
setLogLevel('silent');
const admin = adminApp({ projectId }, `scoring-seed-${Date.now()}`), dbAdmin = adminFirestore(admin);
const clients = [], streams = [], UID = 'LOCAL_E2E_SCORER', OTHER = 'LOCAL_OTHER_SCORER';
let sequence = 0;
function connect(uid, emulatorPort = Number(port), emulatorHostname = hostname) {
  const app = initializeApp({ projectId, apiKey: 'emulator-only', appId: 'emulator-only' }, `scoring-${uid ?? 'anon'}-${clients.length}`);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, emulatorHostname, emulatorPort, uid ? { mockUserToken: { sub: uid, user_id: uid, email: `${uid}@example.invalid` } } : undefined);
  const transport = createFirestoreScoringTransport(db, { enabled: true, currentUid: () => uid });
  const client = { app, db, transport }; clients.push(client); return client;
}
const owner = connect(UID), other = connect(OTHER), anonymous = connect(null), noRole = connect('LOCAL_NO_ROLE');
before(async () => {
  await dbAdmin.doc(`roles/${UID}`).set({ role: 'scorer' });
  await dbAdmin.doc(`roles/${OTHER}`).set({ role: 'scorer' });
});
after(async () => {
  for (const path of streams) await dbAdmin.recursiveDelete(dbAdmin.doc(path));
  await dbAdmin.doc(`roles/${UID}`).delete(); await dbAdmin.doc(`roles/${OTHER}`).delete();
  for (const client of clients) { await terminate(client.db); await deleteApp(client.app); }
  await deleteAdminApp(admin);
});
async function fixture(label = 'case', patch = {}) {
  const matchId = `LOCAL_TEST_${label}_${++sequence}`, path = `scoringAtomicMatches/${encodeURIComponent(matchId)}`;
  streams.push(path); await dbAdmin.doc(path).set({ ...atomicHead(matchId), ...patch });
  const request = (id = 'commit-1', revision = 0, payload = atomicPayload(matchId), actorUid = UID, epoch = 0) => prepareAtomicRequest({ id, matchId, actorUid, expectedRevision: revision, lockEpoch: epoch }, payload);
  return { matchId, path, request, ref: doc(owner.db, path) };
}
const denied = fn => assert.rejects(fn, error => /permission-denied|unauthenticated/.test(error.code));

test('FIRESTORE SDK: atomic payload and receipt commit together', async () => {
  const f = await fixture(), ack = await owner.transport.commit(await f.request());
  const head = (await getDoc(f.ref)).data(), receipt = (await getDoc(doc(owner.db, `${f.path}/commits/commit-1`))).data();
  assert.equal(head.revision, 1); assert.equal(receipt.revision, 1); assert.equal(ack.hash, head.hash);
  assert.equal(JSON.parse(head.payload).events[0].eventId, 'play-1'); assert.ok(head.updatedAt);
});
test('FIRESTORE SDK: idempotent exact retry', async () => {
  const f = await fixture(), request = await f.request(); await owner.transport.commit(request);
  const ack = await owner.transport.commit(request); assert.equal(ack.replayed, true); assert.equal((await getDoc(f.ref)).data().revision, 1);
});
test('FIRESTORE SDK: same-length correction replaces all three projections', async () => {
  const f = await fixture(); await owner.transport.commit(await f.request());
  await owner.transport.commit(await f.request('correct-2', 1, atomicPayload(f.matchId, 1)));
  const payload = JSON.parse((await getDoc(f.ref)).data().payload);
  assert.equal(payload.events.length, 1); assert.equal(payload.feed.length, 1); assert.equal(payload.core.score.away, 1); assert.equal(payload.events[0].outcome, 'single');
});
test('FIRESTORE SDK: simultaneous expected revisions yield one winner', async () => {
  const f = await fixture(), a = await f.request('writer-a'), b = await f.request('writer-b');
  const results = await Promise.allSettled([owner.transport.commit(a), owner.transport.commit(b)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1); assert.equal((await getDoc(f.ref)).data().revision, 1);
});
test('FIRESTORE SDK: changed content reusing an ID is rejected', async () => {
  const f = await fixture(); await owner.transport.commit(await f.request());
  await assert.rejects(async () => owner.transport.commit(await f.request('commit-1', 0, atomicPayload(f.matchId, 1))), { code: 'idempotency-conflict' });
});
test('FIRESTORE SDK: stale expected revision is not silently rebased', async () => {
  const f = await fixture(); await owner.transport.commit(await f.request());
  await assert.rejects(async () => owner.transport.commit(await f.request('stale')), { code: 'revision-conflict' });
});
test('FIRESTORE SDK: undo preserves immutable receipts', async () => {
  const f = await fixture(); await owner.transport.commit(await f.request()); const payload = atomicPayload(f.matchId); payload.events = []; payload.feed = [];
  await owner.transport.commit(await f.request('undo', 1, payload));
  assert.equal(JSON.parse((await getDoc(f.ref)).data().payload).events.length, 0); assert.ok((await getDoc(doc(owner.db, `${f.path}/commits/commit-1`))).exists());
});
for (const patch of [{ paused: true }, { lockEpoch: 1 }, { ownerUid: OTHER }]) test(`FIRESTORE SDK: owner lease check ${JSON.stringify(patch)}`, async () => {
  const f = await fixture('lease', patch); await denied(async () => owner.transport.commit(await f.request())); assert.equal((await dbAdmin.doc(f.path).get()).data().revision, 0);
});
test('RULES: another scorer cannot read the private stream', async () => {
  const f = await fixture(); await denied(() => getDoc(doc(other.db, f.path)));
});
test('RULES: anonymous spectator cannot read private audit payload', async () => {
  const f = await fixture(); await denied(() => getDoc(doc(anonymous.db, f.path)));
});
test('RULES: matching UID without scorer role has no access', async () => {
  const f = await fixture('no-role', { ownerUid: 'LOCAL_NO_ROLE' }); await denied(() => getDoc(doc(noRole.db, f.path)));
});
test('RULES: scorer cannot self-provision a v2 stream', async () => {
  const path = `scoringAtomicMatches/LOCAL_TEST_DENIED_CREATE_${++sequence}`; streams.push(path);
  await denied(() => setDoc(doc(owner.db, path), atomicHead()));
});
test('RULES: bare head update without atomic receipt is denied', async () => {
  const f = await fixture(); await denied(() => updateDoc(f.ref, { revision: 1, commitId: 'naked', payload: '{}', hash: 'a'.repeat(64) }));
});
test('RULES: standalone receipt write is denied', async () => {
  const f = await fixture(); await denied(() => setDoc(doc(owner.db, `${f.path}/commits/fake`), { id: 'fake', actorUid: UID, lockEpoch: 0, expectedRevision: 0, revision: 1, hash: 'a'.repeat(64) }));
});
test('RULES: receipts cannot be edited or deleted', async () => {
  const f = await fixture(); await owner.transport.commit(await f.request()); const ref = doc(owner.db, `${f.path}/commits/commit-1`);
  await denied(() => updateDoc(ref, { hash: 'b'.repeat(64) })); await denied(() => deleteDoc(ref));
});
test('RULES: invalid member of a batch rolls back the entire batch', async () => {
  const f = await fixture(), batch = writeBatch(owner.db);
  batch.update(f.ref, { revision: 1, commitId: 'bad' }); batch.set(doc(owner.db, `${f.path}/commits/bad`), { id: 'bad', actorUid: OTHER });
  await denied(() => batch.commit()); assert.equal((await getDoc(f.ref)).data().revision, 0); assert.equal((await dbAdmin.doc(`${f.path}/commits/bad`).get()).exists, false);
});
test('FIRESTORE SDK: UTF-8 match ID uses a deterministic safe stream ID', async () => {
  const f = await fixture('한글_경기'); await owner.transport.commit(await f.request()); assert.equal((await getDoc(f.ref)).data().matchId, f.matchId);
});
test('FIRESTORE SDK: adapter stays disabled unless explicitly opted in', async () => {
  const f = await fixture(), disabled = createFirestoreScoringTransport(owner.db, { enabled: false, currentUid: () => UID });
  await assert.rejects(async () => disabled.commit(await f.request()), { code: 'migration-required' }); assert.equal((await getDoc(f.ref)).data().revision, 0);
});
test('FIRESTORE SDK: lost response is recovered by receipt without a second revision', async () => {
  const f = await fixture(); let lose = true;
  const transport = { commit: async request => { const ack = await owner.transport.commit(request); if (lose) { lose = false; throw new AtomicScoringError('unavailable'); } return ack; } };
  const box = new AtomicScoringOutbox({ matchId: f.matchId, actorUid: UID, lockEpoch: 0, revision: 0, transport, storage: memoryStorage() });
  await box.stage(atomicPayload(f.matchId)); await box.flush(); assert.equal(box.getSnapshot().phase, 'retry-required');
  await box.flush(); assert.equal(box.getSnapshot().phase, 'saved'); assert.equal((await getDoc(f.ref)).data().revision, 1);
});
for (const mode of ['all', 'commit']) test(`FIRESTORE SDK: actual ${mode} RPC outage keeps the outbox and recovers exactly once`, async () => {
  const f = await fixture(`network-${mode}`);
  const gate = await firestoreNetworkGate(hostname, Number(port), mode);
  const gated = connect(UID, gate.port, '127.0.0.1');
  const storage = memoryStorage();
  const box = new AtomicScoringOutbox({ matchId: f.matchId, actorUid: UID, lockEpoch: 0, revision: 0, transport: gated.transport, storage });
  try {
    await box.stage(atomicPayload(f.matchId));
    const id = box.getSnapshot().requestId;
    await box.flush();
    assert.equal(box.getSnapshot().phase, 'retry-required');
    assert.equal(box.getSnapshot().requestId, id);
    assert.equal(storage.entries.size, 1);
    assert.ok(gate.blocked.length > 0, 'Actual SDK requests hit the network gate');
    if (mode === 'all') assert.equal(gate.forwarded.length, 0);
    else {
      assert.ok(gate.forwarded.some(request => /batchGet/i.test(request.url)), 'Transaction reads reached the emulator');
      assert.ok(gate.blocked.every(request => /commit/i.test(request.url)), 'Only commit RPCs were cut');
    }
    assert.equal((await dbAdmin.doc(f.path).get()).data().revision, 0);
    assert.equal((await dbAdmin.doc(`${f.path}/commits/${id}`).get()).exists, false);
    gate.reconnect();
    await box.flush();
    assert.equal(box.getSnapshot().phase, 'saved');
    assert.equal(storage.entries.size, 0);
    const head = (await dbAdmin.doc(f.path).get()).data();
    assert.equal(head.revision, 1); assert.equal(head.commitId, id);
    assert.equal((await dbAdmin.doc(`${f.path}/commits/${id}`).get()).data().revision, 1);
    assert.ok(gate.forwarded.some(request => /commit/i.test(request.url)));
  } finally {
    try { await terminate(gated.db); await deleteApp(gated.app); }
    finally { clients.splice(clients.indexOf(gated), 1); await gate.close(); }
  }
});
test('RULES: removing scorer role revokes writes despite local identity', async () => {
  const f = await fixture(); await dbAdmin.doc(`roles/${UID}`).delete();
  try { await denied(async () => owner.transport.commit(await f.request())); }
  finally { await dbAdmin.doc(`roles/${UID}`).set({ role: 'scorer' }); }
});
test('RULES: old owner cannot retry after ownership transfer; new epoch can commit', async () => {
  const f = await fixture(), old = await f.request(); await owner.transport.commit(old);
  await dbAdmin.doc(f.path).update({ ownerUid: OTHER, lockEpoch: 1 });
  await denied(() => owner.transport.commit(old));
  const ack = await other.transport.commit(await f.request('new-owner', 1, atomicPayload(f.matchId), OTHER, 1)); assert.equal(ack.revision, 2);
});

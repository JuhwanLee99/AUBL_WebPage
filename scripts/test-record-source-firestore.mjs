import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp as adminApp, deleteApp as deleteAdminApp } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { initializeApp, deleteApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, doc, getDocFromServer, getDocsFromServer, collection, updateDoc, setDoc, deleteDoc, serverTimestamp, terminate, setLogLevel } from 'firebase/firestore';
import { fixtures } from './e2e/record-sources/fixtures.mjs';

const host = process.env.FIRESTORE_EMULATOR_HOST;
const projectId = process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT;
assert.match(host ?? '', /^(127\.0\.0\.1|localhost):\d+$/);
assert.equal(projectId, 'demo-aubl-scoring', 'No real project is accepted');
const [hostname, port] = host.split(':');
const admin = adminApp({ projectId }, `source-rules-${Date.now()}`), seed = adminFirestore(admin);
const clients = [];
setLogLevel('silent');
function client(uid, token = {}) {
  const app = initializeApp({ projectId, apiKey: 'emulator-only', appId: 'emulator-only' }, `source-${uid ?? 'anon'}-${clients.length}`);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, hostname, Number(port), uid ? { mockUserToken: { sub: uid, user_id: uid, ...token } } : undefined);
  clients.push({ app, db }); return db;
}
const users = {
  anonymous: client(null), member: client('LOCAL_SOURCE_MEMBER'), scorer: client('LOCAL_SOURCE_SCORER'),
  emailOnly: client('LOCAL_SOURCE_EMAIL', { email: 'admin@example.invalid' }),
  administrator: client('LOCAL_SOURCE_ADMIN', { admin: true }),
};
const liveId = `LOCAL_TEST_SOURCE_LIVE_${Date.now()}`, officialId = liveId + '_OFFICIAL';
const docPaths = [];
const denied = operation => assert.rejects(operation, error => /permission-denied|unauthenticated/.test(error.code));
before(async () => {
  await seed.doc('roles/LOCAL_SOURCE_SCORER').set({ role: 'scorer' });
  for (const matchId of [liveId, officialId]) {
    const f = fixtures(matchId);
    const match = structuredClone(f.schedule);
    if (matchId === officialId) for (const field of ['postGame', 'manualEntryDraft', 'lineups', 'benches', 'notes']) delete match[field];
    if (matchId === officialId) Object.assign(match, { recordAuthority: 'UNIQUE_PLAY', officialRecordRevision: f.source.revision, awayScore: 3 });
    const docs = {
      [`matches/${matchId}`]: match, [`matchStates/${matchId}`]: f.core,
      [`matchStates/${matchId}/feed/f1`]: { text: 'PRIVATE_TEST_FEED' },
      [`matchStates/${matchId}/events/e1`]: { eventId: 'LOCAL_PRIVATE_EVENT' },
      [`scoringAtomicMatches/${matchId}`]: { matchId, ownerUid: 'LOCAL_SOURCE_SCORER', paused: false, lockEpoch: 0, revision: 0, version: 2 },
      [`scoringAtomicMatches/${matchId}/commits/c1`]: { id: 'c1' },
    };
    if (matchId === officialId) {
      docs[`recordSources/${matchId}`] = f.source;
      docs[`recordArchives/${matchId}`] = { schedule: f.schedule, matchId };
      docs[`recordArchives/${matchId}/officialRevisions/r1`] = f.source;
    }
    const batch = seed.batch();
    for (const [path, value] of Object.entries(docs)) { docPaths.push(path); batch.set(seed.doc(path), value); }
    await batch.commit();
  }
});
after(async () => {
  for (const db of Object.values(users)) await terminate(db);
  for (const { app } of clients) await deleteApp(app);
  for (const matchId of [liveId, officialId]) for (const group of ['matches', 'matchStates', 'scoringAtomicMatches', 'recordSources', 'recordArchives']) await seed.recursiveDelete(seed.doc(`${group}/${matchId}`));
  await seed.doc('roles/LOCAL_SOURCE_SCORER').delete();
  await deleteAdminApp(admin);
});
for (const [role, db] of Object.entries(users)) {
  for (const suffix of ['', '/feed/f1', '/events/e1']) {
    test(`SOURCE RULES: ${role} reads provisional ${suffix || 'core'}`, async () => assert.ok((await getDocFromServer(doc(db, `matchStates/${liveId}${suffix}`))).exists()));
    test(`SOURCE RULES: ${role} ${role === 'administrator' ? 'reads' : 'cannot read'} archived ${suffix || 'core'}`, async () => {
      const read = () => getDocFromServer(doc(db, `matchStates/${officialId}${suffix}`));
      if (role === 'administrator') assert.ok((await read()).exists()); else await denied(read);
    });
  }
  test(`SOURCE RULES: ${role} reads only public official projection`, async () => {
    const source = (await getDocFromServer(doc(db, `recordSources/${officialId}`))).data();
    assert.equal(source.authority, 'UNIQUE_PLAY'); assert.equal(source.official.game.awayScore, 3);
    const match = (await getDocFromServer(doc(db, `matches/${officialId}`))).data();
    for (const field of ['postGame', 'manualEntryDraft', 'lineups', 'benches', 'notes']) assert.equal(field in match, false);
  });
  for (const prefix of ['recordArchives', 'scoringAtomicMatches']) test(`SOURCE RULES: ${role} archive read ${prefix}`, async () => {
    const read = () => getDocFromServer(doc(db, `${prefix}/${officialId}`));
    if (role === 'administrator') assert.ok((await read()).exists()); else await denied(read);
  });
  test(`SOURCE RULES: ${role} cannot write or delete frozen core`, async () => {
    await denied(() => updateDoc(doc(db, `matchStates/${officialId}`), { lastPlay: 'forbidden' }));
    await denied(() => deleteDoc(doc(db, `matchStates/${officialId}`)));
  });
}
for (const group of ['feed', 'events']) test(`SOURCE RULES: scorer cannot list archived ${group}`, async () => denied(() => getDocsFromServer(collection(users.scorer, 'matchStates', officialId, group))));
for (const path of [`recordSources/${officialId}`, `recordArchives/${officialId}`, `recordArchives/${officialId}/officialRevisions/r1`, `scoringAtomicMatches/${officialId}/commits/c1`]) test(`SOURCE RULES: browser admin cannot mutate server evidence ${path.split('/')[0]}`, async () => {
  await denied(() => updateDoc(doc(users.administrator, path), { changed: true }));
  await denied(() => deleteDoc(doc(users.administrator, path)));
});
test('SOURCE RULES: admin cannot undo archive by clearing public marker', async () => denied(() => updateDoc(doc(users.administrator, `matches/${officialId}`), { recordAuthority: null })));
test('SOURCE RULES: admin cannot self-publish from schedule fields', async () => denied(() => updateDoc(doc(users.administrator, `matches/${liveId}`), { recordAuthority: 'UNIQUE_PLAY' })));
test('SOURCE RULES: admin cannot self-create server publication', async () => denied(() => setDoc(doc(users.administrator, `recordSources/${liveId}`), fixtures(liveId).source)));
test('SOURCE RULES: admin cannot resume archived atomic owner', async () => denied(() => updateDoc(doc(users.administrator, `scoringAtomicMatches/${officialId}`), { ownerUid: 'LOCAL_SOURCE_ADMIN', paused: false, lockEpoch: 1 })));

let issueNumber = 0;
function issue(overrides = {}) {
  return { matchId: officialId, revision: 'LOCAL_REVISION_1', payloadHash: 'a'.repeat(64), category: 'MODAL', status: 'OPEN',
    note: 'LOCAL_TEST_NOTE', evidence: 'away/runs', actorUid: 'LOCAL_SOURCE_ADMIN', createdAt: serverTimestamp(), ...overrides };
}
function save(db, value) { return setDoc(doc(db, 'recordArchives', officialId, 'issues', `LOCAL_ISSUE_${++issueNumber}`), value); }
for (const category of ['MODAL', 'ENGINE', 'PARSER', 'AGGREGATION', 'MAPPING', 'SOURCE', 'UNKNOWN']) test(`SOURCE RULES: administrator appends ${category} issue`, async () => save(users.administrator, issue({ category })));
for (const status of ['OPEN', 'INVESTIGATING', 'FIXED', 'WONT_FIX']) test(`SOURCE RULES: append-only status ${status}`, async () => save(users.administrator, issue({ status })));
for (const [label, changes] of [['stale revision', { revision: 'OLD' }], ['hash mismatch', { payloadHash: 'b'.repeat(64) }], ['actor spoof', { actorUid: 'OTHER' }], ['wrong match', { matchId: liveId }], ['unknown field', { officialOverride: true }], ['invalid status', { status: 'OTHER' }], ['empty note', { note: '' }], ['large note', { note: 'x'.repeat(4001) }], ['large evidence', { evidence: 'x'.repeat(2001) }], ['client time', { createdAt: 0 }]]) test(`SOURCE RULES: reject issue ${label}`, async () => denied(() => save(users.administrator, issue(changes))));
test('SOURCE RULES: scorer cannot submit review even with its own actor UID', async () => denied(() => save(users.scorer, issue({ actorUid: 'LOCAL_SOURCE_SCORER' }))));
test('SOURCE RULES: audit issue cannot be changed or deleted', async () => {
  const ref = doc(users.administrator, 'recordArchives', officialId, 'issues', `LOCAL_ISSUE_${++issueNumber}`);
  await setDoc(ref, issue()); await denied(() => updateDoc(ref, { status: 'FIXED' })); await denied(() => deleteDoc(ref));
});

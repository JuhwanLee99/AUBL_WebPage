import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { initializeApp, deleteApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, doc, getDoc, getDocs, collection, setDoc, terminate } from 'firebase/firestore';
const host = process.env.FIRESTORE_EMULATOR_HOST;
assert.match(host ?? '', /^(127\.0\.0\.1|localhost):\d+$/);
const projectId = process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT;
assert.equal(projectId, 'demo-aubl-scoring');
const [hostname, port] = host.split(':');
const clients = [];
for (const role of ['anonymous', 'admin', 'scorer', 'viewer']) {
  const app = initializeApp({ projectId, apiKey: 'demo-scoring-key' }, `boundary-${role}-${Date.now()}`);
  const db = getFirestore(app);
  const uid = `LOCAL_BOUNDARY_${role}`;
  connectFirestoreEmulator(db, hostname, Number(port), role === 'anonymous' ? undefined
    : { mockUserToken: { sub: uid, user_id: uid, admin: role === 'admin', role } });
  clients.push({ app, db });
  const path = 'scoringTestRuns/TEST_RUN_CLOSED/matches/TEST_SCORING_CLOSED';
  for (const [action, run] of [
    ['get', () => getDoc(doc(db, path))],
    ['list', () => getDocs(collection(db, 'scoringTestRuns/TEST_RUN_CLOSED/matches'))],
    ['write', () => setDoc(doc(db, path), { isTest: true })],
  ]) test(`reserved namespace denies ${role} ${action}`, async () => {
    await assert.rejects(run(), error => error.code === 'permission-denied');
  });
}
after(async () => { for (const { app, db } of clients) { await terminate(db); await deleteApp(app); } });

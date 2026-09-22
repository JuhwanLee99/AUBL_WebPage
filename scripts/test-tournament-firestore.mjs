import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir } from 'node:fs/promises';
import { build } from 'esbuild';
import { initializeApp, deleteApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, doc, getDocFromServer, getDocs, collection, setDoc, serverTimestamp, terminate } from 'firebase/firestore';
import { createTournament } from '../src/features/tournament/model.ts';

assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8789');
assert.equal(process.env.GCLOUD_PROJECT, 'demo-aubl-tournament');
const clients = {};
for (const role of ['admin', 'member', 'anonymous']) {
  const app = initializeApp({ projectId: 'demo-aubl-tournament', apiKey: 'local-test-only' }, `t26-${role}`);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8789, role === 'anonymous' ? undefined : { mockUserToken: { sub: `TEST_${role}`, admin: role === 'admin' } });
  clients[role] = { app, db };
}
const admin = clients.admin.db;
const draft = doc(admin, 'tournamentDrafts', 'season2026');
const published = doc(admin, 'tournamentPublic', 'season2026');
const denied = promise => assert.rejects(promise, error => error.code === 'permission-denied');
await mkdir('.tmp/tournament-tests', { recursive: true });
globalThis.__t26TestDb = admin;
await build({ entryPoints: ['src/features/tournament/store.ts'], outfile: '.tmp/tournament-tests/store.mjs', bundle: true, platform: 'node', format: 'esm',
  external: ['react', 'firebase/firestore'], plugins: [{ name: 'emulator-only-firebase', setup(build) {
    build.onResolve({ filter: /^@shared\/firebase\/client$/ }, () => ({ path: 'firebase-test', namespace: 'test' }));
    build.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export const firestore = globalThis.__t26TestDb;' }));
  } }] });
const { loadTournamentAdmin, persistTournament } = await import('../.tmp/tournament-tests/store.mjs');
let versions = { draft: 0, published: 0 };
let config = createTournament();
try {
  await test('fresh admin load returns default draft without writes', async () => {
    const loaded = await loadTournamentAdmin(); assert.deepEqual(loaded.config, config); assert.equal(loaded.enabled, false);
    assert.deepEqual(loaded.versions, versions); assert.equal((await getDocFromServer(draft)).exists(), false);
  });
  for (const role of ['member', 'anonymous']) {
    const db = clients[role].db;
    for (const path of ['tournamentDrafts/season2026', 'tournamentPublic/season2026']) await test(`${role} cannot write ${path}`, () => denied(setDoc(doc(db, path), { revision: 1, enabled: false, updatedAt: serverTimestamp() })));
    await test(`${role} cannot read drafts`, () => denied(getDocFromServer(doc(db, 'tournamentDrafts', 'season2026'))));
    await test(`${role} cannot list publications`, () => denied(getDocs(collection(db, 'tournamentPublic'))));
  }
  await test('draft save does not create a publication', async () => {
    versions = await persistTournament(config, versions, 'draft'); assert.deepEqual(versions, { draft: 1, published: 0 });
    assert.equal((await getDocFromServer(published)).exists(), false);
  });
  await test('stale draft revision refuses overwrite', async () => {
    await assert.rejects(persistTournament(config, { draft: 0, published: 0 }, 'draft'), /다른 관리자/);
  });
  await test('publish atomically matches saved draft and is readable anonymously', async () => {
    versions = await persistTournament(config, versions, 'publish');
    const data = (await getDocFromServer(doc(clients.anonymous.db, 'tournamentPublic', 'season2026'))).data();
    assert.deepEqual(data.config, config); assert.equal(data.enabled, true);
    assert.deepEqual((await getDocFromServer(draft)).data().config, data.config);
  });
  await test('editing and saving draft preserves published snapshot', async () => {
    config = { ...config, note: '새 비공개 안내', phase: 'active', homeDefault: 'tournament' };
    versions = await persistTournament(config, versions, 'draft');
    const data = (await getDocFromServer(published)).data(); assert.notEqual(data.config.note, config.note); assert.equal(data.config.homeDefault, 'groups');
  });
  await test('rules reject public payload not equal to draft', async () => {
    await denied(setDoc(published, { revision: versions.published + 1, enabled: true, config: createTournament(), updatedAt: serverTimestamp() }));
  });
  await test('rules reject stale publication revision', async () => {
    await denied(setDoc(published, { revision: versions.published, enabled: true, config, updatedAt: serverTimestamp() }));
  });
  await test('rules reject duplicate bracket seeds even for admin direct writes', async () => {
    const bad = createTournament(); bad.divisions.eutteum.seeds[1] = 'D2';
    await denied(setDoc(draft, { revision: versions.draft + 1, config: bad, updatedAt: serverTimestamp() }));
  });
  await test('rules prevent alternate season publication', async () => {
    await denied(setDoc(doc(admin, 'tournamentPublic', 'season2025'), { revision: 1, enabled: false, updatedAt: serverTimestamp() }));
  });
  await test('invalid client config cannot be saved or published', async () => {
    const bad = createTournament(); bad.divisions.eutteum.seeds.pop();
    await assert.rejects(persistTournament(bad, versions, 'draft'));
    await assert.rejects(persistTournament(bad, versions, 'publish'));
  });
  await test('stale public revision refuses withdrawal', async () => {
    await assert.rejects(persistTournament(config, { ...versions, published: 0 }, 'hide'), /다른 관리자/);
  });
  await test('withdrawal removes all public draw fields and preserves draft', async () => {
    const before = (await getDocFromServer(draft)).data();
    versions = await persistTournament(config, versions, 'hide');
    const data = (await getDocFromServer(doc(clients.anonymous.db, 'tournamentPublic', 'season2026'))).data();
    assert.deepEqual(Object.keys(data).sort(), ['enabled', 'revision', 'updatedAt']); assert.equal(data.enabled, false);
    assert.deepEqual((await getDocFromServer(draft)).data(), before);
  });
  await test('republish and reload preserve phase, default view and revisions', async () => {
    versions = await persistTournament(config, versions, 'publish');
    const loaded = await loadTournamentAdmin(); assert.equal(loaded.enabled, true); assert.deepEqual(loaded.config, config); assert.deepEqual(loaded.versions, versions);
  });
} finally {
  for (const { app, db } of Object.values(clients)) { await terminate(db); await deleteApp(app); }
  delete globalThis.__t26TestDb;
}

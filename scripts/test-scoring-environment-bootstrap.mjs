import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const local = () => ({ VITE_SCORING_EXECUTION_MODE: 'local-emulator', VITE_FIREBASE_PROJECT_ID: 'demo-aubl-scoring',
  VITE_FIREBASE_AUTH_DOMAIN: 'localhost', VITE_BACKEND_API_URL: 'http://127.0.0.1:8080' });

async function loadClient(env, state = { calls: [], app: null }) {
  const key = '__scoring_bootstrap_' + randomUUID();
  globalThis[key] = state;
  const code = `const state = globalThis[${JSON.stringify(key)}];
    const track = (name, ...args) => state.calls.push([name, ...args]);
    export function getApps() { return state.app ? [state.app] : []; }
    export function getApp() { return state.app; }
    export function initializeApp(options) { track('initializeApp',options.projectId); return state.app = {options}; }
    export function getAuth(app) { track('getAuth'); return {app}; }
    export function connectAuthEmulator(auth,url) { track('authEmulator',url); }
    export function getFirestore(app) { track('getFirestore'); return {app}; }
    export function initializeFirestore(app,options) {
      track('initializeFirestore'); if(state.failFirestore) throw new Error('initialization-failed'); return {app,options};
    }
    export function memoryLocalCache() { return {}; }
    export function connectFirestoreEmulator(db,host,port) { track('firestoreEmulator',host,port); }
    export function getFunctions(app,region='us-central1') { return {app,region}; }
    export function connectFunctionsEmulator(fn,host,port) { track('functionsEmulator',fn.region,host,port); }
    export class ReCaptchaEnterpriseProvider {}
    export function initializeAppCheck() { track('appCheck'); return {}; }
  `;
  try {
    const bundled = await build({ absWorkingDir: root, entryPoints: ['src/core/firebase/client.ts'], bundle: true,
      write: false, format: 'esm', platform: 'node', logLevel: 'silent',
      define: { 'import.meta.env': JSON.stringify(env) },
      plugins: [{ name: 'no-network-firebase-sdk', setup(plugin) {
        plugin.onResolve({ filter: /^firebase\// }, () => ({ path: 'sdk', namespace: 'fixture' }));
        plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: code, loader: 'js' }));
      } }],
    });
    return await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'));
  } finally { delete globalThis[key]; }
}

test('actual client connects Auth, Firestore and both Functions regions to loopback', async () => {
  const state = { calls: [], app: null };
  const module = await loadClient(local(), state);
  assert.deepEqual(state.calls.filter(row => /Emulator$/.test(row[0])), [
    ['authEmulator', 'http://127.0.0.1:9099'], ['firestoreEmulator', '127.0.0.1', 8088],
    ['functionsEmulator', 'asia-northeast3', '127.0.0.1', 5001], ['functionsEmulator', 'us-central1', '127.0.0.1', 5001],
  ]);
  assert.equal(module.ensureFirebaseAppCheck(), null);
  assert.equal(state.calls.some(row => row[0] === 'getFirestore' || row[0] === 'appCheck'), false);
});
test('production initialization keeps the existing default services', async () => {
  const state = { calls: [], app: null };
  await loadClient({ VITE_FIREBASE_PROJECT_ID: 'configured-project' }, state);
  assert.ok(state.calls.some(row => row[0] === 'getFirestore'));
  assert.equal(state.calls.some(row => /Emulator$/.test(row[0])), false);
});
test('production-test fails before Firebase initialization', async () => {
  const state = { calls: [], app: null };
  await assert.rejects(loadClient({ ...local(), VITE_SCORING_EXECUTION_MODE: 'production-test' }, state), /production-test-not-ready/);
  assert.deepEqual(state.calls, []);
});
test('existing wrong-project app is not reused for emulator mode', async () => {
  const state = { calls: [], app: { options: { projectId: 'production' } } };
  await assert.rejects(loadClient(local(), state), /firebase-app-project-mismatch/);
  assert.deepEqual(state.calls, []);
});
test('initialization failure cannot fall back to a production Firestore instance', async () => {
  const state = { calls: [], app: null, failFirestore: true };
  await assert.rejects(loadClient(local(), state), /initialization-failed/);
  assert.equal(state.calls.some(row => row[0] === 'getFirestore'), false);
});
test('HMR reuses completed connections but refuses changed endpoints', async () => {
  const state = { calls: [], app: null };
  const first = await loadClient(local(), state);
  const calls = state.calls.length;
  const second = await loadClient(local(), state);
  assert.equal(second.firestore, first.firestore); assert.equal(state.calls.length, calls);
  await assert.rejects(loadClient({ ...local(), VITE_AUTH_EMULATOR_PORT: '9199' }, state), /emulator-config-changed/);
  assert.equal(state.calls.length, calls);
});

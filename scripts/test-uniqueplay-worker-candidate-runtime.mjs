// Runs only inside the immutable candidate with --network none.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { ADAPTER_VERSION, collectUniquePlay } from '/app/src/adapter.mjs';
import { includesGameDate, validateCollectionScope } from '/app/src/collection-scope.mjs';

const token = 'fixture-worker-only-20260912';
const callbacks = [];
const held = new Map();
let withoutToken;
let childError;
const callbackServer = createServer(async (request, response) => {
  try {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const record = { path: request.url, authorization: request.headers.authorization,
      payload: JSON.parse(Buffer.concat(chunks).toString('utf8')) };
    callbacks.push(record);
    if (record.path.includes('/fixture-pending/')) held.set('fixture-pending', response);
    else { response.writeHead(204); response.end(); }
  } catch {
    response.writeHead(400); response.end();
  }
});

async function request(path, { method = 'GET', authorization = `Bearer ${token}`, body, port = 8080 } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (authorization !== null) headers.authorization = authorization;
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(5000),
  });
  return { status: response.status, body: await response.json(), headers: response.headers };
}

async function until(predicate, label) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await delay(50);
  }
  assert.fail(`Timed out: ${label}`);
}

async function ready(port) {
  await until(async () => {
    if (childError) throw childError;
    try { return (await request('/health', { port, authorization: null })).status === 200; }
    catch { return false; }
  }, `server ${port}`);
}

before(async () => {
  assert.equal(process.env.UNIQUEPLAY_SESSION_B64, undefined);
  assert.equal(process.env.UNIQUEPLAY_SESSION_PATH, undefined);
  assert.equal(process.env.UNIQUEPLAY_SESSION_KEY_B64, undefined);
  assert.equal(process.env.SYNC_SERVICE_TOKEN, token);
  assert.equal(process.env.SYNC_BACKEND_CALLBACK_URL, 'http://127.0.0.1:18081');
  await new Promise((resolve, reject) => {
    callbackServer.once('error', reject);
    callbackServer.listen(18081, '127.0.0.1', resolve);
  });
  await ready(8080);
  withoutToken = spawn(process.execPath, ['/app/src/server.mjs'], {
    cwd: '/app', env: { ...process.env, PORT: '18082', SYNC_SERVICE_TOKEN: '' }, stdio: 'ignore',
  });
  withoutToken.on('error', (error) => { childError = error; });
  await ready(18082);
});

after(async () => {
  for (const response of held.values()) { response.writeHead(204); response.end(); }
  held.clear();
  if (withoutToken && withoutToken.exitCode === null && withoutToken.signalCode === null) {
    await new Promise((resolve) => {
      withoutToken.once('exit', resolve);
      withoutToken.kill('SIGTERM');
    });
  }
  callbackServer.closeAllConnections();
  await new Promise((resolve) => callbackServer.close(resolve));
});

test('default image server reports candidate version and runs without root', async () => {
  const response = await request('/health', { authorization: null });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { ok: true, activeRuns: 0, adapterVersion: '2026.09.12.14' });
  assert.equal(ADAPTER_VERSION, '2026.09.12.14');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.notEqual(process.getuid(), 0);
});

for (const [label, authorization] of [
  ['missing', null], ['wrong-length', 'Bearer wrong'],
  ['same-length wrong', `Bearer ${token.slice(0, -1)}X`], ['wrong scheme', `Basic ${token}`],
]) {
  for (const [path, method] of [['/session', 'GET'], ['/collect', 'POST']]) {
    test(`HTTP rejects ${label} credentials for ${path}`, async () => {
      const response = await request(path, { method, authorization, ...(method === 'POST' ? { body: { runId: 'not-accepted' } } : {}) });
      assert.equal(response.status, 401);
      assert.deepEqual(response.body, { error: 'unauthorized' });
    });
  }
}

test('configured token works but absent provider session is not reported ready', async () => {
  const response = await request('/session');
  assert.equal(response.status, 200);
  assert.equal(response.body.status, 'REAUTH_REQUIRED');
  assert.equal(response.body.connected, false);
});

test('missing run ID is rejected without creating a run', async () => {
  const response = await request('/collect', { method: 'POST', body: {} });
  assert.equal(response.status, 400);
  assert.equal((await request('/health')).body.activeRuns, 0);
});

test('oversized request is rejected before collection', async () => {
  const response = await request('/collect', { method: 'POST', body: { runId: 'oversized', padding: 'x'.repeat(65536) } });
  assert.equal(response.status, 413);
  assert.equal((await request('/health')).body.activeRuns, 0);
});

test('authenticated unknown route returns not found', async () => {
  assert.equal((await request('/not-a-worker-route')).status, 404);
});

test('absent service token fails closed even with a supplied token', async () => {
  for (const authorization of [null, `Bearer ${token}`]) {
    assert.equal((await request('/session', { port: 18082, authorization })).status, 401);
    assert.equal((await request('/collect', { port: 18082, authorization,
      method: 'POST', body: { runId: 'no-service-token' } })).status, 401);
  }
});

test('pending failure callback retains run lock, rejects duplicates, then releases it', async () => {
  const body = { runId: 'fixture-pending', seasonYear: 2026,
    collectionScope: { version: 1, mode: 'FROM_DATE', fromDate: '2026-09-11' } };
  try {
    assert.equal((await request('/collect', { method: 'POST', body })).status, 202);
    await until(() => held.has(body.runId), 'held local callback');
    assert.equal((await request('/health')).body.activeRuns, 1);
    assert.equal((await request('/collect', { method: 'POST', body })).status, 409);
    assert.equal((await request('/collect', { method: 'POST', body, authorization: null })).status, 401);
    const records = callbacks.filter((record) => record.path.includes('/fixture-pending/'));
    assert.equal(records.length, 1);
    assert.equal(records[0].path, '/api/internal/sync/unique-play/runs/fixture-pending/failed');
    assert.equal(records[0].authorization, `Bearer ${token}`);
    assert.equal(records[0].payload.code, 'REAUTH_REQUIRED');
  } finally {
    const response = held.get(body.runId);
    if (response) { response.writeHead(204); response.end(); held.delete(body.runId); }
  }
  await until(async () => (await request('/health')).body.activeRuns === 0, 'run lock release');
});

for (const [label, collectionScope] of [
  ['automatic', { version: 1, mode: 'SINCE_LAST_SYNC', fromDate: '2026-09-11' }],
  ['legacy', undefined],
]) {
  test(`HTTP ${label} request safely ends at local session failure, with encoded run ID`, async () => {
    const runId = `fixture-${label}/only`;
    const response = await request('/collect', { method: 'POST', body: { runId, seasonYear: 2026,
      ...(collectionScope === undefined ? {} : { collectionScope }) } });
    assert.equal(response.status, 202);
    const path = `/api/internal/sync/unique-play/runs/${encodeURIComponent(runId)}/failed`;
    await until(() => callbacks.some((record) => record.path === path), 'failure callback');
    const record = callbacks.find((entry) => entry.path === path);
    assert.equal(record.payload.code, 'REAUTH_REQUIRED');
    assert.equal(record.authorization, `Bearer ${token}`);
    await until(async () => (await request('/health')).body.activeRuns === 0, 'run cleanup');
    assert.equal(callbacks.some((entry) => entry.path.endsWith('/candidate')), false);
  });
}

const validScope = { version: 1, mode: 'FROM_DATE', fromDate: '2026-09-11' };
for (const [label, scope] of [
  ['null', null], ['empty object', {}], ['protocol version', { ...validScope, version: 2 }],
  ['string protocol', { ...validScope, version: '1' }], ['unsupported mode', { ...validScope, mode: 'ALL' }],
  ['previous season', { ...validScope, fromDate: '2025-09-11' }],
  ['impossible day', { ...validScope, fromDate: '2026-02-30' }],
  ['non-leap year', { ...validScope, fromDate: '2026-02-29' }],
  ['timestamp instead of day', { ...validScope, fromDate: '2026-09-11T00:00:00Z' }],
  ['unpadded day', { ...validScope, fromDate: '2026-9-1' }],
  ['numeric day', { ...validScope, fromDate: 20260911 }],
]) {
  test(`packaged adapter rejects ${label} before creating a browser context`, async () => {
    let touchedBrowser = false;
    await assert.rejects(collectUniquePlay({ seasonYear: 2026, leagueId: '57', collectionScope: scope,
      browser: { newContext() { touchedBrowser = true; throw new Error('UNEXPECTED_BROWSER_ACCESS'); } },
    }), /INVALID_COLLECTION_SCOPE/);
    assert.equal(touchedBrowser, false);
  });
}

for (const [label, scope] of [
  ['manual', validScope], ['automatic', { ...validScope, mode: 'SINCE_LAST_SYNC' }], ['legacy absent', undefined],
]) {
  test(`packaged adapter accepts ${label} scope; synthetic browser stops before network`, async () => {
    let called = 0;
    const stop = new Error('FIXTURE_STOP_BEFORE_NETWORK');
    await assert.rejects(collectUniquePlay({ seasonYear: 2026, leagueId: '57', collectionScope: scope,
      browser: { newContext() { called += 1; throw stop; } },
    }), (error) => error === stop);
    assert.equal(called, 1);
  });
}

for (const [timestamp, fromDate, expected] of [
  ['2026-09-10T14:59:59.999Z', '2026-09-11', false],
  ['2026-09-10T15:00:00.000Z', '2026-09-11', true],
  ['2026-09-11T00:00:00+09:00', '2026-09-11', true],
  ['2026-09-11T00:00:00+14:00', '2026-09-11', false],
  ['2026-09-11T05:00:00+14:00', '2026-09-11', true],
  ['2026-09-10T08:00:00-07:00', '2026-09-11', true],
  ['2025-12-31T14:59:59Z', '2026-01-01', false],
  ['2025-12-31T15:00:00Z', '2026-01-01', true],
  ['2024-02-28T15:00:00Z', '2024-02-29', true],
]) {
  test(`packaged KST boundary ${timestamp} from ${fromDate}`, () => {
    assert.equal(includesGameDate(timestamp, fromDate), expected);
  });
}

test('valid leap-year scope remains accepted', () => {
  assert.doesNotThrow(() => validateCollectionScope({ ...validScope, fromDate: '2024-02-29' }, 2024));
});

test('packaged normalization and validation distinguish partial details from full snapshot', () => {
  const fixture = JSON.parse(execFileSync(process.execPath, ['/app/test/scoped-callback-fixture.mjs'], {
    encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024,
  }));
  assert.equal(fixture.base.games.length, 2);
  assert.equal(fixture.base.gameDetails.length, 2);
  assert.equal(fixture.payload.candidate.games.length, 2);
  assert.equal(fixture.payload.candidate.gameDetails.length, 1);
  assert.deepEqual(fixture.payload.collectionScope, validScope);
});

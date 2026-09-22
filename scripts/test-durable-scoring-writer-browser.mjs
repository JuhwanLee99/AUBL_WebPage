import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';
import { chromium } from '../services/uniqueplay-sync-worker/node_modules/playwright/index.mjs';

const bundle = await build({ stdin: { contents: "export * from './src/shared/lib/durableScoringWriter'; export * from './src/shared/lib/durableScoringQueue';",
  resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, format: 'iife', globalName: 'WriterApi', platform: 'browser' });
const server = createServer((request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Type', request.url === '/writer.js' ? 'application/javascript' : 'text/html');
  response.end(request.url === '/writer.js' ? bundle.outputFiles[0].text : '<!doctype html><title>Local writer test</title><script src="/writer.js"></script>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const results = [];
const scope = { environment: 'local-emulator', projectId: 'demo-aubl-scoring', uid: 'tester', matchId: 'TEST_SCORING_WRITER',
  testRunId: 'TEST_RUN_WRITER', writerSessionId: 'session_a', lockEpoch: 1 };
let browser;
async function test(name, run) {
  try { await run(); results.push({ name, status: 'passed' }); }
  catch (error) { results.push({ name, status: 'failed', error: String(error) }); }
}
try {
  browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const context = await browser.newContext();
  await context.route('**/*', route => route.request().url().startsWith(`${origin}/`) ? route.continue() : route.abort());
  const a = await context.newPage(); const b = await context.newPage();
  await a.goto(origin); await b.goto(origin);
  const acquire = (page, value) => page.evaluate(async value => {
    window.writer = await WriterApi.DurableScoringWriter.acquire(value, 0, { commit: async () => { throw new Error('offline'); } });
    return Boolean(window.writer);
  }, value);
  await test('first_tab_acquires_and_persists', async () => {
    assert.equal(await acquire(a, scope), true);
    assert.equal(await a.evaluate(() => writer.enqueue('one', 'first persisted input')), 1);
  });
  for (const [name, change] of [
    ['same_session', {}], ['other_session', { writerSessionId: 'session_b' }],
    ['other_uid', { uid: 'another_user' }], ['new_epoch', { writerSessionId: 'session_b', lockEpoch: 2 }],
  ]) await test(`second_tab_denied_${name}`, async () => {
    assert.equal(await acquire(b, { ...scope, ...change }), false);
    assert.equal((await a.evaluate(() => writer.recover())).inputs.length, 1);
  });
  for (const [name, change] of [['other_match', { matchId: 'TEST_OTHER' }], ['other_run', { testRunId: 'TEST_RUN_OTHER' }]]) {
    await test(`independent_${name}_can_write`, async () => {
      assert.equal(await acquire(b, { ...scope, ...change }), true);
      assert.equal(await b.evaluate(() => writer.enqueue('other', 'isolated')), 1);
      await b.evaluate(() => writer.close());
    });
  }
  await test('closed_writer_denies_further_mutation', async () => {
    await a.evaluate(() => writer.close());
    assert.equal(await a.evaluate(async () => { try { await writer.enqueue('late', 'not accepted'); return ''; } catch (error) { return error.message; } }), 'writer-closed');
  });
  await test('explicit_release_allows_another_tab_and_preserves_queue', async () => {
    assert.equal(await acquire(b, scope), true);
    const saved = await b.evaluate(() => writer.recover());
    assert.equal(saved.inputs.length, 1); assert.equal(saved.inputs[0].snapshot, 'first persisted input');
    await b.evaluate(() => writer.close());
  });
  await test('tab_close_releases_lock_without_deleting_inputs', async () => {
    assert.equal(await acquire(a, scope), true); await a.close();
    assert.equal(await acquire(b, scope), true);
    assert.equal((await b.evaluate(() => writer.recover())).inputs.length, 1);
    await b.evaluate(() => writer.close());
  });
  await test('missing_lock_api_fails_closed', async () => {
    const code = await b.evaluate(async scope => {
      try { await WriterApi.DurableScoringWriter.acquire(scope, 0, { commit: async () => ({}) }, null); return ''; }
      catch (error) { return error.message; }
    }, scope);
    assert.equal(code, 'writer-lock-api-unavailable');
  });
  await test('initialization_failure_releases_lock', async () => {
    const code = await b.evaluate(async scope => {
      try { await WriterApi.DurableScoringWriter.acquire(scope, -1, { commit: async () => ({}) }); return ''; }
      catch (error) { return error.message; }
    }, scope);
    assert.equal(code, 'invalid-queue-version'); assert.equal(await acquire(b, scope), true);
    await b.evaluate(() => writer.close());
  });
  await test('private_writer_refuses_production_scope', async () => {
    const code = await b.evaluate(async scope => {
      try { await WriterApi.DurableScoringWriter.acquire({ ...scope, testRunId: undefined }, 0, { commit: async () => ({}) }); return ''; }
      catch (error) { return error.message; }
    }, scope);
    assert.equal(code, 'private-test-scope-required');
  });
  const c = await context.newPage(); await c.goto(origin);
  await test('handoff_waits_for_inflight_ack_and_rejects_new_inputs', async () => {
    await b.evaluate(async scope => {
      const fixed = { ...scope, matchId: 'TEST_ACK_DRAIN' };
      window.drainWriter = await WriterApi.DurableScoringWriter.acquire(fixed, 0, { commit: request => new Promise(resolve => {
        window.finishAck = () => resolve({ ...request, uid: fixed.uid, committedRevision: 1, headRevision: 1, commitId: 'a'.repeat(64), replayed: false });
      }) });
      await drainWriter.enqueue('one', 'first');
      await drainWriter.prepare({ version: 1, matchId: fixed.matchId, ruleProfileVersion: 'test-v1', engineVersion: 'test-v1', projectionVersion: 'test-v1',
        blocks: ['state', 'feed', 'events', 'stats'].map(kind => ({ kind, blockId: 'b'.repeat(64), sha256: 'c'.repeat(64), size: 1 })) }, 'request_one', 1);
      window.flushing = drainWriter.flush();
    }, scope);
    await b.waitForFunction(() => typeof window.finishAck === 'function');
    await b.evaluate(() => { window.closing = drainWriter.close(); });
    assert.equal(await acquire(c, { ...scope, matchId: 'TEST_ACK_DRAIN' }), false);
    assert.equal(await b.evaluate(async () => { try { await drainWriter.enqueue('two', 'late'); return ''; } catch (error) { return error.message; } }), 'writer-closed');
    await b.evaluate(async () => { finishAck(); await flushing; await closing; });
    assert.equal(await acquire(c, { ...scope, matchId: 'TEST_ACK_DRAIN' }), true);
    const saved = await c.evaluate(() => writer.recover()); assert.equal(saved.metadata.serverRevision, 1); assert.equal(saved.inputs.length, 0);
    await c.evaluate(() => writer.close());
  });
  await test('handoff_to_new_epoch_preserves_old_session_inputs_for_review', async () => {
    assert.equal(await acquire(b, { ...scope, writerSessionId: 'session_new', lockEpoch: 2 }), true);
    assert.equal((await b.evaluate(() => writer.recover())).inputs.length, 0);
    const old = await b.evaluate(async scope => { const queue = new WriterApi.DurableScoringQueue(scope, 0); try { return await queue.recover(); } finally { await queue.close(); } }, scope);
    assert.equal(old.inputs.length, 1); assert.equal(old.inputs[0].snapshot, 'first persisted input');
    await b.evaluate(() => writer.close());
  });
  await context.close();
} catch (error) { results.push({ name: 'browser_harness', status: 'failed', error: String(error) }); }
finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
const directory = `outputs/durable-scoring-writer-browser/${new Date().toISOString().replaceAll(':', '-')}`;
mkdirSync(directory, { recursive: true });
writeFileSync(`${directory}/summary.json`, JSON.stringify({ results, productionAccess: false, transport: 'stub',
  limitations: ['same browser profile Web Locks only', 'no actual authentication, modal, Provider or server handoff'] }, null, 2));
for (const result of results) console.log(JSON.stringify(result));
console.log(`DURABLE_WRITER_E2E_OUTPUT=${directory}`);
if (results.some(result => result.status !== 'passed')) process.exitCode = 1;

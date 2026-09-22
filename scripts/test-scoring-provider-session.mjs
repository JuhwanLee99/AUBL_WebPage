import assert from 'node:assert/strict';
import test from 'node:test';
import { ScoringProviderSession } from '../src/shared/lib/scoringProviderSession.ts';

const scope = { environment: 'local-emulator', projectId: 'demo-aubl-scoring', testRunId: 'TEST_RUN_SESSION',
  matchId: 'TEST_SCORING_SESSION', uid: 'LOCAL', writerSessionId: 'tab', lockEpoch: 1 };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const settle = async () => { for (let n = 0; n < 12; n++) await Promise.resolve(); };
const writer = () => ({ closes: 0, async close() { this.closes++; } });

test('default leaves legacy unchanged; selected durable path excludes it immediately', async () => {
  const next = writer(), gate = new ScoringProviderSession(async () => next);
  assert.deepEqual(gate.snapshot(), { status: 'legacy', legacyWriteAllowed: true });
  const opening = gate.open(scope, 0);
  assert.equal(gate.snapshot().legacyWriteAllowed, false); assert.equal(gate.current(), null);
  assert.equal(await opening, true); assert.equal(gate.current(), next);
  await gate.stop(); assert.equal(next.closes, 1); assert.equal(gate.current(), null);
  assert.equal(gate.snapshot().legacyWriteAllowed, false);
});
test('logout while acquiring closes late writer without exposing it', async () => {
  const pending = deferred(), next = writer(), gate = new ScoringProviderSession(() => pending.promise);
  const opening = gate.open(scope, 0); await settle();
  const stopped = gate.stop(); pending.resolve(next);
  assert.equal(await opening, false); await stopped;
  assert.equal(next.closes, 1); assert.equal(gate.current(), null);
});
test('match switch serializes cleanup before the next acquisition', async () => {
  const pending = deferred(), first = writer(), second = writer(), calls = [];
  const gate = new ScoringProviderSession(async value => {
    calls.push(value.matchId); if (calls.length === 1) return pending.promise;
    assert.equal(first.closes, 1); return second;
  });
  const a = gate.open(scope, 0); await settle();
  const b = gate.open({ ...scope, matchId: 'TEST_SCORING_OTHER' }, 1);
  pending.resolve(first); assert.equal(await a, false); assert.equal(await b, true);
  assert.equal(gate.current(), second); await gate.stop();
});
for (const outcome of ['unavailable', 'throw']) test(`${outcome} never re-enables legacy`, async () => {
  const gate = new ScoringProviderSession(async () => { if (outcome === 'throw') throw Error('LOCAL_FAILURE'); return null; });
  await assert.rejects(gate.open(scope, 0));
  assert.deepEqual(gate.snapshot(), { status: 'blocked', legacyWriteAllowed: false });
});
for (const patch of [{ environment: 'production' }, { projectId: 'aubl-backup' }, { testRunId: undefined },
  { matchId: 'ordinary-match' }, { lockEpoch: 0 }, { uid: '' }]) test(`reject unsafe scope ${JSON.stringify(patch)}`, async () => {
  let calls = 0; const gate = new ScoringProviderSession(async () => { calls++; return writer(); });
  await assert.rejects(gate.open({ ...scope, ...patch }, 0), /provider-test-scope-required/);
  assert.equal(calls, 0); assert.equal(gate.snapshot().legacyWriteAllowed, false);
});
test('scope is frozen before asynchronous acquisition', async () => {
  const supplied = { ...scope }; let seen;
  const gate = new ScoringProviderSession(async value => { seen = value; return writer(); });
  const opening = gate.open(supplied, 0); supplied.uid = 'OTHER'; await opening;
  assert.equal(seen.uid, scope.uid); await gate.stop();
});
test('close failure blocks the next acquisition and remains retryable', async () => {
  let rejectClose = true, acquisitions = 0;
  const active = { async close() { if (rejectClose) throw Error('CLOSE_FAILED'); } };
  const gate = new ScoringProviderSession(async () => { acquisitions++; return active; });
  await gate.open(scope, 0);
  await assert.rejects(gate.open(scope, 0), /CLOSE_FAILED/);
  assert.equal(acquisitions, 1); assert.equal(gate.current(), null);
  rejectClose = false; await gate.stop();
});
test('repeated stop closes an acquired writer only once', async () => {
  const active = writer(), gate = new ScoringProviderSession(async () => active);
  await gate.open(scope, 0); await Promise.all([gate.stop(), gate.stop()]);
  assert.equal(active.closes, 1);
});

test('logout retains a late writer when cleanup fails until an explicit retry succeeds', async () => {
  const pending = deferred(); let fail = true, closes = 0;
  const late = { async close() { closes++; if (fail) throw Error('LATE_CLOSE_FAILED'); } };
  const gate = new ScoringProviderSession(() => pending.promise);
  const opening = gate.open(scope, 0); await settle();
  const openingFailure = assert.rejects(opening, /LATE_CLOSE_FAILED/);
  const stopped = gate.stop();
  const stopFailure = assert.rejects(stopped, /LATE_CLOSE_FAILED/);
  pending.resolve(late); await openingFailure; await stopFailure;
  assert.equal(closes, 2); assert.equal(gate.current(), null);
  assert.deepEqual(gate.snapshot(), { status: 'blocked', legacyWriteAllowed: false });
  fail = false; await gate.stop(); assert.equal(closes, 3);
  await gate.stop(); assert.equal(closes, 3);
});

test('match switch cannot acquire another writer while stale-writer cleanup fails', async () => {
  const pending = deferred(); let fail = true, acquisitions = 0, closes = 0;
  const late = { async close() { closes++; if (fail) throw Error('LATE_CLOSE_FAILED'); } };
  const next = writer();
  const gate = new ScoringProviderSession(async () => ++acquisitions === 1 ? pending.promise : next);
  const opening = gate.open(scope, 0); await settle();
  const openingFailure = assert.rejects(opening, /LATE_CLOSE_FAILED/);
  const switched = gate.open({ ...scope, matchId: 'TEST_SCORING_NEXT' }, 0);
  const switchFailure = assert.rejects(switched, /LATE_CLOSE_FAILED/);
  pending.resolve(late); await openingFailure; await switchFailure;
  assert.equal(acquisitions, 1); assert.equal(closes, 2); assert.equal(gate.current(), null);
  assert.equal(gate.snapshot().legacyWriteAllowed, false);
  fail = false;
  assert.equal(await gate.open({ ...scope, matchId: 'TEST_SCORING_NEXT' }, 0), true);
  assert.equal(closes, 3); assert.equal(acquisitions, 2); assert.equal(gate.current(), next);
  await gate.stop(); assert.equal(next.closes, 1);
});

test('queued logout can complete cleanup after a one-time stale close failure', async () => {
  const pending = deferred(); let closes = 0;
  const gate = new ScoringProviderSession(() => pending.promise);
  const opening = gate.open(scope, 0); await settle();
  const rejected = assert.rejects(opening, /ONCE/);
  const stopped = gate.stop();
  pending.resolve({ async close() { if (++closes === 1) throw Error('ONCE'); } });
  await rejected; await stopped;
  assert.equal(closes, 2); assert.equal(gate.current(), null);
  assert.equal(gate.snapshot().legacyWriteAllowed, false);
});

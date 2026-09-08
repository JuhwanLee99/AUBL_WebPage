import assert from 'node:assert/strict';
import { test } from 'node:test';
import { captureRunnerPlayContext, resolveRunnerPlay, normalizeRunnerPlay, runnerMovementSummary, runnerPlayAuditRows } from '../src/shared/lib/runnerPlayEngine.ts';
import { normalizeEvents } from '../src/shared/state/demoStore.normalize.ts';
import { replayScoringEvents } from '../src/shared/lib/scoringReplay.ts';

const context = (extra = {}) => ({ inning: 1, half: 'top', outs: 0,
  bases: ['A(1)', 'B(2)', 'C(3)'], score: { home: 0, away: 0 }, activeMatchId: 'game-1',
  balls: 1, strikes: 1, pitchCount: 2, batterIndex: { home: 0, away: 1 },
  runnerResponsiblePitcher: { 0: 'P1', 1: 'P2', 2: 'P3' }, ...extra });
const move = (from, to, sequence, extra = {}) => ({ runnerId: ['A(1)', 'B(2)', 'C(3)'][from], from, to, sequence, cause: 'advance', ...extra });
const input = (state, movements, extra = {}) => ({ id: 'matrix-1', expected: captureRunnerPlayContext(state), movements, note: '', rbi: 0, ...extra });
const ok = (state, movements, extra = {}) => {
  const result = resolveRunnerPlay(state, input(state, movements, extra));
  assert.equal(result.ok, true, result.issues?.join(' / '));
  return result;
};
const bad = (state, movements, extra = {}) => assert.equal(resolveRunnerPlay(state, input(state, movements, extra)).ok, false);

test('simultaneous advances preserve identities and each inherited pitcher', () => {
  const state = context();
  const result = ok(state, [move(0, 1, 3), move(1, 2, 2), move(2, 'home', 1)]);
  assert.deepEqual(result.after.bases, [null, 'A(1)', 'B(2)']);
  assert.deepEqual(result.responsibility, { 0: null, 1: 'P1', 2: 'P2' });
  assert.deepEqual(result.record.runsAllowedBy, { P3: 1 });
  assert.equal(result.after.score.away, 1);
  assert.deepEqual(state.bases, ['A(1)', 'B(2)', 'C(3)']);
});

test('occupied-base collision rejects the whole play instead of pushing another runner home', () => {
  bad(context(), [move(0, 1, 3), move(1, 1, 2), move(2, 2, 1)]);
});

test('runner order cannot cross in the resulting base placement', () => {
  bad(context({ bases: ['A(1)', 'B(2)', null] }), [move(0, 2, 2), move(1, 1, 1)]);
});

test('a trailing runner cannot score while the leading runner holds', () => {
  bad(context(), [move(0, 'home', 1), move(1, 1, 2), move(2, 2, 3)]);
});

test('a trailing runner cannot score before a leading runner is tagged out', () => {
  bad(context({ bases: ['A(1)', 'B(2)', null] }), [move(0, 'home', 1), move(1, 'out', 2, { outKind: 'tag' })]);
});

test('three home crossings must preserve leading-to-trailing order', () => {
  bad(context(), [move(0, 'home', 1), move(1, 'home', 2), move(2, 'home', 3)]);
  const result = ok(context(), [move(0, 'home', 3), move(1, 'home', 2), move(2, 'home', 1)]);
  assert.equal(result.record.runs, 3);
  assert.deepEqual(result.record.runsAllowedBy, { P1: 1, P2: 1, P3: 1 });
});

test('KBO 5.08: a force third out cancels an earlier home crossing', () => {
  const result = ok(context({ outs: 2 }), [move(0, 'out', 2, { outKind: 'force' }), move(1, 1, 3), move(2, 'home', 1)]);
  assert.equal(result.record.runs, 0);
  assert.equal(result.record.movements[2].runDecision, 'third_out');
  assert.equal(result.after.half, 'bottom');
  assert.equal(result.after.outs, 0);
  assert.deepEqual(result.responsibility, { 0: null, 1: null, 2: null });
});

test('KBO 5.08: home crossing before a tag third out counts', () => {
  const result = ok(context({ outs: 2 }), [move(0, 'out', 2, { outKind: 'tag' }), move(1, 1, 3), move(2, 'home', 1)]);
  assert.equal(result.record.runs, 1);
  assert.deepEqual(result.record.runsAllowedBy, { P3: 1 });
});

test('KBO 5.08: home crossing after a tag third out does not count', () => {
  const result = ok(context({ outs: 2 }), [move(0, 'out', 1, { outKind: 'tag' }), move(1, 1, 3), move(2, 'home', 2)]);
  assert.equal(result.record.runs, 0);
  assert.equal(result.record.movements[2].runDecision, 'after_third_out');
  assert.equal(runnerMovementSummary(result.record.movements[2]).includes('득점'), false);
});

test('KBO 5.08: preceding-runner appeal third out cancels following runs', () => {
  const result = ok(context({ outs: 2 }), [move(0, 'home', 2), move(1, 'home', 1), move(2, 'out', 3, { outKind: 'appeal' })]);
  assert.equal(result.record.runs, 0);
  assert.equal(result.record.movements[0].runDecision, 'preceding_appeal');
});

test('appeal against a trailing runner does not cancel earlier leading-runner score', () => {
  const result = ok(context({ outs: 2 }), [move(0, 'out', 2, { outKind: 'appeal' }), move(1, 1, 3), move(2, 'home', 1)]);
  assert.equal(result.record.runs, 1);
});

test('batter out before reaching first as third out cancels all runs', () => {
  const result = ok(context({ outs: 2 }), [move(0, 'home', 3), move(1, 'home', 2), move(2, 'home', 1)], { batterOut: { sequence: 4 } });
  assert.equal(result.record.runs, 0);
  assert.equal(result.record.outsAdded, 1);
});

test('batter and runner outs in one play create one atomic half transition', () => {
  const state = context({ outs: 1 });
  const result = ok(state, [move(0, 'out', 3, { outKind: 'tag' }), move(1, 1, 4), move(2, 'home', 2)], { batterOut: { sequence: 1 }, rbi: 1 });
  assert.equal(result.record.outsAdded, 2);
  assert.equal(result.record.runs, 1);
  assert.equal(result.record.endedHalf, true);
  assert.equal(result.record.input.rbi, 1);
});

test('fourth out is rejected rather than silently clamped to three', () => {
  bad(context({ outs: 2 }), [move(0, 'out', 1, { outKind: 'tag' }), move(1, 'out', 2, { outKind: 'tag' }), move(2, 2, 3)]);
});

test('multiple outs from zero outs are retained without an unnecessary inning change', () => {
  const result = ok(context(), [move(0, 'out', 1, { outKind: 'tag' }), move(1, 'out', 2, { outKind: 'tag' }), move(2, 2, 3)]);
  assert.equal(result.after.outs, 2);
  assert.equal(result.after.half, 'top');
});

test('bottom-half third out advances to the next inning and credits the home side', () => {
  const result = ok(context({ half: 'bottom', outs: 2 }), [move(0, 'out', 2, { outKind: 'tag' }), move(1, 1, 3), move(2, 'home', 1)]);
  assert.equal(result.after.inning, 2);
  assert.equal(result.after.half, 'top');
  assert.equal(result.after.score.home, 1);
});

test('missing pitcher responsibility stays unassigned instead of using the current pitcher', () => {
  const result = ok(context({ runnerResponsiblePitcher: { 0: null, 1: 'P2', 2: null } }), [move(0, 0, 3), move(1, 1, 2), move(2, 'home', 1)]);
  assert.equal(result.record.unassignedRuns, 1);
  assert.deepEqual(result.record.runsAllowedBy, {});
});

test('stale match, count, batting order, score or runner responsibility rejects the input', () => {
  const state = context(), request = input(state, [move(0, 1, 3), move(1, 2, 2), move(2, 'home', 1)]);
  for (const next of [
    { ...state, activeMatchId: 'game-2' }, { ...state, balls: 2 }, { ...state, pitchCount: 3 },
    { ...state, batterIndex: { home: 0, away: 2 } }, { ...state, score: { home: 0, away: 1 } },
    { ...state, runnerResponsiblePitcher: { 0: 'new', 1: 'P2', 2: 'P3' } },
  ]) assert.equal(resolveRunnerPlay(next, request).ok, false);
});

test('snapshot captures are copies, not aliases of live bases or pitcher maps', () => {
  const state = context(), saved = captureRunnerPlayContext(state);
  state.bases[0] = 'another'; state.runnerResponsiblePitcher[0] = 'changed';
  assert.equal(saved.bases[0], 'A(1)'); assert.equal(saved.runnerResponsiblePitcher[0], 'P1');
});

test('omitted, extra, duplicated and mismatched runners are rejected', () => {
  const state = context(), full = [move(0, 0, 3), move(1, 1, 2), move(2, 'home', 1)];
  for (const moves of [full.slice(1), [...full, move(0, 0, 4)], [full[0], full[0], full[2]], [full[0], full[1], { ...full[2], runnerId: 'wrong' }]]) bad(state, moves);
});

test('active sequence ties, fractional order, missing out type and backwards movement fail', () => {
  bad(context(), [move(0, 1, 1), move(1, 2, 1), move(2, 'home', 1)]);
  bad(context(), [move(0, 0, 3), move(1, 1, 2), move(2, 'home', 1.5)]);
  bad(context(), [move(0, 'out', 3), move(1, 1, 2), move(2, 'home', 1)]);
  bad(context(), [move(0, 'out', 3, { outKind: 'tag' }), move(1, 0, 2), move(2, 'home', 1)]);
});

test('caught stealing and pickoff require outs while a steal success cannot hold', () => {
  for (const cause of ['caught', 'pickoff']) bad(context(), [move(0, 0, 3, { cause }), move(1, 1, 2), move(2, 'home', 1)]);
  bad(context(), [move(0, 0, 3, { cause: 'steal' }), move(1, 1, 2), move(2, 'home', 1)]);
});

test('no-op and impossible RBI awards are rejected', () => {
  bad(context(), [move(0, 0, 3), move(1, 1, 2), move(2, 2, 1)]);
  bad(context(), [move(0, 0, 3), move(1, 1, 2), move(2, 'home', 1)], { rbi: 1 });
  bad(context(), [move(0, 0, 3), move(1, 1, 2), move(2, 'home', 1)], { batterOut: { sequence: 4 }, rbi: 2 });
});

test('persisted movement authority is recomputed and normalized with the event', () => {
  const state = context();
  const result = ok(state, [move(0, 0, 3), move(1, 1, 2), move(2, 'home', 1)]);
  const record = { ...result.record, runs: 100, runsAllowedBy: { wrong: 100 } };
  assert.equal(normalizeRunnerPlay(record).runs, 1);
  const normalized = normalizeEvents([{ inning: 1, half: 'top', type: 'runner', runners: [], runnerPlay: record }], { inning: 1, half: 'top' });
  assert.deepEqual(normalized[0].runnerPlay.runsAllowedBy, { P3: 1 });
});

test('malformed persisted runner records demand review rather than silently disappearing', () => {
  const normalized = normalizeEvents([{ inning: 1, half: 'top', type: 'runner', runnerPlay: { version: 1, input: null } }], { inning: 1, half: 'top' });
  assert.equal(normalized[0].manualResolve.required, true);
  for (const value of [null, {}, [], { version: 2 }, { version: 1, input: { expected: { outs: 0 } } }]) assert.equal(normalizeRunnerPlay(value), undefined);
});

test('one matrix record produces an idempotent replay and all CSV movement evidence', () => {
  const state = context();
  const result = ok(state, [move(0, 1, 3), move(1, 2, 2), move(2, 'home', 1)], { note: 'three runners' });
  const event = { eventId: 'live-1', type: 'runner', runnerPlay: result.record, stateTransition: { version: 1, before: state, after: result.after } };
  const replay = replayScoringEvents([event, structuredClone(event)], state);
  assert.equal(replay.state.score.away, 1);
  assert.equal(replay.entries[1].status, 'duplicate');
  const rows = runnerPlayAuditRows([event]);
  assert.equal(rows.length, 3); assert.equal(rows[2][8], 'P3'); assert.equal(rows[2][12], 'three runners');
});

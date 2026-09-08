import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveHitPlay } from '../src/shared/lib/hitPlayAdapter.ts';
import { captureRunnerPlayContext, normalizeRunnerPlay, runnerMovementSummary, runnerPlayAuditRows } from '../src/shared/lib/runnerPlayEngine.ts';
import { createStructuredRunnerIndex } from '../src/shared/lib/structuredRunnerStats.ts';
import { normalizeEvents } from '../src/shared/state/demoStore.normalize.ts';
import { replayScoringEvents } from '../src/shared/lib/scoringReplay.ts';

const state = (extra = {}) => ({ inning: 1, half: 'top', outs: 0, bases: [null, null, null], score: { home: 0, away: 0 }, activeMatchId: 'm',
  pitchCount: 2, balls: 1, strikes: 1, batterIndex: { home: 0, away: 1 }, runnerResponsiblePitcher: { 0: null, 1: null, 2: null }, ...extra });
const options = (extra = {}) => ({ id: 'hit-1', batterId: 'H(9)', pitcherId: 'P-new(2)', bases: 1, ...extra });
const loaded = (extra = {}) => state({ bases: ['A(1)', 'B(2)', 'C(3)'], runnerResponsiblePitcher: { 0: 'P-old(1)', 1: 'P-old(1)', 2: 'P-mid(3)' }, ...extra });
const review = (context, extra = {}) => ({ expected: captureRunnerPlayContext(context), batterId: 'H(9)', pitcherId: 'P-new(2)', sequences: { 0: 4, 1: 3, 2: 2 }, outKinds: {}, batterSequence: 1, hitConfirmed: true, ...extra });
const success = (context, settings = {}) => {
  const result = resolveHitPlay(context, options(settings));
  assert.equal(result.ok, true, result.issues?.join(' / ')); return result;
};
const asEvent = (result, extra = {}) => ({ inning: 1, half: 'top', eventId: 'e1', type: 'hit', order: 1, batter: 'H(9)', pitch: 3,
  runnerPlay: result.record, runners: result.record.movements.map(runnerMovementSummary), ...extra });

test('empty-base singles, doubles and triples place the hitter with current pitcher responsibility', () => {
  for (const bases of [1, 2, 3]) {
    const result = success(state(), { bases });
    assert.equal(result.after.bases[bases - 1], 'H(9)');
    assert.equal(result.responsibility[bases - 1], 'P-new(2)');
    assert.equal(result.record.runs, 0);
  }
});

test('a loaded single moves inherited pitchers with their original runners', () => {
  const before = loaded();
  const result = success(before);
  assert.deepEqual(result.after.bases, ['H(9)', 'A(1)', 'B(2)']);
  assert.deepEqual(result.responsibility, { 0: 'P-new(2)', 1: 'P-old(1)', 2: 'P-old(1)' });
  assert.deepEqual(result.record.runsAllowedBy, { 'P-mid(3)': 1 });
  assert.equal(result.record.input.rbi, 1);
  assert.equal(before.bases[0], 'A(1)');
});

test('a loaded double credits two different inherited pitcher liabilities', () => {
  const result = success(loaded(), { bases: 2 });
  assert.deepEqual(result.after.bases, [null, 'H(9)', 'A(1)']);
  assert.equal(result.record.runs, 2);
  assert.deepEqual(result.record.runsAllowedBy, { 'P-mid(3)': 1, 'P-old(1)': 1 });
});

test('a loaded triple leaves only the batter and keeps his pitcher responsibility', () => {
  const result = success(loaded(), { bases: 3 });
  assert.deepEqual(result.after.bases, [null, null, 'H(9)']);
  assert.equal(result.record.runs, 3);
  assert.equal(result.responsibility[2], 'P-new(2)');
});

test('solo home run counts the hitter run and RBI exactly once', () => {
  const result = success(state(), { bases: 4 });
  assert.equal(result.record.runs, 1);
  assert.equal(result.record.input.rbi, 1);
  assert.deepEqual(result.record.runsAllowedBy, { 'P-new(2)': 1 });
  assert.deepEqual(result.after.bases, [null, null, null]);
  assert.equal(result.record.movements.length, 0);
});

test('grand slam assigns inherited and hitter runs separately', () => {
  const result = success(loaded(), { bases: 4 });
  assert.equal(result.record.runs, 4);
  assert.equal(result.record.input.rbi, 4);
  assert.deepEqual(result.record.runsAllowedBy, { 'P-mid(3)': 1, 'P-old(1)': 2, 'P-new(2)': 1 });
});

test('home run cannot hold or retire an existing runner through legacy overrides', () => {
  assert.equal(resolveHitPlay(loaded(), options({ bases: 4, advances: { 0: 'hold' } })).ok, false);
  assert.equal(resolveHitPlay(loaded(), options({ bases: 4, advances: { 0: 'out' } })).ok, false);
});

test('hitter destination collision is rejected rather than pushing runners forward', () => {
  assert.equal(resolveHitPlay(loaded(), options({ advances: { 0: 'hold' } })).ok, false);
  assert.equal(resolveHitPlay(loaded(), options({ bases: 2, advances: { 0: 'hold', 1: 3, 2: 4 } })).ok, false);
});

test('an explicit advance changes destination without changing pitcher ownership', () => {
  const result = success(state({ bases: ['A(1)', null, null], runnerResponsiblePitcher: { 0: 'P-old(1)', 1: null, 2: null } }), { advances: { 0: 3 } });
  assert.equal(result.after.bases[2], 'A(1)'); assert.equal(result.responsibility[2], 'P-old(1)');
});

test('runner out without detailed order and confirmed hit judgment is blocked', () => {
  const before = loaded();
  assert.equal(resolveHitPlay(before, options({ advances: { 0: 'out' } })).ok, false);
  assert.equal(resolveHitPlay(before, options({ advances: { 0: 'out' }, review: review(before, { outKinds: { 0: 'tag' }, hitConfirmed: false }) })).ok, false);
});

test('force-out play is not accepted as a hit even when the user confirms the label', () => {
  const before = loaded();
  assert.equal(resolveHitPlay(before, options({ advances: { 0: 'out' }, review: review(before, { outKinds: { 0: 'force' } }) })).ok, false);
});

test('tag third out after a leading run permits that run and clears the half', () => {
  const before = loaded({ outs: 2 });
  const result = success(before, { advances: { 0: 'out', 1: 3, 2: 4 }, review: review(before, { outKinds: { 0: 'tag' } }) });
  assert.equal(result.record.runs, 1);
  assert.equal(result.after.half, 'bottom');
  assert.equal(result.record.input.rbi, 1);
  assert.deepEqual(result.responsibility, { 0: null, 1: null, 2: null });
});

test('home arrival after tag third out is retained as invalid and never adds runs or RBI', () => {
  const before = loaded({ outs: 2 });
  const result = success(before, { advances: { 0: 'out', 1: 3, 2: 4 }, review: review(before, { outKinds: { 0: 'tag' }, sequences: { 0: 2, 1: 4, 2: 3 } }) });
  assert.equal(result.record.runs, 0); assert.equal(result.record.input.rbi, 0);
  assert.equal(result.record.movements.find((move) => move.from === 2).runDecision, 'after_third_out');
});

test('hitter arrival after the third out stays blocked for further judgment', () => {
  const before = loaded({ outs: 2 });
  assert.equal(resolveHitPlay(before, options({ advances: { 0: 'out' }, review: review(before, { outKinds: { 0: 'tag' }, batterSequence: 4, sequences: { 0: 1, 1: 2, 2: 3 } }) })).ok, false);
});

test('explicit RBI correction may reduce the inferred count but cannot exceed allowed runs', () => {
  const before = loaded();
  assert.equal(success(before, { review: review(before, { rbi: 0 }) }).record.input.rbi, 0);
  assert.equal(resolveHitPlay(before, options({ review: review(before, { rbi: 2 }) })).ok, false);
});

test('stale base context and pitcher or hitter changes prevent applying the old panel', () => {
  const before = loaded(), saved = review(before);
  for (const settings of [{ pitcherId: 'changed' }, { batterId: 'other' }]) {
    assert.equal(resolveHitPlay(before, options({ ...settings, review: saved })).ok, false);
  }
  assert.equal(resolveHitPlay({ ...before, balls: 2 }, options({ review: saved })).ok, false);
});

test('invalid legacy advance selections do not silently become valid movements', () => {
  for (const advances of [{ 4: 'score' }, { 0: 5 }, { 0: -1 }, { 0: 'typo' }]) assert.equal(resolveHitPlay(loaded(), options({ advances })).ok, false);
  assert.equal(resolveHitPlay(state(), options({ advances: { 0: 2 } })).ok, false);
});

test('unknown pitcher remains unknown for both new hitter and inherited runs', () => {
  const result = success(state({ bases: [null, null, 'C(3)'] }), { bases: 4, pitcherId: null });
  assert.equal(result.record.unassignedRuns, 2); assert.deepEqual(result.record.runsAllowedBy, {});
});

test('hit records and manual out judgments survive persisted-event normalization', () => {
  const before = loaded(), result = success(before, { advances: { 0: 'out' }, review: review(before, { outKinds: { 0: 'tag' } }) });
  const event = normalizeEvents([asEvent(result)], { inning: 1, half: 'top' })[0];
  assert.equal(event.runnerPlay.input.batterHit.hitConfirmed, true);
  assert.equal(event.runnerPlay.input.batterHit.responsiblePitcherId, 'P-new(2)');
  assert.deepEqual(normalizeRunnerPlay(result.record), result.record);
});

test('structured lookup uses inning and half as well as the source ID', () => {
  const event = asEvent(success(loaded()));
  const index = createStructuredRunnerIndex([event]);
  assert.ok(index.get(event));
  assert.equal(index.get({ ...event, half: 'bottom' }), undefined);
  assert.equal(index.get({ ...event, inning: 2 }), undefined);
});

test('movement lookup preserves authoritative owner and suppresses duplicate feed rows', () => {
  const event = asEvent(success(loaded()));
  const index = createStructuredRunnerIndex([event]);
  const first = index.takeMovement(event, 'C(3)');
  assert.equal(first.duplicate, false); assert.equal(first.move.responsiblePitcherId, 'P-mid(3)');
  assert.equal(index.takeMovement(event, 'C(3)').duplicate, true);
  assert.equal(index.takeMovement(event, 'C'), undefined);
});

test('unresolved or conflicting stored events are not used as structured authority', () => {
  const event = asEvent(success(loaded()));
  assert.equal(createStructuredRunnerIndex([{ ...event, manualResolve: { required: true } }]).get(event), undefined);
  const different = asEvent(success(loaded(), { bases: 2 }));
  assert.equal(createStructuredRunnerIndex([event, different]).get(event), undefined);
});

test('legacy textual arrows remain available and CSV includes the new hitter', () => {
  const result = success(loaded());
  const summary = runnerMovementSummary(result.record.movements.find((move) => move.from === 0));
  assert.match(summary, /1루→2루/);
  const rows = runnerPlayAuditRows([asEvent(result)]);
  assert.equal(rows.length, 4); assert.equal(rows[3][3], '타석'); assert.equal(rows[3][8], 'P-new(2)');
});

test('solo home run has a CSV row even with no pre-existing runners', () => {
  const rows = runnerPlayAuditRows([asEvent(success(state(), { bases: 4 }))]);
  assert.equal(rows.length, 1); assert.equal(rows[0][4], '홈'); assert.equal(rows[0][9], '인정');
});

test('hit state replay remains idempotent and credits runs once', () => {
  const before = loaded(), result = success(before);
  const event = asEvent(result, { stateTransition: { version: 1, before, after: result.after } });
  const replay = replayScoringEvents([event, structuredClone(event)], before);
  assert.equal(replay.state.score.away, 1); assert.equal(replay.entries[1].status, 'duplicate');
});

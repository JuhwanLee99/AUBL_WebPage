import test from 'node:test';
import assert from 'node:assert/strict';
import { sacrificeInputIssue, droppedThirdStrikeInputIssue, multipleOutInputIssue, miscPlayInputIssue, legacyThirdOutIssue } from '../src/shared/lib/scoringInputSafety.ts';
import { scoringTeamTotals, classifyRecordedPlateAppearance, recordedMiscPitch } from '../src/shared/lib/scoringEventFacts.ts';

// This checks the existing safety subset, not the proposed composite-play engine.
// No application store, Firebase, credentials or network are imported.
const basesFor = mask => [0, 1, 2].map(i => mask & (1 << i) ? `runner-${i}` : null);
const entry = (overrides = {}) => ({ inning: 1, half: 'top', eventId: 'contract-play', order: 1,
  batter: 'batter-1', pitch: 3, type: 'error', runners: [], ...overrides });
const log = result => ({ inning: 1, half: 'top', eventId: 'contract-play', order: 1,
  batter: 'batter-1', pitch: 3, result });

test('C-DTS: eligibility matches all 24 occupancy/out states', () => {
  for (let outs = 0; outs <= 2; outs++) for (let mask = 0; mask < 8; mask++) {
    assert.equal(droppedThirdStrikeInputIssue({ outs, bases: basesFor(mask) }) === null,
      outs === 2 || !(mask & 1), `outs=${outs}, bases=${mask}`);
  }
});

test('C-SAC: the restricted sacrifice form checks 48 occupancy/out/type combinations', () => {
  for (let outs = 0; outs <= 2; outs++) for (let mask = 0; mask < 8; mask++) for (const kind of ['fly', 'bunt']) {
    const accepted = sacrificeInputIssue({ outs, bases: basesFor(mask) }, kind) === null;
    assert.equal(accepted, outs < 2 && mask !== 0 && (kind === 'bunt' || Boolean(mask & 4)), `${outs}/${mask}/${kind}`);
  }
});

test('C-MULTI: 48 multiple-out eligibility combinations preserve remaining outs', () => {
  for (let outs = 0; outs <= 2; outs++) for (let mask = 0; mask < 8; mask++) for (const count of [2, 3]) {
    const bases = basesFor(mask);
    const selected = [0, 1, 2].filter(i => bases[i]).slice(0, count - 1);
    assert.equal(multipleOutInputIssue({ outs, bases }, count, selected) === null,
      outs + count <= 3 && selected.length === count - 1, `${outs}/${mask}/${count}`);
  }
});

test('C-PITCH: explicit pending WP/PB facts override misleading text', () => {
  for (const type of ['wp', 'pb']) for (const pitchResult of ['ball', 'strike']) {
    const e = entry({ type, outcome: 'plate_pending', error: { errorType: type,
      pitchResult, advanceResults: { batter: 'hold', runners: { 2: 'score' } } } });
    for (const text of ['볼넷', '홈런', '삼진', '실책 · 타구']) assert.equal(classifyRecordedPlateAppearance(text, e), null);
    assert.deepEqual(recordedMiscPitch(e), { pitch: true, ball: pitchResult === 'ball', strike: pitchResult === 'strike' });
  }
});

test('C-AWARD: forced-only walks do not acquire WP/PB in any of 16 combinations', () => {
  for (let mask = 0; mask < 8; mask++) for (const errorType of ['WP(폭투)', 'PB(포일)']) {
    const bases = basesFor(mask), runners = {};
    let forced = true;
    for (let i = 0; i < 3; i++) {
      forced = forced && Boolean(bases[i]);
      if (bases[i]) runners[i] = forced ? 'advance' : 'hold';
    }
    assert.ok(miscPlayInputIssue({ outs: 0, balls: 3, strikes: 1, bases }, {
      errorType, pitchResult: 'ball', advanceResults: { batter: 1, runners },
    }), `${mask}/${errorType}`);
  }
});

test('C-TIMING: missing third-out timing stays rejected rather than becoming a zero-run decision', () => {
  assert.equal(legacyThirdOutIssue(3, 0), null);
  for (const runs of [1, 2, 3, 4]) assert.equal(typeof legacyThirdOutIssue(3, runs), 'string');
  assert.equal(typeof legacyThirdOutIssue(4, 0), 'string');
});

test('C-SOURCE: source priority and duplicate feed do not change team totals', () => {
  const live = entry({ source: { kind: 'live' } });
  const manual = entry({ type: 'hit', source: { kind: 'manual' } });
  const text = entry({ type: 'error', source: { kind: 'text_feed_rebuild' } });
  const expected = { hits: { home: 0, away: 1 }, errors: { home: 0, away: 0 } };
  for (const events of [[live, manual, text], [manual, text, live], [text, live, manual]]) {
    assert.deepEqual(scoringTeamTotals(events, [log('실책'), log('실책'), log('1루타')]), expected);
  }
});

test('C-PENDING: an unresolved authoritative event is not resurrected by its feed', () => {
  const pending = entry({ type: 'hit', manualResolve: { required: true } });
  assert.equal(classifyRecordedPlateAppearance('1루타', pending), null);
  assert.deepEqual(scoringTeamTotals([pending], [log('1루타')]), { hits: { home: 0, away: 0 }, errors: { home: 0, away: 0 } });
});

test('C-HIT: one hit remains one with several batting and runner descriptions', () => {
  const hit = entry({ type: 'hit' });
  const descriptions = [log('1루타'), { ...log('1루타 때 3루 주자 득점'), order: 0, batter: '' }, log('1루타')];
  assert.equal(scoringTeamTotals([hit, hit], descriptions).hits.away, 1);
});

test('C-PURE: aggregating and classifying do not alter source events or feed', () => {
  const events = [entry()], feed = [log('실책')];
  const before = structuredClone({ events, feed });
  scoringTeamTotals(events, feed);
  classifyRecordedPlateAppearance(feed[0].result, events[0]);
  recordedMiscPitch(events[0]);
  assert.deepEqual({ events, feed }, before);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { SCORING_STATE_FIELDS, scoringCheckpoint } from '../src/shared/lib/scoringCheckpoint.ts';

const base = { activeMatchId: 'LOCAL_ONLY', events: [], feed: [], score: { home: 0, away: 0 } };
test('only explicitly classified record fields enter the persisted checkpoint', () => {
  const state = Object.fromEntries(Object.keys(SCORING_STATE_FIELDS).map(key => [key, `value:${key}`]));
  const projected = scoringCheckpoint(state);
  for (const [key, category] of Object.entries(SCORING_STATE_FIELDS)) {
    assert.equal(Object.hasOwn(projected, key), category === 'record', key);
  }
});
test('audience, display, schedule and lease refreshes do not change scoring identity', () => {
  const state = { ...base, onlineViewerCount: 1, liveVideoUrl: '', liveDelaySeconds: 0, followCurrent: true,
    matches: [], scorerName: 'one', scorerEmail: 'one', scorerLockedAt: 10 };
  assert.deepEqual(scoringCheckpoint(state), scoringCheckpoint({ ...state, onlineViewerCount: 50,
    liveVideoUrl: 'other', liveDelaySeconds: 20, followCurrent: false, matches: [{ id: 'other' }],
    scorerName: 'two', scorerEmail: 'two', scorerLockedAt: 99 }));
});
test('record changes remain visible to the comparison', () => {
  for (const [key, category] of Object.entries(SCORING_STATE_FIELDS)) {
    if (category !== 'record') continue;
    assert.notDeepEqual(scoringCheckpoint({ ...base, [key]: 'before' }), scoringCheckpoint({ ...base, [key]: 'after' }), key);
  }
});
test('access metadata is excluded from replay but explicitly classified for live validation', () => {
  for (const key of ['scorerUid', 'scorerPaused', 'scorerLockedAt', 'scorerRole']) {
    assert.equal(SCORING_STATE_FIELDS[key], 'access');
    assert.deepEqual(scoringCheckpoint({ ...base, [key]: 'old' }), scoringCheckpoint({ ...base, [key]: 'new' }));
  }
});
test('history and rejection diagnostics are not part of replay identity', () => {
  assert.deepEqual(scoringCheckpoint({ ...base, history: [base], futureHistory: [base], scoringRejections: ['rejected'] }), base);
});
test('unclassified runtime fields fail closed instead of being silently discarded', () => {
  assert.throws(() => scoringCheckpoint({ ...base, futureRuleProfile: 'unknown' }), /unclassified-scoring-field/);
});

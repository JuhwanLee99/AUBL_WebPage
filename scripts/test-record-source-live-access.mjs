import assert from 'node:assert/strict';
import test from 'node:test';
import { captureLiveRecordAccess, clearLiveRecordState, redactLiveScheduleRecord } from '../src/shared/state/demoStore.liveAccess.ts';

for (const [label, access, id, expected] of [
  ['live match', { matchId: 'A', allowed: true }, 'A', true],
  ['unknown source', { matchId: 'A', allowed: false }, 'A', false],
  ['another match', { matchId: 'A', allowed: true }, 'B', false],
  ['no active match', { matchId: null, allowed: true }, null, false],
]) test(`access guard: ${label}`, () => assert.equal(captureLiveRecordAccess(() => access, id)(), expected));

for (const [label, transitions] of [
  ['switch', [{ matchId: 'B', allowed: true }]],
  ['A-B-A round trip', [{ matchId: 'B', allowed: true }, { matchId: 'A', allowed: true }]],
  ['cutover', [{ matchId: 'A', allowed: false }]],
  ['reconnect', [{ matchId: 'A', allowed: false }, { matchId: 'A', allowed: true }]],
]) test(`captured response expires on ${label}`, () => {
  let access = { matchId: 'A', allowed: true };
  const guard = captureLiveRecordAccess(() => access, 'A');
  assert.equal(guard(), true);
  for (const next of transitions) { access = next; assert.equal(guard(), false); }
});

test('same live session remains usable across unrelated changes', () => {
  const access = { matchId: 'A', allowed: true };
  const guard = captureLiveRecordAccess(() => access, 'A');
  assert.equal(guard(), true); assert.equal(guard(), true);
});

test('clear removes all live record and undo/redo payloads without mutating the input', () => {
  const base = { score: { home: 0, away: 0 }, lastPlay: 'waiting', scorerUid: null, gameStarted: false };
  const current = { activeMatchId: 'A', matches: [{ id: 'A' }], followCurrent: false, score: { home: 9, away: 8 },
    scorerUid: 'private', lastPlay: 'private', gameStarted: true, feed: ['private'], events: ['private'],
    lineups: { home: ['private'], away: ['private'] }, benches: { home: ['private'], away: [] },
    removed: { home: ['private'], away: [] }, history: ['private'], futureHistory: ['private'] };
  const before = structuredClone(current);
  const cleared = clearLiveRecordState(base, current);
  assert.equal(JSON.stringify(cleared).includes('private'), false);
  assert.equal(cleared.activeMatchId, 'A'); assert.equal(cleared.followCurrent, false);
  assert.equal(cleared.scorerPaused, true); assert.deepEqual(cleared.score, base.score);
  assert.deepEqual(current, before);
});

test('context schedule redaction preserves public metadata but not private records', () => {
  const match = { id: 'A', recordAuthority: 'UNIQUE_PLAY', officialRecordRevision: 'R1', homeScore: 3,
    notes: 'private', lineups: { home: ['private'] }, benches: {}, postGame: { note: 'private' }, manualEntryDraft: {} };
  const result = redactLiveScheduleRecord(match);
  assert.equal(JSON.stringify(result).includes('private'), false);
  for (const field of ['notes', 'lineups', 'benches', 'postGame', 'manualEntryDraft']) assert.equal(result[field], undefined);
  assert.equal(result.officialRecordRevision, 'R1'); assert.equal(result.homeScore, 3);
  assert.equal(match.notes, 'private');
});

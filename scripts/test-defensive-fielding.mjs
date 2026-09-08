import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveCompositePlay } from '../src/shared/lib/compositePlayEngine.ts';
import { normalizeEvents } from '../src/shared/state/demoStore.normalize.ts';
import {
  attachCompositeDefensiveSnapshots, buildDefensiveFieldingLedger, defensivePosition,
  defensiveSnapshotIssue, DEFENSIVE_STATS, projectDefensiveCredits, resolveDefender,
} from '../src/shared/lib/defensiveFielding.ts';
import { fieldingInput, fieldingLineup, fieldingUnitContext } from './e2e/scoring/defensive-fixtures.mjs';

function fixture(id = 'PLAY1', options = {}) {
  const context = { ...structuredClone(fieldingUnitContext), ...options.context };
  if (options.kind === 'pb') {
    context.bases = ['LOCAL_FIELDING_RUNNER', null, null];
    context.runnerResponsiblePitcher[0] = context.pitcherId;
  }
  const before = { ...context, lineups: { home: fieldingLineup(), away: fieldingLineup('AWAY') }, events: [] };
  if (options.lineup) before.lineups[context.half === 'top' ? 'home' : 'away'] = options.lineup;
  const result = resolveCompositePlay(context, fieldingInput(context, id, options.kind));
  assert.ok(result.record, JSON.stringify(result));
  const event = { inning: context.inning, half: context.half, order: 1, batter: context.batterId,
    pitch: 1, type: 'composite', runners: [], eventId: `EVENT-${id}`, compositePlay: result.record, source: { kind: 'live' } };
  const after = attachCompositeDefensiveSnapshots(before, { ...before, events: [event] }, id);
  return { before, after, event: after.events[0], record: result.record, matchId: context.activeMatchId };
}
const clone = value => structuredClone(value);
const ledgerFor = (...events) => buildDefensiveFieldingLedger(events, fieldingUnitContext.activeMatchId);
const rowFor = (ledger, name) => ledger.players.find(row => row.name === name);

for (const [index, code, korean] of [
  ['1', 'P', '투수'], ['2', 'C', '포수'], ['3', '1B', '1루수'], ['4', '2B', '2루수'],
  ['5', '3B', '3루수'], ['6', 'SS', '유격수'], ['7', 'LF', '좌익수'], ['8', 'CF', '중견수'], ['9', 'RF', '우익수'],
]) {
  for (const alias of [index, code, korean, ` ${code.toLowerCase()} `]) {
    test(`defensive position alias: ${alias}`, () => assert.equal(defensivePosition(alias), index));
  }
}
for (const value of ['DH', '지명타자', 'PH', 'PR', '', '10', 'P/DH']) {
  test(`nondefensive or ambiguous position: ${value}`, () => assert.equal(defensivePosition(value), undefined));
}
test('groundout credits the shortstop assist and first baseman putout', () => {
  const { event } = fixture(); const ledger = ledgerFor(event);
  assert.equal(rowFor(ledger, 'HOME_SS').stats.assists, 1);
  assert.equal(rowFor(ledger, 'HOME_1B').stats.putouts, 1);
  assert.equal(ledger.issues.length, 0);
});
test('bottom half credits the away defense', () => {
  const { event } = fixture('BOTTOM', { context: { half: 'bottom' } });
  assert.ok(ledgerFor(event).players.every(row => row.side === 'away' && row.name.startsWith('AWAY_')));
});
test('third-out half change captures the defense before the play', () => {
  const { before, event } = fixture('THIRD', { context: { outs: 2 } });
  const bare = clone(event); delete bare.defensiveSnapshot;
  const after = attachCompositeDefensiveSnapshots(before, { ...before, half: 'bottom', events: [bare] }, 'THIRD');
  assert.equal(after.events[0].defensiveSnapshot.side, 'home');
});
test('replacement never steals the previous shortstop assist', () => {
  const first = fixture('BEFORE'); const lineup = fieldingLineup(); lineup[5] = { ...lineup[5], name: 'REPLACEMENT', number: '66' };
  const second = fixture('AFTER', { lineup }); const ledger = ledgerFor(second.event, first.event);
  assert.equal(rowFor(ledger, 'HOME_SS').stats.assists, 1);
  assert.equal(rowFor(ledger, 'REPLACEMENT').stats.assists, 1);
  assert.equal(rowFor(ledger, 'HOME_1B').stats.putouts, 2);
});
test('position swap retains player identity across the two positions', () => {
  const first = fixture('POSITION1'); const lineup = fieldingLineup();
  [lineup[2].pos, lineup[5].pos] = [lineup[5].pos, lineup[2].pos];
  const second = fixture('POSITION2', { lineup }); const ledger = ledgerFor(first.event, second.event);
  const row = rowFor(ledger, 'HOME_SS');
  assert.equal(row.stats.assists, 1); assert.equal(row.stats.putouts, 1);
  assert.deepEqual(new Set(row.positions), new Set(['3', '6']));
});
test('capture does not retain mutable lineup references', () => {
  const { before, event } = fixture(); before.lineups.home[5].name = 'MUTATED';
  assert.equal(event.defensiveSnapshot.lineup[5].name, 'HOME_SS');
});
test('a no-op or rejected action does not manufacture a snapshot', () => {
  const { before } = fixture(); assert.equal(attachCompositeDefensiveSnapshots(before, before, 'NOT-APPLIED'), before);
});
test('a replayed input does not backfill legacy history', () => {
  const { event, before } = fixture(); delete event.defensiveSnapshot;
  const state = { ...before, events: [event] };
  assert.equal(attachCompositeDefensiveSnapshots(state, state, event.compositePlay.input.id), state);
  assert.equal(state.events[0].defensiveSnapshot, undefined);
});
test('JSON persistence preserves attribution', () => {
  const { event } = fixture(); assert.deepEqual(ledgerFor(clone(event)), ledgerFor(event));
});
test('legacy missing snapshot remains unassigned instead of using current players', () => {
  const { event } = fixture(); delete event.defensiveSnapshot;
  const ledger = ledgerFor(event);
  assert.equal(ledger.players.length, 0); assert.equal(ledger.unassigned.assists, 1); assert.equal(ledger.unassigned.putouts, 1);
});
for (const [key, value] of [['version', 2], ['matchId', 'OTHER'], ['playId', 'OTHER'], ['inning', 2], ['half', 'bottom'], ['side', 'away'], ['rosterKey', 'OTHER'], ['lineup', null]]) {
  test(`reject incorrectly bound snapshot: ${key}`, () => {
    const { event, record } = fixture(); event.defensiveSnapshot[key] = value;
    assert.ok(defensiveSnapshotIssue(event.defensiveSnapshot, record, event));
    assert.equal(ledgerFor(event).players.length, 0);
  });
}
for (const [name, change] of [
  ['missing number', lineup => { lineup[5].number = ''; }],
  ['missing name', lineup => { lineup[5].name = ''; }],
  ['missing position', lineup => { lineup[5].pos = 'DH'; }],
  ['duplicate position', lineup => { lineup[6].pos = 'SS'; }],
  ['same identity in two positions', lineup => { lineup[6].name = lineup[5].name; lineup[6].number = lineup[5].number; }],
]) test(`preserve position totals but leave ambiguous defender unassigned: ${name}`, () => {
  const lineup = fieldingLineup(); change(lineup); const { event } = fixture('AMBIGUOUS', { lineup }); const ledger = ledgerFor(event);
  assert.equal(ledger.unassigned.assists, 1); assert.equal(ledger.assigned.putouts, 1); assert.equal(ledger.totals.assists, 1);
});
test('same name with different numbers remains two players', () => {
  const first = fixture('NAME1'); const lineup = fieldingLineup(); lineup[5].number = '66';
  const second = fixture('NAME2', { lineup }); const rows = ledgerFor(first.event, second.event).players.filter(row => row.name === 'HOME_SS');
  assert.equal(rows.length, 2);
});
test('DH copy of the pitcher does not duplicate a defensive identity', () => {
  const { event } = fixture(); const snapshot = event.defensiveSnapshot;
  snapshot.lineup[9] = { ...snapshot.lineup[0], pos: 'DH' };
  assert.ok(resolveDefender(snapshot, '1').player);
});
test('errors belong to the player at the captured defensive position', () => {
  const { event } = fixture('ERROR', { kind: 'error' }); assert.equal(rowFor(ledgerFor(event), 'HOME_SS').stats.errors, 1);
});
test('passed ball belongs to the captured catcher', () => {
  const { event } = fixture('PB', { kind: 'pb' }); assert.equal(rowFor(ledgerFor(event), 'HOME_C').stats.pb, 1);
});
test('exact duplicate source events are idempotent', () => {
  const { event } = fixture(); assert.deepEqual(ledgerFor(event, clone(event)), ledgerFor(event));
});
test('duplicate play ID under different event IDs counts once', () => {
  const { event } = fixture(); const other = { ...clone(event), eventId: 'OTHER_EVENT' };
  assert.equal(ledgerFor(event, other).totals.assists, 1);
});
test('manual source overrides a lower-priority roster snapshot', () => {
  const { event } = fixture(); const manual = clone(event); manual.source.kind = 'manual'; manual.defensiveSnapshot.lineup[5].name = 'MANUAL_DEFENDER';
  const ledger = ledgerFor(event, manual); assert.equal(rowFor(ledger, 'MANUAL_DEFENDER').stats.assists, 1); assert.equal(rowFor(ledger, 'HOME_SS'), undefined);
});
test('equal-priority conflicting snapshots are not silently selected', () => {
  const { event } = fixture(); const other = clone(event); other.defensiveSnapshot.lineup[5].name = 'CONFLICT';
  assert.equal(ledgerFor(event, other).players.length, 0); assert.equal(ledgerFor(other, event).players.length, 0);
});
for (const differentId of [false, true]) {
  for (const invalid of [false, true]) {
    test(`no lower-priority fallback: different event ID=${differentId}, invalid=${invalid}`, () => {
      const { event } = fixture(); const manual = clone(event); manual.source.kind = 'manual';
      if (differentId) manual.eventId = 'MANUAL_EVENT';
      if (invalid) manual.compositePlay.runs = 99; else manual.manualResolve = { required: true };
      const ledger = ledgerFor(event, manual); assert.equal(ledger.players.length, 0); assert.ok(ledger.issues.length);
    });
  }
}
test('foreign-match records are never attributed to the active match', () => {
  const { event } = fixture(); assert.equal(buildDefensiveFieldingLedger([event], 'OTHER').players.length, 0);
});
test('no active match returns an empty ledger', () => {
  const { event } = fixture(); assert.equal(buildDefensiveFieldingLedger([event], null).compositeEvents, 0);
});
test('all fielding metrics including DP/TP are projected without inferring new credits', () => {
  const { event, record } = fixture(); const copy = clone(record);
  copy.fielding['6'] = { putouts: 1, assists: 2, errors: 1, pb: 0, dp: 1, tp: 0 };
  const credit = projectDefensiveCredits(copy, event).find(item => item.position === '6');
  assert.deepEqual(credit.stats, copy.fielding['6']);
});
test('unconfirmed multi-out participation is explicit', () => {
  const { event, record } = fixture(); const copy = clone(record); copy.outsAdded = 2;
  assert.ok(projectDefensiveCredits(copy, event).every(credit => credit.multiOutUnconfirmed));
});
test('assigned and unassigned metrics conserve all canonical position totals', () => {
  const events = [];
  for (let i = 0; i < 40; i++) {
    const lineup = fieldingLineup(); if (i % 3 === 0) lineup[5].number = '';
    events.push(fixture(`SEQUENCE-${i}`, { lineup, kind: i % 4 === 0 ? 'error' : 'ground' }).event);
  }
  const original = clone(events); const ledger = ledgerFor(...events);
  for (const stat of DEFENSIVE_STATS) assert.equal(ledger.assigned[stat] + ledger.unassigned[stat], ledger.totals[stat]);
  assert.deepEqual(events, original);
  assert.equal(ledgerFor(...events.slice().reverse()).totals.assists, ledger.totals.assists);
});

test('production event normalization preserves a captured defensive roster', () => {
  const { event } = fixture(); const normalized = normalizeEvents(clone([event]), { inning: 1, half: 'top' });
  assert.deepEqual(normalized[0].defensiveSnapshot, event.defensiveSnapshot);
  assert.deepEqual(ledgerFor(...normalized), ledgerFor(event));
});
test('production normalization never manufactures a historical snapshot', () => {
  const { event } = fixture(); delete event.defensiveSnapshot;
  const normalized = normalizeEvents([event], { inning: 1, half: 'top' });
  assert.equal(Object.hasOwn(normalized[0], 'defensiveSnapshot'), false);
});
test('malformed snapshot evidence survives normalization but is not attributed', () => {
  const { event } = fixture(); event.defensiveSnapshot.lineup = 'INVALID';
  const normalized = normalizeEvents([event], { inning: 1, half: 'top' });
  assert.equal(normalized[0].defensiveSnapshot.lineup, 'INVALID');
  assert.equal(ledgerFor(...normalized).players.length, 0);
});
for (const invalid of [true, false]) {
  test(`production reload preserves manual authority without fallback: invalid=${invalid}`, () => {
    const { event } = fixture(); const manual = clone(event);
    manual.eventId = 'MANUAL_ALIAS'; manual.source.kind = 'manual';
    if (invalid) manual.compositePlay.runs = 99; else manual.manualResolve = { required: true };
    const normalized = normalizeEvents([event, manual], { inning: 1, half: 'top' });
    const ledger = ledgerFor(...normalized); assert.equal(ledger.players.length, 0); assert.ok(ledger.issues.length);
  });
}

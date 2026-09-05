import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCorrectionChanges, selectedCorrectionValue } from '../src/features/sync/gameCorrectionEditor.ts';

const fixture = () => ({
  schemaVersion: 1, sourceGameId: 'up-game', providerGameId: '11111', status: 'AVAILABLE',
  teams: [{
    teamName: '테스트 팀',
    innings: [{ inning: 1, runs: 0, notPlayed: false }, { inning: 2, runs: null, notPlayed: true }, { inning: 3, runs: null, notPlayed: false }],
    totals: { runs: 12, hits: 3, errors: 0, walks: null },
    batters: [{ rowKey: 'b-1', stats: { atBats: 4, hits: 1, runs: 0, rbi: null, stolenBases: 0, battingAverage: 0.25, seasonBattingAverage: 0.5 } }],
    pitchers: [{ rowKey: 'p-1', stats: { outs: 5, inningsPitched: '1.2', hitsAllowed: 1, runsAllowed: 0, earnedRuns: 0, walksAndHitByPitch: null, strikeouts: 1, era: 0 } }],
  }],
});
const select = (section, field, extra = {}) => ({ teamName: '테스트 팀', section, field, ...extra });

test('reads exact target values without turning missing values into zero', () => {
  const detail = fixture();
  assert.equal(selectedCorrectionValue(detail, select('totals', 'walks')), null);
  assert.equal(selectedCorrectionValue(detail, select('batters', 'runs', { rowKey: 'b-1' })), 0);
});

test('batter correction retains compare-and-set expected value and does not mutate original', () => {
  const detail = fixture(), original = structuredClone(detail);
  assert.deepEqual(buildCorrectionChanges(detail, select('batters', 'rbi', { rowKey: 'b-1' }), ' 0 '), [{
    ...select('batters', 'rbi', { rowKey: 'b-1' }), expectedValue: null, value: 0,
  }]);
  assert.deepEqual(detail, original);
});

test('blank removes a number to null, not zero', () => {
  const changes = buildCorrectionChanges(fixture(), select('batters', 'runs', { rowKey: 'b-1' }), ' ');
  assert.equal(changes[0].expectedValue, 0);
  assert.equal(changes[0].value, null);
});

test('entering an inning zero clears X with an atomic paired change', () => {
  assert.deepEqual(buildCorrectionChanges(fixture(), select('innings', 'runs', { inning: 2 }), '0'), [
    { ...select('innings', 'runs', { inning: 2 }), expectedValue: null, value: 0 },
    { ...select('innings', 'notPlayed', { inning: 2 }), expectedValue: true, value: false },
  ]);
});

test('marking X clears inning runs, but clearing a number does not invent X', () => {
  assert.deepEqual(buildCorrectionChanges(fixture(), select('innings', 'notPlayed', { inning: 1 }), 'true'), [
    { ...select('innings', 'notPlayed', { inning: 1 }), expectedValue: false, value: true },
    { ...select('innings', 'runs', { inning: 1 }), expectedValue: 0, value: null },
  ]);
  assert.deepEqual(buildCorrectionChanges(fixture(), select('innings', 'runs', { inning: 1 }), ''), [
    { ...select('innings', 'runs', { inning: 1 }), expectedValue: 0, value: null },
  ]);
});

test('clearing X preserves an unknown inning score and requires a boolean choice', () => {
  assert.deepEqual(buildCorrectionChanges(fixture(), select('innings', 'notPlayed', { inning: 2 }), 'false'), [
    { ...select('innings', 'notPlayed', { inning: 2 }), expectedValue: true, value: false },
  ]);
  for (const input of ['', 'X', '0', 'True']) {
    assert.throws(() => buildCorrectionChanges(fixture(), select('innings', 'notPlayed', { inning: 2 }), input));
  }
});

test('pitching innings use base-three outs as a paired update', () => {
  const selection = select('pitchers', 'inningsPitched', { rowKey: 'p-1' });
  assert.deepEqual(buildCorrectionChanges(fixture(), selection, '2.1'), [
    { ...selection, expectedValue: '1.2', value: '2.1' },
    { ...selection, field: 'outs', expectedValue: 5, value: 7 },
  ]);
  assert.equal(buildCorrectionChanges(fixture(), selection, '0')[1].value, 0);
  assert.deepEqual(buildCorrectionChanges(fixture(), selection, '').map(change => change.value), [null, null]);
});

test('invalid decimal innings are never treated as a decimal quantity', () => {
  for (const input of ['1.3', '1.10', '0.9', '-1', '1e2', 'NaN', 'Infinity', '100.1', '1 2']) {
    assert.throws(() => buildCorrectionChanges(fixture(), select('pitchers', 'inningsPitched', { rowKey: 'p-1' }), input), input);
  }
});

test('averages and ERA accept decimals but counting stats remain integers', () => {
  assert.equal(buildCorrectionChanges(fixture(), select('batters', 'battingAverage', { rowKey: 'b-1' }), '.333')[0].value, 0.333);
  assert.equal(buildCorrectionChanges(fixture(), select('pitchers', 'era', { rowKey: 'p-1' }), '4.20')[0].value, 4.2);
  assert.throws(() => buildCorrectionChanges(fixture(), select('batters', 'hits', { rowKey: 'b-1' }), '1.5'));
  assert.throws(() => buildCorrectionChanges(fixture(), select('batters', 'battingAverage', { rowKey: 'b-1' }), '1.001'));
});

test('negative, nonfinite, exponent, arbitrary text and out-of-range values are rejected', () => {
  for (const input of ['-1', '+1', 'Infinity', 'NaN', '1e2', '1000', '1,000', 'abc', '0x10']) {
    assert.throws(() => buildCorrectionChanges(fixture(), select('totals', 'hits'), input), input);
  }
});

test('final scores, season averages, identities and raw outs are not editable', () => {
  for (const selection of [
    select('totals', 'runs'),
    select('batters', 'seasonBattingAverage', { rowKey: 'b-1' }),
    select('batters', 'playerName', { rowKey: 'b-1' }),
    select('pitchers', 'outs', { rowKey: 'p-1' }),
    select('unknown', 'runs'),
  ]) assert.throws(() => buildCorrectionChanges(fixture(), selection, '1'));
});

test('missing team, row and inning targets fail instead of creating data', () => {
  for (const selection of [
    { ...select('totals', 'hits'), teamName: 'unknown' },
    select('batters', 'runs', { rowKey: 'missing' }),
    select('innings', 'runs', { inning: 9 }),
  ]) assert.throws(() => buildCorrectionChanges(fixture(), selection, '1'));
});

test('unchanged numbers, null, X and coherent innings produce no changes', () => {
  for (const [selection, input] of [
    [select('totals', 'errors'), '0'],
    [select('totals', 'walks'), ''],
    [select('innings', 'notPlayed', { inning: 2 }), 'true'],
    [select('innings', 'runs', { inning: 3 }), ''],
    [select('pitchers', 'inningsPitched', { rowKey: 'p-1' }), '1.2'],
  ]) assert.deepEqual(buildCorrectionChanges(fixture(), selection, input), []);
});

test('unchanged IP text still repairs an inconsistent paired outs field explicitly', () => {
  const detail = fixture();
  detail.teams[0].pitchers[0].stats.outs = 4;
  const changes = buildCorrectionChanges(detail, select('pitchers', 'inningsPitched', { rowKey: 'p-1' }), '1.2');
  assert.deepEqual(changes, [{ ...select('pitchers', 'outs', { rowKey: 'p-1' }), expectedValue: 4, value: 5 }]);
});

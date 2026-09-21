import assert from 'node:assert/strict';
import test from 'node:test';
import { standingFromRow } from '../src/adapter.mjs';
import { toNumber } from '../src/normalization.mjs';

const rows = [
  { fixed: ['1', 'Team A'], values: ['8', '0.83', '5', '1', '2', '17', '0.00'] },
  { fixed: ['1', 'Team B'], values: ['7', '0.83', '5', '1', '1', '16', '0.00'] },
  { fixed: ['3', 'Team C'], values: ['6', '0.60', '3', '2', '1', '10', '1.50'] },
  { fixed: ['4', 'Team D'], values: ['6', '0.17', '1', '5', '0', '3', '4.00'] },
  { fixed: ['5', 'Team E'], values: ['7', '0.14', '1', '6', '0', '3', '4.50'] },
];

test('numeric normalization preserves the observed A-group ranks', () => {
  assert.deepEqual(rows.map(row => toNumber(row.fixed[0], { allowNull: false })), [1, 1, 3, 4, 5]);
});

test('real standing row conversion preserves the observed A-group ranks', () => {
  assert.deepEqual(rows.map(standingFromRow).map(row => row.rank), ['1', '1', '3', '4', '5']);
});

test('real standing row conversion preserves independent win-loss-draw values', () => {
  assert.deepEqual(rows.map(standingFromRow).map(({ wins, losses, draws }) => [wins, losses, draws]), [
    ['5', '1', '2'], ['5', '1', '1'], ['3', '2', '1'], ['1', '5', '0'], ['1', '6', '0'],
  ]);
});

test('real standing row conversion does not repair an invalid all-first snapshot', () => {
  const invalid = rows.map(row => ({ ...row, fixed: ['1', row.fixed[1]] }));
  assert.deepEqual(invalid.map(standingFromRow).map(row => row.rank), ['1', '1', '1', '1', '1']);
});

test('real standing row conversion does not mutate the extracted source rows', () => {
  const source = structuredClone(rows);
  source.forEach(row => { Object.freeze(row.fixed); Object.freeze(row.values); Object.freeze(row); });
  source.map(standingFromRow);
  assert.deepEqual(source, rows);
});

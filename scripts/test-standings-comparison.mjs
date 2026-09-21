import test from 'node:test';
import assert from 'node:assert/strict';
import { compareStandings } from '../src/features/sync/standingsComparison.ts';

const row = (teamName, rank, localTeamId, extra = {}) => ({ teamName, rank, localTeamId, wins: 3, losses: 1, draws: 0, ...extra });
test('team ID joins renamed teams without changing source order/ranks', () => {
  const result = compareStandings([row('LAE', 1, '31')], [row('L.A.E', 3, '31')]);
  assert.equal(result.entries.length, 1); assert.equal(result.entries[0].source.rank, 3);
  assert.equal(result.entries[0].before.teamName, 'LAE'); assert.equal(result.ambiguous, false);
});
test('all-first baseline compares with tied 1,1,3,4,5 without inventing tie breaks', () => {
  const result = compareStandings([1,2,3,4,5].map(id => row(`T${id}`,1,String(id))), [1,1,3,4,5].map((rank,index) => row(`T${index+1}`,rank,String(index+1))));
  assert.deepEqual(result.entries.map(entry => entry.source.rank), [1,1,3,4,5]);
});
test('same name with different IDs never merges', () => assert.equal(compareStandings([row('same',1,'1')],[row('same',2,'2')]).entries.length,2));
test('duplicate IDs retain all rows without arbitrary pairing', () => {
  const result = compareStandings([row('a',1,'1'),row('b',2,'1')],[row('c',3,'1')]);
  assert.equal(result.ambiguous,true); assert.equal(result.entries.length,3);
  assert.ok(result.entries.every(entry => !entry.before || !entry.source));
});
test('legacy exact names can match without IDs', () => assert.equal(compareStandings([row('Team A',1)],[row('team a',2)]).entries.length,1));
test('similar names without IDs do not fuzzy match', () => assert.equal(compareStandings([row('LAE',1)],[row('L.A.E',2)]).entries.length,2));
test('one-sided ID does not infer identity', () => assert.equal(compareStandings([row('same',1)],[row('same',2,'1')]).entries.length,2));
test('missing arrays are not an unchanged empty group', () => {
  const result = compareStandings(undefined,undefined); assert.equal(result.beforeAvailable,false); assert.equal(result.sourceAvailable,false);
});
test('known empty baseline remains distinct from missing', () => assert.equal(compareStandings([],[]).beforeAvailable,true));
test('invalid rank and absent scores are not zero', () => {
  const result = compareStandings([], [row('a','1','1',{wins:null})]);
  assert.equal(result.invalid,true); assert.equal(result.entries[0].source.rank,null); assert.equal(result.entries[0].source.wins,null);
});
test('invalid rows are retained for review', () => assert.equal(compareStandings([], [null,{}]).entries.length,2));
test('input snapshots remain immutable', () => {
  const before=Object.freeze([Object.freeze(row('a',1,'1'))]); const source=Object.freeze([Object.freeze(row('b',2,'1'))]);
  compareStandings(before,source); assert.equal(before[0].teamName,'a'); assert.equal(source[0].rank,2);
});

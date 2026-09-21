import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeGroupPlayoffScenarios } from '../src/features/front/components/season2026/qualificationScenarios.ts';
import { qualificationOdds, formatCaseShare } from '../src/features/front/components/season2026/qualificationOdds.ts';
import { projectionStatus } from '../src/features/front/components/season2026/projectionStatus.ts';
const teams = Array.from({ length: 5 }, (_, i) => ({ teamId: i + 1, teamName: `T${i + 1}`, wins: [8, 6, 4, 0, 0][i], losses: [0, 2, 4, 6, 6][i], ties: 0 }));
const games = [0, 1].map(i => ({ id: `m${i}`, homeTeamName: 'T4', awayTeamName: 'T5', status: 'scheduled', startTime: '', venue: '' }));
const analyze = (options = {}) => analyzeGroupPlayoffScenarios(teams, games, { includeDrawsInProjection: true, ...options });
const row = (p, qualification = 'out') => ({ teamId: p.teamId, teamName: `T${p.teamId}`, qualification, projection: p });
test('multinomial weights give 3 resolved wins, 3 resolved losses and 3 unresolved outcomes out of 9', () => {
  const p = analyze().projections[3], d = p.distribution;
  assert.equal(p.evaluatedStates, 6);
  assert.deepEqual(d, { model: 'equal-win-loss-draw', totalCases: '9', countedCases: '9', unresolvedCases: '3', buckets: [
    { bucket: 'eutteum', guaranteedCases: '0', possibleCases: '0' },
    { bucket: 'beogeum', guaranteedCases: '3', possibleCases: '6' },
    { bucket: 'out', guaranteedCases: '3', possibleCases: '6' },
  ] });
  const odds = qualificationOdds(row(p));
  assert.equal(odds.available, true);
  assert.deepEqual(odds.values.map(v => v.label), ['0%', '33.3~66.7%', '33.3~66.7%']);
  assert.equal(odds.confirmed, null);
});
test('all outcomes in one bucket mark it confirmed without relying on displayed rounding', () => {
  const r = analyze();
  for (const [i, bucket] of [[0, 'eutteum'], [1, 'eutteum'], [2, 'beogeum']]) {
    const odds = qualificationOdds(row(r.projections[i]));
    assert.equal(odds.confirmed, bucket);
    assert.equal(odds.values.find(v => v.bucket === bucket).label, '100%');
    assert.equal(odds.hasUnresolved, false);
  }
});
test('a tie inside ranks 1/2 keeps eutteum 100% despite unknown individual ranks', () => {
  const r = analyzeGroupPlayoffScenarios(teams.slice(0, 2).map(t => ({ ...t, wins: 0, losses: 0 })), [], { includeDrawsInProjection: true });
  assert.deepEqual(r.projections[0].possibleRanks, [1, 2]);
  assert.equal(qualificationOdds(row(r.projections[0])).confirmed, 'eutteum');
  assert.equal(r.projections[0].distribution.unresolvedCases, '0');
});
test('no-draw model uses 1/2 per result with 25..75% bounds, not equal compressed-state weights', () => {
  const p = analyze({ includeDrawsInProjection: false }).projections[3], odds = qualificationOdds(row(p));
  assert.equal(p.distribution.totalCases, '4');
  assert.equal(odds.values[1].label, '25~75%');
  assert.match(odds.assumption, /1\/2/);
});
test('partial DFS output never publishes percentages even if all seen states agree', () => {
  for (const p of analyze({ maxScenarios: 1 }).projections) assert.equal(qualificationOdds(row(p)).available, false);
});
test('no projection and legacy projection without counts remain unavailable', () => {
  assert.equal(qualificationOdds({ qualification: 'out' }).available, false);
  const p = structuredClone(analyze().projections[0]); delete p.distribution;
  assert.equal(qualificationOdds(row(p)).available, false);
});
test('very small and large nonzero probabilities never round to misleading 0 or 100', () => {
  assert.equal(formatCaseShare(1n, 1n, 100000n), '<0.1%');
  assert.equal(formatCaseShare(99999n, 99999n, 100000n), '>99.9%');
  assert.equal(formatCaseShare(1n, 1n, 3n), '33.3%');
  assert.equal(formatCaseShare(0n, 0n, 3n), '0%');
  assert.equal(formatCaseShare(3n, 3n, 3n), '100%');
  assert.equal(formatCaseShare(1n, 2n, 0n), '-');
});
test('inconsistent totals, duplicate buckets, malformed counts and partial counts fail closed', () => {
  for (const alter of [
    d => { d.countedCases = '8'; }, d => { d.unresolvedCases = '2'; },
    d => { d.buckets[1].bucket = 'eutteum'; }, d => { d.buckets[1].guaranteedCases = 'oops'; },
    d => { d.buckets[1].possibleCases = '10'; },
  ]) {
    const p = structuredClone(analyze().projections[3]); alter(p.distribution);
    assert.equal(qualificationOdds(row(p)).available, false);
  }
});
test('official confirmation overrides contradictory or unfinished calculations', () => {
  const r = row(analyze({ maxScenarios: 1 }).projections[0], 'confirmed-beogeum');
  assert.equal(qualificationOdds(r).official, 'beogeum');
  assert.equal(qualificationOdds(r).available, false);
  assert.equal(projectionStatus(r).label, '버금권 확정');
  const conflict = row(analyze().projections[0], 'confirmed-out');
  assert.equal(qualificationOdds(conflict).available, false);
});
test('every team conserves weighted resolved and unresolved mass and serializes counts', () => {
  const r = analyze();
  for (const p of r.projections) {
    const d = p.distribution;
    assert.equal(d.buckets.reduce((sum, b) => sum + BigInt(b.guaranteedCases), 0n) + BigInt(d.unresolvedCases), BigInt(d.countedCases));
    assert.ok(d.buckets.every(b => BigInt(b.possibleCases) >= BigInt(b.guaranteedCases) && BigInt(b.possibleCases) <= BigInt(d.countedCases)));
  }
  assert.doesNotThrow(() => JSON.stringify(r));
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildRemainingMatchups } from '../src/features/front/components/season2026/remainingMatchups.ts';
import { analyzeGroupPlayoffScenarios } from '../src/features/front/components/season2026/qualificationScenarios.ts';
const teams = (n = 3) => Array.from({ length: n }, (_, i) => ({ teamId: i + 1, teamName: String.fromCharCode(65 + i), wins: 0, losses: 0, ties: 0 }));
const match = (extra = {}) => ({ id: 'm1', homeTeamName: 'A', awayTeamName: 'B', startTime: '2026-09-01', venue: '', status: 'scheduled', ...extra });
const analyze = (t, schedule, options = {}) => analyzeGroupPlayoffScenarios(t, schedule.fixtures, { includeDrawsInProjection: true, ...options });
test('3 teams: 6 games, 4 per team, all 729 W/L/T paths without registered dates', () => {
  const t = teams(), result = buildRemainingMatchups(t, [], 'C');
  assert.deepEqual(result.warnings, []);
  assert.equal(result.fixtures.length, 6);
  for (const team of t) assert.equal(result.fixtures.filter(m => [m.homeTeamName, m.awayTeamName].includes(team.teamName)).length, 4);
  const projection = analyze(t, result);
  assert.equal(projection.totalScenarios, '729');
  assert.deepEqual(projection.projections.map(p => p.teamId), [1, 2, 3]);
  assert.ok(projection.projections.every(p => p.minPossibleRank === 1 && p.maxPossibleRank === 3));
});
test('one played game is subtracted; remaining 5 games give 243 paths', () => {
  const t = teams(); t[0].wins = 1; t[1].losses = 1;
  const result = buildRemainingMatchups(t, [match({ status: 'completed', homeScore: 3, awayScore: 2 })], 'B');
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(result.matchups[0], { teamA: 'A', teamB: 'B', completed: 1, scheduled: 0, unscheduled: 1, remaining: 1 });
  assert.equal(analyze(t, result).totalScenarios, '243');
});
test('scheduled fixture occupies an existing slot and remains in outcome branching', () => {
  const result = buildRemainingMatchups(teams(2), [match()], 'H');
  assert.equal(result.fixtures.length, 2);
  assert.equal(result.matchups[0].unscheduled, 1);
  assert.equal(analyze(teams(2), result).totalScenarios, '9');
});
test('reverse home/away and team ordering do not create extra games', () => {
  const result = buildRemainingMatchups(teams(2).reverse(), [match(), match({ id: 'm2', homeTeamName: 'B', awayTeamName: 'A' })], 'H');
  assert.equal(result.fixtures.length, 2);
  assert.equal(result.matchups[0].unscheduled, 0);
});
test('completed pair leaves zero games even without a future schedule', () => {
  const t = teams(2); t[0].wins = 2; t[1].losses = 2;
  const result = buildRemainingMatchups(t, [match({ status: 'completed', homeScore: 1, awayScore: 0 }), match({ id: 'm2', status: 'completed', homeScore: 2, awayScore: 0 })], 'A');
  assert.deepEqual(result.warnings, []);
  assert.equal(result.matchups[0].remaining, 0);
  assert.equal(analyze(t, result).totalScenarios, '1');
});
test('canceled, deleted, practice, inactive, different group/year fixtures do not occupy slots', () => {
  for (const extra of [{ status: 'canceled' }, { deleted: true }, { recordMode: 'practice' }, { sourceActive: false }, { groupCode: 'B' }, { startTime: '2025-09-01' }]) {
    const result = buildRemainingMatchups(teams(2), [match(extra)], 'A');
    assert.equal(result.matchups[0].unscheduled, 2);
  }
});
test('third fixture and duplicate source identity are reported, never silently accepted', () => {
  assert.ok(buildRemainingMatchups(teams(2), [match(), match({ id: 'm2' }), match({ id: 'm3' })], 'A').warnings.some(w => w.includes('초과')));
  assert.ok(buildRemainingMatchups(teams(2), [match(), match()], 'A').warnings.some(w => w.includes('중복')));
});
test('missing played matchup data and missing scores block trustworthy calculation', () => {
  const t = teams(2); t[0].wins = 1; t[1].losses = 1;
  assert.equal(buildRemainingMatchups(t, [], 'A').warnings.length, 2);
  assert.ok(buildRemainingMatchups(teams(2), [match({ status: 'completed' })], 'A').warnings.some(w => w.includes('점수 누락')));
});
test('synthetic IDs are stable, group-specific, and inputs remain unchanged', () => {
  const t = teams(), m = [match()], before = JSON.stringify({ t, m });
  const a = buildRemainingMatchups(t, m, 'A'), b = buildRemainingMatchups(t, m, 'B');
  assert.deepEqual(a, buildRemainingMatchups(t, m, 'A'));
  assert.notEqual(a.fixtures[1].id, b.fixtures[1].id);
  assert.equal(JSON.stringify({ t, m }), before);
});
test('future head-to-head result breaks equal overall records', () => {
  const t = teams(2); t[0].losses = 1; t[1].wins = 1;
  const result = analyzeGroupPlayoffScenarios(t, [match()], { maxScenarios: 1 });
  assert.equal(result.projections.find(p => p.teamId === 1).minPossibleRank, 1);
  assert.equal(result.projections.find(p => p.teamId === 1).maxPossibleRank, 1);
  assert.equal(result.exhausted, true);
  assert.ok(result.projections.every(p => !p.tieBreakNotes.some(n => n.includes('구간 고정'))));
});
test('future draw with equal peer differential requires deciding game, ignoring current group run totals', () => {
  const t = teams(2).map((t, i) => ({ ...t, runsFor: i ? 0 : 100, runsAgainst: 0 }));
  const result = analyzeGroupPlayoffScenarios(t, [match()], { includeDrawsInProjection: true });
  assert.ok(result.projections.every(p => p.tieBreakNotes.includes('결정경기 필요')));
  assert.ok(result.projections.every(p => p.minPossibleRank === 1 && p.maxPossibleRank === 2));
});

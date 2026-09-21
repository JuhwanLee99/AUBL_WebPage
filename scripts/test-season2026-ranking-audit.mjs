import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeGroupPlayoffScenarios as analyze } from '../src/features/front/components/season2026/qualificationScenarios.ts';
import { projectionStatus } from '../src/features/front/components/season2026/projectionStatus.ts';
const team = (teamId, wins = 0, losses = 0, ties = 0, runsFor = 0, runsAgainst = 0) => ({ teamId, teamName: `T${teamId}`, wins, losses, ties, runsFor, runsAgainst });
const game = (id, a, b, h, v) => ({ id, homeTeamName: `T${a}`, awayTeamName: `T${b}`, status: h == null ? 'scheduled' : 'completed', homeScore: h, awayScore: v, startTime: '2026-09-01', venue: '' });
const result = (teams, matches, extra = {}) => analyze(teams, matches, { includeDrawsInProjection: true, ...extra });
const ranks = r => r.projections.map(p => p.possibleRanks);

test('equal win percentage with different W/L/T still uses head-to-head', () => {
  const r = result([team(1, 2, 2, 4), team(2, 4, 4)], [game('a', 1, 2, 3, 0), game('b', 2, 1, 1, 0)]);
  assert.deepEqual(ranks(r), [[1], [2]]);
});
test('two-team tie uses peer run difference instead of whole-group totals', () => {
  const r = result([team(1, 1, 1, 0, 100, 10), team(2, 1, 1, 0, 10, 100)], [game('a', 1, 2, 1, 0), game('b', 2, 1, 10, 0)]);
  assert.deepEqual(ranks(r), [[2], [1]]);
});
test('two-team peer tie requires deciding game, not group run totals', () => {
  const r = result([team(1, 1, 1, 0, 100, 1), team(2, 1, 1, 0, 1, 100)], [game('a', 1, 2, 1, 0), game('b', 2, 1, 1, 0)]);
  assert.deepEqual(ranks(r), [[1, 2], [1, 2]]);
  assert.ok(r.projections.every(p => p.rankCases.every(c => c.conditional && c.reasons.includes('결정경기 필요'))));
});
test('three-team circular H2H resolves peer runs before whole-group statistics', () => {
  const r = result([team(1, 1, 1, 0, 5, 3), team(2, 1, 1, 0, 2, 5), team(3, 1, 1, 0, 3, 2)], [game('a', 1, 2, 5, 0), game('b', 2, 3, 2, 0), game('c', 3, 1, 3, 0)]);
  assert.deepEqual(ranks(r), [[1], [3], [2]]);
});
test('four-plus tied teams are unresolved instead of using an invented tiebreak', () => {
  const r = result([team(1), team(2), team(3), team(4)], []);
  assert.ok(r.projections.every(p => p.possibleRanks.length === 4 && p.rankCases.every(c => c.conditional)));
});
test('draws excluded from win-rate denominator and exact ratios stay distinct', () => {
  assert.deepEqual(ranks(result([team(1, 1, 0, 7), team(2, 7, 1)], [])), [[1], [2]]);
  assert.deepEqual(ranks(result([team(1, 1, 2), team(2, 333333, 666667)], [])), [[1], [2]]);
});
test('two remaining games compress 9 paths to 6 states, or 4 to 3 without draws', () => {
  const matches = [game('a', 1, 2), game('b', 2, 1)];
  const a = result([team(1), team(2)], matches), b = result([team(1), team(2)], matches, { includeDrawsInProjection: false });
  assert.deepEqual([a.totalScenarios, a.expectedScenarios, a.evaluatedStates, a.exhausted], ['9', '9', 6, false]);
  assert.deepEqual([b.totalScenarios, b.expectedScenarios, b.evaluatedStates, b.exhausted], ['4', '4', 3, false]);
});
test('finishing exactly at the cap is complete; one fewer state is partial', () => {
  const games = [game('a', 1, 2), game('b', 2, 1)];
  assert.equal(result([team(1), team(2)], games, { maxScenarios: 6 }).exhausted, false);
  const r = result([team(1), team(2)], games, { maxScenarios: 5 });
  assert.equal(r.exhausted, true);
  assert.ok(r.projections.every(p => projectionStatus({ projection: p }).kind === 'partial'));
});
test('pending score tiebreaks are conditional, not concrete rank witnesses', () => {
  const r = result([team(1, 1, 0), team(2, 0, 1)], [game('a', 1, 2, 3, 0), game('b', 1, 2)]);
  assert.equal(r.projections[0].rankCases.find(c => c.rank === 2).conditional, true);
});
test('bad counters, repeated IDs and fractional final scores block the engine', () => {
  for (const r of [result([team(1, -1), team(2)], []), result([team(1), team(1)], []), result([team(1), team(2)], [game('a', 1, 2), game('a', 1, 2)]), result([team(1), team(2)], [game('a', 1, 2, .5, 1)])]) {
    assert.equal(r.projections.length, 0); assert.ok(r.warnings.length);
  }
});
function season(pendingGames) {
  const teams = Array.from({ length: 5 }, (_, i) => team(i + 1)), matches = [];
  for (let a = 1; a <= 5; a++) for (let b = a + 1; b <= 5; b++) for (let leg = 0; leg < 2; leg++) matches.push(game(`${a}-${b}-${leg}`, a, b, 3, 1));
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    if (i >= matches.length - pendingGames) { m.status = 'scheduled'; delete m.homeScore; delete m.awayScore; continue; }
    const a = teams.find(t => t.teamName === m.homeTeamName), b = teams.find(t => t.teamName === m.awayTeamName);
    a.wins++; b.losses++; a.runsFor += 3; a.runsAgainst++; b.runsFor++; b.runsAgainst += 3;
  }
  return { teams, matches };
}
test('five-team 20-game season fixes ranks 1/2/3 while ranks 4/5 can swap', () => {
  const s = season(2), r = result(s.teams, s.matches);
  assert.deepEqual(ranks(r), [[1], [2], [3], [4, 5], [4, 5]]);
  assert.equal(projectionStatus({ projection: r.projections[0] }).kind, 'rank-fixed');
  assert.equal(projectionStatus({ projection: r.projections[3] }).kind, 'open');
});
test('rank-fixed and bucket-fixed are separate from official finalization', () => {
  const r = result([team(1, 1, 1), team(2, 1, 1)], [game('a', 1, 2, 1, 0), game('b', 2, 1, 1, 0)]);
  assert.equal(projectionStatus({ projection: r.projections[0] }).kind, 'bucket-fixed');
  assert.equal(projectionStatus({}).kind, 'unavailable');
});
test('full season count conservation, home/away invariance and input immutability for 0..6 pending games', () => {
  for (let n = 0; n <= 6; n++) {
    const s = season(n), before = JSON.stringify(s), r = result(s.teams, s.matches);
    assert.equal(r.totalScenarios, String(3 ** n));
    assert.equal(r.expectedScenarios, String(3 ** n));
    assert.equal(r.exhausted, false);
    assert.equal(JSON.stringify(s), before);
    const reversed = s.matches.map(m => ({ ...m, homeTeamName: m.awayTeamName, awayTeamName: m.homeTeamName, homeScore: m.awayScore, awayScore: m.homeScore })).reverse();
    assert.deepEqual(ranks(result(s.teams, reversed)), ranks(r));
    for (const p of r.projections) for (const c of p.rankCases) {
      assert.equal(c.conditions.reduce((sum, x) => sum + x.wins + x.losses + x.ties, 0), n);
      assert.ok(c.rank >= 1 && c.rank <= 5);
    }
  }
});
test('representative non-tied witnesses replay to their claimed ranks with an independent win-rate oracle', () => {
  const s = season(4), r = result(s.teams, s.matches);
  for (const p of r.projections) for (const c of p.rankCases.filter(c => !c.conditional)) {
    const final = s.teams.map(t => ({ ...t }));
    for (const o of c.conditions) {
      const a = final.find(t => t.teamName === o.teamA), b = final.find(t => t.teamName === o.teamB);
      a.wins += o.wins; a.losses += o.losses; b.wins += o.losses; b.losses += o.wins;
    }
    const mine = final.find(t => t.teamId === p.teamId), rate = mine.wins / (mine.wins + mine.losses || 1);
    const greater = final.filter(t => t.wins / (t.wins + t.losses || 1) > rate).length;
    const equal = final.filter(t => t.wins / (t.wins + t.losses || 1) === rate).length;
    assert.ok(c.rank >= greater + 1 && c.rank <= greater + equal);
    if (equal === 1) assert.equal(c.rank, greater + 1);
  }
});
test('draw-only future paths preserve a known peer run difference', () => {
  // Both future draws leave H2H differential zero; a deciding game is required,
  // not an unknown-score warning, even though the draw score is unspecified.
  const r = result([team(1), team(2)], [game('a', 1, 2)], { maxScenarios: 3 });
  assert.ok(r.projections.every(p => p.tieBreakNotes.includes('결정경기 필요')));
});
test('all 20 unscheduled games keep 3^20 denominator when evaluation is bounded', () => {
  const s = season(20), r = result(s.teams, s.matches, { maxScenarios: 1000 });
  assert.equal(r.expectedScenarios, '3486784401');
  assert.equal(r.evaluatedStates, 1000);
  assert.equal(r.exhausted, true);
  assert.ok(BigInt(r.totalScenarios) < BigInt(r.expectedScenarios));
  assert.ok(r.projections.every(p => projectionStatus({ projection: p }).kind === 'partial'));
});
test('uncertain rank explanations name the actual deciding factor instead of generic conditional jargon', async () => {
  const { rankCaseExplanation } = await import('../src/features/front/components/season2026/projectionStatus.ts');
  assert.equal(rankCaseExplanation({ conditional: true, reasons: ['남은 경기의 득실점에 따라 동률 순위가 달라집니다.'] }).label, '득실점에 따라 결정');
  assert.equal(rankCaseExplanation({ conditional: true, reasons: ['결정경기 필요'] }).label, '결정경기 필요');
  assert.match(rankCaseExplanation({ conditional: true, reasons: ['4팀 이상 동률'] }).detail, /4팀 이상/);
});

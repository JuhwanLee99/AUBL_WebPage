import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
const compiled = await build({ entryPoints: ['src/features/front/components/season2026/homeData.ts'], bundle: true, write: false, platform: 'node', format: 'esm', plugins: [{ name: 'read-only-api-stub', setup(builder) {
  builder.onResolve({ filter: /^@core\/api\/backendClient$/ }, () => ({ path: 'api', namespace: 'stub' }));
  builder.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: ['getBatterRankings', 'getPitcherRankings', 'getSeasonPublicOverview', 'getSeasons', 'getTeamRecordStandings'].map(name => `export const ${name} = () => { throw new Error('No network in integration test'); };`).join('\n'), loader: 'js' }));
} }] });
const { buildSeason2026Groups } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const entries = Array.from({ length: 5 }, (_, i) => ({ name: `T${i + 1}`, group: 'A' }));
const standings = entries.map((e, i) => ({ teamId: i + 1, teamName: e.name, group: 'A', rank: i + 1, wins: 8 - i * 2, losses: i * 2, ties: 0, winPct: (8 - i * 2) / 8 }));
const matches = [];
for (let a = 1; a <= 5; a++) for (let b = a + 1; b <= 5; b++) for (let leg = 0; leg < 2; leg++) matches.push({ id: `${a}-${b}-${leg}`, homeTeamName: `T${a}`, awayTeamName: `T${b}`, status: 'completed', homeScore: 3, awayScore: 1, startTime: '2026-09-01', venue: '', groupCode: 'A' });
const group = (rows = standings, teams = entries, games = matches, options) => buildSeason2026Groups(rows, teams, games, options)[0];
test('complete 5-team group connects ranks, 20 games and condition metadata by team ID', () => {
  const g = group(); assert.equal(g.completedGames, 20); assert.equal(g.expectedGames, 20); assert.deepEqual(g.scenarioWarnings, []);
  assert.deepEqual(g.rows.map(r => r.projection.possibleRanks), [[1], [2], [3], [4], [5]]);
  assert.ok(g.rows.every(r => r.projection.rankCases.length === 1 && r.projection.expectedScenarios === '1'));
});
test('missing schedule results cannot be counted as additional future games', () => {
  const g = group(standings, entries, matches.slice(1));
  assert.ok(g.scenarioWarnings.length); assert.ok(g.rows.every(r => !r.projection));
});
test('five-team rule and unverified data gate projection publication', () => {
  assert.ok(group(standings.slice(0, 4), entries.slice(0, 4)).scenarioWarnings.some(w => w.includes('5팀')));
  assert.ok(group(standings, entries, matches, { projectionReady: false }).rows.every(r => !r.projection));
});
test('two unscheduled final games are recreated and winner/loser buckets reach the UI contract', () => {
  const t = standings.map(r => ({ ...r })); t[3].wins = 0; t[3].winPct = 0; t[4].losses = 6;
  const g = group(t, entries, matches.slice(0, -2));
  assert.deepEqual(g.scenarioWarnings, []);
  assert.equal(g.matchups.at(-1).unscheduled, 2);
  assert.equal(g.rows.find(r => r.teamId === 4).projection.scenarioCount, '9');
  assert.equal(g.rows.find(r => r.teamId === 4).projection.distribution.unresolvedCases, '3');
  assert.deepEqual(g.rows.find(r => r.teamId === 4).projection.possibleBuckets, ['beogeum', 'out']);
});

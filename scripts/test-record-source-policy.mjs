import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRecordSource, hasOfficialAuthority } from '../src/shared/lib/recordSourcePolicy.ts';
import { compareRecordSources, pitchingOuts } from '../src/features/sync/recordComparison.ts';
import { fixtures } from './e2e/record-sources/fixtures.mjs';

const matchId = 'LOCAL_TEST_SOURCE_POLICY';
test('SOURCE: only authoritative server absence allows provisional data', () => {
  assert.equal(parseRecordSource(null, matchId).status, 'live');
  for (const value of [undefined, false, 1, '', {}, []]) assert.equal(parseRecordSource(value, matchId).status, 'blocked');
});
test('SOURCE: valid published snapshot is official', () => {
  const { source } = fixtures(matchId);
  assert.equal(parseRecordSource(source, matchId).source, source);
});
const invalid = [
  ['schema version', row => { row.schemaVersion = 2; }],
  ['other match', row => { row.matchId = 'OTHER'; }],
  ['authority', row => { row.authority = 'AUBL_LIVE'; }],
  ['visibility', row => { row.liveVisibility = 'PUBLIC'; }],
  ['revision', row => { row.revision = ''; }],
  ['hash', row => { row.payloadHash = ''; }],
  ['provider', row => { row.official.provider = 'OTHER'; }],
  ['uncollected', row => { row.official.status = 'NOT_COLLECTED'; }],
  ['review required', row => { row.official.status = 'REVIEW_REQUIRED'; }],
  ['revision disagreement', row => { row.official.syncRevision = 'OTHER'; }],
  ['unpublished detail', row => { row.official.detail.status = 'NOT_PUBLISHED'; }],
  ['detail identity', row => { row.official.detail.sourceGameId = 'OTHER'; }],
  ['one team', row => { row.official.detail.teams.pop(); }],
  ['missing teams', row => { delete row.official.detail.teams; }],
  ['null teams', row => { row.official.detail.teams = null; }],
];
for (const [label, mutate] of invalid) test(`SOURCE: ${label} fails closed without throwing`, () => {
  const { source } = fixtures(matchId); mutate(source);
  assert.equal(parseRecordSource(source, matchId).status, 'blocked');
});
test('SOURCE: schedule metadata cannot be confused with record mode', () => {
  for (const row of [undefined, null, {}, { recordMode: 'official' }, { sourceProvider: 'UNIQUE_PLAY' }]) assert.equal(hasOfficialAuthority(row), false);
  assert.equal(hasOfficialAuthority({ recordAuthority: 'UNIQUE_PLAY' }), true);
});
for (const [input, expected] of [[0, 0], ['0.1', 1], ['0.2', 2], ['6.1', 19], ['6.2', 20], ['6.3', null], [null, null], [undefined, null], [-1, null], ['x', null], ['NaN', null]]) {
  test(`COMPARE: innings ${String(input)} -> ${String(expected)} outs`, () => assert.equal(pitchingOuts(input), expected));
}
test('COMPARE: saved raw score, team totals and player differences are preserved', () => {
  const { official, schedule, core } = fixtures();
  const before = JSON.stringify({ official, schedule, core });
  const rows = compareRecordSources(schedule, core, official);
  for (const key of ['away/runs', 'away/hits', 'away/inning/1', 'away/batters/b1/atBats', 'away/batters/b1/hits']) assert.equal(rows.find(row => row.key === key)?.status, 'mismatch', key);
  assert.equal(rows.find(row => row.key === 'away/pitchers/p1/outs')?.status, 'equal');
  assert.equal(JSON.stringify({ official, schedule, core }), before, 'Never mutate either original');
});
test('COMPARE: missing values are not zeros', () => {
  const { official, schedule, core } = fixtures(); delete schedule.postGame.batters.away[0].sb;
  const row = compareRecordSources(schedule, core, official).find(row => row.key.endsWith('/stolenBases'));
  assert.equal(row.live, null); assert.equal(row.official, 0); assert.equal(row.status, 'missing');
});
test('COMPARE: unplayed inning is not a zero inning', () => {
  const { official, schedule, core } = fixtures(); official.detail.teams[1].innings[0] = { inning: 1, runs: null, notPlayed: true };
  const row = compareRecordSources(schedule, core, official).find(row => row.key === 'home/inning/1');
  assert.equal(row.live, 0); assert.equal(row.official, 'X'); assert.equal(row.status, 'mismatch');
});
for (const mode of ['missing-number', 'duplicate-live', 'duplicate-source', 'team-mismatch']) test(`COMPARE: ${mode} requires mapping rather than guessing`, () => {
  const { official, schedule, core } = fixtures();
  if (mode === 'missing-number') schedule.postGame.batters.away[0].name = 'Alice';
  if (mode === 'duplicate-live') schedule.postGame.batters.away.push({ ...schedule.postGame.batters.away[0] });
  if (mode === 'duplicate-source') official.detail.teams[0].batters.push({ ...official.detail.teams[0].batters[0], rowKey: 'b2' });
  if (mode === 'team-mismatch') core.teamNames.away = 'OTHER';
  const rows = compareRecordSources(schedule, core, official);
  assert.ok(rows.some(row => row.status === 'unmapped'));
  assert.ok(!rows.some(row => row.key === 'away/batters/b1/atBats'));
});
test('COMPARE: jersey zero remains a valid identity', () => {
  const { official, schedule, core } = fixtures(); schedule.postGame.batters.away[0].name = 'Alice(0)'; official.detail.teams[0].batters[0].jerseyNumber = '0';
  assert.equal(compareRecordSources(schedule, core, official).find(row => row.key === 'away/batters/b1/atBats')?.status, 'mismatch');
});

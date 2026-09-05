import test from 'node:test';
import assert from 'node:assert/strict';
import { checksum, sanitizeCandidate } from '../src/normalization.mjs';
import { parseInningsPitched, parseInningRuns, parseLineScore, parseTeamTables, providerGameIdFromUrl, sanitizeGameDetail, validateGameDetails } from '../src/game-details.mjs';
import { boxscoreSnapshots, candidateFixture, detailFixture } from './fixtures/game-detail-fixture.mjs';

test('parses provider identity only from the approved public game route, not its query', () => {
  assert.equal(providerGameIdFromUrl('https://unique-play.com/game/12345/boxscore?data=[object%20Object]'), '12345');
  for (const url of ['https://other.example/game/12345/boxscore', 'https://unique-play.com/game/name/boxscore', 'http://unique-play.com/game/12345/boxscore']) {
    assert.throws(() => providerGameIdFromUrl(url), { code: 'GAME_DETAIL_ID' });
  }
});

test('innings uses outs rather than decimal arithmetic and preserves unknown versus zero', () => {
  for (const [value, outs] of [['1.2', 5], ['3.1', 10], ['0', 0], ['⅓', 1], ['2⅔', 8], ['2 1/3', 7], ['21⁄3', 7]]) {
    assert.equal(parseInningsPitched(value).outs, outs);
  }
  assert.deepEqual(parseInningsPitched('-'), { outs: null, inningsPitched: null });
  for (const value of ['1.3', '1.5', '-1', 'innings', 'Infinity']) assert.throws(() => parseInningsPitched(value));
  assert.deepEqual(parseInningRuns('0'), { runs: 0, notPlayed: false });
  assert.deepEqual(parseInningRuns(''), { runs: null, notPlayed: false });
  assert.deepEqual(parseInningRuns('-'), { runs: null, notPlayed: false });
  assert.deepEqual(parseInningRuns('X'), { runs: null, notPlayed: true });
});

test('parses two team tables, excludes totals, preserves substitution rows and repeated plate appearances', () => {
  const detail = detailFixture();
  assert.equal(detail.teams[0].batters.length, 3);
  assert.equal(detail.teams[0].pitchers.length, 2);
  const [first, starter, replacement] = detail.teams[0].batters;
  assert.equal(first.stats.atBats, 2);
  assert.equal(first.stats.hits, 2);
  assert.equal(first.stats.seasonBattingAverage, 0.333);
  assert.deepEqual(first.plateAppearances.at(-1), { inning: 3, result: '사구,송구실책,사구' });
  assert.equal(starter.battingOrder, 9);
  assert.equal(replacement.battingOrder, 9);
  assert.equal(replacement.position, '미정');
  assert.equal(starter.playerName, replacement.playerName);
  assert.notEqual(starter.rowKey, replacement.rowKey);
  assert.equal(detail.teams[0].pitchers[0].decision, '승');
  assert.equal(detail.teams[0].pitchers[0].stats.outs, 5);
  assert.deepEqual(validateGameDetails(candidateFixture()), []);
});

test('row keys also distinguish same-name same-jersey repeated rows and are deterministic', () => {
  const snapshot = boxscoreSnapshots()[0];
  snapshot.batter.labels[2] = snapshot.batter.labels[1];
  const a = parseTeamTables(snapshot, '테스트 대학 A');
  const b = parseTeamTables(snapshot, '테스트 대학 A');
  assert.notEqual(a.batters[1].rowKey, a.batters[2].rowKey);
  assert.equal(a.batters[2].rowKey, b.batters[2].rowKey);
});

test('spaced jersey labels and source designated-hitter positions are parsed without corrupting names', () => {
  const snapshot = boxscoreSnapshots()[0];
  snapshot.batter.labels[0] = '1 지타 타자갑 ( 3 )';
  snapshot.pitcher.labels[0] = '투수갑 ( 99 ) 패';
  const parsed = parseTeamTables(snapshot, '테스트 대학 A');
  assert.equal(parsed.batters[0].playerName, '타자갑');
  assert.equal(parsed.batters[0].position, '지타');
  assert.equal(parsed.batters[0].jerseyNumber, '3');
  assert.equal(parsed.pitchers[0].jerseyNumber, '99');
  assert.equal(parsed.pitchers[0].decision, '패');
  snapshot.batter.labels[0] = '1 새로운포지션 타자갑 ( 3 )';
  assert.throws(() => parseTeamTables(snapshot, '테스트 대학 A'), { code: 'GAME_DETAIL_SCHEMA' });
});

test('header changes, shifted columns, missing cells and duplicate innings fail closed', () => {
  for (const mutate of [
    (snapshot) => { snapshot.batter.columns[5].header = '잘못된 열'; },
    (snapshot) => { snapshot.pitcher.columns[1].values.pop(); },
    (snapshot) => { snapshot.batter.columns[1].header = '1'; },
    (snapshot) => { snapshot.batter.labels[0] = ''; },
  ]) {
    const snapshot = boxscoreSnapshots()[0]; mutate(snapshot);
    assert.throws(() => parseTeamTables(snapshot, '테스트 대학 A'), { code: 'GAME_DETAIL_SCHEMA' });
  }
  const lineScore = boxscoreSnapshots()[0].lineScore;
  lineScore.totals[0].header = 'H';
  assert.throws(() => parseLineScore(lineScore), { code: 'GAME_DETAIL_SCHEMA' });
});

test('sanitization permits only public detail fields and numeric nulls are not converted to zero', () => {
  const detail = detailFixture();
  detail.email = 'private@example.invalid';
  detail.teams[0].account = { token: 'private' };
  detail.teams[0].batters[0].phone = '010-1111-2222';
  detail.teams[0].batters[0].stats.walks = 123; // Not inferable from combined source PA labels.
  detail.teams[0].batters[0].stats.atBats = null;
  const sanitized = sanitizeGameDetail(detail);
  assert.equal('email' in sanitized, false);
  assert.equal('account' in sanitized.teams[0], false);
  assert.equal('phone' in sanitized.teams[0].batters[0], false);
  assert.equal('walks' in sanitized.teams[0].batters[0].stats, false);
  assert.equal(sanitized.teams[0].batters[0].stats.atBats, null);
  for (const bad of ['private@example.invalid', '010-1234-5678', '<script>', 'https://private.example']) {
    detail.teams[0].batters[0].playerName = bad;
    assert.throws(() => sanitizeGameDetail(detail), { code: 'GAME_DETAIL_PRIVATE_VALUE' });
  }
});

test('keeps legacy candidate shape and source IDs; new details affect the checked snapshot', () => {
  const context = { leagueId: 57, seasonYear: 2026, adapterVersion: 'test', capturedAt: '2026-09-05T00:00:00Z' };
  const legacy = sanitizeCandidate({ groups: {}, games: [] }, context);
  assert.equal('gameDetails' in legacy, false);
  assert.deepEqual(validateGameDetails(legacy), []);
  const fixture = candidateFixture();
  const current = sanitizeCandidate({ ...fixture, groups: {} }, context);
  assert.equal(current.games[0].sourceGameId, 'up-fixture-game');
  assert.equal(current.gameDetails[0].sourceGameId, 'up-fixture-game');
  assert.notEqual(current.checksum, legacy.checksum);
  assert.equal(checksum(current), checksum(sanitizeCandidate({ ...fixture, groups: {} }, context)));
});

test('detail coverage, duplicate provider IDs, unknown parents and team mapping block publication', () => {
  const cases = [
    ['GAME_DETAIL_MISSING', (candidate) => { candidate.gameDetails = []; }],
    ['GAME_DETAIL_DUPLICATE', (candidate) => { candidate.gameDetails.push(structuredClone(candidate.gameDetails[0])); }],
    ['GAME_DETAIL_PARENT', (candidate) => { candidate.games[0].status = 'SCHEDULED'; }],
    ['GAME_DETAIL_TEAM_MAPPING', (candidate) => { candidate.gameDetails[0].teams[0].teamName = '다른 팀'; }],
    ['GAME_DETAIL_ROW_DUPLICATE', (candidate) => { candidate.gameDetails[0].teams[0].batters[1].rowKey = candidate.gameDetails[0].teams[0].batters[0].rowKey; }],
  ];
  for (const [code, mutate] of cases) {
    const candidate = candidateFixture(); mutate(candidate);
    assert.ok(validateGameDetails(candidate).some((issue) => issue.code === code), code);
  }
});

test('score, inning sum, player sum, outs and numeric ranges are checked without using incorrect aggregate rows', () => {
  const cases = [
    ['GAME_DETAIL_SCORE', (detail) => { detail.teams[0].totals.runs = 9; }],
    ['GAME_DETAIL_INNING_SUM', (detail) => { detail.teams[0].innings[0].runs = 2; }],
    ['GAME_DETAIL_BATTER_SUM', (detail) => { detail.teams[0].batters[0].stats.runs = 1; }],
    ['GAME_DETAIL_OUTS', (detail) => { detail.teams[0].pitchers[0].stats.outs = 6; }],
    ['GAME_DETAIL_BATTER_RANGE', (detail) => { detail.teams[0].batters[0].stats.hits = 3; }],
    ['GAME_DETAIL_PITCHER_RANGE', (detail) => { detail.teams[0].pitchers[0].stats.earnedRuns = 2; }],
    ['GAME_DETAIL_INNINGS', (detail) => { detail.teams[0].innings[3].runs = 0; }],
  ];
  for (const [code, mutate] of cases) {
    const candidate = candidateFixture(); mutate(candidate.gameDetails[0]);
    assert.ok(validateGameDetails(candidate).some((issue) => issue.code === code), code);
  }
});

test('NOT_PUBLISHED is a distinct explicit state, never an AVAILABLE empty table', () => {
  const candidate = candidateFixture();
  candidate.gameDetails[0] = { schemaVersion: 1, sourceGameId: 'up-fixture-game', providerGameId: '12345', status: 'NOT_PUBLISHED', teams: [] };
  assert.deepEqual(validateGameDetails(candidate), []);
  candidate.gameDetails[0].status = 'AVAILABLE';
  assert.ok(validateGameDetails(candidate).some((issue) => issue.code === 'GAME_DETAIL_TEAMS'));
});

test('provider IDs, innings and numeric limits match the backend boundary contract', () => {
  const id = '9'.repeat(24);
  assert.equal(providerGameIdFromUrl(`https://unique-play.com/game/${id}/boxscore`), id);
  assert.throws(() => providerGameIdFromUrl(`https://unique-play.com/game/${id}9/boxscore`), { code: 'GAME_DETAIL_ID' });
  const detail = detailFixture();
  detail.providerGameId = id;
  detail.teams[0].batters[0].stats.atBats = 999;
  detail.teams[0].pitchers[0].stats.era = 999;
  detail.teams[0].pitchers[0].stats.outs = 299;
  detail.teams[0].pitchers[0].stats.inningsPitched = '99.2';
  assert.equal(sanitizeGameDetail(detail).teams[0].pitchers[0].stats.era, 999);
  assert.equal(parseInningsPitched('99.2').outs, 299);
  const numericIdentity = structuredClone(detail);
  numericIdentity.providerGameId = '101012345678123456789012';
  numericIdentity.sourceGameId = 'up-01012345678abc';
  numericIdentity.teams[0].batters[0].rowKey = 'up-row-a01012345678b';
  assert.equal(sanitizeGameDetail(numericIdentity).providerGameId, numericIdentity.providerGameId);
  for (const mutate of [
    (row) => { row.providerGameId += '9'; },
    (row) => { row.teams[0].batters[0].stats.atBats = 1000; },
    (row) => { row.teams[0].pitchers[0].stats.era = 1000; },
    (row) => { row.teams[0].innings[0].inning = 31; },
    (row) => { row.teams[0].batters[0].plateAppearances[0].inning = 31; },
  ]) {
    const invalid = structuredClone(detail); mutate(invalid);
    assert.throws(() => sanitizeGameDetail(invalid), { code: 'GAME_DETAIL_SCHEMA' });
  }
  const score = boxscoreSnapshots()[0].lineScore;
  score.innings = Array.from({ length: 30 }, (_, index) => ({ header: String(index + 1), values: ['0', '0'] }));
  assert.equal(parseLineScore(score)[0].innings.length, 30);
  score.innings.push({ header: '31', values: ['0', '0'] });
  assert.throws(() => parseLineScore(score), { code: 'GAME_DETAIL_SCHEMA' });
});

test('array cardinality limits agree with backend strict shapes', () => {
  for (const mutate of [
    (detail) => { detail.teams.push(structuredClone(detail.teams[0])); },
    (detail) => { detail.teams[0].batters = Array.from({ length: 101 }, () => detail.teams[0].batters[0]); },
    (detail) => { detail.teams[0].pitchers = Array.from({ length: 101 }, () => detail.teams[0].pitchers[0]); },
    (detail) => { detail.teams[0].batters[0].plateAppearances = Array.from({ length: 101 }, () => ({ inning: 1, result: '삼진' })); },
  ]) {
    const detail = detailFixture(); mutate(detail);
    assert.throws(() => sanitizeGameDetail(detail), { code: 'GAME_DETAIL_SCHEMA' });
  }
  const candidate = candidateFixture();
  candidate.gameDetails = Array.from({ length: 2001 }, () => candidate.gameDetails[0]);
  assert.ok(validateGameDetails(candidate).some((issue) => issue.code === 'GAME_DETAILS_SCHEMA'));
});

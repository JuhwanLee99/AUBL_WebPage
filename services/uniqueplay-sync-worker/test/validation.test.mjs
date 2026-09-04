import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCandidate } from '../src/validation.mjs';

function completeCandidate() {
  const groups = {};
  for (const code of 'ABCDEFGH') {
    groups[code] = {
      standings: Array.from({ length: 5 }, (_, index) => ({ rank: index + 1, teamName: `${code}-${index + 1}`, games: 4, wins: 4 - index, losses: index, draws: 0 })),
      batters: { IN: [], OUT: [] },
      pitchers: { IN: [], OUT: [] },
    };
  }
  return { provider: 'UNIQUE_PLAY', groups, games: [] };
}

test('accepts a complete A-H candidate', () => {
  const result = validateCandidate(completeCandidate());
  assert.equal(result.valid, true);
  assert.equal(result.counts.teams, 40);
});

test('blocks partial scores and duplicate game ids', () => {
  const candidate = completeCandidate();
  candidate.games = [
    { sourceGameId: 'same', groupCode: 'A', homeTeamName: 'A-1', awayTeamName: 'A-2', homeScore: 2, awayScore: null },
    { sourceGameId: 'same', groupCode: 'A', homeTeamName: 'A-3', awayTeamName: 'A-4', homeScore: null, awayScore: null },
  ];
  const result = validateCandidate(candidate);
  assert.equal(result.valid, false);
  assert.ok(result.blockingErrors.some((entry) => entry.code === 'PARTIAL_SCORE'));
  assert.ok(result.blockingErrors.some((entry) => entry.code === 'GAME_ID'));
});

test('warns when a tie crosses a qualification boundary', () => {
  const candidate = completeCandidate();
  candidate.groups.A.standings[2].rank = 2;
  const result = validateCandidate(candidate);
  assert.ok(result.warnings.some((entry) => entry.code === 'BOUNDARY_TIE'));
});

test('blocks player rows whose collected stat cells are empty', () => {
  const candidate = completeCandidate();
  candidate.groups.A.batters.IN = [{
    playerName: '테스트 타자',
    teamName: 'A-1',
    stats: { 타석: null, 타수: null, 총안타: null, 타율: null },
  }];

  const result = validateCandidate(candidate);
  assert.equal(result.valid, false);
  assert.ok(result.blockingErrors.some((entry) => entry.code === 'PLAYER_STATS_EMPTY'));

  candidate.groups.A.batters.IN[0].stats = { 타석: 0, 타수: 0, 총안타: 0, 타율: 0 };
  assert.equal(validateCandidate(candidate).valid, true);
});

test('blocks negative player statistics', () => {
  const candidate = completeCandidate();
  candidate.groups.A.pitchers.OUT = [{
    playerName: '테스트 투수',
    teamName: 'A-1',
    stats: { 이닝: 1, 실점: -1, ERA: 0 },
  }];

  const result = validateCandidate(candidate);
  assert.equal(result.valid, false);
  assert.ok(result.blockingErrors.some((entry) => entry.code === 'PLAYER_STATS_RANGE'));
});

test('blocks an incomplete completed-game collection', () => {
  const candidate = completeCandidate();
  for (const group of Object.values(candidate.groups)) {
    group.standings = group.standings.map((row) => ({ ...row, games: 0, wins: 0, losses: 0, draws: 0 }));
  }
  candidate.groups.A.standings = candidate.groups.A.standings.map((row, index) => ({
    ...row,
    games: index < 2 ? 1 : 0,
    wins: index === 0 ? 1 : 0,
    losses: index === 1 ? 1 : 0,
    draws: 0,
  }));
  candidate.games = [{
    sourceGameId: 'a-1',
    groupCode: 'A',
    homeTeamName: 'A-1',
    awayTeamName: 'A-2',
    homeScore: 3,
    awayScore: 1,
    status: 'COMPLETED',
  }];

  assert.equal(validateCandidate(candidate).valid, true);

  candidate.groups.A.standings[0].games = 2;
  candidate.groups.A.standings[0].wins = 2;
  const result = validateCandidate(candidate);
  assert.equal(result.valid, false);
  assert.ok(result.blockingErrors.some((entry) => entry.code === 'GAME_COUNT_MISMATCH' && entry.details.actual === 1));
});

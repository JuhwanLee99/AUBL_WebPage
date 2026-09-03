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

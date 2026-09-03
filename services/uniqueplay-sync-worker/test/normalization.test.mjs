import test from 'node:test';
import assert from 'node:assert/strict';
import { checksum, deterministicGameId, findPrivatePaths, normalizeText, sanitizeCandidate } from '../src/normalization.mjs';

test('normalizes Korean text and creates stable checksums', () => {
  assert.equal(normalizeText('  A\u3000조  '), 'A 조');
  assert.equal(checksum({ b: 2, a: 1 }), checksum({ a: 1, b: 2 }));
});

test('game id is deterministic and changes for a doubleheader slot', () => {
  const base = { leagueId: '57', seasonYear: 2026, playedAt: '2026-09-05T09:00:00+09:00', groupCode: 'A', homeTeamName: 'A', awayTeamName: 'B', venue: '서울' };
  assert.equal(deterministicGameId(base), deterministicGameId({ ...base }));
  assert.notEqual(deterministicGameId(base), deterministicGameId({ ...base, playedAt: '2026-09-05T11:00:00+09:00' }));
});

test('sanitizer drops unknown and private fields', () => {
  const candidate = sanitizeCandidate({ groups: { A: { standings: [{ rank: 1, teamName: '팀', games: 0, wins: 0, losses: 0, draws: 0, email: 'private@example.com' }] } } }, { leagueId: 57, seasonYear: 2026, adapterVersion: 'test', capturedAt: '2026-09-03T00:00:00Z' });
  assert.deepEqual(findPrivatePaths(candidate), []);
  assert.equal('email' in candidate.groups.A.standings[0], false);
});

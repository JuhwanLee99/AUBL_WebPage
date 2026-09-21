import assert from 'node:assert/strict';
import { sanitizeCandidate, deterministicGameId, checksum } from '../src/normalization.mjs';
import { validateCandidate } from '../src/validation.mjs';
import { includesGameDate, validateCollectionScope } from '../src/collection-scope.mjs';
import { detailFixture } from './fixtures/game-detail-fixture.mjs';
const context = { leagueId: '57', seasonYear: 2026, capturedAt: '2026-09-12T00:00:00Z', adapterVersion: 'scoped-contract-fixture' };
const groups = Object.fromEntries([... 'ABCDEFGH'].map(code => [code, {
  standings: Array.from({length: 5}, (_, i) => ({rank: i + 1, teamName: `${code}-${i+1}`, games: code === 'A' && i < 2 ? 2 : 0, wins: code === 'A' && i === 0 ? 2 : 0, losses: code === 'A' && i === 1 ? 2 : 0, draws: 0})),
  batters: {IN: [], OUT: []}, pitchers: {IN: [], OUT: []},
}]));
const games = ['2026-09-10T12:00:00+09:00', '2026-09-11T12:00:00+09:00'].map(playedAt => ({playedAt, groupCode:'A', venue:'fixture', homeTeamName:'A-1', awayTeamName:'A-2', homeScore:3, awayScore:1, status:'COMPLETED'}));
const gameDetails = games.map(game => {
  const detail = detailFixture();
  detail.providerGameId = String(12345 + games.indexOf(game));
  detail.sourceGameId = deterministicGameId({...game, ...context});
  detail.teams[0].teamName = 'A-1'; detail.teams[1].teamName = 'A-2';
  return detail;
});
const full = sanitizeCandidate({groups, games, gameDetails}, context);
assert.equal(validateCandidate(full).valid, true, 'complete worker fixture');
const collectionScope = {version:1, mode:'FROM_DATE', fromDate:'2026-09-11'};
validateCollectionScope(collectionScope, 2026);
const selected = full.games.filter(game => includesGameDate(game.playedAt, collectionScope.fromDate));
const candidate = {...full, gameDetails:full.gameDetails.filter(detail => selected.some(game => game.sourceGameId === detail.sourceGameId))};
delete candidate.checksum; candidate.checksum = checksum(candidate);
assert.equal(candidate.gameDetails.length, 1);
assert.equal(validateCandidate(candidate, {detailGames:selected}).valid, true, 'scoped worker validation');
assert.equal(validateCandidate(candidate).valid, false, 'partial payload must not pass full snapshot validation');
process.stdout.write(JSON.stringify({base:full, payload:{candidate, collectionScope}}, null, 2));

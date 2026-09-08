import fs from 'node:fs';
export const baseOfficial = JSON.parse(fs.readFileSync(new URL('./fixture.json', import.meta.url), 'utf8'));
export function fixtures(matchId = 'LOCAL_TEST_SOURCE') {
  const official = structuredClone(baseOfficial);
  official.sourceGameId = `up-${matchId}`;
  official.detail.sourceGameId = official.sourceGameId;
  const schedule = {
    id: matchId, seasonId: 99, sourceProvider: 'UNIQUE_PLAY', sourceGameId: official.sourceGameId,
    sourceActive: true, syncRevision: official.syncRevision, status: 'completed', recordMode: 'official', scoreInputMode: 'live',
    startTime: official.game.playedAt, venue: 'LOCAL TEST ONLY', homeTeamName: 'LOCAL HOME', awayTeamName: 'LOCAL AWAY',
    homeScore: 1, awayScore: 4, notes: 'PRIVATE_TEST_NOTE', lineups: { home: [], away: [] }, benches: { home: [], away: [] },
    manualEntryDraft: { note: 'PRIVATE_TEST_DRAFT' },
    postGame: {
      totals: { away: { runs: 4, hits: 3, errors: 1 }, home: { runs: 1, hits: 1, errors: 0 } },
      lineScore: { away: [2, 2], home: [0, 1] },
      batters: { away: [{ name: 'Alice(7)', ab: 4, h: 2, r: 1, rbi: 1, sb: 0 }], home: [] },
      pitchers: { away: [{ name: 'Ann(12)', ip: '2', h: 1, r: 1, er: 0, bb: 0, hbp: 0, so: 2 }], home: [] },
    },
  };
  const core = { activeMatchId: matchId, gameStarted: true, gameOver: true, updatedAt: 0,
    score: { home: 1, away: 4 }, lineScore: { home: [0, 1], away: [2, 2] },
    teamNames: { home: 'LOCAL HOME', away: 'LOCAL AWAY' }, lastPlay: 'PRIVATE_TEST_FEED',
    scorerUid: 'LOCAL_SOURCE_SCORER', scorerPaused: true, feed: [], events: [] };
  const source = { schemaVersion: 1, matchId, authority: 'UNIQUE_PLAY', liveVisibility: 'ADMIN_ONLY',
    revision: official.syncRevision, payloadHash: 'a'.repeat(64), official };
  return { official, schedule, core, source };
}

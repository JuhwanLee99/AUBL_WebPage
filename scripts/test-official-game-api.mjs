import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initializeApp, deleteApp } from 'firebase/app';
import { createServer } from 'vite';

// Execute the real client with in-memory fixtures only. No auth or production API traffic.
const originalFetch = globalThis.fetch;
let respond = () => { throw new Error('Unexpected network request in API fixture test'); };
globalThis.fetch = (...args) => respond(...args);
const app = initializeApp({ apiKey: 'fixture-only', projectId: 'demo-aubl-api-fixture' });
const vite = await createServer({
  configFile: false,
  envDir: false,
  cacheDir: '.tmp/official-game-api-fixture-cache',
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, watch: null, hmr: false, ws: false },
  appType: 'custom',
});
const client = await vite.ssrLoadModule('/src/core/api/backendClient.ts');
const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'content-type': 'application/json' },
});
const game = {
  sourceGameId: 'up-game-1', backendGameId: 71, seasonId: 12,
  provider: 'UNIQUE_PLAY', syncRevision: 'revision-1',
  capturedAt: '2026-09-05T09:00:00', publishedAt: '2026-09-05T10:00:00',
  status: 'AVAILABLE',
  game: { status: 'COMPLETED', playedAt: '2026-08-24T15:00:00', groupCode: 'A', venue: '테스트 구장', homeTeamName: '테스트 A', awayTeamName: '테스트 B', homeScore: 1, awayScore: 0 },
  detail: {
    schemaVersion: 1, sourceGameId: 'up-game-1', providerGameId: '11111', status: 'AVAILABLE',
    teams: [{
      teamName: '테스트 A', innings: [{ inning: 1, runs: 1, notPlayed: false }],
      totals: { runs: 1, hits: 1, errors: 0, walks: null },
      batters: [{ rowKey: 'b-1', playerName: '타자', jerseyNumber: '3', battingOrder: 1, position: '중견',
        stats: { atBats: 1, hits: 1, rbi: null, stolenBases: 0, runs: 1, battingAverage: 1, seasonBattingAverage: null },
        plateAppearances: [{ inning: 1, result: '볼넷,도루,주루사' }],
      }],
      pitchers: [{ rowKey: 'p-1', playerName: '투수', jerseyNumber: '11', decision: '승',
        stats: { outs: 5, inningsPitched: '1.2', hitsAllowed: 0, runsAllowed: 0, earnedRuns: 0, walksAndHitByPitch: null, strikeouts: 1, era: 0 },
      }],
    }],
  },
};
const player = {
  playerId: 42, seasonId: 12, provider: 'UNIQUE_PLAY', syncRevision: 'revision-1',
  status: 'AVAILABLE', capturedAt: null, publishedAt: null,
  games: [{ ...game.game, sourceGameId: game.sourceGameId, backendGameId: 71,
    teamName: '테스트 A', batters: game.detail.teams[0].batters, pitchers: game.detail.teams[0].pitchers }],
};

try {
  await test('real game client preserves null, outs and public result text', async () => {
    respond = async (url) => {
      assert.equal(url, '/api/games/source/up-game-1/details?seasonId=12');
      return json(game);
    };
    const result = await client.getOfficialGameDetails('up-game-1', 12);
    assert.equal(result.backendGameId, 71);
    assert.equal(result.detail.teams[0].batters[0].stats.rbi, null);
    assert.equal(result.detail.teams[0].batters[0].stats.stolenBases, 0);
    assert.equal(result.detail.teams[0].pitchers[0].stats.outs, 5);
    assert.equal(result.detail.teams[0].pitchers[0].stats.inningsPitched, '1.2');
    assert.equal(result.detail.teams[0].batters[0].plateAppearances[0].result, '볼넷,도루,주루사');
  });
  await test('game client rejects mismatched identity, season, provider and status', async () => {
    for (const override of [
      {sourceGameId:'up-other'}, {seasonId:99}, {provider:'OTHER'},
      {status:'FUTURE_UNKNOWN'}, {syncRevision:null},
      {detail:{...game.detail,sourceGameId:'up-other'}},
    ]) {
      respond = async () => json({...game,...override});
      await assert.rejects(client.getOfficialGameDetails('up-game-1',12));
    }
  });
  await test('404 is missing official data, while 503 remains a retryable error', async () => {
    respond = async () => json({detail:'not found'},404);
    assert.equal(await client.getOfficialGameDetails('up-game-1'),null);
    respond = async () => json({detail:'unavailable'},503);
    await assert.rejects(client.getOfficialGameDetails('up-game-1'));
  });
  await test('nonavailable game statuses cannot leak an attached detail', async () => {
    for (const status of ['NOT_COLLECTED','NOT_PUBLISHED','REVIEW_REQUIRED']) {
      respond = async () => json({...game,status});
      assert.equal((await client.getOfficialGameDetails('up-game-1')).detail,null);
    }
  });
  await test('real player client keeps official rows and source game reference', async () => {
    respond = async (url) => {
      assert.equal(url,'/api/players/42/official-game-logs?seasonId=12');
      return json(player);
    };
    const result=await client.getOfficialPlayerGameLogs(42,12);
    assert.equal(result.games[0].sourceGameId,'up-game-1');
    assert.equal(result.games[0].batters[0].stats.rbi,null);
    assert.equal(result.games[0].pitchers[0].stats.walksAndHitByPitch,null);
  });
  await test('player client rejects stale identity or season and unknown status', async () => {
    for (const override of [{playerId:99},{seasonId:99},{status:'UNKNOWN'},{provider:'OTHER'},{syncRevision:null}]) {
      respond=async()=>json({...player,...override});
      await assert.rejects(client.getOfficialPlayerGameLogs(42,12));
    }
  });
  await test('unavailable player responses are empty, and only no-active permits missing revision', async () => {
    for(const status of ['NOT_COLLECTED','IDENTITY_UNRESOLVED','REVIEW_REQUIRED','NO_ACTIVE_REVISION']) {
      respond=async()=>json({...player,status,...(status==='NO_ACTIVE_REVISION'?{syncRevision:null}:{})});
      const result=await client.getOfficialPlayerGameLogs(42,12);
      assert.equal(result.status,status);
      assert.deepEqual(result.games,[]);
    }
  });
  await test('sync run exposes a bounded diagnostic code without expanding raw errors', async () => {
    respond=async(url)=>{
      assert.equal(url,'/api/admin/sync/unique-play/runs/run-fixture');
      return json({
        runId:'run-fixture',status:'FAILED',message:'수집 데이터 형식을 확인해 주세요.',
        errorCode:'GAME_DETAIL_SCHEMA',rawError:{email:'must-not-be-normalized'},
      });
    };
    const result=await client.getUniquePlaySyncRun('run-fixture');
    assert.equal(result.errorCode,'GAME_DETAIL_SCHEMA');
    assert.equal('rawError' in result,false);
  });
  await test('sync run drops unsafe or unbounded diagnostic codes', async () => {
    for(const errorCode of ['PRIVATE user@example.com','CODE_2','_'.repeat(10),'A'.repeat(65),{secret:'value'}]) {
      respond=async()=>json({runId:'run-fixture',status:'FAILED',errorCode});
      const result=await client.getUniquePlaySyncRun('run-fixture');
      assert.equal(result.errorCode,null);
    }
    respond=async()=>json({runId:'run-fixture',status:'FAILED',error_code:'game_detail_schema'});
    assert.equal((await client.getUniquePlaySyncRun('run-fixture')).errorCode,'GAME_DETAIL_SCHEMA');
  });
} finally {
  await vite.close();
  await deleteApp(app);
  globalThis.fetch=originalFetch;
}

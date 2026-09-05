import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initializeApp, deleteApp } from 'firebase/app';
import { createServer } from 'vite';

// All requests terminate in memory. No production data, account or API is used.
const originalFetch = globalThis.fetch;
let respond = () => { throw new Error('Unexpected network request'); };
globalThis.fetch = (...args) => respond(...args);
const app = initializeApp({ apiKey: 'fixture-only', projectId: 'demo-aubl-review-fixture' });
const vite = await createServer({
  configFile: false, envDir: false, cacheDir: '.tmp/game-review-api-fixture-cache',
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, watch: null, hmr: false, ws: false }, appType: 'custom',
});
const client = await vite.ssrLoadModule('/src/core/api/backendClient.ts');
const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'content-type': 'application/json' },
});
const detail = () => ({
  sourceGameId: 'up-one', providerGameId: '11111', status: 'AVAILABLE', schemaVersion: 1,
  teams: [{ teamName: '테스트 A', innings: [{ inning: 1, runs: null, notPlayed: false }],
    totals: { runs: 1, hits: 0, errors: 0, walks: null },
    batters: [{ rowKey: 'b-1', playerName: '타자', stats: { runs: 0, rbi: null }, plateAppearances: [] }], pitchers: [] }],
});
const correction = () => ({
  id: 'correction-one', sourceGameId: 'up-one', teamName: '테스트 A', section: 'batters',
  rowKey: 'b-1', field: 'rbi', expectedValue: null, value: 0,
  status: 'APPLIED', note: '원천 확인', actor: 'administrator', correctedAt: '2026-09-05T10:00:00',
});
const review = (runId = 'run-one') => ({
  runId, checksum: 'candidate-checksum', reviewChecksum: 'review-checksum', expectedRevision: '',
  games: [{ sourceGameId: 'up-one',
    game: { status: 'COMPLETED', homeTeamName: '테스트 A', awayTeamName: '테스트 B', homeScore: 1, awayScore: 0 },
    originalDetail: detail(), detail: detail(), quality: 'CORRECTION_PENDING',
    issues: [{ id: 'runs', sourceGameId: 'up-one', code: 'DETAIL_BATTER_TOTAL', teamName: '테스트 A', field: 'runs', message: '합계 확인', observed: 0, expected: 1 }],
    corrections: [correction()], notifications: [{ code: 'CORRECTION_APPLIED', sourceGameId: 'up-one', message: '수정 반영' }],
  }],
  notifications: [{ code: 'SOURCE_RESOLVED', sourceGameId: 'up-one', message: '원천에서 오류가 해결되었습니다.' }],
});

try {
  await test('review GET retains separate candidate and review tokens, empty base, null and zero', async () => {
    respond = async (url, init) => {
      assert.equal(url, '/api/admin/sync/unique-play/runs/run-one/game-records');
      assert.equal(init.method, undefined);
      return json(review());
    };
    const result = await client.getUniquePlayGameRecordsReview('run-one');
    assert.equal(result.expectedRevision, '');
    assert.equal(result.checksum, 'candidate-checksum');
    assert.equal(result.reviewChecksum, 'review-checksum');
    assert.equal(result.games[0].quality, 'CORRECTION_PENDING');
    assert.equal(result.games[0].detail.teams[0].batters[0].stats.rbi, null);
    assert.equal(result.games[0].detail.teams[0].batters[0].stats.runs, 0);
    assert.equal(result.games[0].issues[0].observed, 0);
    assert.equal(result.games[0].corrections[0].expectedValue, null);
    assert.equal(result.games[0].corrections[0].value, 0);
    assert.equal(result.notifications[0].code, 'SOURCE_RESOLVED');
  });

  await test('legacy quality metadata stays unknown rather than clean or resolved', async () => {
    const fixture = review();
    delete fixture.games[0].quality;
    delete fixture.games[0].issues;
    respond = async () => json(fixture);
    const result = await client.getUniquePlayGameRecordsReview('run-one');
    assert.equal(result.games[0].quality, null);
    assert.deepEqual(result.games[0].issues, []);
    assert.equal(result.games[0].resolutionSource, null);
    assert.equal(result.games[0].resolvedAt, null);
  });

  await test('resolved source and manual metadata retain their provenance without changing records', async () => {
    for (const resolutionSource of ['SOURCE', 'MANUAL']) {
      const fixture = review();
      Object.assign(fixture.games[0], { quality: 'RESOLVED', resolutionSource, resolvedAt: '2026-09-05T10:00:00' });
      respond = async () => json(fixture);
      const result = await client.getUniquePlayGameRecordsReview('run-one');
      assert.equal(result.games[0].quality, 'RESOLVED');
      assert.equal(result.games[0].resolutionSource, resolutionSource);
      assert.equal(result.games[0].resolvedAt, '2026-09-05T10:00:00');
      assert.equal(result.games[0].detail.teams[0].totals.runs, 1);
    }
  });

  await test('run identity, duplicate games, missing concurrency tokens and oversized reviews are rejected', async () => {
    for (const change of [
      value => { value.runId = 'other-run'; },
      value => { value.games.push(value.games[0]); },
      value => { value.games[0].sourceGameId = ''; },
      value => { delete value.expectedRevision; },
      value => { value.expectedRevision = null; },
      value => { value.checksum = ''; },
      value => { delete value.reviewChecksum; },
      value => { value.games = Array(2001).fill(value.games[0]); },
    ]) {
      const fixture = review(); change(fixture);
      respond = async () => json(fixture);
      await assert.rejects(client.getUniquePlayGameRecordsReview('run-one'));
    }
  });

  await test('detail, original, quality issue and correction identities cannot cross games', async () => {
    for (const change of [
      game => { game.detail.sourceGameId = 'other-game'; },
      game => { game.originalDetail.sourceGameId = 'other-game'; },
      game => { game.issues[0].sourceGameId = 'other-game'; },
      game => { game.corrections[0].sourceGameId = 'other-game'; },
    ]) {
      const fixture = review(); change(fixture.games[0]);
      respond = async () => json(fixture);
      await assert.rejects(client.getUniquePlayGameRecordsReview('run-one'));
    }
  });

  await test('unknown quality or correction status, invalid section and object values fail closed', async () => {
    for (const change of [
      game => { game.quality = 'FUTURE'; },
      game => { game.corrections[0].status = 'FUTURE'; },
      game => { game.corrections[0].section = 'identity'; },
      game => { game.corrections[0].value = { arbitrary: 'object' }; },
      game => { delete game.corrections[0].expectedValue; },
    ]) {
      const fixture = review(); change(fixture.games[0]);
      respond = async () => json(fixture);
      await assert.rejects(client.getUniquePlayGameRecordsReview('run-one'));
    }
  });

  await test('correction history preserves all lifecycle states and public scalar values', async () => {
    for (const [status, expectedValue, value] of [
      ['APPLIED', null, 0], ['SOURCE_RESOLVED', false, true],
      ['CONFLICT', '1.2', '2.1'], ['RETIRED', 1, null],
    ]) {
      const fixture = review(); Object.assign(fixture.games[0].corrections[0], { status, expectedValue, value });
      respond = async () => json(fixture);
      const row = (await client.getUniquePlayGameRecordsReview('run-one')).games[0].corrections[0];
      assert.equal(row.status, status); assert.equal(row.expectedValue, expectedValue); assert.equal(row.value, value);
    }
  });

  await test('unsafe notification codes and unrelated fields are not exposed by normalized review', async () => {
    const fixture = review();
    fixture.notifications.push({ code: 'private user@example.com', message: 'do not expose' });
    fixture.privateAccount = 'not retained'; fixture.games[0].corrections[0].password = 'not retained';
    respond = async () => json({ review: fixture });
    const result = await client.getUniquePlayGameRecordsReview('run-one');
    assert.equal(result.notifications.length, 1);
    assert.equal('privateAccount' in result, false);
    assert.equal('password' in result.games[0].corrections[0], false);
  });

  await test('PATCH sends exact compare-and-set changes, note and revision without dropping zero/null', async () => {
    const request = { expectedChecksum: 'candidate-checksum', expectedRevision: '', note: '기록지 확인', changes: [
      { teamName: '테스트 A', section: 'batters', rowKey: 'b-1', field: 'rbi', expectedValue: null, value: 0 },
    ] };
    let calls = 0;
    respond = async (url, init) => {
      calls++; assert.equal(url, '/api/admin/sync/unique-play/runs/run%2Fone/game-records/up%2Fone/corrections');
      assert.equal(init.method, 'PATCH'); assert.equal(init.headers.get('content-type'), 'application/json');
      assert.deepEqual(JSON.parse(init.body), request);
      const fixture = review('run/one');
      const game = fixture.games[0];
      game.sourceGameId = 'up/one'; game.detail.sourceGameId = 'up/one'; game.originalDetail.sourceGameId = 'up/one';
      game.issues[0].sourceGameId = 'up/one'; game.corrections[0].sourceGameId = 'up/one';
      return json(fixture);
    };
    await client.correctUniquePlayGameRecord('run/one', 'up/one', request);
    assert.equal(calls, 1);
  });

  await test('conflict resolution encodes IDs and preserves source/override decisions', async () => {
    for (const resolution of ['USE_SOURCE', 'KEEP_AUBL']) {
      const request = { expectedChecksum: 'candidate-checksum', expectedRevision: 'revision-one', note: '관리자 판단', resolution };
      respond = async (url, init) => {
        assert.equal(url, '/api/admin/sync/unique-play/runs/run-one/game-records/up-one/corrections/correction%2Fone');
        assert.equal(init.method, 'PATCH'); assert.deepEqual(JSON.parse(init.body), request); return json(review());
      };
      await client.resolveUniquePlayGameCorrection('run-one', 'up-one', 'correction/one', request);
    }
  });

  await test('mutation responses must include the selected game, not just a matching run', async () => {
    for (const games of [[], review().games]) {
      let calls = 0;
      respond = async () => { calls++; return json({ ...review(), games }); };
      await assert.rejects(client.correctUniquePlayGameRecord('run-one', 'up-requested', {
        expectedChecksum: 'candidate-checksum', expectedRevision: '', note: '수정', changes: [],
      }), /수정 요청한 경기가 검수 응답에 없습니다/);
      assert.equal(calls, 1);
      await assert.rejects(client.resolveUniquePlayGameCorrection('run-one', 'up-requested', 'correction-one', {
        expectedChecksum: 'candidate-checksum', expectedRevision: '', note: '충돌 처리', resolution: 'USE_SOURCE',
      }), /충돌 처리한 경기가 검수 응답에 없습니다/);
      assert.equal(calls, 2);
    }
  });

  await test('correction-run clone requests the selected revision only, never starts a new collection', async () => {
    const request = { expectedChecksum: 'revision-checksum', expectedRevision: 'revision/one', note: '게시본 직접 검수' };
    const calls = [];
    respond = async (url, init) => {
      calls.push(url); assert.equal(url, '/api/admin/sync/unique-play/revisions/revision%2Fone/correction-runs');
      assert.equal(init.method, 'POST'); assert.deepEqual(JSON.parse(init.body), request);
      return json({ runId: 'correction-run', status: 'REVIEW_REQUIRED', checksum: 'clone-checksum' });
    };
    const result = await client.createUniquePlayCorrectionRun('revision/one', request);
    assert.equal(result.runId, 'correction-run'); assert.equal(result.checksum, 'clone-checksum'); assert.equal(calls.length, 1);
  });

  await test('publish transmits reviewed checksum and warning acknowledgment without activating', async () => {
    for (const acknowledgeDetailWarnings of [true, false]) {
      const request = { checksum: 'candidate-checksum', expectedPublishedRevision: '', reviewChecksum: 'review-checksum', acknowledgeDetailWarnings };
      const calls = [];
      respond = async (url, init) => {
        calls.push(url); assert.equal(url, '/api/admin/sync/unique-play/runs/run-one/publish');
        assert.equal(init.method, 'POST'); assert.deepEqual(JSON.parse(init.body), request);
        return json({ revisionId: 'new-revision', checksum: 'candidate-checksum', status: 'PUBLISHED' });
      };
      assert.equal((await client.publishUniquePlaySyncRun('run-one', request)).revisionId, 'new-revision');
      assert.equal(calls.length, 1);
    }
  });

  await test('409 review conflicts remain errors and no mutation request retries automatically', async () => {
    let calls = 0;
    respond = async () => { calls++; return json({ code: 'REVIEW_CHECKSUM_MISMATCH', message: '검수 화면을 새로고침해 주세요.' }, 409); };
    await assert.rejects(client.publishUniquePlaySyncRun('run-one', {
      checksum: 'candidate-checksum', expectedPublishedRevision: '', reviewChecksum: 'stale', acknowledgeDetailWarnings: true,
    }), error => error.status === 409 && error.code === 'REVIEW_CHECKSUM_MISMATCH');
    assert.equal(calls, 1);
  });

  await test('401 and 403 remain explicit errors without accepting a partial review', async () => {
    for (const status of [401, 403]) {
      respond = async () => json({ code: 'FORBIDDEN', message: '관리자 권한이 필요합니다.' }, status);
      await assert.rejects(client.getUniquePlayGameRecordsReview('run-one'), error => error.status === status);
    }
  });
} finally {
  await vite.close(); await deleteApp(app); globalThis.fetch = originalFetch;
}

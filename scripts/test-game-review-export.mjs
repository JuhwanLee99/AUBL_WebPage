import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const vite = await createServer({
  configFile: false, envDir: false, cacheDir: '.tmp/game-review-export-fixture-cache',
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, watch: null, hmr: false, ws: false }, appType: 'custom',
});
const { gameReviewExport } = await vite.ssrLoadModule('/src/features/sync/gameReviewExport.ts');
const { default: AuditTables } = await vite.ssrLoadModule('/src/features/sync/components/OfficialGameAuditTables.tsx');
const detail = {
  status: 'AVAILABLE', sourceGameId: 'up-test', providerGameId: '12345', teams: [{
    teamName: '테스트 팀', innings: [{ inning: 1, runs: 0 }, { inning: 2, runs: null }, { inning: 3, runs: null, notPlayed: true }],
    totals: { runs: 1, hits: 2, errors: 0, walks: null },
    batters: [{ rowKey: 'b-1', playerName: '테스트 타자', jerseyNumber: '7',
      stats: { atBats: 3, hits: 2, rbi: null, runs: 0 }, plateAppearances: [{ inning: 1, result: '좌안' }] }],
    pitchers: [{ rowKey: 'p-1', playerName: '테스트 투수', jerseyNumber: null,
      stats: { inningsPitched: '1.2', hitsAllowed: 1, runsAllowed: 0, earnedRuns: null, walksAndHitByPitch: 2, strikeouts: 3, era: 0 } }],
  }],
};
const review = {
  runId: 'run-one', checksum: 'raw', reviewChecksum: 'effective', expectedRevision: 'published',
  notifications: [{ message: 'admin only' }],
  games: [{ sourceGameId: 'up-test', game: { homeScore: 1 }, detail,
    originalDetail: { privateMarker: 'not-for-export' },
    quality: 'CORRECTION_PENDING', issues: [{ code: 'DETAIL_BATTER_TOTAL', observed: 0, expected: 1 }],
    corrections: [{ actor: 'admin@example.test', note: 'private note' }], notifications: [{ message: 'admin only' }],
    resolutionSource: null, resolvedAt: null }],
};
try {
  await test('report export retains run and effective revision tokens without private review history', () => {
    const result = gameReviewExport(review), text = JSON.stringify(result);
    assert.equal(result.schemaVersion, 1);
    assert.equal(result.reviewChecksum, 'effective');
    assert.equal(result.expectedRevision, 'published');
    for (const privateValue of ['admin@example.test', 'private note', 'not-for-export', 'admin only', 'corrections', 'notifications']) assert.ok(!text.includes(privateValue));
  });
  await test('report export preserves null, zero, game order and input without mutation', () => {
    const before = structuredClone(review), result = gameReviewExport(review);
    assert.equal(result.games[0].detail.teams[0].batters[0].stats.rbi, null);
    assert.equal(result.games[0].detail.teams[0].batters[0].stats.runs, 0);
    assert.deepEqual(review, before);
  });
  await test('audit tables show RBI and pitcher detail, never replacing null with zero', () => {
    const html = renderToStaticMarkup(createElement(AuditTables, { detail }));
    for (const field of ['타점', '득점', '피안타', '실점', '자책점', '4사구', '삼진', '방어율', '1.2', '1회 좌안']) assert.ok(html.includes(field), field);
    assert.ok(html.includes('<td>3</td><td>2</td><td>—</td><td>0</td>'));
    assert.ok(html.includes('<td>0</td><td>—</td><td>X</td>'));
    assert.ok(html.includes('tabindex="0"'));
    assert.ok(html.includes('가로 스크롤 가능'));
  });
  await test('unavailable details render without invented player records', () => {
    assert.ok(!renderToStaticMarkup(createElement(AuditTables, { detail: null })).includes('<table'));
  });
} finally {
  await vite.close();
}

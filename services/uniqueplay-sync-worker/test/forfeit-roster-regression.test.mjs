import test from 'node:test';
import assert from 'node:assert/strict';
import { BATTER_DETAIL_HEADERS, parseTeamTables, detailError, safeGameDetailDiagnostic } from '../src/game-details.mjs';
import { readOpenGameBoxscore } from '../src/boxscore-adapter.mjs';
import { DurableRuns } from '../src/durable-runs.mjs';
import { forfeitSnapshots } from './fixtures/game-detail-fixture.mjs';

// Public game 57451 observed 2026-09-21. Synthetic names; actual column shape:
// nine roster rows plus total, including an EMPTY season-average total cell.
function snapshots() {
  return forfeitSnapshots().map(snapshot => ({ ...snapshot, batter: {
    labels: [...Array.from({ length: 9 }, (_, i) => `${i + 1} 미정 선수${String.fromCharCode(65 + i)} (${i + 1})`), '합계'],
    columns: BATTER_DETAIL_HEADERS.map((header, i) => ({ header,
      values: Array.from({ length: 10 }, (_, row) => i === 6 ? (row === 9 ? '' : '0.286') : i === 5 ? '0.000' : '0'),
    })),
  } }));
}
function pageFor(rows) {
  let selected = 0;
  return {
    url: () => 'https://unique-play.com/game/57451/boxscore',
    waitForTimeout: async () => {},
    evaluate: async (_fn, args) => {
      if (args?.action === 'select-team') {
        selected = rows.findIndex(row => row.selectedTeam === args.teamName);
        return { selected: args.teamName };
      }
      return rows[selected];
    },
  };
}
const expectedGame = { homeTeamName: '테스트 대학 A', awayTeamName: '테스트 대학 B', homeScore: 7, awayScore: 0 };

test('observed roster-only forfeit accepts empty season-average total without inventing appearances', () => {
  for (const snapshot of snapshots()) assert.deepEqual(
    parseTeamTables(snapshot, snapshot.selectedTeam, { allowForfeitEmpty: true }), { batters: [], pitchers: [] });
});
test('both team reads and parent identity produce explicit unpublished detail', async () => {
  assert.deepEqual(await readOpenGameBoxscore(pageFor(snapshots()), 'up-fixture', { sourceStatus: '기권승', expectedGame }),
    { schemaVersion: 1, sourceGameId: 'up-fixture', providerGameId: '57451', status: 'NOT_PUBLISHED', teams: [] });
});
test('normal completed game cannot use roster-only exception', async () => {
  await assert.rejects(readOpenGameBoxscore(pageFor(snapshots()), 'up-fixture', { sourceStatus: '게임종료', expectedGame }), { code: 'GAME_DETAIL_SCHEMA' });
});
const mutations = {
  'nonzero at-bats': s => { s.batter.columns[0].values[0] = '1'; },
  'nonzero hits': s => { s.batter.columns[1].values[0] = '1'; },
  'nonzero runs': s => { s.batter.columns[4].values[0] = '1'; },
  'missing stat': s => { s.batter.columns[0].values[0] = ''; },
  'missing player cell': s => { s.batter.columns[0].values.pop(); },
  'unknown header': s => { s.batter.columns[0].header = 'unknown'; },
  'extra column': s => { s.batter.columns.push({ header: 'extra', values: [] }); },
  'actual position': s => { s.batter.labels[0] = '1 투수 선수A (1)'; },
  'duplicate batting order': s => { s.batter.labels[1] = '1 미정 선수B (2)'; },
  'nonzero pitcher total': s => { s.pitcher.columns[0].values[0] = '1'; },
  'invalid season average': s => { s.batter.columns[6].values[0] = '1.2'; },
  'missing season average': s => { s.batter.columns[6].values[0] = ''; },
};
for (const [name, mutate] of Object.entries(mutations)) test(`roster exception rejects ${name}`, () => {
  const snapshot = snapshots()[0]; mutate(snapshot);
  assert.throws(() => parseTeamTables(snapshot, snapshot.selectedTeam, { allowForfeitEmpty: true }), { code: 'GAME_DETAIL_SCHEMA' });
});
test('detail diagnostic strips unapproved fields and invalid identifiers', () => {
  const diagnostic = safeGameDetailDiagnostic({ code: 'GAME_DETAIL_SCHEMA', detailContext: {
    phase: 'GAME_DETAILS', stage: 'READ_INITIAL', providerGameId: '57451', sourceGameId: 'private@example.invalid', token: 'secret',
  } });
  assert.deepEqual(diagnostic, { code: 'GAME_DETAIL_SCHEMA', phase: 'GAME_DETAILS', stage: 'READ_INITIAL', providerGameId: '57451' });
  assert.equal(safeGameDetailDiagnostic({ code: 'UNTRUSTED', detailContext: {} }), null);
});
test('failure diagnostic survives callback ACK and worker restart without recollection', async () => {
  const runId = '2c0f5b0a-863a-46ea-a091-f1041306f516';
  const records = new Map(); const logs = []; const callbacks = [];
  const store = { load: async () => structuredClone([...records.values()]), write: async r => { records.set(r.runId, structuredClone(r)); } };
  const options = {
    store, callbackBase: 'http://fixture.invalid', token: 'never-log-token', log: line => logs.push(line),
    collect: async () => { throw detailError('GAME_DETAIL_SCHEMA', { stage: 'READ_INITIAL', providerGameId: '57451', sourceGameId: `up-${'a'.repeat(24)}` }); },
    fetchImpl: async (_url, init) => {
      callbacks.push(JSON.parse(init.body));
      return { ok: true, status: 200, json: async () => ({ runId, deliveryId: init.headers['x-sync-delivery-id'],
        sequence: Number(init.headers['x-sync-sequence']), payloadHash: init.headers['x-sync-payload-sha256'], outcome: 'APPLIED' }) };
    },
  };
  const first = new DurableRuns(options);
  await first.initialize(); await first.submit({ runId, seasonYear: 2026 }); await first.idle();
  assert.equal(first.status(runId).state, 'FAILED');
  assert.match(callbacks[0].message, /providerGameId=57451/);
  assert.match(callbacks[0].message, /stage=READ_INITIAL/);
  assert.ok(logs.some(line => JSON.parse(line).detail?.providerGameId === '57451'));
  assert.equal(logs.join('').includes('never-log-token'), false);
  const second = new DurableRuns({ ...options, collect: async () => assert.fail('must not recollect') });
  await second.initialize(); await second.idle();
  assert.deepEqual(second.status(runId).gameDetailDiagnostic, first.status(runId).gameDetailDiagnostic);
  assert.equal(callbacks.length, 1);
});

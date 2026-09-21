import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectUntilStable } from '../src/adapter.mjs';
import { auditStandings } from '../src/standings-audit.mjs';
import { safeStandingsDiagnostic, standingsConflictError } from '../src/standings-diagnostics.mjs';
import { DurableRuns } from '../src/durable-runs.mjs';

const row = (rank, name, wins = 5, losses = 1, draws = 0) => ({
  fixed: [String(rank), name], values: [String(wins + losses + draws), '0.00', String(wins), String(losses), String(draws), '0', '0.00'],
});
// Synthetic hydration sequence followed by the observed A-group figures. This
// proves a collector boundary, not the input of the failed production run.
const settled = [row(1, 'Team A', 5, 1, 2), row(1, 'Team B', 5, 1, 1),
  row(3, 'Team C', 3, 2, 1), row(4, 'Team D', 1, 5), row(5, 'Team E', 1, 6)];
const toStandings = rows => rows.map(r => ({ rank: r.fixed[0], teamName: r.fixed.at(-1),
  wins: r.values[2], losses: r.values[3], draws: r.values[4] }));
async function collectSamples(samples, options = {}) {
  let reads = 0;
  const result = await collectUntilStable({
    read: async () => ({ rows: samples[Math.min(reads++, samples.length - 1)] }),
    advance: async () => ({ advanced: false, atEnd: true }),
    context: { groupCode: 'A', table: 'STANDINGS' }, ...options,
  });
  return { result, reads };
}

test('transient rank changes retain five teams, not eight historical rows', async () => {
  const initial = settled.map(r => ({ ...r, fixed: ['1', r.fixed[1]] }));
  const { result, reads } = await collectSamples([initial, settled]);
  assert.deepEqual(result, settled); assert.equal(reads, 5);
  assert.deepEqual(auditStandings(toStandings(result)), []);
  assert.equal(initial[2].fixed[0], '1', 'input is not rewritten');
});
test('same-length numeric changes reset stability', async () => {
  const a = [row(1, 'A', 1, 0)], b = [row(1, 'A', 2, 0)];
  const { result, reads } = await collectSamples([a, a, b]);
  assert.deepEqual(result, b); assert.equal(reads, 6);
});
test('continuously changing standings cannot reach a stable end', async () => {
  let reads = 0;
  await assert.rejects(collectSamples([], { maxPasses: 8,
    read: async () => ({ rows: [row(1, 'A', ++reads, 0)] }) }), { code: 'COLLECTION_INCOMPLETE' });
});
test('mutated reusable row objects cannot conceal value changes', async () => {
  const shared = row(1, 'A'); let reads = 0;
  await assert.rejects(collectSamples([], { maxPasses: 8, read: async () => {
    shared.values[2] = String(++reads); return { rows: [shared] };
  } }), { code: 'COLLECTION_INCOMPLETE' });
});
test('virtualized overlapping team windows preserve unseen teams', async () => {
  const samples = [settled.slice(0, 3), settled.slice(2)];
  let reads = 0;
  const result = await collectUntilStable({ read: async () => ({ rows: samples[Math.min(reads++, 1)] }),
    advance: async () => ({ advanced: reads === 1, atEnd: reads > 1 }), context: { table: 'STANDINGS' } });
  assert.deepEqual(result, settled);
});
test('real duplicate team rows in one sample are rejected even with different ranks', async () => {
  await assert.rejects(collectSamples([[row(1, 'A'), row(2, 'A')]]), { code: 'STANDINGS_ROW_CONFLICT' });
});
test('equivalent whitespace names cannot hide duplicate rows', async () => {
  await assert.rejects(collectSamples([[row(1, 'A B'), row(2, ' A  B ')]]), { code: 'STANDINGS_ROW_CONFLICT' });
});
test('blank team identity is rejected', async () => {
  await assert.rejects(collectSamples([[row(1, ' ')]]), { code: 'STANDINGS_ROW_CONFLICT' });
});
for (const sample of [[], [{ fixed: ['1'], values: Array(7).fill('0') }],
  [{ fixed: ['1', 'A'], values: ['1'] }]]) test(`incomplete standings sample is rejected (${JSON.stringify(sample)})`, async () => {
  await assert.rejects(collectSamples([sample]), { code: 'STANDINGS_TABLE_INCOMPLETE' });
});
test('genuine unequal-rate ties remain blocked after stable collection', async () => {
  const { result } = await collectSamples([[row(1, 'A', 5, 1), row(1, 'B', 1, 5)]]);
  assert.equal(auditStandings(toStandings(result))[0].code, 'RANK_TIE_WITH_DIFFERENT_WIN_RATE');
});
test('player collection retains its legacy rank-sensitive identity', async () => {
  const { result } = await collectSamples([[row(1, 'Same name'), row(2, 'Same name')]], { context: { table: 'BATTER_IN' } });
  assert.equal(result.length, 2);
});
test('scroll movement never counts as stability even with unchanged content', async () => {
  await assert.rejects(collectSamples([settled], { maxPasses: 8,
    advance: async () => ({ advanced: true, atEnd: true }) }), { code: 'COLLECTION_INCOMPLETE' });
});
for (const invalid of [null, '', ' ', -1, 1.5, true, 'NaN', '1e2']) {
  test(`invalid win counts fail closed: ${JSON.stringify(invalid)}`, () => {
    assert.equal(auditStandings([{ rank: 1, wins: invalid, losses: 1 }])[0].code, 'INVALID_RECORD_COUNT');
  });
}
test('exact fractions remain distinct beyond floating-point product precision', () => {
  const n = Number.MAX_SAFE_INTEGER;
  const issues = auditStandings([{ rank: 1, wins: n, losses: n - 1 }, { rank: 1, wins: n - 1, losses: n - 2 }]);
  assert.equal(issues[0].code, 'RANK_TIE_WITH_DIFFERENT_WIN_RATE');
});
test('zero-decision teams do not create an invented win-rate comparison', () => {
  assert.deepEqual(auditStandings([{ rank: 1, wins: 0, losses: 0 }, { rank: 1, wins: 5, losses: 1 }]), []);
});
test('diagnostics contain indexed numbers and allowed issue codes, not names', () => {
  const rows = [{ rank: 1, teamName: 'DO_NOT_LOG', wins: 5, losses: 1 }, { rank: 1, wins: 1, losses: 5 }];
  const error = standingsConflictError('A', rows, auditStandings(rows));
  const diagnostic = safeStandingsDiagnostic(error);
  assert.deepEqual(diagnostic.issues[0].rowIndices, [1, 2]);
  assert.equal(diagnostic.groupCode, 'A'); assert.equal(diagnostic.rows[0].wins, 5);
  assert.ok(!JSON.stringify(error).includes('DO_NOT_LOG'));
});
test('untrusted extra diagnostic fields and invalid values are discarded', () => {
  const error = { code: 'STANDINGS_RANK_CONFLICT', standingsDiagnostic: { groupCode: 'B', token: 'SECRET',
    rows: [{ rowIndex: 1, rank: 'SECRET', wins: -1, losses: false, draws: '2', password: 'SECRET' }],
    issues: [{ code: 'RANK_WIN_RATE_ORDER_CONFLICT', rowIndices: [1, 'SECRET'], teams: ['SECRET'] }, { code: 'SECRET' }] } };
  const result = safeStandingsDiagnostic(error);
  assert.deepEqual(result.rows[0], { rowIndex: 1, rank: null, wins: null, losses: null, draws: 2 });
  assert.deepEqual(result.issues, [{ code: 'RANK_WIN_RATE_ORDER_CONFLICT', rowIndices: [1] }]);
  assert.ok(!JSON.stringify(result).includes('SECRET'));
});
test('diagnostic size is bounded and truncation is explicit', () => {
  const rows = Array.from({ length: 100 }, () => ({ rank: 1, wins: 1, losses: 0 }));
  const issues = Array.from({ length: 100 }, () => ({ code: 'INVALID_RANK', rowIndices: [1] }));
  const result = safeStandingsDiagnostic(standingsConflictError('H', rows, issues));
  assert.equal(result.rows.length, 40); assert.equal(result.issues.length, 40); assert.equal(result.truncated, true);
});
for (const group of ['I', 'A\nSECRET', {}, null]) test(`invalid diagnostic group is discarded: ${JSON.stringify(group)}`, () => {
  assert.equal(safeStandingsDiagnostic(standingsConflictError(group, [], [])), null);
});

const RUN_ID = 'b73b01e3-414a-48c4-873a-7dc3bc62aaab';
class MemoryStore {
  records = new Map();
  async load() { return structuredClone([...this.records.values()]); }
  async write(record) { this.records.set(record.runId, structuredClone(record)); }
}
for (const acknowledged of [true, false]) test(`safe failure evidence persists with ACK=${acknowledged}`, async () => {
  const store = new MemoryStore(); const logs = []; const delivered = [];
  const rows = [{ rank: 1, teamName: 'SECRET_TEAM', wins: 5, losses: 1 }, { rank: 1, wins: 1, losses: 5 }];
  const runtime = new DurableRuns({ store, callbackBase: 'https://fixture.invalid', token: 'SECRET_TOKEN',
    log: message => logs.push(message), maxAttempts: 1, retryDelay: 0,
    collect: async () => { throw standingsConflictError('C', rows, auditStandings(rows)); },
    fetchImpl: async (_url, init) => {
      delivered.push(JSON.parse(init.body));
      return { ok: acknowledged, status: acknowledged ? 200 : 503, json: async () => ({ runId: RUN_ID,
        deliveryId: init.headers['x-sync-delivery-id'], sequence: Number(init.headers['x-sync-sequence']),
        payloadHash: init.headers['x-sync-payload-sha256'], outcome: 'APPLIED' }) };
    } });
  await runtime.initialize(); await runtime.submit({ runId: RUN_ID }); await runtime.idle();
  assert.equal(store.records.get(RUN_ID).standingsDiagnostic.groupCode, 'C');
  assert.equal(runtime.status(RUN_ID).state, acknowledged ? 'FAILED' : 'AWAITING_ACK');
  assert.match(delivered[0].message, /group=C; issues=RANK_TIE_WITH_DIFFERENT_WIN_RATE/);
  assert.equal(JSON.parse(logs.find(line => JSON.parse(line).event === 'collection_failed')).standings.rows.length, 2);
  assert.ok(!JSON.stringify({ logs, delivered, records: [...store.records.values()] }).includes('SECRET'));
});

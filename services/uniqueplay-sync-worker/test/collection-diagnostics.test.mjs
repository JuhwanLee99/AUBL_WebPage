import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contextualizeCollectionError, safeCollectionDiagnostic, readReadyTable, withCollectionContext } from '../src/collection-diagnostics.mjs';
import { standingsConflictError } from '../src/standings-diagnostics.mjs';
import { DurableRuns } from '../src/durable-runs.mjs';

const context = { groupCode: 'E', table: 'PITCHER_IN', stage: 'READ_TABLE' };
test('transient missing headers are awaited without repeating a click', async () => {
  let reads = 0; let waits = 0;
  const ready = { rows: [{ fixed: ['1', 'Player', 'Team'], values: ['0.00'] }], reason: null };
  assert.equal(await readReadyTable({ context, read: async () => ++reads < 3 ? { rows: [], reason: 'header:ERA:missing' } : ready,
    wait: async () => { waits++; } }), ready);
  assert.equal(reads, 3); assert.equal(waits, 2);
});
test('a genuinely empty player table with verified headers is not fabricated into an error', async () => {
  const result = await readReadyTable({ context, read: async () => ({ rows: [], reason: null }) });
  assert.deepEqual(result.rows, []);
});
for (const [reason, code, safeReason] of [
  ['header:ERA:missing', 'SOURCE_TABLE_NOT_READY', 'HEADER_MISSING'],
  ['headers:PRIVATE_EMAIL|SECRET', 'SOURCE_TABLE_SCHEMA_MISMATCH', 'HEADERS_MISMATCH'],
  ['table-structure', 'SOURCE_TABLE_SCHEMA_MISMATCH', 'TABLE_STRUCTURE'],
  ['standings-row-count-mismatch', 'SOURCE_TABLE_ROW_MISMATCH', 'ROW_COUNT_MISMATCH'],
  ['PRIVATE_SECRET', 'SOURCE_TABLE_SCHEMA_MISMATCH', 'UNKNOWN_TABLE_REASON'],
]) test(`persistent table failure is bounded and typed: ${safeReason}`, async () => {
  let reads = 0; let waits = 0;
  await assert.rejects(readReadyTable({ context, maxAttempts: 3, read: async () => {
    reads++; return { rows: [], reason, fixedRowCount: 5, valueRowCount: 4 };
  }, wait: async () => { waits++; } }), error => {
    assert.equal(error.code, code); assert.equal(error.collectionDiagnostic.reason, safeReason);
    assert.equal(error.collectionDiagnostic.groupCode, 'E'); assert.equal(error.collectionDiagnostic.attempts, 3);
    assert.equal(error.collectionDiagnostic.fixedRowCount, 5);
    assert.ok(!JSON.stringify(error).includes('PRIVATE')); return true;
  });
  assert.equal(reads, 3); assert.equal(waits, 2);
});
test('missing snapshot is a typed bounded failure, not an uncaught TypeError', async () => {
  await assert.rejects(readReadyTable({ read: async () => null, maxAttempts: 1, context }), { code: 'SOURCE_TABLE_SCHEMA_MISMATCH' });
});
test('timeout keeps exact stage without leaking browser errors or cause codes', async () => {
  const original = Object.assign(new Error('SECRET_TOKEN selector dump'), { name: 'TimeoutError', code: 'SECRET_TOKEN' });
  await assert.rejects(withCollectionContext(async () => { throw original; }, { ...context, stage: 'SELECT_TABLE' }), error => {
    assert.equal(error.code, 'SOURCE_UI_TIMEOUT'); assert.equal(error.collectionDiagnostic.stage, 'SELECT_TABLE');
    assert.ok(!JSON.stringify(error).includes('SECRET')); assert.ok(!error.message.includes('SECRET')); return true;
  });
});
test('adapter TypeError and unknown errors receive safe stable codes', () => {
  assert.equal(contextualizeCollectionError(new TypeError('SECRET'), context).code, 'SOURCE_ADAPTER_ERROR');
  assert.equal(contextualizeCollectionError(new Error('SECRET'), context).code, 'SOURCE_COLLECTION_ERROR');
});
for (const code of ['REAUTH_REQUIRED', 'SEASON_MISMATCH', 'SYNC_STORAGE_UNAVAILABLE', 'RUN_ALREADY_TERMINAL', 'COLLECTION_INCOMPLETE']) {
  test(`existing control-flow code is retained: ${code}`, () => {
    assert.equal(contextualizeCollectionError(Object.assign(new Error('SECRET'), { code }), context).code, code);
  });
}
test('innermost diagnostic context survives outer wrappers', () => {
  const inner = contextualizeCollectionError(new Error('SECRET'), context);
  const outer = contextualizeCollectionError(inner, { groupCode: 'A', stage: 'OPEN_RECORDS' });
  assert.deepEqual(outer.collectionDiagnostic, inner.collectionDiagnostic);
});
test('rank evidence survives collection-stage wrapping', () => {
  const inner = standingsConflictError('E', [{ rank: 1, wins: 1, losses: 0 }], [{ code: 'INVALID_RANK', rowIndices: [1] }]);
  const outer = contextualizeCollectionError(inner, { ...context, table: 'STANDINGS', stage: 'AUDIT_STANDINGS' });
  assert.deepEqual(outer.standingsDiagnostic, inner.standingsDiagnostic);
  assert.equal(outer.code, 'STANDINGS_RANK_CONFLICT');
});
test('diagnostics whitelist fields, stages and bounded numbers', () => {
  const result = safeCollectionDiagnostic({ code: 'SOURCE_COLLECTION_ERROR', collectionDiagnostic: {
    groupCode: 'SECRET', table: 'SECRET', stage: 'READ_TABLE', reason: 'SECRET', attempts: 1000,
    fixedRowCount: -1, valueRowCount: 10001, token: 'SECRET', message: 'SECRET',
  } });
  assert.deepEqual(result, { version: 1, groupCode: null, table: null, stage: 'READ_TABLE', reason: null,
    attempts: null, fixedRowCount: null, valueRowCount: null });
  assert.equal(safeCollectionDiagnostic({ code: 'SOURCE_COLLECTION_ERROR', collectionDiagnostic: { stage: 'SECRET' } }), null);
});
for (const maxAttempts of [0, -1, 41, 1.5, NaN]) test(`invalid retry limit is rejected: ${maxAttempts}`, async () => {
  await assert.rejects(readReadyTable({ read: async () => assert.fail('must not read'), maxAttempts }), RangeError);
});
test('read exceptions are classified without repeating a potentially failed operation', async () => {
  let reads = 0;
  await assert.rejects(readReadyTable({ context, read: async () => { reads++; throw Object.assign(new Error('SECRET'), { name: 'TimeoutError' }); } }),
    { code: 'SOURCE_UI_TIMEOUT' });
  assert.equal(reads, 1);
});
test('successful operation returns its original result', async () => {
  const result = {};
  assert.equal(await withCollectionContext(async () => result, context), result);
});

const ID = 'cc336cc0-779c-4264-871d-86e0f39b4986';
class MemoryStore {
  records = new Map();
  async load() { return structuredClone([...this.records.values()]); }
  async write(record) { this.records.set(record.runId, structuredClone(record)); }
}
for (const acknowledged of [true, false]) test(`collection context survives failure ACK=${acknowledged}`, async () => {
  const store = new MemoryStore(); const logs = []; const bodies = [];
  const runtime = new DurableRuns({ store, callbackBase: 'https://fixture.invalid', token: 'SECRET_TOKEN', maxAttempts: 1,
    log: value => logs.push(JSON.parse(value)), collect: async () => {
      throw contextualizeCollectionError(Object.assign(new Error('SECRET DOM'), { name: 'TimeoutError', code: 'SECRET_TOKEN' }),
        { ...context, stage: 'SELECT_TABLE' });
    }, fetchImpl: async (_url, request) => {
      bodies.push(JSON.parse(request.body));
      return { ok: acknowledged, status: acknowledged ? 200 : 503, json: async () => ({
        runId: ID, deliveryId: request.headers['x-sync-delivery-id'], sequence: Number(request.headers['x-sync-sequence']),
        payloadHash: request.headers['x-sync-payload-sha256'], outcome: 'APPLIED',
      }) };
    } });
  await runtime.initialize(); await runtime.submit({ runId: ID }); await runtime.idle();
  assert.equal(runtime.status(ID).state, acknowledged ? 'FAILED' : 'AWAITING_ACK');
  assert.equal(store.records.get(ID).collectionDiagnostic.groupCode, 'E');
  assert.match(bodies[0].message, /group=E; table=PITCHER_IN; stage=SELECT_TABLE/);
  assert.equal(logs.find(log => log.event === 'collection_failed').collection.stage, 'SELECT_TABLE');
  assert.ok(!JSON.stringify({ logs, bodies, records: [...store.records.values()] }).includes('SECRET'));
});

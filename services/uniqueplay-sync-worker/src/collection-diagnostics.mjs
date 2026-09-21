import { safeStandingsDiagnostic } from './standings-diagnostics.mjs';

const TABLES = new Set(['STANDINGS', 'BATTER_IN', 'BATTER_OUT', 'PITCHER_IN', 'PITCHER_OUT']);
const STAGES = new Set(['OPEN_RECORDS', 'SELECT_GROUP', 'SELECT_CATEGORY', 'SELECT_REGULATION',
  'SELECT_TABLE', 'READ_TABLE', 'AUDIT_STANDINGS', 'REPORT_PROGRESS']);
const CODES = new Set(['STANDINGS_RANK_CONFLICT', 'STANDINGS_TABLE_INCOMPLETE', 'STANDINGS_ROW_CONFLICT',
  'COLLECTION_INCOMPLETE', 'SEASON_MISMATCH', 'REAUTH_REQUIRED', 'SYNC_STORAGE_UNAVAILABLE',
  'RUN_ALREADY_TERMINAL', 'BROWSER_STOP_NOT_CONFIRMED', 'SOURCE_UI_TIMEOUT', 'SOURCE_ADAPTER_ERROR',
  'SOURCE_COLLECTION_ERROR', 'SOURCE_TABLE_NOT_READY', 'SOURCE_TABLE_SCHEMA_MISMATCH', 'SOURCE_TABLE_ROW_MISMATCH']);
const REASONS = new Set(['HEADER_MISSING', 'HEADERS_MISMATCH', 'TABLE_STRUCTURE', 'ROW_COUNT_MISMATCH', 'UNKNOWN_TABLE_REASON']);
const bounded = (value, maximum) => Number.isSafeInteger(value) && value >= 0 && value <= maximum ? value : null;

function errorCode(error) {
  if (CODES.has(error?.code)) return error.code;
  if (error?.name === 'TimeoutError') return 'SOURCE_UI_TIMEOUT';
  if (error instanceof TypeError) return 'SOURCE_ADAPTER_ERROR';
  return 'SOURCE_COLLECTION_ERROR';
}

export function safeCollectionDiagnostic(error) {
  const input = error?.collectionDiagnostic;
  if (!input || !CODES.has(error?.code) || !STAGES.has(input.stage)) return null;
  return { version: 1,
    groupCode: typeof input.groupCode === 'string' && /^[A-H]$/u.test(input.groupCode) ? input.groupCode : null,
    table: TABLES.has(input.table) ? input.table : null,
    stage: input.stage,
    reason: REASONS.has(input.reason) ? input.reason : null,
    attempts: bounded(input.attempts, 40),
    fixedRowCount: bounded(input.fixedRowCount, 10000),
    valueRowCount: bounded(input.valueRowCount, 10000),
  };
}

export function contextualizeCollectionError(error, context) {
  const code = errorCode(error);
  const previous = safeCollectionDiagnostic(error);
  const wrapped = Object.assign(new Error(`Collection failed (${code})`, { cause: error }), {
    code, collectionDiagnostic: previous || context,
  });
  wrapped.collectionDiagnostic = safeCollectionDiagnostic(wrapped);
  const standings = safeStandingsDiagnostic(error);
  if (standings) wrapped.standingsDiagnostic = standings;
  return wrapped;
}

export async function withCollectionContext(operation, context) {
  try { return await operation(); }
  catch (error) { throw contextualizeCollectionError(error, context); }
}

function tableReason(reason) {
  if (typeof reason !== 'string') return 'UNKNOWN_TABLE_REASON';
  if (/^header:[^:]*:missing$/u.test(reason)) return 'HEADER_MISSING';
  if (reason.startsWith('headers:')) return 'HEADERS_MISMATCH';
  if (reason === 'table-structure') return 'TABLE_STRUCTURE';
  if (reason === 'standings-row-count-mismatch') return 'ROW_COUNT_MISMATCH';
  return 'UNKNOWN_TABLE_REASON';
}

// Retry only read observations after a UI transition. Do not click again,
// recollect the run, rewrite ranks, or treat malformed rows as an empty table.
export async function readReadyTable({ read, wait = async () => {}, maxAttempts = 12, context = {} }) {
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 40) throw new RangeError('Invalid readiness attempt limit');
  let snapshot;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try { snapshot = await read(); }
    catch (error) { throw contextualizeCollectionError(error, { ...context, stage: 'READ_TABLE', attempts: attempt }); }
    if (snapshot && Array.isArray(snapshot.rows) && !snapshot.reason) return snapshot;
    if (attempt < maxAttempts) await wait();
  }
  const reason = tableReason(snapshot?.reason);
  const code = reason === 'HEADER_MISSING' ? 'SOURCE_TABLE_NOT_READY'
    : reason === 'ROW_COUNT_MISMATCH' ? 'SOURCE_TABLE_ROW_MISMATCH' : 'SOURCE_TABLE_SCHEMA_MISMATCH';
  throw contextualizeCollectionError(Object.assign(new Error(code), { code }), {
    ...context, stage: 'READ_TABLE', reason, attempts: maxAttempts,
    fixedRowCount: snapshot?.fixedRowCount, valueRowCount: snapshot?.valueRowCount,
  });
}

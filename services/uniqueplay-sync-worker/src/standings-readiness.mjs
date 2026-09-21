import { auditStandings } from './standings-audit.mjs';
import { standingsConflictError } from './standings-diagnostics.mjs';

const ISSUE_CODES = new Set([
  'INVALID_RANK', 'INVALID_RECORD_COUNT',
  'RANK_TIE_WITH_DIFFERENT_WIN_RATE', 'RANK_WIN_RATE_ORDER_CONFLICT',
]);
const MAX_DIAGNOSTIC_ROWS = 40;

function safeRank(value) {
  const candidate = typeof value === 'string' && /^\d+$/.test(value.trim())
    ? Number(value.trim()) : value;
  return typeof candidate === 'number' && Number.isSafeInteger(candidate)
    && candidate >= 0 && candidate <= 1_000_000 ? candidate : null;
}

function diagnostic(groupCode, attempt, maxAttempts, raw, converted, issues) {
  return {
    version: 1,
    groupCode,
    table: 'STANDINGS',
    attempt,
    maxAttempts,
    status: issues.length === 0 ? 'recovered' : attempt === maxAttempts ? 'rejected' : 'waiting',
    rowCount: raw.length,
    rawRanks: raw.slice(0, MAX_DIAGNOSTIC_ROWS).map(row => safeRank(row?.fixed?.[0])),
    convertedRanks: converted.slice(0, MAX_DIAGNOSTIC_ROWS).map(row => safeRank(row?.rank)),
    issueCodes: [...new Set(issues.map(issue => issue.code).filter(code => ISSUE_CODES.has(code)))],
    truncated: raw.length > MAX_DIAGNOSTIC_ROWS || converted.length > MAX_DIAGNOSTIC_ROWS,
  };
}

function report(observation) {
  console.warn(`event=standings_readiness diagnostic=${JSON.stringify(observation)}`);
}

/** Re-read inconsistent standings; never calculate or overwrite source ranks. */
export async function collectReadyStandings({
  read,
  convert,
  groupCode,
  wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
  maxAttempts = 4,
  onObservation = report,
}) {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 6) {
    throw new RangeError('Standings readiness attempts must be an integer from 1 to 6');
  }
  if (typeof groupCode !== 'string' || !/^[A-H]$/.test(groupCode)) {
    throw new TypeError('Standings readiness requires a supported group code');
  }
  if ([read, convert, wait, onObservation].some(callback => typeof callback !== 'function')) {
    throw new TypeError('Standings readiness callbacks must be functions');
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    // Transport, authorization, storage, conversion and table-reading failures
    // propagate immediately. Only a completed but inconsistent table is retried.
    const raw = await read();
    if (!Array.isArray(raw) || raw.length === 0) {
      const error = new Error('Standings table is incomplete');
      error.code = 'STANDINGS_TABLE_INCOMPLETE';
      throw error;
    }
    const converted = raw.map(convert);
    const issues = auditStandings(converted);
    if (issues.length > 0 || attempt > 1) {
      onObservation(diagnostic(groupCode, attempt, maxAttempts, raw, converted, issues));
    }
    if (issues.length === 0) return converted;
    if (attempt === maxAttempts) throw standingsConflictError(groupCode, converted, issues);
    await wait(500);
  }
}

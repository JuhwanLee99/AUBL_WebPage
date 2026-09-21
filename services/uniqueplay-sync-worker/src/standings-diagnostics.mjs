const ISSUE_CODES = new Set(['INVALID_RANK', 'INVALID_RECORD_COUNT',
  'RANK_TIE_WITH_DIFFERENT_WIN_RATE', 'RANK_WIN_RATE_ORDER_CONFLICT']);
const MAX_ROWS = 40;
const MAX_ISSUES = 40;

function safeInteger(value, maximum = 1000000) {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/u.test(value.trim()))) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 && number <= maximum ? number : null;
}

// Whitelist again at the logging/storage boundary. Never copy arbitrary error
// messages, team/player names, DOM, credentials, or extra object properties.
export function safeStandingsDiagnostic(error) {
  const input = error?.standingsDiagnostic;
  if (error?.code !== 'STANDINGS_RANK_CONFLICT' || !input || !/^[A-H]$/u.test(input.groupCode ?? '')
    || typeof input.groupCode !== 'string' || !Array.isArray(input.rows) || !Array.isArray(input.issues)) return null;
  const rows = input.rows.slice(0, MAX_ROWS).filter(row => row && typeof row === 'object').map(row => ({
    rowIndex: safeInteger(row.rowIndex, MAX_ROWS),
    rank: safeInteger(row.rank), wins: safeInteger(row.wins), losses: safeInteger(row.losses), draws: safeInteger(row.draws),
  })).filter(row => row.rowIndex !== null && row.rowIndex > 0);
  const indices = new Set(rows.map(row => row.rowIndex));
  const issues = input.issues.slice(0, MAX_ISSUES).filter(issue => issue && ISSUE_CODES.has(issue.code)).map(issue => ({
    code: issue.code,
    rowIndices: Array.isArray(issue.rowIndices) ? issue.rowIndices.slice(0, 2)
      .map(index => safeInteger(index, MAX_ROWS)).filter(index => indices.has(index)) : [],
  }));
  return { version: 1, groupCode: input.groupCode, rows, issues,
    truncated: input.rows.length > MAX_ROWS || input.issues.length > MAX_ISSUES || input.truncated === true };
}

export function standingsConflictError(groupCode, rows, issues) {
  const error = Object.assign(new Error('Source standings failed validation'), {
    code: 'STANDINGS_RANK_CONFLICT',
    standingsDiagnostic: {
      groupCode,
      rows: rows.slice(0, MAX_ROWS).map((row, index) => ({ rowIndex: index + 1,
        rank: row.rank, wins: row.wins, losses: row.losses, draws: row.draws })),
      issues: issues.slice(0, MAX_ISSUES),
      truncated: rows.length > MAX_ROWS || issues.length > MAX_ISSUES,
    },
  });
  error.standingsDiagnostic = safeStandingsDiagnostic(error);
  return error;
}

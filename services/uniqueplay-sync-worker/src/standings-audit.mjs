// Diagnostic only: never rewrites the source rank or decides qualification.
function count(value) {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/u.test(value.trim()))) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function auditStandings(rows) {
  const issues = [];
  const facts = rows.map(row => ({ rank: count(row.rank), wins: count(row.wins), losses: count(row.losses) }));
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const a = facts[i];
    if (!a.rank) {
      issues.push({ code: 'INVALID_RANK', teams: [row.teamName], rowIndices: [i + 1] });
    }
    if (a.wins === null || a.losses === null) {
      issues.push({ code: 'INVALID_RECORD_COUNT', teams: [row.teamName], rowIndices: [i + 1] });
    }
    for (let j = i + 1; j < rows.length; j += 1) {
      const other = rows[j]; const b = facts[j];
      if (!a.rank || !b.rank || [a.wins, a.losses, b.wins, b.losses].includes(null)) continue;
      const aDecisions = BigInt(a.wins) + BigInt(a.losses);
      const bDecisions = BigInt(b.wins) + BigInt(b.losses);
      if (!aDecisions || !bDecisions) continue;
      const difference = BigInt(a.wins) * bDecisions - BigInt(b.wins) * aDecisions;
      if (a.rank === b.rank && difference !== 0n) {
        issues.push({ code: 'RANK_TIE_WITH_DIFFERENT_WIN_RATE', teams: [row.teamName, other.teamName], rowIndices: [i + 1, j + 1] });
      }
      if ((a.rank > b.rank && difference > 0n) || (a.rank < b.rank && difference < 0n)) {
        issues.push({ code: 'RANK_WIN_RATE_ORDER_CONFLICT', teams: [row.teamName, other.teamName], rowIndices: [i + 1, j + 1] });
      }
    }
  }
  return issues;
}

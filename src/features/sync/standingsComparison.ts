export interface ComparisonStanding {
  teamName: string;
  localTeamId: string | null;
  rank: number | null;
  wins: number | null;
  losses: number | null;
  draws: number | null;
}

export interface ComparisonEntry {
  key: string;
  before: ComparisonStanding | null;
  source: ComparisonStanding | null;
  ambiguous: boolean;
}

const number = (value: unknown, minimum = 0): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum ? value : null;

function rows(value: unknown): ComparisonStanding[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry: unknown) => {
    const row = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {};
    const id = row.localTeamId;
    return {
      teamName: typeof row.teamName === 'string' ? row.teamName.trim() : '',
      localTeamId: (typeof id === 'string' && /^[1-9]\d*$/.test(id)) ? id
        : (typeof id === 'number' && Number.isSafeInteger(id) && id > 0) ? String(id) : null,
      rank: number(row.rank, 1), wins: number(row.wins), losses: number(row.losses), draws: number(row.draws),
    };
  });
}

export function compareStandings(beforeValue: unknown, sourceValue: unknown) {
  const before = rows(beforeValue), source = rows(sourceValue);
  const buckets = new Map<string, { before: ComparisonStanding[]; source: ComparisonStanding[] }>();
  const add = (row: ComparisonStanding, side: 'before' | 'source', index: number) => {
    // Exact normalized names are a legacy fallback, never fuzzy matching or row position matching.
    const key = row.localTeamId ? `id:${row.localTeamId}` : row.teamName
      ? `name:${row.teamName.normalize('NFKC').replace(/\s+/g, '').toLowerCase()}` : `unknown:${side}:${index}`;
    const bucket = buckets.get(key) ?? { before: [], source: [] };
    bucket[side].push(row); buckets.set(key, bucket);
  };
  before.forEach((row, index) => add(row, 'before', index));
  source.forEach((row, index) => add(row, 'source', index));
  const entries = [...buckets].flatMap<ComparisonEntry>(([key, bucket]) => {
    const ambiguous = bucket.before.length > 1 || bucket.source.length > 1;
    if (!ambiguous) return [{ key, before: bucket.before[0] ?? null, source: bucket.source[0] ?? null, ambiguous }];
    return [
      ...bucket.before.map((row, index) => ({ key: `${key}:before:${index}`, before: row, source: null, ambiguous })),
      ...bucket.source.map((row, index) => ({ key: `${key}:source:${index}`, before: null, source: row, ambiguous })),
    ];
  });
  return { entries, beforeAvailable: Array.isArray(beforeValue), sourceAvailable: Array.isArray(sourceValue),
    ambiguous: entries.some(entry => entry.ambiguous),
    invalid: [...before, ...source].some(row => !row.teamName || row.rank === null || row.wins === null || row.losses === null || row.draws === null) };
}

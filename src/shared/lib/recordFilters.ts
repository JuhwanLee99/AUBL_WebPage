import type {
  BatterRankingSort,
  PitcherRankingSort,
  RecordFilterParams,
  RecordGroup,
  RecordFilterOptions,
  RecordPlayoffDivision,
  RecordScope,
} from '../api/backendClient';

export interface RecordFilterState {
  scope: RecordScope;
  group: RecordGroup;
  playoffDivision: RecordPlayoffDivision;
}

export const DEFAULT_RECORD_FILTERS: RecordFilterState = {
  scope: 'ALL',
  group: 'ALL',
  playoffDivision: 'ALL',
};

export const RECORD_SCOPE_OPTIONS: Array<{ value: RecordScope; label: string }> = [
  { value: 'ALL', label: '전체' },
  { value: 'LEAGUE', label: '리그' },
  { value: 'PLAYOFF', label: '플레이오프' },
];

export const RECORD_SCOPE_OPTIONS_NO_PLAYOFF: Array<{ value: RecordScope; label: string }> = [
  { value: 'ALL', label: '전체' },
  { value: 'LEAGUE', label: '리그' },
];

export const RECORD_GROUP_OPTIONS: Array<{ value: RecordGroup; label: string }> = [
  { value: 'ALL', label: '전체 조' },
  { value: 'A', label: 'A조' },
  { value: 'B', label: 'B조' },
  { value: 'C', label: 'C조' },
  { value: 'D', label: 'D조' },
  { value: 'E', label: 'E조' },
  { value: 'F', label: 'F조' },
  { value: 'G', label: 'G조' },
  { value: 'H', label: 'H조' },
];

export const PLAYOFF_DIVISION_OPTIONS: Array<{
  value: RecordPlayoffDivision;
  label: string;
}> = [
  { value: 'ALL', label: '전체' },
  { value: 'EUTTEUM', label: '으뜸' },
  { value: 'BEOGEUM', label: '버금' },
];

export const DEFAULT_BATTER_SORT_OPTIONS: Array<{ value: BatterRankingSort; label: string }> = [
  { value: 'battingAverage', label: 'AVG' },
  { value: 'ops', label: 'OPS' },
  { value: 'onBasePct', label: 'OBP' },
  { value: 'sluggingPct', label: 'SLG' },
  { value: 'hits', label: 'H' },
  { value: 'homeRuns', label: 'HR' },
  { value: 'rbi', label: 'RBI' },
  { value: 'gamesPlayed', label: 'G' },
  { value: 'plateAppearance', label: 'PA' },
  { value: 'stolenBases', label: 'SB' },
];

export const DEFAULT_PITCHER_SORT_OPTIONS: Array<{ value: PitcherRankingSort; label: string }> = [
  { value: 'era', label: 'ERA' },
  { value: 'whip', label: 'WHIP' },
  { value: 'strikeouts', label: 'K' },
  { value: 'wins', label: 'W' },
  { value: 'saves', label: 'SV' },
  { value: 'inningsPitched', label: 'IP' },
  { value: 'walksAllowed', label: 'BB' },
  { value: 'gamesPlayed', label: 'G' },
];

const PART_CODE_TO_GROUP: Record<string, Exclude<RecordGroup, 'ALL'>> = {
  '1': 'A',
  '2': 'B',
  '3': 'C',
  '4': 'D',
  '5': 'E',
  '6': 'F',
  '7': 'G',
  '8': 'H',
  A: 'A',
  B: 'B',
  C: 'C',
  D: 'D',
  E: 'E',
  F: 'F',
  G: 'G',
  H: 'H',
};

export function normalizeSeasonType(
  value: string | null | undefined,
): RecordPlayoffDivision | 'LEAGUE' | 'PLAYOFF' | null {
  if (!value) return null;
  const raw = value.trim().toUpperCase();
  if (!raw) return null;
  if (raw.includes('EUTTEUM') || raw.includes('으뜸')) return 'EUTTEUM';
  if (raw.includes('BEOGEUM') || raw.includes('버금')) return 'BEOGEUM';
  if (raw.includes('PLAYOFF') || raw.includes('포스트')) return 'PLAYOFF';
  return 'LEAGUE';
}

export function normalizeScope(value: string | null | undefined): RecordScope | null {
  if (!value) return null;
  const raw = value.trim().toUpperCase();
  if (!raw) return null;
  if (raw.includes('PLAYOFF') || raw.includes('포스트')) return 'PLAYOFF';
  if (raw.includes('LEAGUE') || raw.includes('REGULAR') || raw.includes('정규') || raw.includes('리그')) {
    return 'LEAGUE';
  }
  return null;
}

export function resolveGroupFromRecord(
  partCode: string | null | undefined,
  _teamName: string | null | undefined,
): Exclude<RecordGroup, 'ALL'> | null {
  const normalizedPart = partCode?.trim().toUpperCase() ?? '';
  if (normalizedPart && PART_CODE_TO_GROUP[normalizedPart]) {
    return PART_CODE_TO_GROUP[normalizedPart];
  }
  // Do not infer group from static team-name mapping.
  // Historical season groups can differ; only backend-provided partCode is trusted.
  return null;
}

export function matchesRecordFilters(
  row: {
    teamName?: string | null;
    partCode?: string | null;
    seasonType?: string | null;
    scope?: string | null;
  },
  filters: RecordFilterState,
): boolean {
  if (filters.group !== 'ALL') {
    const resolvedGroup = resolveGroupFromRecord(row.partCode, row.teamName);
    if (resolvedGroup !== filters.group) return false;
  }

  const rowSeasonType = normalizeSeasonType(row.seasonType);
  const rowScope = normalizeScope(row.scope);

  if (filters.scope === 'LEAGUE') {
    if (rowScope === 'PLAYOFF') return false;
    if (rowSeasonType === 'PLAYOFF' || rowSeasonType === 'EUTTEUM' || rowSeasonType === 'BEOGEUM') return false;
  }

  if (filters.scope === 'PLAYOFF') {
    const isPlayoff =
      rowScope === 'PLAYOFF' ||
      rowSeasonType === 'PLAYOFF' ||
      rowSeasonType === 'EUTTEUM' ||
      rowSeasonType === 'BEOGEUM';
    if (!isPlayoff) return false;
  }

  if (filters.playoffDivision !== 'ALL') {
    if (rowSeasonType !== filters.playoffDivision) return false;
  }

  return true;
}

export function hasPlayoffMetadata(
  row: { seasonType?: string | null; scope?: string | null } | null | undefined,
): boolean {
  if (!row) return false;
  const rowSeasonType = normalizeSeasonType(row.seasonType);
  const rowScope = normalizeScope(row.scope);
  return (
    rowSeasonType === 'PLAYOFF' ||
    rowSeasonType === 'EUTTEUM' ||
    rowSeasonType === 'BEOGEUM' ||
    rowScope === 'PLAYOFF'
  );
}

export function supportsPlayoffFiltering(
  rows: Array<{ seasonType?: string | null; scope?: string | null }>,
): boolean {
  return rows.some((row) => hasPlayoffMetadata(row));
}

export function toRecordFilterParams(filters: RecordFilterState): RecordFilterParams | undefined {
  if (
    filters.scope === 'ALL' &&
    filters.group === 'ALL' &&
    filters.playoffDivision === 'ALL'
  ) {
    return undefined;
  }
  return {
    scope: filters.scope,
    group: filters.group,
    playoffDivision: filters.playoffDivision,
  };
}

export function groupLabelFromRecord(
  partCode: string | null | undefined,
  teamName: string | null | undefined,
): string {
  const group = resolveGroupFromRecord(partCode, teamName);
  return group ? `${group}조` : '-';
}

export function buildScopeOptions(
  options: RecordFilterOptions | null | undefined,
  allowPlayoff: boolean,
): Array<{ value: RecordScope; label: string }> {
  const allowed = new Set((options?.scopes ?? []).map((item) => item.toUpperCase()));
  const includeLeague = allowed.size === 0 || allowed.has('LEAGUE');
  const includePlayoff = allowPlayoff && (allowed.size === 0 || allowed.has('PLAYOFF'));

  const result: Array<{ value: RecordScope; label: string }> = [{ value: 'ALL', label: '전체' }];
  if (includeLeague) result.push({ value: 'LEAGUE', label: '리그' });
  if (includePlayoff) result.push({ value: 'PLAYOFF', label: '플레이오프' });
  return result;
}

export function buildGroupOptions(
  options: RecordFilterOptions | null | undefined,
): Array<{ value: RecordGroup; label: string }> {
  const groups = options?.groups ?? [];
  if (groups.length === 0) return RECORD_GROUP_OPTIONS;
  return [
    { value: 'ALL', label: '전체 조' },
    ...groups
      .map((item) => item.group.trim().toUpperCase())
      .filter((group): group is Exclude<RecordGroup, 'ALL'> =>
        group === 'A' ||
        group === 'B' ||
        group === 'C' ||
        group === 'D' ||
        group === 'E' ||
        group === 'F' ||
        group === 'G' ||
        group === 'H',
      )
      .map((group) => ({ value: group, label: `${group}조` })),
  ];
}

export function buildPlayoffDivisionOptions(
  options: RecordFilterOptions | null | undefined,
): Array<{ value: RecordPlayoffDivision; label: string }> {
  const allowed = new Set((options?.playoffDivisions ?? []).map((item) => item.toUpperCase()));
  const includeEutteum = allowed.size === 0 || allowed.has('EUTTEUM');
  const includeBeogeum = allowed.size === 0 || allowed.has('BEOGEUM');
  const result: Array<{ value: RecordPlayoffDivision; label: string }> = [{ value: 'ALL', label: '전체' }];
  if (includeEutteum) result.push({ value: 'EUTTEUM', label: '으뜸' });
  if (includeBeogeum) result.push({ value: 'BEOGEUM', label: '버금' });
  return result;
}

export function buildBatterSortOptions(
  options: RecordFilterOptions | null | undefined,
): Array<{ value: BatterRankingSort; label: string }> {
  const allowed = new Set(options?.batterSortOptions ?? []);
  if (allowed.size === 0) return DEFAULT_BATTER_SORT_OPTIONS;
  const filtered = DEFAULT_BATTER_SORT_OPTIONS.filter((item) => allowed.has(item.value));
  return filtered.length > 0 ? filtered : DEFAULT_BATTER_SORT_OPTIONS;
}

export function buildPitcherSortOptions(
  options: RecordFilterOptions | null | undefined,
): Array<{ value: PitcherRankingSort; label: string }> {
  const allowed = new Set(options?.pitcherSortOptions ?? []);
  if (allowed.size === 0) return DEFAULT_PITCHER_SORT_OPTIONS;
  const filtered = DEFAULT_PITCHER_SORT_OPTIONS.filter((item) => allowed.has(item.value));
  return filtered.length > 0 ? filtered : DEFAULT_PITCHER_SORT_OPTIONS;
}

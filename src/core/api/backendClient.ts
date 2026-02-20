import { getAuth } from 'firebase/auth';

const ENV_BASE_URL = (import.meta.env.VITE_BACKEND_API_URL || '').trim();
const IS_DEFAULT_API_ORIGIN = /^https?:\/\/api\.aubl\.club\/?$/.test(ENV_BASE_URL);
const BASE_URL =
  import.meta.env.DEV && (!ENV_BASE_URL || IS_DEFAULT_API_ORIGIN)
    ? ''
    : ENV_BASE_URL || 'https://api.aubl.club';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const user = getAuth().currentUser;
  if (!user) return {};
  const token = await user.getIdToken();
  return {
    Authorization: `Bearer ${token}`,
  };
}

async function fetchApi<T>(path: string, init?: RequestInit): Promise<T> {
  const authHeaders = await getAuthHeaders();
  const headers = new Headers(init?.headers ?? {});
  Object.entries(authHeaders).forEach(([key, value]) => headers.set(key, value));

  const hasBody = init?.body !== undefined && init.body !== null;
  if (hasBody && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers });
  if (!res.ok) {
    let detail = '';
    try { detail = await res.text(); } catch { /* ignore */ }
    throw new Error(`API error ${res.status}: ${res.statusText}${detail ? ` — ${detail}` : ''}`);
  }
  return res.json();
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

// ── Player Stats ──

export interface PlayerStatsSummary {
  playerId: number;
  playerName: string;
  teamName: string;
  jerseyNumber: string;
  batterStats: BatterStat[];
  pitcherStats: PitcherStat[];
}

export interface BatterStat {
  batterStatId: number;
  seasonId: number;
  gamesPlayed: number;
  plateAppearance: number;
  atBats: number;
  hits: number;
  doubles: number;
  triples: number;
  homeRuns: number;
  runsBattedIn: number;
  runsScored: number;
  stolenBases: number;
  caughtStealing: number;
  walks: number;
  strikeouts: number;
  hitByPitch: number;
  sacrificeHits: number;
  sacrificeFlies: number;
  battingAverage: number;
  onBasePct: number;
  sluggingPct: number;
  ops: number;
}

export interface PitcherStat {
  pitcherStatId: number;
  seasonId: number;
  gamesPlayed: number;
  gamesStarted: number;
  inningsPitched: number;
  wins: number;
  losses: number;
  saves: number;
  holds: number;
  hitsAllowed: number;
  runsAllowed: number;
  earnedRuns: number;
  homeRunsAllowed: number;
  walksAllowed: number;
  strikeouts: number;
  era: number;
  whip: number;
  kPer9: number;
  bbPer9: number;
}

export async function getPlayerStats(
  playerId: number,
  seasonId?: number,
): Promise<PlayerStatsSummary> {
  const params = seasonId ? `?seasonId=${seasonId}` : '';
  const raw = await fetchApi<unknown>(`/api/players/${playerId}/stats${params}`);
  const fallback = {
    playerId,
    playerName: `선수 #${playerId}`,
    teamName: '',
    jerseyNumber: '',
    batterStats: [],
    pitcherStats: [],
  } satisfies PlayerStatsSummary;
  if (!raw || typeof raw !== 'object') return fallback;

  const payload = raw as Record<string, unknown>;
  const toNumber = (value: unknown, defaultValue = 0): number => toFiniteNumber(value) ?? defaultValue;
  const toText = (value: unknown, defaultValue = ''): string =>
    typeof value === 'string' ? value : defaultValue;

  const normalizeBatter = (entry: unknown): BatterStat | null => {
    if (!entry || typeof entry !== 'object') return null;
    const row = entry as Record<string, unknown>;
    const resolvedSeasonId = toFiniteNumber(row.seasonId ?? row.season_id) ?? seasonId;
    if (resolvedSeasonId == null) return null;

    return {
      batterStatId: toNumber(row.batterStatId ?? row.id),
      gamesPlayed: toNumber(row.gamesPlayed),
      plateAppearance: toNumber(row.plateAppearance),
      atBats: toNumber(row.atBats),
      hits: toNumber(row.hits),
      doubles: toNumber(row.doubles),
      triples: toNumber(row.triples),
      homeRuns: toNumber(row.homeRuns),
      runsBattedIn: toNumber(row.runsBattedIn ?? row.rbi),
      runsScored: toNumber(row.runsScored ?? row.runs),
      stolenBases: toNumber(row.stolenBases),
      caughtStealing: toNumber(row.caughtStealing),
      walks: toNumber(row.walks),
      strikeouts: toNumber(row.strikeouts),
      hitByPitch: toNumber(row.hitByPitch),
      sacrificeHits: toNumber(row.sacrificeHits),
      sacrificeFlies: toNumber(row.sacrificeFlies),
      battingAverage: toNumber(row.battingAverage ?? row.avg),
      onBasePct: toNumber(row.onBasePct ?? row.obp),
      sluggingPct: toNumber(row.sluggingPct ?? row.slg),
      ops: toNumber(row.ops),
      seasonId: resolvedSeasonId,
    };
  };

  const normalizePitcher = (entry: unknown): PitcherStat | null => {
    if (!entry || typeof entry !== 'object') return null;
    const row = entry as Record<string, unknown>;
    const resolvedSeasonId = toFiniteNumber(row.seasonId ?? row.season_id) ?? seasonId;
    if (resolvedSeasonId == null) return null;

    return {
      pitcherStatId: toNumber(row.pitcherStatId ?? row.id),
      gamesPlayed: toNumber(row.gamesPlayed),
      gamesStarted: toNumber(row.gamesStarted),
      inningsPitched: toNumber(row.inningsPitched),
      wins: toNumber(row.wins),
      losses: toNumber(row.losses),
      saves: toNumber(row.saves),
      holds: toNumber(row.holds),
      hitsAllowed: toNumber(row.hitsAllowed),
      runsAllowed: toNumber(row.runsAllowed),
      earnedRuns: toNumber(row.earnedRuns),
      homeRunsAllowed: toNumber(row.homeRunsAllowed ?? row.homeRunsAllow),
      walksAllowed: toNumber(row.walksAllowed ?? row.walks),
      strikeouts: toNumber(row.strikeouts),
      era: toNumber(row.era),
      whip: toNumber(row.whip),
      kPer9: toNumber(row.kPer9),
      bbPer9: toNumber(row.bbPer9),
      seasonId: resolvedSeasonId,
    };
  };

  const batterSource = Array.isArray(payload.batterStats)
    ? payload.batterStats
    : Array.isArray(payload.batter_stats)
      ? payload.batter_stats
    : payload.batterStat
      ? [payload.batterStat]
      : [];

  const pitcherSource = Array.isArray(payload.pitcherStats)
    ? payload.pitcherStats
    : Array.isArray(payload.pitcher_stats)
      ? payload.pitcher_stats
    : payload.pitcherStat
      ? [payload.pitcherStat]
      : [];

  const readJersey = (entry: unknown): string => {
    if (!entry || typeof entry !== 'object') return '';
    const row = entry as Record<string, unknown>;
    const value = row.jerseyNumber ?? row.backNumber ?? row.uniformNumber ?? row.number;
    if (value == null) return '';
    return String(value).trim();
  };

  const readTeamName = (entry: unknown): string => {
    if (!entry || typeof entry !== 'object') return '';
    const row = entry as Record<string, unknown>;
    const value = row.teamName ?? row.team_name ?? row.team;
    return typeof value === 'string' ? value : '';
  };

  const readPlayerName = (entry: unknown): string => {
    if (!entry || typeof entry !== 'object') return '';
    const row = entry as Record<string, unknown>;
    const value = row.playerName ?? row.player_name ?? row.name;
    return typeof value === 'string' ? value : '';
  };

  const jerseyNumber =
    readJersey(payload) ||
    readJersey(batterSource[0]) ||
    readJersey(pitcherSource[0]) ||
    '';

  const teamName =
    toText(payload.teamName ?? payload.team_name) ||
    readTeamName(batterSource[0]) ||
    readTeamName(pitcherSource[0]) ||
    '';

  return {
    playerId: toNumber(payload.playerId, playerId),
    playerName:
      toText(payload.playerName ?? payload.player_name) ||
      readPlayerName(batterSource[0]) ||
      readPlayerName(pitcherSource[0]) ||
      fallback.playerName,
    teamName,
    jerseyNumber,
    batterStats: batterSource.map(normalizeBatter).filter((item): item is BatterStat => item !== null),
    pitcherStats: pitcherSource.map(normalizePitcher).filter((item): item is PitcherStat => item !== null),
  };
}

// ── Rankings ──

export interface BatterRanking {
  rank: number;
  playerId: number;
  playerName: string;
  teamId: number;
  teamName: string;
  seasonId: number;
  seasonYear: number | null;
  jerseyNumber: string;
  gamesPlayed: number;
  plateAppearance: number;
  atBats: number;
  hits: number;
  homeRuns: number;
  runsBattedIn: number;
  stolenBases: number;
  walks: number;
  strikeouts: number;
  battingAverage: number;
  onBasePct: number;
  sluggingPct: number;
  ops: number;
  partCode: string | null;
  group: string | null;
  seasonType: string | null;
  scope: string | null;
  regulation: string | null;
}

export interface PitcherRanking {
  rank: number;
  playerId: number;
  playerName: string;
  teamId: number;
  teamName: string;
  seasonId: number;
  seasonYear: number | null;
  jerseyNumber: string;
  gamesPlayed: number;
  inningsPitched: number;
  wins: number;
  losses: number;
  saves: number;
  strikeouts: number;
  walksAllowed: number;
  era: number;
  whip: number;
  partCode: string | null;
  group: string | null;
  seasonType: string | null;
  scope: string | null;
  regulation: string | null;
}

export interface SeasonSummary {
  id: number;
  year: number;
}

export interface TeamSummary {
  id: number;
  teamName: string;
  teamCode: string;
}

export interface TeamRecordStanding {
  teamId: number;
  teamName: string;
  wins: number;
  losses: number;
  ties: number;
  winPct: number;
  partCode: string | null;
  group: string | null;
  seasonType: string | null;
  scope: string | null;
}

export interface RecordsOverview {
  seasonId: number;
  totalGames: number;
  totalTeams: number;
  topBatter: BatterRanking | null;
  topPitcher: PitcherRanking | null;
}

export interface PlayoffSummaryRow {
  teamId: number;
  teamName: string;
  playoffTier: string;
  playoffRound: string;
  finalsPoints: number;
  seasonId: number;
  seasonYear: number | null;
  partCode: string | null;
  group: string | null;
  seasonType: string | null;
  scope: string | null;
}

export interface PowerRankingApiRow {
  rank: number;
  teamId: number;
  teamName: string;
  weightedScore: number;
  y1Score: number;
  y2Score: number;
  y3Score: number;
  windowYears: number[];
  calcVersion: string | null;
}

export interface PowerRankingSeasonScoreRow {
  teamId: number;
  teamName: string;
  year: number;
  prelimRaw: number;
  prelimNormalized: number;
  finalsPoints: number;
  total: number;
}

export interface PlayerLookup {
  playerId: number;
  playerName: string;
  teamName: string;
  jerseyNumber: string;
  seasonId: number;
  seasonYear: number | null;
}

export interface PlayerRosterItem {
  seasonId: number;
  teamId: number;
  teamName: string;
  teamCode: string;
  teamPlayerId: number;
  playerId: number;
  playerName: string;
  jerseyNumber: string;
  hasBatterStats: boolean;
  hasPitcherStats: boolean;
}

export interface PlayerRosterResponse {
  items: PlayerRosterItem[];
  nextCursor: string | null;
  hasNext: boolean;
  totalCount: number;
}

export type RecordScope = 'ALL' | 'LEAGUE' | 'PLAYOFF';
export type RecordPlayoffDivision = 'ALL' | 'EUTTEUM' | 'BEOGEUM';
export type RecordGroup = 'ALL' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H';
export type RecordRegulation = 'ALL' | 'IN' | 'OUT';

export interface RecordFilterParams {
  scope?: RecordScope;
  group?: RecordGroup;
  playoffDivision?: RecordPlayoffDivision;
}

export type BatterRankingSort =
  | 'battingAverage'
  | 'hits'
  | 'homeRuns'
  | 'rbi'
  | 'ops'
  | 'sluggingPct'
  | 'onBasePct';

export type PitcherRankingSort = 'era' | 'whip' | 'strikeouts' | 'wins' | 'saves';

function toStringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function toDisplayString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'bigint') return String(value);
  return fallback;
}

function toRegulationValue(value: unknown): string | null {
  if (typeof value === 'string') {
    const normalized = value.trim().toUpperCase();
    if (normalized === 'IN' || normalized === 'OUT') return normalized;
  }
  if (typeof value === 'boolean') {
    return value ? 'OUT' : 'IN';
  }
  if (typeof value === 'number') {
    if (value === 0) return 'IN';
    if (value === 1) return 'OUT';
  }
  return null;
}

function toNumberArray(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => toFiniteNumber(item))
      .filter((item): item is number => item != null);
  }
  if (typeof value === 'string' && value.trim()) {
    return value
      .split(',')
      .map((item) => toFiniteNumber(item.trim()))
      .filter((item): item is number => item != null);
  }
  return [];
}

function normalizeRankingLimit(limit: number | undefined): number | null {
  if (limit == null || !Number.isFinite(limit)) return null;
  const normalized = Math.trunc(limit);
  if (normalized <= 0) return 0;
  return Math.min(normalized, 100);
}

function isNotFoundError(err: unknown): boolean {
  return err instanceof Error && err.message.includes('404');
}

function isBadRequestError(err: unknown): boolean {
  return err instanceof Error && err.message.includes('400');
}

function buildSortAttempts(primary?: string, legacy?: string): Array<string | undefined> {
  const attempts: Array<string | undefined> = [];
  const seen = new Set<string>();
  const push = (value: string | undefined) => {
    const key = value ?? '__none__';
    if (seen.has(key)) return;
    seen.add(key);
    attempts.push(value);
  };
  push(primary);
  push(legacy);
  push(undefined);
  return attempts;
}

function buildQuery(opts: {
  seasonId: number;
  limit?: number;
  sort?: string;
  filters?: RecordFilterParams;
  regulation?: RecordRegulation;
}): URLSearchParams {
  const params = new URLSearchParams();
  params.set('seasonId', String(opts.seasonId));
  const limit = normalizeRankingLimit(opts.limit);
  if (limit != null) params.set('limit', String(limit));
  if (opts.sort) params.set('sort', opts.sort);
  if (opts.regulation && opts.regulation !== 'ALL') {
    params.set('regulation', opts.regulation);
  }
  applyRecordFilters(params, opts.filters);
  return params;
}

const GROUP_TO_PART_CODE: Record<Exclude<RecordGroup, 'ALL'>, string> = {
  A: '1',
  B: '2',
  C: '3',
  D: '4',
  E: '5',
  F: '6',
  G: '7',
  H: '8',
};

function applyRecordFilters(params: URLSearchParams, filters: RecordFilterParams | undefined): void {
  if (!filters) return;

  const scope = filters.scope && filters.scope !== 'ALL' ? filters.scope : null;
  if (scope) {
    params.set('scope', scope);
  }

  const group = filters.group && filters.group !== 'ALL' ? filters.group : null;
  if (group) {
    params.set('group', group);
    params.set('partCode', GROUP_TO_PART_CODE[group]);
  }

  const playoffDivision =
    filters.playoffDivision && filters.playoffDivision !== 'ALL' ? filters.playoffDivision : null;
  if (playoffDivision) {
    params.set('seasonType', playoffDivision);
    params.set('division', playoffDivision);
  }
}

function hasActiveRecordFilters(filters: RecordFilterParams | undefined): boolean {
  if (!filters) return false;
  return Boolean(
    (filters.scope && filters.scope !== 'ALL') ||
      (filters.group && filters.group !== 'ALL') ||
      (filters.playoffDivision && filters.playoffDivision !== 'ALL'),
  );
}

function normalizeBatterRankingRow(
  entry: unknown,
  fallbackSeasonId: number,
  fallbackRank: number,
): BatterRanking | null {
  if (!entry || typeof entry !== 'object') return null;
  const row = entry as Record<string, unknown>;
  const playerId = toFiniteNumber(row.playerId ?? row.player_id);
  if (playerId == null) return null;
  const playerName =
    toStringValue(row.playerName ?? row.player_name ?? row.name) || `선수 #${playerId}`;

  return {
    rank: toFiniteNumber(row.rank ?? row.ranking) ?? fallbackRank,
    playerId,
    playerName,
    teamId: toFiniteNumber(row.teamId ?? row.team_id) ?? 0,
    teamName: toStringValue(row.teamName ?? row.team_name),
    seasonId: toFiniteNumber(row.seasonId ?? row.season_id) ?? fallbackSeasonId,
    seasonYear: toFiniteNumber(row.seasonYear ?? row.season_year ?? row.year),
    jerseyNumber: toDisplayString(row.jerseyNumber ?? row.backNumber ?? row.uniformNumber ?? row.number),
    gamesPlayed: toFiniteNumber(row.gamesPlayed ?? row.games_played) ?? 0,
    plateAppearance: toFiniteNumber(row.plateAppearance ?? row.plate_appearance) ?? 0,
    atBats: toFiniteNumber(row.atBats ?? row.at_bats) ?? 0,
    hits: toFiniteNumber(row.hits) ?? 0,
    homeRuns: toFiniteNumber(row.homeRuns ?? row.home_runs ?? row.hr) ?? 0,
    runsBattedIn: toFiniteNumber(row.runsBattedIn ?? row.runs_batted_in ?? row.rbi) ?? 0,
    stolenBases: toFiniteNumber(row.stolenBases ?? row.stolen_bases ?? row.sb) ?? 0,
    walks: toFiniteNumber(row.walks ?? row.bb) ?? 0,
    strikeouts: toFiniteNumber(row.strikeouts ?? row.so) ?? 0,
    battingAverage: toFiniteNumber(row.battingAverage ?? row.batting_average ?? row.avg) ?? 0,
    onBasePct: toFiniteNumber(row.onBasePct ?? row.on_base_pct ?? row.obp) ?? 0,
    sluggingPct: toFiniteNumber(row.sluggingPct ?? row.slugging_pct ?? row.slg) ?? 0,
    ops: toFiniteNumber(row.ops) ?? 0,
    partCode: toStringValue(row.partCode ?? row.part_code ?? row.groupCode ?? row.group_code) || null,
    group: toStringValue(row.group ?? row.groupName ?? row.group_name) || null,
    seasonType: toStringValue(row.seasonType ?? row.season_type ?? row.division) || null,
    scope: toStringValue(row.scope ?? row.recordType ?? row.record_type ?? row.gameType ?? row.game_type) || null,
    regulation:
      toRegulationValue(row.regulation ?? row.regulationType ?? row.regulation_type ?? row.outside) ?? null,
  };
}

function normalizePitcherRankingRow(
  entry: unknown,
  fallbackSeasonId: number,
  fallbackRank: number,
): PitcherRanking | null {
  if (!entry || typeof entry !== 'object') return null;
  const row = entry as Record<string, unknown>;
  const playerId = toFiniteNumber(row.playerId ?? row.player_id);
  if (playerId == null) return null;
  const playerName =
    toStringValue(row.playerName ?? row.player_name ?? row.name) || `선수 #${playerId}`;

  return {
    rank: toFiniteNumber(row.rank ?? row.ranking) ?? fallbackRank,
    playerId,
    playerName,
    teamId: toFiniteNumber(row.teamId ?? row.team_id) ?? 0,
    teamName: toStringValue(row.teamName ?? row.team_name),
    seasonId: toFiniteNumber(row.seasonId ?? row.season_id) ?? fallbackSeasonId,
    seasonYear: toFiniteNumber(row.seasonYear ?? row.season_year ?? row.year),
    jerseyNumber: toDisplayString(row.jerseyNumber ?? row.backNumber ?? row.uniformNumber ?? row.number),
    gamesPlayed: toFiniteNumber(row.gamesPlayed ?? row.games_played) ?? 0,
    inningsPitched: toFiniteNumber(row.inningsPitched ?? row.innings_pitched ?? row.ip) ?? 0,
    wins: toFiniteNumber(row.wins ?? row.w) ?? 0,
    losses: toFiniteNumber(row.losses ?? row.l) ?? 0,
    saves: toFiniteNumber(row.saves ?? row.sv) ?? 0,
    strikeouts: toFiniteNumber(row.strikeouts ?? row.so) ?? 0,
    walksAllowed: toFiniteNumber(row.walksAllowed ?? row.walks_allowed ?? row.walks ?? row.bb) ?? 0,
    era: toFiniteNumber(row.era) ?? 0,
    whip: toFiniteNumber(row.whip) ?? 0,
    partCode: toStringValue(row.partCode ?? row.part_code ?? row.groupCode ?? row.group_code) || null,
    group: toStringValue(row.group ?? row.groupName ?? row.group_name) || null,
    seasonType: toStringValue(row.seasonType ?? row.season_type ?? row.division) || null,
    scope: toStringValue(row.scope ?? row.recordType ?? row.record_type ?? row.gameType ?? row.game_type) || null,
    regulation:
      toRegulationValue(row.regulation ?? row.regulationType ?? row.regulation_type ?? row.outside) ?? null,
  };
}

function normalizeBatterRankings(raw: unknown, seasonId: number): BatterRanking[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry, index) => normalizeBatterRankingRow(entry, seasonId, index + 1))
    .filter((row): row is BatterRanking => row !== null);
}

function normalizePitcherRankings(raw: unknown, seasonId: number): PitcherRanking[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry, index) => normalizePitcherRankingRow(entry, seasonId, index + 1))
    .filter((row): row is PitcherRanking => row !== null);
}

export async function getBatterRankings(opts: {
  seasonId: number;
  limit?: number;
  sort?: BatterRankingSort;
  filters?: RecordFilterParams;
  regulation?: RecordRegulation;
}): Promise<BatterRanking[]> {
  if (!Number.isInteger(opts.seasonId) || opts.seasonId <= 0) {
    throw new Error('seasonId is required and must be a positive integer.');
  }
  const params = buildQuery(opts);
  const qs = params.toString();
  try {
    const raw = await fetchApi<unknown>(`/api/rankings/batters${qs ? `?${qs}` : ''}`);
    return normalizeBatterRankings(raw, opts.seasonId);
  } catch (err) {
    if (isBadRequestError(err) && hasActiveRecordFilters(opts.filters)) {
      const fallbackParams = buildQuery({ ...opts, filters: undefined });
      const fallbackQs = fallbackParams.toString();
      const raw = await fetchApi<unknown>(`/api/rankings/batters${fallbackQs ? `?${fallbackQs}` : ''}`);
      return normalizeBatterRankings(raw, opts.seasonId);
    }
    if (!isNotFoundError(err)) throw err;
  }

  const legacySortMap: Partial<Record<BatterRankingSort, string>> = {
    battingAverage: 'avg',
    hits: 'hits',
    homeRuns: 'hr',
    rbi: 'rbi',
    ops: 'ops',
  };
  const legacySort = opts.sort ? legacySortMap[opts.sort] : undefined;
  const sortAttempts = buildSortAttempts(opts.sort, legacySort);
  let lastError: unknown = null;

  for (const sort of sortAttempts) {
    const fallbackParams = buildQuery({ ...opts, sort });
    const fallbackQs = fallbackParams.toString();
    try {
      const raw = await fetchApi<unknown>(`/api/records/batters${fallbackQs ? `?${fallbackQs}` : ''}`);
      return normalizeBatterRankings(raw, opts.seasonId);
    } catch (err) {
      if (isBadRequestError(err) && hasActiveRecordFilters(opts.filters)) {
        const noFilterParams = buildQuery({ ...opts, sort, filters: undefined });
        const noFilterQs = noFilterParams.toString();
        const raw = await fetchApi<unknown>(`/api/records/batters${noFilterQs ? `?${noFilterQs}` : ''}`);
        return normalizeBatterRankings(raw, opts.seasonId);
      }
      lastError = err;
      if (isBadRequestError(err) && sort !== undefined) continue;
      throw err;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('타자 랭킹을 불러오지 못했습니다.');
}

export async function getPitcherRankings(opts: {
  seasonId: number;
  limit?: number;
  sort?: PitcherRankingSort;
  filters?: RecordFilterParams;
  regulation?: RecordRegulation;
}): Promise<PitcherRanking[]> {
  if (!Number.isInteger(opts.seasonId) || opts.seasonId <= 0) {
    throw new Error('seasonId is required and must be a positive integer.');
  }
  const params = buildQuery(opts);
  const qs = params.toString();
  try {
    const raw = await fetchApi<unknown>(`/api/rankings/pitchers${qs ? `?${qs}` : ''}`);
    return normalizePitcherRankings(raw, opts.seasonId);
  } catch (err) {
    if (isBadRequestError(err) && hasActiveRecordFilters(opts.filters)) {
      const fallbackParams = buildQuery({ ...opts, filters: undefined });
      const fallbackQs = fallbackParams.toString();
      const raw = await fetchApi<unknown>(`/api/rankings/pitchers${fallbackQs ? `?${fallbackQs}` : ''}`);
      return normalizePitcherRankings(raw, opts.seasonId);
    }
    if (!isNotFoundError(err)) throw err;
  }

  const legacySortMap: Partial<Record<PitcherRankingSort, string>> = {
    era: 'era',
    whip: 'whip',
    strikeouts: 'so',
    wins: 'wins',
    saves: 'saves',
  };
  const legacySort = opts.sort ? legacySortMap[opts.sort] : undefined;
  const sortAttempts = buildSortAttempts(opts.sort, legacySort);
  let lastError: unknown = null;

  for (const sort of sortAttempts) {
    const fallbackParams = buildQuery({ ...opts, sort });
    const fallbackQs = fallbackParams.toString();
    try {
      const raw = await fetchApi<unknown>(`/api/records/pitchers${fallbackQs ? `?${fallbackQs}` : ''}`);
      return normalizePitcherRankings(raw, opts.seasonId);
    } catch (err) {
      if (isBadRequestError(err) && hasActiveRecordFilters(opts.filters)) {
        const noFilterParams = buildQuery({ ...opts, sort, filters: undefined });
        const noFilterQs = noFilterParams.toString();
        const raw = await fetchApi<unknown>(`/api/records/pitchers${noFilterQs ? `?${noFilterQs}` : ''}`);
        return normalizePitcherRankings(raw, opts.seasonId);
      }
      lastError = err;
      if (isBadRequestError(err) && sort !== undefined) continue;
      throw err;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('투수 랭킹을 불러오지 못했습니다.');
}

export async function getPlayerSearchIndex(seasonId: number): Promise<PlayerLookup[]> {
  if (!Number.isInteger(seasonId) || seasonId <= 0) {
    throw new Error('seasonId is required and must be a positive integer.');
  }

  try {
    const rosterItems = await getAllPlayerRosterItems(seasonId);
    if (rosterItems.length > 0) {
      return rosterItems
        .map((item) => ({
          playerId: item.playerId,
          playerName: item.playerName,
          teamName: item.teamName,
          jerseyNumber: item.jerseyNumber,
          seasonId: item.seasonId,
          seasonYear: null,
        }))
        .sort((a, b) => {
          const byName = a.playerName.localeCompare(b.playerName, 'ko');
          if (byName !== 0) return byName;
          return a.teamName.localeCompare(b.teamName, 'ko');
        });
    }
  } catch (err) {
    if (!isNotFoundError(err) && !isBadRequestError(err)) throw err;
  }

  const [battersResult, pitchersResult] = await Promise.allSettled([
    getBatterRankings({ seasonId, limit: 0, sort: 'battingAverage' }),
    getPitcherRankings({ seasonId, limit: 0, sort: 'era' }),
  ]);

  const batters = battersResult.status === 'fulfilled' ? battersResult.value : [];
  const pitchers = pitchersResult.status === 'fulfilled' ? pitchersResult.value : [];

  if (battersResult.status === 'rejected' && pitchersResult.status === 'rejected') {
    throw new Error('선수 검색 인덱스를 불러오지 못했습니다.');
  }

  const byPlayerId = new Map<number, PlayerLookup>();

  const upsert = (row: {
    playerId: number;
    playerName: string;
    teamName: string;
    jerseyNumber: string;
    seasonId: number;
    seasonYear: number | null;
  }) => {
    const existing = byPlayerId.get(row.playerId);
    if (!existing) {
      byPlayerId.set(row.playerId, { ...row });
      return;
    }
    byPlayerId.set(row.playerId, {
      ...existing,
      teamName: existing.teamName || row.teamName,
      jerseyNumber: existing.jerseyNumber || row.jerseyNumber,
      seasonYear: existing.seasonYear ?? row.seasonYear,
    });
  };

  batters.forEach((row) => upsert(row));
  pitchers.forEach((row) => upsert(row));

  return [...byPlayerId.values()].sort((a, b) => {
    const byName = a.playerName.localeCompare(b.playerName, 'ko');
    if (byName !== 0) return byName;
    return a.teamName.localeCompare(b.teamName, 'ko');
  });
}

function normalizePlayerRosterItem(entry: unknown, fallbackSeasonId: number): PlayerRosterItem | null {
  if (!entry || typeof entry !== 'object') return null;
  const row = entry as Record<string, unknown>;
  const teamPlayerId = toFiniteNumber(row.teamPlayerId ?? row.team_player_id ?? row.tpId ?? row.tp_id);
  const playerId = toFiniteNumber(row.playerId ?? row.player_id);
  const teamId = toFiniteNumber(row.teamId ?? row.team_id);
  if (teamPlayerId == null || playerId == null || teamId == null) return null;

  return {
    seasonId: toFiniteNumber(row.seasonId ?? row.season_id) ?? fallbackSeasonId,
    teamId,
    teamName: toStringValue(row.teamName ?? row.team_name),
    teamCode: toStringValue(row.teamCode ?? row.team_code),
    teamPlayerId,
    playerId,
    playerName: toStringValue(row.playerName ?? row.player_name ?? row.name),
    jerseyNumber: row.jerseyNumber == null ? '' : String(row.jerseyNumber),
    hasBatterStats: Boolean(row.hasBatterStats ?? row.has_batter_stats),
    hasPitcherStats: Boolean(row.hasPitcherStats ?? row.has_pitcher_stats),
  };
}

function normalizePlayerRosterResponse(raw: unknown, seasonId: number): PlayerRosterResponse {
  if (!raw || typeof raw !== 'object') {
    return { items: [], nextCursor: null, hasNext: false, totalCount: 0 };
  }

  const payload = raw as Record<string, unknown>;
  const sourceItems = Array.isArray(payload.items) ? payload.items : [];
  const items = sourceItems
    .map((entry) => normalizePlayerRosterItem(entry, seasonId))
    .filter((item): item is PlayerRosterItem => item !== null);

  return {
    items,
    nextCursor: toStringValue(payload.nextCursor ?? payload.next_cursor) || null,
    hasNext: Boolean(payload.hasNext ?? payload.has_next),
    totalCount: toFiniteNumber(payload.totalCount ?? payload.total_count) ?? items.length,
  };
}

export async function getPlayerRoster(params: {
  seasonId: number;
  teamId?: number;
  q?: string;
  limit?: number;
  cursor?: string;
}): Promise<PlayerRosterResponse> {
  if (!Number.isInteger(params.seasonId) || params.seasonId <= 0) {
    throw new Error('seasonId is required and must be a positive integer.');
  }

  const query = new URLSearchParams({ seasonId: String(params.seasonId) });
  if (params.teamId != null && Number.isInteger(params.teamId) && params.teamId > 0) {
    query.set('teamId', String(params.teamId));
  }
  if (params.q && params.q.trim()) query.set('q', params.q.trim());
  const limit = params.limit != null ? Math.min(Math.max(Math.trunc(params.limit), 1), 500) : 500;
  query.set('limit', String(limit));
  if (params.cursor && params.cursor.trim()) query.set('cursor', params.cursor.trim());

  const raw = await fetchApi<unknown>(`/api/players/roster?${query.toString()}`);
  return normalizePlayerRosterResponse(raw, params.seasonId);
}

async function getAllPlayerRosterItems(seasonId: number): Promise<PlayerRosterItem[]> {
  const allItems: PlayerRosterItem[] = [];
  const seenTeamPlayerIds = new Set<number>();
  let cursor: string | undefined;

  for (let i = 0; i < 20; i += 1) {
    const page = await getPlayerRoster({ seasonId, cursor, limit: 500 });
    page.items.forEach((item) => {
      if (seenTeamPlayerIds.has(item.teamPlayerId)) return;
      seenTeamPlayerIds.add(item.teamPlayerId);
      allItems.push(item);
    });

    if (!page.hasNext || !page.nextCursor) break;
    if (cursor === page.nextCursor) break;
    cursor = page.nextCursor;
  }

  return allItems;
}

export async function getSeasons(): Promise<SeasonSummary[]> {
  const raw = await fetchApi<unknown>('/api/seasons');
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const id = toFiniteNumber(row.id ?? row.seasonId);
      const year = toFiniteNumber(row.year ?? row.seasonYear);
      if (id == null || year == null) return null;
      return { id, year };
    })
    .filter((item): item is SeasonSummary => item !== null)
    .sort((a, b) => b.year - a.year);
}

function normalizeTeams(raw: unknown): TeamSummary[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const id = toFiniteNumber(row.id ?? row.teamId);
      const teamName = toStringValue(row.teamName ?? row.team_name ?? row.name);
      if (id == null || !teamName) return null;
      return {
        id,
        teamName,
        teamCode: toStringValue(row.teamCode ?? row.team_code ?? row.code),
      } satisfies TeamSummary;
    })
    .filter((item): item is TeamSummary => item !== null)
    .sort((a, b) => a.teamName.localeCompare(b.teamName, 'ko'));
}

export async function getTeams(): Promise<TeamSummary[]> {
  try {
    const raw = await fetchApi<unknown>('/api/teams');
    return normalizeTeams(raw);
  } catch (err) {
    if (!isNotFoundError(err)) throw err;
  }
  const fallbackRaw = await fetchApi<unknown>('/api/team');
  return normalizeTeams(fallbackRaw);
}

export async function getRecordOverview(
  seasonId: number,
  filters?: RecordFilterParams,
): Promise<RecordsOverview> {
  if (!Number.isInteger(seasonId) || seasonId <= 0) {
    throw new Error('seasonId is required and must be a positive integer.');
  }
  const params = new URLSearchParams({ seasonId: String(seasonId) });
  applyRecordFilters(params, filters);
  let raw: unknown;
  try {
    raw = await fetchApi<unknown>(`/api/records/overview?${params.toString()}`);
  } catch (err) {
    if (isBadRequestError(err) && hasActiveRecordFilters(filters)) {
      raw = await fetchApi<unknown>(`/api/records/overview?seasonId=${seasonId}`);
    } else {
      throw err;
    }
  }
  if (!raw || typeof raw !== 'object') {
    return {
      seasonId,
      totalGames: 0,
      totalTeams: 0,
      topBatter: null,
      topPitcher: null,
    };
  }
  const row = raw as Record<string, unknown>;
  const topBatter =
    normalizeBatterRankingRow(row.topBatter, seasonId, 1) ??
    normalizeBatterRankingRow(row.bestBatter, seasonId, 1);
  const topPitcher =
    normalizePitcherRankingRow(row.topPitcher, seasonId, 1) ??
    normalizePitcherRankingRow(row.bestPitcher, seasonId, 1);

  return {
    seasonId: toFiniteNumber(row.seasonId) ?? seasonId,
    totalGames: toFiniteNumber(row.totalGames) ?? 0,
    totalTeams: toFiniteNumber(row.totalTeams) ?? 0,
    topBatter,
    topPitcher,
  };
}

export async function getTeamRecordStandings(
  seasonId: number,
  filters?: RecordFilterParams,
): Promise<TeamRecordStanding[]> {
  if (!Number.isInteger(seasonId) || seasonId <= 0) {
    throw new Error('seasonId is required and must be a positive integer.');
  }
  const params = new URLSearchParams({ seasonId: String(seasonId) });
  applyRecordFilters(params, filters);
  let raw: unknown;
  try {
    raw = await fetchApi<unknown>(`/api/records/teams?${params.toString()}`);
  } catch (err) {
    if (isBadRequestError(err) && hasActiveRecordFilters(filters)) {
      raw = await fetchApi<unknown>(`/api/records/teams?seasonId=${seasonId}`);
    } else {
      throw err;
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const teamId = toFiniteNumber(row.teamId ?? row.id);
      const teamName = toStringValue(row.teamName ?? row.name);
      if (teamId == null || !teamName) return null;
      return {
        teamId,
        teamName,
        wins: toFiniteNumber(row.wins) ?? 0,
        losses: toFiniteNumber(row.losses) ?? 0,
        ties: toFiniteNumber(row.ties ?? row.draws) ?? 0,
        winPct: toFiniteNumber(row.winPct ?? row.winPercentage) ?? 0,
        partCode: toStringValue(row.partCode ?? row.part_code ?? row.groupCode ?? row.group_code) || null,
        group: toStringValue(row.group ?? row.groupName ?? row.group_name) || null,
        seasonType: toStringValue(row.seasonType ?? row.season_type ?? row.division) || null,
        scope: toStringValue(row.scope ?? row.recordType ?? row.record_type ?? row.gameType ?? row.game_type) || null,
      };
    })
    .filter((item): item is TeamRecordStanding => item !== null)
    .sort((a, b) => b.winPct - a.winPct || b.wins - a.wins || a.losses - b.losses);
}

export async function getPlayoffSummaries(
  seasonId: number,
  filters?: RecordFilterParams,
): Promise<PlayoffSummaryRow[]> {
  if (!Number.isInteger(seasonId) || seasonId <= 0) {
    throw new Error('seasonId is required and must be a positive integer.');
  }
  const params = new URLSearchParams({ seasonId: String(seasonId) });
  applyRecordFilters(params, filters);
  let raw: unknown;
  try {
    raw = await fetchApi<unknown>(`/api/records/playoffs?${params.toString()}`);
  } catch (err) {
    if (isBadRequestError(err) && hasActiveRecordFilters(filters)) {
      raw = await fetchApi<unknown>(`/api/records/playoffs?seasonId=${seasonId}`);
    } else if (isNotFoundError(err)) {
      return [];
    } else {
      throw err;
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const teamId = toFiniteNumber(row.teamId ?? row.team_id ?? row.id);
      const teamName = toStringValue(row.teamName ?? row.team_name ?? row.name);
      if (teamId == null || !teamName) return null;
      const tier = toStringValue(
        row.playoffTier ?? row.playoff_tier ?? row.tier ?? row.seasonType ?? row.season_type,
      );
      return {
        teamId,
        teamName,
        playoffTier: tier,
        playoffRound: toStringValue(
          row.playoffRound ?? row.playoff_round ?? row.round ?? row.stage,
        ),
        finalsPoints: toFiniteNumber(row.finalsPoints ?? row.finals_points ?? row.points) ?? 0,
        seasonId: toFiniteNumber(row.seasonId ?? row.season_id) ?? seasonId,
        seasonYear: toFiniteNumber(row.seasonYear ?? row.season_year ?? row.year),
        partCode: toStringValue(row.partCode ?? row.part_code ?? row.groupCode ?? row.group_code) || null,
        group: toStringValue(row.group) || null,
        seasonType:
          toStringValue(row.seasonType ?? row.season_type ?? row.division ?? row.playoffTier ?? row.playoff_tier) ||
          null,
        scope:
          toStringValue(row.scope ?? row.recordType ?? row.record_type ?? row.gameType ?? row.game_type) || 'PLAYOFF',
      } satisfies PlayoffSummaryRow;
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

export async function getPowerRankings(params: {
  rankingYear: number;
  limit?: number;
}): Promise<PowerRankingApiRow[]> {
  if (!Number.isInteger(params.rankingYear) || params.rankingYear <= 0) {
    throw new Error('rankingYear is required and must be a positive integer.');
  }
  const query = new URLSearchParams({ rankingYear: String(params.rankingYear) });
  if (params.limit != null && Number.isFinite(params.limit)) {
    query.set('limit', String(Math.max(0, Math.min(200, Math.trunc(params.limit)))));
  }
  let raw: unknown;
  try {
    raw = await fetchApi<unknown>(`/api/records/power-ranking?${query.toString()}`);
  } catch (err) {
    if (isNotFoundError(err)) return [];
    throw err;
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, index) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const teamId = toFiniteNumber(row.teamId ?? row.team_id ?? row.id);
      const teamName = toStringValue(row.teamName ?? row.team_name ?? row.name);
      if (teamId == null || !teamName) return null;
      return {
        rank: toFiniteNumber(row.rank ?? row.ranking) ?? index + 1,
        teamId,
        teamName,
        weightedScore: toFiniteNumber(row.weightedScore ?? row.weighted_score ?? row.total) ?? 0,
        y1Score: toFiniteNumber(row.y1Score ?? row.y1_score ?? row.year1) ?? 0,
        y2Score: toFiniteNumber(row.y2Score ?? row.y2_score ?? row.year2) ?? 0,
        y3Score: toFiniteNumber(row.y3Score ?? row.y3_score ?? row.year3) ?? 0,
        windowYears: toNumberArray(row.windowYears ?? row.window_years),
        calcVersion: toStringValue(row.calcVersion ?? row.calc_version) || null,
      } satisfies PowerRankingApiRow;
    })
    .filter((item): item is PowerRankingApiRow => item !== null);
}

export async function getPowerRankingSeasonScores(params: {
  teamId: number;
  fromYear: number;
  toYear: number;
}): Promise<PowerRankingSeasonScoreRow[]> {
  if (!Number.isInteger(params.teamId) || params.teamId <= 0) {
    throw new Error('teamId is required and must be a positive integer.');
  }
  const query = new URLSearchParams({
    teamId: String(params.teamId),
    fromYear: String(params.fromYear),
    toYear: String(params.toYear),
  });
  let raw: unknown;
  try {
    raw = await fetchApi<unknown>(`/api/records/power-ranking/season-scores?${query.toString()}`);
  } catch (err) {
    if (isNotFoundError(err)) return [];
    throw err;
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      return {
        teamId: toFiniteNumber(row.teamId ?? row.team_id) ?? params.teamId,
        teamName: toStringValue(row.teamName ?? row.team_name ?? row.name),
        year: toFiniteNumber(row.year) ?? 0,
        prelimRaw: toFiniteNumber(row.prelimRaw ?? row.prelim_raw) ?? 0,
        prelimNormalized: toFiniteNumber(row.prelimNormalized ?? row.prelim_normalized) ?? 0,
        finalsPoints: toFiniteNumber(row.finalsPoints ?? row.finals_points) ?? 0,
        total: toFiniteNumber(row.total) ?? 0,
      } satisfies PowerRankingSeasonScoreRow;
    })
    .filter((item): item is PowerRankingSeasonScoreRow => item !== null);
}

// ── Game Logs ──

export interface BatterGameLog {
  batterGlId: number;
  teamId: number;
  playerId: number;
  gameId: number;
  teamSide: string;
  playerName: string;
  playerPosition: string;
  jerseyNumber: string;
  atBats: number;
  runs: number;
  hits: number;
  rbi: number;
  walks: number;
  strikeouts: number;
}

export interface PitcherGameLog {
  pitcherGlId: number;
  teamId: number;
  playerId: number;
  gameId: number;
  teamSide: string;
  playerName: string;
  playerPosition: string;
  jerseyNumber: string;
  inningsPitched: number;
  hitsAllowed: number;
  runsAllowed: number;
  earnedRuns: number;
  walks: number;
  strikeouts: number;
}

export interface PlayerGameLogsResponse {
  batterLogs: BatterGameLog[];
  pitcherLogs: PitcherGameLog[];
}

export async function getPlayerGameLogs(
  playerId: number,
  gameId?: number,
): Promise<PlayerGameLogsResponse> {
  const params = gameId ? `?gameId=${gameId}` : '';
  const raw = await fetchApi<unknown>(`/api/players/${playerId}/game-logs${params}`);
  if (!raw || typeof raw !== 'object') {
    return { batterLogs: [], pitcherLogs: [] };
  }
  const payload = raw as Record<string, unknown>;
  const toNumber = (value: unknown): number => toFiniteNumber(value) ?? 0;
  const toText = (value: unknown): string => (typeof value === 'string' ? value : '');

  const batterLogs = (Array.isArray(payload.batterLogs) ? payload.batterLogs : [])
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const row = entry as Record<string, unknown>;
      return {
        batterGlId: toNumber(row.batterGlId ?? row.id),
        teamId: toNumber(row.teamId ?? row.team_idx),
        playerId: toNumber(row.playerId ?? row.player_idx),
        gameId: toNumber(row.gameId ?? row.game_idx),
        teamSide: toText(row.teamSide ?? row.team_side),
        playerName: toText(row.playerName ?? row.player_name),
        playerPosition: toText(row.playerPosition ?? row.player_position),
        jerseyNumber: toText(row.jerseyNumber ?? row.jersey_number ?? row.backNumber ?? row.uniformNumber),
        atBats: toNumber(row.atBats ?? row.at_bats),
        runs: toNumber(row.runs),
        hits: toNumber(row.hits),
        rbi: toNumber(row.rbi),
        walks: toNumber(row.walks),
        strikeouts: toNumber(row.strikeouts),
      } satisfies BatterGameLog;
    })
    .filter((item): item is BatterGameLog => item !== null);

  const pitcherLogs = (Array.isArray(payload.pitcherLogs) ? payload.pitcherLogs : [])
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const row = entry as Record<string, unknown>;
      return {
        pitcherGlId: toNumber(row.pitcherGlId ?? row.id),
        teamId: toNumber(row.teamId ?? row.team_idx),
        playerId: toNumber(row.playerId ?? row.player_idx),
        gameId: toNumber(row.gameId ?? row.game_idx),
        teamSide: toText(row.teamSide ?? row.team_side),
        playerName: toText(row.playerName ?? row.player_name),
        playerPosition: toText(row.playerPosition ?? row.player_position),
        jerseyNumber: toText(row.jerseyNumber ?? row.jersey_number ?? row.backNumber ?? row.uniformNumber),
        inningsPitched: toNumber(row.inningsPitched ?? row.innings_pitched),
        hitsAllowed: toNumber(row.hitsAllowed ?? row.hits_allowed),
        runsAllowed: toNumber(row.runsAllowed ?? row.runs_allowed),
        earnedRuns: toNumber(row.earnedRuns ?? row.earned_runs),
        walks: toNumber(row.walks),
        strikeouts: toNumber(row.strikeouts),
      } satisfies PitcherGameLog;
    })
    .filter((item): item is PitcherGameLog => item !== null);

  return { batterLogs, pitcherLogs };
}

// ── Firestore Import (admin) ──

export async function triggerMatchImport(matchId: string): Promise<void> {
  await fetchApi(`/api/import/firestore/matches/${matchId}`, { method: 'POST' });
}

export async function triggerBulkImport(): Promise<void> {
  await fetchApi('/api/import/firestore/matches', { method: 'POST' });
}

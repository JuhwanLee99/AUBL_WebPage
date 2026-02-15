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
    throw new Error(`API error ${res.status}: ${res.statusText}`);
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
}

export interface SeasonSummary {
  id: number;
  year: number;
}

export interface TeamRecordStanding {
  teamId: number;
  teamName: string;
  wins: number;
  losses: number;
  ties: number;
  winPct: number;
}

export interface RecordsOverview {
  seasonId: number;
  totalGames: number;
  totalTeams: number;
  topBatter: BatterRanking | null;
  topPitcher: PitcherRanking | null;
}

export interface PlayerLookup {
  playerId: number;
  playerName: string;
  teamName: string;
  jerseyNumber: string;
  seasonId: number;
  seasonYear: number | null;
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

type RankingApiSource = 'unknown' | 'rankings' | 'records';

let batterRankingApiSource: RankingApiSource = 'unknown';
let pitcherRankingApiSource: RankingApiSource = 'unknown';

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
}): URLSearchParams {
  const params = new URLSearchParams();
  params.set('seasonId', String(opts.seasonId));
  const limit = normalizeRankingLimit(opts.limit);
  if (limit != null) params.set('limit', String(limit));
  if (opts.sort) params.set('sort', opts.sort);
  return params;
}

function normalizeBatterRankingRow(
  entry: unknown,
  fallbackSeasonId: number,
  fallbackRank: number,
): BatterRanking | null {
  if (!entry || typeof entry !== 'object') return null;
  const row = entry as Record<string, unknown>;
  const playerId = toFiniteNumber(row.playerId);
  const playerName = toStringValue(row.playerName);
  if (playerId == null || !playerName) return null;

  return {
    rank: toFiniteNumber(row.rank) ?? fallbackRank,
    playerId,
    playerName,
    teamId: toFiniteNumber(row.teamId) ?? 0,
    teamName: toStringValue(row.teamName),
    seasonId: toFiniteNumber(row.seasonId) ?? fallbackSeasonId,
    seasonYear: toFiniteNumber(row.seasonYear ?? row.year),
    jerseyNumber: toStringValue(row.jerseyNumber ?? row.backNumber ?? row.uniformNumber ?? row.number),
    gamesPlayed: toFiniteNumber(row.gamesPlayed) ?? 0,
    plateAppearance: toFiniteNumber(row.plateAppearance) ?? 0,
    atBats: toFiniteNumber(row.atBats) ?? 0,
    hits: toFiniteNumber(row.hits) ?? 0,
    homeRuns: toFiniteNumber(row.homeRuns ?? row.hr) ?? 0,
    runsBattedIn: toFiniteNumber(row.runsBattedIn ?? row.rbi) ?? 0,
    stolenBases: toFiniteNumber(row.stolenBases ?? row.sb) ?? 0,
    walks: toFiniteNumber(row.walks ?? row.bb) ?? 0,
    strikeouts: toFiniteNumber(row.strikeouts ?? row.so) ?? 0,
    battingAverage: toFiniteNumber(row.battingAverage ?? row.avg) ?? 0,
    onBasePct: toFiniteNumber(row.onBasePct ?? row.obp) ?? 0,
    sluggingPct: toFiniteNumber(row.sluggingPct ?? row.slg) ?? 0,
    ops: toFiniteNumber(row.ops) ?? 0,
  };
}

function normalizePitcherRankingRow(
  entry: unknown,
  fallbackSeasonId: number,
  fallbackRank: number,
): PitcherRanking | null {
  if (!entry || typeof entry !== 'object') return null;
  const row = entry as Record<string, unknown>;
  const playerId = toFiniteNumber(row.playerId);
  const playerName = toStringValue(row.playerName);
  if (playerId == null || !playerName) return null;

  return {
    rank: toFiniteNumber(row.rank) ?? fallbackRank,
    playerId,
    playerName,
    teamId: toFiniteNumber(row.teamId) ?? 0,
    teamName: toStringValue(row.teamName),
    seasonId: toFiniteNumber(row.seasonId) ?? fallbackSeasonId,
    seasonYear: toFiniteNumber(row.seasonYear ?? row.year),
    jerseyNumber: toStringValue(row.jerseyNumber ?? row.backNumber ?? row.uniformNumber ?? row.number),
    gamesPlayed: toFiniteNumber(row.gamesPlayed) ?? 0,
    inningsPitched: toFiniteNumber(row.inningsPitched ?? row.ip) ?? 0,
    wins: toFiniteNumber(row.wins ?? row.w) ?? 0,
    losses: toFiniteNumber(row.losses ?? row.l) ?? 0,
    saves: toFiniteNumber(row.saves ?? row.sv) ?? 0,
    strikeouts: toFiniteNumber(row.strikeouts ?? row.so) ?? 0,
    walksAllowed: toFiniteNumber(row.walksAllowed ?? row.walks ?? row.bb) ?? 0,
    era: toFiniteNumber(row.era) ?? 0,
    whip: toFiniteNumber(row.whip) ?? 0,
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
}): Promise<BatterRanking[]> {
  if (!Number.isInteger(opts.seasonId) || opts.seasonId <= 0) {
    throw new Error('seasonId is required and must be a positive integer.');
  }
  if (batterRankingApiSource !== 'records') {
    const params = buildQuery(opts);
    const qs = params.toString();
    try {
      const raw = await fetchApi<unknown>(`/api/rankings/batters${qs ? `?${qs}` : ''}`);
      batterRankingApiSource = 'rankings';
      return normalizeBatterRankings(raw, opts.seasonId);
    } catch (err) {
      if (isNotFoundError(err)) {
        batterRankingApiSource = 'records';
      } else {
        throw err;
      }
    }
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
      batterRankingApiSource = 'records';
      return normalizeBatterRankings(raw, opts.seasonId);
    } catch (err) {
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
}): Promise<PitcherRanking[]> {
  if (!Number.isInteger(opts.seasonId) || opts.seasonId <= 0) {
    throw new Error('seasonId is required and must be a positive integer.');
  }
  if (pitcherRankingApiSource !== 'records') {
    const params = buildQuery(opts);
    const qs = params.toString();
    try {
      const raw = await fetchApi<unknown>(`/api/rankings/pitchers${qs ? `?${qs}` : ''}`);
      pitcherRankingApiSource = 'rankings';
      return normalizePitcherRankings(raw, opts.seasonId);
    } catch (err) {
      if (isNotFoundError(err)) {
        pitcherRankingApiSource = 'records';
      } else {
        throw err;
      }
    }
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
      pitcherRankingApiSource = 'records';
      return normalizePitcherRankings(raw, opts.seasonId);
    } catch (err) {
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

export async function getRecordOverview(seasonId: number): Promise<RecordsOverview> {
  if (!Number.isInteger(seasonId) || seasonId <= 0) {
    throw new Error('seasonId is required and must be a positive integer.');
  }
  const raw = await fetchApi<unknown>(`/api/records/overview?seasonId=${seasonId}`);
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

export async function getTeamRecordStandings(seasonId: number): Promise<TeamRecordStanding[]> {
  if (!Number.isInteger(seasonId) || seasonId <= 0) {
    throw new Error('seasonId is required and must be a positive integer.');
  }
  const raw = await fetchApi<unknown>(`/api/records/teams?seasonId=${seasonId}`);
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
      };
    })
    .filter((item): item is TeamRecordStanding => item !== null)
    .sort((a, b) => b.winPct - a.winPct || b.wins - a.wins || a.losses - b.losses);
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

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
    const resolvedSeasonId = toFiniteNumber(row.seasonId) ?? seasonId;
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
    const resolvedSeasonId = toFiniteNumber(row.seasonId) ?? seasonId;
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
    : payload.batterStat
      ? [payload.batterStat]
      : [];

  const pitcherSource = Array.isArray(payload.pitcherStats)
    ? payload.pitcherStats
    : payload.pitcherStat
      ? [payload.pitcherStat]
      : [];

  return {
    playerId: toNumber(payload.playerId, playerId),
    playerName: toText(payload.playerName, fallback.playerName),
    teamName: toText(payload.teamName),
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

export type BatterRankingSort =
  | 'battingAverage'
  | 'hits'
  | 'homeRuns'
  | 'rbi'
  | 'ops'
  | 'sluggingPct'
  | 'onBasePct';

export type PitcherRankingSort = 'era' | 'whip' | 'strikeouts' | 'wins' | 'saves';

function normalizeRankingLimit(limit: number | undefined): number | null {
  if (limit == null || !Number.isFinite(limit)) return null;
  const normalized = Math.trunc(limit);
  if (normalized <= 0) return 0;
  return Math.min(normalized, 100);
}

function isNotFoundError(err: unknown): boolean {
  return err instanceof Error && err.message.includes('404');
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

export async function getBatterRankings(opts: {
  seasonId: number;
  limit?: number;
  sort?: BatterRankingSort;
}): Promise<BatterRanking[]> {
  if (!Number.isInteger(opts.seasonId) || opts.seasonId <= 0) {
    throw new Error('seasonId is required and must be a positive integer.');
  }
  const params = buildQuery(opts);
  const qs = params.toString();
  try {
    return await fetchApi(`/api/rankings/batters${qs ? `?${qs}` : ''}`);
  } catch (err) {
    if (isNotFoundError(err)) {
      const legacySortMap: Partial<Record<BatterRankingSort, string>> = {
        battingAverage: 'avg',
        hits: 'hits',
        homeRuns: 'hr',
        rbi: 'rbi',
        ops: 'ops',
      };
      const legacySort = opts.sort ? legacySortMap[opts.sort] : undefined;
      const fallbackParams = buildQuery({ ...opts, sort: legacySort });
      const fallbackQs = fallbackParams.toString();
      return fetchApi(`/api/records/batters${fallbackQs ? `?${fallbackQs}` : ''}`);
    }
    throw err;
  }
}

export async function getPitcherRankings(opts: {
  seasonId: number;
  limit?: number;
  sort?: PitcherRankingSort;
}): Promise<PitcherRanking[]> {
  if (!Number.isInteger(opts.seasonId) || opts.seasonId <= 0) {
    throw new Error('seasonId is required and must be a positive integer.');
  }
  const params = buildQuery(opts);
  const qs = params.toString();
  try {
    return await fetchApi(`/api/rankings/pitchers${qs ? `?${qs}` : ''}`);
  } catch (err) {
    if (isNotFoundError(err)) {
      const legacySortMap: Partial<Record<PitcherRankingSort, string>> = {
        era: 'era',
        whip: 'whip',
        strikeouts: 'so',
        wins: 'wins',
        saves: 'saves',
      };
      const legacySort = opts.sort ? legacySortMap[opts.sort] : undefined;
      const fallbackParams = buildQuery({ ...opts, sort: legacySort });
      const fallbackQs = fallbackParams.toString();
      return fetchApi(`/api/records/pitchers${fallbackQs ? `?${fallbackQs}` : ''}`);
    }
    throw err;
  }
}

export async function getSeasons(): Promise<SeasonSummary[]> {
  const raw = await fetchApi<unknown>('/api/seasons');
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const id = toFiniteNumber(row.id);
      const year = toFiniteNumber(row.year);
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
  const normalizeBatter = (entry: unknown): BatterRanking | null => {
    if (!entry || typeof entry !== 'object') return null;
    const e = entry as Record<string, unknown>;
    return {
      rank: toFiniteNumber(e.rank) ?? 1,
      playerId: toFiniteNumber(e.playerId) ?? 0,
      playerName: String(e.playerName ?? ''),
      teamId: toFiniteNumber(e.teamId) ?? 0,
      teamName: String(e.teamName ?? ''),
      seasonId: toFiniteNumber(e.seasonId) ?? seasonId,
      gamesPlayed: toFiniteNumber(e.gamesPlayed) ?? 0,
      plateAppearance: toFiniteNumber(e.plateAppearance) ?? 0,
      atBats: toFiniteNumber(e.atBats) ?? 0,
      hits: toFiniteNumber(e.hits) ?? 0,
      homeRuns: toFiniteNumber(e.homeRuns) ?? 0,
      runsBattedIn: toFiniteNumber(e.runsBattedIn ?? e.rbi) ?? 0,
      stolenBases: toFiniteNumber(e.stolenBases) ?? 0,
      walks: toFiniteNumber(e.walks) ?? 0,
      strikeouts: toFiniteNumber(e.strikeouts) ?? 0,
      battingAverage: toFiniteNumber(e.battingAverage ?? e.avg) ?? 0,
      onBasePct: toFiniteNumber(e.onBasePct ?? e.obp) ?? 0,
      sluggingPct: toFiniteNumber(e.sluggingPct ?? e.slg) ?? 0,
      ops: toFiniteNumber(e.ops) ?? 0,
    };
  };
  const normalizePitcher = (entry: unknown): PitcherRanking | null => {
    if (!entry || typeof entry !== 'object') return null;
    const e = entry as Record<string, unknown>;
    return {
      rank: toFiniteNumber(e.rank) ?? 1,
      playerId: toFiniteNumber(e.playerId) ?? 0,
      playerName: String(e.playerName ?? ''),
      teamId: toFiniteNumber(e.teamId) ?? 0,
      teamName: String(e.teamName ?? ''),
      seasonId: toFiniteNumber(e.seasonId) ?? seasonId,
      gamesPlayed: toFiniteNumber(e.gamesPlayed) ?? 0,
      inningsPitched: toFiniteNumber(e.inningsPitched) ?? 0,
      wins: toFiniteNumber(e.wins) ?? 0,
      losses: toFiniteNumber(e.losses) ?? 0,
      saves: toFiniteNumber(e.saves) ?? 0,
      strikeouts: toFiniteNumber(e.strikeouts) ?? 0,
      walksAllowed: toFiniteNumber(e.walksAllowed ?? e.walks) ?? 0,
      era: toFiniteNumber(e.era) ?? 0,
      whip: toFiniteNumber(e.whip) ?? 0,
    };
  };

  return {
    seasonId: toFiniteNumber(row.seasonId) ?? seasonId,
    totalGames: toFiniteNumber(row.totalGames) ?? 0,
    totalTeams: toFiniteNumber(row.totalTeams) ?? 0,
    topBatter: normalizeBatter(row.topBatter),
    topPitcher: normalizePitcher(row.topPitcher),
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
      const teamId = toFiniteNumber(row.teamId);
      const teamName = typeof row.teamName === 'string' ? row.teamName : '';
      if (teamId == null || !teamName) return null;
      return {
        teamId,
        teamName,
        wins: toFiniteNumber(row.wins) ?? 0,
        losses: toFiniteNumber(row.losses) ?? 0,
        ties: toFiniteNumber(row.ties ?? row.draws) ?? 0,
        winPct: toFiniteNumber(row.winPct) ?? 0,
      };
    })
    .filter((item): item is TeamRecordStanding => item !== null);
}

// ── Game Logs ──

export interface BatterGameLog {
  batterGlId: number;
  gameId: number;
  teamSide: string;
  playerName: string;
  atBats: number;
  runs: number;
  hits: number;
  rbi: number;
  walks: number;
  strikeouts: number;
}

export interface PitcherGameLog {
  pitcherGlId: number;
  gameId: number;
  teamSide: string;
  playerName: string;
  inningsPitched: number;
  hitsAllowed: number;
  runsAllowed: number;
  earnedRuns: number;
  walks: number;
  strikeouts: number;
}

export async function getPlayerGameLogs(
  playerId: number,
  gameId?: number,
): Promise<(BatterGameLog | PitcherGameLog)[]> {
  const params = gameId ? `?gameId=${gameId}` : '';
  return fetchApi(`/api/players/${playerId}/game-logs${params}`);
}

// ── Firestore Import (admin) ──

export async function triggerMatchImport(matchId: string): Promise<void> {
  await fetchApi(`/api/import/firestore/matches/${matchId}`, { method: 'POST' });
}

export async function triggerBulkImport(): Promise<void> {
  await fetchApi('/api/import/firestore/matches', { method: 'POST' });
}

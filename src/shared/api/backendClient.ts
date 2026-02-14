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

export async function getBatterRankings(opts?: {
  seasonId?: number;
  limit?: number;
  sort?: 'ops' | 'avg' | 'hits' | 'hr';
}): Promise<BatterRanking[]> {
  const params = new URLSearchParams();
  if (opts?.seasonId) params.set('seasonId', String(opts.seasonId));
  if (opts?.limit) params.set('limit', String(opts.limit));
  if (opts?.sort) params.set('sort', opts.sort);
  const qs = params.toString();
  try {
    return await fetchApi(`/api/rankings/batters${qs ? `?${qs}` : ''}`);
  } catch (err) {
    if (err instanceof Error && err.message.includes('404')) return [];
    throw err;
  }
}

export async function getPitcherRankings(opts?: {
  seasonId?: number;
  limit?: number;
  sort?: 'era' | 'whip' | 'so' | 'wins' | 'saves';
}): Promise<PitcherRanking[]> {
  const params = new URLSearchParams();
  if (opts?.seasonId) params.set('seasonId', String(opts.seasonId));
  if (opts?.limit) params.set('limit', String(opts.limit));
  if (opts?.sort) params.set('sort', opts.sort);
  const qs = params.toString();
  try {
    return await fetchApi(`/api/rankings/pitchers${qs ? `?${qs}` : ''}`);
  } catch (err) {
    if (err instanceof Error && err.message.includes('404')) return [];
    throw err;
  }
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

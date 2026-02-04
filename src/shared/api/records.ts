import { api } from './client';
import type {
  BatterRecordRow,
  PitcherRecordRow,
  RecordOverviewResponse,
  SeasonSummary,
  TeamRecordRow,
} from './types';

interface PaginatedResponse<T> {
  items?: T[];
  records?: T[];
  data?: T[];
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === '') return;
    query.set(key, String(value));
  });
  const serialized = query.toString();
  return serialized ? `?${serialized}` : '';
}

function extractList<T>(payload: T[] | PaginatedResponse<T>): T[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.records)) return payload.records;
  if (Array.isArray(payload.data)) return payload.data;
  return [];
}

function normalizeSeason(payload: unknown): SeasonSummary | null {
  if (!payload || typeof payload !== 'object') return null;
  const value = payload as Record<string, unknown>;
  const id = Number(value.id);
  const year = Number(value.year);
  if (!Number.isFinite(id) || !Number.isFinite(year)) return null;
  return { id, year };
}

function normalizeTeamRecord(payload: unknown): TeamRecordRow | null {
  if (!payload || typeof payload !== 'object') return null;
  const value = payload as Record<string, unknown>;
  const teamId = Number(value.teamId ?? value.id);
  const teamName = String(value.teamName ?? value.name ?? '').trim();
  if (!Number.isFinite(teamId) || !teamName) return null;

  const wins = Number(value.wins ?? 0);
  const losses = Number(value.losses ?? 0);
  const draws = Number(value.draws ?? 0);

  return {
    teamId,
    teamName,
    teamCode: typeof value.teamCode === 'string' ? value.teamCode : undefined,
    division: typeof value.division === 'string' ? value.division : undefined,
    games: Number(value.games ?? wins + losses + draws),
    wins,
    losses,
    draws,
    winPct: Number(value.winPct ?? 0),
    runsFor: Number(value.runsFor ?? 0),
    runsAgainst: Number(value.runsAgainst ?? 0),
    era: Number(value.era ?? 0),
    ops: Number(value.ops ?? 0),
    stolenBases: Number(value.stolenBases ?? 0),
    dataSource: typeof value.dataSource === 'string' ? value.dataSource : undefined,
  };
}

function normalizeBatterRecord(payload: unknown): BatterRecordRow | null {
  if (!payload || typeof payload !== 'object') return null;
  const value = payload as Record<string, unknown>;
  const playerId = Number(value.playerId ?? value.id);
  const playerName = String(value.playerName ?? value.name ?? '').trim();
  const teamId = Number(value.teamId ?? 0);
  const teamName = String(value.teamName ?? '').trim();
  if (!Number.isFinite(playerId) || !playerName || !Number.isFinite(teamId) || !teamName) return null;

  return {
    playerId,
    playerName,
    teamId,
    teamName,
    seasonId: Number(value.seasonId ?? 0),
    seasonYear: Number(value.seasonYear ?? value.year ?? 0),
    gamesPlayed: Number(value.gamesPlayed ?? 0),
    plateAppearance: Number(value.plateAppearance ?? 0),
    atBats: Number(value.atBats ?? 0),
    hits: Number(value.hits ?? 0),
    homeRuns: Number(value.homeRuns ?? 0),
    runsBattedIn: Number(value.runsBattedIn ?? value.rbi ?? 0),
    runsScored: Number(value.runsScored ?? value.runs ?? 0),
    stolenBases: Number(value.stolenBases ?? value.sb ?? 0),
    walks: Number(value.walks ?? 0),
    strikeouts: Number(value.strikeouts ?? 0),
    battingAverage: Number(value.battingAverage ?? value.avg ?? 0),
    onBasePct: Number(value.onBasePct ?? value.obp ?? 0),
    sluggingPct: Number(value.sluggingPct ?? value.slg ?? 0),
    ops: Number(value.ops ?? 0),
    dataSource: typeof value.dataSource === 'string' ? value.dataSource : undefined,
  };
}

function normalizePitcherRecord(payload: unknown): PitcherRecordRow | null {
  if (!payload || typeof payload !== 'object') return null;
  const value = payload as Record<string, unknown>;
  const playerId = Number(value.playerId ?? value.id);
  const playerName = String(value.playerName ?? value.name ?? '').trim();
  const teamId = Number(value.teamId ?? 0);
  const teamName = String(value.teamName ?? '').trim();
  if (!Number.isFinite(playerId) || !playerName || !Number.isFinite(teamId) || !teamName) return null;

  return {
    playerId,
    playerName,
    teamId,
    teamName,
    seasonId: Number(value.seasonId ?? 0),
    seasonYear: Number(value.seasonYear ?? value.year ?? 0),
    gamesPlayed: Number(value.gamesPlayed ?? 0),
    gamesStarted: Number(value.gamesStarted ?? 0),
    inningsPitched: Number(value.inningsPitched ?? value.ip ?? 0),
    wins: Number(value.wins ?? 0),
    losses: Number(value.losses ?? 0),
    saves: Number(value.saves ?? value.sv ?? 0),
    strikeouts: Number(value.strikeouts ?? value.so ?? 0),
    walksAllowed: Number(value.walksAllowed ?? value.bb ?? 0),
    era: Number(value.era ?? 0),
    whip: Number(value.whip ?? 0),
    kPer9: Number(value.kPer9 ?? 0),
    bbPer9: Number(value.bbPer9 ?? 0),
    dataSource: typeof value.dataSource === 'string' ? value.dataSource : undefined,
  };
}

export async function getSeasons(): Promise<SeasonSummary[]> {
  const response = await api.get<SeasonSummary[] | { seasons: SeasonSummary[] } | PaginatedResponse<SeasonSummary>>('/api/seasons');
  const rows = Array.isArray(response)
    ? response
    : 'seasons' in response && Array.isArray(response.seasons)
      ? response.seasons
      : extractList(response);

  return rows
    .map(normalizeSeason)
    .filter((season): season is SeasonSummary => Boolean(season))
    .sort((a, b) => b.year - a.year);
}

export async function getRecordOverview(seasonId?: number): Promise<RecordOverviewResponse> {
  const query = buildQuery({ seasonId });
  const response = await api.get<RecordOverviewResponse | { overview: RecordOverviewResponse }>(`/api/records/overview${query}`);
  if ('overview' in response) return response.overview;
  return response;
}

export async function getTeamRecords(params?: {
  seasonId?: number;
  division?: string;
}): Promise<TeamRecordRow[]> {
  const query = buildQuery({ seasonId: params?.seasonId, division: params?.division });
  const response = await api.get<TeamRecordRow[] | PaginatedResponse<TeamRecordRow>>(`/api/records/teams${query}`);
  return extractList(response)
    .map(normalizeTeamRecord)
    .filter((record): record is TeamRecordRow => Boolean(record));
}

export async function getBatterRecords(params?: {
  seasonId?: number;
  limit?: number;
  sort?: string;
}): Promise<BatterRecordRow[]> {
  const query = buildQuery({ seasonId: params?.seasonId, limit: params?.limit, sort: params?.sort });
  const response = await api.get<BatterRecordRow[] | PaginatedResponse<BatterRecordRow>>(`/api/records/batters${query}`);
  return extractList(response)
    .map(normalizeBatterRecord)
    .filter((record): record is BatterRecordRow => Boolean(record));
}

export async function getPitcherRecords(params?: {
  seasonId?: number;
  limit?: number;
  sort?: string;
}): Promise<PitcherRecordRow[]> {
  const query = buildQuery({ seasonId: params?.seasonId, limit: params?.limit, sort: params?.sort });
  const response = await api.get<PitcherRecordRow[] | PaginatedResponse<PitcherRecordRow>>(`/api/records/pitchers${query}`);
  return extractList(response)
    .map(normalizePitcherRecord)
    .filter((record): record is PitcherRecordRow => Boolean(record));
}

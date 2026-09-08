import { deriveMatchDivision } from './demoStore.lineup';
import { normalizeBenches, normalizeLineups, normalizePostGame } from './demoStore.normalize';
import type { MatchSchedule } from './demoStore';

const createFallbackMatchId = () => `match-${Math.random().toString(36).slice(2, 8)}`;

export function normalizeMatches(matches: unknown): MatchSchedule[] {
  if (!Array.isArray(matches)) return [];
  return matches.filter((entry) => {
    if (!entry || typeof entry !== 'object') return true;
    return (entry as Partial<MatchSchedule>).sourceActive !== false;
  }).map((entry) => {
    if (!entry || typeof entry !== 'object') {
      return {
        id: createFallbackMatchId(),
        homeTeamName: '미정',
        awayTeamName: '미정',
        startTime: new Date().toISOString(),
        venue: '미정',
        status: 'scheduled',
        division: 'LEAGUE',
      } satisfies MatchSchedule;
    }
    const match = entry as Partial<MatchSchedule>;
    return {
      id: typeof match.id === 'string' ? match.id : createFallbackMatchId(),
      recordAuthority: match.recordAuthority === 'UNIQUE_PLAY' ? 'UNIQUE_PLAY' : undefined,
      officialRecordRevision: typeof match.officialRecordRevision === 'string' ? match.officialRecordRevision : undefined,
      seasonId: typeof match.seasonId === 'number' && Number.isFinite(match.seasonId) ? Math.trunc(match.seasonId) : undefined,
      homeTeamId: typeof match.homeTeamId === 'string' ? match.homeTeamId : undefined,
      awayTeamId: typeof match.awayTeamId === 'string' ? match.awayTeamId : undefined,
      homeTeamName: typeof match.homeTeamName === 'string' ? match.homeTeamName : '미정',
      awayTeamName: typeof match.awayTeamName === 'string' ? match.awayTeamName : '미정',
      startTime: typeof match.startTime === 'string' ? match.startTime : new Date().toISOString(),
      venue: typeof match.venue === 'string' ? match.venue : '미정',
      status: match.status === 'completed' || match.status === 'inProgress' || match.status === 'canceled' ? match.status : 'scheduled',
      recordMode: match.recordMode === 'practice' ? 'practice' : 'official',
      scoreInputMode: match.scoreInputMode === 'manual' ? 'manual' : 'live',
      liveVideoUrl: typeof match.liveVideoUrl === 'string' ? match.liveVideoUrl : undefined,
      liveDelaySeconds: typeof match.liveDelaySeconds === 'number' ? match.liveDelaySeconds : undefined,
      division: deriveMatchDivision(match.division, match.homeTeamId, match.awayTeamId),
      homeScore: typeof match.homeScore === 'number' ? match.homeScore : null,
      awayScore: typeof match.awayScore === 'number' ? match.awayScore : null,
      lineupPublic: typeof match.lineupPublic === 'boolean' ? match.lineupPublic : false,
      lineups: match.recordAuthority === 'UNIQUE_PLAY' ? undefined : normalizeLineups(match.lineups),
      benches: match.recordAuthority === 'UNIQUE_PLAY' ? undefined : normalizeBenches(match.benches),
      notes: match.recordAuthority !== 'UNIQUE_PLAY' && typeof match.notes === 'string' ? match.notes : undefined,
      postGame: match.recordAuthority === 'UNIQUE_PLAY' ? undefined : normalizePostGame(match.postGame),
      manualEntryDraft: match.recordAuthority === 'UNIQUE_PLAY' ? undefined : normalizePostGame(match.manualEntryDraft),
      deleted: match.deleted === true,
      deletedAt: typeof match.deletedAt === 'number' ? match.deletedAt : undefined,
      purgeAt: typeof match.purgeAt === 'number' ? match.purgeAt : undefined,
      deletedBy: typeof match.deletedBy === 'string' ? match.deletedBy : undefined,
      groupCode: typeof match.groupCode === 'string' ? match.groupCode : undefined,
      sourceProvider: typeof match.sourceProvider === 'string' ? match.sourceProvider : undefined,
      sourceGameId: typeof match.sourceGameId === 'string' ? match.sourceGameId : undefined,
      sourceActive: typeof match.sourceActive === 'boolean' ? match.sourceActive : undefined,
      syncRevision: typeof match.syncRevision === 'string' ? match.syncRevision : undefined,
      sourceUpdatedAt: typeof match.sourceUpdatedAt === 'string' ? match.sourceUpdatedAt : undefined,
    };
  });
}

export function projectSpectatorMatch(match: MatchSchedule): MatchSchedule {
  const lineupVisible = Boolean(match.lineupPublic) || match.status === 'inProgress' || match.status === 'completed';
  return {
    id: match.id,
    recordAuthority: match.recordAuthority,
    officialRecordRevision: match.officialRecordRevision,
    seasonId: match.seasonId,
    homeTeamId: match.homeTeamId,
    awayTeamId: match.awayTeamId,
    homeTeamName: match.homeTeamName,
    awayTeamName: match.awayTeamName,
    startTime: match.startTime,
    venue: match.venue,
    status: match.status,
    recordMode: match.recordMode ?? 'official',
    scoreInputMode: match.scoreInputMode ?? 'live',
    liveVideoUrl: match.liveVideoUrl,
    liveDelaySeconds: match.liveDelaySeconds,
    division: match.division,
    homeScore: match.homeScore,
    awayScore: match.awayScore,
    lineupPublic: Boolean(match.lineupPublic),
    lineups: lineupVisible ? match.lineups : undefined,
    benches: lineupVisible ? match.benches : undefined,
    deleted: match.deleted,
    deletedAt: match.deletedAt,
    purgeAt: match.purgeAt,
    deletedBy: match.deletedBy,
    groupCode: match.groupCode,
    sourceProvider: match.sourceProvider,
    sourceGameId: match.sourceGameId,
    sourceActive: match.sourceActive,
    syncRevision: match.syncRevision,
    sourceUpdatedAt: match.sourceUpdatedAt,
  };
}

export function mergeMatches(base: MatchSchedule[], incoming: MatchSchedule[]) {
  const map = new Map<string, MatchSchedule>();
  base.forEach((match) => map.set(match.id, match));
  incoming.forEach((match) => {
    const existing = map.get(match.id);
    // A pre-cutover query can finish after the official snapshot. Never downgrade
    // an established boundary or restore its private fields from that stale result.
    if (existing?.recordAuthority === 'UNIQUE_PLAY' && match.recordAuthority !== 'UNIQUE_PLAY') return;
    map.set(match.id, existing ? { ...existing, ...match } : match);
  });
  return Array.from(map.values());
}

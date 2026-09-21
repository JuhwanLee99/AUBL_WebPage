export interface DetailRouteMatch {
  id: string;
  sourceGameId?: string;
  sourceProvider?: string;
  status?: string;
  seasonId?: number;
  scoreInputMode?: 'live' | 'manual';
}

/** A validated, published backend response does not authorize any private live read. */
export function canUsePublishedOfficialDetail(
  match: DetailRouteMatch | null,
  detail: {
    provider: string;
    sourceGameId: string;
    seasonId: number;
    syncRevision: string | null;
    status: string;
  } | null,
  keepFirestoreLive: boolean,
): boolean {
  if (keepFirestoreLive || !match || !detail || !isUniquePlayProvider(match.sourceProvider)) return false;
  const sourceId = match.sourceGameId?.trim() || match.id.trim();
  return detail.provider === 'UNIQUE_PLAY'
    && detail.sourceGameId === sourceId
    && Boolean(detail.syncRevision?.trim())
    && Number.isSafeInteger(detail.seasonId) && detail.seasonId > 0
    && (match.seasonId == null || match.seasonId === detail.seasonId)
    && ['AVAILABLE', 'NOT_PUBLISHED', 'NOT_COLLECTED', 'REVIEW_REQUIRED'].includes(detail.status);
}

export function findDetailRouteMatch<T extends DetailRouteMatch>(
  matches: readonly T[],
  routeId: string | undefined,
): T | null {
  if (!routeId) return null;
  return matches.find((item) => item.id === routeId)
    ?? matches.find((item) => isUniquePlayProvider(item.sourceProvider) && item.sourceGameId === routeId)
    ?? null;
}

export function isUniquePlayProvider(provider: string | null | undefined): boolean {
  return provider?.trim().toUpperCase() === 'UNIQUE_PLAY';
}

export function resolveOfficialRequestSource(
  routeId: string | undefined,
  routeMatch: DetailRouteMatch | null,
): string {
  if (!routeId) return '';
  if (isUniquePlayProvider(routeMatch?.sourceProvider)) {
    return routeMatch?.sourceGameId?.trim() || routeId.trim();
  }
  return routeId.trim();
}

export function currentResourceForKey<T extends { requestKey: string }>(
  resource: T | null,
  requestKey: string,
): T | null {
  return resource?.requestKey === requestKey ? resource : null;
}

export function shouldKeepFirestoreLive(
  matchStatus: string | null | undefined,
  officialStatus: string | null | undefined,
  officialGameStatus: string | null | undefined,
  hasAublLiveRecord = false,
): boolean {
  const normalizedOfficialStatus = officialGameStatus?.trim().toUpperCase();
  return hasAublLiveRecord
    && matchStatus === 'inProgress'
    && officialStatus === 'NOT_COLLECTED'
    && (normalizedOfficialStatus === 'SCHEDULED' || normalizedOfficialStatus === 'IN_PROGRESS');
}

/** A schedule status alone is not evidence that an AUBL scorekeeper recorded it. */
export function hasMatchingAublLiveRecord(
  match: DetailRouteMatch | null,
  state: { activeMatchId: string | null; gameStarted: boolean; eventCount: number },
): boolean {
  return Boolean(match
    && match.id === state.activeMatchId
    && match.scoreInputMode !== 'manual'
    && (state.gameStarted || state.eventCount > 0));
}

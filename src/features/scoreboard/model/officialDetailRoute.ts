export interface DetailRouteMatch {
  id: string;
  sourceGameId?: string;
  sourceProvider?: string;
  status?: string;
  seasonId?: number;
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
): boolean {
  const normalizedOfficialStatus = officialGameStatus?.trim().toUpperCase();
  return matchStatus === 'inProgress'
    && officialStatus === 'NOT_COLLECTED'
    && (normalizedOfficialStatus === 'SCHEDULED' || normalizedOfficialStatus === 'IN_PROGRESS');
}

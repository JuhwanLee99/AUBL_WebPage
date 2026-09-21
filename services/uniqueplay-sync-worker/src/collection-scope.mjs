// Dates are inclusive Asia/Seoul calendar dates, never browser-local dates.
export function validateCollectionScope(scope, seasonYear) {
  if (scope === undefined) return;
  const date = scope?.fromDate;
  if (scope?.version !== 1 || !['SINCE_LAST_SYNC', 'FROM_DATE'].includes(scope?.mode)
      || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)
      || Number(date.slice(0, 4)) !== seasonYear
      || !Number.isFinite(Date.parse(`${date}T00:00:00Z`))
      || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
    throw new Error('INVALID_COLLECTION_SCOPE');
  }
}
export function includesGameDate(playedAt, fromDate) {
  if (typeof playedAt !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/.test(playedAt)) throw new Error('GAME_DATE_OFFSET_REQUIRED');
  const instant = Date.parse(playedAt);
  if (!Number.isFinite(instant)) throw new Error('INVALID_GAME_DATE');
  return new Date(instant + 9 * 60 * 60 * 1000).toISOString().slice(0, 10) >= fromDate;
}

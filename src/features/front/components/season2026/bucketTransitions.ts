import type { HomeStandingRow, PlayoffProjectionBucket } from './types';

export const bucketAtRank = (rank: number): PlayoffProjectionBucket => rank <= 2 ? 'eutteum' : rank <= 4 ? 'beogeum' : 'out';

export function bucketTransitions(rows: HomeStandingRow[]) {
  return rows.map((row) => {
    // A shared current rank may straddle a qualification boundary.
    const tiedCount = rows.filter((peer) => peer.rank === row.rank).length;
    const lastRank = row.rank + tiedCount - 1;
    const currentUnresolved = row.rank < 1 || (row.qualification === 'unranked' || row.qualification === 'pending')
      || bucketAtRank(row.rank) !== bucketAtRank(lastRank);
    const from = bucketAtRank(row.rank);
    const destinations = currentUnresolved ? [] : [...new Set(row.projection?.possibleBuckets ?? [])].filter((bucket) => bucket !== from);
    return { row, from, destinations, currentUnresolved, incomplete: !row.projection || row.projection.exhausted };
  });
}

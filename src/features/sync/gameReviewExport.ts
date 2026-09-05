import type { UniquePlayGameRecordsReview } from '@core/contracts/uniquePlayGameReview';

/** Export only public baseball fields and review tokens, never administrator identities or private notes. */
export function gameReviewExport(review: UniquePlayGameRecordsReview) {
  return {
    schemaVersion: 1,
    runId: review.runId,
    checksum: review.checksum,
    reviewChecksum: review.reviewChecksum,
    expectedRevision: review.expectedRevision,
    games: review.games.map(game => ({
      sourceGameId: game.sourceGameId,
      game: game.game,
      detail: game.detail,
      quality: game.quality,
      issues: game.issues,
      resolutionSource: game.resolutionSource,
      resolvedAt: game.resolvedAt,
    })),
  };
}

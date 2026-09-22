export type DurableScoringScope = {
  environment: string;
  projectId: string;
  uid: string;
  matchId: string;
  testRunId?: string;
  writerSessionId: string;
  lockEpoch: number;
};

export function scoringScopeKey(scope: DurableScoringScope): string {
  for (const value of [scope.environment, scope.projectId, scope.uid, scope.matchId, scope.writerSessionId]) {
    if (typeof value !== 'string' || !value.length || value.length > 256) throw new Error('invalid-queue-scope');
  }
  if (scope.testRunId !== undefined && (typeof scope.testRunId !== 'string' || !scope.testRunId.length || scope.testRunId.length > 256)) {
    throw new Error('invalid-test-run');
  }
  if (!Number.isSafeInteger(scope.lockEpoch) || scope.lockEpoch <= 0) throw new Error('invalid-queue-version');
  return JSON.stringify([scope.environment, scope.projectId, scope.uid, scope.matchId,
    scope.testRunId ?? null, scope.writerSessionId, scope.lockEpoch]);
}

/** Match-wide local exclusion; changing user/session/epoch must not evade it. */
export function scoringWriterLockKey(scope: DurableScoringScope): string {
  scoringScopeKey(scope);
  return `aubl-scoring-writer:${JSON.stringify([scope.environment, scope.projectId, scope.matchId, scope.testRunId ?? null])}`;
}

// Preflight contract only. This does not grant Firestore/server authorization.
export type ScoringTestRole = 'admin' | 'scorer' | 'viewer';
export type ScoringTestOperation = 'read' | 'record' | 'review' | 'promote';
export type ScoringTestScope = { testRunId: string; matchId: string };
export type ScoringTestRun = {
  version: 1; runId: string; projectId: string; apiOrigin: string;
  status: 'disabled' | 'active' | 'stopped' | 'closed';
  createdAtMs: number; expiresAtMs: number; approvedAtMs: number; approvedByUid: string;
  matchIds: string[]; participants: { uid: string; role: ScoringTestRole }[];
  operations: ScoringTestOperation[]; maxRequests: number;
};
export class ScoringTestScopeError extends Error {
  code: string;
  constructor(code: string) { super(code); this.code = code; this.name = 'ScoringTestScopeError'; }
}
const fail = (code: string): never => { throw new ScoringTestScopeError(code); };
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const id = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const clock = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const roles = ['admin', 'scorer', 'viewer'];
const operations = ['read', 'record', 'review', 'promote'];
const allowed = {
  admin: ['read', 'record', 'review', 'promote'], scorer: ['read', 'record'], viewer: ['read'],
};

export function parseScoringTestRun(value: unknown): ScoringTestRun {
  if (!object(value) || value.version !== 1 || !id(value.runId) || !value.runId.startsWith('TEST_RUN_')
    || !id(value.projectId) || !id(value.approvedByUid)
    || !['disabled', 'active', 'stopped', 'closed'].includes(String(value.status))) return fail('invalid-test-run');
  if (typeof value.apiOrigin !== 'string') return fail('invalid-api-origin');
  let url: URL;
  try { url = new URL(value.apiOrigin); } catch { return fail('invalid-api-origin'); }
  if (url.protocol !== 'https:' || url.origin !== value.apiOrigin || url.username || url.password)
    return fail('invalid-api-origin');
  if (!clock(value.createdAtMs) || !clock(value.expiresAtMs) || !clock(value.approvedAtMs)
    || value.expiresAtMs <= value.createdAtMs || value.expiresAtMs - value.createdAtMs > 86_400_000
    || value.approvedAtMs < value.createdAtMs || value.approvedAtMs >= value.expiresAtMs) return fail('invalid-test-window');
  if (!Array.isArray(value.matchIds) || value.matchIds.length < 1 || value.matchIds.length > 3
    || !value.matchIds.every(matchId => id(matchId) && matchId.startsWith('TEST_SCORING_'))
    || new Set(value.matchIds).size !== value.matchIds.length) return fail('invalid-test-matches');
  if (!Array.isArray(value.participants) || !value.participants.length || value.participants.length > 10
    || !value.participants.every(p => object(p) && id(p.uid) && roles.includes(String(p.role)))
    || new Set(value.participants.map(p => p.uid)).size !== value.participants.length
    || !value.participants.some(p => p.role === 'admin' && p.uid === value.approvedByUid)) return fail('invalid-test-participants');
  if (!Array.isArray(value.operations) || !value.operations.length
    || !value.operations.every(op => operations.includes(String(op)))
    || new Set(value.operations).size !== value.operations.length) return fail('invalid-test-operations');
  if (!Number.isSafeInteger(value.maxRequests) || Number(value.maxRequests) < 1 || Number(value.maxRequests) > 10_000)
    return fail('invalid-test-request-limit');
  return structuredClone(value) as ScoringTestRun;
}

export function authorizeScoringTestAccess(raw: unknown, request: ScoringTestScope & {
  uid: string | null; projectId: string; apiOrigin: string; operation: ScoringTestOperation;
}, now: number): ScoringTestRole {
  const run = parseScoringTestRun(raw);
  if (!clock(now) || run.status !== 'active' || now < run.approvedAtMs || now >= run.expiresAtMs) return fail('test-run-inactive');
  if (request.testRunId !== run.runId || request.projectId !== run.projectId || request.apiOrigin !== run.apiOrigin
    || !run.matchIds.includes(request.matchId)) return fail('test-scope-mismatch');
  const participant = run.participants.find(p => p.uid === request.uid);
  if (!participant || !run.operations.includes(request.operation) || !allowed[participant.role].includes(request.operation))
    return fail('test-access-denied');
  return participant.role;
}

const collections = ['matches', 'matchStates', 'recordSources', 'recordArchives', 'scoringAtomicMatches'] as const;
export function scoringTestRecordPath(scope: ScoringTestScope, collection: typeof collections[number]): string {
  if (!id(scope.testRunId) || !scope.testRunId.startsWith('TEST_RUN_') || !id(scope.matchId)
    || !scope.matchId.startsWith('TEST_SCORING_') || !collections.includes(collection)) return fail('invalid-test-path');
  return `scoringTestRuns/${scope.testRunId}/${collection}/${scope.matchId}`;
}

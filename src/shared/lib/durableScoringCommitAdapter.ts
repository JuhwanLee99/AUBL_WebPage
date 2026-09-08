import { DurableScoringQueue } from './durableScoringQueue';
import type { DurableScoringScope, FrozenScoringRequest } from './durableScoringQueue';

export type PrivateScoringManifest = {
  version: 1;
  matchId: string;
  ruleProfileVersion: string;
  engineVersion: string;
  projectionVersion: string;
  blocks: Array<{ kind: 'state' | 'feed' | 'events' | 'stats'; blockId: string; sha256: string; size: number }>;
};

export type PrivateCommitRequest = {
  runId: string;
  matchId: string;
  writerSessionId: string;
  lockEpoch: number;
  requestId: string;
  expectedRevision: number;
  firstInputSequence: number;
  lastInputSequence: number;
  manifest: PrivateScoringManifest;
  payloadHash: string;
};

/** A future authenticated callable maps these fields; no endpoint is opened here. */
export type PrivateCommitTransport = { commit(request: PrivateCommitRequest): Promise<unknown> };

function ensure(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}
const isHash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const isInteger = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

/** Matches the server's sorted ASCII JSON for this ASCII-key, integer-only DTO. */
export function canonicalCommitJson(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value).replace(/[\u007f-\uffff]/g,
    char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
  if (typeof value === 'number') {
    ensure(isInteger(value), 'non-integer-commit-number');
    return String(value);
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) return `[${value.map(canonicalCommitJson).join(',')}]`;
  ensure(typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype,
    'invalid-canonical-commit-value');
  const object = value as Record<string, unknown>;
  const keys = Object.keys(object).sort();
  ensure(keys.every(key => /^[\x20-\x7e]+$/.test(key)), 'non-ascii-commit-key');
  return `{${keys.map(key => `${canonicalCommitJson(key)}:${canonicalCommitJson(object[key])}`).join(',')}}`;
}

async function manifestHash(manifest: PrivateScoringManifest): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalCommitJson(manifest)));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export class DurableScoringCommitAdapter {
  private readonly scope: DurableScoringScope;
  private readonly queue: DurableScoringQueue;
  private readonly transport: PrivateCommitTransport;
  private inFlight: Promise<boolean> | undefined;

  constructor(scope: DurableScoringScope, queue: DurableScoringQueue, transport: PrivateCommitTransport) {
    ensure(typeof scope.testRunId === 'string' && scope.testRunId.startsWith('TEST_RUN_'), 'private-test-scope-required');
    this.scope = structuredClone(scope);
    this.queue = queue;
    this.transport = transport;
  }

  async prepare(manifest: PrivateScoringManifest, requestId: string, lastInputSequence: number): Promise<void> {
    const fixed = structuredClone(manifest);
    ensure(fixed.matchId === this.scope.matchId && fixed.version === 1, 'manifest-scope-mismatch');
    ensure(/^[A-Za-z0-9_-]{1,128}$/.test(requestId) && isInteger(lastInputSequence), 'invalid-commit-request');
    const recovered = await this.queue.recover();
    ensure(!recovered.metadata.blockedReason && !recovered.metadata.pending, 'queue-not-ready');
    const hash = await manifestHash(fixed);
    const request: PrivateCommitRequest = {
      runId: this.scope.testRunId!, matchId: this.scope.matchId, writerSessionId: this.scope.writerSessionId,
      lockEpoch: this.scope.lockEpoch, requestId, expectedRevision: recovered.metadata.serverRevision,
      firstInputSequence: recovered.metadata.acknowledgedSequence + 1, lastInputSequence,
      manifest: fixed, payloadHash: hash,
    };
    await this.queue.freeze({ requestId, expectedRevision: request.expectedRevision,
      firstInputSequence: request.firstInputSequence, lastInputSequence, payloadHash: hash,
      payload: canonicalCommitJson(request) });
  }

  flush(): Promise<boolean> {
    if (this.inFlight) return this.inFlight;
    const operation = this.sendPending();
    this.inFlight = operation;
    void operation.then(() => { if (this.inFlight === operation) this.inFlight = undefined; },
      () => { if (this.inFlight === operation) this.inFlight = undefined; });
    return operation;
  }

  private async decode(frozen: FrozenScoringRequest): Promise<PrivateCommitRequest> {
    const request = JSON.parse(frozen.payload) as PrivateCommitRequest;
    ensure(request && typeof request === 'object' && request.runId === this.scope.testRunId
      && request.matchId === this.scope.matchId && request.writerSessionId === this.scope.writerSessionId
      && request.lockEpoch === this.scope.lockEpoch, 'frozen-request-scope-mismatch');
    ensure(request.requestId === frozen.requestId && request.expectedRevision === frozen.expectedRevision
      && request.firstInputSequence === frozen.firstInputSequence && request.lastInputSequence === frozen.lastInputSequence
      && request.payloadHash === frozen.payloadHash && request.manifest?.matchId === this.scope.matchId,
      'frozen-request-binding-mismatch');
    ensure(await manifestHash(request.manifest) === frozen.payloadHash
      && canonicalCommitJson(request) === frozen.payload, 'frozen-request-integrity-failed');
    return request;
  }

  private async sendPending(): Promise<boolean> {
    const recovered = await this.queue.recover();
    ensure(!recovered.metadata.blockedReason, 'queue-blocked');
    const frozen = recovered.metadata.pending;
    if (!frozen) return false;
    const request = await this.decode(frozen);
    // An unknown network failure leaves the exact request and every input intact.
    const response = await this.transport.commit(structuredClone(request));
    ensure(typeof response === 'object' && response !== null, 'invalid-server-ack');
    const ack = response as Record<string, unknown>;
    ensure(ack.runId === this.scope.testRunId && ack.matchId === this.scope.matchId && ack.uid === this.scope.uid
      && ack.writerSessionId === this.scope.writerSessionId && ack.lockEpoch === this.scope.lockEpoch,
      'server-ack-scope-mismatch');
    ensure(ack.requestId === request.requestId && ack.expectedRevision === request.expectedRevision
      && ack.firstInputSequence === request.firstInputSequence && ack.lastInputSequence === request.lastInputSequence
      && ack.payloadHash === request.payloadHash && ack.committedRevision === request.expectedRevision + 1
      && isInteger(ack.headRevision) && ack.headRevision >= ack.committedRevision
      && isHash(ack.commitId) && typeof ack.replayed === 'boolean', 'server-ack-binding-mismatch');
    await this.queue.acknowledge({ requestId: request.requestId,
      firstInputSequence: request.firstInputSequence, lastInputSequence: request.lastInputSequence,
      payloadHash: request.payloadHash, committedRevision: request.expectedRevision + 1,
      commitId: ack.commitId, headRevision: ack.headRevision });
    return true;
  }
}

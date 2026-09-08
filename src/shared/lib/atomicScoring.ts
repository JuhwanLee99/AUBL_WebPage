export const ATOMIC_PAYLOAD_LIMIT = 700_000;
export type AtomicPayload = { matchId: string; core: Record<string, unknown>; feed: Record<string, unknown>[]; events: Record<string, unknown>[] };
export type AtomicRequest = { id: string; matchId: string; actorUid: string; lockEpoch: number; expectedRevision: number; payload: string; hash: string };
export type AtomicHead = { version: 2; matchId: string; ownerUid: string; lockEpoch: number; paused: boolean; revision: number; commitId: string; payload: string; hash: string };
export type AtomicReceipt = { id: string; actorUid: string; lockEpoch: number; expectedRevision: number; revision: number; hash: string };
export type AtomicAck = AtomicReceipt & { headRevision: number; replayed: boolean };
export type AtomicTransport = { commit: (request: AtomicRequest) => Promise<AtomicAck> };
export class AtomicScoringError extends Error {
  code: string;
  constructor(code: string, message = code) { super(message); this.name = 'AtomicScoringError'; this.code = code; }
}
const fail = (code: string): never => { throw new AtomicScoringError(code); };
const count = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const identity = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 256;

function canonical(value: unknown, depth = 0): unknown {
  if (depth > 64) return fail('invalid-payload');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(item => canonical(item, depth + 1));
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, item]) => [key, canonical(item, depth + 1)]));
  }
  return fail('invalid-payload');
}

export function serializeAtomicPayload(value: AtomicPayload): string {
  const text = JSON.stringify(canonical(value));
  if (new TextEncoder().encode(text).length > ATOMIC_PAYLOAD_LIMIT) return fail('payload-too-large');
  const data = JSON.parse(text) as AtomicPayload;
  if (!identity(data.matchId) || !data.core || Array.isArray(data.core) || !Array.isArray(data.events) || !Array.isArray(data.feed)) return fail('invalid-payload');
  const core = data.core;
  if (core.activeMatchId !== data.matchId || !count(core.inning) || core.inning < 1 || !['top', 'bottom'].includes(String(core.half))
    || !count(core.outs) || core.outs > 3 || !count(core.balls) || core.balls > 3 || !count(core.strikes) || core.strikes > 2) return fail('invalid-state');
  const score = core.score as { home?: unknown; away?: unknown } | null;
  if (!score || !count(score.home) || !count(score.away)) return fail('invalid-state');
  if (!Array.isArray(core.bases) || core.bases.length !== 3 || core.bases.some(base => base !== null && !identity(base))) return fail('invalid-state');
  const occupied = core.bases.filter(base => base !== null);
  if (new Set(occupied).size !== occupied.length) return fail('invalid-state');
  const ids = new Set<string>();
  for (const event of data.events) {
    if (!event || !identity(event.eventId) || ids.has(event.eventId)) return fail('invalid-event-identity');
    ids.add(event.eventId);
  }
  for (const entry of data.feed) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) || (entry.eventId !== undefined && (!identity(entry.eventId) || !ids.has(entry.eventId)))) return fail('orphan-feed');
  }
  return text;
}
async function digest(value: string): Promise<string> {
  const bytes = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}
const fingerprint = (request: Omit<AtomicRequest, 'hash'>) => JSON.stringify([request.id, request.matchId, request.actorUid, request.lockEpoch, request.expectedRevision, request.payload]);
export async function prepareAtomicRequest(scope: Omit<AtomicRequest, 'payload' | 'hash'>, payload: AtomicPayload): Promise<AtomicRequest> {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(scope.id) || !identity(scope.actorUid) || !identity(scope.matchId) || !count(scope.lockEpoch) || !count(scope.expectedRevision)
    || scope.matchId !== payload.matchId) return fail('invalid-request');
  const request = { ...scope, payload: serializeAtomicPayload(payload) };
  return { ...request, hash: await digest(fingerprint(request)) };
}
export async function validateAtomicRequest(request: AtomicRequest): Promise<void> {
  try {
    const expected = await prepareAtomicRequest(request, JSON.parse(request.payload) as AtomicPayload);
    if (request.payload !== expected.payload || request.hash !== expected.hash) fail('invalid-request');
  } catch (error) {
    if (error instanceof AtomicScoringError) throw error;
    fail('invalid-request');
  }
}

// Called inside a real transport transaction. Receipts are immutable and scoped to a stream.
export function decideAtomicCommit(head: AtomicHead | null, receipt: AtomicReceipt | null, request: AtomicRequest, actorUid: string): { head: AtomicHead; receipt: AtomicReceipt; ack: AtomicAck; write: boolean } {
  if (!head || head.version !== 2) return fail('migration-required');
  if (head.matchId !== request.matchId) return fail('wrong-match');
  if (!actorUid || actorUid !== request.actorUid || head.ownerUid !== actorUid || head.paused || head.lockEpoch !== request.lockEpoch) return fail('permission-denied');
  if (receipt) {
    if (receipt.id !== request.id || receipt.hash !== request.hash || receipt.actorUid !== actorUid || receipt.lockEpoch !== request.lockEpoch
      || receipt.expectedRevision !== request.expectedRevision || receipt.revision !== request.expectedRevision + 1) return fail('idempotency-conflict');
    return { head, receipt, ack: { ...receipt, headRevision: head.revision, replayed: true }, write: false };
  }
  if (head.revision !== request.expectedRevision) return fail('revision-conflict');
  const revision = head.revision + 1;
  if (!count(revision)) return fail('invalid-revision');
  const nextReceipt = { id: request.id, actorUid, lockEpoch: request.lockEpoch, expectedRevision: request.expectedRevision, revision, hash: request.hash };
  return { head: { ...head, revision, commitId: request.id, payload: request.payload, hash: request.hash }, receipt: nextReceipt,
    ack: { ...nextReceipt, headRevision: revision, replayed: false }, write: true };
}

export type AtomicSavePhase = 'idle' | 'queued' | 'saving' | 'saved' | 'retry-required' | 'conflict' | 'blocked' | 'storage-error';
export type AtomicSaveState = { phase: AtomicSavePhase; revision: number; requestId: string | null; error: string | null };
type OutboxOptions = { matchId: string; actorUid: string; lockEpoch: number; revision: number; transport: AtomicTransport; storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> };
export class AtomicScoringOutbox {
  private options: OutboxOptions;
  private key: string;
  private pending: AtomicRequest | null = null;
  private state: AtomicSaveState;
  private listeners = new Set<() => void>();
  private active: Promise<void> | null = null;
  private staging = false;
  constructor(options: OutboxOptions) {
    this.options = options;
    this.key = `aubl-atomic-v2:${encodeURIComponent(options.actorUid)}:${encodeURIComponent(options.matchId)}:${options.lockEpoch}`;
    this.state = { phase: 'idle', revision: options.revision, requestId: null, error: null };
    try {
      const raw = options.storage.getItem(this.key);
      if (raw) {
        const request = JSON.parse(raw) as AtomicRequest;
        if (request.matchId !== options.matchId || request.actorUid !== options.actorUid || request.lockEpoch !== options.lockEpoch) fail('outbox-scope-mismatch');
        this.pending = request;
        this.state = { ...this.state, phase: 'queued', requestId: request.id };
      }
    } catch { this.state = { ...this.state, phase: 'storage-error', error: 'outbox-unreadable' }; }
  }
  getSnapshot = (): AtomicSaveState => this.state;
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(phase: AtomicSavePhase, error: string | null = null) {
    this.state = { ...this.state, phase, error, requestId: this.pending?.id ?? null };
    this.listeners.forEach(listener => listener());
  }
  async stage(payload: AtomicPayload): Promise<void> {
    if (this.pending || this.staging || ['conflict', 'blocked', 'storage-error'].includes(this.state.phase)) return fail('outbox-not-ready');
    this.staging = true;
    try {
      const request = await prepareAtomicRequest({ id: globalThis.crypto.randomUUID(), matchId: this.options.matchId, actorUid: this.options.actorUid,
        lockEpoch: this.options.lockEpoch, expectedRevision: this.state.revision }, payload);
      try { this.options.storage.setItem(this.key, JSON.stringify(request)); }
      catch { this.publish('storage-error', 'outbox-write-failed'); return fail('outbox-write-failed'); }
      this.pending = request;
      this.publish('queued');
    } finally { this.staging = false; }
  }
  flush(): Promise<void> {
    if (this.active) return this.active;
    if (!this.pending || ['blocked', 'conflict'].includes(this.state.phase)) return Promise.resolve();
    const request = this.pending;
    this.publish('saving');
    const run = async () => {
      try {
        await validateAtomicRequest(request);
        const ack = await this.options.transport.commit(request);
        if (ack.id !== request.id || ack.hash !== request.hash || ack.actorUid !== request.actorUid || ack.lockEpoch !== request.lockEpoch
          || ack.expectedRevision !== request.expectedRevision || ack.revision !== request.expectedRevision + 1 || !count(ack.headRevision) || ack.headRevision < ack.revision) fail('invalid-ack');
        try { this.options.storage.removeItem(this.key); }
        catch { this.publish('storage-error', 'outbox-clear-failed'); return; }
        this.pending = null;
        this.state = { ...this.state, revision: ack.revision };
        this.publish(ack.headRevision === ack.revision ? 'saved' : 'conflict', ack.headRevision === ack.revision ? null : 'remote-advanced-after-commit');
      } catch (error) {
        const code = (error as { code?: string }).code ?? 'unavailable';
        const conflict = ['revision-conflict', 'idempotency-conflict'].includes(code);
        const blocked = ['permission-denied', 'unauthenticated', 'invalid-request', 'invalid-payload', 'migration-required', 'wrong-match'].includes(code);
        this.publish(conflict ? 'conflict' : blocked ? 'blocked' : 'retry-required', code);
      }
    };
    this.active = run().finally(() => { this.active = null; });
    return this.active;
  }
}

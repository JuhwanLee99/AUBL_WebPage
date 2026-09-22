/** Local persistence only. No Firebase, transport, or legacy writer fallback. */
import { scoringScopeKey, type DurableScoringScope } from './scoringScope';
export type { DurableScoringScope } from './scoringScope';

export type FrozenScoringRequest = {
  requestId: string;
  firstInputSequence: number;
  lastInputSequence: number;
  expectedRevision: number;
  payloadHash: string;
  /** Immutable serialized request, including manifest references, not live state. */
  payload: string;
};

export type DurableScoringAck = Omit<FrozenScoringRequest, 'payload' | 'expectedRevision'> & {
  committedRevision: number;
  commitId: string;
  headRevision: number;
};

type QueueMetadata = {
  scopeKey: string;
  nextSequence: number;
  acknowledgedSequence: number;
  serverRevision: number;
  blockedReason?: string;
  pending?: FrozenScoringRequest;
  lastAck?: DurableScoringAck;
  /** Retained after ACK so a retry cannot become a new input. */
  inputReceipts?: Record<string, { sequence: number; snapshotHash: string; localApplication?: 'pending' | 'applied' }>;
};

export type DurableScoringInput = {
  scopeKey: string;
  sequence: number;
  inputId: string;
  /** Event plus replay/checkpoint data supplied by the future modal adapter. */
  snapshot: string;
};

function requireValue(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}

const integer = (value: number) => Number.isSafeInteger(value) && value >= 0;
const hash = (value: string) => /^[a-f0-9]{64}$/.test(value);
function isCompositeSnapshot(snapshot: string): boolean {
  try { return JSON.parse(snapshot)?.kind === 'composite-play'; } catch { return false; }
}
const snapshotDigest = async (value: string): Promise<string> => {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
};

export class DurableScoringQueue {
  private readonly database: Promise<IDBDatabase>;
  private readonly scopeKey: string;
  private readonly initialRevision: number;
  private receiptsReady?: Promise<void>;

  constructor(scope: DurableScoringScope, initialRevision: number, factory: IDBFactory = indexedDB) {
    this.scopeKey = scoringScopeKey(scope);
    requireValue(integer(initialRevision), 'invalid-queue-version');
    this.initialRevision = initialRevision;
    this.database = new Promise((resolve, reject) => {
      const request = factory.open('aubl-scoring-durable-v1', 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('streams', { keyPath: 'scopeKey' });
        request.result.createObjectStore('inputs', { keyPath: ['scopeKey', 'sequence'] });
      };
      let blocked = false;
      request.onblocked = () => { blocked = true; reject(new Error('queue-database-upgrade-blocked')); };
      request.onerror = () => reject(request.error ?? new Error('queue-database-open-failed'));
      request.onsuccess = () => {
        const db = request.result;
        if (blocked) { db.close(); return; }
        db.onversionchange = () => db.close();
        resolve(db);
      };
    });
  }

  assertScope(scope: DurableScoringScope): void {
    requireValue(scoringScopeKey(scope) === this.scopeKey, 'queue-scope-mismatch');
  }

  private fresh(): QueueMetadata {
    return { scopeKey: this.scopeKey, nextSequence: 1, acknowledgedSequence: 0, serverRevision: this.initialRevision };
  }

  private async mutate<T>(change: (metadata: QueueMetadata, inputs: IDBObjectStore) => T): Promise<T> {
    const db = await this.database;
    return new Promise<T>((resolve, reject) => {
      // No in-memory success or localStorage fallback when persistence fails.
      const tx = db.transaction(['streams', 'inputs'], 'readwrite', { durability: 'strict' });
      let result: T;
      let failure: unknown;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(failure ?? tx.error ?? new Error('queue-transaction-aborted'));
      const store = tx.objectStore('streams');
      const request = store.get(this.scopeKey);
      request.onsuccess = () => {
        try {
          const metadata: QueueMetadata = request.result ?? this.fresh();
          requireValue(integer(metadata.nextSequence) && metadata.nextSequence > 0
            && integer(metadata.acknowledgedSequence) && metadata.acknowledgedSequence < metadata.nextSequence
            && integer(metadata.serverRevision), 'corrupt-queue-metadata');
          result = change(metadata, tx.objectStore('inputs'));
          store.put(metadata);
        } catch (error) { failure = error; tx.abort(); }
      };
    });
  }

  private ensureReceipts(): Promise<void> {
    if (!this.receiptsReady) {
      this.receiptsReady = this.restoreReceipts().catch(error => {
        this.receiptsReady = undefined;
        throw error;
      });
    }
    return this.receiptsReady;
  }

  private async restoreReceipts(): Promise<void> {
    // Hash outside the transaction, then compare the captured stream version.
    // Never silently collapse duplicate IDs from an older queue implementation.
    for (;;) {
      const recovered = await this.recover();
      let changed = recovered.metadata.inputReceipts === undefined;
      let receipts: NonNullable<QueueMetadata['inputReceipts']> = { ...recovered.metadata.inputReceipts };
      const seen = new Set<string>();
      for (const input of recovered.inputs) {
        requireValue(!seen.has(input.inputId), 'legacy-input-id-conflict');
        seen.add(input.inputId);
        const snapshotHash = await snapshotDigest(input.snapshot);
        const existing = Object.hasOwn(receipts, input.inputId) ? receipts[input.inputId] : undefined;
        if (existing) requireValue(existing.sequence === input.sequence && existing.snapshotHash === snapshotHash, 'corrupt-input-receipt');
        if (!existing || existing.localApplication === undefined) {
          receipts = { ...receipts, [input.inputId]: {
            sequence: input.sequence, snapshotHash,
            localApplication: isCompositeSnapshot(input.snapshot) ? 'pending' : 'applied',
          } };
          changed = true;
        }
      }
      if (!changed) return;
      const installed = await this.mutate(metadata => {
        if (metadata.nextSequence !== recovered.metadata.nextSequence
          || metadata.acknowledgedSequence !== recovered.metadata.acknowledgedSequence
          || JSON.stringify(metadata.inputReceipts) !== JSON.stringify(recovered.metadata.inputReceipts)) return false;
        metadata.inputReceipts = receipts;
        return true;
      });
      if (installed) return;
    }
  }

  async enqueue(inputId: string, snapshot: string, requiresLocalApply = false): Promise<number> {
    requireValue(typeof inputId === 'string' && inputId.length > 0 && inputId.length <= 256, 'invalid-input-id');
    requireValue(typeof snapshot === 'string' && snapshot.length > 0, 'invalid-input-snapshot');
    await this.ensureReceipts();
    const snapshotHash = await snapshotDigest(snapshot);
    return this.mutate((metadata, inputs) => {
      requireValue(!metadata.blockedReason, 'queue-blocked');
      const receipts = metadata.inputReceipts;
      requireValue(receipts && typeof receipts === 'object' && !Array.isArray(receipts), 'corrupt-input-receipts');
      if (Object.hasOwn(receipts, inputId)) {
        const receipt = receipts[inputId];
        requireValue(receipt && integer(receipt.sequence) && receipt.sequence > 0
          && receipt.sequence < metadata.nextSequence && hash(receipt.snapshotHash), 'corrupt-input-receipt');
        requireValue(receipt.snapshotHash === snapshotHash, 'input-id-conflict');
        return receipt.sequence;
      }
      requireValue(!Object.values(receipts).some(receipt => receipt.sequence > metadata.acknowledgedSequence
        && receipt.localApplication !== 'applied'), 'local-application-review-required');
      requireValue(metadata.nextSequence < Number.MAX_SAFE_INTEGER, 'queue-sequence-exhausted');
      const sequence = metadata.nextSequence++;
      inputs.add({ scopeKey: this.scopeKey, sequence, inputId, snapshot } satisfies DurableScoringInput);
      metadata.inputReceipts = { ...receipts, [inputId]: { sequence, snapshotHash,
        localApplication: requiresLocalApply || isCompositeSnapshot(snapshot) ? 'pending' : 'applied' } };
      return sequence;
    });
  }

  async freeze(request: FrozenScoringRequest): Promise<void> {
    const frozen = structuredClone(request);
    requireValue(typeof frozen.requestId === 'string' && frozen.requestId.length > 0
      && typeof frozen.payload === 'string' && frozen.payload.length > 0 && hash(frozen.payloadHash), 'invalid-frozen-request');
    requireValue(integer(frozen.expectedRevision) && integer(frozen.firstInputSequence)
      && integer(frozen.lastInputSequence), 'invalid-request-sequence');
    await this.ensureReceipts();
    await this.mutate((metadata) => {
      requireValue(!metadata.blockedReason, 'queue-blocked');
      requireValue(!metadata.pending, 'request-already-in-flight');
      requireValue(frozen.expectedRevision === metadata.serverRevision, 'queue-revision-conflict');
      requireValue(frozen.firstInputSequence === metadata.acknowledgedSequence + 1
        && frozen.lastInputSequence >= frozen.firstInputSequence
        && frozen.lastInputSequence < metadata.nextSequence, 'queue-input-range-mismatch');
      this.requireAppliedRange(metadata, frozen.firstInputSequence, frozen.lastInputSequence);
      metadata.pending = frozen;
    });
  }

  private requireAppliedRange(metadata: QueueMetadata, first: number, last: number): void {
    const receipts = Object.values(metadata.inputReceipts ?? {}).filter(receipt => receipt.sequence >= first && receipt.sequence <= last);
    requireValue(receipts.length === last - first + 1 && new Set(receipts.map(receipt => receipt.sequence)).size === receipts.length,
      'queue-input-receipts-missing');
    requireValue(receipts.every(receipt => receipt.localApplication === 'applied'), 'local-application-review-required');
  }

  async confirmApplied(inputId: string, snapshot: string): Promise<void> {
    await this.ensureReceipts();
    const digest = await snapshotDigest(snapshot);
    await this.mutate(metadata => {
      requireValue(!metadata.blockedReason, 'queue-blocked');
      const receipts = metadata.inputReceipts;
      requireValue(receipts && Object.hasOwn(receipts, inputId), 'input-receipt-not-found');
      const receipt = receipts[inputId];
      requireValue(receipt.snapshotHash === digest, 'input-id-conflict');
      requireValue(receipt.localApplication === 'pending' || receipt.localApplication === 'applied', 'corrupt-input-receipt');
      metadata.inputReceipts = { ...receipts, [inputId]: { ...receipt, localApplication: 'applied' } };
    });
  }

  async assertSendable(frozen: FrozenScoringRequest): Promise<void> {
    await this.ensureReceipts();
    await this.mutate(metadata => {
      requireValue(!metadata.blockedReason, 'queue-blocked');
      requireValue(JSON.stringify(metadata.pending) === JSON.stringify(frozen), 'frozen-request-changed');
      this.requireAppliedRange(metadata, frozen.firstInputSequence, frozen.lastInputSequence);
    });
  }

  async review(): ReturnType<DurableScoringQueue['recover']> {
    await this.ensureReceipts();
    return this.recover();
  }

  async acknowledge(ack: DurableScoringAck): Promise<void> {
    const accepted = structuredClone(ack);
    requireValue(integer(accepted.committedRevision) && integer(accepted.headRevision)
      && accepted.headRevision >= accepted.committedRevision && hash(accepted.payloadHash)
      && hash(accepted.commitId), 'invalid-queue-ack');
    await this.ensureReceipts();
    await this.mutate((metadata, inputs) => {
      const request = metadata.pending;
      requireValue(request && accepted.requestId === request.requestId
        && accepted.payloadHash === request.payloadHash
        && accepted.firstInputSequence === request.firstInputSequence
        && accepted.lastInputSequence === request.lastInputSequence
        && accepted.committedRevision === request.expectedRevision + 1, 'queue-ack-mismatch');
      this.requireAppliedRange(metadata, request.firstInputSequence, request.lastInputSequence);
      inputs.delete(IDBKeyRange.bound([this.scopeKey, request.firstInputSequence], [this.scopeKey, request.lastInputSequence]));
      metadata.acknowledgedSequence = request.lastInputSequence;
      metadata.serverRevision = accepted.committedRevision;
      metadata.lastAck = accepted;
      delete metadata.pending;
      if (accepted.headRevision > accepted.committedRevision) metadata.blockedReason = 'remote-head-ahead';
    });
  }

  async block(reason: string): Promise<void> {
    requireValue(typeof reason === 'string' && reason.length > 0, 'invalid-block-reason');
    await this.mutate((metadata) => { metadata.blockedReason = reason; });
  }

  async recover(): Promise<{ metadata: QueueMetadata; inputs: DurableScoringInput[] }> {
    const db = await this.database;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['streams', 'inputs'], 'readonly');
      let metadata = this.fresh();
      const inputs: DurableScoringInput[] = [];
      tx.onabort = () => reject(tx.error ?? new Error('queue-recovery-failed'));
      tx.oncomplete = () => resolve({ metadata, inputs });
      const state = tx.objectStore('streams').get(this.scopeKey);
      state.onsuccess = () => { metadata = state.result ?? this.fresh(); };
      const cursor = tx.objectStore('inputs').openCursor(IDBKeyRange.bound([this.scopeKey, 0], [this.scopeKey, Number.MAX_SAFE_INTEGER]));
      cursor.onsuccess = () => {
        const item = cursor.result;
        if (item) { inputs.push(item.value as DurableScoringInput); item.continue(); }
      };
    });
  }

  async close(): Promise<void> { (await this.database).close(); }
}

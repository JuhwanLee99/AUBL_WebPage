/** Local persistence only. No Firebase, transport, or legacy writer fallback. */
export type DurableScoringScope = {
  environment: string;
  projectId: string;
  uid: string;
  matchId: string;
  testRunId?: string;
  writerSessionId: string;
  lockEpoch: number;
};

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

export class DurableScoringQueue {
  private readonly database: Promise<IDBDatabase>;
  private readonly scopeKey: string;
  private readonly initialRevision: number;

  constructor(scope: DurableScoringScope, initialRevision: number, factory: IDBFactory = indexedDB) {
    for (const value of [scope.environment, scope.projectId, scope.uid, scope.matchId, scope.writerSessionId]) {
      requireValue(typeof value === 'string' && value.length > 0 && value.length <= 256, 'invalid-queue-scope');
    }
    requireValue(scope.testRunId === undefined || (typeof scope.testRunId === 'string' && scope.testRunId.length > 0), 'invalid-test-run');
    requireValue(integer(scope.lockEpoch) && scope.lockEpoch > 0 && integer(initialRevision), 'invalid-queue-version');
    this.scopeKey = JSON.stringify([scope.environment, scope.projectId, scope.uid, scope.matchId,
      scope.testRunId ?? null, scope.writerSessionId, scope.lockEpoch]);
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

  async enqueue(inputId: string, snapshot: string): Promise<number> {
    requireValue(typeof inputId === 'string' && inputId.length > 0 && inputId.length <= 256, 'invalid-input-id');
    requireValue(typeof snapshot === 'string' && snapshot.length > 0, 'invalid-input-snapshot');
    return this.mutate((metadata, inputs) => {
      requireValue(!metadata.blockedReason, 'queue-blocked');
      requireValue(metadata.nextSequence < Number.MAX_SAFE_INTEGER, 'queue-sequence-exhausted');
      const sequence = metadata.nextSequence++;
      inputs.add({ scopeKey: this.scopeKey, sequence, inputId, snapshot } satisfies DurableScoringInput);
      return sequence;
    });
  }

  async freeze(request: FrozenScoringRequest): Promise<void> {
    const frozen = structuredClone(request);
    requireValue(typeof frozen.requestId === 'string' && frozen.requestId.length > 0
      && typeof frozen.payload === 'string' && frozen.payload.length > 0 && hash(frozen.payloadHash), 'invalid-frozen-request');
    requireValue(integer(frozen.expectedRevision) && integer(frozen.firstInputSequence)
      && integer(frozen.lastInputSequence), 'invalid-request-sequence');
    await this.mutate((metadata) => {
      requireValue(!metadata.blockedReason, 'queue-blocked');
      requireValue(!metadata.pending, 'request-already-in-flight');
      requireValue(frozen.expectedRevision === metadata.serverRevision, 'queue-revision-conflict');
      requireValue(frozen.firstInputSequence === metadata.acknowledgedSequence + 1
        && frozen.lastInputSequence >= frozen.firstInputSequence
        && frozen.lastInputSequence < metadata.nextSequence, 'queue-input-range-mismatch');
      metadata.pending = frozen;
    });
  }

  async acknowledge(ack: DurableScoringAck): Promise<void> {
    const accepted = structuredClone(ack);
    requireValue(integer(accepted.committedRevision) && integer(accepted.headRevision)
      && accepted.headRevision >= accepted.committedRevision && hash(accepted.payloadHash)
      && hash(accepted.commitId), 'invalid-queue-ack');
    await this.mutate((metadata, inputs) => {
      const request = metadata.pending;
      requireValue(request && accepted.requestId === request.requestId
        && accepted.payloadHash === request.payloadHash
        && accepted.firstInputSequence === request.firstInputSequence
        && accepted.lastInputSequence === request.lastInputSequence
        && accepted.committedRevision === request.expectedRevision + 1, 'queue-ack-mismatch');
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

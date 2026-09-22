import { DurableScoringQueue, type DurableScoringScope } from './durableScoringQueue';
import { DurableScoringCommitAdapter, type PrivateCommitTransport, type PrivateScoringManifest } from './durableScoringCommitAdapter';
import { scoringWriterLockKey } from './scoringScope';

type LocalLease = { release(): Promise<void> };

function acquireLease(name: string, locks: LockManager): Promise<LocalLease | null> {
  return new Promise((resolve, reject) => {
    const completed = locks.request(name, { mode: 'exclusive', ifAvailable: true }, async lock => {
      if (!lock) { resolve(null); return; }
      let releaseHold!: () => void;
      const held = new Promise<void>(release => { releaseHold = release; });
      resolve({ release: async () => { releaseHold(); await completed; } });
      await held;
    });
    void completed.catch(reject);
  });
}

/**
 * Opt-in private test writer; not connected to the production Provider.
 * Web Locks exclude other tabs in this browser profile, not other devices.
 * The caller must obtain a server-authorized session/epoch before acquisition.
 */
export class DurableScoringWriter {
  assertScope(scope: DurableScoringScope): void {
    this.queue.assertScope(scope);
  }

  private readonly queue: DurableScoringQueue;
  private readonly adapter: DurableScoringCommitAdapter;
  private readonly lease: LocalLease;
  private readonly operations = new Set<Promise<unknown>>();
  private closing = false;
  private closeOperation: Promise<void> | undefined;

  private constructor(queue: DurableScoringQueue, adapter: DurableScoringCommitAdapter, lease: LocalLease) {
    this.queue = queue; this.adapter = adapter; this.lease = lease;
  }

  static async acquire(scope: DurableScoringScope, initialRevision: number, transport: PrivateCommitTransport,
    locks: LockManager | undefined = globalThis.navigator?.locks): Promise<DurableScoringWriter | null> {
    const fixed = structuredClone(scope);
    if (!fixed.testRunId?.startsWith('TEST_RUN_')) throw new Error('private-test-scope-required');
    const key = scoringWriterLockKey(fixed);
    if (!locks || typeof locks.request !== 'function') throw new Error('writer-lock-api-unavailable');
    const lease = await acquireLease(key, locks);
    if (!lease) return null;
    let queue: DurableScoringQueue | undefined;
    try {
      queue = new DurableScoringQueue(fixed, initialRevision);
      await queue.recover();
      return new DurableScoringWriter(queue, new DurableScoringCommitAdapter(fixed, queue, transport), lease);
    } catch (error) {
      try { await queue?.close(); } catch { /* Preserve the original initialization error. */ }
      await lease.release();
      throw error;
    }
  }

  private run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.closing) return Promise.reject(new Error('writer-closed'));
    const result = Promise.resolve().then(operation);
    this.operations.add(result);
    void result.then(() => this.operations.delete(result), () => this.operations.delete(result));
    return result;
  }

  enqueue(inputId: string, snapshot: string): Promise<number> {
    return this.run(() => this.queue.enqueue(inputId, snapshot));
  }

  /** Keep the local lease until an entire upload/commit pipeline has settled. */
  runPublication(operation: () => Promise<void>): Promise<void> { return this.run(operation); }

  stage(inputId: string, snapshot: string): Promise<number> {
    return this.run(() => this.queue.enqueue(inputId, snapshot, true));
  }

  confirmApplied(inputId: string, snapshot: string): Promise<void> {
    return this.run(() => this.queue.confirmApplied(inputId, snapshot));
  }

  review(): ReturnType<DurableScoringQueue['review']> { return this.run(() => this.queue.review()); }

  prepare(manifest: PrivateScoringManifest, requestId: string, lastInputSequence: number): Promise<void> {
    return this.run(() => this.adapter.prepare(manifest, requestId, lastInputSequence));
  }

  flush(): Promise<boolean> { return this.run(() => this.adapter.flush()); }

  recover(): ReturnType<DurableScoringQueue['recover']> { return this.run(() => this.queue.recover()); }

  close(): Promise<void> {
    if (this.closeOperation) return this.closeOperation;
    this.closing = true;
    // Never hand a local lock over while an accepted write or ACK is unfinished.
    this.closeOperation = (async () => {
      await Promise.allSettled([...this.operations]);
      try { await this.queue.close(); } finally { await this.lease.release(); }
    })();
    return this.closeOperation;
  }
}

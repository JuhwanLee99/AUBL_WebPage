import type { DurableScoringScope } from './scoringScope';

export type ProviderWriter = { close(): Promise<void> };
export type ProviderSessionStatus = 'legacy' | 'opening' | 'ready' | 'blocked';

/** Lifecycle gate for the future Provider binding, not server authorization. */
export class ScoringProviderSession<Writer extends ProviderWriter> {
  private generation = 0;
  private status: ProviderSessionStatus = 'legacy';
  private writer: Writer | undefined;
  private tail: Promise<void> = Promise.resolve();
  private readonly acquire: (scope: DurableScoringScope, revision: number) => Promise<Writer | null>;

  constructor(acquire: (scope: DurableScoringScope, revision: number) => Promise<Writer | null>) {
    this.acquire = acquire;
  }

  snapshot(): { status: ProviderSessionStatus; legacyWriteAllowed: boolean } {
    return { status: this.status, legacyWriteAllowed: this.status === 'legacy' };
  }

  current(): Writer | null { return this.status === 'ready' ? this.writer ?? null : null; }

  /** Selecting durable mode is irreversible for this instance, including on failure. */
  open(scope: DurableScoringScope, revision: number): Promise<boolean> {
    const generation = ++this.generation;
    this.status = 'opening';
    // Fail closed even if cloning/validation fails. Never fall back to legacy writes.
    let fixed: DurableScoringScope;
    try {
      fixed = structuredClone(scope);
      if (fixed.environment !== 'local-emulator' || !fixed.projectId.startsWith('demo-')
        || !fixed.testRunId?.startsWith('TEST_RUN_') || !fixed.matchId.startsWith('TEST_SCORING_')
        || !fixed.uid || !fixed.writerSessionId || !Number.isSafeInteger(fixed.lockEpoch) || fixed.lockEpoch < 1
        || !Number.isSafeInteger(revision) || revision < 0) throw new Error('provider-test-scope-required');
    } catch (error) {
      this.status = 'blocked';
      return Promise.reject(error);
    }
    const operation = this.tail.then(async () => {
      await this.release();
      if (generation !== this.generation) return false;
      const candidate = await this.acquire(fixed, revision);
      if (generation !== this.generation) {
        // Legacy: closing the local candidate directly lost its reference on failure.
        // Keep it inaccessible to current(), but retained for serialized cleanup.
        this.writer = candidate ?? undefined;
        await this.release();
        return false;
      }
      if (!candidate) throw new Error('provider-writer-unavailable');
      this.writer = candidate;
      this.status = 'ready';
      return true;
    }).catch(error => {
      if (generation === this.generation) this.status = 'blocked';
      throw error;
    });
    this.tail = operation.then(() => {}, () => {});
    return operation;
  }

  /** Immediately revoke UI access, then await acquisitions and writer cleanup. */
  stop(): Promise<void> {
    ++this.generation;
    this.status = 'blocked';
    const operation = this.tail.then(() => this.release());
    this.tail = operation.catch(() => {});
    return operation;
  }

  private async release(): Promise<void> {
    if (!this.writer) return;
    // Retain a failed-to-close writer so a later stop cannot silently leak its lease.
    await this.writer.close();
    this.writer = undefined;
  }
}

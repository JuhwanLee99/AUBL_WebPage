export type WriteKeyRef = { current: string };
export type ScoringWriteStatus = {
  phase: 'idle' | 'saving' | 'retrying' | 'saved' | 'blocked' | 'failed';
  key?: string;
  attempts: number;
  errorCode?: string;
};
export type ScoringWriteJob = {
  key: string;
  scope: string;
  allowed(): boolean;
  write(): Promise<unknown>;
};

export function scoringWriteErrorCode(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'unknown';
  return code.replace(/^firestore\//, '');
}

/** Initial attempt plus at most five retries. Unknown/authorization errors fail closed. */
export function scoringWriteRetryDelay(error: unknown, failures: number): number | null {
  const transient = ['unavailable', 'deadline-exceeded', 'aborted', 'resource-exhausted'];
  if (!transient.includes(scoringWriteErrorCode(error)) || failures < 1 || failures > 5) return null;
  return Math.min(1000 * 2 ** (failures - 1), 16000);
}

type Slot = {
  generation: number;
  scope?: string;
  acknowledgedScope?: string;
  desired?: ScoringWriteJob;
  running: boolean;
  timer?: ReturnType<typeof setTimeout>;
  failures: number;
  stoppedKey?: string;
  status: ScoringWriteStatus;
};
const slots = new WeakMap<WriteKeyRef, Slot>();
const createSlot = (): Slot => ({ generation: 0, running: false, failures: 0, status: { phase: 'idle', attempts: 0 } });

function clearRetry(slot: Slot): void {
  if (slot.timer !== undefined) clearTimeout(slot.timer);
  slot.timer = undefined;
}

export function stopScoringWrite(ref: WriteKeyRef): void {
  const slot = slots.get(ref);
  if (!slot) return;
  slot.generation++;
  clearRetry(slot);
  slot.desired = undefined;
  slot.scope = undefined;
  slot.acknowledgedScope = undefined;
  slot.stoppedKey = undefined;
  slot.failures = 0;
  slot.status = { phase: 'blocked', attempts: 0 };
}

export function getScoringWriteStatus(ref: WriteKeyRef): ScoringWriteStatus {
  return { ...(slots.get(ref)?.status ?? { phase: 'idle', attempts: 0 }) };
}

function discardInvalidJob(ref: WriteKeyRef, slot: Slot, job: ScoringWriteJob): void {
  // Invalidate only the old request when a newer, independently authorized job exists.
  // Legacy behavior: stopScoringWrite(ref) also discarded that newer request.
  if (slot.desired && slot.desired !== job && slot.desired.allowed()) {
    slot.failures = 0;
    return;
  }
  stopScoringWrite(ref);
}

export function scheduleScoringWrite(ref: WriteKeyRef, job: ScoringWriteJob): void {
  let slot = slots.get(ref);
  if (!slot) { slot = createSlot(); slots.set(ref, slot); }
  if (slot.scope !== job.scope) {
    stopScoringWrite(ref);
    slot.scope = job.scope;
  }
  if (!job.allowed()) { stopScoringWrite(ref); return; }
  if (slot.stoppedKey === job.key) return;
  if (slot.desired?.key !== job.key) {
    clearRetry(slot);
    slot.failures = 0;
  }
  slot.desired = job;
  if (!slot.running && slot.timer === undefined) void drain(ref, slot);
}

async function drain(ref: WriteKeyRef, slot: Slot): Promise<void> {
  if (slot.running || !slot.desired) return;
  const job = slot.desired;
  if (!job.allowed()) { stopScoringWrite(ref); return; }
  if (slot.acknowledgedScope === job.scope && ref.current === job.key) {
    slot.desired = undefined;
    slot.status = { phase: 'saved', key: job.key, attempts: 0 };
    return;
  }
  const generation = slot.generation;
  const attempt = slot.failures + 1;
  slot.running = true;
  slot.status = { phase: 'saving', key: job.key, attempts: attempt };
  try {
    await job.write();
    if (generation === slot.generation && job.allowed()) {
      // Only this acknowledged request is saved, never the currently displayed value.
      ref.current = job.key;
      slot.acknowledgedScope = job.scope;
      slot.failures = 0;
      slot.status = { phase: 'saved', key: job.key, attempts: attempt };
      if (slot.desired?.key === job.key && slot.desired.scope === job.scope) slot.desired = undefined;
    } else if (generation === slot.generation) discardInvalidJob(ref, slot, job);
  } catch (error) {
    if (generation === slot.generation && !job.allowed()) {
      discardInvalidJob(ref, slot, job);
    } else if (generation === slot.generation && slot.desired?.key === job.key) {
      const failures = slot.failures + 1;
      const delay = scoringWriteRetryDelay(error, failures);
      const errorCode = scoringWriteErrorCode(error);
      slot.failures = failures;
      slot.status = { phase: delay === null ? (['permission-denied', 'unauthenticated'].includes(errorCode) ? 'blocked' : 'failed') : 'retrying',
        key: job.key, attempts: failures, errorCode };
      if (delay === null) {
        slot.stoppedKey = job.key;
        slot.desired = undefined;
        console.error('[scoring] write stopped', errorCode);
      } else {
        slot.timer = setTimeout(() => { slot.timer = undefined; void drain(ref, slot); }, delay);
      }
    }
  } finally {
    slot.running = false;
    if (slot.desired && slot.timer === undefined) void drain(ref, slot);
  }
}

import type { DurableScoringWriter } from './durableScoringWriter';
import type { PrivateScoringManifest } from './durableScoringCommitAdapter';
import { canonicalCommitJson } from './durableScoringCommitAdapter';
import { scoringScopeKey, type DurableScoringScope } from './scoringScope';

export type PublicationOptions = {
  ruleProfileVersion: string; engineVersion: string; projectionVersion: string;
  upload(requestId: string, body: Uint8Array, sha256: string): Promise<{ blockId: string; sha256: string; size: number }>;
};
export type PublicationStatus = { phase: 'idle' | 'sending' | 'saved' | 'failed'; revision: number; acknowledgedSequence: number; error?: string };
type Writer = Pick<DurableScoringWriter, 'review' | 'prepare' | 'flush' | 'runPublication' | 'assertScope'>;
const requireValue = (ok: unknown, code: string): void => { if (!ok) throw new Error(code); };
const hash = async (bytes: Uint8Array): Promise<string> => {
  const buffer = new Uint8Array(bytes).buffer;
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer)), byte => byte.toString(16).padStart(2, '0')).join('');
};

/** Serial immutable publication. Failed/unknown results leave the durable queue intact. */
export class DurableScoringPublication {
  private readonly scope: DurableScoringScope;
  private readonly writer: Writer;
  private readonly options: PublicationOptions;
  private readonly validate: () => void;
  private readonly assertCurrent: (after: Record<string, unknown>) => void;
  private readonly stats: (after: Record<string, unknown>) => unknown;
  private readonly notify: (status: PublicationStatus) => void;
  private operation?: Promise<void>;
  private stopped = false;
  private status: PublicationStatus = { phase: 'idle', revision: 0, acknowledgedSequence: 0 };

  constructor(scope: DurableScoringScope, writer: Writer, options: PublicationOptions, port: {
    validate(): void; assertCurrent(after: Record<string, unknown>): void;
    stats(after: Record<string, unknown>): unknown; notify(status: PublicationStatus): void;
  }) {
    writer.assertScope(scope);
    this.scope = structuredClone(scope); this.writer = writer; this.options = { ...options };
    this.validate = port.validate; this.assertCurrent = port.assertCurrent; this.stats = port.stats; this.notify = port.notify;
    for (const value of [options.ruleProfileVersion, options.engineVersion, options.projectionVersion]) {
      requireValue(/^[A-Za-z0-9_.:-]{1,128}$/.test(value), 'invalid-publication-version');
    }
  }

  stop(): void { this.stopped = true; }
  private check(): void { requireValue(!this.stopped, 'publication-stopped'); this.validate(); }
  private report(phase: PublicationStatus['phase'], error?: string): void {
    this.status = { ...this.status, phase, ...(error ? { error } : { error: undefined }) };
    if (!this.stopped) this.notify({ ...this.status });
  }

  drain(): Promise<void> {
    if (this.operation) return this.operation;
    const operation = this.writer.runPublication(() => this.send()).catch(error => {
      this.report('failed', error instanceof Error ? error.message : String(error)); throw error;
    });
    this.operation = operation;
    void operation.then(() => { if (this.operation === operation) this.operation = undefined; },
      () => { if (this.operation === operation) this.operation = undefined; });
    return operation;
  }

  private async send(): Promise<void> {
    this.check(); this.report('sending');
    for (;;) {
      this.check();
      const reviewed = await this.writer.review(); this.check();
      requireValue(!reviewed.metadata.blockedReason, 'publication-queue-blocked');
      this.status = { ...this.status, revision: reviewed.metadata.serverRevision,
        acknowledgedSequence: reviewed.metadata.acknowledgedSequence };
      if (!reviewed.inputs.length && !reviewed.metadata.pending) { this.report('saved'); return; }
      requireValue(reviewed.inputs.every(row => reviewed.metadata.inputReceipts?.[row.inputId]?.localApplication === 'applied'),
        'local-application-review-required');
      const last = reviewed.inputs.at(-1);
      requireValue(Boolean(last), 'publication-inputs-missing');
      const snapshot = JSON.parse(last!.snapshot);
      requireValue(snapshot.version === 1 && snapshot.checkpointVersion === 2 && snapshot.kind === 'composite-play'
        && snapshot.input?.id === last!.inputId && scoringScopeKey(snapshot.scope) === scoringScopeKey(this.scope)
        && snapshot.after?.activeMatchId === this.scope.matchId && Array.isArray(snapshot.after.events)
        && Array.isArray(snapshot.after.feed), 'invalid-publication-snapshot');
      this.assertCurrent(snapshot.after);
      if (reviewed.metadata.pending) {
        // Frozen manifest/request ID survive response loss. Do not regenerate them.
        await this.writer.flush(); continue;
      }
      const { events, feed, ...state } = snapshot.after;
      const groups = { state, feed, events, stats: this.stats(snapshot.after) };
      const encoded = Object.entries(groups).map(([kind, value]) => {
        const json = JSON.stringify(value); requireValue(typeof json === 'string', 'invalid-publication-projection');
        return { kind: kind as PrivateScoringManifest['blocks'][number]['kind'], bytes: new TextEncoder().encode(json) };
      });
      const limit = 128 * 1024;
      requireValue(encoded.reduce((sum, row) => sum + row.bytes.length, 0) <= 8 * 1024 * 1024
        && encoded.reduce((sum, row) => sum + Math.ceil(row.bytes.length / limit), 0) <= 64, 'publication-too-large');
      const blocks: PrivateScoringManifest['blocks'] = [];
      const seen = new Set<string>();
      for (const group of encoded) for (let offset = 0; offset < group.bytes.length; offset += limit) {
        const bytes = group.bytes.slice(offset, offset + limit);
        const sha256 = await hash(bytes);
        const blockId = await hash(new TextEncoder().encode(canonicalCommitJson({ matchId: this.scope.matchId, sha256 })));
        requireValue(!seen.has(`${group.kind}:${blockId}`), 'duplicate-publication-block');
        seen.add(`${group.kind}:${blockId}`);
        this.check();
        // Legacy: block_<blockId> collided with reservations from a previous writer.
        const requestHash = await hash(new TextEncoder().encode(canonicalCommitJson({
          blockId, writerSessionId: this.scope.writerSessionId, lockEpoch: this.scope.lockEpoch,
        })));
        this.check();
        const ack = await this.options.upload(`block_${requestHash}`, bytes, sha256); this.check();
        requireValue(ack.blockId === blockId && ack.sha256 === sha256 && ack.size === bytes.length, 'publication-upload-ack-mismatch');
        blocks.push({ kind: group.kind, blockId, sha256, size: bytes.length });
      }
      this.check();
      await this.writer.prepare({ version: 1, matchId: this.scope.matchId, blocks,
        ruleProfileVersion: this.options.ruleProfileVersion, engineVersion: this.options.engineVersion,
        projectionVersion: this.options.projectionVersion }, crypto.randomUUID(), last!.sequence);
      this.check(); await this.writer.flush();
      // Re-read the queue, never the live arrays. Inputs added during upload/ACK remain.
    }
  }
}

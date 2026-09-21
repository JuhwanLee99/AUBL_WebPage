import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readdir, readFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { safeStandingsDiagnostic } from './standings-diagnostics.mjs';
import { safeCollectionDiagnostic } from './collection-diagnostics.mjs';
import { safeGameDetailDiagnostic } from './game-details.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FINAL = new Set(['COMPLETED', 'FAILED', 'REAUTH_REQUIRED', 'FENCED']);
export const payloadHash = (body) => createHash('sha256').update(body).digest('hex');
const fault = (code, status = 409) => Object.assign(new Error(code), { code, status });
const safeCode = (error) => /^[A-Z][A-Z0-9_]{0,59}$/.test(error?.code || '') ? error.code : 'COLLECTION_FAILED';

export class DiskRunStore {
  constructor(directory) {
    if (!directory) throw fault('SYNC_STATE_DIR_REQUIRED', 503);
    this.directory = directory;
  }
  async load() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const records = [];
    for (const name of await readdir(this.directory)) {
      if (!name.endsWith('.json')) continue;
      const record = JSON.parse(await readFile(join(this.directory, name), 'utf8'));
      if (!UUID.test(record.runId) || name !== `${record.runId}.json` || record.version !== 2 ||
          !Number.isSafeInteger(record.lastSequence) || !Array.isArray(record.pending) ||
          record.pending.some(item => payloadHash(item.body) !== item.payloadHash || !UUID.test(item.deliveryId))) {
        throw fault('SYNC_STATE_CORRUPT', 503);
      }
      records.push(record);
    }
    return records;
  }
  async write(record) {
    if (!UUID.test(record.runId)) throw fault('INVALID_RUN_ID', 400);
    const temporary = join(this.directory, `${record.runId}.${randomUUID()}.tmp`);
    const file = await open(temporary, 'wx', 0o600);
    try { await file.writeFile(JSON.stringify(record)); await file.sync(); }
    finally { await file.close(); }
    await rename(temporary, join(this.directory, `${record.runId}.json`));
    const directory = await open(this.directory, 'r');
    try { await directory.sync(); } finally { await directory.close(); }
  }
}

// One worker process owns one durable directory. No automatic collection replay.
export class DurableRuns {
  constructor({ store, callbackBase, token, collect, fetchImpl = fetch, log = console.error,
    maxAttempts = 5, retryDelay = 1000, timeoutMs = 30000 }) {
    this.store = store; this.callbackBase = callbackBase.replace(/\/$/, ''); this.token = token;
    this.collect = collect; this.fetch = fetchImpl; this.log = log;
    this.maxAttempts = maxAttempts; this.retryDelay = retryDelay; this.timeoutMs = timeoutMs;
    this.records = new Map(); this.active = new Set(); this.accepting = new Set(); this.draining = new Set();
    this.locks = new Map(); this.jobs = new Set(); this.healthy = true;
    this.collectControllers = new Map(); this.deliveryControllers = new Map(); this.stopFailures = new Set();
  }
  emit(event, fields = {}) { this.log(JSON.stringify({ event, ...fields })); }
  track(promise) {
    this.jobs.add(promise);
    promise.catch(error => this.emit('worker_task_failed', { code: safeCode(error) }))
      .finally(() => this.jobs.delete(promise));
  }
  async idle() { while (this.jobs.size) await Promise.allSettled([...this.jobs]); }
  async mutate(runId, change) {
    const prior = this.locks.get(runId) || Promise.resolve();
    const task = prior.catch(() => {}).then(async () => {
      if (!this.healthy) throw fault('SYNC_STORAGE_UNAVAILABLE', 503);
      const next = structuredClone(this.records.get(runId));
      const result = change(next);
      next.updatedAt = new Date().toISOString();
      try { await this.store.write(next); }
      catch { this.healthy = false; this.emit('storage_failed', { runId }); throw fault('SYNC_STORAGE_UNAVAILABLE', 503); }
      this.records.set(runId, next);
      return result;
    });
    this.locks.set(runId, task);
    try { return await task; }
    finally { if (this.locks.get(runId) === task) this.locks.delete(runId); }
  }
  async initialize() {
    for (const record of await this.store.load()) this.records.set(record.runId, record);
    for (const record of this.records.values()) {
      if (FINAL.has(record.phase)) continue;
      if (record.phase === 'CANCELLING') {
        // The previous owning process has exited; never resume a cancelled collection or delivery.
        await this.cancel(record.runId, record.cancellationId);
        continue;
      }
      if (!record.terminal) {
        await this.enqueue(record.runId, 'failed', {
          code: 'WORKER_INTERRUPTED', message: 'Worker restarted before collection completed; original run retained.',
        }, false);
      }
      if (!record.blocked) this.track(this.drain(record.runId));
    }
  }
  status(runId) {
    if (!UUID.test(runId)) throw fault('INVALID_RUN_ID', 400);
    const record = this.records.get(runId);
    return { runId, protocolVersion: 2, state: record?.phase || 'ABSENT', active: this.active.has(runId) || this.accepting.has(runId),
      pendingDeliveries: record?.pending.length || 0, blocked: record?.blocked || null,
      lastSequence: record?.lastSequence || 0, updatedAt: record?.updatedAt || null,
      recoveryId: record?.recoveryId || null, cancellationId: record?.cancellationId || null,
      gameDetailDiagnostic: record?.gameDetailDiagnostic ? safeGameDetailDiagnostic({
        code: record.gameDetailDiagnostic.code, detailContext: record.gameDetailDiagnostic,
      }) : null };
  }
  health() {
    return { ok: this.healthy && this.stopFailures.size === 0, protocolVersion: 2, cancellationProtocolVersion: 1,
      activeRuns: new Set([...this.active, ...this.accepting]).size,
      pendingDeliveries: [...this.records.values()].filter(r => r.phase !== 'FENCED').reduce((n, r) => n + r.pending.length, 0),
      blockedRuns: [...this.records.values()].filter(r => r.blocked).length };
  }
  async submit(payload) {
    const runId = String(payload.runId || '');
    if (!UUID.test(runId)) throw fault('INVALID_RUN_ID', 400);
    if (!this.healthy) throw fault('SYNC_STORAGE_UNAVAILABLE', 503);
    if (this.stopFailures.size) throw fault('WORKER_STOP_NOT_CONFIRMED', 503);
    const requestHash = payloadHash(JSON.stringify(payload));
    const existing = this.records.get(runId);
    if (existing) {
      if (['FENCED', 'CANCELLING'].includes(existing.phase) || existing.requestHash !== requestHash) throw fault('RUN_ID_CONFLICT');
      // A reserved in-memory record is not an ACK. Share the pending durable write,
      // including its rejection, before acknowledging an identical request.
      const pendingWrite = this.locks.get(runId);
      if (pendingWrite) await pendingWrite;
      if (!this.healthy || !this.records.has(runId)) throw fault('SYNC_STORAGE_UNAVAILABLE', 503);
      if (['FENCED', 'CANCELLING'].includes(this.records.get(runId).phase)) throw fault('RUN_ID_CONFLICT');
      return this.status(runId);
    }
    if ([...this.records.values()].some(r => !FINAL.has(r.phase))) throw fault('ANOTHER_RUN_PENDING');
    const record = { version: 2, runId, requestHash, phase: 'ACCEPTED', lastSequence: 0,
      terminal: null, pending: [], blocked: null, updatedAt: new Date().toISOString() };
    // Reserve synchronously; no second request may pass while the first disk write awaits.
    this.accepting.add(runId);
    this.records.set(runId, record);
    try { await this.mutate(runId, () => {}); }
    catch (error) { this.records.delete(runId); throw error; }
    finally { this.accepting.delete(runId); }
    this.track(this.execute(payload));
    return this.status(runId);
  }
  async enqueue(runId, kind, payload, dispatch = true, standingsDiagnostic = null, collectionDiagnostic = null, gameDetailDiagnostic = null) {
    await this.mutate(runId, record => {
      if (record.terminal || FINAL.has(record.phase) || record.phase === 'CANCELLING') throw fault('RUN_ALREADY_TERMINAL');
      const body = JSON.stringify(payload);
      if (kind === 'failed' && gameDetailDiagnostic) {
        record.gameDetailDiagnostic = safeGameDetailDiagnostic({ code: payload.code, detailContext: gameDetailDiagnostic });
      }
      record.pending.push({ deliveryId: randomUUID(), sequence: ++record.lastSequence, kind,
        body, payloadHash: payloadHash(body), attempts: 0 });
      if (kind === 'failed' && standingsDiagnostic) {
        record.standingsDiagnostic = safeStandingsDiagnostic({ code: payload.code, standingsDiagnostic });
      }
      if (kind === 'failed' && collectionDiagnostic) {
        record.collectionDiagnostic = safeCollectionDiagnostic({ code: payload.code, collectionDiagnostic });
      }
      if (kind !== 'progress') { record.terminal = kind; record.phase = 'AWAITING_ACK'; }
    });
    if (dispatch) this.track(this.drain(runId));
  }
  async execute(payload) {
    const runId = payload.runId;
    const controller = new AbortController();
    this.collectControllers.set(runId, controller);
    this.active.add(runId);
    try {
      await this.mutate(runId, record => {
        if (record.phase === 'CANCELLING' || FINAL.has(record.phase)) throw fault('RUN_ALREADY_TERMINAL');
        record.phase = 'COLLECTING';
      });
      controller.signal.throwIfAborted();
      const result = await this.collect(payload, event => this.enqueue(runId, 'progress', event), controller.signal);
      controller.signal.throwIfAborted();
      await this.enqueue(runId, 'candidate', result);
    } catch (error) {
      const code = safeCode(error);
      const standings = safeStandingsDiagnostic(error);
      const collection = safeCollectionDiagnostic(error);
      const detail = safeGameDetailDiagnostic(error);
      if (code === 'BROWSER_STOP_NOT_CONFIRMED') this.stopFailures.add(runId);
      this.emit('collection_failed', { runId, code, causeCode: collection ? code : safeCode(error?.cause),
        ...(standings ? { standings } : {}), ...(collection ? { collection } : {}), ...(detail ? { detail } : {}) });
      if (this.healthy && !this.records.get(runId)?.terminal &&
          !['CANCELLING', 'FENCED'].includes(this.records.get(runId)?.phase)) {
        const summary = standings ? `; group=${standings.groupCode}; issues=${[...new Set(standings.issues.map(issue => issue.code))].join(',')}` : '';
        const scope = collection ? `; group=${collection.groupCode || 'UNKNOWN'}; table=${collection.table || 'UNKNOWN'}; stage=${collection.stage}; reason=${collection.reason || 'UNKNOWN'}` : '';
        const detailScope = detail ? `; stage=${detail.stage || 'UNKNOWN'}; sourceGameId=${detail.sourceGameId || 'UNKNOWN'}; providerGameId=${detail.providerGameId || 'UNKNOWN'}` : '';
        await this.enqueue(runId, 'failed', { code, message: `Collection failed (${code})${summary}${scope}${detailScope}; inspect worker diagnostics.` }, true, standings, collection, detail);
      }
    } finally { this.active.delete(runId); this.collectControllers.delete(runId); }
  }
  async drain(runId) {
    if (this.draining.has(runId)) return;
    this.draining.add(runId);
    const controller = new AbortController();
    this.deliveryControllers.set(runId, controller);
    try {
      while (this.healthy) {
        const record = this.records.get(runId);
        if (!record || record.blocked || FINAL.has(record.phase) || record.phase === 'CANCELLING' || !record.pending.length) return;
        const item = record.pending[0];
        if (item.attempts >= this.maxAttempts) {
          await this.mutate(runId, r => { r.blocked = 'CALLBACK_RETRIES_EXHAUSTED'; }); return;
        }
        const sending = await this.mutate(runId, r => {
          if (r.phase === 'CANCELLING' || FINAL.has(r.phase)) return false;
          r.pending[0].attempts += 1;
          return true;
        });
        if (!sending || controller.signal.aborted || this.records.get(runId).phase === 'CANCELLING') return;
        let code = 'CALLBACK_NETWORK_ERROR'; let retryable = true; let status = null;
        try {
          const response = await this.fetch(`${this.callbackBase}/api/internal/sync/unique-play/v2/runs/${runId}/deliveries/${item.kind}`, {
            method: 'POST', headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json',
              'x-sync-delivery-id': item.deliveryId, 'x-sync-sequence': String(item.sequence), 'x-sync-payload-sha256': item.payloadHash },
            body: item.body, signal: AbortSignal.any([AbortSignal.timeout(this.timeoutMs), controller.signal]), redirect: 'error',
          });
          status = response.status;
          if (response.ok) {
            const ack = await response.json();
            if (ack.runId !== runId || ack.deliveryId !== item.deliveryId || ack.sequence !== item.sequence ||
                ack.payloadHash !== item.payloadHash || ack.outcome !== 'APPLIED') {
              code = 'CALLBACK_ACK_MISMATCH'; retryable = false;
            } else {
              const acknowledged = await this.mutate(runId, r => {
                if (r.phase === 'CANCELLING' || r.phase === 'FENCED') return false;
                r.pending.shift();
                if (item.kind !== 'progress') r.phase = item.kind === 'candidate' ? 'COMPLETED'
                  : JSON.parse(item.body).code === 'REAUTH_REQUIRED' ? 'REAUTH_REQUIRED' : 'FAILED';
                return true;
              });
              if (!acknowledged) return;
              this.emit('callback_acknowledged', { runId, deliveryId: item.deliveryId, sequence: item.sequence, kind: item.kind });
              continue;
            }
          } else {
            code = 'CALLBACK_HTTP_ERROR';
            retryable = [408, 425, 429].includes(status) || status >= 500;
          }
        } catch (error) {
          this.emit('callback_transport_error', { runId, deliveryId: item.deliveryId, causeCode: safeCode(error?.cause) });
        }
        if (controller.signal.aborted || ['CANCELLING', 'FENCED'].includes(this.records.get(runId).phase)) return;
        this.emit('callback_delivery_failed', { runId, deliveryId: item.deliveryId, sequence: item.sequence, kind: item.kind, code, status, retryable });
        if (!retryable || this.records.get(runId).pending[0].attempts >= this.maxAttempts) {
          await this.mutate(runId, r => { r.blocked = retryable ? 'CALLBACK_RETRIES_EXHAUSTED' : code; }); return;
        }
        await delay(Math.min(30000, this.retryDelay * 2 ** item.attempts), undefined, { signal: controller.signal }).catch(() => {});
      }
    } finally { this.draining.delete(runId); this.deliveryControllers.delete(runId); }
  }
  async retry(runId) {
    if (!this.records.has(runId)) throw fault('RUN_NOT_FOUND', 404);
    if (this.draining.has(runId) || this.active.has(runId) || this.accepting.has(runId)) throw fault('RUN_BUSY');
    await this.mutate(runId, record => {
      if (FINAL.has(record.phase) || record.phase === 'CANCELLING') throw fault('RUN_ALREADY_TERMINAL');
      record.blocked = null;
      for (const item of record.pending) item.attempts = 0;
    });
    this.track(this.drain(runId));
    return this.status(runId);
  }
  async cancel(runId, cancellationId) {
    if (!UUID.test(runId) || !UUID.test(cancellationId)) throw fault('INVALID_CANCELLATION_ID', 400);
    if (!this.healthy) throw fault('SYNC_STORAGE_UNAVAILABLE', 503);
    if (this.accepting.has(runId)) throw fault('RUN_BUSY');
    if (!this.records.has(runId)) {
      this.records.set(runId, { version: 2, runId, requestHash: null, phase: 'ABSENT',
        lastSequence: 0, terminal: null, pending: [], blocked: null });
    }
    await this.mutate(runId, record => {
      if (record.cancellationId && record.cancellationId !== cancellationId) throw fault('CANCELLATION_ID_CONFLICT');
      if (record.phase === 'COMPLETED') throw fault('CANDIDATE_MUST_BE_PRESERVED');
      if (record.phase === 'FENCED') {
        if (record.cancellationId !== cancellationId) throw fault('RUN_ALREADY_TERMINAL');
        return;
      }
      record.cancellationId = cancellationId;
      record.phase = 'CANCELLING';
      // Pending payloads, including unacknowledged candidates, remain on disk for audit.
    });
    this.collectControllers.get(runId)?.abort(fault('ADMIN_CANCELLED'));
    this.deliveryControllers.get(runId)?.abort(fault('ADMIN_CANCELLED'));
    const deadline = Date.now() + 5000;
    while (this.active.has(runId) || this.draining.has(runId) || this.accepting.has(runId)) {
      if (Date.now() >= deadline) throw fault('WORKER_STOP_NOT_CONFIRMED', 503);
      await delay(25);
    }
    if (this.stopFailures.has(runId)) throw fault('WORKER_STOP_NOT_CONFIRMED', 503);
    await this.mutate(runId, record => {
      if (record.cancellationId !== cancellationId) throw fault('CANCELLATION_ID_CONFLICT');
      record.phase = 'FENCED';
    });
    this.emit('run_cancelled', { runId, cancellationId });
    return { runId, cancellationId, fenced: true, stopped: true, protocolVersion: 2, cancellationProtocolVersion: 1 };
  }
  async fence(runId, recoveryId) {
    if (!UUID.test(runId) || !UUID.test(recoveryId)) throw fault('INVALID_RECOVERY_ID', 400);
    if (this.active.has(runId) || this.draining.has(runId) || this.accepting.has(runId)) throw fault('RUN_BUSY');
    const record = this.records.get(runId);
    if (record?.phase === 'CANCELLING') throw fault('RUN_BUSY');
    if (record?.phase === 'FENCED') {
      if (record.recoveryId !== recoveryId) throw fault('RECOVERY_ID_CONFLICT');
      return { runId, recoveryId, fenced: true, protocolVersion: 2 };
    }
    if (record?.terminal === 'candidate' || record?.phase === 'COMPLETED') throw fault('CANDIDATE_MUST_BE_PRESERVED');
    if (!record) this.records.set(runId, { version: 2, runId, requestHash: null, phase: 'ABSENT', lastSequence: 0, terminal: null, pending: [], blocked: null });
    await this.mutate(runId, next => { next.phase = 'FENCED'; next.recoveryId = recoveryId; });
    return { runId, recoveryId, fenced: true, protocolVersion: 2 };
  }
}

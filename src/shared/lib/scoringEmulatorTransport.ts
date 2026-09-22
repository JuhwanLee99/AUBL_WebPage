import type { Auth } from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import type { PrivateCommitRequest, PrivateCommitTransport } from './durableScoringCommitAdapter';

type Identity = { projectId: string; runId: string; matchId: string; uid: string; writerSessionId: string };
const validId = (value: string) => /^[A-Za-z0-9_-]{1,128}$/.test(value);
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const requireValue = (condition: unknown, code: string): void => { if (!condition) throw new Error(code); };

/** Explicit local-only transport. Never imports the production Firebase singleton. */
export function createScoringEmulatorTransport(auth: Auth, identity: Identity): PrivateCommitTransport & {
  acquire(requestId: string): Promise<{ lockEpoch: number; replayed: boolean }>;
  upload(requestId: string, body: Uint8Array, sha256: string): Promise<{ blockId: string; sha256: string; size: number }>;
} {
  const fixed = structuredClone(identity);
  requireValue(Object.values(fixed).every(validId) && fixed.projectId.startsWith('demo-')
    && fixed.runId.startsWith('TEST_RUN_') && fixed.matchId.startsWith('TEST_SCORING_')
    && auth.app.options.projectId === fixed.projectId, 'emulator-transport-scope-required');
  requireValue(auth.emulatorConfig?.host === '127.0.0.1' && auth.emulatorConfig.port === 9198
    && auth.emulatorConfig.protocol === 'http', 'auth-emulator-required');
  const user = auth.currentUser;
  const allowed = () => requireValue(Boolean(user) && auth.currentUser === user && user?.uid === fixed.uid, 'emulator-writer-auth-changed');
  allowed();
  const functions = getFunctions(auth.app, 'asia-northeast3');
  connectFunctionsEmulator(functions, '127.0.0.1', 5108);
  const invoke = httpsCallable<Record<string, unknown>, Record<string, unknown>>(functions, 'scoring_test_writer', { timeout: 30000 });
  let epoch: number | undefined;
  const call = async (data: Record<string, unknown>) => {
    allowed();
    const result = await invoke(structuredClone(data));
    allowed();
    return result.data;
  };
  const base = (action: string, requestId: string) => {
    requireValue(validId(requestId), 'invalid-request-id');
    return { action, requestId, runId: fixed.runId, matchId: fixed.matchId, writerSessionId: fixed.writerSessionId };
  };
  return {
    async acquire(requestId) {
      const ack = await call(base('acquire', requestId));
      requireValue(ack.runId === fixed.runId && ack.matchId === fixed.matchId && ack.uid === fixed.uid
        && ack.writerSessionId === fixed.writerSessionId && integer(ack.lockEpoch)
        && typeof ack.replayed === 'boolean', 'invalid-session-ack');
      epoch = ack.lockEpoch as number;
      return { lockEpoch: epoch, replayed: ack.replayed as boolean };
    },
    async upload(requestId, body, sha256) {
      requireValue(integer(epoch), 'writer-session-required');
      requireValue(body instanceof Uint8Array && body.byteLength <= 128 * 1024 && /^[a-f0-9]{64}$/.test(sha256), 'invalid-upload-block');
      const copy = new Uint8Array(body);
      let binary = '';
      for (const byte of copy) binary += String.fromCharCode(byte);
      const ack = await call({ ...base('upload', requestId), lockEpoch: epoch, bodyBase64: btoa(binary), size: copy.byteLength, sha256 });
      requireValue(typeof ack.blockId === 'string' && /^[a-f0-9]{64}$/.test(ack.blockId)
        && ack.sha256 === sha256 && ack.size === copy.byteLength && ack.writerSessionId === fixed.writerSessionId
        && ack.lockEpoch === epoch && ack.published === false, 'invalid-upload-ack');
      return { blockId: ack.blockId as string, sha256, size: copy.byteLength };
    },
    async commit(request: PrivateCommitRequest) {
      const frozen = structuredClone(request);
      requireValue(integer(epoch) && frozen.runId === fixed.runId && frozen.matchId === fixed.matchId
        && frozen.writerSessionId === fixed.writerSessionId && frozen.lockEpoch === epoch, 'commit-session-mismatch');
      // Full ACK binding is enforced by DurableScoringCommitAdapter.
      return call({ ...frozen, action: 'commit' });
    },
  };
}

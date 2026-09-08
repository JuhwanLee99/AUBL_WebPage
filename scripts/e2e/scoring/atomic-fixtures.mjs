import { decideAtomicCommit, validateAtomicRequest, AtomicScoringError } from '../../../src/shared/lib/atomicScoring.ts';
export const atomicPayload = (matchId = 'LOCAL_ATOMIC_ONLY', runs = 0) => ({ matchId,
  core: { activeMatchId: matchId, inning: 1, half: 'top', outs: 0, balls: 0, strikes: 0, bases: [null, null, null], score: { home: 0, away: runs } },
  events: [{ eventId: 'play-1', outcome: runs ? 'single' : 'out' }], feed: [{ eventId: 'play-1', result: runs ? '안타 정정' : '아웃' }] });
export const atomicHead = (matchId = 'LOCAL_ATOMIC_ONLY') => ({ version: 2, matchId, ownerUid: 'LOCAL_E2E_SCORER', lockEpoch: 0, paused: false, revision: 0, commitId: '', payload: '', hash: '' });
export function memoryStorage() {
  const entries = new Map();
  return { entries, getItem: key => entries.get(key) ?? null, setItem: (key, value) => { entries.set(key, value); }, removeItem: key => { entries.delete(key); } };
}
// Atomic transaction test double, not a Firestore substitute. The separate emulator suite tests SDK and Rules.
export function memoryTransport(head = atomicHead()) {
  let current = structuredClone(head), mode = 'online', calls = 0, writes = 0;
  const receipts = new Map();
  return {
    get head() { return structuredClone(current); }, get calls() { return calls; }, get writes() { return writes; }, receipts,
    setMode(value) { mode = value; }, setHead(patch) { current = { ...current, ...patch }; },
    async commit(request) {
      calls++;
      await validateAtomicRequest(request);
      if (mode === 'offline' || mode === 'fail-before') throw new AtomicScoringError('unavailable');
      if (mode === 'denied') throw new AtomicScoringError('permission-denied');
      const decision = decideAtomicCommit(current, receipts.get(request.id) ?? null, request, 'LOCAL_E2E_SCORER');
      if (decision.write) { current = structuredClone(decision.head); receipts.set(request.id, structuredClone(decision.receipt)); writes++; }
      if (mode === 'response-lost') { mode = 'online'; throw new AtomicScoringError('unavailable'); }
      return structuredClone(decision.ack);
    },
  };
}

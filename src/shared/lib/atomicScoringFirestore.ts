import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import { AtomicScoringError, decideAtomicCommit, validateAtomicRequest } from './atomicScoring.ts';
import type { AtomicHead, AtomicReceipt, AtomicTransport } from './atomicScoring.ts';

// No global Firebase client, automatic migration, dual-write or production flag activation.
// The caller must provision a stream and bind authenticated UID before opting in.
export function createFirestoreScoringTransport(db: Firestore, options: { enabled: boolean; currentUid: () => string | null }): AtomicTransport {
  return {
    async commit(request) {
      if (!options.enabled) throw new AtomicScoringError('migration-required');
      await validateAtomicRequest(request);
      const stream = doc(db, 'scoringAtomicMatches', encodeURIComponent(request.matchId));
      const receipt = doc(stream, 'commits', request.id);
      return runTransaction(db, async transaction => {
        const actor = options.currentUid();
        if (!actor) throw new AtomicScoringError('unauthenticated');
        const headSnap = await transaction.get(stream);
        const receiptSnap = await transaction.get(receipt);
        const decision = decideAtomicCommit(headSnap.exists() ? headSnap.data() as AtomicHead : null,
          receiptSnap.exists() ? receiptSnap.data() as AtomicReceipt : null, request, actor);
        if (decision.write) {
          transaction.update(stream, { revision: decision.head.revision, commitId: request.id, payload: request.payload, hash: request.hash, updatedAt: serverTimestamp() });
          transaction.set(receipt, decision.receipt);
        }
        return decision.ack;
      });
    },
  };
}

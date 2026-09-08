import React, { useMemo, useState, useSyncExternalStore } from 'react';
import { AtomicScoringOutbox } from '../../../src/shared/lib/atomicScoring.ts';
import AtomicScoringStatus from '../../../src/features/scorekeeper/components/AtomicScoringStatus.tsx';
import { atomicHead, memoryTransport } from './atomic-fixtures.mjs';

// Browser workflow uses an injected in-memory server. Real SDK/Rules are tested separately.
export default function PersistenceProbe({ state }) {
  const [error, setError] = useState('');
  const { outbox, transport } = useMemo(() => {
    const saved = JSON.parse(sessionStorage.getItem('atomic-test-server') ?? 'null');
    const transport = memoryTransport(saved?.head ?? atomicHead(state.activeMatchId));
    for (const [id, receipt] of saved?.receipts ?? []) transport.receipts.set(id, receipt);
    const commit = transport.commit;
    transport.commit = async request => {
      try { return await commit(request); }
      finally { sessionStorage.setItem('atomic-test-server', JSON.stringify({ head: transport.head, receipts: [...transport.receipts] })); }
    };
    const outbox = new AtomicScoringOutbox({ matchId: state.activeMatchId, actorUid: 'LOCAL_E2E_SCORER', lockEpoch: 0,
      revision: transport.head.revision, transport, storage: sessionStorage });
    return { outbox, transport };
  }, [state.activeMatchId]);
  const saveState = useSyncExternalStore(outbox.subscribe, outbox.getSnapshot, outbox.getSnapshot);
  const persist = async () => {
    const { feed, events, history, futureHistory, matches, ...core } = state;
    void history; void futureHistory; void matches;
    try { await outbox.stage({ matchId: state.activeMatchId, core, feed, events }); await outbox.flush(); }
    catch (error) { setError(String(error)); }
  };
  return <section data-testid="atomic-probe">
    <h2>LOCAL ONLY: 신규 저장 계약의 주입형 전송 테스트</h2>
    <AtomicScoringStatus outbox={outbox} />
    <button data-testid="atomic-save" onClick={() => { void persist(); }}>현재 기록 원자적 저장</button>
    <button data-testid="atomic-online" onClick={() => transport.setMode('online')}>전송 복구</button>
    <button data-testid="atomic-offline" onClick={() => transport.setMode('offline')}>오프라인</button>
    <button data-testid="atomic-response-lost" onClick={() => transport.setMode('response-lost')}>커밋 후 응답 유실</button>
    <button data-testid="atomic-conflict" onClick={() => transport.setHead({ revision: transport.head.revision + 1 })}>다른 기록원 커밋</button>
    <button data-testid="atomic-denied" onClick={() => transport.setMode('denied')}>서버 권한 회수</button>
    <pre data-testid="atomic-state">{JSON.stringify({ ...saveState, head: transport.head, calls: transport.calls, writes: transport.writes, error })}</pre>
  </section>;
}

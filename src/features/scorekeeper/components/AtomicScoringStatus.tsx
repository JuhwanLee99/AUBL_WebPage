import { useSyncExternalStore } from 'react';
import type { AtomicScoringOutbox, AtomicSavePhase } from '@shared/lib/atomicScoring';
const LABELS: Record<AtomicSavePhase, string> = {
  idle: '저장 대기 없음', queued: '복구 큐에 보관됨', saving: '서버 확인 중', saved: '서버 저장 확인',
  'retry-required': '저장 결과 확인 필요', conflict: '다른 기록과 충돌: 재조회 필요', blocked: '기록 권한 또는 저장 계약 확인 필요', 'storage-error': '기기 복구 큐 오류',
};
export default function AtomicScoringStatus({ outbox }: { outbox: AtomicScoringOutbox }) {
  const state = useSyncExternalStore(outbox.subscribe, outbox.getSnapshot, outbox.getSnapshot);
  return <section aria-label="원자적 기록 저장 상태">
    <p role="status">{LABELS[state.phase]} · revision {state.revision}</p>
    {state.error && <p role="alert">{state.error}. 초안을 덮어쓰거나 자동 재시도하지 않습니다.</p>}
    {['queued', 'retry-required', 'storage-error'].includes(state.phase) && <button type="button" onClick={() => { void outbox.flush(); }}>같은 요청으로 저장 확인</button>}
  </section>;
}

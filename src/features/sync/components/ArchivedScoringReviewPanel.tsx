import { useMemo, useState } from 'react';
import { inspectArchivedScoring, prepareArchiveIssue, type ArchiveIssueDraft, type ArchiveOrigin, type ReviewBinding } from '../archivedScoringReview.ts';

type Props = { binding: ReviewBinding; documents: unknown[]; legacy: unknown; hasMore: boolean; onPrepare: (draft: ArchiveIssueDraft) => void };
function ReviewPanel({ binding, documents, legacy, hasMore, onPrepare }: Props) {
  const [origin, setOrigin] = useState<ArchiveOrigin>('documents');
  const [count, setCount] = useState(10);
  const result = useMemo(() => inspectArchivedScoring(origin === 'documents' ? documents : legacy, binding, origin, hasMore),
    [origin, documents, legacy, binding, hasMore]);
  return <section data-testid="archive-scoring-review" aria-label="보관 사건 재심 도우미">
    <h4>보관 사건 재심 도우미</h4>
    <p>공식 기록과 자체 원본은 수정하지 않습니다. 진단 신호만으로 모달 오류나 수정 완료를 확정하지 않습니다.</p>
    <label>검토할 사건 원본<select value={origin} onChange={event => { setOrigin(event.target.value as ArchiveOrigin); setCount(10); }}>
      <option value="documents">조회한 하위 사건 컬렉션</option><option value="legacy">구형 루트 사건 배열 (별도 검토)</option>
    </select></label>
    <p data-testid="archive-review-coverage">{origin === 'legacy' ? '구형 루트 배열만' : result.scope.partial ? '조회한 부분 자료만' : '현재 조회된 컬렉션 자료만'} {result.scope.loadedRows}건 검토 · 다른 원본과 합산하지 않음</p>
    {result.scope.partial && <p role="status">아직 조회하지 않은 사건이 있을 수 있습니다. 전체 경기 검증 완료가 아닙니다.</p>}
    <p>진단 {result.findings.length}건 · 유효 복합 사건 {result.ledger.compositeEvents}건 · 선수 귀속 완료 {result.ledger.attributedEvents}건</p>
    {!result.findings.length && <p>선택한 조회 범위에서 진단 신호가 없습니다. 전체 기록의 정확성을 보증하지 않습니다.</p>}
    <ol>{result.findings.slice(0, count).map(finding => {
      const prepared = prepareArchiveIssue(binding, finding, result.scope);
      return <li key={finding.id} data-testid="archive-review-finding" data-finding-kind={finding.kind} data-event-id={finding.eventId ?? finding.reference}>
        <strong>{finding.kind === 'defense' ? '수비 귀속' : finding.kind === 'scope' ? '보관 범위' : '사건 무결성'} · {finding.reference}</strong>
        <p>{finding.message}</p>
        <button type="button" disabled={!prepared} onClick={() => { if (prepared) onPrepare(prepared); }}>이슈 초안 보기</button>
        {!prepared && <small>공식 리비전·해시 또는 근거 길이를 확인하세요. 식별자를 잘라 저장하지 않습니다.</small>}
      </li>;
    })}</ol>
    {result.findings.length > count && <button type="button" onClick={() => setCount(value => value + 10)}>진단 더 보기</button>}
    <details><summary>이번 조회분의 선수별 수비 귀속 ({result.ledger.players.length}명)</summary>
      <ul>{result.ledger.players.map(player => <li key={player.key}>{player.side === 'home' ? '홈' : '원정'} {player.name} ({player.number}) · 위치 {player.positions.join(', ')} · PO {player.stats.putouts} / A {player.stats.assists} / E {player.stats.errors} / PB {player.stats.pb} / DP {player.stats.dp} / TP {player.stats.tp}{player.unconfirmedMultiOut ? ' · DP/TP 미확정 사건 포함' : ''}</li>)}</ul>
    </details>
  </section>;
}
export default function ArchivedScoringReviewPanel(props: Props & { allowed?: boolean }) {
  return props.allowed ? <ReviewPanel {...props} /> : null;
}

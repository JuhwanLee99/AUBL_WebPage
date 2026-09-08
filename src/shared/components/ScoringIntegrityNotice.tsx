import { useMemo, useState } from 'react';
import type { PlayEvent } from '../state/demoStore';
import { inspectScoringIntegrity } from '../lib/scoringIntegrity';
import './ScoringIntegrityNotice.css';

function originalText(value: unknown) {
  try { return JSON.stringify(value, null, 2); }
  catch { return '원본을 JSON으로 표시할 수 없습니다. 원본 데이터는 변경하지 않았습니다.'; }
}

export default function ScoringIntegrityNotice({ events, allowDetails = false }: { events: readonly PlayEvent[]; allowDetails?: boolean }) {
  const result = useMemo(() => inspectScoringIntegrity(events), [events]);
  const [limit, setLimit] = useState(10);
  if (result.status === 'validated') return null;
  return <section className="scoring-integrity" data-testid="scoring-integrity" aria-label="기록 정합성 안내">
    <div role="alert">
      <strong>기록 재검증 필요</strong>
      <p>일부 사건이 검증을 통과하지 못해 현재 점수·중계·개인 통계가 불완전하거나 서로 다를 수 있습니다. 확정 기록으로 사용하지 마세요.</p>
    </div>
    {allowDetails && <details>
      <summary>재심 대상 {result.issues.length}건 보기</summary>
      <p>원본은 보존됩니다. 이 목록에는 확인 없이 정상으로 처리하는 기능이 없습니다. 현재 플레이는 실행 취소 후 정정하고, 과거 플레이는 관리자 재구성·공식 자료 대조를 거쳐 처리하세요.</p>
      <ol>{result.issues.slice(0, limit).map((issue, n) => <li key={issue.eventId + '-' + n}>
        <strong>{issue.inning ? issue.inning + '회 ' + (issue.half === 'top' ? '초' : '말') + ' / ' : ''}{issue.eventId}</strong>
        <p>{issue.reasons.join(' / ')}</p>
        <details><summary>보존 원본 보기</summary><pre>{originalText(issue.original)}</pre></details>
      </li>)}</ol>
      {result.issues.length > limit && <button type="button" onClick={() => setLimit(n => n + 10)}>재심 대상 더 보기</button>}
    </details>}
  </section>;
}

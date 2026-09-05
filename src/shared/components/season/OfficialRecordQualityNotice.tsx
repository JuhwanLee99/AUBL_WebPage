import type { OfficialRecordQuality, OfficialRecordQualityIssue } from '../../../core/api/backendClient';
import './OfficialRecordQualityNotice.css';

type Props = {
  quality?: OfficialRecordQuality | null;
  issues?: OfficialRecordQualityIssue[];
  resolutionSource?: 'MANUAL' | 'SOURCE' | null;
  resolvedAt?: string | null;
};

/** Quality is independent of availability: never replace, hide, or recalculate published records. */
export function OfficialRecordQualityNotice({ quality, issues = [], resolutionSource, resolvedAt }: Props) {
  if (quality !== 'CORRECTION_PENDING' && quality !== 'RESOLVED') return null;
  const pending = quality === 'CORRECTION_PENDING';
  const description = pending
    ? '이 경기의 일부 상세 기록에 불일치나 확인이 필요한 항목이 발견되어 검토·수정 중입니다. 아래 기록은 현재 게시된 값이며, 확인되지 않은 수치를 임의로 보정하지 않습니다.'
    : resolutionSource === 'MANUAL'
      ? '관리자가 수정한 기록이 검증을 통과해 반영되었습니다.'
      : resolutionSource === 'SOURCE'
        ? 'UniquePlay 재동기화에서 기존 오류가 해결된 기록을 확인해 반영했습니다.'
        : '이전에 발견된 기록 오류가 해결된 게시본입니다.';
  const resolvedLabel = !pending ? resolutionDate(resolvedAt) : null;
  return (
    <aside className={`official-record-quality official-record-quality--${pending ? 'pending' : 'resolved'}`} aria-label="경기 기록 확인 상태">
      <div className="official-record-quality__heading" role="status">
        <strong>{pending ? '오류 수정 중' : '오류 해결'}</strong>
        {resolvedLabel && <span>{resolvedLabel} KST</span>}
      </div>
      <p>{description}</p>
      {issues.length > 0 && (
        <details className="official-record-quality__details">
          <summary>{pending ? '확인 중인 항목' : '해결된 항목'} {issues.length}건 보기</summary>
          <ul>
            {issues.map((issue, index) => (
              <li key={`${issue.id || issue.code}-${index}`}>
                {issue.teamName && <strong>{issue.teamName} · </strong>}
                {issue.message}
              </li>
            ))}
          </ul>
        </details>
      )}
    </aside>
  );
}

function resolutionDate(value: string | null | undefined): string | null {
  if (!value) return null;
  // Spring's zone-less timestamps are KST, not the viewer's local time zone.
  const normalized = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) && !/(Z|[+-]\d{2}:?\d{2})$/i.test(value)
    ? `${value}+09:00`
    : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date);
}

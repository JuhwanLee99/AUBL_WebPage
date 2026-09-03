import SeasonBadge, { type SeasonBadgeTone } from './SeasonBadge';

interface DataFreshnessProps {
  source: string;
  collectedAt?: string | null;
  publishedAt?: string | null;
  revision?: string | null;
  statusLabel: string;
  statusTone?: SeasonBadgeTone;
}

export default function DataFreshness({
  source,
  collectedAt,
  publishedAt,
  revision,
  statusLabel,
  statusTone = 'navy',
}: DataFreshnessProps) {
  return (
    <aside className="season-data-freshness" aria-label="데이터 최신성">
      <div>
        <span>데이터 출처</span>
        <strong>{source}</strong>
      </div>
      <div>
        <span>마지막 수집</span>
        <strong>{collectedAt || '수집 전'}</strong>
      </div>
      <div>
        <span>마지막 게시</span>
        <strong>{publishedAt || '게시 전'}</strong>
      </div>
      {revision ? <code title={revision}>{revision.slice(0, 8)}</code> : null}
      <SeasonBadge tone={statusTone}>{statusLabel}</SeasonBadge>
    </aside>
  );
}

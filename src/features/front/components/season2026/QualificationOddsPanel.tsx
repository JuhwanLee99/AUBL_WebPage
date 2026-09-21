import type { HomeStandingRow } from './types';
import { qualificationOdds } from './qualificationOdds';
import { projectionBucketLabel } from './projectionStatus';

export default function QualificationOdds({ row, compact = false }: { row: HomeStandingRow; compact?: boolean }) {
  const odds = qualificationOdds(row);
  const confirmed = odds.official ?? (odds.available ? odds.confirmed : null);
  const certainty = confirmed ? `${confirmed === 'out' ? '예선 탈락' : projectionBucketLabel(confirmed)} 확정` : null;
  return <div className={`s26-odds${compact ? ' is-compact' : ''}`} role="group" aria-label={`${row.teamName} 구간별 비율`}>
    {certainty && !compact ? <div className="s26-odds__confirmed">{certainty}<small>{odds.official ? '공식' : '계산 기준'}</small></div> : null}
    {!odds.available ? <small className="s26-odds__hint">{odds.reason}</small> : <>
      {!compact ? <h3>구간별 확률 <small>경우의 수 기준</small></h3> : null}
      <div className="s26-odds__values">
        {odds.values.map(value => {
          const higherCount = odds.values.filter(other => other.lower > value.lower || (other.lower === value.lower && other.upper > value.upper)).length;
          const tone = !compact && !value.confirmed && value.upper > 0n ? ` is-probability-${higherCount}` : '';
          return <div key={value.bucket} className={`s26-odds__value${value.confirmed ? ' is-confirmed' : ''}${tone}`}>
            <span>{projectionBucketLabel(value.bucket)}</span><strong>{value.label}</strong>
          </div>;
        })}
      </div>
      {compact ? <small className="s26-odds__hint">동일 확률 가정{odds.hasUnresolved ? ' · 동률 판정에 따라 변동' : ''}</small> : <>
        <p className="s26-odds__hint">{odds.assumption}한 비율입니다. 팀 전력을 반영한 승부 예측은 아닙니다.</p>
        {odds.hasUnresolved ? <p className="s26-odds__hint">전체 결과의 {odds.unresolvedLabel}는 득실점·결정경기 등 동률 판정이 남아 있습니다. 구간별 비율은 범위로 표시하며, 상한끼리 더하면 100%를 넘을 수 있습니다.</p> : null}
      </>}
    </>}
  </div>;
}

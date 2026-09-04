import type { CSSProperties } from 'react';
import type { BatterRankingSort, PitcherRankingSort } from '../../../shared/api/backendClient';
import type { TopFiveRow } from '../types';
import TopFivePanel from '../components/TopFivePanel';

interface OverviewTabProps {
  totalGames: number;
  totalTeams: number;
  averageWinPct: number;
  batterCount: number;
  pitcherCount: number;
  topBatters: TopFiveRow[];
  topPitchers: TopFiveRow[];
  topBatterSort: BatterRankingSort;
  topPitcherSort: PitcherRankingSort;
  batterSortOptions: Array<{ value: BatterRankingSort; label: string }>;
  pitcherSortOptions: Array<{ value: PitcherRankingSort; label: string }>;
  onTopBatterSortChange: (value: BatterRankingSort) => void;
  onTopPitcherSortChange: (value: PitcherRankingSort) => void;
}

export default function OverviewTab({
  totalGames,
  totalTeams,
  averageWinPct,
  batterCount,
  pitcherCount,
  topBatters,
  topPitchers,
  topBatterSort,
  topPitcherSort,
  batterSortOptions,
  pitcherSortOptions,
  onTopBatterSortChange,
  onTopPitcherSortChange,
}: OverviewTabProps) {
  return (
    <>
      <section
        className="record-hub-section"
        style={{
          display: 'grid',
          gap: '12px',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        }}
      >
        <Metric label="총 경기" value={`${totalGames} G`} />
        <Metric label="참여 팀" value={`${totalTeams} 팀`} />
        <Metric label="평균 승률" value={`${averageWinPct.toFixed(1)}%`} />
        <Metric label="타자/투수 행 수" value={`${batterCount}/${pitcherCount}`} />
      </section>

      <section
        className="record-hub-section"
        style={{
          display: 'grid',
          gap: '14px',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        }}
      >
        <TopFivePanel
          title="타자 TOP 5 (규정 IN)"
          accent="var(--season-navy-900)"
          rows={topBatters}
          emptyMessage="타자 데이터가 없습니다."
          sortLabel="기준"
          sortValue={topBatterSort}
          sortOptions={batterSortOptions}
          onSortChange={(value) => onTopBatterSortChange(value as BatterRankingSort)}
        />
        <TopFivePanel
          title="투수 TOP 5 (규정 IN)"
          accent="var(--season-blue-700)"
          rows={topPitchers}
          emptyMessage="투수 데이터가 없습니다."
          sortLabel="기준"
          sortValue={topPitcherSort}
          sortOptions={pitcherSortOptions}
          onSortChange={(value) => onTopPitcherSortChange(value as PitcherRankingSort)}
        />
      </section>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: '14px',
        borderRadius: '4px',
        border: '1px solid var(--season-line)',
        borderTop: '3px solid var(--season-blue-600)',
        background: 'var(--season-surface)',
      }}
    >
      <p style={metricLabelStyle}>{label}</p>
      <p style={metricValueStyle}>{value}</p>
    </div>
  );
}

const metricLabelStyle: CSSProperties = {
  margin: 0,
  color: 'var(--season-muted)',
  fontWeight: 800,
  fontSize: '12px',
};

const metricValueStyle: CSSProperties = {
  margin: '6px 0 0',
  color: 'var(--season-navy-950)',
  fontWeight: 900,
  fontSize: '22px',
};

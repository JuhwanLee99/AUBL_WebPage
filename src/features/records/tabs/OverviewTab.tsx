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
          accent="#ec4899"
          rows={topBatters}
          emptyMessage="타자 데이터가 없습니다."
          sortLabel="기준"
          sortValue={topBatterSort}
          sortOptions={batterSortOptions}
          onSortChange={(value) => onTopBatterSortChange(value as BatterRankingSort)}
        />
        <TopFivePanel
          title="투수 TOP 5 (규정 IN)"
          accent="#60a5fa"
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
        borderRadius: '14px',
        border: '1px solid rgba(148,163,184,0.22)',
        background: 'rgba(255,255,255,0.02)',
      }}
    >
      <p style={metricLabelStyle}>{label}</p>
      <p style={metricValueStyle}>{value}</p>
    </div>
  );
}

const metricLabelStyle: CSSProperties = {
  margin: 0,
  color: '#94a3b8',
  fontWeight: 800,
  fontSize: '12px',
};

const metricValueStyle: CSSProperties = {
  margin: '6px 0 0',
  color: '#e2e8f0',
  fontWeight: 900,
  fontSize: '22px',
};

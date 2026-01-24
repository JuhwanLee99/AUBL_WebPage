import { useMemo, useState } from 'react';
import { POWER_RANKING_DATA, POWER_RANKING_WEIGHTS } from '../../features/rankings/data/powerRankings';
import type { ComputedPowerRankingRow } from '../../features/rankings/types';

type SortKey = 'weightedScore' | '2023' | '2022' | '2021' | 'university';

const sortOptions: { key: SortKey; label: string }[] = [
  { key: 'weightedScore', label: '총점(가중)' },
  { key: '2023', label: '2023 합계' },
  { key: '2022', label: '2022 합계' },
  { key: '2021', label: '2021 합계' },
  { key: 'university', label: '대학명' },
];

const formatScore = (value: number) => value.toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const getSortValue = (row: ComputedPowerRankingRow, key: SortKey) => {
  if (key === 'university') return row.university;
  if (key === 'weightedScore') return row.weightedScore;
  const year = Number(key) as 2021 | 2022 | 2023;
  return row.yearTotals[year] ?? 0;
};

export default function PowerRankingPage() {
  const [sortKey, setSortKey] = useState<SortKey>('weightedScore');
  const [direction, setDirection] = useState<'desc' | 'asc'>('desc');

  const sortedRows = useMemo(() => {
    const cloned = [...POWER_RANKING_DATA];
    cloned.sort((a, b) => {
      const aVal = getSortValue(a, sortKey);
      const bVal = getSortValue(b, sortKey);

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }

      const diff = Number(bVal) - Number(aVal);
      return direction === 'asc' ? -diff : diff;
    });
    return cloned;
  }, [direction, sortKey]);

  const top3 = sortedRows.slice(0, 3);

  return (
    <div style={{ display: 'grid', gap: '24px' }}>
      <section
        style={{
          display: 'grid',
          gap: '16px',
          padding: 'clamp(24px, 6vw, 34px)',
          borderRadius: 'var(--surface-radius-lg)',
          background:
            'radial-gradient(circle at 12% 18%, rgba(96,165,250,0.18), transparent 32%), radial-gradient(circle at 92% 0%, rgba(249,115,22,0.22), transparent 28%), linear-gradient(135deg, #0b1630 0%, #0e1f48 100%)',
          border: '1px solid rgba(148, 163, 184, 0.25)',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.35)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span
            style={{
              padding: '8px 12px',
              borderRadius: '999px',
              fontWeight: 800,
              letterSpacing: '0.05em',
              background: 'rgba(59,130,246,0.18)',
              color: '#cbd5e1',
              border: '1px solid rgba(59, 130, 246, 0.32)',
              fontSize: '12px',
            }}
          >
            AUBL POWER RANKING
          </span>
          <span
            style={{
              padding: '6px 10px',
              borderRadius: '10px',
              fontWeight: 800,
              fontSize: '12px',
              background: 'rgba(249,115,22,0.12)',
              color: '#fb923c',
              border: '1px solid rgba(249,115,22,0.32)',
            }}
          >
            21·22·23 가중치 반영 (0.3 / 0.6 / 1.0)
          </span>
          <span style={{ marginLeft: 'auto', color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>
            숫자는 현재 데모 입력값 · 엑셀 반영 시 바로 치환됩니다.
          </span>
        </div>

        <div style={{ display: 'grid', gap: '8px' }}>
          <h1 style={{ margin: 0, fontSize: 'clamp(24px, 5vw, 32px)', fontWeight: 900, lineHeight: 1.25 }}>
            최근 3개년 실적을 가중 반영한 AUBL 파워랭킹
          </h1>
          <p style={{ margin: 0, color: '#cbd5e1', lineHeight: 1.7, maxWidth: '860px' }}>
            예선 승점(환산) + 본선 성적 점수를 연도별 가중치(21년 0.3, 22년 0.6, 23년 1.0)로 합산했습니다. 가중치를 조정하면
            즉시 총점이 재정렬되도록 설계했습니다.
          </p>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
          <span style={{ fontWeight: 800, color: '#cbd5e1' }}>정렬 기준</span>
          {sortOptions.map((option) => {
            const active = sortKey === option.key;
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => setSortKey(option.key)}
                style={{
                  borderRadius: '12px',
                  border: '1px solid rgba(148, 163, 184, 0.28)',
                  background: active ? 'linear-gradient(90deg, #f97316, #a855f7)' : 'rgba(255,255,255,0.04)',
                  color: active ? '#0b1220' : '#e2e8f0',
                  padding: '10px 14px',
                  fontWeight: 800,
                  fontSize: '13px',
                  cursor: 'pointer',
                  boxShadow: active ? '0 12px 30px rgba(249,115,22,0.25)' : 'none',
                }}
              >
                {option.label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setDirection(direction === 'asc' ? 'desc' : 'asc')}
            style={{
              marginLeft: 'auto',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(148, 163, 184, 0.28)',
              color: '#e2e8f0',
              padding: '10px 14px',
              fontWeight: 800,
              fontSize: '13px',
              borderRadius: '12px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            {direction === 'desc' ? '내림차순 ↓' : '오름차순 ↑'}
          </button>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {([2023, 2022, 2021] as const).map((year) => (
            <div
              key={year}
              style={{
                padding: '10px 12px',
                borderRadius: '12px',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(148, 163, 184, 0.2)',
                color: '#cbd5e1',
                fontWeight: 800,
                fontSize: '13px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span style={{ color: '#f97316' }}>{year}</span>
              <span style={{ color: '#e2e8f0' }}>× {POWER_RANKING_WEIGHTS[year]}</span>
              <span style={{ color: '#94a3b8', fontWeight: 700 }}>합계 = 예선 승점 환산 + 본선 점수</span>
            </div>
          ))}
        </div>
      </section>

      <section style={{ display: 'grid', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#cbd5e1' }}>
          <div
            style={{
              width: '10px',
              height: '10px',
              backgroundColor: '#f97316',
              borderRadius: '999px',
              boxShadow: '0 0 0 6px rgba(249, 115, 22, 0.18)',
            }}
          />
          <p style={{ margin: 0, fontWeight: 800, letterSpacing: '0.05em', fontSize: '13px' }}>TOP 3 SNAPSHOT</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
          {top3.map((row, idx) => (
            <div
              key={row.id}
              style={{
                padding: '16px',
                borderRadius: '16px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(148, 163, 184, 0.18)',
                boxShadow: '0 12px 30px rgba(0,0,0,0.18)',
                display: 'grid',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'space-between' }}>
                <span
                  style={{
                    padding: '6px 10px',
                    borderRadius: '10px',
                    background: idx === 0 ? '#f97316' : 'rgba(148, 163, 184, 0.16)',
                    color: idx === 0 ? '#0b1220' : '#e2e8f0',
                    fontWeight: 900,
                    fontSize: '12px',
                    letterSpacing: '0.04em',
                  }}
                >
                  #{idx + 1}
                </span>
                <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>{row.division ?? '리그'}</span>
              </div>
              <div style={{ display: 'grid', gap: '6px' }}>
                <p style={{ margin: 0, fontSize: '18px', fontWeight: 900 }}>
                  {row.university}
                  {row.nickname ? ` ${row.nickname}` : ''}
                </p>
                <p style={{ margin: 0, color: '#cbd5e1', fontWeight: 700 }}>총점 {formatScore(row.weightedScore)}</p>
              </div>
              <div style={{ display: 'grid', gap: '6px' }}>
                {[2023, 2022, 2021].map((year) => (
                  <div key={year} style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontWeight: 700 }}>
                    <span>{year}</span>
                    <span style={{ color: '#e2e8f0' }}>{formatScore(row.yearTotals[year as 2021 | 2022 | 2023])}</span>
                  </div>
                ))}
              </div>
              {row.note && <p style={{ margin: 0, color: '#94a3b8', fontSize: '13px' }}>{row.note}</p>}
            </div>
          ))}
        </div>
      </section>

      <section
        style={{
          display: 'grid',
          gap: '12px',
          background: 'rgba(15, 23, 42, 0.6)',
          borderRadius: '18px',
          border: '1px solid rgba(148, 163, 184, 0.18)',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#cbd5e1' }}>
            <span style={{ fontWeight: 800, fontSize: '13px', letterSpacing: '0.04em' }}>POWER RANKING TABLE</span>
            <span style={{ color: '#94a3b8', fontSize: '12px' }}>예선 승점 환산 + 본선 점수 → 연도 가중 합산</span>
          </div>
          <span style={{ color: '#94a3b8', fontSize: '12px' }}>
            가중치 {POWER_RANKING_WEIGHTS[2021]} · {POWER_RANKING_WEIGHTS[2022]} · {POWER_RANKING_WEIGHTS[2023]}
          </span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '820px', color: '#e2e8f0' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)', textAlign: 'left', fontSize: '13px', color: '#cbd5e1' }}>
                <th style={{ padding: '12px 16px' }}>순위</th>
                <th style={{ padding: '12px 16px' }}>대학</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>2023</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>2022</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>2021</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>총점(가중)</th>
                <th style={{ padding: '12px 16px', textAlign: 'left' }}>메모</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row, index) => (
                <tr key={row.id} style={{ borderTop: '1px solid rgba(148, 163, 184, 0.16)' }}>
                  <td style={{ padding: '12px 16px', fontWeight: 800, color: '#cbd5e1' }}>{index + 1}</td>
                  <td style={{ padding: '12px 16px', fontWeight: 800 }}>
                    {row.university}
                    {row.nickname ? ` ${row.nickname}` : ''}
                    <span style={{ marginLeft: '8px', color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>
                      {row.division ?? '리그'}
                    </span>
                  </td>
                  {[2023, 2022, 2021].map((year) => (
                    <td key={year} style={{ padding: '12px 16px', textAlign: 'right', color: '#e2e8f0', fontWeight: 700 }}>
                      {formatScore(row.yearTotals[year as 2021 | 2022 | 2023])}
                    </td>
                  ))}
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 900, color: '#f97316' }}>
                    {formatScore(row.weightedScore)}
                  </td>
                  <td style={{ padding: '12px 16px', color: '#94a3b8', fontSize: '13px' }}>{row.note ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section
        style={{
          padding: '18px',
          borderRadius: '16px',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(148, 163, 184, 0.2)',
          boxShadow: '0 12px 30px rgba(0,0,0,0.18)',
          display: 'grid',
          gap: '10px',
        }}
      >
        <p style={{ margin: 0, color: '#cbd5e1', fontWeight: 800, letterSpacing: '0.04em', fontSize: '13px' }}>계산 방식 메모</p>
        <ul style={{ margin: 0, paddingLeft: '18px', color: '#94a3b8', lineHeight: 1.7 }}>
          <li>예선 승점: 승 3점, 무 1점, 패 0점. 조별 경기 수가 다른 경우 4경기 기준으로 환산(3경기 × 1.33).</li>
          <li>본선 점수: 우승 25 / 준우승 20 / 4강 15 / 8강·버금우승 10 / 16강·버금준우승 5 / 예선 탈락 0.</li>
          <li>연도 합계 = 예선 승점 환산 + 본선 점수.</li>
          <li>총점(파워랭킹) = 2021 합계 × 0.3 + 2022 합계 × 0.6 + 2023 합계 × 1.0.</li>
        </ul>
      </section>
    </div>
  );
}

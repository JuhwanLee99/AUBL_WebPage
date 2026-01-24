import { useEffect, useMemo, useState } from 'react';
import {
  POWER_RANKING_WEIGHTS,
  DEMO_POWER_RANKING_ROWS,
  DEMO_TEAM_SEASONS,
  buildPowerRankingRowsFromTeamSeasons,
  computePowerRankingRows,
  getAvailableSeasonYears,
} from '../../features/rankings/data/powerRankings';
import type { ComputedPowerRankingRow, PowerRankingRow } from '../../features/rankings/types';

type SortKey = 'weightedScore' | number | 'university';

const formatScore = (value: number | undefined) =>
  (value ?? 0).toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const getSortValue = (row: ComputedPowerRankingRow, key: SortKey) => {
  if (key === 'university') return row.university;
  if (key === 'weightedScore') return row.weightedScore;
  const year = Number(key);
  return row.yearTotals[year] ?? 0;
};

export default function PowerRankingPage() {
  const [rows, setRows] = useState<PowerRankingRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [rankingYear, setRankingYear] = useState<number>(new Date().getFullYear());
  const [sortKey, setSortKey] = useState<SortKey>('weightedScore');
  const [direction, setDirection] = useState<'desc' | 'asc'>('desc');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        // TODO: 실제 DB/API 연동 시 아래를 교체하세요.
        // const res = await fetch('/api/power-ranking/seasons');
        // const seasons = (await res.json()) as TeamSeasonPowerInput[];
        const seasons = DEMO_TEAM_SEASONS;
        const hydratedRows = buildPowerRankingRowsFromTeamSeasons(seasons);
        setRows(hydratedRows);

        const years = getAvailableSeasonYears(hydratedRows);
        if (years.length >= 3) {
          setRankingYear(Math.max(...years) + 1);
        }
      } catch (err) {
        console.error(err);
        setError('파워랭킹 데이터를 불러오지 못했습니다. 데모 데이터로 대체했습니다.');
        setRows(DEMO_POWER_RANKING_ROWS);
        const years = getAvailableSeasonYears(DEMO_POWER_RANKING_ROWS);
        if (years.length >= 3) {
          setRankingYear(Math.max(...years) + 1);
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const computedRows = useMemo(
    () => (rows.length ? computePowerRankingRows(rankingYear, rows, POWER_RANKING_WEIGHTS) : []),
    [rankingYear, rows],
  );
  const seasonYears = useMemo(() => getAvailableSeasonYears(rows), [rows]);
  const windowYears = computedRows[0]?.windowYears ?? [rankingYear - 1, rankingYear - 2, rankingYear - 3];

  const sortOptions: { key: SortKey; label: string }[] = [
    { key: 'weightedScore', label: '총점(가중)' },
    ...windowYears.map((year) => ({ key: year, label: `${year} 합계` })),
    { key: 'university', label: '대학명' },
  ];

  const sortedRows = useMemo(() => {
    const cloned = [...computedRows];
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
  }, [computedRows, direction, sortKey]);

  const top3 = sortedRows.slice(0, 3);

  if (loading) {
    return (
      <div style={{ padding: '32px', color: '#cbd5e1' }}>
        <p style={{ margin: 0, fontWeight: 800 }}>파워랭킹 데이터를 불러오는 중입니다...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '32px', color: '#cbd5e1', display: 'grid', gap: '12px' }}>
        <p style={{ margin: 0, fontWeight: 900, color: '#f97316' }}>데이터 로딩 오류</p>
        <p style={{ margin: 0 }}>{error}</p>
      </div>
    );
  }

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
            직전 3개년 가중치 적용 (가까울수록 가중 ↑)
          </span>
          <span style={{ marginLeft: 'auto', color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>
            숫자는 현재 데모 입력값 · 엑셀 반영 시 바로 치환됩니다.
          </span>
        </div>

        <div style={{ display: 'grid', gap: '8px' }}>
          <h1 style={{ margin: 0, fontSize: 'clamp(24px, 5vw, 32px)', fontWeight: 900, lineHeight: 1.25 }}>
            {rankingYear} 시즌 기준 직전 3개년 가중 파워랭킹
          </h1>
          <p style={{ margin: 0, color: '#cbd5e1', lineHeight: 1.7, maxWidth: '860px' }}>
            예선 승점(환산) + 본선 성적 점수를 선택 연도의 직전 3개년으로 묶어 가중 평균합니다. 새 시즌 실시간 DB가 추가되면 가장 최근
            3개년이 자동 반영되도록 설계했습니다.
          </p>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontWeight: 800, color: '#cbd5e1' }}>
            기준 시즌
            <select
              value={rankingYear}
              onChange={(e) => setRankingYear(Number(e.target.value))}
              style={{
                borderRadius: '10px',
                border: '1px solid rgba(148, 163, 184, 0.35)',
                background: 'rgba(15,23,42,0.8)',
                color: '#e2e8f0',
                padding: '8px 10px',
                fontWeight: 800,
              }}
            >
              {seasonYears.length >= 3 ? (
                seasonYears
                  .filter((y) => y >= Math.min(...seasonYears) + 2) // 직전 3개년 확보를 위해 최소 2만큼 위
                  .map((mostRecentSeason) => {
                    const targetYear = mostRecentSeason + 1; // 해당 시즌 직후 랭킹
                    const yrs = [mostRecentSeason, mostRecentSeason - 1, mostRecentSeason - 2];
                    return (
                      <option key={targetYear} value={targetYear}>
                        {targetYear} 시즌 (직전 {yrs[0]}, {yrs[1]}, {yrs[2]})
                      </option>
                    );
                  })
                  .reverse()
              ) : (
                <option value={rankingYear}>데이터 대기</option>
              )}
            </select>
          </label>

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
          {windowYears.map((year, idx) => (
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
              <span style={{ color: '#e2e8f0' }}>× {POWER_RANKING_WEIGHTS[idx] ?? 0}</span>
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
                {windowYears.map((year) => (
                  <div key={year} style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontWeight: 700 }}>
                    <span>{year}</span>
                    <span style={{ color: '#e2e8f0' }}>{formatScore(row.yearTotals[year])}</span>
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
            <span style={{ color: '#94a3b8', fontSize: '12px' }}>
              예선 승점 환산 + 본선 점수 → 직전 3개년 가중 합산 (기준 시즌 {rankingYear})
            </span>
          </div>
          <span style={{ color: '#94a3b8', fontSize: '12px' }}>
            가중치 {POWER_RANKING_WEIGHTS[0]} (최근) · {POWER_RANKING_WEIGHTS[1]} · {POWER_RANKING_WEIGHTS[2]}
          </span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '820px', color: '#e2e8f0' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)', textAlign: 'left', fontSize: '13px', color: '#cbd5e1' }}>
                <th style={{ padding: '12px 16px' }}>순위</th>
                <th style={{ padding: '12px 16px' }}>대학</th>
                {windowYears.map((year) => (
                  <th key={year} style={{ padding: '12px 16px', textAlign: 'right' }}>
                    {year}
                  </th>
                ))}
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
                  {windowYears.map((year) => (
                    <td key={year} style={{ padding: '12px 16px', textAlign: 'right', color: '#e2e8f0', fontWeight: 700 }}>
                      {formatScore(row.yearTotals[year] ?? 0)}
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
          <li>총점(파워랭킹) = 기준 시즌의 직전 3개년 합계 × 가중치(최근→과거 = 1.0 / 0.6 / 0.3).</li>
        </ul>
      </section>
    </div>
  );
}

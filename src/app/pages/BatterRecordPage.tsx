import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getBatterRankings,
  getSeasons,
  type BatterRanking,
  type SeasonSummary,
} from '../../shared/api/backendClient';

type SortKey =
  | 'battingAverage'
  | 'hits'
  | 'homeRuns'
  | 'rbi'
  | 'ops'
  | 'sluggingPct'
  | 'onBasePct';

export default function BatterRecordPage() {
  const [seasons, setSeasons] = useState<SeasonSummary[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(null);
  const [data, setData] = useState<BatterRanking[]>([]);
  const [initializing, setInitializing] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>('battingAverage');

  useEffect(() => {
    let isMounted = true;

    getSeasons()
      .then((items) => {
        if (!isMounted) return;
        setSeasons(items);
        if (items.length === 0) {
          setError('등록된 시즌이 없습니다.');
          return;
        }
        setLoading(true);
        setSelectedSeasonId((prev) => prev ?? items[0].id);
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : '시즌 목록을 불러오지 못했습니다.');
      })
      .finally(() => {
        if (!isMounted) return;
        setInitializing(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (selectedSeasonId == null) return;
    let isMounted = true;
    getBatterRankings({ seasonId: selectedSeasonId, sort, limit: 0 })
      .then((rows) => {
        if (!isMounted) return;
        setData(rows);
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        setData([]);
        setError(err instanceof Error ? err.message : '타자 랭킹을 불러오지 못했습니다.');
      })
      .finally(() => {
        if (!isMounted) return;
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedSeasonId, sort]);

  const selectedSeason = seasons.find((season) => season.id === selectedSeasonId) ?? null;

  const sortLabels: Record<SortKey, string> = {
    battingAverage: 'AVG',
    hits: 'H',
    homeRuns: 'HR',
    rbi: 'RBI',
    ops: 'OPS',
    sluggingPct: 'SLG',
    onBasePct: 'OBP',
  };

  return (
    <div style={{ display: 'grid', gap: '22px' }}>
      <header
        style={{
          padding: '26px',
          borderRadius: '22px',
          background: 'linear-gradient(130deg, rgba(236,72,153,0.16) 0%, rgba(15,23,42,0.92) 70%)',
          border: '1px solid rgba(148,163,184,0.25)',
          boxShadow: '0 20px 50px rgba(0,0,0,0.35)',
          display: 'grid',
          gap: '10px',
        }}
      >
        <span
          style={{
            padding: '7px 12px',
            borderRadius: '999px',
            background: 'rgba(236,72,153,0.14)',
            border: '1px solid rgba(236,72,153,0.45)',
            color: '#fbcfe8',
            fontWeight: 800,
            letterSpacing: '0.03em',
            width: 'fit-content',
          }}
        >
          타자 기록
        </span>
        <h1 style={{ margin: 0, fontSize: '30px', fontWeight: 900 }}>
          {selectedSeason ? `${selectedSeason.year} 시즌 타자 랭킹` : '시즌 타자 랭킹'}
        </h1>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <label
            style={{
              display: 'inline-flex',
              gap: '8px',
              alignItems: 'center',
              color: '#94a3b8',
              fontWeight: 700,
              fontSize: '12px',
            }}
          >
            SEASON
            <select
              value={selectedSeasonId ?? ''}
              disabled={seasons.length === 0}
              onChange={(e) => {
                const nextSeasonId = Number(e.target.value);
                if (nextSeasonId === selectedSeasonId) return;
                setError(null);
                setLoading(true);
                setSelectedSeasonId(nextSeasonId);
              }}
              style={{
                minWidth: '150px',
                borderRadius: '10px',
                border: '1px solid rgba(148,163,184,0.35)',
                background: 'rgba(15,23,42,0.85)',
                color: '#e2e8f0',
                padding: '6px 10px',
                fontWeight: 800,
              }}
            >
              {seasons.map((season) => (
                <option key={season.id} value={season.id}>
                  {season.year} 시즌 (ID: {season.id})
                </option>
              ))}
            </select>
          </label>
          <span style={{ color: '#94a3b8', fontSize: '12px' }}>
            요청: `GET /api/rankings/batters` · 시즌별 선수/소속팀/등번호/년도
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {(
            ['battingAverage', 'hits', 'homeRuns', 'rbi', 'ops', 'sluggingPct', 'onBasePct'] as SortKey[]
          ).map((key) => (
            <button
              key={key}
              onClick={() => {
                if (key === sort) return;
                setError(null);
                setLoading(true);
                setSort(key);
              }}
              style={{
                padding: '6px 14px',
                borderRadius: '999px',
                border: sort === key ? '1px solid rgba(236,72,153,0.6)' : '1px solid rgba(148,163,184,0.25)',
                background: sort === key ? 'rgba(236,72,153,0.18)' : 'transparent',
                color: sort === key ? '#fbcfe8' : '#94a3b8',
                fontWeight: 800,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              {sortLabels[key]}
            </button>
          ))}
        </div>
      </header>

      {(initializing || loading) && (
        <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>데이터를 불러오는 중...</div>
      )}
      {error && (
        <div style={{ padding: '40px', textAlign: 'center', color: '#f87171' }}>오류: {error}</div>
      )}

      {!loading && !error && data.length === 0 && (
        <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>기록 데이터가 없습니다.</div>
      )}

      {!initializing && !loading && !error && data.length > 0 && (
        <div style={{ overflowX: 'auto', borderRadius: '18px', border: '1px solid rgba(148,163,184,0.18)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: 'rgba(30,41,59,0.7)' }}>
                {['#', '이름', '팀', '등번호', '년도', 'AVG', 'OBP', 'SLG', 'OPS', 'HR', 'RBI', 'SB', 'H', 'G'].map((col) => (
                  <th
                    key={col}
                    style={{
                      padding: '12px 10px',
                      textAlign: col === '이름' || col === '팀' ? 'left' : 'center',
                      color: '#94a3b8',
                      fontWeight: 800,
                      fontSize: '11px',
                      letterSpacing: '0.05em',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr
                  key={`${row.playerId}-${row.seasonId}`}
                  style={{
                    background: i < 3 ? 'rgba(236,72,153,0.06)' : 'transparent',
                    borderBottom: '1px solid rgba(148,163,184,0.08)',
                  }}
                >
                  <td style={{ padding: '10px', textAlign: 'center', fontWeight: 800, color: i < 3 ? '#f472b6' : '#94a3b8' }}>
                    {row.rank || i + 1}
                  </td>
                  <td style={{ padding: '10px' }}>
                    <Link
                      to={`/records/player/${row.playerId}`}
                      style={{ fontWeight: 800, color: 'inherit', textDecoration: 'none' }}
                    >
                      {row.playerName}
                    </Link>
                  </td>
                  <td style={{ padding: '10px', color: '#94a3b8', fontSize: '12px' }}>{row.teamName}</td>
                  <td style={{ padding: '10px', textAlign: 'center', color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>
                    {row.jerseyNumber || '-'}
                  </td>
                  <td style={{ padding: '10px', textAlign: 'center', color: '#cbd5e1', fontVariantNumeric: 'tabular-nums' }}>
                    {row.seasonYear ?? selectedSeason?.year ?? '-'}
                  </td>
                  <td style={{ padding: '10px', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{row.battingAverage?.toFixed(3) ?? '-'}</td>
                  <td style={{ padding: '10px', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{row.onBasePct?.toFixed(3) ?? '-'}</td>
                  <td style={{ padding: '10px', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{row.sluggingPct?.toFixed(3) ?? '-'}</td>
                  <td style={{ padding: '10px', textAlign: 'center', fontVariantNumeric: 'tabular-nums', color: '#f472b6', fontWeight: 800 }}>{row.ops?.toFixed(3) ?? '-'}</td>
                  <td style={{ padding: '10px', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{row.homeRuns ?? '-'}</td>
                  <td style={{ padding: '10px', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{row.runsBattedIn ?? '-'}</td>
                  <td style={{ padding: '10px', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{row.stolenBases ?? '-'}</td>
                  <td style={{ padding: '10px', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{row.hits ?? '-'}</td>
                  <td style={{ padding: '10px', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{row.gamesPlayed ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

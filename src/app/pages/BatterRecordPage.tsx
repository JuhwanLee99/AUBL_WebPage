import { useEffect, useMemo, useState } from 'react';
import { getBatterRecords, getSeasons } from '../../shared/api';
import type { BatterRecordRow, SeasonSummary } from '../../shared/api';

export default function BatterRecordPage() {
  const [seasons, setSeasons] = useState<SeasonSummary[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | undefined>();
  const [rows, setRows] = useState<BatterRecordRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const fetched = await getSeasons();
        if (!mounted) return;
        setSeasons(fetched);
        if (fetched.length > 0) setSelectedSeasonId((prev) => prev ?? fetched[0].id);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : '시즌 목록을 불러오지 못했습니다.');
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const fetched = await getBatterRecords({ seasonId: selectedSeasonId, sort: 'ops', limit: 200 });
        if (!mounted) return;
        const ranked = [...fetched].sort((a, b) => b.ops - a.ops || b.hits - a.hits);
        setRows(ranked);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : '타자 기록을 불러오지 못했습니다.');
        setRows([]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [selectedSeasonId]);

  const activeYear = useMemo(
    () => seasons.find((season) => season.id === selectedSeasonId)?.year,
    [seasons, selectedSeasonId]
  );

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
        <span style={{ padding: '7px 12px', borderRadius: '999px', background: 'rgba(236,72,153,0.14)', border: '1px solid rgba(236,72,153,0.45)', color: '#fbcfe8', fontWeight: 800, letterSpacing: '0.03em', width: 'fit-content' }}>
          타자 기록
        </span>
        <div style={{ display: 'grid', gap: '6px' }}>
          <h1 style={{ margin: 0, fontSize: '30px', fontWeight: 900 }}>백엔드 집계 기반 – 타자 랭킹</h1>
          <p style={{ margin: 0, color: '#cbd5e1', lineHeight: 1.6 }}>
            시즌별 타율·출루율·장타율·OPS와 주요 counting stat을 제공합니다.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <label style={{ display: 'grid', gap: '6px', fontWeight: 800, color: '#94a3b8', fontSize: '12px' }}>
            시즌 선택
            <select
              value={selectedSeasonId ?? ''}
              onChange={(e) => setSelectedSeasonId(Number(e.target.value) || undefined)}
              style={{
                background: '#0f172a',
                color: '#e2e8f0',
                padding: '11px 14px',
                borderRadius: '12px',
                border: '1px solid rgba(148,163,184,0.35)',
                fontWeight: 800,
              }}
            >
              {seasons.map((season) => (
                <option key={season.id} value={season.id}>
                  {season.year} 시즌
                </option>
              ))}
            </select>
          </label>
          <div style={{ display: 'grid', gap: '6px', alignContent: 'end' }}>
            <span style={{ color: '#94a3b8', fontWeight: 800, fontSize: '12px' }}>선택 시즌</span>
            <span style={{ color: '#e2e8f0', fontWeight: 900 }}>{activeYear ?? '-'}</span>
          </div>
        </div>
      </header>

      <section
        style={{
          padding: 0,
          borderRadius: '18px',
          border: '1px solid rgba(148,163,184,0.25)',
          overflow: 'hidden',
          background: 'rgba(15,23,42,0.75)',
        }}
      >
        {loading && <p style={{ margin: 0, padding: '16px', color: '#cbd5e1' }}>타자 기록을 불러오는 중...</p>}
        {error && <p style={{ margin: 0, padding: '16px', color: '#fca5a5' }}>{error}</p>}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '60px 1.1fr 0.9fr repeat(8, minmax(70px, 0.6fr))',
            alignItems: 'center',
            gap: '12px',
            padding: '14px 18px',
            background: 'rgba(255,255,255,0.03)',
            color: '#94a3b8',
            fontWeight: 800,
            fontSize: '13px',
          }}
        >
          <span>순위</span>
          <span>선수</span>
          <span>팀</span>
          <span>AVG</span>
          <span>OBP</span>
          <span>SLG</span>
          <span>OPS</span>
          <span>HR</span>
          <span>RBI</span>
          <span>SB</span>
          <span>G</span>
        </div>

        <div style={{ display: 'grid' }}>
          {rows.map((row, idx) => {
            const rank = idx + 1;
            return (
              <div
                key={`${row.playerId}-${row.teamId}-${row.seasonId}`}
                className="player-row"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '60px 1.1fr 0.9fr repeat(8, minmax(70px, 0.6fr))',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '14px 18px',
                  borderTop: '1px solid rgba(148,163,184,0.14)',
                  background: rank <= 3 ? 'rgba(236,72,153,0.07)' : 'transparent',
                }}
              >
                <span style={{ fontWeight: 900, color: rank <= 3 ? '#f472b6' : '#e2e8f0' }}>#{rank}</span>
                <span style={{ fontWeight: 800 }}>{row.playerName}</span>
                <span style={{ color: '#cbd5e1', fontWeight: 700 }}>{row.teamName}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums', color: '#e2e8f0' }}>{row.battingAverage.toFixed(3)}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums', color: '#e2e8f0' }}>{row.onBasePct.toFixed(3)}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums', color: '#e2e8f0' }}>{row.sluggingPct.toFixed(3)}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums', color: '#f97316', fontWeight: 800 }}>{row.ops.toFixed(3)}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums', color: '#e2e8f0' }}>{row.homeRuns}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums', color: '#e2e8f0' }}>{row.runsBattedIn}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums', color: row.stolenBases >= 10 ? '#34d399' : '#e2e8f0' }}>{row.stolenBases}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums', color: '#e2e8f0' }}>{row.gamesPlayed}</span>
              </div>
            );
          })}
          {!loading && rows.length === 0 && (
            <p style={{ margin: 0, padding: '16px', color: '#94a3b8' }}>표시할 타자 기록이 없습니다.</p>
          )}
        </div>
      </section>
    </div>
  );
}

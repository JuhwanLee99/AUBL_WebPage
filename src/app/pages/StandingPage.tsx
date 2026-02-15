import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import gsap from 'gsap';
import {
  getRecordOverview,
  getSeasons,
  getTeamRecordStandings,
  type RecordsOverview,
  type SeasonSummary,
  type TeamRecordStanding,
} from '../../shared/api/backendClient';

function toWinPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value <= 1 ? value * 100 : value;
}

function estimateGamesFromStandings(rows: TeamRecordStanding[]): number {
  const teamGameSum = rows.reduce((sum, row) => sum + row.wins + row.losses + row.ties, 0);
  return Math.floor(teamGameSum / 2);
}

interface EnrichedStanding extends TeamRecordStanding {
  games: number;
  winPctDisplay: number;
}

export default function StandingsPage() {
  const pageRef = useRef<HTMLDivElement>(null);
  const [seasons, setSeasons] = useState<SeasonSummary[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(null);
  const [overview, setOverview] = useState<RecordsOverview | null>(null);
  const [standings, setStandings] = useState<TeamRecordStanding[]>([]);
  const [initializing, setInitializing] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    getSeasons()
      .then((items) => {
        if (!isMounted) return;
        setSeasons(items);
        if (items.length > 0) {
          setLoading(true);
          setSelectedSeasonId((prev) => prev ?? items[0].id);
        } else {
          setError('등록된 시즌이 없습니다. 관리자에서 시즌을 먼저 생성해 주세요.');
        }
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

    Promise.allSettled([getTeamRecordStandings(selectedSeasonId), getRecordOverview(selectedSeasonId)])
      .then(([standingResult, overviewResult]) => {
        if (!isMounted) return;
        const standingRows = standingResult.status === 'fulfilled' ? standingResult.value : [];
        const overviewData =
          overviewResult.status === 'fulfilled'
            ? overviewResult.value
            : {
                seasonId: selectedSeasonId,
                totalGames: estimateGamesFromStandings(standingRows),
                totalTeams: standingRows.length,
                topBatter: null,
                topPitcher: null,
              };

        setStandings(standingRows);
        setOverview(overviewData);

        const failedCount = [standingResult, overviewResult].filter(
          (result) => result.status === 'rejected',
        ).length;

        if (failedCount === 2) {
          setError('순위 데이터를 불러오지 못했습니다.');
          return;
        }
        if (failedCount > 0) {
          setWarning('일부 데이터 소스를 불러오지 못해 요약 값이 추정치로 표시될 수 있습니다.');
        }
      })
      .finally(() => {
        if (!isMounted) return;
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedSeasonId]);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const cards = pageRef.current?.querySelectorAll('.standing-chunk');
      if (!cards) return;
      gsap.fromTo(
        cards,
        { y: 20, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.72, stagger: 0.08, ease: 'power2.out' },
      );
    });

    return () => ctx.revert();
  }, [selectedSeasonId, loading]);

  const enrichedRankings = useMemo<EnrichedStanding[]>(() => {
    return [...standings]
      .map((row) => {
        const games = row.wins + row.losses + row.ties;
        return {
          ...row,
          games,
          winPctDisplay: toWinPct(row.winPct),
        };
      })
      .sort((a, b) => b.winPctDisplay - a.winPctDisplay || b.wins - a.wins || a.losses - b.losses);
  }, [standings]);

  const topTeam = enrichedRankings[0] ?? null;
  const averageWinPct =
    enrichedRankings.reduce((sum, row) => sum + row.winPctDisplay, 0) /
    Math.max(1, enrichedRankings.length);

  const selectedSeason =
    seasons.find((season) => season.id === selectedSeasonId) ?? null;

  return (
    <div style={{ display: 'grid', gap: '24px' }} ref={pageRef}>
      <section
        className="standing-chunk"
        style={{
          borderRadius: '22px',
          padding: '24px',
          background:
            'radial-gradient(circle at 8% 20%, rgba(16,185,129,0.16), transparent 34%), radial-gradient(circle at 86% 0%, rgba(249,115,22,0.16), transparent 30%), linear-gradient(135deg, #0f172a 0%, #111827 100%)',
          border: '1px solid rgba(148, 163, 184, 0.2)',
          boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
          display: 'grid',
          gap: '14px',
        }}
      >
        <p style={{ margin: 0, fontSize: '13px', letterSpacing: '0.08em', fontWeight: 800, color: '#34d399' }}>
          BACKEND SEASON STANDINGS
        </p>
        <h2 style={{ margin: 0, fontSize: '30px', fontWeight: 900 }}>
          {selectedSeason ? `${selectedSeason.year} 시즌 팀 순위` : '시즌 팀 순위'}
        </h2>
        <p style={{ margin: 0, color: '#cbd5e1', lineHeight: 1.6 }}>
          경기 중 실시간 이벤트는 Firebase를 기준으로 제공하고, 종료 후 확정된 순위/전적은 백엔드 DB 집계를 기준으로 노출합니다.
        </p>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ display: 'grid', gap: '6px', color: '#94a3b8', fontWeight: 700, fontSize: '12px' }}>
            SEASON
            <select
              value={selectedSeasonId ?? ''}
              disabled={seasons.length === 0}
              onChange={(e) => {
                const nextSeasonId = Number(e.target.value);
                if (nextSeasonId === selectedSeasonId) return;
                setError(null);
                setWarning(null);
                setLoading(true);
                setSelectedSeasonId(nextSeasonId);
              }}
              style={{
                minWidth: '150px',
                borderRadius: '10px',
                border: '1px solid rgba(148,163,184,0.35)',
                background: '#0f172a',
                color: '#e2e8f0',
                padding: '10px 12px',
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

          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <Link
              to="/prediction"
              style={{
                padding: '10px 12px',
                borderRadius: '10px',
                fontWeight: 800,
                background: 'rgba(52,211,153,0.16)',
                border: '1px solid rgba(52,211,153,0.35)',
                color: '#a7f3d0',
              }}
            >
              승부예측 이동
            </Link>
            <Link
              to="/standings/power-ranking"
              style={{
                padding: '10px 12px',
                borderRadius: '10px',
                fontWeight: 800,
                background: 'rgba(59,130,246,0.16)',
                border: '1px solid rgba(59,130,246,0.35)',
                color: '#bfdbfe',
              }}
            >
              파워랭킹 보기
            </Link>
          </div>
        </div>
      </section>

      <section className="standing-chunk" style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <Metric label="리그 평균 승률" value={`${averageWinPct.toFixed(1)}%`} />
        <Metric label="기록된 팀" value={`${enrichedRankings.length}팀`} />
        <Metric label="기록된 경기" value={`${overview?.totalGames ?? 0}경기`} />
        <Metric label="총 승수" value={`${enrichedRankings.reduce((sum, row) => sum + row.wins, 0)}승`} />
      </section>

      {(initializing || loading) && (
        <section className="standing-chunk" style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>
          순위 데이터를 불러오는 중입니다...
        </section>
      )}

      {error && (
        <section className="standing-chunk" style={{ padding: '30px', textAlign: 'center', color: '#f87171' }}>
          오류: {error}
        </section>
      )}

      {!error && warning && (
        <section className="standing-chunk" style={{ padding: '20px', textAlign: 'center', color: '#facc15' }}>
          {warning}
        </section>
      )}

      {!initializing && !loading && !error && topTeam && (
        <section
          className="standing-chunk"
          style={{
            borderRadius: '16px',
            border: '1px solid rgba(148, 163, 184, 0.2)',
            background: 'rgba(15, 23, 42, 0.55)',
            padding: '16px',
          }}
        >
          <p style={{ margin: 0, color: '#94a3b8', fontWeight: 800, fontSize: '12px', letterSpacing: '0.05em' }}>
            CURRENT #1
          </p>
          <p style={{ margin: '8px 0 0', fontSize: '22px', fontWeight: 900 }}>{topTeam.teamName}</p>
          <p style={{ margin: '6px 0 0', color: '#cbd5e1', fontWeight: 700 }}>
            {topTeam.wins}-{topTeam.ties}-{topTeam.losses} · 승률 {topTeam.winPctDisplay.toFixed(1)}%
          </p>
        </section>
      )}

      {!initializing && !loading && !error && (
        <section
          className="standing-chunk"
          style={{
            borderRadius: '18px',
            border: '1px solid rgba(148, 163, 184, 0.2)',
            overflow: 'hidden',
            background: 'rgba(15, 23, 42, 0.55)',
          }}
        >
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '640px' }}>
              <thead>
                <tr style={{ color: '#94a3b8', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <th style={{ padding: '12px 10px', textAlign: 'left' }}>순위</th>
                  <th style={{ padding: '12px 10px', textAlign: 'left' }}>팀</th>
                  <th style={{ padding: '12px 10px', textAlign: 'center' }}>경기</th>
                  <th style={{ padding: '12px 10px', textAlign: 'center' }}>승-무-패</th>
                  <th style={{ padding: '12px 10px', textAlign: 'center' }}>승률</th>
                </tr>
              </thead>
              <tbody>
                {enrichedRankings.map((row, index) => (
                  <tr key={row.teamId} style={{ borderTop: '1px solid rgba(148, 163, 184, 0.12)' }}>
                    <td style={{ padding: '12px 10px', fontWeight: 900, color: '#cbd5e1' }}>{index + 1}</td>
                    <td style={{ padding: '12px 10px', fontWeight: 800 }}>{row.teamName}</td>
                    <td style={{ padding: '12px 10px', textAlign: 'center', color: '#cbd5e1' }}>{row.games}</td>
                    <td style={{ padding: '12px 10px', textAlign: 'center', color: '#cbd5e1' }}>
                      {row.wins}-{row.ties}-{row.losses}
                    </td>
                    <td style={{ padding: '12px 10px', textAlign: 'center', color: '#22c55e', fontWeight: 800 }}>
                      {row.winPctDisplay.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {enrichedRankings.length === 0 && (
            <p style={{ margin: 0, padding: '20px', textAlign: 'center', color: '#94a3b8' }}>
              표시할 팀 순위 데이터가 없습니다.
            </p>
          )}
        </section>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: '14px',
        borderRadius: '14px',
        border: '1px solid rgba(148, 163, 184, 0.22)',
        background: 'rgba(255,255,255,0.02)',
      }}
    >
      <p style={{ margin: 0, color: '#94a3b8', fontWeight: 800, fontSize: '12px' }}>{label}</p>
      <p style={{ margin: '6px 0 0', fontWeight: 900, color: '#e2e8f0', fontSize: '22px' }}>{value}</p>
    </div>
  );
}

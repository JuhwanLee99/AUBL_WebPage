import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import gsap from 'gsap';
import {
  getBatterRankings,
  getPitcherRankings,
  getRecordOverview,
  getSeasons,
  getTeamRecordStandings,
  type BatterRanking,
  type PitcherRanking,
  type RecordsOverview,
  type SeasonSummary,
  type TeamRecordStanding,
} from '../../shared/api/backendClient';

function toWinPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value <= 1 ? value * 100 : value;
}

export default function RecordPage() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [seasons, setSeasons] = useState<SeasonSummary[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(null);
  const [overview, setOverview] = useState<RecordsOverview | null>(null);
  const [teamStandings, setTeamStandings] = useState<TeamRecordStanding[]>([]);
  const [topBatters, setTopBatters] = useState<BatterRanking[]>([]);
  const [topPitchers, setTopPitchers] = useState<PitcherRanking[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [initializing, setInitializing] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    setInitializing(true);
    setError(null);

    getSeasons()
      .then((items) => {
        if (!isMounted) return;
        setSeasons(items);
        if (items.length > 0) {
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
    setLoading(true);
    setError(null);

    Promise.all([
      getRecordOverview(selectedSeasonId),
      getTeamRecordStandings(selectedSeasonId),
      getBatterRankings({ seasonId: selectedSeasonId, limit: 5, sort: 'ops' }),
      getPitcherRankings({ seasonId: selectedSeasonId, limit: 5, sort: 'era' }),
    ])
      .then(([overviewData, standingsData, battersData, pitchersData]) => {
        if (!isMounted) return;
        setOverview(overviewData);
        setTeamStandings(standingsData);
        setTopBatters(battersData);
        setTopPitchers(pitchersData);
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        setOverview(null);
        setTeamStandings([]);
        setTopBatters([]);
        setTopPitchers([]);
        setError(err instanceof Error ? err.message : '기록 데이터를 불러오지 못했습니다.');
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
      const nodes = sectionRef.current?.querySelectorAll('.record-section');
      if (!nodes) return;
      gsap.fromTo(
        nodes,
        { y: 24, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.75, stagger: 0.08, ease: 'power2.out' },
      );
    });

    return () => ctx.revert();
  }, [selectedSeasonId, loading]);

  const filteredStandings = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return teamStandings;
    return teamStandings.filter((row) => row.teamName.toLowerCase().includes(term));
  }, [searchTerm, teamStandings]);

  const selectedSeason = useMemo(
    () => seasons.find((season) => season.id === selectedSeasonId) ?? null,
    [seasons, selectedSeasonId],
  );

  const totalWins = useMemo(
    () => teamStandings.reduce((sum, row) => sum + row.wins, 0),
    [teamStandings],
  );

  return (
    <div style={{ display: 'grid', gap: '24px' }} ref={sectionRef}>
      <section
        className="record-section"
        style={{
          borderRadius: '22px',
          padding: '24px',
          background:
            'radial-gradient(circle at 15% 10%, rgba(59,130,246,0.16), transparent 34%), radial-gradient(circle at 85% 0%, rgba(234,179,8,0.16), transparent 28%), linear-gradient(135deg, #0f172a 0%, #111827 100%)',
          border: '1px solid rgba(148, 163, 184, 0.24)',
          boxShadow: '0 20px 50px rgba(0,0,0,0.28)',
          display: 'grid',
          gap: '14px',
        }}
      >
        <span
          style={{
            width: 'fit-content',
            padding: '6px 12px',
            borderRadius: '999px',
            border: '1px solid rgba(59,130,246,0.35)',
            background: 'rgba(59,130,246,0.14)',
            color: '#bfdbfe',
            fontWeight: 800,
            fontSize: '12px',
          }}
        >
          시즌 기록 센터
        </span>

        <h2 style={{ margin: 0, fontWeight: 900, fontSize: '30px' }}>
          {selectedSeason ? `${selectedSeason.year} 시즌 기록` : '시즌 기록'}
        </h2>

        <p style={{ margin: 0, color: '#cbd5e1', lineHeight: 1.6 }}>
          실시간 경기 데이터는 Firebase에서 처리하고, 경기 종료 후 확정 통계는 백엔드 DB 집계를 기준으로 제공합니다.
        </p>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ display: 'grid', gap: '6px', color: '#94a3b8', fontWeight: 700, fontSize: '12px' }}>
            SEASON
            <select
              value={selectedSeasonId ?? ''}
              disabled={seasons.length === 0}
              onChange={(e) => setSelectedSeasonId(Number(e.target.value))}
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

          <label style={{ display: 'grid', gap: '6px', color: '#94a3b8', fontWeight: 700, fontSize: '12px' }}>
            TEAM SEARCH
            <input
              type="text"
              value={searchTerm}
              placeholder="팀 이름 검색"
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                minWidth: '220px',
                borderRadius: '10px',
                border: '1px solid rgba(148,163,184,0.35)',
                background: '#0f172a',
                color: '#e2e8f0',
                padding: '10px 12px',
                fontWeight: 700,
              }}
            />
          </label>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <Link
              to="/records/batters"
              style={{
                padding: '10px 12px',
                borderRadius: '10px',
                border: '1px solid rgba(236,72,153,0.35)',
                background: 'rgba(236,72,153,0.12)',
                color: '#fbcfe8',
                fontWeight: 800,
              }}
            >
              타자 랭킹
            </Link>
            <Link
              to="/records/pitchers"
              style={{
                padding: '10px 12px',
                borderRadius: '10px',
                border: '1px solid rgba(59,130,246,0.35)',
                background: 'rgba(59,130,246,0.12)',
                color: '#bfdbfe',
                fontWeight: 800,
              }}
            >
              투수 랭킹
            </Link>
          </div>
        </div>
      </section>

      <section className="record-section" style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <Metric label="총 경기" value={`${overview?.totalGames ?? 0} G`} />
        <Metric label="참여 팀" value={`${overview?.totalTeams ?? teamStandings.length} 팀`} />
        <Metric label="등록 승수 합계" value={`${totalWins} 승`} />
        <Metric
          label="상위 팀 평균 승률"
          value={
            filteredStandings.length === 0
              ? '-'
              : `${(
                  filteredStandings.reduce((sum, row) => sum + toWinPct(row.winPct), 0) /
                  filteredStandings.length
                ).toFixed(1)}%`
          }
        />
      </section>

      {(initializing || loading) && (
        <section className="record-section" style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>
          기록 데이터를 불러오는 중입니다...
        </section>
      )}

      {error && (
        <section className="record-section" style={{ padding: '30px', textAlign: 'center', color: '#f87171' }}>
          오류: {error}
        </section>
      )}

      {!initializing && !loading && !error && (
        <section
          className="record-section"
          style={{
            borderRadius: '18px',
            border: '1px solid rgba(148, 163, 184, 0.2)',
            overflow: 'hidden',
            background: 'rgba(15, 23, 42, 0.55)',
          }}
        >
          <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(148, 163, 184, 0.2)', color: '#cbd5e1', fontWeight: 800 }}>
            팀 순위 요약
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '580px' }}>
              <thead>
                <tr style={{ color: '#94a3b8', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <th style={{ padding: '12px 10px', textAlign: 'left' }}>#</th>
                  <th style={{ padding: '12px 10px', textAlign: 'left' }}>팀</th>
                  <th style={{ padding: '12px 10px', textAlign: 'center' }}>경기</th>
                  <th style={{ padding: '12px 10px', textAlign: 'center' }}>승-무-패</th>
                  <th style={{ padding: '12px 10px', textAlign: 'center' }}>승률</th>
                </tr>
              </thead>
              <tbody>
                {filteredStandings.map((row, index) => {
                  const games = row.wins + row.losses + row.ties;
                  return (
                    <tr key={row.teamId} style={{ borderTop: '1px solid rgba(148, 163, 184, 0.12)' }}>
                      <td style={{ padding: '12px 10px', fontWeight: 900, color: '#cbd5e1' }}>{index + 1}</td>
                      <td style={{ padding: '12px 10px', fontWeight: 800 }}>{row.teamName}</td>
                      <td style={{ padding: '12px 10px', textAlign: 'center', color: '#cbd5e1' }}>{games}</td>
                      <td style={{ padding: '12px 10px', textAlign: 'center', color: '#cbd5e1' }}>
                        {row.wins}-{row.ties}-{row.losses}
                      </td>
                      <td style={{ padding: '12px 10px', textAlign: 'center', fontWeight: 800, color: '#22c55e' }}>
                        {toWinPct(row.winPct).toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filteredStandings.length === 0 && (
            <p style={{ margin: 0, padding: '20px', textAlign: 'center', color: '#94a3b8' }}>
              표시할 팀 기록이 없습니다.
            </p>
          )}
        </section>
      )}

      {!initializing && !loading && !error && (
        <section
          className="record-section"
          style={{
            display: 'grid',
            gap: '14px',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          }}
        >
          <RankingCard
            title="타자 TOP 5 (OPS)"
            accent="#ec4899"
            emptyMessage="타자 랭킹 데이터가 없습니다."
            rows={topBatters.map((row) => ({
              id: `batter-${row.playerId}`,
              rank: row.rank,
              name: row.playerName,
              team: row.teamName,
              value: `OPS ${row.ops.toFixed(3)} / AVG ${row.battingAverage.toFixed(3)}`,
              link: `/records/player/${row.playerId}`,
            }))}
          />
          <RankingCard
            title="투수 TOP 5 (ERA)"
            accent="#3b82f6"
            emptyMessage="투수 랭킹 데이터가 없습니다."
            rows={topPitchers.map((row) => ({
              id: `pitcher-${row.playerId}`,
              rank: row.rank,
              name: row.playerName,
              team: row.teamName,
              value: `ERA ${row.era.toFixed(2)} / WHIP ${row.whip.toFixed(2)}`,
              link: `/records/player/${row.playerId}`,
            }))}
          />
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

interface RankingCardRow {
  id: string;
  rank: number;
  name: string;
  team: string;
  value: string;
  link: string;
}

function RankingCard({
  title,
  accent,
  rows,
  emptyMessage,
}: {
  title: string;
  accent: string;
  rows: RankingCardRow[];
  emptyMessage: string;
}) {
  return (
    <div
      style={{
        borderRadius: '16px',
        border: '1px solid rgba(148, 163, 184, 0.2)',
        background: 'rgba(15, 23, 42, 0.55)',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '14px 16px', fontWeight: 900, color: accent, borderBottom: '1px solid rgba(148, 163, 184, 0.15)' }}>
        {title}
      </div>
      {rows.length === 0 && <p style={{ margin: 0, padding: '18px', color: '#94a3b8' }}>{emptyMessage}</p>}
      {rows.map((row) => (
        <div
          key={row.id}
          style={{
            display: 'grid',
            gridTemplateColumns: '50px 1fr',
            gap: '12px',
            padding: '12px 16px',
            borderTop: '1px solid rgba(148, 163, 184, 0.1)',
          }}
        >
          <div style={{ fontWeight: 900, color: '#cbd5e1' }}>{row.rank}</div>
          <div style={{ display: 'grid', gap: '4px' }}>
            <Link to={row.link} style={{ color: '#e2e8f0', fontWeight: 800, textDecoration: 'none' }}>
              {row.name}
            </Link>
            <span style={{ color: '#94a3b8', fontSize: '12px' }}>{row.team}</span>
            <span style={{ color: '#cbd5e1', fontSize: '13px' }}>{row.value}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

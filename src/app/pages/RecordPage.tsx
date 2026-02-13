import { useEffect, useMemo, useState } from 'react';
import { getRecordOverview, getSeasons, getTeamRecords } from '../../shared/api';
import type { RecordOverviewResponse, SeasonSummary, TeamRecordRow } from '../../shared/api';
import { TEAMS } from '../../shared/lib/mockData';

type DivisionFilter = 'ALL' | 'EUTTEUM' | 'BEOGEUM';

function normalizeDivision(value?: string): DivisionFilter {
  if (!value) return 'ALL';
  const normalized = value.trim().toUpperCase();
  if (normalized === 'EUTTEUM' || normalized === '으뜸') return 'EUTTEUM';
  if (normalized === 'BEOGEUM' || normalized === '버금') return 'BEOGEUM';
  return 'ALL';
}

function resolveTeamColor(teamName: string): string {
  const lowered = teamName.toLowerCase();
  const found = TEAMS.find((team) =>
    lowered.includes(team.name.toLowerCase()) ||
    lowered.includes(team.university.toLowerCase()) ||
    team.name.toLowerCase().includes(lowered)
  );
  return found?.logoColor ?? '#f97316';
}

export default function RecordPage() {
  const [seasons, setSeasons] = useState<SeasonSummary[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | undefined>();
  const [selectedDivision, setSelectedDivision] = useState<DivisionFilter>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [records, setRecords] = useState<TeamRecordRow[]>([]);
  const [overview, setOverview] = useState<RecordOverviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const fetchedSeasons = await getSeasons();
        if (!mounted) return;
        setSeasons(fetchedSeasons);
        if (fetchedSeasons.length > 0) {
          setSelectedSeasonId((prev) => prev ?? fetchedSeasons[0].id);
        }
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
        const [fetchedOverview, fetchedTeams] = await Promise.all([
          getRecordOverview(selectedSeasonId),
          getTeamRecords({ seasonId: selectedSeasonId }),
        ]);
        if (!mounted) return;
        setOverview(fetchedOverview);
        setRecords(fetchedTeams);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : '기록 데이터를 불러오지 못했습니다.');
        setRecords([]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [selectedSeasonId]);

  const filteredRecords = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return records.filter((record) => {
      const division = normalizeDivision(record.division);
      if (selectedDivision !== 'ALL' && division !== selectedDivision) return false;
      if (!term) return true;
      return (
        record.teamName.toLowerCase().includes(term) ||
        (record.teamCode ?? '').toLowerCase().includes(term)
      );
    });
  }, [records, searchTerm, selectedDivision]);

  const computedSummary = useMemo(() => {
    const totalGames = filteredRecords.reduce((sum, row) => sum + (row.games || 0), 0);
    const avgEra = filteredRecords.length
      ? filteredRecords.reduce((sum, row) => sum + (row.era ?? 0), 0) / filteredRecords.length
      : 0;
    const avgOps = filteredRecords.length
      ? filteredRecords.reduce((sum, row) => sum + (row.ops ?? 0), 0) / filteredRecords.length
      : 0;
    return {
      totalGames,
      avgEra,
      avgOps,
      totalRuns: filteredRecords.reduce((sum, row) => sum + (row.runsFor ?? 0), 0),
    };
  }, [filteredRecords]);

  const seasonOptions = seasons.map((season) => ({
    id: season.id,
    label: `${season.year} 시즌`,
  }));

  const activeSeason = seasons.find((season) => season.id === selectedSeasonId);

  const divisionOptions: { key: DivisionFilter; label: string }[] = [
    { key: 'ALL', label: '전체' },
    { key: 'EUTTEUM', label: '으뜸조' },
    { key: 'BEOGEUM', label: '버금조' },
  ];

  return (
    <div style={{ display: 'grid', gap: '22px' }}>
      <section
        style={{
          borderRadius: '22px',
          padding: '24px',
          background: 'linear-gradient(130deg, rgba(249,115,22,0.14), rgba(15,23,42,0.94) 62%)',
          border: '1px solid rgba(148,163,184,0.25)',
          boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
          display: 'grid',
          gap: '14px',
        }}
      >
        <h1 style={{ margin: 0, fontSize: '30px', fontWeight: 900 }}>리그 기록실</h1>
        <p style={{ margin: 0, color: '#cbd5e1' }}>
          백엔드 집계 데이터를 기준으로 시즌별 팀 기록을 제공합니다.
        </p>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <label style={{ display: 'grid', gap: '6px', color: '#cbd5e1', fontWeight: 700 }}>
            시즌
            <select
              value={selectedSeasonId ?? ''}
              onChange={(event) => setSelectedSeasonId(Number(event.target.value) || undefined)}
              style={{
                background: '#0f172a',
                color: '#e2e8f0',
                border: '1px solid rgba(148,163,184,0.35)',
                borderRadius: '10px',
                padding: '10px 12px',
                minWidth: '170px',
              }}
            >
              {seasonOptions.map((season) => (
                <option key={season.id} value={season.id}>
                  {season.label}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: 'grid', gap: '6px', color: '#cbd5e1', fontWeight: 700 }}>
            검색
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="팀명/팀코드"
              style={{
                background: '#0f172a',
                color: '#e2e8f0',
                border: '1px solid rgba(148,163,184,0.35)',
                borderRadius: '10px',
                padding: '10px 12px',
                minWidth: '220px',
              }}
            />
          </label>

          <div style={{ display: 'grid', gap: '6px', color: '#cbd5e1', fontWeight: 700 }}>
            <span>조 선택</span>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {divisionOptions.map((option) => {
                const active = selectedDivision === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setSelectedDivision(option.key)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '10px',
                      border: active ? '1px solid #f97316' : '1px solid rgba(148,163,184,0.35)',
                      background: active ? 'rgba(249,115,22,0.14)' : '#0f172a',
                      color: active ? '#fdba74' : '#cbd5e1',
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <Metric label="시즌" value={activeSeason ? String(activeSeason.year) : '-'} />
          <Metric label="총 경기" value={String(overview?.totalGames ?? computedSummary.totalGames)} />
          <Metric label="평균 ERA" value={(overview?.avgEra ?? computedSummary.avgEra).toFixed(2)} />
          <Metric label="평균 OPS" value={(overview?.avgOps ?? computedSummary.avgOps).toFixed(3)} />
          <Metric label="총 득점" value={String(overview?.totalRuns ?? computedSummary.totalRuns)} />
        </div>
      </section>

      <section
        style={{
          borderRadius: '16px',
          border: '1px solid rgba(148,163,184,0.25)',
          overflow: 'hidden',
          background: 'rgba(15,23,42,0.78)',
        }}
      >
        {loading && <p style={{ margin: 0, padding: '16px', color: '#cbd5e1' }}>기록 데이터를 불러오는 중...</p>}
        {error && <p style={{ margin: 0, padding: '16px', color: '#fca5a5' }}>{error}</p>}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.3fr 0.7fr 0.7fr 1fr 0.8fr 0.8fr 0.8fr',
            gap: '10px',
            padding: '14px 16px',
            fontWeight: 800,
            color: '#94a3b8',
            fontSize: '13px',
            background: 'rgba(255,255,255,0.03)',
          }}
        >
          <span>팀</span>
          <span style={{ textAlign: 'center' }}>경기</span>
          <span style={{ textAlign: 'center' }}>전적</span>
          <span style={{ textAlign: 'center' }}>득/실점</span>
          <span style={{ textAlign: 'center' }}>승률</span>
          <span style={{ textAlign: 'center' }}>ERA</span>
          <span style={{ textAlign: 'center' }}>OPS</span>
        </div>

        {filteredRecords.length === 0 && !loading ? (
          <p style={{ margin: 0, padding: '18px', color: '#94a3b8' }}>표시할 기록이 없습니다.</p>
        ) : (
          filteredRecords.map((record) => {
            const color = resolveTeamColor(record.teamName);
            return (
              <div
                key={`${record.teamId}-${record.teamName}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.3fr 0.7fr 0.7fr 1fr 0.8fr 0.8fr 0.8fr',
                  gap: '10px',
                  padding: '14px 16px',
                  borderTop: '1px solid rgba(148,163,184,0.14)',
                  alignItems: 'center',
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', fontWeight: 800 }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '999px', background: color }} />
                  {record.teamName}
                </span>
                <span style={{ textAlign: 'center' }}>{record.games ?? 0}</span>
                <span style={{ textAlign: 'center' }}>{record.wins}-{record.losses}-{record.draws}</span>
                <span style={{ textAlign: 'center' }}>{record.runsFor ?? 0} / {record.runsAgainst ?? 0}</span>
                <span style={{ textAlign: 'center' }}>{(record.winPct ?? 0).toFixed(3)}</span>
                <span style={{ textAlign: 'center' }}>{(record.era ?? 0).toFixed(2)}</span>
                <span style={{ textAlign: 'center' }}>{(record.ops ?? 0).toFixed(3)}</span>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        borderRadius: '10px',
        border: '1px solid rgba(148,163,184,0.25)',
        background: 'rgba(255,255,255,0.03)',
        padding: '10px 12px',
      }}
    >
      <p style={{ margin: 0, color: '#94a3b8', fontWeight: 800, fontSize: '12px' }}>{label}</p>
      <p style={{ margin: '5px 0 0', color: '#e2e8f0', fontWeight: 900 }}>{value}</p>
    </div>
  );
}

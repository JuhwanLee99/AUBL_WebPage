import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  getPlayerGameLogs,
  getPlayerSearchIndex,
  getPlayerStats,
  getSeasons,
  type BatterGameLog,
  type BatterStat,
  type PitcherGameLog,
  type PitcherStat,
  type PlayerLookup,
  type PlayerStatsSummary,
  type SeasonSummary,
} from '../../shared/api/backendClient';

function toValidPlayerId(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function extractPlayerId(value: string | null | undefined): number | null {
  const direct = toValidPlayerId(value);
  if (direct != null) return direct;
  if (!value) return null;
  const matches = value.match(/\d+/g);
  if (!matches || matches.length === 0) return null;
  return toValidPlayerId(matches[matches.length - 1]);
}

function normalizeKeyword(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase();
}

function normalizeTeamKey(value: string): string {
  return normalizeKeyword(value);
}

export default function PlayerDetailPage() {
  const { playerId: playerIdParam } = useParams<{ playerId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const queryPlayerId = toValidPlayerId(new URLSearchParams(location.search).get('id'));
  const currentPlayerId = extractPlayerId(playerIdParam) ?? queryPlayerId;

  const [seasons, setSeasons] = useState<SeasonSummary[]>([]);
  const [searchSeasonId, setSearchSeasonId] = useState<number | null>(null);
  const [viewSeasonId, setViewSeasonId] = useState<number | null>(null);
  const [searchCandidates, setSearchCandidates] = useState<PlayerLookup[]>([]);
  const [searchIndexLoading, setSearchIndexLoading] = useState<boolean>(false);
  const [searchIndexError, setSearchIndexError] = useState<string | null>(null);
  const [selectedTeamName, setSelectedTeamName] = useState<string>('ALL');
  const [searchInput, setSearchInput] = useState<string>('');
  const [selectedPlayerInput, setSelectedPlayerInput] = useState<string>(() =>
    currentPlayerId != null ? String(currentPlayerId) : '',
  );

  const [stats, setStats] = useState<PlayerStatsSummary | null>(null);
  const [selectedBatterSeasonId, setSelectedBatterSeasonId] = useState<number | null>(null);
  const [selectedPitcherSeasonId, setSelectedPitcherSeasonId] = useState<number | null>(null);
  const [batterGameLogs, setBatterGameLogs] = useState<BatterGameLog[]>([]);
  const [pitcherGameLogs, setPitcherGameLogs] = useState<PitcherGameLog[]>([]);
  const [gameLogsLoading, setGameLogsLoading] = useState<boolean>(false);
  const [gameLogsError, setGameLogsError] = useState<string | null>(null);
  const [gameIdInput, setGameIdInput] = useState<string>('');
  const [selectedGameId, setSelectedGameId] = useState<number | null>(null);
  const [visitedPlayers, setVisitedPlayers] = useState<
    { playerId: number; playerName: string; teamName: string; jerseyNumber: string }[]
  >([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    getSeasons()
      .then((items) => {
        if (!isMounted) return;
        setSeasons(items);
        if (items.length > 0) {
          setSearchSeasonId((prev) => prev ?? items[0].id);
        }
      })
      .catch(() => {
        if (!isMounted) return;
        setSeasons([]);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (searchSeasonId == null) return;
    let isMounted = true;
    setSearchIndexLoading(true);
    setSearchIndexError(null);
    getPlayerSearchIndex(searchSeasonId)
      .then((items) => {
        if (!isMounted) return;
        setSearchCandidates(items);
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        setSearchCandidates([]);
        setSearchIndexError(err instanceof Error ? err.message : '선수 검색 인덱스를 불러오지 못했습니다.');
      })
      .finally(() => {
        if (!isMounted) return;
        setSearchIndexLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [searchSeasonId]);

  useEffect(() => {
    if (currentPlayerId == null) return;
    let isMounted = true;
    setLoading(true);
    setError(null);
    getPlayerStats(currentPlayerId, viewSeasonId ?? undefined)
      .then((data) => {
        if (!isMounted) return;
        setStats(data);
        setSelectedPlayerInput(String(currentPlayerId));
        setSearchInput((prev) => prev || data.playerName || '');
        setVisitedPlayers((prev) => {
          const current = {
            playerId: currentPlayerId,
            playerName: data.playerName,
            teamName: data.teamName,
            jerseyNumber: data.jerseyNumber,
          };
          const merged = [current, ...prev.filter((item) => item.playerId !== current.playerId)];
          return merged.slice(0, 20);
        });
        const batterSeasonIds = [...new Set(data.batterStats.map((item) => item.seasonId))].sort((a, b) => b - a);
        const pitcherSeasonIds = [...new Set(data.pitcherStats.map((item) => item.seasonId))].sort((a, b) => b - a);
        setSelectedBatterSeasonId((prev) =>
          prev != null && batterSeasonIds.includes(prev) ? prev : (batterSeasonIds[0] ?? null),
        );
        setSelectedPitcherSeasonId((prev) =>
          prev != null && pitcherSeasonIds.includes(prev) ? prev : (pitcherSeasonIds[0] ?? batterSeasonIds[0] ?? null),
        );
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        setStats(null);
        setError(err instanceof Error ? err.message : '선수 정보를 불러오지 못했습니다.');
      })
      .finally(() => {
        if (!isMounted) return;
        setLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [currentPlayerId, viewSeasonId]);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      if (currentPlayerId == null) return;
      setGameLogsLoading(true);
      setGameLogsError(null);
      try {
        const payload = await getPlayerGameLogs(currentPlayerId, selectedGameId ?? undefined);
        if (!isMounted) return;
        const byGameDesc = <T extends { gameId: number }>(a: T, b: T) => b.gameId - a.gameId;
        setBatterGameLogs([...payload.batterLogs].sort(byGameDesc));
        setPitcherGameLogs([...payload.pitcherLogs].sort(byGameDesc));
      } catch (err: unknown) {
        if (!isMounted) return;
        setBatterGameLogs([]);
        setPitcherGameLogs([]);
        setGameLogsError(err instanceof Error ? err.message : '경기별 기록을 불러오지 못했습니다.');
      } finally {
        if (isMounted) {
          setGameLogsLoading(false);
        }
      }
    };

    load();

    return () => {
      isMounted = false;
    };
  }, [currentPlayerId, selectedGameId]);

  const seasonYearById = useMemo(() => new Map(seasons.map((season) => [season.id, season.year])), [seasons]);

  const teamOptions = useMemo(() => {
    const source = searchCandidates.map((item) => item.teamName).filter(Boolean);
    return [...new Set(source)].sort((a, b) => a.localeCompare(b, 'ko'));
  }, [searchCandidates]);

  useEffect(() => {
    if (selectedTeamName === 'ALL') return;
    if (teamOptions.includes(selectedTeamName)) return;
    setSelectedTeamName('ALL');
  }, [selectedTeamName, teamOptions]);

  const teamFilteredCandidates = useMemo(() => {
    if (selectedTeamName === 'ALL') return searchCandidates;
    const selectedKey = normalizeTeamKey(selectedTeamName);
    return searchCandidates.filter((item) => normalizeTeamKey(item.teamName) === selectedKey);
  }, [searchCandidates, selectedTeamName]);

  const nameFilteredCandidates = useMemo(() => {
    const term = normalizeKeyword(searchInput);
    if (!term) return teamFilteredCandidates;
    return teamFilteredCandidates.filter((item) => {
      const composite = normalizeKeyword(`${item.playerName} ${item.teamName} ${item.jerseyNumber}`);
      return composite.includes(term);
    });
  }, [searchInput, teamFilteredCandidates]);

  const currentLookup = useMemo(() => {
    if (currentPlayerId == null) return null;
    return (
      searchCandidates.find((item) => item.playerId === currentPlayerId) ??
      visitedPlayers.find((item) => item.playerId === currentPlayerId) ??
      null
    );
  }, [currentPlayerId, searchCandidates, visitedPlayers]);

  const displayPlayerName = useMemo(() => {
    if (stats?.playerName && stats.playerName !== `선수 #${stats.playerId}`) return stats.playerName;
    if (currentLookup?.playerName) return currentLookup.playerName;
    return stats?.playerName || '-';
  }, [currentLookup, stats]);

  const displayTeamName = useMemo(() => {
    if (stats?.teamName) return stats.teamName;
    if (currentLookup?.teamName) return currentLookup.teamName;
    return '-';
  }, [currentLookup, stats]);

  const displayJersey = useMemo(() => {
    if (stats?.jerseyNumber) return stats.jerseyNumber;
    if (currentLookup?.jerseyNumber) return currentLookup.jerseyNumber;
    return '-';
  }, [currentLookup, stats]);

  const selectedBatterStat = useMemo<BatterStat | null>(() => {
    if (!stats) return null;
    if (selectedBatterSeasonId == null) return stats.batterStats[0] ?? null;
    return stats.batterStats.find((item) => item.seasonId === selectedBatterSeasonId) ?? null;
  }, [selectedBatterSeasonId, stats]);

  const selectedPitcherStat = useMemo<PitcherStat | null>(() => {
    if (!stats) return null;
    if (selectedPitcherSeasonId == null) return stats.pitcherStats[0] ?? null;
    return stats.pitcherStats.find((item) => item.seasonId === selectedPitcherSeasonId) ?? null;
  }, [selectedPitcherSeasonId, stats]);

  const batterSeasonIds = useMemo(() => {
    if (!stats) return [];
    return [...new Set(stats.batterStats.map((item) => item.seasonId))].sort((a, b) => b - a);
  }, [stats]);

  const pitcherSeasonIds = useMemo(() => {
    if (!stats) return [];
    return [...new Set(stats.pitcherStats.map((item) => item.seasonId))].sort((a, b) => b - a);
  }, [stats]);

  const allSeasonIds = useMemo(() => {
    return [...new Set([...batterSeasonIds, ...pitcherSeasonIds])].sort((a, b) => b - a);
  }, [batterSeasonIds, pitcherSeasonIds]);

  const formatSeasonLabel = (seasonId: number | null): string => {
    if (seasonId == null) return '시즌 미선택';
    const year = seasonYearById.get(seasonId);
    return year != null ? `${year}년 (ID ${seasonId})` : `시즌 ID ${seasonId}`;
  };

  const selectedRecordYears = useMemo(() => {
    if (viewSeasonId != null) {
      const year = seasonYearById.get(viewSeasonId);
      return year != null ? `${year}년` : `ID ${viewSeasonId}`;
    }
    const ids = [selectedBatterSeasonId, selectedPitcherSeasonId].filter((id): id is number => id != null);
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) return '-';
    return uniqueIds
      .map((id) => {
        const year = seasonYearById.get(id);
        return year != null ? `${year}년` : `ID ${id}`;
      })
      .join(' / ');
  }, [selectedBatterSeasonId, selectedPitcherSeasonId, seasonYearById, viewSeasonId]);

  const gameLogSummary = useMemo(() => {
    const gameIds = new Set<number>();
    batterGameLogs.forEach((item) => gameIds.add(item.gameId));
    pitcherGameLogs.forEach((item) => gameIds.add(item.gameId));

    const batterAtBats = batterGameLogs.reduce((sum, item) => sum + item.atBats, 0);
    const batterHits = batterGameLogs.reduce((sum, item) => sum + item.hits, 0);
    const batterRuns = batterGameLogs.reduce((sum, item) => sum + item.runs, 0);
    const batterRbi = batterGameLogs.reduce((sum, item) => sum + item.rbi, 0);

    const pitcherIp = pitcherGameLogs.reduce((sum, item) => sum + item.inningsPitched, 0);
    const pitcherEr = pitcherGameLogs.reduce((sum, item) => sum + item.earnedRuns, 0);
    const pitcherK = pitcherGameLogs.reduce((sum, item) => sum + item.strikeouts, 0);
    const pitcherBb = pitcherGameLogs.reduce((sum, item) => sum + item.walks, 0);
    const pitcherEra = pitcherIp > 0 ? (pitcherEr * 9) / pitcherIp : 0;

    return {
      games: gameIds.size,
      batterAtBats,
      batterHits,
      batterRuns,
      batterRbi,
      batterAvg: batterAtBats > 0 ? batterHits / batterAtBats : 0,
      pitcherIp,
      pitcherEr,
      pitcherK,
      pitcherBb,
      pitcherEra,
    };
  }, [batterGameLogs, pitcherGameLogs]);

  const navigateToPlayer = (nextPlayerId: number) => {
    if (!Number.isInteger(nextPlayerId) || nextPlayerId <= 0) return;
    setError(null);
    setGameIdInput('');
    setSelectedGameId(null);
    navigate(`/records/player/${nextPlayerId}`);
  };

  const handleNameSearch = () => {
    const term = normalizeKeyword(searchInput);
    if (!term) {
      setError('검색어를 입력해 주세요.');
      return;
    }
    const exactName = nameFilteredCandidates.filter((item) => normalizeKeyword(item.playerName) === term);
    if (exactName.length === 1) {
      navigateToPlayer(exactName[0].playerId);
      return;
    }
    const exactComposite = nameFilteredCandidates.filter((item) => {
      const composite = normalizeKeyword(`${item.playerName} ${item.teamName} ${item.jerseyNumber}`);
      return composite === term;
    });
    if (exactComposite.length === 1) {
      navigateToPlayer(exactComposite[0].playerId);
      return;
    }
    if (nameFilteredCandidates.length === 1) {
      navigateToPlayer(nameFilteredCandidates[0].playerId);
      return;
    }
    if (nameFilteredCandidates.length > 1) {
      setError('검색 결과가 여러 명입니다. 팀/등번호를 함께 입력하거나 팀을 먼저 선택해 주세요.');
      return;
    }
    setError('입력한 이름으로 선수를 찾지 못했습니다.');
  };

  const handleIdSearch = () => {
    const nextId = toValidPlayerId(selectedPlayerInput);
    if (nextId == null) {
      setError('선수 ID는 1 이상의 정수여야 합니다.');
      return;
    }
    navigateToPlayer(nextId);
  };

  const handleGameIdApply = () => {
    if (!gameIdInput.trim()) {
      setSelectedGameId(null);
      return;
    }
    const parsed = Number(gameIdInput);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      setGameLogsError('Game ID는 1 이상의 정수여야 합니다.');
      return;
    }
    setSelectedGameId(parsed);
  };

  const hasSelectedPlayer = currentPlayerId != null;

  return (
    <div
      style={{
        padding: '20px',
        borderRadius: '18px',
        background: 'linear-gradient(135deg, #0f172a 0%, #0b1220 100%)',
        border: '1px solid rgba(148, 163, 184, 0.25)',
        color: '#e2e8f0',
        boxShadow: '0 24px 60px rgba(0,0,0,0.36)',
        display: 'grid',
        gap: '16px',
      }}
    >
      <button
        onClick={() => navigate(-1)}
        style={{
          background: 'none',
          border: 'none',
          color: '#94a3b8',
          fontWeight: 700,
          cursor: 'pointer',
          textDecoration: 'underline',
          padding: 0,
          textAlign: 'left',
          width: 'fit-content',
        }}
      >
        ← 돌아가기
      </button>

      <section
        style={{
          padding: '14px',
          borderRadius: '14px',
          border: '1px solid rgba(148, 163, 184, 0.22)',
          background: 'rgba(255,255,255,0.02)',
          display: 'grid',
          gap: '10px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'end', gap: '10px', flexWrap: 'wrap' }}>
          <label style={{ display: 'grid', gap: '6px', color: '#94a3b8', fontWeight: 800, fontSize: '12px' }}>
            검색 시즌(년도)
            <select
              value={searchSeasonId ?? ''}
              onChange={(e) => setSearchSeasonId(Number(e.target.value))}
              disabled={seasons.length === 0}
              style={inputStyle}
            >
              {seasons.map((season) => (
                <option key={season.id} value={season.id}>
                  {season.year}년 시즌
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: 'grid', gap: '6px', color: '#94a3b8', fontWeight: 800, fontSize: '12px' }}>
            팀 선택
            <select
              value={selectedTeamName}
              onChange={(e) => setSelectedTeamName(e.target.value)}
              style={inputStyle}
            >
              <option value="ALL">전체 팀</option>
              {teamOptions.map((teamName) => (
                <option key={teamName} value={teamName}>
                  {teamName}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: 'grid', gap: '6px', color: '#94a3b8', fontWeight: 800, fontSize: '12px', minWidth: '260px', flex: 1 }}>
            선수 이름 검색
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                handleNameSearch();
              }}
              placeholder="예: 강대건 / 강대건 연세대학교 #27"
              style={inputStyle}
            />
          </label>
          <button type="button" onClick={handleNameSearch} style={primaryButtonStyle}>
            이름으로 찾기
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'end', gap: '10px', flexWrap: 'wrap' }}>
          <label style={{ display: 'grid', gap: '6px', color: '#94a3b8', fontWeight: 800, fontSize: '12px', minWidth: '210px' }}>
            팀 선수 목록
            <select
              value=""
              onChange={(e) => navigateToPlayer(Number(e.target.value))}
              style={inputStyle}
              disabled={teamFilteredCandidates.length === 0}
            >
              <option value="" disabled>
                {teamFilteredCandidates.length > 0 ? '선수 선택' : '선수 목록 없음'}
              </option>
              {teamFilteredCandidates.map((item) => (
                <option key={item.playerId} value={item.playerId}>
                  {item.playerName} {item.jerseyNumber ? `#${item.jerseyNumber}` : ''} {item.teamName ? `· ${item.teamName}` : ''}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: 'grid', gap: '6px', color: '#94a3b8', fontWeight: 800, fontSize: '12px', minWidth: '140px' }}>
            선수 ID
            <input
              value={selectedPlayerInput}
              onChange={(e) => setSelectedPlayerInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                handleIdSearch();
              }}
              inputMode="numeric"
              placeholder="예: 42"
              style={inputStyle}
            />
          </label>
          <button type="button" onClick={handleIdSearch} style={secondaryButtonStyle}>
            ID로 찾기
          </button>
        </div>

        {searchIndexLoading && <span style={{ color: '#94a3b8', fontSize: '12px' }}>선수 검색 인덱스를 불러오는 중...</span>}
        {!searchIndexLoading && searchIndexError && <span style={{ color: '#fca5a5', fontSize: '12px' }}>{searchIndexError}</span>}

        {nameFilteredCandidates.length > 0 && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {nameFilteredCandidates.slice(0, 12).map((item) => (
              <button
                key={`${item.playerId}-${item.seasonId}`}
                type="button"
                onClick={() => navigateToPlayer(item.playerId)}
                style={{
                  padding: '7px 10px',
                  borderRadius: '999px',
                  border: '1px solid rgba(148,163,184,0.3)',
                  background: 'rgba(15,23,42,0.65)',
                  color: '#cbd5e1',
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: '12px',
                }}
              >
                {item.playerName}
                {item.teamName ? ` · ${item.teamName}` : ''}
                {item.jerseyNumber ? ` · #${item.jerseyNumber}` : ''}
              </button>
            ))}
          </div>
        )}
      </section>

      {loading && <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>데이터를 불러오는 중...</div>}
      {!loading && !hasSelectedPlayer && (
        <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
          팀/이름/ID로 조회할 선수를 먼저 선택해 주세요.
        </div>
      )}
      {!loading && hasSelectedPlayer && error && <div style={{ padding: '40px', textAlign: 'center', color: '#f87171' }}>오류: {error}</div>}

      {!loading && hasSelectedPlayer && !error && stats && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 900 }}>{displayPlayerName}</h1>
            <span style={{ color: '#94a3b8', fontWeight: 700 }}>{displayTeamName}</span>
            <span style={{ color: '#cbd5e1', fontWeight: 800 }}>#{displayJersey}</span>
          </div>

          <section
            style={{
              padding: '14px',
              borderRadius: '14px',
              border: '1px solid rgba(148, 163, 184, 0.22)',
              background: 'rgba(255,255,255,0.02)',
              display: 'grid',
              gap: '10px',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            }}
          >
            <InfoItem label="이름" value={displayPlayerName} />
            <InfoItem label="등번호" value={displayJersey} />
            <InfoItem label="소속팀" value={displayTeamName} />
            <InfoItem label="기록년도" value={selectedRecordYears} />
          </section>

          <div style={{ display: 'flex', alignItems: 'end', gap: '12px', flexWrap: 'wrap' }}>
            <label style={{ display: 'grid', gap: '6px', fontWeight: 800, color: '#94a3b8', fontSize: '12px' }}>
              조회 년도(시즌)
              <select
                value={viewSeasonId ?? ''}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setViewSeasonId(next > 0 ? next : null);
                }}
                style={inputStyle}
              >
                <option value="">전체 시즌</option>
                {seasons.map((season) => (
                  <option key={season.id} value={season.id}>
                    {season.year}년 시즌
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div style={{ display: 'flex', alignItems: 'end', gap: '12px', flexWrap: 'wrap' }}>
            {batterSeasonIds.length > 0 && (
              <label style={{ display: 'grid', gap: '6px', fontWeight: 800, color: '#94a3b8', fontSize: '12px' }}>
                타자 시즌 선택
                <select
                  value={selectedBatterSeasonId ?? ''}
                  onChange={(e) => setSelectedBatterSeasonId(Number(e.target.value))}
                  style={inputStyle}
                >
                  {batterSeasonIds.map((id) => (
                    <option key={id} value={id}>
                      {formatSeasonLabel(id)}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label style={{ display: 'grid', gap: '6px', fontWeight: 800, color: '#94a3b8', fontSize: '12px' }}>
              투수 시즌 선택
              <select
                value={selectedPitcherSeasonId ?? ''}
                onChange={(e) => setSelectedPitcherSeasonId(Number(e.target.value))}
                disabled={allSeasonIds.length === 0}
                style={{ ...inputStyle, opacity: allSeasonIds.length === 0 ? 0.6 : 1 }}
              >
                {allSeasonIds.length === 0 && <option value="">선택 가능한 시즌 없음</option>}
                {allSeasonIds.map((id) => (
                  <option key={id} value={id}>
                    {formatSeasonLabel(id)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {selectedBatterStat && (
            <section style={recordCardStyle}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#f472b6' }}>
                타자 기록 - {formatSeasonLabel(selectedBatterSeasonId)}
              </h2>
              <div style={recordGridStyle}>
                {([
                  ['AVG', selectedBatterStat.battingAverage.toFixed(3)],
                  ['OBP', selectedBatterStat.onBasePct.toFixed(3)],
                  ['SLG', selectedBatterStat.sluggingPct.toFixed(3)],
                  ['OPS', selectedBatterStat.ops.toFixed(3)],
                  ['HR', selectedBatterStat.homeRuns],
                  ['RBI', selectedBatterStat.runsBattedIn],
                  ['H', selectedBatterStat.hits],
                  ['SB', selectedBatterStat.stolenBases],
                  ['BB', selectedBatterStat.walks],
                  ['SO', selectedBatterStat.strikeouts],
                  ['G', selectedBatterStat.gamesPlayed],
                  ['AB', selectedBatterStat.atBats],
                ] as [string, string | number][]).map(([label, value]) => (
                  <StatItem key={label} label={label} value={value} />
                ))}
              </div>
            </section>
          )}

          {selectedPitcherStat && (
            <section style={recordCardStyle}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#60a5fa' }}>
                투수 기록 - {formatSeasonLabel(selectedPitcherSeasonId)}
              </h2>
              <div style={recordGridStyle}>
                {([
                  ['ERA', selectedPitcherStat.era.toFixed(2)],
                  ['IP', selectedPitcherStat.inningsPitched.toFixed(1)],
                  ['WHIP', selectedPitcherStat.whip.toFixed(2)],
                  ['K', selectedPitcherStat.strikeouts],
                  ['BB', selectedPitcherStat.walksAllowed],
                  ['W', selectedPitcherStat.wins],
                  ['L', selectedPitcherStat.losses],
                  ['SV', selectedPitcherStat.saves],
                  ['HLD', selectedPitcherStat.holds],
                  ['K/9', selectedPitcherStat.kPer9.toFixed(2)],
                  ['BB/9', selectedPitcherStat.bbPer9.toFixed(2)],
                  ['G', selectedPitcherStat.gamesPlayed],
                ] as [string, string | number][]).map(([label, value]) => (
                  <StatItem key={label} label={label} value={value} />
                ))}
              </div>
            </section>
          )}

          <section style={recordCardStyle}>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#cbd5e1' }}>
              경기별 기록 (Player Logs)
            </h2>

            <div style={{ display: 'flex', alignItems: 'end', gap: '10px', flexWrap: 'wrap' }}>
              <label style={{ display: 'grid', gap: '6px', color: '#94a3b8', fontWeight: 800, fontSize: '12px', minWidth: '160px' }}>
                Game ID 필터(선택)
                <input
                  value={gameIdInput}
                  onChange={(e) => setGameIdInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return;
                    handleGameIdApply();
                  }}
                  inputMode="numeric"
                  placeholder="비우면 전체"
                  style={inputStyle}
                />
              </label>
              <button type="button" onClick={handleGameIdApply} style={secondaryButtonStyle}>
                적용
              </button>
              <button
                type="button"
                onClick={() => {
                  setGameIdInput('');
                  setSelectedGameId(null);
                }}
                style={secondaryButtonStyle}
              >
                전체 보기
              </button>
              <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>
                현재 필터: {selectedGameId != null ? `Game #${selectedGameId}` : '전체'}
              </span>
            </div>

            {gameLogsLoading && <div style={{ color: '#94a3b8', fontSize: '13px' }}>경기별 기록을 불러오는 중...</div>}
            {!gameLogsLoading && gameLogsError && (
              <div style={{ color: '#fca5a5', fontSize: '13px' }}>{gameLogsError}</div>
            )}

            {!gameLogsLoading && !gameLogsError && (
              <>
                <div style={recordGridStyle}>
                  <StatItem label="경기 수" value={gameLogSummary.games} />
                  <StatItem label="타자 AVG" value={gameLogSummary.batterAvg.toFixed(3)} />
                  <StatItem label="타자 H" value={gameLogSummary.batterHits} />
                  <StatItem label="타자 RBI" value={gameLogSummary.batterRbi} />
                  <StatItem label="투수 ERA" value={gameLogSummary.pitcherEra.toFixed(2)} />
                  <StatItem label="투수 IP" value={gameLogSummary.pitcherIp.toFixed(1)} />
                  <StatItem label="투수 K" value={gameLogSummary.pitcherK} />
                  <StatItem label="투수 BB" value={gameLogSummary.pitcherBb} />
                </div>

                <div style={logSectionStyle}>
                  <h3 style={{ margin: 0, fontSize: '15px', color: '#f472b6', fontWeight: 800 }}>
                    타자 경기 로그 ({batterGameLogs.length})
                  </h3>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={logTableStyle}>
                      <thead>
                        <tr>
                          <th style={logThStyle}>GAME</th>
                          <th style={logThStyle}>SIDE</th>
                          <th style={logThStyle}>POS</th>
                          <th style={logThStyle}>NO</th>
                          <th style={logThStyle}>AB</th>
                          <th style={logThStyle}>H</th>
                          <th style={logThStyle}>R</th>
                          <th style={logThStyle}>RBI</th>
                          <th style={logThStyle}>BB</th>
                          <th style={logThStyle}>SO</th>
                        </tr>
                      </thead>
                      <tbody>
                        {batterGameLogs.map((row, index) => (
                          <tr key={`${row.batterGlId}-${row.gameId}`} style={logTrStyle(index)}>
                            <td style={logTdStyle}>{row.gameId}</td>
                            <td style={logTdStyle}>{row.teamSide || '-'}</td>
                            <td style={logTdStyle}>{row.playerPosition || '-'}</td>
                            <td style={logTdStyle}>{row.jerseyNumber || '-'}</td>
                            <td style={logTdStyle}>{row.atBats}</td>
                            <td style={logTdStyle}>{row.hits}</td>
                            <td style={logTdStyle}>{row.runs}</td>
                            <td style={logTdStyle}>{row.rbi}</td>
                            <td style={logTdStyle}>{row.walks}</td>
                            <td style={logTdStyle}>{row.strikeouts}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {batterGameLogs.length === 0 && (
                      <div style={logEmptyStyle}>타자 경기 로그가 없습니다.</div>
                    )}
                  </div>
                </div>

                <div style={logSectionStyle}>
                  <h3 style={{ margin: 0, fontSize: '15px', color: '#60a5fa', fontWeight: 800 }}>
                    투수 경기 로그 ({pitcherGameLogs.length})
                  </h3>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={logTableStyle}>
                      <thead>
                        <tr>
                          <th style={logThStyle}>GAME</th>
                          <th style={logThStyle}>SIDE</th>
                          <th style={logThStyle}>POS</th>
                          <th style={logThStyle}>NO</th>
                          <th style={logThStyle}>IP</th>
                          <th style={logThStyle}>H</th>
                          <th style={logThStyle}>R</th>
                          <th style={logThStyle}>ER</th>
                          <th style={logThStyle}>BB</th>
                          <th style={logThStyle}>SO</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pitcherGameLogs.map((row, index) => (
                          <tr key={`${row.pitcherGlId}-${row.gameId}`} style={logTrStyle(index)}>
                            <td style={logTdStyle}>{row.gameId}</td>
                            <td style={logTdStyle}>{row.teamSide || '-'}</td>
                            <td style={logTdStyle}>{row.playerPosition || '-'}</td>
                            <td style={logTdStyle}>{row.jerseyNumber || '-'}</td>
                            <td style={logTdStyle}>{row.inningsPitched.toFixed(1)}</td>
                            <td style={logTdStyle}>{row.hitsAllowed}</td>
                            <td style={logTdStyle}>{row.runsAllowed}</td>
                            <td style={logTdStyle}>{row.earnedRuns}</td>
                            <td style={logTdStyle}>{row.walks}</td>
                            <td style={logTdStyle}>{row.strikeouts}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {pitcherGameLogs.length === 0 && (
                      <div style={logEmptyStyle}>투수 경기 로그가 없습니다.</div>
                    )}
                  </div>
                </div>
              </>
            )}
          </section>

          {!selectedBatterStat && !selectedPitcherStat && (
            <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>
              해당 선수의 시즌 기록이 없습니다.
            </div>
          )}
        </>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: '#0f172a',
  color: '#e2e8f0',
  padding: '11px 14px',
  borderRadius: '12px',
  border: '1px solid rgba(148,163,184,0.35)',
  fontWeight: 800,
};

const primaryButtonStyle: React.CSSProperties = {
  background: 'rgba(37,99,235,0.18)',
  color: '#dbeafe',
  border: '1px solid rgba(96,165,250,0.45)',
  borderRadius: '12px',
  padding: '11px 14px',
  fontWeight: 800,
  cursor: 'pointer',
};

const secondaryButtonStyle: React.CSSProperties = {
  background: 'rgba(15,23,42,0.82)',
  color: '#cbd5e1',
  border: '1px solid rgba(148,163,184,0.35)',
  borderRadius: '12px',
  padding: '11px 14px',
  fontWeight: 800,
  cursor: 'pointer',
};

const recordCardStyle: React.CSSProperties = {
  padding: '18px',
  borderRadius: '14px',
  border: '1px solid rgba(148, 163, 184, 0.25)',
  background: 'rgba(255,255,255,0.02)',
  display: 'grid',
  gap: '14px',
};

const recordGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
  gap: '12px',
};

const logSectionStyle: React.CSSProperties = {
  display: 'grid',
  gap: '8px',
};

const logTableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  minWidth: '760px',
};

const logThStyle: React.CSSProperties = {
  textAlign: 'center',
  fontSize: '12px',
  fontWeight: 800,
  color: '#94a3b8',
  borderBottom: '1px solid rgba(148,163,184,0.3)',
  padding: '8px',
  whiteSpace: 'nowrap',
};

const logTdStyle: React.CSSProperties = {
  textAlign: 'center',
  padding: '8px',
  color: '#cbd5e1',
  borderBottom: '1px solid rgba(148,163,184,0.14)',
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
};

const logTrStyle = (index: number): React.CSSProperties => ({
  background: index % 2 === 0 ? 'transparent' : 'rgba(148,163,184,0.04)',
});

const logEmptyStyle: React.CSSProperties = {
  padding: '12px',
  color: '#94a3b8',
  textAlign: 'center',
  fontSize: '12px',
};

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'grid', gap: '4px' }}>
      <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 800 }}>{label}</span>
      <span style={{ color: '#e2e8f0', fontWeight: 800, fontSize: '16px' }}>{value || '-'}</span>
    </div>
  );
}

function StatItem({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ display: 'grid', gap: '4px', textAlign: 'center' }}>
      <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 800 }}>{label}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 800, fontSize: '16px' }}>{value}</span>
    </div>
  );
}

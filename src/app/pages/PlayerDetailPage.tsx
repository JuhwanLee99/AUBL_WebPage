import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getPlayerStats,
  type BatterStat,
  type PitcherStat,
  type PlayerStatsSummary,
} from '../../shared/api/backendClient';

export default function PlayerDetailPage() {
  const { playerId } = useParams<{ playerId: string }>();
  const navigate = useNavigate();
  const [stats, setStats] = useState<PlayerStatsSummary | null>(null);
  const [selectedBatterSeasonId, setSelectedBatterSeasonId] = useState<number | null>(null);
  const [selectedPitcherSeasonId, setSelectedPitcherSeasonId] = useState<number | null>(null);
  const [selectedPlayerInput, setSelectedPlayerInput] = useState<string>('');
  const [visitedPlayers, setVisitedPlayers] = useState<{ playerId: number; playerName: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedPlayerInput(playerId ?? '');
  }, [playerId]);

  const navigateToPlayer = (nextPlayerId: number) => {
    if (!Number.isInteger(nextPlayerId) || nextPlayerId <= 0) return;
    navigate(`/records/player/${nextPlayerId}`);
  };

  useEffect(() => {
    if (!playerId) {
      setError('유효하지 않은 선수 ID입니다.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    getPlayerStats(Number(playerId))
      .then((data) => {
        setStats(data);
        setVisitedPlayers((prev) => {
          const currentPlayer = { playerId: Number(playerId), playerName: data.playerName };
          const merged = [currentPlayer, ...prev.filter((item) => item.playerId !== currentPlayer.playerId)];
          return merged.slice(0, 15);
        });
        const batterSeasonIds = [...new Set(data.batterStats.map((item) => item.seasonId))].sort((a, b) => b - a);
        const pitcherSeasonIds = [...new Set(data.pitcherStats.map((item) => item.seasonId))].sort((a, b) => b - a);
        setSelectedBatterSeasonId(batterSeasonIds[0] ?? null);
        setSelectedPitcherSeasonId(pitcherSeasonIds[0] ?? batterSeasonIds[0] ?? null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [playerId]);

  const selectedBatterStat = useMemo<BatterStat | null>(() => {
    if (!stats) return null;
    if (selectedBatterSeasonId == null) return stats.batterStats[0] ?? null;
    return stats.batterStats.find((item) => item.seasonId === selectedBatterSeasonId) ?? null;
  }, [stats, selectedBatterSeasonId]);

  const selectedPitcherStat = useMemo<PitcherStat | null>(() => {
    if (!stats) return null;
    if (selectedPitcherSeasonId == null) return stats.pitcherStats[0] ?? null;
    return stats.pitcherStats.find((item) => item.seasonId === selectedPitcherSeasonId) ?? null;
  }, [stats, selectedPitcherSeasonId]);

  const batterSeasonIds = useMemo<number[]>(() => {
    if (!stats) return [];
    return [...new Set(stats.batterStats.map((item) => item.seasonId))].sort((a, b) => b - a);
  }, [stats]);

  const pitcherSeasonIds = useMemo<number[]>(() => {
    if (!stats) return [];
    return [...new Set(stats.pitcherStats.map((item) => item.seasonId))].sort((a, b) => b - a);
  }, [stats]);

  const allSeasonIds = useMemo<number[]>(() => {
    return [...new Set([...batterSeasonIds, ...pitcherSeasonIds])].sort((a, b) => b - a);
  }, [batterSeasonIds, pitcherSeasonIds]);

  const batterSeasonLabel =
    selectedBatterSeasonId == null ? '시즌 미선택' : `시즌 ID ${selectedBatterSeasonId}`;
  const pitcherSeasonLabel =
    selectedPitcherSeasonId == null ? '시즌 미선택' : `시즌 ID ${selectedPitcherSeasonId}`;

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

      {loading && (
        <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
          데이터를 불러오는 중...
        </div>
      )}

      {!loading && error && (
        <div style={{ padding: '40px', textAlign: 'center', color: '#f87171' }}>오류: {error}</div>
      )}

      {!loading && !error && stats && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 900 }}>{stats.playerName}</h1>
            {stats.teamName && <span style={{ color: '#94a3b8', fontWeight: 700 }}>{stats.teamName}</span>}
          </div>

          <div style={{ display: 'flex', alignItems: 'end', gap: '12px', flexWrap: 'wrap' }}>
            <label
              style={{
                display: 'grid',
                gap: '6px',
                fontWeight: 800,
                color: '#94a3b8',
                fontSize: '12px',
                width: 'fit-content',
              }}
            >
              선수 ID 선택
              <input
                value={selectedPlayerInput}
                onChange={(e) => setSelectedPlayerInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  const nextPlayerId = Number(selectedPlayerInput);
                  navigateToPlayer(nextPlayerId);
                }}
                inputMode="numeric"
                placeholder="예: 1"
                style={{
                  background: '#0f172a',
                  color: '#e2e8f0',
                  padding: '11px 14px',
                  borderRadius: '12px',
                  border: '1px solid rgba(148,163,184,0.35)',
                  fontWeight: 800,
                  minWidth: '130px',
                }}
              />
            </label>
            <button
              type="button"
              onClick={() => navigateToPlayer(Number(selectedPlayerInput))}
              style={{
                background: 'rgba(37,99,235,0.18)',
                color: '#dbeafe',
                border: '1px solid rgba(96,165,250,0.45)',
                borderRadius: '12px',
                padding: '11px 14px',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              선수 이동
            </button>
            {visitedPlayers.length > 0 && (
              <label
                style={{
                  display: 'grid',
                  gap: '6px',
                  fontWeight: 800,
                  color: '#94a3b8',
                  fontSize: '12px',
                  width: 'fit-content',
                }}
              >
                최근 조회 선수
                <select
                  value={playerId ?? ''}
                  onChange={(e) => navigateToPlayer(Number(e.target.value))}
                  style={{
                    background: '#0f172a',
                    color: '#e2e8f0',
                    padding: '11px 14px',
                    borderRadius: '12px',
                    border: '1px solid rgba(148,163,184,0.35)',
                    fontWeight: 800,
                  }}
                >
                  {visitedPlayers.map((item) => (
                    <option key={item.playerId} value={item.playerId}>
                      #{item.playerId} {item.playerName}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'end', gap: '12px', flexWrap: 'wrap' }}>
            {batterSeasonIds.length > 0 && (
              <label
                style={{
                  display: 'grid',
                  gap: '6px',
                  fontWeight: 800,
                  color: '#94a3b8',
                  fontSize: '12px',
                  width: 'fit-content',
                }}
              >
                타자 시즌 선택
                <select
                  value={selectedBatterSeasonId ?? ''}
                  onChange={(e) => setSelectedBatterSeasonId(Number(e.target.value))}
                  style={{
                    background: '#0f172a',
                    color: '#e2e8f0',
                    padding: '11px 14px',
                    borderRadius: '12px',
                    border: '1px solid rgba(148,163,184,0.35)',
                    fontWeight: 800,
                  }}
                >
                  {batterSeasonIds.map((id) => (
                    <option key={id} value={id}>
                      시즌 ID {id}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label
              style={{
                display: 'grid',
                gap: '6px',
                fontWeight: 800,
                color: '#94a3b8',
                fontSize: '12px',
                width: 'fit-content',
              }}
            >
              투수 시즌 선택
              <select
                value={selectedPitcherSeasonId ?? ''}
                onChange={(e) => setSelectedPitcherSeasonId(Number(e.target.value))}
                disabled={allSeasonIds.length === 0}
                style={{
                  background: '#0f172a',
                  color: '#e2e8f0',
                  padding: '11px 14px',
                  borderRadius: '12px',
                  border: '1px solid rgba(148,163,184,0.35)',
                  fontWeight: 800,
                  opacity: allSeasonIds.length === 0 ? 0.6 : 1,
                }}
              >
                {allSeasonIds.length === 0 && <option value="">선택 가능한 시즌 없음</option>}
                {allSeasonIds.map((id) => (
                  <option key={id} value={id}>
                    시즌 ID {id}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {selectedBatterStat && (
            <section
              style={{
                padding: '18px',
                borderRadius: '14px',
                border: '1px solid rgba(148, 163, 184, 0.25)',
                background: 'rgba(255,255,255,0.02)',
                display: 'grid',
                gap: '14px',
              }}
            >
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#f472b6' }}>
                타자 기록 - {batterSeasonLabel}
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '12px' }}>
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
                  <div key={label} style={{ display: 'grid', gap: '4px', textAlign: 'center' }}>
                    <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 800 }}>{label}</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 800, fontSize: '16px' }}>{value}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {selectedPitcherStat && (
            <section
              style={{
                padding: '18px',
                borderRadius: '14px',
                border: '1px solid rgba(148, 163, 184, 0.25)',
                background: 'rgba(255,255,255,0.02)',
                display: 'grid',
                gap: '14px',
              }}
            >
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#60a5fa' }}>
                투수 기록 - {pitcherSeasonLabel}
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '12px' }}>
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
                  <div key={label} style={{ display: 'grid', gap: '4px', textAlign: 'center' }}>
                    <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 800 }}>{label}</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 800, fontSize: '16px' }}>{value}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

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

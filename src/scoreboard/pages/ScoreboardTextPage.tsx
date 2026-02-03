import { useMemo, useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ScoreboardFrame from '../components/ScoreboardFrame';
import { useDemoStore, buildGameRecord } from '../../shared/state/demoStore';
import type { PlayEvent, ErrorDetails, RunnerAdvanceOutcome, BattedBallDetails } from '../../shared/state/demoStore';
import StatsTable from '../../shared/components/StatsTable';
import RemovedPlayersPanel from '../../shared/components/RemovedPlayersPanel';
import { GameTimerDisplay } from '../../shared/components/GameTimerDisplay';
import type { BatterStatLine, PitcherStatLine } from '../../shared/types/scoreStats';
import type { MatchSchedule } from '../../shared/state/demoStore';
import './ScoreboardTextPage.css';

type Half = 'top' | 'bottom';

type BatterLine = {
  pa: number;
  ab: number;
  hits: number;
  hr: number;
  doubles: number;
  triples: number;
  bb: number;
  hbp: number;
  so: number;
  sac: number;
};

type PitcherLine = {
  bf: number;
  outs: number;
  hits: number;
  hr: number;
  bb: number;
  hbp: number;
  so: number;
  pitches: number;
  strikes: number;
  balls: number;
};

type EventDetail = { label: string; value: string };

type DisplayItem =
  | { type: 'marker'; text: string; color: string; key: string; inning: number; half: Half }
  | {
      type: 'batter';
      text: string;
      key: string;
      inning: number;
      half: Half;
      order: number | null;
      jersey?: string;
      status?: 'out' | '대수비' | '대타' | '대주자';
      isSubstitute?: boolean;
    }
  | { type: 'log'; text: string; key: string; chip: string; inning: number; half: Half; details?: EventDetail[] };

type JerseyMap = { home: Map<string, { number: string; pos: string }>; away: Map<string, { number: string; pos: string }> };

// [추가] ScorekeeperPage와 동일한 고유 이름 생성 함수
const getUniqueName = (name: string, number: string | number | undefined | null) => {
  if (!name) return '';
  if (!number) return name;
  const suffix = `(${number})`;
  if (name.endsWith(suffix)) return name;
  return `${name}${suffix}`;
};

type PlayerNameParts = { raw: string; base: string; number?: string };

function parsePlayerName(raw: string | null | undefined): PlayerNameParts {
  const trimmed = (raw ?? '').trim();
  const match = trimmed.match(/^(.*?)(?:\(([^)]*)\))?\s*$/);
  const base = (match?.[1] ?? '').trim();
  const number = (match?.[2] ?? '').trim();
  return { raw: trimmed, base, number: number || undefined };
}

function formatWithJersey(name: string, jersey?: string): string {
  const parts = parsePlayerName(name);
  const targetNumber = jersey ?? parts.number;
  if (!targetNumber) return parts.raw;
  const suffix = `(${targetNumber})`;
  if (parts.raw.endsWith(suffix)) return parts.raw;
  return `${parts.base}${suffix}`;
}

function isSamePlayerName(a: string | null | undefined, b: string | null | undefined): boolean {
  const pa = parsePlayerName(a);
  const pb = parsePlayerName(b);
  if (!pa.base || !pb.base) return (pa.raw || '') === (pb.raw || '');
  if (pa.base !== pb.base) return false;
  if (pa.number && pb.number) return pa.number === pb.number;
  return true; 
}

function resolveJersey(jerseyMap: JerseyMap, side: 'home' | 'away', name: string): string | undefined {
  const { base, number } = parsePlayerName(name);
  return (
    jerseyMap[side].get(name)?.number ??
    jerseyMap[side].get(base)?.number ??
    jerseyMap[side].get(formatWithJersey(base, number))?.number ??
    number
  );
}

export default function ScoreboardTextPage() {
  const { state, actions } = useDemoStore();
  const { matchId } = useParams<{ matchId?: string }>();
  const [showReplay, setShowReplay] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const navigate = useNavigate(); // [수정] 훅 초기화

  // URL에서 matchId가 있으면 해당 경기 자동 선택
  useEffect(() => {
    if (matchId && matchId !== state.activeMatchId) {
      // matchId가 유효한지 확인
      const matchExists = state.matches.some((m) => m.id === matchId);
      if (matchExists) {
        actions.selectMatch(matchId);
      }
    }
  }, [matchId, state.activeMatchId, state.matches, actions]);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 900);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const activeMatch = useMemo(
    () => state.matches.find((m) => m.id === state.activeMatchId) ?? null,
    [state.matches, state.activeMatchId],
  );
  const hasLiveOverlay = useMemo(() => Boolean((activeMatch?.liveVideoUrl || '').trim()), [activeMatch?.liveVideoUrl]);
  const noActiveMatch = !state.activeMatchId;
  const feed = useMemo(() => state.feed, [state.feed]);
  const events = useMemo(() => state.events, [state.events]);
  const hittingSide = state.half === 'top' ? 'away' : 'home';
  const defenseSide = hittingSide === 'home' ? 'away' : 'home';
  
  const defenseAssignments = useMemo(
    () => getDefenseAssignments(state.lineups[defenseSide] ?? []),
    [defenseSide, state.lineups],
  );

  // [수정] 타자 라인업 계산 시 오타니 룰 등을 고려하여 ScorekeeperPage와 유사하게 처리
  // 다만 텍스트 페이지에서는 단순 표시용이므로 기본 로직 유지하되 이름은 고유하게 처리
  const offenseLineup = state.lineups[hittingSide];
  // 1~9번 타순은 무조건 포함, 그 외는 투수가 아니거나 타격 가능할 때 (여기선 단순화하여 전체 표시)
  const activeOffense = offenseLineup; 
  
  const currentBatterEntry = activeOffense[state.batterIndex[hittingSide] % (activeOffense.length || 1)];
  // [수정] currentBatter를 고유 이름으로 생성
  const currentBatter = currentBatterEntry
    ? getUniqueName(currentBatterEntry.name, currentBatterEntry.number)
    : '타자';

  const currentPitcherEntry = state.lineups[defenseSide].find((slot) => slot.pos.toUpperCase() === 'P');
  // [수정] currentPitcher를 고유 이름으로 생성
  const currentPitcher = currentPitcherEntry
    ? getUniqueName(currentPitcherEntry.name, currentPitcherEntry.number)
    : '투수';

  const currentInning = state.inning;

  // [수정] Today 기록 계산 시 고유 이름 기반 매칭 사용
  const batterToday = useMemo(() => computeBatterLine(feed, hittingSide, currentBatter), [feed, hittingSide, currentBatter]);
  const pitcherToday = useMemo(() => computePitcherLine(feed, currentPitcher), [feed, currentPitcher]);
  
  const jerseyMap = useMemo(() => buildJerseyMap(state.lineups, state.benches, state.removed), [state.lineups, state.benches, state.removed]);
  
  // [중요] buildPlayerStats가 이제 고유 키 로직을 따름
  const playerStats = useMemo(() => buildPlayerStats(buildGameRecord(state)), [state]);
  
  const postSummary = useMemo(
    () => buildPostGameSummary(playerStats.hitters, playerStats.pitchers, state.score),
    [playerStats.hitters, playerStats.pitchers, state.score],
  );
  const postGameDetail = activeMatch?.postGame ?? null;
  const displayItems = useMemo(() => buildDisplayItems(feed, events, jerseyMap), [feed, events, jerseyMap]);
  const sections = useMemo(() => groupByInning(displayItems), [displayItems]);
  const collapsedMap = useMemo(() => {
    const map: Record<number, boolean> = {};
    sections.forEach((section) => {
      map[section.inning] = section.inning < currentInning;
    });
    return map;
  }, [sections, currentInning]);
  const gameOverInfo = useMemo(() => {
    if (!state.gameOver) return null;
    const home = state.teamNames.home;
    const away = state.teamNames.away;
    const scoreText = `${away} ${state.score.away} - ${home} ${state.score.home}`;
    let resultText = `무승부 (${scoreText})`;
    if (state.score.home > state.score.away) {
      resultText = `${home} 승리 (${scoreText})`;
    } else if (state.score.away > state.score.home) {
      resultText = `${away} 승리 (${scoreText})`;
    }
    return {
      endText: '경기 종료',
      resultText,
    };
  }, [state.gameOver, state.score.away, state.score.home, state.teamNames.away, state.teamNames.home]);

  // [추가] CSV 다운로드 핸들러
  const handleDownloadCsv = () => {
    if (!state.gameOver) return;
    const recordPayload = buildGameRecord(state);
    const csvContent = buildCsvRecord(recordPayload);
    const filename = buildDownloadName('scorecard', state.endedAt);
    downloadCsv(csvContent, filename);
  };

  if (noActiveMatch) {
    return (
      <div
        style={{
          borderRadius: '16px',
          border: '1px solid rgba(148,163,184,0.3)',
          padding: '32px',
          textAlign: 'center',
          color: '#cbd5e1',
          background: '#0b0f1a',
        }}
      >
        현재 선택된 경기가 없습니다. 경기 일정에서 기록할 경기를 선택해 주세요.
      </div>
    );
  }

  return (
    <div className="scoreboard-text-page">
      <div className="main-content-grid">
        <div className={`scoreboard-section ${isMobile ? 'mobile-layout' : ''}`}>
          {/* 동접자 수 표시 */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '12px',
              padding: '8px 12px',
              background: 'rgba(34, 197, 94, 0.08)',
              borderRadius: '10px',
              width: 'fit-content',
            }}
          >
            <span style={{ fontSize: '15px' }}>👥</span>
            <span style={{ fontSize: '13px', color: '#22c55e', fontWeight: 600 }}>
              현재 {state.onlineViewerCount}명 시청 중
            </span>
          </div>
          <ScoreboardFrame
            variant="text"
            showFootnote={false}
            panelStyle={
              isMobile
                ? { width: '100%', height: 'auto', minHeight: '500px' }
                : { width: '100%', aspectRatio: '4 / 3' }
            }
          />
          <div style={{ marginTop: '20px' }}>
            <NowPlayingCard
              batter={parsePlayerName(currentBatter).raw}
              pitcher={parsePlayerName(currentPitcher).raw}
              batterToday={batterToday}
              pitcherToday={pitcherToday}
              balls={state.balls}
              strikes={state.strikes}
            />
          </div>
        </div>
        <div className={state.gameOver ? 'live-feed-section game-over' : 'live-feed-section'}>
          {state.gameOver ? (
            <>
              {/* [추가] 기록지 다운로드 버튼 영역 */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
                <button
                  type="button"
                  onClick={handleDownloadCsv}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '10px',
                    border: '1px solid rgba(59, 130, 246, 0.4)',
                    background: 'linear-gradient(90deg, #2563eb, #1d4ed8)',
                    color: '#f8fafc',
                    fontWeight: 900,
                    fontSize: '13px',
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <span style={{ fontSize: '16px' }}>📥</span>
                  기록지 다운로드 (CSV)
                </button>
              </div>

              {postGameDetail ? (
                <PostGameDetailSection detail={postGameDetail} teams={{ home: state.teamNames.home, away: state.teamNames.away }} />
              ) : (
                <PostGameSummary summary={postSummary} />
              )}
              <div
                style={{
                  border: '1px solid rgba(148,163,184,0.3)',
                  borderRadius: '12px',
                  padding: '8px 10px',
                  background: 'rgba(255,255,255,0.02)',
                  display: 'grid',
                  gridTemplateRows: 'auto 1fr',
                  gap: '6px',
                  minHeight: 0,
                  maxHeight: showReplay ? '560px' : '260px',
                  transition: 'max-height 180ms ease',
                  overflow: 'hidden',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                  <div style={{ display: 'grid', gap: '4px' }}>
                    <span style={{ fontWeight: 900, fontSize: '14px', color: '#e2e8f0' }}>문자중계 다시보기</span>
                    <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>경기 종료 후 기록 전체를 확인할 수 있습니다.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowReplay((v) => !v)}
                    style={{
                      padding: '8px 10px',
                      borderRadius: '10px',
                      border: '1px solid rgba(148,163,184,0.35)',
                      background: 'rgba(255,255,255,0.05)',
                      color: '#e2e8f0',
                      fontWeight: 800,
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    {showReplay ? '접기' : '펼치기'}
                  </button>
                </div>
                {showReplay ? (
                  <div
                    style={{
                      borderRadius: '10px',
                      border: '1px solid rgba(148,163,184,0.25)',
                      background: 'rgba(15,23,42,0.55)',
                      padding: '8px',
                      minHeight: 0,
                      maxHeight: '420px',
                      overflowY: 'auto',
                      alignSelf: 'stretch',
                    }}
                  >
                    <LiveFeed sections={sections} collapsedMap={collapsedMap} gameOverInfo={gameOverInfo} isMobile={isMobile} />
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontWeight: 900, fontSize: '18px' }}>문자 중계</span>
              <GameTimerDisplay
                gameLimitMinutes={state.gameLimitMinutes}
                gameStartTimestamp={state.gameStartTimestamp}
                gamePausedAt={state.gamePausedAt}
                gamePausedDuration={state.gamePausedDuration}
                gameStarted={state.gameStarted}
                style={{
                  padding: '5px 10px',
                  fontSize: '12px',
                }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ color: '#94a3b8', fontWeight: 700, fontSize: '12px' }}>총 {feed.length}건</span>
              {!noActiveMatch && (
                <button
                  type="button"
                  onClick={() => {
                    const url = `${window.location.origin}/scoreboard-text/${state.activeMatchId}`;
                    navigator.clipboard.writeText(url).then(() => {
                      alert('링크가 복사되었습니다!\n' + url);
                    }).catch(() => {
                      alert('링크 복사에 실패했습니다.');
                    });
                  }}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '10px',
                    border: '1px solid rgba(34,197,94,0.5)',
                    background: 'rgba(34,197,94,0.12)',
                    color: '#22c55e',
                    fontWeight: 800,
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                  title="이 경기 문자중계 링크 복사"
                >
                  🔗 링크 복사
                </button>
              )}
              {hasLiveOverlay ? (
                <button
                  type="button"
                  onClick={() => navigate('/live-overlay')}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '10px',
                    border: '1px solid rgba(148,163,184,0.5)',
                    background: 'rgba(148,163,184,0.12)',
                    color: '#e2e8f0',
                    fontWeight: 800,
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                  title="라이브 오버레이 보기"
                >
                  라이브 오버레이
                </button>
              ) : (
                <span
                  style={{
                    padding: '6px 10px',
                    borderRadius: '10px',
                    border: '1px dashed rgba(248,113,113,0.6)',
                    background: 'rgba(248,113,113,0.08)',
                    color: '#fca5a5',
                    fontWeight: 800,
                    fontSize: '12px',
                  }}
                  title="이 경기에는 라이브 영상 링크가 없습니다"
                >
                  라이브 없음
                </span>
              )}
            </div>
          </div>
          <LiveFeed sections={sections} collapsedMap={collapsedMap} gameOverInfo={gameOverInfo} isMobile={isMobile} />
          <div
            style={{
              borderRadius: '14px',
              border: '1px solid rgba(148,163,184,0.25)',
              background: 'rgba(15,23,42,0.5)',
              padding: '12px',
              display: 'grid',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 900, fontSize: '15px', color: '#e2e8f0' }}>필드 상황</span>
              <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 800 }}>베이스 · 볼카운트 · 수비 위치</span>
            </div>
            <FieldView
              bases={state.bases}
              inning={state.inning}
              half={state.half}
              outs={state.outs}
              balls={state.balls}
              strikes={state.strikes}
              batterName={currentBatter}
              defenseAssignments={defenseAssignments}
            />
          </div>
        </>
          )}
        </div>
      </div>

      <div className="stats-grid">
        <div style={{ display: 'grid', gap: '8px' }}>
          <StatsTable title={`${state.teamNames.away} 타자 기록`} stats={playerStats.hitters.away} variant="batter" density="compact" />
          <StatsTable title={`${state.teamNames.away} 투수 기록`} stats={playerStats.pitchers.away} variant="pitcher" density="compact" />

        </div>
        <div style={{ display: 'grid', gap: '8px' }}>
          <StatsTable title={`${state.teamNames.home} 타자 기록`} stats={playerStats.hitters.home} variant="batter" density="compact" />
          <StatsTable title={`${state.teamNames.home} 투수 기록`} stats={playerStats.pitchers.home} variant="pitcher" density="compact" />
        </div>
      </div>

      <div className="removed-players-grid">
        <RemovedPlayersPanel title="교체 out (HOME)" players={state.removed.home} density="compact" />
        <RemovedPlayersPanel title="교체 out (AWAY)" players={state.removed.away} density="compact" />
      </div>
    </div>
  );
}

function NowPlayingCard({
  batter,
  pitcher,
  batterToday,
  pitcherToday,
  balls,
  strikes,
}: {
  batter: string;
  pitcher: string;
  batterToday: BatterLine;
  pitcherToday: PitcherLine;
  balls: number;
  strikes: number;
}) {
  const batterLine = `${batterToday.ab}타수 ${batterToday.hits}안타${
    batterToday.hr ? ` (${batterToday.hr}홈런)` : batterToday.doubles ? ` (${batterToday.doubles} 2루타)` : ''
  }${batterToday.bb ? ` · ${batterToday.bb}볼넷` : ''}${batterToday.so ? ` · ${batterToday.so}삼진` : ''}`;
  const pitcherIp = `${Math.floor(pitcherToday.outs / 3)}.${pitcherToday.outs % 3}`;
  const pitcherLine = `${pitcherIp}이닝 ${pitcherToday.bf}타자 상대 · 투구수 ${pitcherToday.pitches} (S:${pitcherToday.strikes} / B:${pitcherToday.balls}) · ${
    pitcherToday.hits
  }피안타${pitcherToday.hr ? ` ${pitcherToday.hr}피홈런` : ''}${pitcherToday.bb ? ` · ${pitcherToday.bb}볼넷` : ''}${
    pitcherToday.hbp ? ` · ${pitcherToday.hbp}사구` : ''
  }${pitcherToday.so ? ` · ${pitcherToday.so}탈삼진` : ''}`;

  return (
    <div
      style={{
        borderRadius: '14px',
        border: '1px solid rgba(148, 163, 184, 0.2)',
        background: 'linear-gradient(180deg, rgba(15,23,42,0.9), rgba(15,23,42,0.7))',
        padding: '12px',
        display: 'grid',
        gap: '10px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontWeight: 900, color: '#e2e8f0' }}>현재 타석 · {batter}</span>
          <span
            style={{
              padding: '4px 8px',
              borderRadius: '999px',
              background: 'rgba(59,130,246,0.16)',
              border: '1px solid rgba(59,130,246,0.4)',
              color: '#bfdbfe',
              fontWeight: 800,
              fontSize: '12px',
            }}
          >
            B {balls} · S {strikes}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', color: '#cbd5e1', fontSize: '12px', fontWeight: 800 }}>
          <span>투수 {pitcher}</span>
        </div>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '10px',
        }}
      >
        <div
          style={{
            borderRadius: '10px',
            border: '1px solid rgba(59,130,246,0.35)',
            background: 'rgba(59,130,246,0.1)',
            padding: '10px',
            display: 'grid',
            gap: '6px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 900, color: '#bfdbfe' }}>타자 기록</span>
            <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 800 }}>시즌: -</span>
          </div>
          <span style={{ color: '#e2e8f0', fontWeight: 800 }}>{batterLine}</span>
          <span style={{ color: '#94a3b8', fontWeight: 700, fontSize: '12px' }}>오늘 성적</span>
        </div>
        <div
          style={{
            borderRadius: '10px',
            border: '1px solid rgba(52,211,153,0.35)',
            background: 'rgba(16,185,129,0.1)',
            padding: '10px',
            display: 'grid',
            gap: '6px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 900, color: '#a7f3d0' }}>투수 기록</span>
            <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 800 }}>시즌: -</span>
          </div>
          <span style={{ color: '#e2e8f0', fontWeight: 800 }}>{pitcherLine}</span>
          <span style={{ color: '#94a3b8', fontWeight: 700, fontSize: '12px' }}>오늘 기록</span>
        </div>
      </div>
    </div>
  );
}

function LiveFeed({
  sections,
  collapsedMap,
  gameOverInfo,
  isMobile,
}: {
  sections: ReturnType<typeof groupByInning>;
  collapsedMap: Record<number, boolean>;
  gameOverInfo: { endText: string; resultText: string } | null;
  isMobile: boolean;
}) {
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>(collapsedMap);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [measuredHeights, setMeasuredHeights] = useState<Record<string, number>>({});
  const overscanPx = 200;

  useEffect(() => {
    queueMicrotask(() => {
      setCollapsed((prev) => ({ ...collapsedMap, ...prev }));
    });
  }, [collapsedMap]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    });
  }, [sections, collapsed]);

  const flatItems = useMemo(() => {
    const items: { key: string; estimatedHeight: number; render: () => JSX.Element }[] = [];

    sections.forEach((section) => {
      const isCollapsed = collapsed[section.inning];
      const headerKey = `header-${section.inning}`;
      items.push({
        key: headerKey,
        estimatedHeight: 34,
        render: () => (
          <div key={headerKey} style={{ width: '100%', display: 'grid', gap: '6px' }}>
            <button
              type="button"
              onClick={() => setCollapsed((prev) => ({ ...prev, [section.inning]: !isCollapsed }))}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'transparent',
                border: 'none',
                color: '#e2e8f0',
                fontWeight: 900,
                cursor: 'pointer',
                padding: '2px 0',
              }}
            >
              <span style={{ color: isCollapsed ? '#94a3b8' : '#22c55e' }}>{isCollapsed ? '▶' : '▼'}</span>
              <span>{section.inning}회 전체</span>
            </button>
          </div>
        ),
      });

      if (isCollapsed) return;

      section.items.forEach((item, idx) => {
        const estimatedHeight =
          item.type === 'marker'
            ? 22
            : item.type === 'batter'
              ? 22
              : item.type === 'log'
                ? (item.details?.length ? 120 : 52)
                : 48;
        items.push({
          key: item.key,
          estimatedHeight,
          render: () => {
            if (item.type === 'marker') {
              return (
                <div key={item.key} style={{ color: item.color, fontWeight: 900, fontSize: '14px', padding: '2px 0' }}>
                  {item.text}
                </div>
              );
            }
            if (item.type === 'batter') {
              const badgeStyles = {
                out: {
                  border: '1px solid rgba(239,68,68,0.4)',
                  background: 'rgba(239,68,68,0.12)',
                  color: '#ef4444',
                  text: 'out',
                },
                대수비: {
                  border: '1px solid rgba(59,130,246,0.4)',
                  background: 'rgba(59,130,246,0.12)',
                  color: '#3b82f6',
                  text: '대수비',
                },
                대타: {
                  border: '1px solid rgba(34,197,94,0.4)',
                  background: 'rgba(34,197,94,0.12)',
                  color: '#22c55e',
                  text: '대타',
                },
                대주자: {
                  border: '1px solid rgba(251,146,60,0.4)',
                  background: 'rgba(251,146,60,0.12)',
                  color: '#fb923c',
                  text: '대주자',
                },
              };

              const badge = item.status ? badgeStyles[item.status] : null;

              return (
                <div
                  key={item.key}
                  style={{
                    color: '#e2e8f0',
                    fontWeight: 800,
                    fontSize: '13px',
                    padding: '2px 0',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <span>
                    {item.order ? `${item.order}번 ` : ''}
                    {item.text} 타석
                  </span>
                  {badge && (
                    <span
                      style={{
                        padding: '2px 6px',
                        borderRadius: '999px',
                        border: badge.border,
                        background: badge.background,
                        color: badge.color,
                        fontWeight: 900,
                        fontSize: '10px',
                        lineHeight: 1.2,
                      }}
                    >
                      {badge.text}
                    </span>
                  )}
                </div>
              );
            }
            // [수정] 교체 로그 판별 조건 완화 및 렌더링
            // 기존에는 item.text.includes(...) 만 체크했으나, colorizeText에서 하이라이팅이 되면
            // 일반 로그 형태(박스)보다는 텍스트 형태(한 줄)로 보여주는 것이 깔끔할 수 있습니다.
            // 여기서는 교체 관련 키워드가 포함된 경우 텍스트 형태로 렌더링하도록 합니다.
            if (
              item.type === 'log' &&
              (item.text.includes('투수 교체') ||
                item.text.includes('타자 교체') ||
                item.text.includes('대수비') ||
                item.text.includes('대타') ||
                item.text.includes('대주자') ||
                item.text.trim().endsWith('투수'))
            ) {
              return (
                <div key={item.key} style={{ color: '#e2e8f0', fontWeight: 900, fontSize: '13px', padding: '2px 0' }}>
                  {colorizeText(item.text).map((part) => (
                    <span key={part.key} style={{ color: part.color ?? '#e2e8f0', fontWeight: part.color ? 900 : 800 }}>
                      {part.text}
                    </span>
                  ))}
                </div>
              );
            }
            // 일반 로그 (박스 형태)
            return (
              <div
                key={item.key}
                style={{
                  padding: '10px 12px',
                  borderRadius: '12px',
                  border: '1px solid rgba(148, 163, 184, 0.2)',
                  background: idx % 2 === 0 ? 'rgba(15, 23, 42, 0.65)' : 'rgba(15, 23, 42, 0.35)',
                  fontSize: '14px',
                  lineHeight: 1.5,
                  display: 'grid',
                  gap: '8px',
                  width: 'max-content',
                  maxWidth: '100%',
                  color: '#e2e8f0',
                }}
              >
                <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
                  {colorizeText(item.text).map((part) => (
                    <span key={part.key} style={{ color: part.color ?? '#e2e8f0', fontWeight: part.color ? 900 : 800 }}>
                      {part.text}
                    </span>
                  ))}
                </div>
                {item.details?.length ? (
                  isMobile ? (
                    <details style={{ borderTop: '1px solid rgba(148,163,184,0.2)', paddingTop: '6px' }}>
                      <summary style={{ cursor: 'pointer', color: '#94a3b8', fontWeight: 800, fontSize: '12px' }}>
                        상세 이벤트 ({item.details.length})
                      </summary>
                      <div style={{ display: 'grid', gap: '4px', marginTop: '6px' }}>
                        {item.details.map((detail, detailIdx) => (
                          <div key={`${item.key}-detail-${detailIdx}`} style={{ fontSize: '12px', color: '#cbd5e1', lineHeight: 1.45 }}>
                            <span style={{ color: '#94a3b8', fontWeight: 800, marginRight: '6px' }}>{detail.label}</span>
                            <span>{detail.value}</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  ) : (
                    <div style={{ display: 'grid', gap: '4px', borderTop: '1px solid rgba(148,163,184,0.2)', paddingTop: '6px' }}>
                      {item.details.map((detail, detailIdx) => (
                        <div key={`${item.key}-detail-${detailIdx}`} style={{ fontSize: '12px', color: '#cbd5e1', lineHeight: 1.45 }}>
                          <span style={{ color: '#94a3b8', fontWeight: 800, marginRight: '6px' }}>{detail.label}</span>
                          <span>{detail.value}</span>
                        </div>
                      ))}
                    </div>
                  )
                ) : null}
              </div>
            );
          },
        });
      });
    });

    if (gameOverInfo) {
      // ... (game over info 렌더링 유지) ...
       items.push({
        key: 'game-over',
        estimatedHeight: 42,
        render: () => (
          <div key="game-over" style={{ display: 'grid', gap: '4px', padding: '4px 0' }}>
            <div style={{ color: '#f87171', fontWeight: 900, fontSize: '15px' }}>{gameOverInfo.endText}</div>
            <div style={{ color: '#f87171', fontWeight: 900, fontSize: '14px' }}>{gameOverInfo.resultText}</div>
          </div>
        ),
      });
    }

    return items;
  }, [sections, collapsed, gameOverInfo, isMobile]);

  const totalHeight = useMemo(() => {
    let h = 0;
    flatItems.forEach((item) => {
      h += measuredHeights[item.key] ?? item.estimatedHeight;
    });
    return h;
  }, [flatItems, measuredHeights]);

  const { startIndex, endIndex, offsetTop } = useMemo(() => {
    let y = 0;
    let start = 0;
    const viewportEnd = scrollTop + viewportHeight + overscanPx;
    const viewportStart = Math.max(0, scrollTop - overscanPx);

    for (let i = 0; i < flatItems.length; i += 1) {
      const h = measuredHeights[flatItems[i].key] ?? flatItems[i].estimatedHeight;
      const nextY = y + h;
      if (nextY >= viewportStart) {
        start = i;
        break;
      }
      y = nextY;
    }
    let end = start;
    let currentY = y;
    for (let i = start; i < flatItems.length; i += 1) {
      const h = measuredHeights[flatItems[i].key] ?? flatItems[i].estimatedHeight;
      currentY += h;
      end = i;
      if (currentY >= viewportEnd) break;
    }
    return { startIndex: start, endIndex: Math.min(end, flatItems.length - 1), offsetTop: y };
  }, [flatItems, scrollTop, viewportHeight, overscanPx, measuredHeights]);

  const visibleItems = flatItems.slice(startIndex, endIndex + 1);

  const measureRef = (key: string) => (el: HTMLDivElement | null) => {
    if (!el) return;
    const next = el.getBoundingClientRect().height;
    setMeasuredHeights((prev) => {
      if (prev[key] === next) return prev;
      return { ...prev, [key]: next };
    });
    setViewportHeight((v) => v); // trigger recalculation
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handle = () => {
      setScrollTop(el.scrollTop);
      setViewportHeight(el.clientHeight);
    };
    handle();
    el.addEventListener('scroll', handle, { passive: true });
    const resizeObserver = new ResizeObserver(() => handle());
    resizeObserver.observe(el);
    return () => {
      el.removeEventListener('scroll', handle);
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div
      style={{
        overflowY: 'auto',
        maxHeight: '430px',
        height: 'min(40vh, 430px)',
        paddingRight: '6px',
        minHeight: 0,
        position: 'relative',
      }}
      ref={containerRef}
    >
      <div style={{ position: 'relative', height: totalHeight, width: '100%' }}>
        <div style={{ position: 'absolute', top: offsetTop, left: 0, right: 0, display: 'grid', gap: '10px' }}>
          {visibleItems.map((item) => (
            <div key={item.key} ref={measureRef(item.key)}>
              {item.render()}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FieldView({
  bases,
  inning,
  half,
  outs,
  balls,
  strikes,
  batterName,
  defenseAssignments,
  onSelectRunner,
  onSelectBatter,
  onSelectFielder,
}: {
  bases: (string | null)[];
  inning: number;
  half: 'top' | 'bottom';
  outs: number;
  balls: number;
  strikes: number;
  batterName: string;
  defenseAssignments: { name: string; pos: string; x: number; y: number }[];
  onSelectRunner?: (payload: { base: 0 | 1 | 2; name: string }) => void;
  onSelectBatter?: () => void;
  onSelectFielder?: (payload: { name: string; pos: string }) => void;
}) {
  const label = `${half === 'top' ? '▲' : '▼'} ${inning}`;
  const baseSize = 'clamp(20px, 3.4vw, 30px)';
  const groundShift = '-4%';
  const positions = {
    second: { x: 50, y: 35 },
    first: { x: 72, y: 63 },
    third: { x: 28, y: 63 },
    home: { x: 50, y: 92 },
    batter: { x: 58, y: 90 },
  };
  return (
    <div
      style={{
        position: 'relative',
        borderRadius: '18px',
        background: '#0b0f1a',
        width: '100%',
        minWidth: 0,
        maxWidth: '100%',
        aspectRatio: '4 / 3',
        border: '1px solid rgba(148, 163, 184, 0.25)',
        overflow: 'hidden',
        justifySelf: 'start',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: `translateY(${groundShift})`,
          pointerEvents: 'none',
        }}
      >
        <FieldSvg />
        <BaselineSvg />
      </div>
      <span
        style={{
          position: 'absolute',
          top: '12px',
          left: '12px',
          padding: '8px 12px',
          borderRadius: '12px',
          background: 'rgba(15,23,42,0.8)',
          border: '1px solid rgba(148,163,184,0.3)',
          fontWeight: 900,
          color: '#cbd5e1',
          fontSize: '13px',
        }}
      >
        {label}
      </span>
      <OutLights outs={outs} balls={balls} strikes={strikes} />
      <Base
        marker={Boolean(bases[1])}
        label={bases[1] ?? '2'}
        top={`${positions.second.y}%`}
        left={`${positions.second.x}%`}
        size={baseSize}
        onSelect={() => bases[1] && onSelectRunner?.({ base: 1, name: bases[1] })}
      />
      <Base
        marker={Boolean(bases[0])}
        label={bases[0] ?? '1'}
        top={`${positions.first.y}%`}
        left={`${positions.first.x}%`}
        size={baseSize}
        onSelect={() => bases[0] && onSelectRunner?.({ base: 0, name: bases[0] })}
      />
      <Base
        marker={Boolean(bases[2])}
        label={bases[2] ?? '3'}
        top={`${positions.third.y}%`}
        left={`${positions.third.x}%`}
        size={baseSize}
        onSelect={() => bases[2] && onSelectRunner?.({ base: 2, name: bases[2] })}
      />
      <HomePlate occupied={false} size={baseSize} top={`${positions.home.y}%`} left={`${positions.home.x}%`} />
      <BatterBadge name={batterName} top={`${positions.batter.y}%`} left={`${positions.batter.x}%`} onClick={onSelectBatter} />
      <PitcherBadge
        name={defenseAssignments.find((player) => player.pos.toUpperCase() === 'P')?.name ?? '투수'}
        top="54%"
        left="50%"
        onClick={onSelectFielder}
      />
      <DefenseLayer
        assignments={defenseAssignments.filter((player) => player.pos.toUpperCase() !== 'P')}
        onSelectFielder={onSelectFielder}
      />
    </div>
  );
}

function Base({
  marker,
  label,
  top,
  left,
  size,
  onSelect,
}: {
  marker?: boolean;
  label?: string;
  top?: string;
  left?: string;
  size?: string;
  onSelect?: () => void;
}) {
  const clickable = marker && onSelect;
  return (
    <div
      style={{
        position: 'absolute',
        top,
        left,
        transform: 'translate(-50%, -50%) rotate(45deg)',
        width: size ?? '28px',
        height: size ?? '28px',
        background: '#f4f4f5',
        borderRadius: '4px',
        border: '2px solid #e5e7eb',
        display: 'grid',
        placeItems: 'center',
        boxShadow: marker ? '0 0 0 8px rgba(248, 113, 113, 0.2)' : undefined,
        cursor: clickable ? 'pointer' : 'default',
        transition: 'transform 120ms ease, box-shadow 120ms ease',
        ...(clickable
          ? {
              transformOrigin: 'center',
            }
          : {}),
      }}
      role={clickable ? 'button' : undefined}
      onClick={() => clickable && onSelect?.()}
      onMouseEnter={(e) => {
        if (clickable) {
          (e.currentTarget as HTMLDivElement).style.transform = 'translate(-50%, -50%) rotate(45deg) scale(1.05)';
        }
      }}
      onMouseLeave={(e) => {
        if (clickable) {
          (e.currentTarget as HTMLDivElement).style.transform = 'translate(-50%, -50%) rotate(45deg)';
        }
      }}
    >
      {marker && (
        <span
          style={{
            transform: 'rotate(-45deg)',
            fontWeight: 900,
            color: '#ef4444',
            fontSize: '10px',
          }}
        >
          {label}
        </span>
      )}
    </div>
  );
}

function HomePlate({ occupied, size, top, left }: { occupied: boolean; size?: string; top?: string; left?: string }) {
  const plateWidth = size ? `calc(${size} * 1.5)` : '44px';
  const plateHeight = size ? `calc(${size} * 1.2)` : '36px';
  return (
    <div
      style={{
        position: 'absolute',
        top: top ?? '72%',
        left: left ?? '50%',
        transform: 'translate(-50%, -50%)',
        width: plateWidth,
        height: plateHeight,
        background: '#e5e7eb',
        clipPath: 'polygon(0 0, 100% 0, 100% 60%, 50% 100%, 0 60%)',
        border: occupied ? '2px solid #f97316' : '2px solid #d1d5db',
        boxShadow: occupied ? '0 0 0 8px rgba(249, 115, 22, 0.2)' : undefined,
      }}
    />
  );
}

function BaselineSvg() {
  return (
    <svg viewBox="0 0 100 100" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <polyline
        points="50,72 72,50 50,28 28,50 50,72"
        fill="none"
        stroke="rgba(226,232,240,0.35)"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <line x1="50" y1="72" x2="2" y2="24" stroke="rgba(226,232,240,0.25)" strokeWidth="1.4" />
      <line x1="50" y1="72" x2="98" y2="24" stroke="rgba(226,232,240,0.25)" strokeWidth="1.4" />
    </svg>
  );
}

function OutLights({ outs, balls, strikes }: { outs: number; balls: number; strikes: number }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: '12px',
        right: '12px',
        display: 'flex',
        gap: '8px',
        alignItems: 'center',
        padding: '6px 10px',
        borderRadius: '12px',
        background: 'rgba(15,23,42,0.8)',
        border: '1px solid rgba(148,163,184,0.3)',
      }}
    >
      <CounterDots label="B" count={balls} max={3} color="#22c55e" />
      <CounterDots label="S" count={strikes} max={2} color="#facc15" />
      <CounterDots label="O" count={outs} max={3} color="#ef4444" />
    </div>
  );
}

function CounterDots({ label, count, max, color }: { label: string; count: number; max: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <span style={{ color, fontWeight: 900, fontSize: '13px', width: '16px' }}>{label}</span>
      {[...Array(max)].map((_, idx) => (
        <span
          key={idx}
          style={{
            width: '14px',
            height: '14px',
            borderRadius: '50%',
            background: count > idx ? color : 'transparent',
            border: `1px solid ${color}80`,
            boxShadow: count > idx ? `0 0 10px ${color}99` : `inset 0 0 0 1px ${color}55`,
          }}
        />
      ))}
    </div>
  );
}

function DefenseLayer({
  assignments,
  onSelectFielder,
}: {
  assignments: { name: string; pos: string; x: number; y: number }[];
  onSelectFielder?: (payload: { name: string; pos: string }) => void;
}) {
  return (
    <>
      {assignments.map((player) => (
        <div
          key={player.name + player.pos}
          role={onSelectFielder ? 'button' : undefined}
          onClick={() => onSelectFielder?.({ name: player.name, pos: player.pos })}
          style={{
            position: 'absolute',
            top: `${player.y}%`,
            left: `${player.x}%`,
            transform: 'translate(-50%, -50%)',
            padding: '6px 8px',
            borderRadius: '12px',
            background: 'rgba(15,23,42,0.75)',
            border: '1px solid rgba(148,163,184,0.3)',
            color: '#e2e8f0',
            fontWeight: 800,
            fontSize: '11px',
            cursor: onSelectFielder ? 'pointer' : 'default',
            boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
            pointerEvents: onSelectFielder ? 'auto' : 'none',
          }}
        >
          {player.pos} · {player.name}
        </div>
      ))}
    </>
  );
}

function BatterBadge({ name, top, left, onClick }: { name: string; top: string; left: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        position: 'absolute',
        top,
        left,
        transform: 'translate(-50%, -50%)',
        padding: '10px 12px',
        borderRadius: '12px',
        border: '1px solid rgba(148,163,184,0.35)',
        background: 'rgba(99,102,241,0.18)',
        color: '#e2e8f0',
        fontWeight: 900,
        fontSize: '12px',
        cursor: onClick ? 'pointer' : 'default',
        boxShadow: '0 6px 16px rgba(0,0,0,0.3)',
        pointerEvents: onClick ? 'auto' : 'none',
      }}
    >
      타석 · {name}
    </button>
  );
}

function PitcherBadge({
  name,
  top,
  left,
  onClick,
}: {
  name: string;
  top: string;
  left: string;
  onClick?: (payload: { name: string; pos: string }) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onClick?.({ name, pos: 'P' })}
      style={{
        position: 'absolute',
        top,
        left,
        transform: 'translate(-50%, -50%)',
        padding: '8px 10px',
        borderRadius: '12px',
        border: '1px solid rgba(148,163,184,0.3)',
        background: 'rgba(15,23,42,0.75)',
        color: '#e2e8f0',
        fontWeight: 900,
        fontSize: '12px',
        cursor: onClick ? 'pointer' : 'default',
        boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
        pointerEvents: onClick ? 'auto' : 'none',
      }}
    >
      투수 · {name}
    </button>
  );
}

function FieldSvg() {
  return (
    <svg viewBox="0 0 100 100" style={{ position: 'absolute', inset: 0 }}>
      <defs>
        <linearGradient id="grass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#166534" />
          <stop offset="100%" stopColor="#0f3d1f" />
        </linearGradient>
        <linearGradient id="dirt" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#b7791f" />
          <stop offset="100%" stopColor="#92400e" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill="url(#grass)" />
      <path d="M 50 72 L 2 24 Q 50 -15 98 24 Z" fill="rgba(22,101,52,0.92)" />
      <polygon points="50,28 72,50 50,72 28,50" fill="url(#dirt)" />
      <circle cx="50" cy="50" r="3.5" fill="#a16207" stroke="rgba(0,0,0,0.25)" strokeWidth="0.4" />
      <circle cx="50" cy="50" r="1.2" fill="#e2e8f0" opacity="0.4" />
      <rect x="43.5" y="64" width="4" height="7" fill="transparent" stroke="rgba(148,163,184,0.5)" strokeWidth="0.6" />
      <rect x="52.5" y="64" width="4" height="7" fill="transparent" stroke="rgba(148,163,184,0.5)" strokeWidth="0.6" />
    </svg>
  );
}

function getDefenseAssignments(lineup: { name: string; pos: string }[]) {
  const posMap: Record<string, { x: number; y: number }> = {
    P: { x: 50, y: 54 },
    C: { x: 50, y: 84 },
    '1B': { x: 76, y: 52 },
    '2B': { x: 62, y: 40 },
    SS: { x: 38, y: 40 },
    '3B': { x: 24, y: 52 },
    LF: { x: 18, y: 20 },
    CF: { x: 50, y: 12 },
    RF: { x: 82, y: 20 },
  };
  const fallback: { x: number; y: number }[] = [
    { x: 50, y: 54 },
    { x: 50, y: 84 },
    { x: 76, y: 52 },
    { x: 62, y: 40 },
    { x: 38, y: 40 },
    { x: 24, y: 52 },
    { x: 18, y: 20 },
    { x: 50, y: 12 },
    { x: 82, y: 20 },
  ];
  return lineup
    .filter((slot) => Boolean(posMap[slot.pos.toUpperCase()]))
    .map((slot, idx) => {
      const key = slot.pos.toUpperCase();
      const coords = posMap[key] ?? fallback[idx] ?? { x: 50, y: 56 };
      return { name: slot.name, pos: slot.pos, x: coords.x, y: coords.y };
    });
}

// [수정] ci(타격방해), fc(야수선택) 판별 로직 추가
function classifyResult(result: string) {
  const normalized = result.replace(/\s+/g, '');
  if (normalized.includes('홈런')) return 'hr' as const;
  if (normalized.includes('3루타')) return 'triple' as const;
  if (normalized.includes('2루타')) return 'double' as const;
  if (normalized.includes('1루타')) return 'single' as const;
  if (normalized.includes('고의') || normalized.toUpperCase().includes('IB')) return 'bb' as const; // 고의4구 추가
  if (normalized.includes('볼넷')) return 'bb' as const;
  if (normalized.includes('몸에맞는공')) return 'hbp' as const;
  if (normalized.includes('타격방해')) return 'ci' as const; // [추가]
  if (normalized.includes('야수선택') || normalized.toUpperCase().includes('F.C')) return 'fc' as const; // [추가]
  if (normalized.includes('희생플라이')) return 'sac' as const;
  if (normalized.includes('희생번트')) return 'sac' as const; // [추가] 희생번트도 sac으로 분류
  if (normalized.includes('낫아웃')) return 'so_reach' as const;
  if (normalized.includes('삼진')) return 'so' as const;
  if (normalized.includes('아웃') && !normalized.includes('도루')) return 'out' as const;
  return null;
}

function classifyPitch(result: string) {
  const normalized = result.replace(/\s+/g, '');
  const hasPitch =
    normalized.includes('볼') ||
    normalized.includes('스트라이크') ||
    normalized.includes('파울') ||
    normalized.includes('삼진') ||
    normalized.includes('아웃') ||
    normalized.includes('타') ||
    normalized.includes('홈런') ||
    normalized.includes('희생') ||
    normalized.includes('몸에맞는공');
  const isBall = normalized.includes('볼') || normalized.includes('볼넷') || normalized.includes('몸에맞는공');
  const isStrike =
    normalized.includes('스트라이크') ||
    normalized.includes('파울') ||
    normalized.includes('삼진') ||
    normalized.includes('타') ||
    normalized.includes('홈런') ||
    normalized.includes('아웃');
  return { pitch: hasPitch, ball: isBall, strike: isStrike };
}

// [수정] computeBatterLine: 고유 이름 매칭 로직 적용
function computeBatterLine(feed: ReturnType<typeof useDemoStore>['state']['feed'], side: 'home' | 'away', batter: string): BatterLine {
  const base: BatterLine = { pa: 0, ab: 0, hits: 0, hr: 0, doubles: 0, triples: 0, bb: 0, hbp: 0, so: 0, sac: 0 };
  if (!batter) return base;
  feed.forEach((entry) => {
    const offenseSide: 'home' | 'away' = entry.half === 'top' ? 'away' : 'home';
    if (offenseSide !== side) return;
    
    // entry.batter에는 이미 고유 이름이 저장되어 있을 수 있음
    // batter(현재 타석)도 고유 이름임.
    // isSamePlayerName을 사용하여 비교 (혹은 문자열 단순 비교)
    if (!isSamePlayerName(entry.batter, batter)) return;
    
    const kind = classifyResult(entry.result);
    if (!kind) return;
    if (['single', 'double', 'triple', 'hr', 'bb', 'hbp', 'so', 'so_reach', 'out', 'sac'].includes(kind)) {
      base.pa += 1;
    }
    switch (kind) {
      case 'single':
        base.ab += 1;
        base.hits += 1;
        break;
      case 'double':
        base.ab += 1;
        base.hits += 1;
        base.doubles += 1;
        break;
      case 'triple':
        base.ab += 1;
        base.hits += 1;
        base.triples += 1;
        break;
      case 'hr':
        base.ab += 1;
        base.hits += 1;
        base.hr += 1;
        break;
      case 'bb':
        base.bb += 1;
        break;
      case 'hbp':
        base.hbp += 1;
        break;
      case 'so':
        base.ab += 1;
        base.so += 1;
        break;
      case 'so_reach':
        base.ab += 1;
        base.so += 1;
        break;
      case 'out':
        base.ab += 1;
        break;
      case 'sac':
        base.sac += 1;
        break;
      default:
        break;
    }
  });
  return base;
}

// [수정] computePitcherLine: ScorekeeperPage와 유사하게 투수 이름 파싱 로직 강화
function computePitcherLine(feed: ReturnType<typeof useDemoStore>['state']['feed'], pitcher: string): PitcherLine {
  const base: PitcherLine = { bf: 0, outs: 0, hits: 0, hr: 0, bb: 0, hbp: 0, so: 0, pitches: 0, strikes: 0, balls: 0 };
  if (!pitcher) return base;
  
  // Feed is already in chronological order (oldest → newest) per pushFeed implementation
  const chronological = feed;
  const current: Record<'home' | 'away', string | null> = { home: null, away: null };
  // [중요] ScorekeeperPage와 동일하게 괄호 제거하지 않음
  const cleanName = (raw: string) => raw.replace(/투수/g, '').replace(/·/g, '').trim();

  chronological.forEach((entry) => {
    const offenseSide: 'home' | 'away' = entry.half === 'top' ? 'away' : 'home';
    const defenseSide: 'home' | 'away' = offenseSide === 'home' ? 'away' : 'home';
    const result = entry.result.trim();

    // 피드에서 투수 추적
    if (result.includes('투수 교체') || (result.includes('대수비') && result.includes('→'))) {
      const incoming = result.split('→')[1];
      if (incoming) current[defenseSide] = cleanName(incoming);
    } else if (result.endsWith('투수')) {
      current[defenseSide] = cleanName(result.replace('투수', ''));
    }

    // 투수 교체가 명시되지 않은 경우, 현재 투수(pitcher)를 기본값으로 사용
    const activePitcher = current[defenseSide] || pitcher;
    // pitcher(현재 투수)와 피드 상의 투수 비교
    if (!isSamePlayerName(activePitcher, pitcher)) return;

    const pitchInfo = classifyPitch(result);
    if (pitchInfo.pitch) {
      base.pitches += 1;
      if (pitchInfo.strike) base.strikes += 1;
      if (pitchInfo.ball) base.balls += 1;
    }

    const kind = classifyResult(result);
    if (!kind) return;
    if (['single', 'double', 'triple', 'hr', 'bb', 'hbp', 'so', 'out', 'sac'].includes(kind)) {
      base.bf += 1;
    }
    switch (kind) {
      case 'single':
        base.hits += 1;
        break;
      case 'double':
        base.hits += 1;
        break;
      case 'triple':
        base.hits += 1;
        break;
      case 'hr':
        base.hits += 1;
        base.hr += 1;
        break;
      case 'bb':
        base.bb += 1;
        break;
      case 'hbp':
        base.hbp += 1;
        break;
      case 'so':
        base.so += 1;
        base.outs += 1;
        break;
      case 'out':
        base.outs += 1;
        break;
      case 'sac':
        base.outs += 1;
        break;
      default:
        break;
    }
  });
  return base;
}

function buildJerseyMap(
  lineups: ReturnType<typeof useDemoStore>['state']['lineups'],
  benches?: ReturnType<typeof useDemoStore>['state']['benches'],
  removed?: ReturnType<typeof useDemoStore>['state']['removed'],
): JerseyMap {
  const merge = (
    lineup: { name: string; pos: string; number: string }[],
    bench?: { name: string; pos: string; number: string }[],
    gone?: { name: string; pos: string; number: string }[],
  ) => [...lineup, ...(bench ?? []), ...(gone ?? [])];

  const buildSideMap = (players: { name: string; pos: string; number: string }[]) => {
    const map = new Map<string, { number: string; pos: string }>();
    const setIfEmpty = (key: string | undefined, value: { number: string; pos: string }) => {
      const trimmed = (key ?? '').trim();
      if (!trimmed || map.has(trimmed)) return;
      map.set(trimmed, value);
    };
    players.forEach((p) => {
      if (!p?.name) return;
      const parts = parsePlayerName(p.name);
      const entry = { number: p.number, pos: p.pos };
      setIfEmpty(p.name, entry); // 원본 이름
      setIfEmpty(formatWithJersey(parts.base || p.name, p.number), entry); // 이름+등번호
      setIfEmpty(parts.base, entry); // 등번호 없는 베이스 이름(백업)
    });
    return map;
  };

  return {
    home: buildSideMap(merge(lineups.home, benches?.home, removed?.home)),
    away: buildSideMap(merge(lineups.away, benches?.away, removed?.away)),
  };
}

function formatEntry(entry: ReturnType<typeof useDemoStore>['state']['feed'][number], batterDisplay?: string) {
  const halfLabel = entry.half === 'top' ? '초' : '말';
  const inningLabel = `${entry.inning}회${halfLabel}`;
  const batterLabel = entry.batter ? `${entry.order}번 ${batterDisplay ?? entry.batter} 타석` : '';
  const pitchLabel = entry.pitch > 0 ? `${entry.pitch}구째` : '';
  const parts = [inningLabel, batterLabel, pitchLabel].filter(Boolean).join(' ');
  return parts ? `${parts} ${entry.result}` : entry.result;
}

function eventLookupKey(payload: { inning: number; half: Half; order: number; pitch: number }) {
  return `${payload.inning}-${payload.half}-${payload.order}-${payload.pitch}`;
}

function formatErrorDetail(error: PlayEvent['error']) {
  if (!error) return '';
  if (typeof error === 'string') return error.trim();
  const parts = [error.errorType, error.fielderPos, error.context]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .map((part) => part.trim());
  return parts.join(' · ');
}

function formatEventDetails(event?: PlayEvent): EventDetail[] {
  if (!event) return [];
  const details: EventDetail[] = [];

  const battedBallType = event.battedBall?.type?.trim();
  const battedBallZone = event.battedBall?.zone?.trim();
  const battedBallValue = [battedBallType, battedBallZone]
    .filter((value): value is string => Boolean(value && value !== '선택 안 함'))
    .join(' / ');
  if (battedBallValue) {
    details.push({ label: '타구', value: battedBallValue });
  }

  if (Array.isArray(event.runners) && event.runners.length) {
    details.push({ label: '주자', value: event.runners.join(', ') });
  }

  const errorValue = formatErrorDetail(event.error);
  if (errorValue) {
    details.push({ label: '실책', value: errorValue });
  }

  if (typeof event.rbi === 'number' && event.rbi > 0) {
    details.push({ label: '타점', value: `${event.rbi}` });
  }

  if (Array.isArray(event.dpRoute) && event.dpRoute.length) {
    details.push({ label: '병살 루트', value: event.dpRoute.join('-') });
  }

  if (event.strikeType) {
    details.push({ label: '삼진 판정', value: event.strikeType === 'looking' ? '루킹' : '스윙' });
  }

  if (event.notes?.trim()) {
    details.push({ label: '비고', value: event.notes.trim() });
  }

  return details;
}

function buildDisplayItems(
  feed: ReturnType<typeof useDemoStore>['state']['feed'],
  events: ReturnType<typeof useDemoStore>['state']['events'],
  jerseyMap: JerseyMap,
): DisplayItem[] {
  // [수정] demoStore가 이미 올바른 시간순(Oldest -> Newest)으로 정렬되어 있으므로 reverse() 제거
  // createdAt 기반 정렬 덕분에 선수 교체 로그도 정확한 시점에 위치함
  const chronological = feed;
  const eventsById = new Map<string, PlayEvent>();
  const eventsByKey = new Map<string, PlayEvent[]>();
  const eventsChronological = [...events].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));

  eventsChronological.forEach((event) => {
    if (event.eventId) {
      eventsById.set(event.eventId, event);
    }
    const key = eventLookupKey(event);
    const queue = eventsByKey.get(key) ?? [];
    queue.push(event);
    eventsByKey.set(key, queue);
  });

  const items: DisplayItem[] = [];

  const markerText = (inning: number, half: Half, type: 'start' | 'end') => {
    const halfLabel = half === 'top' ? '초' : '말';
    return `${inning}회${halfLabel} ${type === 'start' ? '시작' : '종료'}`;
  };

  let prevHalf: Half | null = null;
  let prevInning: number | null = null;
  let prevBatter: string | null = null;
  const endedInnings = new Set<string>();
  const battingSlots: Record<'home' | 'away', Map<number, string>> = { home: new Map(), away: new Map() };

  chronological.forEach((entry, idx) => {
    const offenseSide: 'home' | 'away' = entry.half === 'top' ? 'away' : 'home';
    const order = entry.order && entry.order > 0 ? entry.order : null;
    const batterName = entry.batter?.trim();

    const isEndMarker = entry.result.includes('종료');
    if (isEndMarker) {
      const label = `${entry.inning}-${entry.half}`;
      if (endedInnings.has(label)) {
        prevHalf = entry.half;
        prevInning = entry.inning;
        return;
      }
      items.push({
        type: 'marker',
        text: entry.result,
        color: '#f87171',
        key: `end-${entry.inning}-${entry.half}-${idx}`,
        inning: entry.inning,
        half: entry.half,
      });
      endedInnings.add(label);
      prevHalf = entry.half;
      prevInning = entry.inning;
      return;
    }

    const isNewHalf = idx === 0 || entry.inning !== prevInning || entry.half !== prevHalf;
    if (isNewHalf) {
      items.push({
        type: 'marker',
        text: markerText(entry.inning, entry.half, 'start'),
        color: '#22c55e',
        key: `start-${entry.inning}-${entry.half}-${idx === 0 ? 'init' : idx}`,
        inning: entry.inning,
        half: entry.half,
      });
      prevBatter = null;
    }

    let isSubstitute = false;
    // [수정] 교체 상태 변수 추가
    let subStatus: 'out' | '대수비' | '대타' | '대주자' | undefined;

    if (batterName && order) {
      const slot = battingSlots[offenseSide];
      const prevOccupant = slot.get(order);
      if (prevOccupant && !isSamePlayerName(prevOccupant, batterName)) {
        const outgoingJersey = resolveJersey(jerseyMap, offenseSide, prevOccupant);
        items.push({
          type: 'batter',
          text: formatWithJersey(prevOccupant, outgoingJersey),
          key: `batter-${entry.inning}-${entry.half}-${order}-${idx}-out`,
          inning: entry.inning,
          half: entry.half,
          order,
          jersey: outgoingJersey,
          status: 'out',
        });
        isSubstitute = true;
        prevBatter = null;
      }
      slot.set(order, batterName);
    }

    // [수정] 교체 선수일 경우, 직전 로그를 확인하여 교체 유형(대타/대주자/대수비) 추론
    if (isSubstitute) {
      const prevItem = idx > 0 ? chronological[idx - 1] : null;
      if (prevItem) {
        if (prevItem.result.includes('대타')) subStatus = '대타';
        else if (prevItem.result.includes('대주자')) subStatus = '대주자';
        else if (prevItem.result.includes('대수비')) subStatus = '대수비';
      }
    }

    if (batterName) {
      const jersey = resolveJersey(jerseyMap, offenseSide, batterName);
      const batterText = formatWithJersey(batterName, jersey);
      if (!prevBatter || !isSamePlayerName(prevBatter, batterName) || isSubstitute) {
        items.push({
          type: 'batter',
          text: batterText,
          key: `batter-${entry.inning}-${entry.half}-${order ?? 'na'}-${batterName}-${idx}${isSubstitute ? '-sub' : ''}`,
          inning: entry.inning,
          half: entry.half,
          order,
          jersey,
          isSubstitute,
          // [수정] 추론된 교체 유형 상태 적용
          status: subStatus,
        });
        prevBatter = batterName;
      }
    }

    const key = eventLookupKey(entry);
    const queue = eventsByKey.get(key);
    let matchedEvent = entry.eventId ? eventsById.get(entry.eventId) : undefined;
    if (!matchedEvent && queue && queue.length) {
      if (typeof entry.createdAt === 'number') {
        let bestIdx = 0;
        let bestDiff = Number.POSITIVE_INFINITY;
        queue.forEach((candidate, candidateIdx) => {
          const eventTime = typeof candidate.createdAt === 'number' ? candidate.createdAt : entry.createdAt!;
          const diff = Math.abs(eventTime - entry.createdAt!);
          if (diff < bestDiff) {
            bestDiff = diff;
            bestIdx = candidateIdx;
          }
        });
        matchedEvent = queue.splice(bestIdx, 1)[0];
      } else {
        matchedEvent = queue.shift();
      }
    }

    items.push({
      type: 'log',
      text: formatEntry(entry, batterName ? formatWithJersey(batterName, resolveJersey(jerseyMap, offenseSide, batterName)) : undefined),
      key: `log-${entry.inning}-${entry.half}-${entry.order}-${entry.pitch}-${idx}`,
      chip: `${entry.inning}-${entry.half}-${entry.order}-${entry.pitch}`,
      inning: entry.inning,
      half: entry.half,
      details: formatEventDetails(matchedEvent),
    });

    prevHalf = entry.half;
    prevInning = entry.inning;
  }); 

  return items;
}

function groupByInning(items: DisplayItem[]) {
  const map = new Map<number, { inning: number; items: DisplayItem[] }>();
  items.forEach((item) => {
    const section = map.get(item.inning) ?? { inning: item.inning, items: [] };
    section.items.push(item);
    map.set(item.inning, section);
  });
  return [...map.values()].sort((a, b) => a.inning - b.inning);
}

// [수정] colorizeText 함수: 선수 교체 관련 키워드 추가하여 하이라이팅 적용
// -------------------------------------------------------------------------
function colorizeText(text: string) {
  // 기존 패턴에 '투수 교체', '타자 교체', '대수비', '대타', '대주자' 등 추가
  const pattern =
    /(\d+\s*안타|\d+\s*아웃|득점|점수|도루\s*성공|도루\s*실패|도루|안타|2루타|3루타|루타|홈런|볼넷|몸에\s*맞는\s*공|몸에맞는공|HBP|HP|사구|아웃|삼진|낫아웃|견제사|실책|E[1-6]|WP|PB|BK|야수선택|FC|F\.C|투수\s*교체|타자\s*교체|대수비|대타|대주자)/g;
  
  const colorMap: Record<string, string> = {
    득점: '#facc15',
    점수: '#facc15',
    도루성공: '#38bdf8',
    '도루 성공': '#38bdf8',
    도루실패: '#f87171',
    '도루 실패': '#f87171',
    도루: '#38bdf8',
    안타: '#38bdf8',
    '1안타': '#38bdf8',
    '2안타': '#38bdf8',
    '3안타': '#38bdf8',
    '4안타': '#38bdf8',
    '5안타': '#38bdf8',
    '6안타': '#38bdf8',
    '7안타': '#38bdf8',
    '8안타': '#38bdf8',
    '9안타': '#38bdf8',
    '2루타': '#38bdf8',
    '3루타': '#38bdf8',
    루타: '#38bdf8',
    홈런: '#38bdf8',
    볼넷: '#38bdf8',
    몸에맞는공: '#38bdf8',
    HBP: '#38bdf8',
    HP: '#38bdf8',
    사구: '#38bdf8',
    낫아웃: '#f97316',
    실책: '#f97316',
    E1: '#f97316',
    E2: '#f97316',
    E3: '#f97316',
    E4: '#f97316',
    E5: '#f97316',
    E6: '#f97316',
    WP: '#f97316',
    PB: '#f97316',
    BK: '#f97316',
    야수선택: '#a78bfa',
    FC: '#a78bfa',
    'F.C': '#a78bfa',
    아웃: '#f87171',
    '1아웃': '#f87171',
    '2아웃': '#f87171',
    '3아웃': '#f87171',
    삼진: '#f87171',
    견제사: '#f87171',
    // [추가] 교체 관련 키워드 색상 정의 (녹색 계열)
    '투수 교체': '#4ade80',
    '투수교체': '#4ade80',
    '타자 교체': '#4ade80',
    '타자교체': '#4ade80',
    대수비: '#4ade80',
    대타: '#4ade80',
    대주자: '#4ade80',
  };

  const parts: Array<{ text: string; color?: string; key: string }> = [];
  let lastIndex = 0;
  text.replace(pattern, (match, _p1, offset) => {
    // 공백 제거하여 키 매칭
    const key = match.replace(/\s+/g, ' ').trim(); // 정규화 (공백 하나로)
    const normalizedKey = match.replace(/\s+/g, ''); // 맵 매칭용 (공백 제거)
    
    // colorMap에서 키를 찾을 때 공백 있는 버전과 없는 버전 모두 시도
    const color = colorMap[key] || colorMap[normalizedKey];

    if (lastIndex < offset) {
      parts.push({ text: text.slice(lastIndex, offset), key: `${lastIndex}-${offset}` });
    }
    parts.push({ text: match, color: color, key: `${offset}-${offset + match.length}` });
    lastIndex = offset + match.length;
    return match;
  });
  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), key: `${lastIndex}-${text.length}` });
  }
  return parts;
}

type PlayerStat = BatterStatLine;

type PitcherStatExt = PitcherStatLine;

function ensurePlayerStat(name: string, pos?: string): PlayerStat {
  return {
    name,
    pos,
    order: null,
    pa: 0,
    ab: 0,
    h: 0,
    singles: 0,
    doubles: 0,
    triples: 0,
    hr: 0,
    bb: 0,
    ci: 0,
    fc: 0,
    hbp: 0,
    so: 0,
    sac: 0,
  };
}

function ensurePitcherStat(name: string, pos?: string): PitcherStatExt {
  return {
    name,
    pos,
    bf: 0,
    pitches: 0,
    strikes: 0,
    balls: 0,
    outs: 0,
    h: 0,
    hr: 0,
    bb: 0,
    hbp: 0,
    so: 0,
  };
}

// [수정] buildPlayerStats: ScorekeeperPage.tsx의 로직을 그대로 이식
// 투수/타자 구분 로직, 고유 이름(uniqueName)을 Key로 사용하는 로직 적용
function buildPlayerStats(record: ReturnType<typeof buildGameRecord>) {
  // 1. Roster Map의 Value 타입 확장 및 데이터 저장
  // { pos?: string; order: number; substitutionType?: string; isElite?: boolean } 형태로 저장
  const rosterHome = new Map<string, { pos?: string; order: number; substitutionType?: string; isElite?: boolean }>();
  const rosterAway = new Map<string, { pos?: string; order: number; substitutionType?: string; isElite?: boolean }>();

  // [수정] substitutionType, isElite 저장 추가
  record.lineups.home.forEach((p, idx) => rosterHome.set(getUniqueName(p.name, p.number), { pos: p.pos, order: idx, substitutionType: p.substitutionType, isElite: p.isElite }));
  record.lineups.away.forEach((p, idx) => rosterAway.set(getUniqueName(p.name, p.number), { pos: p.pos, order: idx, substitutionType: p.substitutionType, isElite: p.isElite }));

  const benchMetaHome = new Map<string, { pos?: string; order: number; substitutionType?: string; isElite?: boolean }>();
  const benchMetaAway = new Map<string, { pos?: string; order: number; substitutionType?: string; isElite?: boolean }>();
  // [수정] substitutionType, isElite 저장 추가
  record.benches.home.forEach((p, idx) => benchMetaHome.set(getUniqueName(p.name, p.number), { pos: p.pos, order: 100 + idx, substitutionType: p.substitutionType, isElite: p.isElite }));
  record.benches.away.forEach((p, idx) => benchMetaAway.set(getUniqueName(p.name, p.number), { pos: p.pos, order: 100 + idx, substitutionType: p.substitutionType, isElite: p.isElite }));

  const extraOrder: Record<'home' | 'away', number> = { home: 100, away: 100 };
  const battingOrders: Record<'home' | 'away', Map<number, string[]>> = { home: new Map(), away: new Map() };

  const seedBattingOrders = (side: 'home' | 'away') => {
    // 투수 타석 허용 (상위 9명)
    const batting = record.lineups[side].slice(0, 9);
    batting.forEach((slot, idx) => battingOrders[side].set(idx + 1, [getUniqueName(slot.name, slot.number)]));
  };
  seedBattingOrders('home');
  seedBattingOrders('away');

  const addRemovedOrders = (side: 'home' | 'away') => {
    // [수정] 교체된 순서대로 정렬하기 위해 removed 배열을 역순으로 순회
    [...(record.removed?.[side] ?? [])].reverse().forEach((p) => {
      const ord = typeof p.order === 'number' && p.order > 0 ? p.order : null;
      if (!ord) return;
      const list = battingOrders[side].get(ord) ?? [];
      const uniqueName = getUniqueName(p.name, p.number);
      if (!list.includes(uniqueName)) {
        list.unshift(uniqueName);
      }
      battingOrders[side].set(ord, list);
    });
  };
  addRemovedOrders('home');
  addRemovedOrders('away');

  const statsHome = new Map<string, PlayerStat>();
  const statsAway = new Map<string, PlayerStat>();
  const pitchHome = new Map<string, PitcherStatExt>();
  const pitchAway = new Map<string, PitcherStatExt>();
  const pitcherAppearance: Record<'home' | 'away', Map<string, number>> = { home: new Map(), away: new Map() };
  const nextAppearance: Record<'home' | 'away', number> = { home: 0, away: 0 };

  const ensureRosterEntry = (side: 'home' | 'away', name: string) => {
    const roster = side === 'home' ? rosterHome : rosterAway;
    if (roster.has(name)) return roster.get(name)!;
    const benchMeta = side === 'home' ? benchMetaHome : benchMetaAway;
    const meta = benchMeta.get(name);
    // [수정] substitutionType, isElite 전달
    const entry = { pos: meta?.pos, order: meta?.order ?? extraOrder[side], substitutionType: meta?.substitutionType, isElite: meta?.isElite };
    extraOrder[side] += 1;
    roster.set(name, entry);
    return entry;
  };

  const addStat = (side: 'home' | 'away', name: string) => {
    ensureRosterEntry(side, name);
    const store = side === 'home' ? statsHome : statsAway;
    const roster = side === 'home' ? rosterHome : rosterAway;
    const pos = roster.get(name)?.pos;
    if (!store.has(name)) {
      store.set(name, ensurePlayerStat(name, pos));
    }
    return store.get(name)!;
  };

  const addPitch = (side: 'home' | 'away', name: string) => {
    ensureRosterEntry(side, name);
    if (!pitcherAppearance[side].has(name)) {
      pitcherAppearance[side].set(name, nextAppearance[side]);
      nextAppearance[side] += 1;
    }
    const store = side === 'home' ? pitchHome : pitchAway;
    const roster = side === 'home' ? rosterHome : rosterAway;
    const pos = roster.get(name)?.pos;
    if (!store.has(name)) {
      store.set(name, ensurePitcherStat(name, pos));
    }
    return store.get(name)!;
  };

  // Feed is already in chronological order (oldest → newest) per pushFeed implementation
  const chronological = record.feed;
  const currentPitcher: Record<'home' | 'away', string | null> = { home: null, away: null };
  const cleanName = (raw: string) => raw.replace(/투수/g, '').replace(/·/g, '').trim();

  // [추가] 투수 이름 해석 헬퍼
  const resolvePitcherName = (rawName: string, side: 'home' | 'away' | null) => {
    const checkSides = side ? [side] : ['home', 'away'];
    for (const s of checkSides as ('home' | 'away')[]) {
        const roster = s === 'home' ? rosterHome : rosterAway;
        if (roster.has(rawName)) return rawName;
        for (const key of roster.keys()) {
            if (key.startsWith(rawName + '(')) return key;
        }
    }
    return rawName;
  };

  const inferPitcherSide = (name: string): 'home' | 'away' | null => {
    if (rosterHome.has(name) || benchMetaHome.has(name)) return 'home';
    if (rosterAway.has(name) || benchMetaAway.has(name)) return 'away';
    for (const key of rosterHome.keys()) if (key.startsWith(name + '(')) return 'home';
    for (const key of rosterAway.keys()) if (key.startsWith(name + '(')) return 'away';
    return null;
  };

  // [수정] 투수 등판 순서 문제 해결을 위해 두 패스로 분리
  // 첫 번째 패스: 투수 관련 로그만 먼저 처리하여 등판 순서 확립
  chronological.forEach((entry) => {
    const offenseSide: 'home' | 'away' = entry.half === 'top' ? 'away' : 'home';
    const defenseSide: 'home' | 'away' = offenseSide === 'home' ? 'away' : 'home';
    const result = entry.result.trim();

    if (result.includes('투수 교체')) {
      const incoming = result.split('→')[1];
      if (incoming) {
        let cleaned = cleanName(incoming);
        const inferred = inferPitcherSide(cleaned) ?? defenseSide;
        cleaned = resolvePitcherName(cleaned, inferred);
        currentPitcher[inferred] = cleaned;
        addPitch(inferred, cleaned);
      }
    } else if (result.includes('투수 (선발)') || (result.includes('투수 (') && result.includes('차 계투)'))) {
      // 자동 생성된 투수 등판 항목: "홍길동(18) 투수 (선발)" 또는 "홍길동(18) 투수 (1차 계투)"
      let cleaned = cleanName(result.split('투수')[0]);
      const inferred = inferPitcherSide(cleaned) ?? defenseSide;
      cleaned = resolvePitcherName(cleaned, inferred);

      currentPitcher[inferred] = cleaned;
      addPitch(inferred, cleaned);
    }
  });

  // 두 번째 패스: 타석 결과 처리 (투수 등판 순서가 이미 확립된 상태)
  // currentPitcher 초기화하여 피드 순서대로 다시 추적
  currentPitcher.home = null;
  currentPitcher.away = null;

  chronological.forEach((entry) => {
    const offenseSide: 'home' | 'away' = entry.half === 'top' ? 'away' : 'home';
    const defenseSide: 'home' | 'away' = offenseSide === 'home' ? 'away' : 'home';
    const result = entry.result.trim();
    const orderNum = typeof entry.order === 'number' && entry.order > 0 ? entry.order : null;

    // 투수 관련 로그에서 currentPitcher 업데이트 (등판 순서는 첫 번째 패스에서 이미 처리됨)
    if (result.includes('투수 교체')) {
      const incoming = result.split('→')[1];
      if (incoming) {
        let cleaned = cleanName(incoming);
        const inferred = inferPitcherSide(cleaned) ?? defenseSide;
        cleaned = resolvePitcherName(cleaned, inferred);
        currentPitcher[inferred] = cleaned;
      }
    } else if (result.includes('투수 (선발)') || (result.includes('투수 (') && result.includes('차 계투)'))) {
      let cleaned = cleanName(result.split('투수')[0]);
      const inferred = inferPitcherSide(cleaned) ?? defenseSide;
      cleaned = resolvePitcherName(cleaned, inferred);
      currentPitcher[inferred] = cleaned;
    }

    let name = entry.batter?.trim();
    if (!name) return;
    const side = offenseSide;
    const roster = side === 'home' ? rosterHome : rosterAway;

    // 이름 매핑 (고유 이름 찾기)
    if (!roster.has(name)) {
      if (orderNum) {
        const candidates = battingOrders[side].get(orderNum);
        const match = candidates?.find(uName => uName.startsWith(`${name}(`) || uName === name);
        if (match) name = match;
      }
      if (!roster.has(name)) {
         for (const key of roster.keys()) {
           if (key.startsWith(`${name}(`)) {
             name = key;
             break;
           }
         }
      }
    }
    
    ensureRosterEntry(side, name);
    if (orderNum) {
      const list = battingOrders[side].get(orderNum) ?? [];
      if (!list.includes(name)) {
        list.push(name);
      }
      battingOrders[side].set(orderNum, list);
    }

    const pitchSide = side === 'home' ? 'away' : 'home';
    
    // 투수 찾기 (fallback 로직 포함)
    let pitcherName = currentPitcher[pitchSide];
    if (!pitcherName) {
      const roster = pitchSide === 'home' ? rosterHome : rosterAway;
      for (const [pName, info] of roster.entries()) {
        if (info.pos && info.pos.toUpperCase() === 'P') {
          pitcherName = pName;
          currentPitcher[pitchSide] = pName; 
          break;
        }
      }
    }

    const pitcherStat = pitcherName ? addPitch(pitchSide, pitcherName) : null;
    const pitchInfo = classifyPitch(result);
    if (pitcherStat && pitchInfo.pitch) {
      pitcherStat.pitches += 1;
      if (pitchInfo.strike) pitcherStat.strikes += 1;
      if (pitchInfo.ball) pitcherStat.balls += 1;
    }
    const kind = classifyResult(result);
    if (!kind) return;
    const stat = addStat(side, name);
    switch (kind) {
      case 'single':
        stat.pa += 1; stat.ab += 1; stat.h += 1; stat.singles += 1;
        if (pitcherStat) { pitcherStat.bf += 1; pitcherStat.h += 1; }
        break;
      case 'double':
        stat.pa += 1; stat.ab += 1; stat.h += 1; stat.doubles += 1;
        if (pitcherStat) { pitcherStat.bf += 1; pitcherStat.h += 1; }
        break;
      case 'triple':
        stat.pa += 1; stat.ab += 1; stat.h += 1; stat.triples += 1;
        if (pitcherStat) { pitcherStat.bf += 1; pitcherStat.h += 1; }
        break;
      case 'hr':
        stat.pa += 1; stat.ab += 1; stat.h += 1; stat.hr += 1;
        if (pitcherStat) { pitcherStat.bf += 1; pitcherStat.h += 1; pitcherStat.hr += 1; }
        break;
      case 'bb':
        stat.pa += 1; stat.bb += 1;
        if (pitcherStat) { pitcherStat.bf += 1; pitcherStat.bb += 1; }
        break;
      case 'ci':
        stat.pa += 1; stat.ci += 1;
        if (pitcherStat) { pitcherStat.bf += 1; }
        break;
      case 'fc':
        stat.pa += 1; stat.ab += 1; stat.fc += 1;
        if (pitcherStat) { pitcherStat.bf += 1; }
        break;
      case 'hbp':
        stat.pa += 1; stat.hbp += 1;
        if (pitcherStat) { pitcherStat.bf += 1; pitcherStat.hbp += 1; }
        break;
      case 'so':
        stat.pa += 1; stat.ab += 1; stat.so += 1;
        if (pitcherStat) { pitcherStat.bf += 1; pitcherStat.outs += 1; pitcherStat.so += 1; }
        break;
      case 'so_reach':
        stat.pa += 1; stat.ab += 1; stat.so += 1;
        if (pitcherStat) { pitcherStat.bf += 1; pitcherStat.so += 1; }
        break;
      case 'out':
        stat.pa += 1; stat.ab += 1;
        if (pitcherStat) { pitcherStat.bf += 1; pitcherStat.outs += 1; }
        break;
      case 'sac':
        stat.pa += 1; stat.sac += 1;
        if (pitcherStat) { pitcherStat.bf += 1; pitcherStat.outs += 1; }
        break;
    }
  });

  const toArray = (side: 'home' | 'away', roster: Map<string, { pos?: string; order: number; substitutionType?: string }>, store: Map<string, PlayerStat>) => {
    const rows: PlayerStat[] = [];
    const orderMap = battingOrders[side];
    const orderKeys = [...orderMap.keys()].sort((a, b) => a - b);
    orderKeys.forEach((order) => {
      const players = orderMap.get(order) ?? [];
      players.forEach((playerName, idx) => {
        const meta = roster.get(playerName);
        const stat = store.get(playerName);
        const base = ensurePlayerStat(playerName, meta?.pos);
        const row = stat ? { ...base, ...stat, pos: stat.pos ?? base.pos } : base;
        
        // [수정] status 결정 로직: 교체 아웃된 경우 'out', 아니면 교체 유형(대타/대주자 등) 표시
        let status: 'out' | '대타' | '대주자' | '대수비' | undefined = undefined;
        if (idx < players.length - 1) {
          status = 'out';
        } else if (meta?.substitutionType) {
          // as casting을 통해 타입 호환성 확보
          status = meta.substitutionType as 'out' | '대타' | '대주자' | '대수비';
        }

        rows.push({ ...row, order, status });
      });
    });
    const remaining = [...store.values()].filter(
      (s) =>
        !rows.some((r) => r.name === s.name) &&
        ![...orderMap.values()].some((list) => list.includes(s.name)),
    );
    remaining.forEach((stat) => rows.push({ ...stat, order: null }));
    return rows;
  };

  const toPitcherArray = (
    roster: Map<string, { pos?: string; order: number }>,
    store: Map<string, PitcherStatExt>,
    appearance: Map<string, number>,
  ) => {
    const names = new Set<string>();
    roster.forEach((meta, name) => {
      if ((meta.pos ?? '').toUpperCase() === 'P') names.add(name);
    });
    store.forEach((_stat, name) => names.add(name));

    const combined = [...names].map((name) => {
      const meta = roster.get(name);
      const base = ensurePitcherStat(name, meta?.pos);
      const stat = store.get(name);
      const appearanceOrder = appearance.get(name);
      return {
        ...(stat ? { ...base, ...stat, pos: stat.pos ?? base.pos } : base),
        appearanceOrder,
        appearanceLabel:
          appearanceOrder === 0
            ? '선발'
            : Number.isFinite(appearanceOrder)
              ? `계투(${appearanceOrder})`
              : undefined,
      };
    });

    const norm = (n: number | null | undefined) => (Number.isFinite(n) ? (n as number) : Number.MAX_SAFE_INTEGER);
    combined.sort((a, b) => norm(a.appearanceOrder) - norm(b.appearanceOrder) || a.name.localeCompare(b.name, 'ko-KR'));
    return combined;
  };

  return {
    hitters: {
      home: toArray('home', rosterHome, statsHome),
      away: toArray('away', rosterAway, statsAway),
    },
    pitchers: {
      home: toPitcherArray(rosterHome, pitchHome, pitcherAppearance.home),
      away: toPitcherArray(rosterAway, pitchAway, pitcherAppearance.away),
    },
  };
}

type PostGameSummary = {
  totals: { home: { runs: number; hits: number; bb: number; so: number }; away: { runs: number; hits: number; bb: number; so: number } };
  topHitters: { side: 'home' | 'away'; name: string; h: number; hr: number; bb: number }[];
  topPitchers: { side: 'home' | 'away'; name: string; so: number; outs: number; h: number; bb: number }[];
};

function buildPostGameSummary(
  hitters: { home: BatterStatLine[]; away: BatterStatLine[] },
  pitchers: { home: PitcherStatLine[]; away: PitcherStatLine[] },
  score: { home: number; away: number },
): PostGameSummary {
  const sum = (list: BatterStatLine[], key: keyof BatterStatLine) => list.reduce((acc, cur) => acc + ((cur[key] as number) || 0), 0);
  const totals = {
    home: { runs: score.home, hits: sum(hitters.home, 'h'), bb: sum(hitters.home, 'bb'), so: sum(hitters.home, 'so') },
    away: { runs: score.away, hits: sum(hitters.away, 'h'), bb: sum(hitters.away, 'bb'), so: sum(hitters.away, 'so') },
  };
  const rankHitters = (side: 'home' | 'away') =>
    [...hitters[side]]
      .filter((h) => h.pa > 0)
      .sort((a, b) => b.h - a.h || b.bb - a.bb || b.pa - a.pa || a.name.localeCompare(b.name))
      .slice(0, 3)
      .map((h) => ({ side, name: h.name, h: h.h, hr: h.hr, bb: h.bb }));
  const rankPitchers = (side: 'home' | 'away') =>
    [...pitchers[side]]
      .filter((p) => p.bf > 0 || p.outs > 0)
      .sort((a, b) => b.so - a.so || b.outs - a.outs || a.h - b.h || a.name.localeCompare(b.name))
      .slice(0, 2)
      .map((p) => ({ side, name: p.name, so: p.so, outs: p.outs, h: p.h, bb: p.bb }));

  return {
    totals,
    topHitters: [...rankHitters('home'), ...rankHitters('away')],
    topPitchers: [...rankPitchers('home'), ...rankPitchers('away')],
  };
}

function PostGameSummary({ summary }: { summary: PostGameSummary }) {
  const pill = (label: string, value: string, color: string) => (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '8px 10px',
        borderRadius: '12px',
        background: 'rgba(255,255,255,0.03)',
        border: `1px solid ${color}55`,
        color,
        fontWeight: 800,
        fontSize: '12px',
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: '999px', background: color }} />
      {label}: {value}
    </span>
  );

  const renderLeaders = (title: string, items: PostGameSummary['topHitters'] | PostGameSummary['topPitchers']) => (
    <div
      style={{
        border: '1px solid rgba(148,163,184,0.25)',
        borderRadius: 12,
        padding: 12,
        background: 'rgba(255,255,255,0.02)',
        display: 'grid',
        gap: 8,
      }}
    >
      <span style={{ fontWeight: 800, color: '#e2e8f0', fontSize: 14 }}>{title}</span>
      {items.length ? (
        items.map((item) => (
          <div
            key={`${title}-${item.side}-${item.name}`}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              color: '#cbd5e1',
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '999px',
                  background: item.side === 'home' ? '#f97316' : '#60a5fa',
                }}
              />
              {item.name}
            </span>
            {'hr' in item ? (
              <span>H {item.h} · HR {item.hr} · BB {item.bb}</span>
            ) : (
              <span>SO {item.so} · Outs {item.outs} · H {item.h} · BB {item.bb}</span>
            )}
          </div>
        ))
      ) : (
        <span style={{ color: '#94a3b8', fontSize: 12 }}>기록이 없습니다.</span>
      )}
    </div>
  );

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {pill('홈 득점', String(summary.totals.home.runs), '#f97316')}
          {pill('홈 안타', String(summary.totals.home.hits), '#f97316')}
          {pill('원정 득점', String(summary.totals.away.runs), '#60a5fa')}
          {pill('원정 안타', String(summary.totals.away.hits), '#60a5fa')}
        </div>
        <div style={{ color: '#94a3b8', fontSize: 12 }}>
          경기 종료 후 상세보기 · 문자중계 기록은 좌측 “문자 중계” 탭으로 이동
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
        {renderLeaders('타자 TOP3 (양 팀)', summary.topHitters)}
        {renderLeaders('투수 TOP2 (양 팀)', summary.topPitchers)}
      </div>
    </div>
  );
}

// ---------- Post-game detail UI (add near file bottom) -------------------

type PostGameDetailData = NonNullable<MatchSchedule['postGame']>;

function PostGameDetailSection({ detail, teams }: { detail: PostGameDetailData; teams: { home: string; away: string } }) {
  return (
    <div style={{ display: 'grid', gap: 12, overflow: 'auto', paddingRight: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontWeight: 900, fontSize: 18 }}>경기 종료 · 상세 기록</span>
          <span style={{ color: '#94a3b8', fontSize: 12 }}>문자중계 대신 박스스코어를 표시합니다.</span>
        </div>
        {detail.note && <span style={{ color: '#94a3b8', fontSize: 12 }}>{detail.note}</span>}
      </div>

      <LineScoreTable teams={teams} lineScore={detail.lineScore} totals={detail.totals} />

      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        <TeamTotalsCard title={`${teams.home} 타격 요약`} totals={detail.teamBatterSummary?.home} color="#f97316" />
        <TeamTotalsCard title={`${teams.away} 타격 요약`} totals={detail.teamBatterSummary?.away} color="#60a5fa" />
      </div>

      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        <PitchingTable title={`${teams.home} 투수`} color="#f97316" pitchers={detail.pitchers?.home ?? []} />
        <PitchingTable title={`${teams.away} 투수`} color="#60a5fa" pitchers={detail.pitchers?.away ?? []} />
      </div>
    </div>
  );
}

function LineScoreTable({
  teams,
  lineScore,
  totals,
}: {
  teams: { home: string; away: string };
  lineScore: { innings: number[]; home: number[]; away: number[] };
  totals: { home: { runs: number; hits: number; errors: number; lob?: number }; away: { runs: number; hits: number; errors: number; lob?: number } };
}) {
  type LineScoreCell = { text: string; bold?: boolean; color?: string };
  const makeCell = (text: string, opts: Partial<LineScoreCell> = {}): LineScoreCell => ({ text, ...opts });

  const header: LineScoreCell[] = ['팀', ...lineScore.innings, 'R', 'H', 'E', 'LOB'].map((h) => makeCell(String(h), { bold: true }));
  const row = (label: string, scores: number[], t: { runs: number; hits: number; errors: number; lob?: number }, color: string): LineScoreCell[] => [
    makeCell(label, { bold: true, color }),
    ...scores.map((n) => makeCell(String(n))),
    makeCell(String(t.runs), { bold: true }),
    makeCell(String(t.hits)),
    makeCell(String(t.errors)),
    makeCell(t.lob != null ? String(t.lob) : '-'),
  ];
  const rows: LineScoreCell[][] = [
    row(teams.home, lineScore.home, totals.home, '#f97316'),
    row(teams.away, lineScore.away, totals.away, '#60a5fa'),
  ];
  return (
    <div style={{ border: '1px solid rgba(148,163,184,0.25)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${header.length}, minmax(0, 1fr))`, background: 'rgba(255,255,255,0.04)' }}>
        {header.map((h, idx) => (
          <div key={`${h.text}-${idx}`} style={{ padding: '8px', textAlign: 'center', fontWeight: 800, color: '#e2e8f0', fontSize: 12 }}>
            {h.text}
          </div>
        ))}
      </div>
      {rows.map((r, idx) => (
        <div
          key={idx}
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${header.length}, minmax(0, 1fr))`,
            borderTop: '1px solid rgba(148,163,184,0.2)',
          }}
        >
          {r.map((cell, ci) => (
            <div
              key={ci}
              style={{
                padding: '8px',
                textAlign: 'center',
                color: cell.color ?? '#cbd5e1',
                fontWeight: cell.bold ? 800 : 700,
                fontSize: 12,
              }}
            >
              {cell.text}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function TeamTotalsCard({
  title,
  totals,
  color,
}: {
  title: string;
  totals?: { ab?: number; h?: number; rbi?: number; r?: number; sb?: number };
  color: string;
}) {
  const items = [
    { label: '타수', value: totals?.ab },
    { label: '안타', value: totals?.h },
    { label: '득점', value: totals?.r },
    { label: '타점', value: totals?.rbi },
    { label: '도루', value: totals?.sb },
  ].filter((i) => i.value != null);
  return (
    <div
      style={{
        border: '1px solid rgba(148,163,184,0.25)',
        borderRadius: 12,
        padding: 12,
        background: 'rgba(255,255,255,0.02)',
        display: 'grid',
        gap: 6,
      }}
    >
      <span style={{ fontWeight: 800, color: '#e2e8f0' }}>{title}</span>
      {items.length ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {items.map((item) => (
            <span
              key={item.label}
              style={{
                padding: '6px 10px',
                borderRadius: 10,
                background: 'rgba(255,255,255,0.04)',
                border: `1px solid ${color}55`,
                color,
                fontWeight: 800,
                fontSize: 12,
              }}
            >
              {item.label}: {item.value}
            </span>
          ))}
        </div>
      ) : (
        <span style={{ color: '#94a3b8', fontSize: 12 }}>요약 정보가 없습니다.</span>
      )}
    </div>
  );
}

function PitchingTable({
  title,
  pitchers,
  color,
}: {
  title: string;
  pitchers: {
    name: string;
    ip?: number;
    bf?: number;
    ab?: number;
    h?: number;
    hr?: number;
    bb?: number;
    hbp?: number;
    so?: number;
    r?: number;
    er?: number;
    pitches?: number;
  }[];
  color: string;
}) {
  const header = ['투수', 'IP', 'BF', 'H', 'HR', 'BB', 'HBP', 'SO', 'R', 'ER', 'NP'];
  return (
    <div
      style={{
        border: '1px solid rgba(148,163,184,0.25)',
        borderRadius: 12,
        padding: 10,
        background: 'rgba(255,255,255,0.02)',
        overflow: 'auto',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontWeight: 800, color: '#e2e8f0' }}>{title}</span>
        <span style={{ color: '#94a3b8', fontSize: 12 }}>{pitchers.length}명</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${header.length}, minmax(60px, 1fr))`, gap: 4 }}>
        {header.map((h) => (
          <div key={h} style={{ padding: '6px', textAlign: 'center', fontWeight: 800, fontSize: 12, color: '#cbd5e1' }}>
            {h}
          </div>
        ))}
        {pitchers.map((p) =>
          [p.name, p.ip, p.bf, p.h, p.hr, p.bb, p.hbp, p.so, p.r, p.er, p.pitches].map((v, idx) => (
            <div
              key={`${p.name}-${idx}`}
              style={{
                padding: '6px',
                textAlign: 'center',
                fontWeight: idx === 0 ? 800 : 700,
                color: idx === 0 ? color : '#e2e8f0',
                fontSize: 12,
              }}
            >
              {v != null ? v : '-'}
            </div>
          )),
        )}
      </div>
    </div>
  );
}
// --------------------------------------------------------------------------------------
// [추가] CSV 다운로드 및 생성 관련 헬퍼 함수들 (ScorekeeperPage.tsx에서 이식)
// --------------------------------------------------------------------------------------

function downloadCsv(content: string, filenamePrefix: string) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filenamePrefix}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function buildDownloadName(prefix: string, endedAt?: string | null) {
  const stamp = (endedAt ? new Date(endedAt) : new Date()).toISOString().replace(/[:.]/g, '-');
  return `${prefix}-${stamp}`;
}

function escapeCsvCell(value: unknown) {
  if (value === null || value === undefined) return '""';
  const str = String(value);
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
}

function formatDateTimeLabel(value: string | null) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString('ko-KR');
  } catch {
    return value;
  }
}

function defensePositionNumber(pos: string) {
  const normalized = pos.trim().toUpperCase();
  const map: Record<string, string> = {
    P: '1', C: '2', '1B': '3', '2B': '4', '3B': '5', SS: '6', 'S/S': '6',
    LF: '7', CF: '8', RF: '9', DH: 'D', D: 'D', PH: 'PH', PR: 'PR',
  };
  return map[normalized] || normalized || '-';
}

function formatBattedBallDetails(details?: BattedBallDetails | null) {
  if (!details) return '-';
  const parts = [details.type, details.zone].filter((part) => part && part !== '선택 안 함');
  return parts.length ? parts.join(' / ') : '-';
}

function formatRunnerNotes(runners: string[]) {
  if (!runners?.length) return '';
  const notes = runners
    .map((r) => {
      const withoutName = r.includes('·') ? r.split('·')[0] : r;
      return withoutName.replace(/\s+/g, ' ').trim();
    })
    .filter(Boolean);
  return notes.join(' | ');
}

function formatErrorSummary(error?: ErrorDetails | string | null) {
  if (!error) return '-';
  if (typeof error === 'string') return error;
  const context = error.context ? ` · ${error.context}` : '';
  return `${error.errorType} · ${error.fielderPos}${context}`;
}

function formatErrorField(error: ErrorDetails | string | null | undefined, field: Exclude<keyof ErrorDetails, 'advanceResults'>) {
  if (!error || typeof error === 'string') return '-';
  return error[field] || '-';
}

function baseLabel(idx: number) {
  return idx === 0 ? '1루' : idx === 1 ? '2루' : idx === 2 ? '3루' : '홈';
}

function formatRunnerOutcomeLabel(outcome: RunnerAdvanceOutcome) {
  if (outcome === 'advance') return '진루';
  if (outcome === 'score') return '득점';
  if (outcome === 'out') return '아웃';
  if (typeof outcome === 'number') {
    return outcome >= 4 ? '홈(득점)' : `${outcome}루`;
  }
  return '유지';
}

function formatErrorAdvanceResults(error?: ErrorDetails | string | null) {
  if (!error || typeof error === 'string') return '-';
  const parts: string[] = [];
  if (error.advanceResults.batter === 'out') {
    parts.push('타자:아웃');
  } else if (error.advanceResults.batter === 'hold') {
    parts.push('타자:유지');
  } else {
    const batterBase = error.advanceResults.batter;
    if (typeof batterBase === 'number') {
      parts.push(`타자:${batterBase >= 4 ? '홈(득점)' : `${batterBase}루`}`);
    }
  }
  Object.entries(error.advanceResults.runners).forEach(([base, outcome]) => {
    if (!outcome) return;
    const label = `${baseLabel(Number(base))}:${formatRunnerOutcomeLabel(outcome)}`;
    parts.push(label);
  });
  return parts.length ? parts.join(' / ') : '-';
}

function stripBatterFromNote(note: string, batter?: string) {
  const cleaned = (note || '').replace(/\s+/g, ' ').trim();
  if (!batter) return cleaned;
  const escaped = batter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`\\s*·?\\s*${escaped}\\s*`, 'g');
  const removed = cleaned.replace(regex, '').trim();
  return removed || cleaned;
}

function classifyKboResult(event: PlayEvent) {
  const normalized = (event.notes || event.type || '').replace(/\s+/g, '');
  if (normalized.includes('홈런')) return 'HR';
  if (normalized.includes('3루타')) return '3B';
  if (normalized.includes('2루타')) return '2B';
  if (normalized.includes('1루타')) return '1B';
  if (event.type === 'fc' || normalized.includes('야수선택') || normalized.toUpperCase().includes('F.C')) return 'FC';
  if (normalized.includes('타격방해')) return 'CI';
  if (normalized.includes('고의') || normalized.toUpperCase().includes('IB')) return 'IB';
  if (event.type === 'walk' || normalized.includes('볼넷') || normalized.includes('4구')) return 'B';
  if (event.type === 'hbp' || normalized.includes('몸에맞는공')) return 'HP';
  if (event.type === 'sac' || normalized.includes('희생')) return 'SAC';
  if (event.type === 'error' || normalized.includes('실책')) return 'E';
  if (normalized.includes('병살')) return 'GDP';
  if (normalized.includes('삼진')) return 'K';
  if (event.type === 'steal') return 'SB';
  if (event.type === 'steal_fail') return 'CS';
  if (event.type === 'runner_out') return 'RUN OUT';
  if (event.type === 'runner') return 'RUN';
  if (normalized.includes('아웃') || event.type === 'out') return 'OUT';
  return event.type.toUpperCase();
}

function formatScorebookCell(event: PlayEvent) {
  const result = classifyKboResult(event);
  const batted = event.battedBall ? formatBattedBallDetails(event.battedBall) : '';
  const runnerNote = formatRunnerNotes(event.runners);
  const errorNote = formatErrorSummary(event.error);
  const baseNote = stripBatterFromNote(event.notes ?? '', event.batter);
  const parts = [result];
  if (batted && batted !== '-') parts.push(`타구:${batted}`);
  if (runnerNote) parts.push(`주루:${runnerNote}`);
  if (errorNote && errorNote !== '-') parts.push(`E:${errorNote}`);
  if (baseNote && !baseNote.replace(/\s+/g, '').includes(result.replace(/\s+/g, ''))) {
    parts.push(`비고:${baseNote}`);
  }
  return parts.filter(Boolean).join(' / ');
}

// [핵심] CSV 빌더 함수
function buildCsvRecord(record: ReturnType<typeof buildGameRecord>) {
  const lines: string[] = [];
  const add = (...cells: (string | number | boolean | null | undefined)[]) => {
    lines.push(cells.map((cell) => escapeCsvCell(cell)).join(','));
  };
  const addBlank = () => lines.push('');
  const halfLabel = (half: 'top' | 'bottom') => (half === 'top' ? '초' : '말');
  const innings = Array.from({ length: 9 }, (_, idx) => idx + 1);
  const playerDirectory: Record<
    'home' | 'away',
    Map<string, { number: string; pos: string; posNumber: string; throws: string; bats: string }>
  > = {
    home: new Map(),
    away: new Map(),
  };

  const seedDirectory = (side: 'home' | 'away', slots: typeof record.lineups.home) => {
    slots.forEach((slot) => {
      if (!slot.name) return;
      const uniqueName = getUniqueName(slot.name, slot.number);
      playerDirectory[side].set(uniqueName, {
        number: slot.number || '-',
        pos: slot.pos || '-',
        posNumber: defensePositionNumber(slot.pos || '-'),
        throws: slot.throws || '-',
        bats: slot.bats || '-',
      });
    });
  };
  seedDirectory('home', record.lineups.home);
  seedDirectory('away', record.lineups.away);
  seedDirectory('home', record.benches.home);
  seedDirectory('away', record.benches.away);
  seedDirectory('home', record.removed.home);
  seedDirectory('away', record.removed.away);

  const getPlayerMeta = (side: 'home' | 'away', uniqueName: string) =>
    playerDirectory[side].get(uniqueName) ?? { number: '-', pos: '-', posNumber: '-', throws: '-', bats: '-' };

  add('게임 정보');
  add('항목', '값');
  add('홈 팀', record.meta.homeTeamName || record.meta.homeTeamId);
  add('원정 팀', record.meta.awayTeamName || record.meta.awayTeamId);
  add('최종 점수', `${record.meta.homeTeamName} ${record.score.home} - ${record.meta.awayTeamName} ${record.score.away}`);
  add('이닝', `${record.meta.inning}회 ${halfLabel(record.meta.half)}`);
  add('종료 여부', record.meta.gameOver ? '예' : '아니오');
  add('종료 시각', record.meta.endedAt ? formatDateTimeLabel(record.meta.endedAt) : '-');
  add('최종 볼카운트', `B${record.counts.balls} / S${record.counts.strikes} / O${record.counts.outs}`);
  add('기록원', record.meta.scorerName || record.meta.scorerEmail || record.meta.scorerUid || '-');
  add('기록원 이메일', record.meta.scorerEmail || '-');
  add('기록원 권한', record.meta.scorerRole || '-');
  add('기록 기준', 'KBO 기록지 기입법 기준');
  add('주자 상황', record.bases.map((runner, idx) => `${idx + 1}루:${runner ?? '-'}`).join(' | '));

  const writeLineup = (side: 'home' | 'away', label: string) => {
    addBlank();
    add(`라인업 - ${label} (KBO 표준: 등번호·수비번호)`);
    add('타순', '등번호', '선수', '수비번호', '포지션', '투', '타');
    const batting = record.lineups[side].filter((slot) => slot.pos.toUpperCase() !== 'P');
    batting.forEach((slot, idx) => {
      const uniqueName = getUniqueName(slot.name, slot.number);
      const meta = getPlayerMeta(side, uniqueName);
      add(idx + 1, meta.number, slot.name, meta.posNumber, slot.pos, meta.throws, meta.bats);
    });
    const pitcher = record.lineups[side].find((slot) => slot.pos.toUpperCase() === 'P');
    if (pitcher) {
      const uniqueName = getUniqueName(pitcher.name, pitcher.number);
      const meta = getPlayerMeta(side, uniqueName);
      add('P', meta.number, pitcher.name, meta.posNumber, pitcher.pos, meta.throws, meta.bats);
    }
  };

  const writeBench = (side: 'home' | 'away', label: string) => {
    addBlank();
    add(`벤치 - ${label}`);
    add('등번호', '이름', '포지션', '수비번호', '투', '타');
    if (!record.benches[side].length) {
      add('-', '-', '-', '-', '-', '-');
      return;
    }
    record.benches[side].forEach((slot) => {
      const uniqueName = getUniqueName(slot.name, slot.number);
      const meta = getPlayerMeta(side, uniqueName);
      add(meta.number, slot.name, slot.pos, meta.posNumber, meta.throws, meta.bats);
    });
  };

  writeLineup('home', record.meta.homeTeamName);
  writeLineup('away', record.meta.awayTeamName);
  writeBench('home', record.meta.homeTeamName);
  writeBench('away', record.meta.awayTeamName);

  const stats = buildPlayerStats(record);
  const fmt3 = (val: number) => (Number.isFinite(val) ? val.toFixed(3).replace(/^0/, '') : '-');
  
  const writePitcherOrder = (side: 'home' | 'away', label: string) => {
    addBlank();
    add(`투수 등판 순서 - ${label}`);
    add('등판순서', '등번호', '선수', '포지션', '투', '타');
    if (!stats.pitchers[side].length) {
      add('-', '-', '-', '-', '-', '-');
      return;
    }
    stats.pitchers[side].forEach((p, idx) => {
      const meta = getPlayerMeta(side, p.name);
      const orderLabel = p.appearanceLabel || (idx === 0 ? '선발' : `계투(${idx})`);
      add(orderLabel, meta.number, p.name, p.pos ?? meta.pos, meta.throws, meta.bats);
    });
  };

  const writeHitterStats = (side: 'home' | 'away', label: string) => {
    addBlank();
    add(`실시간 타자 기록 - ${label}`);
    add('선수', '포지션', '타석', '타수', '안타', '1루타', '2루타', '3루타', '홈런', '볼넷', '타격방해', '야수선택', '사구', '삼진', '희생', '타율', '출루율');
    stats.hitters[side].forEach((s) => {
      const obpDen = s.ab + s.bb + s.hbp + s.sac + s.ci;
      const avg = s.ab > 0 ? s.h / s.ab : 0;
      const obp = obpDen > 0 ? (s.h + s.bb + s.hbp + s.ci) / obpDen : 0;
      add(
        s.name, s.pos, s.pa, s.ab, s.h, s.singles, s.doubles, s.triples, s.hr, s.bb, s.ci, s.fc, s.hbp, s.so, s.sac,
        s.ab > 0 ? fmt3(avg) : '-', obpDen > 0 ? fmt3(obp) : '-',
      );
    });
  };

  const writePitcherStats = (side: 'home' | 'away', label: string) => {
    addBlank();
    add(`실시간 투수 기록 - ${label}`);
    add('선수', '포지션', '타자상대', '투구수', '투구수(S/B)', '이닝', '피안타', '피홈런', '볼넷', '사구', '탈삼진');
    stats.pitchers[side].forEach((s) => {
      const ip = `${Math.floor(s.outs / 3)}.${s.outs % 3}`;
      add(
        s.name, s.pos, s.bf, s.pitches, `${s.pitches} (${s.strikes}/${s.balls})`, ip, s.h, s.hr, s.bb, s.hbp, s.so,
      );
    });
  };

  writeHitterStats('home', record.meta.homeTeamName);
  writeHitterStats('away', record.meta.awayTeamName);
  writePitcherStats('home', record.meta.homeTeamName);
  writePitcherStats('away', record.meta.awayTeamName);
  writePitcherOrder('home', record.meta.homeTeamName);
  writePitcherOrder('away', record.meta.awayTeamName);

  const eventsChrono = [...record.events].reverse();
  addBlank();
  add('상세 플레이 이벤트');
  if (eventsChrono.length) {
    add('이닝', '공/말', '타순', '타자', '구수', '유형', '주자 이동', '타구 유형/방향', '실책 요약', '실책 위치', '실책 유형', '실책 상황', '실책 결과', '비고');
    eventsChrono.forEach((event) => {
      add(
        event.inning, halfLabel(event.half), event.order || '-', event.batter || '-', event.pitch, event.type,
        event.runners.length ? event.runners.join(' | ') : '-',
        formatBattedBallDetails(event.battedBall),
        formatErrorSummary(event.error),
        formatErrorField(event.error, 'fielderPos'),
        formatErrorField(event.error, 'errorType'),
        formatErrorField(event.error, 'context'),
        formatErrorAdvanceResults(event.error),
        event.notes ?? '-',
      );
    });
  } else {
    add('-', '기록 없음');
  }

  const feed = [...record.feed].reverse();
  addBlank();
  add('플레이 로그');
  if (feed.length) {
    add('이닝', '공/말', '타순', '타자', '구수', '결과');
    feed.forEach((entry) => {
      add(entry.inning, halfLabel(entry.half), entry.order, entry.batter || '-', entry.pitch, entry.result);
    });
  } else {
    add('-', '기록 없음');
  }

  const scorebookEventsBySide = (side: 'home' | 'away') => {
    const targetHalf = side === 'away' ? 'top' : 'bottom';
    const notesByOrder = new Map<number, Map<number, string[]>>();
    eventsChrono
      .filter((event) => event.half === targetHalf && event.order > 0)
      .forEach((event) => {
        const inningMap = notesByOrder.get(event.order) ?? new Map<number, string[]>();
        const notes = inningMap.get(event.inning) ?? [];
        const note = formatScorebookCell(event);
        notes.push(note || '-');
        inningMap.set(event.inning, notes);
        notesByOrder.set(event.order, inningMap);
      });
    return notesByOrder;
  };

  const writeScorebook = (side: 'home' | 'away', label: string) => {
    addBlank();
    add(`${label} 팀 KBO 기록지 (타석별 기록)`);
    add('타순', '등번호', '선수', '수비번호', '포지션', ...innings.map((inning) => `${inning}회 타석(기록)`), '타석', '타수', '안타', '1루타', '2루타', '3루타', '홈런', '볼넷', '사구', '삼진', '희생');
    const hitters = record.lineups[side].filter((slot) => slot.pos.toUpperCase() !== 'P');
    while (hitters.length < 9) {
      hitters.push({ name: '-', pos: '-', number: '-', throws: 'R', bats: 'R' });
    }
    const notesByOrder = scorebookEventsBySide(side);
    const statsByName = new Map(stats.hitters[side].map((stat) => [stat.name, stat]));
    
    hitters.slice(0, 9).forEach((slot, idx) => {
      const order = idx + 1;
      const inningNotes = innings.map((inning) => {
        const notes = notesByOrder.get(order)?.get(inning);
        return notes?.length ? notes.join(' | ') : '-';
      });
      const uniqueName = getUniqueName(slot.name, slot.number);
      const stat = statsByName.get(uniqueName);
      const meta = getPlayerMeta(side, uniqueName);
      add(
        order, meta.number, slot.name || '-', meta.posNumber, slot.pos || '-',
        ...inningNotes,
        stat?.pa ?? '-', stat?.ab ?? '-', stat?.h ?? '-', stat?.singles ?? '-', stat?.doubles ?? '-', stat?.triples ?? '-', stat?.hr ?? '-', stat?.bb ?? '-', stat?.hbp ?? '-', stat?.so ?? '-', stat?.sac ?? '-',
      );
    });
  };

  writeScorebook('away', '초공');
  writeScorebook('home', '말공');

  return lines.join('\n');
}

import { useMemo, useState, useEffect, useRef } from 'react';
import ScoreboardFrame from '../components/ScoreboardFrame';
import { useDemoStore, buildGameRecord } from '../../shared/state/demoStore';
import StatsTable from '../../shared/components/StatsTable';
import RemovedPlayersPanel from '../../shared/components/RemovedPlayersPanel';
import type { BatterStatLine, PitcherStatLine } from '../../shared/types/scoreStats';
import type { MatchSchedule } from '../../shared/state/demoStore';

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
      status?: 'out';
      isSubstitute?: boolean;
    }
  | { type: 'log'; text: string; key: string; chip: string; inning: number; half: Half };

export default function ScoreboardTextPage() {
  const { state } = useDemoStore();
  const [showReplay, setShowReplay] = useState(false);
  const activeMatch = useMemo(
    () => state.matches.find((m) => m.id === state.activeMatchId) ?? null,
    [state.matches, state.activeMatchId],
  );
  const hasLiveOverlay = useMemo(() => Boolean((activeMatch?.liveVideoUrl || '').trim()), [activeMatch?.liveVideoUrl]);
  const noActiveMatch = !state.activeMatchId;
  const feed = useMemo(() => state.feed, [state.feed]);
  const hittingSide = state.half === 'top' ? 'away' : 'home';
  const defenseSide = hittingSide === 'home' ? 'away' : 'home';
  const defenseAssignments = useMemo(
    () => getDefenseAssignments(state.lineups[defenseSide] ?? []),
    [defenseSide, state.lineups],
  );
  const offenseLineup = state.lineups[hittingSide].filter((slot) => slot.pos.toUpperCase() !== 'P');
  const activeOffense = offenseLineup.length ? offenseLineup : state.lineups[hittingSide];
  const currentBatter = activeOffense[state.batterIndex[hittingSide] % (activeOffense.length || 1)]?.name ?? '타자';
  const currentPitcher = state.lineups[defenseSide].find((slot) => slot.pos.toUpperCase() === 'P')?.name ?? '투수';
  const currentInning = state.inning;

  const batterToday = useMemo(() => computeBatterLine(feed, hittingSide, currentBatter), [feed, hittingSide, currentBatter]);
  const pitcherToday = useMemo(() => computePitcherLine(feed, currentPitcher), [feed, currentPitcher]);
  const jerseyMap = useMemo(() => buildJerseyMap(state.lineups, state.benches, state.removed), [state.lineups, state.benches, state.removed]);
  const playerStats = useMemo(() => buildPlayerStats(buildGameRecord(state)), [state]);
  const postSummary = useMemo(
    () => buildPostGameSummary(playerStats.hitters, playerStats.pitchers, state.score),
    [playerStats.hitters, playerStats.pitchers, state.score],
  );
  const postGameDetail = activeMatch?.postGame ?? null;
  const displayItems = useMemo(() => buildDisplayItems(feed, jerseyMap), [feed, jerseyMap]);
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
    <div
      style={{
        display: 'grid',
        gap: 'clamp(12px, 1.6vw, 18px)',
        minHeight: '100vh',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1.2fr)',
          gap: 'clamp(16px, 2vw, 24px)',
          alignItems: 'stretch',
        }}
      >
        <div style={{ display: 'grid', alignItems: 'start', gap: '0px' }}>
          <ScoreboardFrame
            variant="text"
            showFootnote={false}
            panelStyle={{
              width: '100%',
              aspectRatio: '4 / 3',
            }}
          />
          <div style={{ marginTop: '20px' }}>
            <NowPlayingCard
              batter={currentBatter}
              pitcher={currentPitcher}
              batterToday={batterToday}
              pitcherToday={pitcherToday}
              balls={state.balls}
              strikes={state.strikes}
            />
          </div>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateRows: state.gameOver ? 'auto 1fr' : 'auto 1fr auto',
            gap: '12px',
            padding: '16px',
            borderRadius: '16px',
            border: '1px solid rgba(148, 163, 184, 0.25)',
            background: '#0b0f1a',
            color: '#e2e8f0',
            minHeight: 'min(90vh, 925px)',
            height: 'auto',
            overflow: 'visible',
          }}
        >
          {state.gameOver ? (
            <>
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
                    <LiveFeed sections={sections} collapsedMap={collapsedMap} gameOverInfo={gameOverInfo} />
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
            <span style={{ fontWeight: 900, fontSize: '18px' }}>문자 중계</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ color: '#94a3b8', fontWeight: 700, fontSize: '12px' }}>총 {feed.length}건</span>
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
          <LiveFeed sections={sections} collapsedMap={collapsedMap} gameOverInfo={gameOverInfo} />
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

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '12px',
          padding: '0 2px',
        }}
      >
        <div style={{ display: 'grid', gap: '8px' }}>
          <StatsTable title={`${state.teamNames.home} 타자 기록`} stats={playerStats.hitters.home} variant="batter" density="compact" />
          <StatsTable title={`${state.teamNames.home} 투수 기록`} stats={playerStats.pitchers.home} variant="pitcher" density="compact" />

        </div>
        <div style={{ display: 'grid', gap: '8px' }}>
          <StatsTable title={`${state.teamNames.away} 타자 기록`} stats={playerStats.hitters.away} variant="batter" density="compact" />
          <StatsTable title={`${state.teamNames.away} 투수 기록`} stats={playerStats.pitchers.away} variant="pitcher" density="compact" />
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '12px',
          padding: '0 2px 12px',
        }}
      >
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
}: {
  sections: ReturnType<typeof groupByInning>;
  collapsedMap: Record<number, boolean>;
  gameOverInfo: { endText: string; resultText: string } | null;
}) {
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>(collapsedMap);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const heightMapRef = useRef<Map<string, number>>(new Map());
  const overscanPx = 200;

  useEffect(() => {
    setCollapsed((prev) => ({ ...collapsedMap, ...prev }));
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
          item.type === 'marker' ? 22 : item.type === 'batter' ? 22 : item.type === 'log' ? 52 : 48;
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
              return (
                <div key={item.key} style={{ color: '#e2e8f0', fontWeight: 800, fontSize: '13px', padding: '2px 0' }}>
                  {item.order ? `${item.order}번 ` : ''}
                  {item.text} 타석
                </div>
              );
            }
            if (
              item.type === 'log' &&
              (item.text.includes('투수 교체') ||
                item.text.includes('타자 교체') ||
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
                  display: 'inline-flex',
                  alignItems: 'center',
                  width: 'max-content',
                  maxWidth: '100%',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'keep-all',
                  overflowWrap: 'anywhere',
                  color: '#e2e8f0',
                }}
              >
                {colorizeText(item.text).map((part) => (
                  <span key={part.key} style={{ color: part.color ?? '#e2e8f0', fontWeight: part.color ? 900 : 800 }}>
                    {part.text}
                  </span>
                ))}
              </div>
            );
          },
        });
      });
    });

    if (gameOverInfo) {
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
  }, [sections, collapsed, gameOverInfo]);

  const totalHeight = useMemo(() => {
    let h = 0;
    flatItems.forEach((item) => {
      h += heightMapRef.current.get(item.key) ?? item.estimatedHeight;
    });
    return h;
  }, [flatItems]);

  const { startIndex, endIndex, offsetTop } = useMemo(() => {
    let y = 0;
    let start = 0;
    const viewportEnd = scrollTop + viewportHeight + overscanPx;
    const viewportStart = Math.max(0, scrollTop - overscanPx);

    for (let i = 0; i < flatItems.length; i += 1) {
      const h = heightMapRef.current.get(flatItems[i].key) ?? flatItems[i].estimatedHeight;
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
      const h = heightMapRef.current.get(flatItems[i].key) ?? flatItems[i].estimatedHeight;
      currentY += h;
      end = i;
      if (currentY >= viewportEnd) break;
    }
    return { startIndex: start, endIndex: Math.min(end, flatItems.length - 1), offsetTop: y };
  }, [flatItems, scrollTop, viewportHeight, overscanPx]);

  const visibleItems = flatItems.slice(startIndex, endIndex + 1);

  const measureRef = (key: string) => (el: HTMLDivElement | null) => {
    if (!el) return;
    const prev = heightMapRef.current.get(key);
    const next = el.getBoundingClientRect().height;
    if (prev !== next) {
      heightMapRef.current.set(key, next);
      setViewportHeight((v) => v); // trigger recalculation
    }
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

function classifyResult(result: string) {
  const normalized = result.replace(/\s+/g, '');
  if (normalized.includes('홈런')) return 'hr' as const;
  if (normalized.includes('3루타')) return 'triple' as const;
  if (normalized.includes('2루타')) return 'double' as const;
  if (normalized.includes('1루타')) return 'single' as const;
  if (normalized.includes('볼넷')) return 'bb' as const;
  if (normalized.includes('몸에맞는공')) return 'hbp' as const;
  if (normalized.includes('희생플라이')) return 'sac' as const;
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

function computeBatterLine(feed: ReturnType<typeof useDemoStore>['state']['feed'], side: 'home' | 'away', batter: string): BatterLine {
  const base: BatterLine = { pa: 0, ab: 0, hits: 0, hr: 0, doubles: 0, triples: 0, bb: 0, hbp: 0, so: 0, sac: 0 };
  if (!batter) return base;
  feed.forEach((entry) => {
    const offenseSide: 'home' | 'away' = entry.half === 'top' ? 'away' : 'home';
    if (offenseSide !== side) return;
    if (entry.batter !== batter) return;
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

function computePitcherLine(feed: ReturnType<typeof useDemoStore>['state']['feed'], pitcher: string): PitcherLine {
  const base: PitcherLine = {
    bf: 0,
    outs: 0,
    hits: 0,
    hr: 0,
    bb: 0,
    hbp: 0,
    so: 0,
    pitches: 0,
    strikes: 0,
    balls: 0,
  };
  if (!pitcher) return base;
  const chronological = [...feed].reverse();
  const current: Record<'home' | 'away', string | null> = { home: null, away: null };
  const cleanName = (raw: string) => raw.replace(/\([^)]*\)/g, '').replace(/투수/g, '').replace(/·/g, '').trim();
  chronological.forEach((entry) => {
    const offenseSide: 'home' | 'away' = entry.half === 'top' ? 'away' : 'home';
    const defenseSide: 'home' | 'away' = offenseSide === 'home' ? 'away' : 'home';
    const result = entry.result.trim();
    if (result.includes('투수 교체')) {
      const incoming = result.split('→')[1];
      if (incoming) current[defenseSide] = cleanName(incoming);
    } else if (result.endsWith('투수')) {
      current[defenseSide] = cleanName(result.replace('투수', ''));
    }

    const activePitcher = current[defenseSide];
    if (!activePitcher || activePitcher !== pitcher) return;

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
) {
  const merge = (
    lineup: { name: string; pos: string; number: string }[],
    bench?: { name: string; pos: string; number: string }[],
    gone?: { name: string; pos: string; number: string }[],
  ) => [...lineup, ...(bench ?? []), ...(gone ?? [])];
  return {
    home: new Map(merge(lineups.home, benches?.home, removed?.home).map((p) => [p.name, { number: p.number, pos: p.pos }])),
    away: new Map(merge(lineups.away, benches?.away, removed?.away).map((p) => [p.name, { number: p.number, pos: p.pos }])),
  };
}

function formatEntry(entry: ReturnType<typeof useDemoStore>['state']['feed'][number]) {
  const halfLabel = entry.half === 'top' ? '초' : '말';
  const inningLabel = `${entry.inning}회${halfLabel}`;
  const batterLabel = entry.batter ? `${entry.order}번 ${entry.batter} 타석` : '';
  const pitchLabel = entry.pitch > 0 ? `${entry.pitch}구째` : '';
  const parts = [inningLabel, batterLabel, pitchLabel].filter(Boolean).join(' ');
  return parts ? `${parts} ${entry.result}` : entry.result;
}

function buildDisplayItems(
  feed: ReturnType<typeof useDemoStore>['state']['feed'],
  jerseyMap: { home: Map<string, { number: string; pos: string }>; away: Map<string, { number: string; pos: string }> },
): DisplayItem[] {
  const chronological = [...feed].reverse();
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
    if (batterName && order) {
      const slot = battingSlots[offenseSide];
      const prevOccupant = slot.get(order);
      if (prevOccupant && prevOccupant !== batterName) {
        const outgoingJersey = jerseyMap[offenseSide].get(prevOccupant)?.number;
        items.push({
          type: 'batter',
          text: `${prevOccupant}${outgoingJersey ? `(${outgoingJersey})` : ''}`,
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

    if (batterName) {
      const jersey = jerseyMap[offenseSide].get(batterName)?.number;
      const batterText = `${batterName}${jersey ? `(${jersey})` : ''}`;
      if (batterName !== prevBatter || isSubstitute) {
        items.push({
          type: 'batter',
          text: batterText,
          key: `batter-${entry.inning}-${entry.half}-${order ?? 'na'}-${batterName}-${idx}${isSubstitute ? '-sub' : ''}`,
          inning: entry.inning,
          half: entry.half,
          order,
          jersey,
          isSubstitute,
        });
        prevBatter = batterName;
      }
    }

    items.push({
      type: 'log',
      text: formatEntry(entry),
      key: `log-${entry.inning}-${entry.half}-${entry.order}-${entry.pitch}-${idx}`,
      chip: `${entry.inning}-${entry.half}-${entry.order}-${entry.pitch}`,
      inning: entry.inning,
      half: entry.half,
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

function colorizeText(text: string) {
  const pattern =
    /(\d+\s*안타|\d+\s*아웃|득점|점수|도루\s*성공|도루\s*실패|도루|안타|2루타|3루타|루타|홈런|볼넷|몸에\s*맞는\s*공|몸에맞는공|HBP|HP|사구|아웃|삼진|낫아웃|견제사|실책|E[1-6]|WP|PB|BK|야수선택|FC|F\.C)/g;
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
  };
  const parts: Array<{ text: string; color?: string; key: string }> = [];
  let lastIndex = 0;
  text.replace(pattern, (match, _p1, offset) => {
    const key = match.replace(/\s+/g, '');
    if (lastIndex < offset) {
      parts.push({ text: text.slice(lastIndex, offset), key: `${lastIndex}-${offset}` });
    }
    parts.push({ text: match, color: colorMap[key], key: `${offset}-${offset + match.length}` });
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

function buildPlayerStats(record: ReturnType<typeof buildGameRecord>) {
  const rosterHome = new Map<string, { pos?: string; order: number }>();
  const rosterAway = new Map<string, { pos?: string; order: number }>();
  record.lineups.home.forEach((p, idx) => rosterHome.set(p.name, { pos: p.pos, order: idx }));
  record.lineups.away.forEach((p, idx) => rosterAway.set(p.name, { pos: p.pos, order: idx }));

  const benchMetaHome = new Map<string, { pos?: string; order: number }>();
  const benchMetaAway = new Map<string, { pos?: string; order: number }>();
  record.benches.home.forEach((p, idx) => benchMetaHome.set(p.name, { pos: p.pos, order: 100 + idx }));
  record.benches.away.forEach((p, idx) => benchMetaAway.set(p.name, { pos: p.pos, order: 100 + idx }));
  const extraOrder: Record<'home' | 'away', number> = { home: 100, away: 100 };
  const battingOrders: Record<'home' | 'away', Map<number, string[]>> = { home: new Map(), away: new Map() };

  const seedBattingOrders = (side: 'home' | 'away') => {
    const batting = record.lineups[side].filter((slot) => slot.pos.toUpperCase() !== 'P');
    batting.forEach((slot, idx) => battingOrders[side].set(idx + 1, [slot.name]));
  };
  seedBattingOrders('home');
  seedBattingOrders('away');
  const addRemovedOrders = (side: 'home' | 'away') => {
    (record.removed?.[side] ?? []).forEach((p) => {
      const ord = typeof p.order === 'number' && p.order > 0 ? p.order : null;
      if (!ord) return;
      const list = battingOrders[side].get(ord) ?? [];
      if (!list.includes(p.name)) {
        list.unshift(p.name);
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
    const entry = { pos: meta?.pos, order: meta?.order ?? extraOrder[side] };
    extraOrder[side] += 1;
    roster.set(name, entry);
    return entry;
  };

  const ensurePitcherAppearance = (side: 'home' | 'away', name: string) => {
    if (pitcherAppearance[side].has(name)) return pitcherAppearance[side].get(name)!;
    const order = nextAppearance[side];
    nextAppearance[side] += 1;
    pitcherAppearance[side].set(name, order);
    return order;
  };

  const addStat = (side: 'home' | 'away', name: string) => {
    ensureRosterEntry(side, name);
    const roster = side === 'home' ? rosterHome : rosterAway;
    const pos = roster.get(name)?.pos;
    const store = side === 'home' ? statsHome : statsAway;
    if (!store.has(name)) {
      store.set(name, ensurePlayerStat(name, pos));
    }
    return store.get(name)!;
  };

  const addPitch = (side: 'home' | 'away', name: string) => {
    ensureRosterEntry(side, name);
    ensurePitcherAppearance(side, name);
    const roster = side === 'home' ? rosterHome : rosterAway;
    const pos = roster.get(name)?.pos;
    const store = side === 'home' ? pitchHome : pitchAway;
    if (!store.has(name)) {
      store.set(name, ensurePitcherStat(name, pos));
    }
    return store.get(name)!;
  };

  const chronological = [...record.feed].reverse();
  const currentPitcher: Record<'home' | 'away', string | null> = { home: null, away: null };
  const cleanName = (raw: string) => raw.replace(/\([^)]*\)/g, '').replace(/투수/g, '').replace(/·/g, '').trim();

  const inferPitcherSide = (name: string): 'home' | 'away' | null => {
    if (rosterHome.has(name) || benchMetaHome.has(name)) return 'home';
    if (rosterAway.has(name) || benchMetaAway.has(name)) return 'away';
    return null;
  };

  chronological.forEach((entry) => {
    const offenseSide: 'home' | 'away' = entry.half === 'top' ? 'away' : 'home';
    const defenseSide: 'home' | 'away' = offenseSide === 'home' ? 'away' : 'home';
    const result = entry.result.trim();
    const orderNum = typeof entry.order === 'number' && entry.order > 0 ? entry.order : null;

    const setCurrentPitcher = (side: 'home' | 'away', name: string) => {
      const cleaned = cleanName(name);
      currentPitcher[side] = cleaned;
      ensureRosterEntry(side, cleaned);
      ensurePitcherAppearance(side, cleaned);
    };

    if (result.includes('투수 교체')) {
      const incoming = result.split('→')[1];
      if (incoming) {
        const cleaned = cleanName(incoming);
        const inferred = inferPitcherSide(cleaned) ?? defenseSide;
        setCurrentPitcher(inferred, cleaned);
      }
    } else if (result.endsWith('투수')) {
      const cleaned = cleanName(result.replace('투수', ''));
      const inferred = inferPitcherSide(cleaned) ?? defenseSide;
      setCurrentPitcher(inferred, cleaned);
    }

    const name = entry.batter?.trim();
    if (!name) return;
    const side = offenseSide;
    ensureRosterEntry(side, name);
    if (orderNum) {
      const list = battingOrders[side].get(orderNum) ?? [];
      if (!list.includes(name)) {
        list.push(name);
      }
      battingOrders[side].set(orderNum, list);
    }

    const pitchSide = side === 'home' ? 'away' : 'home';
    const pitcherName = currentPitcher[pitchSide];
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
        stat.pa += 1;
        stat.ab += 1;
        stat.h += 1;
        stat.singles += 1;
        if (pitcherStat) {
          pitcherStat.bf += 1;
          pitcherStat.h += 1;
        }
        break;
      case 'double':
        stat.pa += 1;
        stat.ab += 1;
        stat.h += 1;
        stat.doubles += 1;
        if (pitcherStat) {
          pitcherStat.bf += 1;
          pitcherStat.h += 1;
        }
        break;
      case 'triple':
        stat.pa += 1;
        stat.ab += 1;
        stat.h += 1;
        stat.triples += 1;
        if (pitcherStat) {
          pitcherStat.bf += 1;
          pitcherStat.h += 1;
        }
        break;
      case 'hr':
        stat.pa += 1;
        stat.ab += 1;
        stat.h += 1;
        stat.hr += 1;
        if (pitcherStat) {
          pitcherStat.bf += 1;
          pitcherStat.h += 1;
          pitcherStat.hr += 1;
        }
        break;
      case 'bb':
        stat.pa += 1;
        stat.bb += 1;
        if (pitcherStat) {
          pitcherStat.bf += 1;
          pitcherStat.bb += 1;
        }
        break;
      case 'hbp':
        stat.pa += 1;
        stat.hbp += 1;
        if (pitcherStat) {
          pitcherStat.bf += 1;
          pitcherStat.hbp += 1;
        }
        break;
      case 'so':
        stat.pa += 1;
        stat.ab += 1;
        stat.so += 1;
        if (pitcherStat) {
          pitcherStat.bf += 1;
          pitcherStat.outs += 1;
          pitcherStat.so += 1;
        }
        break;
      case 'so_reach':
        stat.pa += 1;
        stat.ab += 1;
        stat.so += 1;
        if (pitcherStat) {
          pitcherStat.bf += 1;
          pitcherStat.so += 1;
        }
        break;
      case 'out':
        stat.pa += 1;
        stat.ab += 1;
        if (pitcherStat) {
          pitcherStat.bf += 1;
          pitcherStat.outs += 1;
        }
        break;
      case 'sac':
        stat.pa += 1;
        stat.sac += 1;
        if (pitcherStat) {
          pitcherStat.bf += 1;
          pitcherStat.outs += 1;
        }
        break;
      default:
        break;
    }
  });

  const toArray = (side: 'home' | 'away', roster: Map<string, { pos?: string; order: number }>, store: Map<string, PlayerStat>) => {
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
        rows.push({ ...row, order, status: idx < players.length - 1 ? 'out' : undefined });
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

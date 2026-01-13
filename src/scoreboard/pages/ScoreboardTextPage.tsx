import { useMemo, useState, useEffect, useRef } from 'react';
import ScoreboardFrame from '../components/ScoreboardFrame';
import { useDemoStore, buildGameRecord } from '../../shared/state/demoStore';
import StatsTable from '../../shared/components/StatsTable';
import RemovedPlayersPanel from '../../shared/components/RemovedPlayersPanel';
import type { BatterStatLine, PitcherStatLine } from '../../shared/types/scoreStats';

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
  if (!state.activeMatchId) {
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
  const feed = useMemo(() => state.feed, [state.feed]);
  const hittingSide = state.half === 'top' ? 'away' : 'home';
  const defenseSide = hittingSide === 'home' ? 'away' : 'home';
  const offenseLineup = state.lineups[hittingSide].filter((slot) => slot.pos.toUpperCase() !== 'P');
  const activeOffense = offenseLineup.length ? offenseLineup : state.lineups[hittingSide];
  const currentBatter = activeOffense[state.batterIndex[hittingSide] % (activeOffense.length || 1)]?.name ?? '타자';
  const currentPitcher = state.lineups[defenseSide].find((slot) => slot.pos.toUpperCase() === 'P')?.name ?? '투수';
  const currentInning = state.inning;

  const batterToday = useMemo(() => computeBatterLine(feed, hittingSide, currentBatter), [feed, hittingSide, currentBatter]);
  const pitcherToday = useMemo(() => computePitcherLine(feed, currentPitcher), [feed, currentPitcher]);
  const jerseyMap = useMemo(() => buildJerseyMap(state.lineups, state.benches, state.removed), [state.lineups, state.benches, state.removed]);
  const playerStats = useMemo(() => buildPlayerStats(buildGameRecord(state)), [state]);
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
    const scoreText = `${home} ${state.score.home} - ${away} ${state.score.away}`;
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
        gridTemplateRows: 'auto 1fr',
        gap: '12px',
        padding: '16px',
        borderRadius: '16px',
            border: '1px solid rgba(148, 163, 184, 0.25)',
        background: '#0b0f1a',
        color: '#e2e8f0',
        minHeight: 0,
        height: 'min(90vh, 925px)',
        overflow: 'hidden',
      }}
    >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <span style={{ fontWeight: 900, fontSize: '18px' }}>문자 중계</span>
            <span style={{ color: '#94a3b8', fontWeight: 700, fontSize: '12px' }}>총 {feed.length}건</span>
          </div>
          <LiveFeed sections={sections} collapsedMap={collapsedMap} gameOverInfo={gameOverInfo} />
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

  return (
    <div
      style={{
        overflowY: 'auto',
        maxHeight: '855px',
        height: 'min(75vh, 855px)',
        paddingRight: '6px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: '10px',
        minHeight: 0,
      }}
      ref={containerRef}
    >
      {sections.map((section) => {
        const isCollapsed = collapsed[section.inning];
        return (
          <div key={section.inning} style={{ width: '100%', display: 'grid', gap: '6px' }}>
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
            {!isCollapsed ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {section.items.map((item, idx) => {
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
                })}
              </div>
            ) : null}
          </div>
        );
      })}
      {gameOverInfo ? (
        <div style={{ display: 'grid', gap: '4px', padding: '4px 0' }}>
          <div style={{ color: '#f87171', fontWeight: 900, fontSize: '15px' }}>{gameOverInfo.endText}</div>
          <div style={{ color: '#f87171', fontWeight: 900, fontSize: '14px' }}>{gameOverInfo.resultText}</div>
        </div>
      ) : null}
    </div>
  );
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
    if (['single', 'double', 'triple', 'hr', 'bb', 'hbp', 'so', 'out', 'sac'].includes(kind)) {
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
    /(\d+\s*안타|\d+\s*아웃|득점|점수|도루\s*성공|도루\s*실패|도루|안타|2루타|3루타|루타|홈런|볼넷|아웃|삼진|견제사)/g;
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

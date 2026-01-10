import { useMemo } from 'react';
import ScoreboardPanel from '../components/ScoreboardPanel';
import { useDemoStore } from '../../shared/state/demoStore';

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
  | { type: 'marker'; text: string; color: string; key: string }
  | { type: 'batter'; text: string; key: string }
  | { type: 'pitcher'; text: string; key: string }
  | { type: 'log'; text: string; key: string; chip: string };

export default function ScoreboardTextPage() {
  const { state } = useDemoStore();
  const feed = useMemo(() => state.feed, [state.feed]);
  const hittingSide = state.half === 'top' ? 'away' : 'home';
  const defenseSide = hittingSide === 'home' ? 'away' : 'home';
  const offenseLineup = state.lineups[hittingSide].filter((slot) => slot.pos.toUpperCase() !== 'P');
  const activeOffense = offenseLineup.length ? offenseLineup : state.lineups[hittingSide];
  const currentBatter = activeOffense[state.batterIndex[hittingSide] % (activeOffense.length || 1)]?.name ?? '타자';
  const currentPitcher = state.lineups[defenseSide].find((slot) => slot.pos.toUpperCase() === 'P')?.name ?? '투수';

  const batterToday = useMemo(() => computeBatterLine(feed, hittingSide, currentBatter), [feed, hittingSide, currentBatter]);
  const pitcherToday = useMemo(() => computePitcherLine(feed, defenseSide, currentPitcher), [feed, defenseSide, currentPitcher]);
  const jerseyMap = useMemo(() => buildJerseyMap(state.lineups), [state.lineups]);
  const displayItems = useMemo(
    () => buildDisplayItems(feed, jerseyMap),
    [feed, jerseyMap],
  );

  return (
    <div
      style={{
        display: 'grid',
        gap: 'clamp(16px, 2vw, 24px)',
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
          <ScoreboardPanel
            showFootnote={false}
            style={{
              width: '100%',
              aspectRatio: '4 / 3',
            }}
          />
          <div style={{ marginTop: '-530px' }}>
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
          <div
            style={{
              overflowY: 'auto',
              paddingRight: '6px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: '10px',
              minHeight: 0,
            }}
          >
            {displayItems.map((item, idx) => {
              if (item.type === 'marker') {
                return (
                  <div key={item.key} style={{ color: item.color, fontWeight: 900, fontSize: '14px', padding: '2px 0' }}>
                    {item.text}
                  </div>
                );
              }
              if (item.type === 'batter' || item.type === 'pitcher') {
                return (
                  <div key={item.key} style={{ color: '#e2e8f0', fontWeight: 800, fontSize: '13px', padding: '2px 0' }}>
                    {item.text}
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
        </div>
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
  const pitcherLine = `${pitcherIp}이닝 ${pitcherToday.bf}타자 상대 · 투구수 ${pitcherToday.pitches} (${pitcherToday.strikes}/${pitcherToday.balls}) · ${
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
    normalized.includes('희생') ||
    normalized.includes('몸에맞는공');
  const isBall = normalized.includes('볼') || normalized.includes('볼넷') || normalized.includes('몸에맞는공');
  const isStrike =
    normalized.includes('스트라이크') ||
    normalized.includes('파울') ||
    normalized.includes('삼진') ||
    normalized.includes('타') ||
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

function computePitcherLine(feed: ReturnType<typeof useDemoStore>['state']['feed'], side: 'home' | 'away', pitcher: string): PitcherLine {
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
  feed.forEach((entry) => {
    const offenseSide: 'home' | 'away' = entry.half === 'top' ? 'away' : 'home';
    const defenseSide: 'home' | 'away' = offenseSide === 'home' ? 'away' : 'home';
    if (defenseSide !== side) return;

    const pitchInfo = classifyPitch(entry.result);
    if (pitchInfo.pitch) {
      base.pitches += 1;
      if (pitchInfo.strike) base.strikes += 1;
      if (pitchInfo.ball) base.balls += 1;
    }

    const kind = classifyResult(entry.result);
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

function buildJerseyMap(lineups: ReturnType<typeof useDemoStore>['state']['lineups']) {
  return {
    home: new Map(lineups.home.map((p) => [p.name, { number: p.number, pos: p.pos }])),
    away: new Map(lineups.away.map((p) => [p.name, { number: p.number, pos: p.pos }])),
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
  let prevPitcher: string | null = null;

  chronological.forEach((entry, idx) => {
    const offenseSide: 'home' | 'away' = entry.half === 'top' ? 'away' : 'home';
    const defenseSide: 'home' | 'away' = offenseSide === 'home' ? 'away' : 'home';

    if (idx === 0) {
      items.push({ type: 'marker', text: markerText(entry.inning, entry.half, 'start'), color: '#22c55e', key: `start-${entry.inning}-${entry.half}-init` });
    } else if (entry.inning !== prevInning || entry.half !== prevHalf) {
      if (prevInning && prevHalf) {
        items.push({ type: 'marker', text: markerText(prevInning, prevHalf, 'end'), color: '#f87171', key: `end-${prevInning}-${prevHalf}-${idx}` });
      }
      items.push({ type: 'marker', text: markerText(entry.inning, entry.half, 'start'), color: '#22c55e', key: `start-${entry.inning}-${entry.half}-${idx}` });
      prevBatter = null;
      prevPitcher = null;
    }

    if (entry.batter) {
      const jersey = jerseyMap[offenseSide].get(entry.batter)?.number;
      const batterText = `${entry.order}번 ${entry.batter}${jersey ? `(${jersey})` : ''} 타석`;
      if (entry.batter !== prevBatter) {
        items.push({ type: 'batter', text: batterText, key: `batter-${entry.inning}-${entry.half}-${entry.batter}-${idx}` });
        prevBatter = entry.batter;
      }
    }

    const defensePitcherName = (() => {
      const lookup = jerseyMap[defenseSide];
      const pitcherEntry = [...lookup.entries()].find(([, meta]) => meta.pos.toUpperCase() === 'P');
      if (!pitcherEntry) return '';
      return pitcherEntry[0];
    })();
    if (defensePitcherName) {
      const jersey = jerseyMap[defenseSide].get(defensePitcherName)?.number;
      if (defensePitcherName !== prevPitcher) {
        items.push({
          type: 'pitcher',
          text: prevPitcher
            ? `${prevPitcher} → ${defensePitcherName}${jersey ? `(${jersey})` : ''} 투수 교체`
            : `${defensePitcherName}${jersey ? `(${jersey})` : ''} 투수`,
          key: `pitcher-${entry.inning}-${entry.half}-${idx}`,
        });
        prevPitcher = defensePitcherName;
      }
    }

    items.push({
      type: 'log',
      text: formatEntry(entry),
      key: `log-${entry.inning}-${entry.half}-${entry.order}-${entry.pitch}-${idx}`,
      chip: `${entry.inning}-${entry.half}-${entry.order}-${entry.pitch}`,
    });

    prevHalf = entry.half;
    prevInning = entry.inning;
  });

  return items.reverse();
}

function colorizeText(text: string) {
  const pattern = /(\d+\s*안타|\d+\s*아웃|득점|점수|도루|안타|2루타|3루타|루타|홈런|볼넷|아웃|삼진)/g;
  const colorMap: Record<string, string> = {
    득점: '#facc15',
    점수: '#facc15',
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

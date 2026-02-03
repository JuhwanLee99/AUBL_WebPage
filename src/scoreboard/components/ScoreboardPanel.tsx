import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { TEAMS } from '../../shared/lib/mockData';
import { useDemoStore, buildGameRecord } from '../../shared/state/demoStore';
import MatchSelectorBar from './MatchSelectorBar';
import { GameTimerDisplay } from '../../shared/components/GameTimerDisplay';

// 타입 정의
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
  rbi: number;
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
  runs: number;
};

type PlayerNameParts = { raw: string; base: string; number?: string };

// [수정됨] ScorekeeperPage와 동일한 로직의 헬퍼 함수 추가 (또는 shared/utils로 분리 권장)
const getUniqueName = (name: string, number: string | number | undefined | null) => {
  if (!name) return '';
  return number ? `${name}(${number})` : name;
};

function parsePlayerName(raw: string | null | undefined): PlayerNameParts {
  const trimmed = (raw ?? '').trim();
  const match = trimmed.match(/^(.*?)(?:\(([^)]*)\))?\s*$/);
  const base = (match?.[1] ?? '').trim();
  const number = (match?.[2] ?? '').trim();
  return { raw: trimmed, base, number: number || undefined };
}

function isSamePlayerName(a: string | null | undefined, b: string | null | undefined): boolean {
  const pa = parsePlayerName(a);
  const pb = parsePlayerName(b);
  if (!pa.base || !pb.base) return (pa.raw || '') === (pb.raw || '');
  if (pa.base !== pb.base) return false;
  if (pa.number && pb.number) return pa.number === pb.number;
  return true;
}

function classifyResult(result: string) {
  const normalized = result.replace(/\s+/g, '');
  if (normalized.includes('홈런')) return 'hr' as const;
  if (normalized.includes('3루타')) return 'triple' as const;
  if (normalized.includes('2루타')) return 'double' as const;
  if (normalized.includes('1루타')) return 'single' as const;
  if (normalized.includes('고의') || normalized.toUpperCase().includes('IB')) return 'bb' as const;
  if (normalized.includes('볼넷')) return 'bb' as const;
  if (normalized.includes('몸에맞는공')) return 'hbp' as const;
  if (normalized.includes('타격방해')) return 'ci' as const;
  if (normalized.includes('야수선택') || normalized.toUpperCase().includes('F.C')) return 'fc' as const;
  if (normalized.includes('희생플라이')) return 'sac' as const;
  if (normalized.includes('희생번트')) return 'sac' as const;
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

function extractRuns(result: string): number {
  const match = result.match(/(\d+)\s*득점/);
  if (match) {
    const n = Number(match[1]);
    return Number.isFinite(n) && n > 0 ? n : 1;
  }
  if (result.includes('득점')) return 1;
  return 0;
}

function computeBatterLine(
  feed: ReturnType<typeof useDemoStore>['state']['feed'],
  side: 'home' | 'away',
  batter: string,
): BatterLine {
  const base: BatterLine = { pa: 0, ab: 0, hits: 0, hr: 0, doubles: 0, triples: 0, bb: 0, hbp: 0, so: 0, sac: 0, rbi: 0 };
  if (!batter) return base;
  feed.forEach((entry) => {
    const offenseSide: 'home' | 'away' = entry.half === 'top' ? 'away' : 'home';
    if (offenseSide !== side) return;

    if (!isSamePlayerName(entry.batter, batter)) return;

    const kind = classifyResult(entry.result);
    if (!kind) return;
    if (['single', 'double', 'triple', 'hr', 'bb', 'hbp', 'so', 'so_reach', 'out', 'sac'].includes(kind)) {
      base.pa += 1;
    }
    // 타점 계산
    const runs = extractRuns(entry.result);
    if (runs > 0) base.rbi += runs;

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

function computePitcherLine(
  feed: ReturnType<typeof useDemoStore>['state']['feed'],
  pitcher: string,
): PitcherLine {
  const base: PitcherLine = { bf: 0, outs: 0, hits: 0, hr: 0, bb: 0, hbp: 0, so: 0, pitches: 0, strikes: 0, balls: 0, runs: 0 };
  if (!pitcher) return base;

  const chronological = [...feed].reverse();
  const current: Record<'home' | 'away', string | null> = { home: null, away: null };
  const cleanName = (raw: string) => raw.replace(/투수/g, '').replace(/·/g, '').trim();

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

    const activePitcher = current[defenseSide] || pitcher;
    if (!isSamePlayerName(activePitcher, pitcher)) return;

    const pitchInfo = classifyPitch(result);
    if (pitchInfo.pitch) {
      base.pitches += 1;
      if (pitchInfo.strike) base.strikes += 1;
      if (pitchInfo.ball) base.balls += 1;
    }

    // 실점 계산
    const runs = extractRuns(result);
    if (runs > 0) base.runs += runs;

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

const countLights = (filled: number, total: number, color: string) =>
  Array.from({ length: total }, (_, idx) => ({
    active: idx < filled,
    color,
  }));

export default function ScoreboardPanel({
  style,
  showFootnote = true,
}: {
  style?: CSSProperties;
  showFootnote?: boolean;
}) {
  const { state } = useDemoStore();
  const homeTeam = useMemo(() => TEAMS.find((t) => t.id === state.homeTeamId), [state.homeTeamId]);
  const awayTeam = useMemo(() => TEAMS.find((t) => t.id === state.awayTeamId), [state.awayTeamId]);
  const activeMatch = useMemo(
    () => state.matches.find((match) => match.id === state.activeMatchId),
    [state.matches, state.activeMatchId],
  );
  const hittingSide = state.half === 'top' ? 'away' : 'home';
  const defenseSide = hittingSide === 'home' ? 'away' : 'home';
  const offenseLineup = useMemo(
    () => state.lineups[hittingSide].filter((slot) => slot.pos.toUpperCase() !== 'P'),
    [hittingSide, state.lineups],
  );
  const activeOffense = offenseLineup.length ? offenseLineup : state.lineups[hittingSide];
  // [수정됨] 현재 타자 이름 가져오기: 이름 + 등번호 조합 사용
  const currentBatterSlot = activeOffense[state.batterIndex[hittingSide] % Math.max(activeOffense.length, 1)];
  const currentBatter = currentBatterSlot
    ? getUniqueName(currentBatterSlot.name, currentBatterSlot.number)
    : '타자';

  // [수정됨] 현재 투수 이름 가져오기: 이름 + 등번호 조합 사용
  const currentPitcherSlot = state.lineups[defenseSide].find((slot) => slot.pos.toUpperCase() === 'P');
  const currentPitcher = currentPitcherSlot
    ? getUniqueName(currentPitcherSlot.name, currentPitcherSlot.number)
    : '투수';

  const inningHalf = state.half === 'top' ? '▲' : '▼';
  const inning = state.inning;
  const ball = state.balls;
  const strike = state.strikes;
  const out = state.outs;
  const bases = state.bases;
  const pitchCount = state.pitchCount ?? 0;

  // 타자/투수 오늘 기록 계산
  const feed = useMemo(() => state.feed, [state.feed]);
  const batterToday = useMemo(
    () => computeBatterLine(feed, hittingSide, currentBatter),
    [feed, hittingSide, currentBatter],
  );
  const pitcherToday = useMemo(() => computePitcherLine(feed, currentPitcher), [feed, currentPitcher]);
  const boxScore = useMemo(() => {
    const record = buildGameRecord(state);

    const { lineScore: liveLine, hits: liveHits, errors: liveErrors } = record.liveStats;
    const maxInning = Math.max(state.inning, liveLine.home.length, liveLine.away.length);
    const inningsHeader = Array.from({ length: Math.max(9, maxInning) }, (_, i) => i + 1);

    const padInnings = (arr: number[]) =>
      inningsHeader.map((_, idx) => (arr[idx] != null ? arr[idx] : '—'));

    const totals = activeMatch?.postGame?.totals ?? {
      home: { runs: state.score.home, hits: liveHits.home, errors: liveErrors.home },
      away: { runs: state.score.away, hits: liveHits.away, errors: liveErrors.away },
    };

    const lineScore =
      activeMatch?.postGame?.lineScore && activeMatch.postGame.lineScore.innings.length
        ? activeMatch.postGame.lineScore
        : {
            innings: inningsHeader,
            home: liveLine.home,
            away: liveLine.away,
          };
    const baseInnings = Array.from({ length: 9 }, (_v, idx) => idx + 1);
    const hasExtras = (lineScore?.innings?.length ?? 0) > 9;
    const innings = hasExtras ? [...baseInnings, '10+'] : baseInnings;
    const mk = (side: 'home' | 'away') => ({
      name: state.teamNames[side] || (side === 'home' ? homeTeam?.name : awayTeam?.name) || side.toUpperCase(),
      runs: state.score[side],
      hits: totals?.[side]?.hits ?? '—',
      errors: totals?.[side]?.errors ?? '—',
      innings: padInnings(lineScore?.[side]),
      color: side === 'home' ? '#f97316' : '#60a5fa',
    });
    return { innings, rows: [mk('away'), mk('home')] };
  }, [state, activeMatch, homeTeam, awayTeam]);
  const summaryTime = useMemo(() => {
    if (!activeMatch?.startTime) return '일시 미정';
    const date = new Date(activeMatch.startTime);
    if (Number.isNaN(date.getTime())) return '일시 미정';
    return date.toLocaleString('ko-KR', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, [activeMatch]);
  const summaryVenue = activeMatch?.venue || '경기장 미정';

  return (
    <div
      style={{
        aspectRatio: '16 / 9',
        background: '#000',
        color: '#f8fafc',
        borderRadius: '18px',
        border: '2px solid #1f2937',
        padding: 'clamp(16px, 2.6vw, 28px)',
        boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
        display: 'grid',
        gridTemplateRows: 'auto 1fr auto',
        gap: 'clamp(14px, 2.2vw, 24px)',
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
    >
      <div style={{ display: 'grid', gap: 'clamp(8px, 1.3vw, 12px)' }}>
        <MatchSelectorBar summaryTime={summaryTime} summaryVenue={summaryVenue} />

        <GameTimerDisplay
          gameLimitMinutes={state.gameLimitMinutes}
          gameStartTimestamp={state.gameStartTimestamp}
          gamePausedAt={state.gamePausedAt}
          gamePausedDuration={state.gamePausedDuration}
          gameStarted={state.gameStarted}
          style={{
            padding: '6px 14px',
          }}
        />

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 'clamp(10px, 1.4vw, 16px)',
            alignItems: 'center',
            textAlign: 'center',
          }}
        >
          <ScoreCell label={state.teamNames.away || awayTeam?.name || 'AWAY'} value={state.score.away} />
          <div
            style={{
              display: 'grid',
              gap: '6px',
              justifyItems: 'center',
              width: '100%',
              maxWidth: '320px',
              margin: '0 auto',
            }}
          >
            <PlayerInfoChip
              label="현재 투수"
              value={currentPitcher}
              subLabel={`${pitchCount}구 (S:${pitcherToday.strikes} / B:${pitcherToday.balls}) · ${pitcherToday.runs}실점`}
              color="#60a5fa"
            />
            <div
              style={{
                background: '#0b1220',
                border: '2px solid #111827',
                borderRadius: '12px',
                padding: 'clamp(12px, 1.8vw, 18px) clamp(10px, 1.6vw, 18px)',
                fontWeight: 900,
                fontSize: 'clamp(22px, 3.2vw, 38px)',
                color: '#facc15',
                textShadow: '0 0 14px rgba(250, 204, 21, 0.4)',
                lineHeight: 1.05,
                width: '100%',
              }}
            >
              {inningHalf}
              {inning}
            </div>
            <PlayerInfoChip
              label="현재 타자"
              value={currentBatter}
              subLabel={`${batterToday.ab}타수 ${batterToday.hits}안타 ${batterToday.rbi}타점`}
              color="#f97316"
            />
          </div>
          <ScoreCell label={state.teamNames.home || homeTeam?.name || 'HOME'} value={state.score.home} />
        </div>
      </div>

      <div
        style={{
          background: '#0b1220',
          borderRadius: '14px',
          border: '1px solid #1f2937',
          padding: 'clamp(8px, 1.4vw, 14px)',
          display: 'grid',
          gap: 'clamp(10px, 1.6vw, 14px)',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 0.9fr) minmax(360px, 1.35fr)',
            gap: 'clamp(10px, 1.6vw, 14px)',
            alignItems: 'stretch',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto auto',
              gap: '8px',
              alignItems: 'center',
            }}
          >
            <div style={{ display: 'grid', gap: 'clamp(6px, 1.2vw, 10px)' }}>
              <CountBlock label="B" lights={countLights(ball, 3, '#22c55e')} />
              <CountBlock label="S" lights={countLights(strike, 2, '#facc15')} />
              <CountBlock label="O" lights={countLights(out, 3, '#ef4444')} />
            </div>
            <BasePaths bases={bases} />
          </div>

          <BoxScoreTable data={boxScore} />
        </div>
      </div>

      <div
        style={{
          borderRadius: '12px',
          border: '2px solid #1f2937',
          background: '#0b1220',
          padding: 'clamp(10px, 1.6vw, 16px)',
          fontFamily: 'monospace',
          color: '#7dd3fc',
          fontWeight: 800,
          fontSize: 'clamp(14px, 2vw, 20px)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <span style={{ color: '#67e8f9' }}>LAST PLAY</span>
        <span style={{ color: '#e2e8f0', textTransform: 'none', letterSpacing: '0.02em', fontWeight: 700 }}>
          {state.lastPlay}
        </span>
      </div>

      {showFootnote ? (
        <div
          style={{
            position: 'absolute',
            right: 'clamp(10px, 1.6vw, 16px)',
            bottom: 'clamp(10px, 1.6vw, 16px)',
            display: 'grid',
            gap: '4px',
            color: '#64748b',
            fontWeight: 700,
            fontSize: 'clamp(9px, 1.2vw, 12px)',
            textAlign: 'right',
          }}
        >
          <span>
            AWAY: {state.teamNames.away || awayTeam?.name || 'AWAY'} · HOME: {state.teamNames.home || homeTeam?.name || 'HOME'}
          </span>
          <span>Mock data demo · No live connection</span>
        </div>
      ) : null}
    </div>
  );
}

function ScoreCell({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        background: '#0b1220',
        border: '2px solid #111827',
        borderRadius: '12px',
        padding: '16px 12px',
        display: 'grid',
        gap: '6px',
        alignItems: 'center',
        justifyItems: 'center',
      }}
    >
      <span
        style={{
          fontSize: 'clamp(14px, 2vw, 20px)',
          fontWeight: 900,
          letterSpacing: '0.06em',
          color: '#f8fafc',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 'clamp(44px, 8vw, 96px)',
          fontWeight: 900,
          color: '#facc15',
          textShadow: '0 0 18px rgba(250, 204, 21, 0.45)',
        }}
      >
        {value}
      </span>
    </div>
  );
}

function CountBlock({ label, lights }: { label: string; lights: { active: boolean; color: string }[] }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '40px 1fr',
        alignItems: 'center',
        gap: '8px',
        color: '#f8fafc',
        fontWeight: 900,
      }}
    >
      <span style={{ fontSize: 'clamp(16px, 2.2vw, 22px)' }}>{label}</span>
      <div style={{ display: 'flex', gap: 'clamp(6px, 1.2vw, 12px)' }}>
        {lights.map((light, idx) => (
          <span
            key={idx}
            style={{
              width: 'clamp(14px, 2vw, 24px)',
              height: 'clamp(14px, 2vw, 24px)',
              borderRadius: '50%',
              background: light.active ? light.color : '#1f2937',
              boxShadow: light.active ? `0 0 12px ${light.color}` : 'inset 0 0 0 1px #111827',
            }}
          />
        ))}
      </div>
    </div>
  );
}

function BasePaths({ bases }: { bases: (string | null)[] }) {
  const [first, second, third] = bases.map(Boolean);
  const baseSize = 'clamp(18px, 2.6vw, 30px)';
  return (
    <div style={{ display: 'grid', gap: '0px', justifyItems: 'center', transform: 'translate(-18px, 10px)' }}>
      <span
        style={{
          fontWeight: 900,
          color: '#cbd5e1',
          transform: 'translate(-12px, 10px)',
        }}
      >
        BASES
      </span>
      <div
        style={{
          position: 'relative',
          width: 'clamp(90px, 13vw, 150px)',
          height: 'clamp(90px, 13vw, 150px)',
          margin: '0 auto',
          transform: 'translateY(14px)',
        }}
      >
        <DiamondBase active={second} top="24%" left="44%" size={baseSize} />
        <DiamondBase active={first} top="50%" left="68%" size={baseSize} />
        <DiamondBase active={third} top="50%" left="18%" size={baseSize} />
      </div>
    </div>
  );
}

export function BoxScoreTable({
  data,
}: {
  data: {
    innings: (number | string)[];
    rows: {
      name: string;
      runs: number;
      hits: number | string;
      errors: number | string;
      innings: (number | string)[];
      color: string;
    }[];
  };
}) {
  const headers = ['팀', ...data.innings.map(String), 'R', 'H', 'E'];
  const rows = data.rows;
  return (
    <div
      style={{
        border: '1px solid rgba(148,163,184,0.2)',
        borderRadius: '12px',
        overflow: 'hidden',
        background: 'rgba(255,255,255,0.02)',
        display: 'grid',
        gridTemplateRows: 'auto auto',
        height: 'fit-content',
        minHeight: '0',
        alignSelf: 'center',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${headers.length}, minmax(0, 1fr))`,
          background: 'rgba(255,255,255,0.03)',
          borderBottom: '1px solid rgba(148,163,184,0.2)',
        }}
      >
        {headers.map((h) => (
          <div
            key={h}
            style={{
              padding: '3px 2px',
              textAlign: 'center',
              fontWeight: 800,
              fontSize: '12px',
              color: '#e2e8f0',
              letterSpacing: '0.04em',
            }}
          >
            {h}
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridAutoRows: 'auto' }}>
        {rows.map((row, idx) => (
          <div
            key={row.name}
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${headers.length}, minmax(0, 1fr))`,
              borderTop: idx === 0 ? 'none' : '1px solid rgba(148,163,184,0.2)',
            }}
          >
            <div
              style={{
                padding: '4px',
                fontWeight: 900,
                color: row.color,
                fontSize: '12px',
                textAlign: 'center',
              }}
            >
              {row.name}
            </div>
            {[...row.innings, row.runs, row.hits, row.errors].map((val, vIdx) => (
              <div
                key={`${row.name}-${vIdx}`}
                style={{
                  padding: '4px 2px',
                  textAlign: 'center',
                  color: '#cbd5e1',
                  fontWeight: 800,
                  fontSize: '13px',
                }}
              >
                {val}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function PlayerInfoChip({
  label,
  value,
  subLabel,
  color,
}: {
  label: string;
  value: string;
  subLabel?: string;
  color: string;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gap: '2px',
        padding: '8px 12px',
        background: 'rgba(15,23,42,0.9)',
        border: `1px solid ${color}33`,
        borderRadius: '12px',
        width: '100%',
        maxWidth: '320px',
        minWidth: 0,
        justifyItems: 'center',
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          gap: '8px',
          alignItems: 'center',
          fontWeight: 900,
          fontSize: '13px',
          color: '#e2e8f0',
        }}
      >
        <span
          style={{
            fontWeight: 800,
            fontSize: '12px',
            letterSpacing: '0.03em',
            textTransform: 'uppercase',
            color,
          }}
        >
          {label}
        </span>
        <span>{value}</span>
      </span>
      {subLabel ? (
        <span
          style={{
            fontWeight: 700,
            fontSize: '12px',
            color: '#94a3b8',
          }}
        >
          {subLabel}
        </span>
      ) : null}
    </div>
  );
}
function DiamondBase({
  active,
  top,
  left,
  size,
}: {
  active: boolean;
  top?: string;
  left?: string;
  size?: string;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        top,
        left,
        width: size ?? '28px',
        height: size ?? '28px',
        transform: 'translate(-50%, -50%) rotate(45deg)',
        borderRadius: '4px',
        background: active ? '#facc15' : '#1f2937',
        boxShadow: active ? '0 0 12px #facc15' : 'inset 0 0 0 1px #111827',
      }}
    />
  );
}

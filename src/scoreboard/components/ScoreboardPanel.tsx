import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { TEAMS } from '../../shared/lib/mockData';
import { useDemoStore, buildGameRecord } from '../../shared/state/demoStore';
import MatchSelectorBar from './MatchSelectorBar';

// [수정됨] ScorekeeperPage와 동일한 로직의 헬퍼 함수 추가 (또는 shared/utils로 분리 권장)
const getUniqueName = (name: string, number: string | number | undefined | null) => {
  if (!name) return '';
  return number ? `${name}(${number})` : name;
};

const countLights = (filled: number, total: number, color: string) =>
  Array.from({ length: total }, (_, idx) => ({
    active: idx < filled,
    color,
  }));

// 간단한 결과 분류: 안타/아웃/볼넷/사구/삼진/희생 여부만 필요
function classifyResult(result: string) {
  const normalized = result.replace(/\s+/g, '');
  if (normalized.includes('홈런')) return 'hr' as const;
  if (normalized.includes('3루타')) return 'triple' as const;
  if (normalized.includes('2루타')) return 'double' as const;
  if (normalized.includes('1루타')) return 'single' as const;
  if (normalized.includes('볼넷') || normalized.includes('고의') || normalized.toUpperCase().includes('IB')) return 'bb' as const;
  if (normalized.includes('몸에맞는공') || normalized.toUpperCase().includes('HBP')) return 'hbp' as const;
  if (normalized.includes('희생')) return 'sac' as const;
  if (normalized.includes('낫아웃')) return 'so_reach' as const;
  if (normalized.includes('삼진')) return 'so' as const;
  if (normalized.includes('아웃') && !normalized.includes('도루')) return 'out' as const;
  return null;
}

// 로그 텍스트에서 득점 숫자를 추출 (예: "2득점" -> 2, "득점" -> 1)
function extractRuns(result: string): number {
  const match = result.match(/(\d+)\s*득점/);
  if (match) {
    const n = Number(match[1]);
    return Number.isFinite(n) && n > 0 ? n : 1;
  }
  if (result.includes('득점')) return 1;
  return 0;
}

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
  const boxScore = useMemo(() => {
    const record = buildGameRecord(state);

    const liveHits = record.feed.reduce(
      (acc, entry) => {
        const offense: 'home' | 'away' = entry.half === 'top' ? 'away' : 'home';
        const kind = classifyResult(entry.result);
        if (kind && ['single', 'double', 'triple', 'hr'].includes(kind)) {
          acc[offense] += 1;
        }
        return acc;
      },
      { home: 0, away: 0 },
    );

    const liveErrorsFromFeed = record.feed.reduce(
      (acc, entry) => {
        const txt = (entry.result || '').replace(/\s+/g, '');
        const hasError = txt.includes('실책') || /\bE[1-6]\b/i.test(txt);
        if (hasError) {
          const side: 'home' | 'away' = entry.half === 'top' ? 'home' : 'away'; // 수비 쪽에 에러 반영
          acc[side] += 1;
        }
        return acc;
      },
      { home: 0, away: 0 },
    );

    // 실시간 라인스코어 (이닝별 득점) 계산
    const liveLine = record.feed
      .slice()
      .reverse() // chrono
      .reduce(
        (acc, entry) => {
          const runs = extractRuns(entry.result);
          if (!runs) return acc;
          const inningIdx = Math.max(0, entry.inning - 1);
          const side: 'home' | 'away' = entry.half === 'top' ? 'away' : 'home';
          if (side === 'home') {
            if (acc.home.length <= inningIdx) acc.home.length = inningIdx + 1;
            acc.home[inningIdx] = (acc.home[inningIdx] ?? 0) + runs;
          } else {
            if (acc.away.length <= inningIdx) acc.away.length = inningIdx + 1;
            acc.away[inningIdx] = (acc.away[inningIdx] ?? 0) + runs;
          }
          acc.maxInning = Math.max(acc.maxInning, entry.inning);
          return acc;
        },
        { home: [] as number[], away: [] as number[], maxInning: state.inning },
      );

    // 총합이 현재 스코어와 맞지 않으면(중복 로그 등) 마지막 이닝에 보정
    const reconcileRuns = (arr: number[], side: 'home' | 'away') => {
      const sum = arr.reduce((s, v) => s + (Number(v) || 0), 0);
      const diff = state.score[side] - sum;
      if (diff === 0) return arr;
      const idx = Math.max(0, liveLine.maxInning - 1);
      if (arr.length <= idx) arr.length = idx + 1;
      arr[idx] = Math.max(0, (arr[idx] ?? 0) + diff);
      return arr;
    };

    reconcileRuns(liveLine.home, 'home');
    reconcileRuns(liveLine.away, 'away');

    const inningsHeader = Array.from({ length: Math.max(9, liveLine.maxInning) }, (_, i) => i + 1);
    const padInnings = (arr: number[] | undefined) =>
      inningsHeader.map((_, idx) => (arr && arr[idx] != null ? arr[idx] : '—'));

    const totals = activeMatch?.postGame?.totals ?? {
      home: { runs: state.score.home, hits: liveHits.home, errors: liveErrorsFromFeed.home },
      away: { runs: state.score.away, hits: liveHits.away, errors: liveErrorsFromFeed.away },
    };

    const lineScore =
      activeMatch?.postGame?.lineScore && activeMatch.postGame.lineScore.innings.length
        ? activeMatch.postGame.lineScore
        : {
            innings: inningsHeader,
            home: padInnings(liveLine.home) as number[],
            away: padInnings(liveLine.away) as number[],
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
  }, [activeMatch?.postGame?.lineScore, activeMatch?.postGame?.totals, awayTeam?.name, homeTeam?.name, state.score, state.teamNames]);
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
  }, [activeMatch?.startTime]);
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
              subLabel={`총 투구수 ${pitchCount}`}
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
              subLabel={`카운트 ${ball}-${strike} · 아웃 ${out}`}
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
        gridTemplateRows: 'auto 1fr',
        height: '100%',
        minHeight: '0',
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
              padding: '6px 8px',
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
      <div style={{ display: 'grid', gridAutoRows: '1fr' }}>
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
                padding: '8px',
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
                  padding: '8px',
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

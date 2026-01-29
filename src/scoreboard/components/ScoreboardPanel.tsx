import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { TEAMS } from '../../shared/lib/mockData';
import { useDemoStore } from '../../shared/state/demoStore';
import MatchSelectorBar from './MatchSelectorBar';

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
  const currentBatter =
    activeOffense[state.batterIndex[hittingSide] % Math.max(activeOffense.length, 1)]?.name ?? '타자';
  const currentPitcher =
    state.lineups[defenseSide].find((slot) => slot.pos.toUpperCase() === 'P')?.name ?? '투수';

  const inningHalf = state.half === 'top' ? '▲' : '▼';
  const inning = state.inning;
  const ball = state.balls;
  const strike = state.strikes;
  const out = state.outs;
  const bases = state.bases;
  const pitchCount = state.pitchCount ?? 0;
  const boxScore = useMemo(() => {
    const totals = activeMatch?.postGame?.totals;
    const lineScore = activeMatch?.postGame?.lineScore;
    const baseInnings = Array.from({ length: 9 }, (_v, idx) => idx + 1);
    const hasExtras = (lineScore?.innings?.length ?? 0) > 9;
    const innings = hasExtras ? [...baseInnings, '10+'] : baseInnings;
    const padInnings = (arr: number[] | undefined) => {
      const core = innings.map((_, idx) => {
        if (hasExtras && idx === innings.length - 1) {
          const extras = (arr ?? []).slice(9).reduce((acc, cur) => acc + (cur ?? 0), 0);
          return (arr ?? []).length > 9 ? extras : '—';
        }
        return arr && arr[idx] != null ? arr[idx] : '—';
      });
      return core;
    };
    const mk = (side: 'home' | 'away') => ({
      name: state.teamNames[side] || (side === 'home' ? homeTeam?.name : awayTeam?.name) || side.toUpperCase(),
      runs: state.score[side],
      hits: totals?.[side]?.hits ?? '—',
      errors: totals?.[side]?.errors ?? '—',
      innings: padInnings(lineScore?.[side]),
      color: side === 'home' ? '#f97316' : '#60a5fa',
    });
    return { innings, rows: [mk('home'), mk('away')] };
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
          <ScoreCell label={state.teamNames.home || homeTeam?.name || 'HOME'} value={state.score.home} />
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
          <ScoreCell label={state.teamNames.away || awayTeam?.name || 'AWAY'} value={state.score.away} />
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
            HOME: {state.teamNames.home || homeTeam?.name || 'HOME'} · AWAY: {state.teamNames.away || awayTeam?.name || 'AWAY'}
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

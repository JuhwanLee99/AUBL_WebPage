import { useMemo } from 'react';
import { TEAMS } from '../../shared/lib/mockData';
import { useDemoStore } from '../../shared/state/demoStore';

const countLights = (filled: number, total: number, color: string) =>
  Array.from({ length: total }, (_, idx) => ({
    active: idx < filled,
    color,
  }));

export default function ScoreboardPage() {
  const { state } = useDemoStore();
  const homeTeam = useMemo(() => TEAMS.find((t) => t.id === state.homeTeamId), [state.homeTeamId]);
  const awayTeam = useMemo(() => TEAMS.find((t) => t.id === state.awayTeamId), [state.awayTeamId]);

  const inningHalf = state.half === 'top' ? '▲' : '▼';
  const inning = state.inning;
  const ball = state.balls;
  const strike = state.strikes;
  const out = state.outs;
  const bases = state.bases;

  return (
    <div
      style={{
        width: '100%',
        background: '#050505',
        display: 'grid',
        placeItems: 'center',
        padding: '0.6vw',
        boxSizing: 'border-box',
        borderRadius: '16px',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 'min(100%, calc(min(74vh, calc(100vh - 320px)) * 16 / 9))',
          height: 'min(74vh, calc(100vh - 320px))',
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
        }}
      >
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
              background: '#0b1220',
              border: '2px solid #111827',
              borderRadius: '12px',
              padding: 'clamp(14px, 2vw, 22px) clamp(10px, 1.6vw, 18px)',
              fontWeight: 900,
              fontSize: 'clamp(22px, 3.2vw, 38px)',
              color: '#facc15',
              textShadow: '0 0 14px rgba(250, 204, 21, 0.4)',
            }}
          >
            {inningHalf}
            {inning}
          </div>
          <ScoreCell label={state.teamNames.away || awayTeam?.name || 'AWAY'} value={state.score.away} />
        </div>

        <div
          style={{
            background: '#0b1220',
            borderRadius: '14px',
            border: '1px solid #1f2937',
            padding: 'clamp(14px, 2.2vw, 20px)',
            display: 'grid',
            gap: 'clamp(12px, 2vw, 18px)',
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'clamp(12px, 2vw, 18px)', alignItems: 'center' }}>
            <div style={{ display: 'grid', gap: 'clamp(8px, 1.4vw, 12px)' }}>
              <CountBlock label="B" lights={countLights(ball, 3, '#22c55e')} />
              <CountBlock label="S" lights={countLights(strike, 2, '#facc15')} />
              <CountBlock label="O" lights={countLights(out, 3, '#ef4444')} />
            </div>
            <BasePaths bases={bases} />
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
      </div>
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
        gap: '10px',
        color: '#f8fafc',
        fontWeight: 900,
      }}
    >
      <span style={{ fontSize: 'clamp(18px, 2.6vw, 24px)' }}>{label}</span>
      <div style={{ display: 'flex', gap: 'clamp(8px, 1.2vw, 14px)' }}>
        {lights.map((light, idx) => (
          <span
            key={idx}
            style={{
              width: 'clamp(16px, 2.2vw, 28px)',
              height: 'clamp(16px, 2.2vw, 28px)',
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
  const baseSize = 'clamp(20px, 3vw, 34px)';
  return (
    <div style={{ display: 'grid', gap: '8px', justifyItems: 'center' }}>
      <span style={{ fontWeight: 900, color: '#cbd5e1' }}>BASES</span>
      <div
        style={{
          position: 'relative',
          width: 'clamp(120px, 18vw, 220px)',
          height: 'clamp(120px, 18vw, 220px)',
          margin: '0 auto',
        }}
      >
        <DiamondBase active={second} top="10%" left="50%" size={baseSize} />
        <DiamondBase active={first} top="50%" left="90%" size={baseSize} />
        <DiamondBase active={third} top="50%" left="10%" size={baseSize} />
        <DiamondBase active={false} top="90%" left="50%" size={baseSize} />
      </div>
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

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
        background: '#000',
        color: '#f8fafc',
        borderRadius: '16px',
        border: '1px solid #1f2937',
        padding: '24px',
        boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: '12px',
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
            padding: '20px 12px',
            fontWeight: 900,
            fontSize: '28px',
            color: '#facc15',
          }}
        >
          {inningHalf}
          {inning}
        </div>
        <ScoreCell label={state.teamNames.away || awayTeam?.name || 'AWAY'} value={state.score.away} />
      </div>

        <div
          style={{
            marginTop: '16px',
            background: '#0b1220',
            borderRadius: '14px',
            border: '1px solid #1f2937',
            padding: '16px',
            display: 'grid',
            gap: '16px',
          }}
        >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <CountBlock label="B" lights={countLights(ball, 3, '#22c55e')} />
          <CountBlock label="S" lights={countLights(strike, 2, '#facc15')} />
          <CountBlock label="O" lights={countLights(out, 3, '#ef4444')} />
          <BasePaths bases={bases} />
        </div>

        <div
          style={{
            borderTop: '1px solid #1f2937',
            paddingTop: '12px',
            display: 'grid',
            gap: '6px',
            fontFamily: 'monospace',
            color: '#7dd3fc',
          }}
        >
          <span style={{ fontWeight: 800 }}>LAST PLAY</span>
          <span>{state.lastPlay}</span>
        </div>
      </div>

        <div style={{ marginTop: '18px', display: 'grid', gap: '6px', color: '#94a3b8', fontWeight: 700 }}>
          <span>
            HOME: {state.teamNames.home || homeTeam?.name || 'HOME'} · AWAY: {state.teamNames.away || awayTeam?.name || 'AWAY'}
          </span>
          <span style={{ color: '#6ee7b7' }}>이 페이지는 mock 데이터로 동작하며, WebSocket/SSE 연결 없이 데모 가능합니다.</span>
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
      <span style={{ fontSize: '16px', fontWeight: 900, letterSpacing: '0.06em', color: '#f8fafc' }}>{label}</span>
      <span style={{ fontSize: '46px', fontWeight: 900, color: '#facc15', textShadow: '0 0 12px rgba(250, 204, 21, 0.35)' }}>
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
      <span style={{ fontSize: '20px' }}>{label}</span>
      <div style={{ display: 'flex', gap: '10px' }}>
        {lights.map((light, idx) => (
          <span
            key={idx}
            style={{
              width: '18px',
              height: '18px',
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
  return (
    <div style={{ display: 'grid', gap: '10px' }}>
      <span style={{ fontWeight: 900 }}>Bases</span>
      <div
        style={{
          position: 'relative',
          width: '120px',
          height: '120px',
          margin: '0 auto',
        }}
      >
        <DiamondBase active={second} top="0" left="46px" />
        <DiamondBase active={first} top="46px" right="0" />
        <DiamondBase active={third} top="46px" left="0" />
        <DiamondBase active={false} bottom="0" left="46px" />
      </div>
    </div>
  );
}

function DiamondBase({
  active,
  top,
  left,
  right,
  bottom,
}: {
  active: boolean;
  top?: string;
  left?: string;
  right?: string;
  bottom?: string;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        top,
        left,
        right,
        bottom,
        width: '28px',
        height: '28px',
        transform: 'rotate(45deg)',
        borderRadius: '4px',
        background: active ? '#facc15' : '#1f2937',
        boxShadow: active ? '0 0 12px #facc15' : 'inset 0 0 0 1px #111827',
      }}
    />
  );
}

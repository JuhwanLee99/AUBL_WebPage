import { useMemo } from 'react';
import { TEAMS } from '../../shared/lib/mockData';
import { useDemoStore } from '../../shared/state/demoStore';

const homeLineup = ['박해민', '문성주', '홍창기', '오스틴', '오지환', '문보경', '박동원', '김현수', '신민재'];
const awayLineup = ['박해민', '문상주', '황창기', '오스틴', '오지환', '문보경', '박동원', '김현수', '신민재'];

const commandButtons = [
  { label: '볼', color: '#22c55e', action: 'ball' },
  { label: '스트라이크', color: '#22c55e', action: 'strike' },
  { label: '파울', color: '#22c55e', action: 'foul' },
  { label: '1루타', color: '#3b82f6', action: 'single' },
  { label: '2루타', color: '#3b82f6', action: 'double' },
  { label: '3루타', color: '#3b82f6', action: 'triple' },
  { label: '홈런', color: '#f97316', action: 'hr' },
  { label: '볼넷', color: '#22c55e', action: 'walk' },
  { label: '사구', color: '#22c55e', action: 'hbp' },
  { label: '아웃', color: '#ef4444', action: 'out' },
  { label: '희생플라이', color: '#facc15', action: 'sac' },
  { label: '도루 성공', color: '#22c55e', action: 'stealSuccess' },
  { label: '도루 실패', color: '#ef4444', action: 'stealFail' },
  { label: '카운트 리셋', color: '#94a3b8', action: 'resetCount' },
  { label: '주자 클리어', color: '#94a3b8', action: 'clearBases' },
  { label: '이닝 전환', color: '#94a3b8', action: 'nextHalf' },
];

export default function ScorekeeperPage() {
  const { state, actions } = useDemoStore();
  const homeTeam = useMemo(() => TEAMS.find((t) => t.id === state.homeTeamId), [state.homeTeamId]);
  const awayTeam = useMemo(() => TEAMS.find((t) => t.id === state.awayTeamId), [state.awayTeamId]);

  return (
    <div
      style={{
        borderRadius: '20px',
        overflow: 'hidden',
        border: '1px solid rgba(148, 163, 184, 0.25)',
        background: '#0b0f1a',
        color: '#e2e8f0',
        boxShadow: '0 24px 60px rgba(0,0,0,0.4)',
      }}
    >
      <header
        style={{
          padding: '12px 18px',
          background: '#111827',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontWeight: 800,
          letterSpacing: '-0.01em',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ padding: '6px 10px', borderRadius: '10px', background: '#f3f4f6', color: '#111827', fontWeight: 900 }}>
            Dashboard
          </span>
          <span style={{ color: '#cbd5e1' }}>
            {homeTeam?.name ?? 'HOME'} {state.score.home} - {awayTeam?.name ?? 'AWAY'} {state.score.away} |{' '}
            {state.half === 'top' ? 'Top' : 'Bot'} {state.inning} | B:{state.balls} S:{state.strikes} O:{state.outs}
          </span>
        </div>
        <span style={{ fontSize: '14px', color: '#94a3b8' }}>기록원 컨트롤러 · 데모</span>
      </header>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr',
          gap: '16px',
          padding: '18px',
          alignItems: 'start',
        }}
      >
        <FieldView bases={state.bases} />

        <div
          style={{
            background: '#111827',
            borderRadius: '16px',
            border: '1px solid rgba(148, 163, 184, 0.25)',
            padding: '14px',
            display: 'grid',
            gap: '12px',
            minHeight: '360px',
          }}
        >
          <LineupBlock title={`${homeTeam?.name ?? 'HOME'} 선발 라인업`} lineup={homeLineup} />
          <LineupBlock title={`${awayTeam?.name ?? 'AWAY'} 선발 라인업`} lineup={awayLineup} />
        </div>
      </div>

      <div
        style={{
          padding: '16px',
          background: '#0f172a',
          borderTop: '1px solid rgba(148, 163, 184, 0.25)',
          display: 'grid',
          gap: '12px',
        }}
      >
        <div style={{ textAlign: 'center', fontWeight: 900, color: '#cbd5e1' }}>Command Center</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px' }}>
          {commandButtons.map((btn) => (
            <button
              key={btn.label}
              type="button"
              style={{
                padding: '14px 12px',
                borderRadius: '12px',
                border: 'none',
                background: btn.color,
                color: '#0b0f1a',
                fontWeight: 900,
                fontSize: '15px',
                cursor: 'pointer',
                boxShadow: '0 10px 22px rgba(0,0,0,0.25)',
              }}
              onClick={() => handleAction(btn.action, actions)}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function handleAction(action: string, actions: ReturnType<typeof useDemoStore>['actions']) {
  switch (action) {
    case 'ball':
      actions.addBall();
      break;
    case 'strike':
      actions.addStrike();
      break;
    case 'foul':
      actions.addFoul();
      break;
    case 'single':
      actions.hitSingle();
      break;
    case 'double':
      actions.hitDouble();
      break;
    case 'triple':
      actions.hitTriple();
      break;
    case 'hr':
      actions.homeRun();
      break;
    case 'walk':
      actions.walk();
      break;
    case 'hbp':
      actions.hbp();
      break;
    case 'out':
      actions.addOut();
      break;
    case 'sac':
      actions.sacFly();
      break;
    case 'stealSuccess':
      actions.stealSuccess();
      break;
    case 'stealFail':
      actions.stealFail();
      break;
    case 'resetCount':
      actions.resetCount();
      break;
    case 'clearBases':
      actions.clearBases();
      break;
    case 'nextHalf':
      actions.nextHalf();
      break;
    default:
      break;
  }
}

function FieldView({ bases }: { bases: boolean[] }) {
  return (
    <div
      style={{
        position: 'relative',
        borderRadius: '16px',
        background: 'radial-gradient(circle at 50% 40%, #0b1220 0%, #0b0f1a 65%)',
        minHeight: '420px',
        border: '1px solid rgba(148, 163, 184, 0.25)',
        overflow: 'hidden',
      }}
    >
      <div
        aria-label="필드"
        style={{
          position: 'absolute',
          inset: '30px 30px 90px 30px',
          background: 'linear-gradient(135deg, #a16207 0%, #b7791f 100%)',
          clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: '70px 70px 130px 70px',
          background: '#22c55e',
          clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
        }}
      />
      <Base marker={bases[1]} label="2" top="70px" left="calc(50% - 14px)" />
      <Base marker={bases[0]} label="1" top="calc(50% - 8px)" right="70px" />
      <Base marker={bases[2]} label="3" bottom="130px" left="calc(50% - 14px)" />
      <HomePlate occupied={false} />
      <GuideLines />
    </div>
  );
}

function Base({
  marker,
  label,
  top,
  left,
  right,
  bottom,
}: {
  marker?: boolean;
  label?: string;
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
        background: '#f4f4f5',
        transform: 'rotate(45deg)',
        borderRadius: '4px',
        border: '2px solid #e5e7eb',
        display: 'grid',
        placeItems: 'center',
        boxShadow: marker ? '0 0 0 8px rgba(248, 113, 113, 0.2)' : undefined,
      }}
    >
      {marker && (
        <span
          style={{
            transform: 'rotate(-45deg)',
            fontWeight: 900,
            color: '#ef4444',
          }}
        >
          {label}
        </span>
      )}
    </div>
  );
}

function HomePlate({ occupied }: { occupied: boolean }) {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: '52px',
        left: 'calc(50% - 20px)',
        width: '40px',
        height: '32px',
        background: '#e5e7eb',
        clipPath: 'polygon(0 0, 100% 0, 100% 60%, 50% 100%, 0 60%)',
        border: occupied ? '2px solid #f97316' : '2px solid #d1d5db',
        boxShadow: occupied ? '0 0 0 8px rgba(249, 115, 22, 0.2)' : undefined,
      }}
    />
  );
}

function GuideLines() {
  return (
    <>
      <div
        style={{
          position: 'absolute',
          top: 'calc(50% - 2px)',
          left: '30px',
          right: '30px',
          height: '2px',
          background: 'rgba(226, 232, 240, 0.35)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: '60px',
          left: 'calc(50% - 1px)',
          bottom: '120px',
          width: '2px',
          background: 'rgba(226, 232, 240, 0.35)',
        }}
      />
    </>
  );
}

function LineupBlock({ title, lineup }: { title: string; lineup: string[] }) {
  return (
    <div style={{ display: 'grid', gap: '8px' }}>
      <p style={{ margin: 0, fontWeight: 800, color: '#cbd5e1' }}>{title}</p>
      <div
        style={{
          background: '#0b0f1a',
          borderRadius: '12px',
          border: '1px solid rgba(148, 163, 184, 0.25)',
          padding: '10px 12px',
          display: 'grid',
          gap: '6px',
        }}
      >
        {lineup.map((player, idx) => (
          <div key={player + idx} style={{ display: 'flex', justifyContent: 'space-between', color: '#e2e8f0', fontWeight: 700 }}>
            <span>
              {idx + 1}. {player}
            </span>
            <span style={{ color: '#94a3b8' }}>CF</span>
          </div>
        ))}
      </div>
    </div>
  );
}

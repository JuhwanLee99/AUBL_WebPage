import { useMemo, useState } from 'react';
import { TEAMS } from '../../shared/lib/mockData';
import { useDemoStore } from '../../shared/state/demoStore';

type Side = 'home' | 'away';

const mainButtons = [
  { label: '볼', color: '#22c55e', action: 'ball' },
  { label: '스트라이크', color: '#22c55e', action: 'strike' },
  { label: '파울', color: '#22c55e', action: 'foul' },
  { label: '타격', color: '#3b82f6', action: 'single' },
  { label: '삼진/4구', color: '#ef4444', action: 'out' },
];

const detailButtons = [
  { label: '1루타', color: '#3b82f6', action: 'single' },
  { label: '2루타', color: '#3b82f6', action: 'double' },
  { label: '3루타', color: '#3b82f6', action: 'triple' },
  { label: '홈런', color: '#f97316', action: 'hr' },
  { label: '볼넷', color: '#22c55e', action: 'walk' },
  { label: '사구', color: '#22c55e', action: 'hbp' },
  { label: '희생플라이', color: '#facc15', action: 'sac' },
  { label: '도루 성공', color: '#22c55e', action: 'stealSuccess' },
  { label: '도루 실패', color: '#ef4444', action: 'stealFail' },
  { label: '아웃', color: '#ef4444', action: 'out' },
  { label: '카운트 리셋', color: '#94a3b8', action: 'resetCount' },
  { label: '주자 클리어', color: '#94a3b8', action: 'clearBases' },
  { label: '이닝 전환', color: '#94a3b8', action: 'nextHalf' },
];

export default function ScorekeeperPage() {
  const { state, actions } = useDemoStore();
  const homeTeam = useMemo(() => TEAMS.find((t) => t.id === state.homeTeamId), [state.homeTeamId]);
  const awayTeam = useMemo(() => TEAMS.find((t) => t.id === state.awayTeamId), [state.awayTeamId]);
  const [runnerModal, setRunnerModal] = useState<{ base: 0 | 1 | 2; name: string } | null>(null);
  const [benchInput, setBenchInput] = useState<{ [K in Side]: { name: string; pos: string } }>({
    home: { name: '', pos: '' },
    away: { name: '', pos: '' },
  });

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
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <span style={{ padding: '6px 10px', borderRadius: '10px', background: '#f3f4f6', color: '#111827', fontWeight: 900 }}>
            Dashboard
          </span>
          <span style={{ color: '#cbd5e1' }}>
            {state.teamNames.home} {state.score.home} - {state.teamNames.away} {state.score.away} |{' '}
            {state.half === 'top' ? 'Top' : 'Bot'} {state.inning} | B:{state.balls} S:{state.strikes} O:{state.outs}
          </span>
        </div>
        <span style={{ fontSize: '14px', color: '#94a3b8' }}>기록원 컨트롤러 · 데모</span>
      </header>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.4fr 1fr',
          gap: '16px',
          padding: '18px',
          alignItems: 'start',
        }}
      >
        <div style={{ display: 'grid', gap: '12px' }}>
          <FieldView bases={state.bases} inning={state.inning} half={state.half} outs={state.outs} onSelectRunner={setRunnerModal} />
          <div
            style={{
              padding: '12px',
              borderRadius: '14px',
              border: '1px solid rgba(148, 163, 184, 0.25)',
              background: 'rgba(255,255,255,0.03)',
              display: 'grid',
              gap: '8px',
            }}
          >
            <span style={{ fontWeight: 800, color: '#cbd5e1' }}>이닝/아웃 정보</span>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <Chip label={`Inning ${state.inning} ${state.half === 'top' ? '▲' : '▼'}`} />
              <Chip label={`Outs ${state.outs}`} />
              <Chip label={`B ${state.balls}`} />
              <Chip label={`S ${state.strikes}`} />
            </div>
          </div>
        </div>

        <div
          style={{
            background: '#111827',
            borderRadius: '16px',
            border: '1px solid rgba(148, 163, 184, 0.25)',
            padding: '14px',
            display: 'grid',
            gap: '14px',
            minHeight: '360px',
          }}
        >
          <TeamEditor
            label="HOME"
            defaultName={homeTeam?.name ?? state.teamNames.home}
            side="home"
            teamName={state.teamNames.home}
            lineup={state.lineups.home}
            bench={state.benches.home}
            benchInput={benchInput.home}
            onChangeBenchInput={(val) => setBenchInput((p) => ({ ...p, home: val }))}
            onSetTeamName={actions.setTeamName}
            onSetLineup={actions.setLineup}
            onAddBench={actions.addBench}
            onSubstitute={actions.substitute}
          />
          <TeamEditor
            label="AWAY"
            defaultName={awayTeam?.name ?? state.teamNames.away}
            side="away"
            teamName={state.teamNames.away}
            lineup={state.lineups.away}
            bench={state.benches.away}
            benchInput={benchInput.away}
            onChangeBenchInput={(val) => setBenchInput((p) => ({ ...p, away: val }))}
            onSetTeamName={actions.setTeamName}
            onSetLineup={actions.setLineup}
            onAddBench={actions.addBench}
            onSubstitute={actions.substitute}
          />
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
          {mainButtons.map((btn) => (
            <button
              key={btn.label}
              type="button"
              style={{
                padding: '16px 12px',
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px' }}>
          {detailButtons.map((btn) => (
            <button
              key={btn.label}
              type="button"
              style={{
                padding: '12px 10px',
                borderRadius: '10px',
                border: '1px solid rgba(15,23,42,0.4)',
                background: 'rgba(255,255,255,0.08)',
                color: btn.color,
                fontWeight: 800,
                fontSize: '13px',
                cursor: 'pointer',
              }}
              onClick={() => handleAction(btn.action, actions)}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {runnerModal && (
        <RunnerModal
          name={runnerModal.name}
          base={runnerModal.base}
          onClose={() => setRunnerModal(null)}
          onStealSuccess={() => {
            actions.runnerStealSuccess(runnerModal.base);
            setRunnerModal(null);
          }}
          onCaught={() => {
            actions.runnerCaught(runnerModal.base);
            setRunnerModal(null);
          }}
          onOut={() => {
            actions.runnerOut(runnerModal.base);
            setRunnerModal(null);
          }}
        />
      )}
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

function FieldView({
  bases,
  inning,
  half,
  outs,
  balls,
  strikes,
  onSelectRunner,
}: {
  bases: (string | null)[];
  inning: number;
  half: 'top' | 'bottom';
  outs: number;
  balls: number;
  strikes: number;
  onSelectRunner: (payload: { base: 0 | 1 | 2; name: string }) => void;
}) {
  const label = `${half === 'top' ? '▲' : '▼'} ${inning}`;
  return (
    <div
      style={{
        position: 'relative',
        borderRadius: '18px',
        background: 'radial-gradient(circle at 50% 40%, #0b1220 0%, #0b0f1a 65%)',
        minHeight: '440px',
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
      <Base marker={Boolean(bases[1])} label={bases[1] ?? '2'} top="70px" left="calc(50% - 14px)" onSelect={() => bases[1] && onSelectRunner({ base: 1, name: bases[1] })} />
      <Base marker={Boolean(bases[0])} label={bases[0] ?? '1'} top="220px" left="65%" onSelect={() => bases[0] && onSelectRunner({ base: 0, name: bases[0] })} />
      <Base marker={Boolean(bases[2])} label={bases[2] ?? '3'} top="220px" left="calc(35% - 28px)" onSelect={() => bases[2] && onSelectRunner({ base: 2, name: bases[2] })} />
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
  onSelect,
}: {
  marker?: boolean;
  label?: string;
  top?: string;
  left?: string;
  right?: string;
  bottom?: string;
  onSelect?: () => void;
}) {
  const clickable = marker && onSelect;
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
        cursor: clickable ? 'pointer' : 'default',
      }}
      role={clickable ? 'button' : undefined}
      onClick={() => clickable && onSelect?.()}
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

function HomePlate({ occupied }: { occupied: boolean }) {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: '64px',
        left: 'calc(50% - 22px)',
        width: '44px',
        height: '36px',
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
          top: '70px',
          left: 'calc(50% - 1px)',
          bottom: '140px',
          width: '2px',
          background: 'rgba(226, 232, 240, 0.35)',
        }}
      />
    </>
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

function Chip({ label }: { label: string }) {
  return (
    <span
      style={{
        padding: '6px 10px',
        borderRadius: '10px',
        background: 'rgba(148,163,184,0.15)',
        color: '#e2e8f0',
        fontWeight: 800,
        fontSize: '12px',
      }}
    >
      {label}
    </span>
  );
}

function TeamEditor({
  label,
  defaultName,
  side,
  teamName,
  lineup,
  bench,
  benchInput,
  onChangeBenchInput,
  onSetTeamName,
  onSetLineup,
  onAddBench,
  onSubstitute,
}: {
  label: string;
  defaultName: string;
  side: Side;
  teamName: string;
  lineup: { name: string; pos: string }[];
  bench: { name: string; pos: string }[];
  benchInput: { name: string; pos: string };
  onChangeBenchInput: (val: { name: string; pos: string }) => void;
  onSetTeamName: (side: Side, name: string) => void;
  onSetLineup: (side: Side, index: number, name: string, pos: string) => void;
  onAddBench: (side: Side, name: string, pos: string) => void;
  onSubstitute: (side: Side, benchIndex: number, lineupIndex: number) => void;
}) {
  return (
    <div style={{ display: 'grid', gap: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 800, color: '#cbd5e1' }}>{label}</span>
        <input
          value={teamName}
          onChange={(e) => onSetTeamName(side, e.target.value)}
          placeholder={defaultName}
          style={{
            background: '#0b0f1a',
            border: '1px solid rgba(148, 163, 184, 0.3)',
            borderRadius: '10px',
            padding: '8px 10px',
            color: '#e2e8f0',
            fontWeight: 800,
            width: '70%',
          }}
        />
      </div>
      <div
        style={{
          background: '#0b0f1a',
          borderRadius: '12px',
          border: '1px solid rgba(148, 163, 184, 0.25)',
          padding: '10px 12px',
          display: 'grid',
          gap: '8px',
        }}
      >
        {lineup.map((slot, idx) => (
          <div key={slot.name + idx} style={{ display: 'grid', gridTemplateColumns: '24px 1fr 120px', gap: '8px', alignItems: 'center' }}>
            <span style={{ color: '#94a3b8', fontWeight: 800 }}>{idx + 1}.</span>
            <input
              value={slot.name}
              onChange={(e) => onSetLineup(side, idx, e.target.value, slot.pos)}
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(148, 163, 184, 0.25)',
                borderRadius: '10px',
                padding: '8px 10px',
                color: '#e2e8f0',
                fontWeight: 800,
              }}
            />
            <input
              value={slot.pos}
              onChange={(e) => onSetLineup(side, idx, slot.name, e.target.value)}
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(148, 163, 184, 0.25)',
                borderRadius: '10px',
                padding: '8px 10px',
                color: '#e2e8f0',
                fontWeight: 800,
              }}
            />
          </div>
        ))}
      </div>
      <div
        style={{
          background: 'rgba(255,255,255,0.03)',
          borderRadius: '12px',
          border: '1px dashed rgba(148, 163, 184, 0.25)',
          padding: '10px 12px',
          display: 'grid',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            value={benchInput.name}
            placeholder="후보 이름"
            onChange={(e) => onChangeBenchInput({ ...benchInput, name: e.target.value })}
            style={{
              flex: 1,
              minWidth: '120px',
              background: '#0b0f1a',
              border: '1px solid rgba(148, 163, 184, 0.3)',
              borderRadius: '10px',
              padding: '8px 10px',
              color: '#e2e8f0',
              fontWeight: 800,
            }}
          />
          <input
            value={benchInput.pos}
            placeholder="포지션"
            onChange={(e) => onChangeBenchInput({ ...benchInput, pos: e.target.value })}
            style={{
              width: '120px',
              background: '#0b0f1a',
              border: '1px solid rgba(148, 163, 184, 0.3)',
              borderRadius: '10px',
              padding: '8px 10px',
              color: '#e2e8f0',
              fontWeight: 800,
            }}
          />
          <button
            type="button"
            onClick={() => {
              if (!benchInput.name.trim()) return;
              onAddBench(side, benchInput.name, benchInput.pos || 'PH');
              onChangeBenchInput({ name: '', pos: '' });
            }}
            style={{
              padding: '10px 12px',
              borderRadius: '10px',
              border: '1px solid rgba(148, 163, 184, 0.3)',
              background: 'rgba(255,255,255,0.08)',
              color: '#cbd5e1',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            후보 추가
          </button>
        </div>
        <div style={{ display: 'grid', gap: '8px' }}>
          {bench.map((player, benchIdx) => (
            <div
              key={player.name + benchIdx}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 90px 1fr',
                alignItems: 'center',
                gap: '8px',
                background: 'rgba(255,255,255,0.02)',
                borderRadius: '10px',
                padding: '8px 10px',
                border: '1px solid rgba(148, 163, 184, 0.2)',
              }}
            >
              <div style={{ display: 'grid', gap: '2px' }}>
                <span style={{ fontWeight: 800 }}>{player.name}</span>
                <span style={{ color: '#94a3b8', fontWeight: 700 }}>{player.pos}</span>
              </div>
              <span style={{ color: '#94a3b8', fontSize: '12px', textAlign: 'center' }}>→ 라인업 투입</span>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {lineup.map((slot, idx) => (
                  <button
                    key={slot.name + idx}
                    type="button"
                    onClick={() => onSubstitute(side, benchIdx, idx)}
                    style={{
                      padding: '6px 8px',
                      borderRadius: '8px',
                      border: '1px solid rgba(148,163,184,0.3)',
                      background: 'rgba(255,255,255,0.04)',
                      color: '#cbd5e1',
                      fontWeight: 800,
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    {idx + 1}번
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RunnerModal({
  name,
  base,
  onClose,
  onStealSuccess,
  onCaught,
  onOut,
}: {
  name: string;
  base: number;
  onClose: () => void;
  onStealSuccess: () => void;
  onCaught: () => void;
  onOut: () => void;
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 1000,
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(420px, 100%)',
          background: '#0f172a',
          borderRadius: '16px',
          border: '1px solid rgba(148, 163, 184, 0.25)',
          padding: '18px',
          display: 'grid',
          gap: '12px',
          color: '#e2e8f0',
          boxShadow: '0 24px 60px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'grid', gap: '4px' }}>
            <span style={{ fontWeight: 900 }}>주자 액션</span>
            <span style={{ color: '#94a3b8', fontWeight: 700 }}>
              {base + 1}루 · {name}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '18px',
              cursor: 'pointer',
              fontWeight: 800,
            }}
          >
            ✕
          </button>
        </div>
        <div style={{ display: 'grid', gap: '8px', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          <RunnerActionButton label="도루 성공" color="#22c55e" onClick={onStealSuccess} />
          <RunnerActionButton label="도루자 아웃" color="#ef4444" onClick={onCaught} />
          <RunnerActionButton label="주루사" color="#ef4444" onClick={onOut} />
        </div>
      </div>
    </div>
  );
}

function RunnerActionButton({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '12px',
        borderRadius: '12px',
        border: '1px solid rgba(148, 163, 184, 0.25)',
        background: 'rgba(255,255,255,0.04)',
        color,
        fontWeight: 900,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}

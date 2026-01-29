import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDemoStore } from '../../shared/state/demoStore';

const defaultLiveSrc = 'https://www.youtube.com/embed/live_stream?channel=YOUR_CHANNEL_ID';

export default function ScoreboardLiveOverlayPage() {
  const { state, actions } = useDemoStore();
  const navigate = useNavigate();
  const matches = useMemo(() => state.matches.filter((m) => !m.deleted), [state.matches]);

  const buildAutoPlaySrc = (url: string) => {
    const base = url || defaultLiveSrc;
    const hasQuery = base.includes('?');
    const hasAutoplay = /[?&]autoplay=/i.test(base);
    const hasMute = /[?&]mute=/i.test(base);
    const hasPlaysinline = /[?&]playsinline=/i.test(base);
    const hasFs = /[?&]fs=/i.test(base);

    const params: string[] = [];
    if (!hasAutoplay) params.push('autoplay=1');
    if (!hasMute) params.push('mute=1');
    if (!hasPlaysinline) params.push('playsinline=1');
    if (!hasFs) params.push('fs=0'); // remove YouTube fullscreen button

    if (!params.length) return base;
    return `${base}${hasQuery ? '&' : '?'}${params.join('&')}`;
  };

  const youtubeLiveSrc = buildAutoPlaySrc((state.liveVideoUrl || '').trim() || defaultLiveSrc);
  const battingSide = state.half === 'top' ? 'away' : 'home';
  const inningHalfIcon = state.half === 'top' ? '▲' : '▼';
  const inningLabel = `${inningHalfIcon} ${state.inning}회${state.half === 'top' ? '초' : '말'}`;
  const lastPlay = state.lastPlay || '경기 대기 중';

  const toggleFullscreen = () => {
    const root = document.documentElement;
    if (!document.fullscreenElement) {
      void root.requestFullscreen?.();
    } else {
      void document.exitFullscreen?.();
    }
  };

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100vh',
        overflow: 'hidden',
        backgroundColor: '#020617',
      }}
    >
      <iframe
        title="AUBL Live Stream"
        src={youtubeLiveSrc}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          border: 'none',
        }}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 2,
          color: '#f8fafc',
          fontFamily: '"Inter", "Pretendard", sans-serif',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 24,
            right: 24,
            display: 'flex',
            gap: '8px',
            pointerEvents: 'auto',
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <select
            value={state.activeMatchId ?? ''}
            onChange={(e) => actions.selectMatch(e.target.value || null)}
            style={{
              padding: '8px 10px',
              borderRadius: '10px',
              border: '1px solid rgba(148,163,184,0.35)',
              background: 'rgba(15,23,42,0.9)',
              color: '#e2e8f0',
              minWidth: '220px',
              pointerEvents: 'auto',
            }}
          >
            {!state.activeMatchId ? (
              <option value="" disabled>
                중계로 볼 경기 선택
              </option>
            ) : null}
            {matches.map((match) => (
              <option key={match.id} value={match.id}>
                {match.homeTeamName} vs {match.awayTeamName} {match.status === 'inProgress' ? '· 진행중' : ''}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => navigate('/scoreboard-text')}
            style={{
              border: 'none',
              background: 'rgba(15,23,42,0.9)',
              color: '#e2e8f0',
              fontWeight: 800,
              fontSize: '13px',
              borderRadius: '999px',
              padding: '8px 14px',
              borderInline: '1px solid rgba(148,163,184,0.35)',
              cursor: 'pointer',
              boxShadow: '0 8px 20px rgba(0,0,0,0.35)',
            }}
          >
            문자중계
          </button>
          <button
            type="button"
            onClick={() => navigate('/scoreboard')}
            style={{
              border: 'none',
              background: 'rgba(15,23,42,0.9)',
              color: '#e2e8f0',
              fontWeight: 800,
              fontSize: '13px',
              borderRadius: '999px',
              padding: '8px 14px',
              borderInline: '1px solid rgba(148,163,184,0.35)',
              cursor: 'pointer',
              boxShadow: '0 8px 20px rgba(0,0,0,0.35)',
            }}
          >
            전광판
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            style={{
              border: 'none',
              background: 'rgba(15,23,42,0.9)',
              color: '#f97316',
              fontWeight: 800,
              fontSize: '13px',
              borderRadius: '999px',
              padding: '8px 14px',
              borderInline: '1px solid rgba(148,163,184,0.35)',
              cursor: 'pointer',
              boxShadow: '0 8px 20px rgba(0,0,0,0.35)',
            }}
          >
            브라우저 전체화면
          </button>
        </div>

        <div
          style={{
            position: 'absolute',
            top: 24,
            left: 24,
            background: 'rgba(15, 23, 42, 0.8)',
            border: '1px solid rgba(148, 163, 184, 0.3)',
            borderRadius: '16px',
            padding: '14px 18px',
            display: 'grid',
            gap: '8px',
            minWidth: '240px',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '20px',
              fontWeight: 700,
              color: battingSide === 'home' ? '#f97316' : '#f8fafc',
            }}
          >
            <span>{state.teamNames.home || 'HOME'}</span>
            <span>{state.score.home}</span>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '20px',
              fontWeight: 700,
              color: battingSide === 'away' ? '#f97316' : '#f8fafc',
            }}
          >
            <span>{state.teamNames.away || 'AWAY'}</span>
            <span>{state.score.away}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: '#cbd5f5', marginTop: '-2px' }}>
            <span>이닝</span>
            <span>{inningLabel}</span>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              alignItems: 'center',
              gap: '12px',
              paddingTop: '4px',
            }}
          >
            <CountLights balls={state.balls} strikes={state.strikes} outs={state.outs} />
            <BaseDiagram bases={state.bases} />
          </div>
        </div>

        <div
          style={{
            position: 'absolute',
            left: 24,
            right: 24,
            bottom: 24,
            background: 'rgba(15, 23, 42, 0.85)',
            border: '1px solid rgba(148, 163, 184, 0.3)',
            borderRadius: '14px',
            padding: '14px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            fontSize: '16px',
          }}
        >
          <span
            style={{
              fontWeight: 700,
              letterSpacing: '0.08em',
              color: '#f97316',
              textTransform: 'uppercase',
            }}
          >
            Last Play
          </span>
          <span style={{ color: '#e2e8f0' }}>{lastPlay}</span>
        </div>
      </div>
    </div>
  );
}

function CountLights({ balls, strikes, outs }: { balls: number; strikes: number; outs: number }) {
  const renderLights = (count: number, max: number, color: string, label: string) => (
    <div style={{ display: 'grid', gridTemplateColumns: '18px repeat(4, 12px)', gap: '4px', alignItems: 'center' }}>
      <span style={{ fontWeight: 800, color: '#cbd5e1', fontSize: '12px', width: '18px', display: 'inline-block' }}>
        {label}
      </span>
      {Array.from({ length: max }).map((_, idx) => {
        const isOn = idx < count;
        return (
          <div
            key={`${label}-${idx}`}
            style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              background: isOn ? color : 'rgba(148,163,184,0.2)',
              boxShadow: isOn ? `0 0 8px ${color}` : 'none',
              border: '1px solid rgba(148,163,184,0.4)',
            }}
          />
        );
      })}
    </div>
  );

  return (
    <div style={{ display: 'grid', gap: '4px' }}>
      {renderLights(balls, 3, '#22c55e', 'B')}
      {renderLights(strikes, 2, '#facc15', 'S')}
      {renderLights(outs, 2, '#ef4444', 'O')}
    </div>
  );
}

function BaseDiagram({ bases }: { bases: (string | null)[] }) {
  const hasRunner = (baseIndex: 0 | 1 | 2) => Boolean(bases[baseIndex]);
  const baseSize = 20;
  const buildBaseStyle = (active: boolean) => ({
    width: baseSize,
    height: baseSize,
    transform: 'rotate(45deg)',
    background: active ? '#f97316' : 'transparent',
    border: '2px solid rgba(148,163,184,0.6)',
    boxShadow: active ? '0 0 12px rgba(249,115,22,0.8)' : 'none',
  });

  return (
    <div
      style={{
        position: 'relative',
        width: 76,
        height: 76,
        display: 'grid',
        placeItems: 'center',
      }}
    >
      <div
        style={{
          ...buildBaseStyle(hasRunner(1)),
          position: 'absolute',
          top: 16,
          left: '50%',
          marginLeft: -baseSize / 2,
        }}
      />
      <div
        style={{
          ...buildBaseStyle(hasRunner(0)),
          position: 'absolute',
          bottom: 16,
          right: 12,
        }}
      />
      <div
        style={{
          ...buildBaseStyle(hasRunner(2)),
          position: 'absolute',
          bottom: 16,
          left: 12,
        }}
      />
    </div>
  );
}

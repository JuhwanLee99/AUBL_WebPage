import { useDemoStore } from '../../shared/state/demoStore';

const defaultLiveSrc = 'https://www.youtube.com/embed/live_stream?channel=YOUR_CHANNEL_ID';

export default function ScoreboardLiveOverlayPage() {
  const { state } = useDemoStore();
  if (!state.activeMatchId) {
    return (
      <div
        style={{
          display: 'grid',
          placeItems: 'center',
          height: '100vh',
          background: '#020617',
          color: '#e2e8f0',
          fontSize: '18px',
          fontWeight: 700,
          textAlign: 'center',
          padding: '24px',
        }}
      >
        기록원에서 경기를 선택해야 라이브 오버레이가 반영됩니다.
      </div>
    );
  }
  const youtubeLiveSrc = (state.liveVideoUrl || '').trim() || defaultLiveSrc;
  const battingSide = state.half === 'top' ? 'away' : 'home';
  const inningHalfIcon = state.half === 'top' ? '▲' : '▼';
  const inningLabel = `${inningHalfIcon} ${state.inning}회${state.half === 'top' ? '초' : '말'}`;
  const baseRunners = state.bases
    .map((runner, idx) => (runner ? `${idx + 1}루` : null))
    .filter((label): label is string => Boolean(label));
  const baseText = baseRunners.length ? baseRunners.join(', ') : '주자 없음';
  const countText = `B ${state.balls} · S ${state.strikes} · O ${state.outs}`;
  const lastPlay = state.lastPlay || '경기 대기 중';

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
        allowFullScreen
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
            left: 24,
            background: 'rgba(15, 23, 42, 0.8)',
            border: '1px solid rgba(148, 163, 184, 0.3)',
            borderRadius: '16px',
            padding: '16px 20px',
            display: 'grid',
            gap: '12px',
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
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: '#cbd5f5' }}>
            <span>이닝</span>
            <span>{inningLabel}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: '#cbd5f5' }}>
            <span>볼카운트</span>
            <span>{countText}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: '#cbd5f5' }}>
            <span>베이스</span>
            <span>{baseText}</span>
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

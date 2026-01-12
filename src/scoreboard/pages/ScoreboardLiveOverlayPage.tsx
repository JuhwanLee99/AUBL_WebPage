export default function ScoreboardLiveOverlayPage() {
  const youtubeLiveSrc = 'https://www.youtube.com/embed/live_stream?channel=YOUR_CHANNEL_ID';

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
          pointerEvents: 'none',
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
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '20px', fontWeight: 700 }}>
            <span>HOME</span>
            <span>3</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '20px', fontWeight: 700 }}>
            <span>AWAY</span>
            <span>2</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: '#cbd5f5' }}>
            <span>볼카운트</span>
            <span>2 - 1</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: '#cbd5f5' }}>
            <span>베이스</span>
            <span>1, 3</span>
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
          <span style={{ color: '#e2e8f0' }}>4회말 1사, 3루 주자 득점. 희생플라이.</span>
        </div>
      </div>
    </div>
  );
}
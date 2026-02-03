import { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDemoStore } from '../../shared/state/demoStore';

const defaultLiveSrc = 'https://www.youtube.com/embed/live_stream?channel=YOUR_CHANNEL_ID';

export default function ScoreboardLiveOverlayPage() {
  const { state, actions } = useDemoStore();
  const navigate = useNavigate();
  const matches = useMemo(() => state.matches.filter((m) => !m.deleted), [state.matches]);

  // 모바일 감지 함수
  const isMobileDevice = () => {
    const userAgent = navigator.userAgent || navigator.vendor || (window as Window & { opera?: string }).opera || '';
    const isMobileUA = /android|ipad|iphone|ipod/i.test(userAgent);
    const isPortrait = window.innerHeight > window.innerWidth;
    const isSmallScreen = Math.min(window.innerWidth, window.innerHeight) < 768;
    return isMobileUA || (isPortrait && isSmallScreen);
  };

  // 기본값: 모바일이면 회전된 상태(true), 데스크톱이면 정방향(false)
  // true일 경우: 90도 회전(세로 기기에서 꽉 차게 보기 위함)
  const [isRotated, setIsRotated] = useState(isMobileDevice());

  // 화면 크기에 따른 UI 스케일 계산 (모바일에서 더 작게 보이도록)
  const [uiScale, setUiScale] = useState(1);

  // 지연된 상태 (유튜브 라이브 지연시간 고려)
  const [delayedState, setDelayedState] = useState(state);

  // 음소거 상태
  const [isMuted, setIsMuted] = useState(true);

  // 음소거 버튼 카운트다운 (초)
  const [unmuteCountdown, setUnmuteCountdown] = useState(10);

  // 전체 화면 상태 (iOS용 가상 전체 화면)
  const [isFullscreen, setIsFullscreen] = useState(false);

  // iOS 감지
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

  // Fullscreen API 지원 여부
  const supportsFullscreen = !isIOS && 'requestFullscreen' in document.documentElement;

  // 카운트다운 타이머
  useEffect(() => {
    // 음소거가 해제되었으면 카운트다운 초기화
    if (!isMuted) {
      setUnmuteCountdown(10);
      return;
    }

    // 카운트다운이 0이면 종료
    if (unmuteCountdown <= 0) {
      return;
    }

    // 1초마다 카운트다운 감소
    const timer = setInterval(() => {
      setUnmuteCountdown((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [isMuted, unmuteCountdown]);

  useEffect(() => {
    const handleResize = () => {
      // 화면 너비가 작을수록(모바일) 스케일을 줄임 (기본 1, 모바일 약 0.8~0.9)
      const width = window.innerWidth;
      const height = window.innerHeight;
      const minDim = Math.min(width, height);

      // 기준을 400px ~ 1000px 사이로 잡고 스케일링
      if (minDim < 500) setUiScale(0.75);
      else if (minDim < 800) setUiScale(0.85);
      else setUiScale(1);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Fullscreen 상태 변경 감지 (안드로이드/데스크톱용)
  useEffect(() => {
    if (!supportsFullscreen) return;

    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = Boolean(document.fullscreenElement);
      setIsFullscreen(isCurrentlyFullscreen);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [supportsFullscreen]);

  // 유튜브 라이브 지연시간을 고려한 상태 업데이트
  useEffect(() => {
    const delayMs = state.liveDelaySeconds * 1000;

    // 지연시간이 0이면 즉시 업데이트
    if (delayMs === 0) {
      setDelayedState(state);
      return;
    }

    // 지연시간만큼 기다린 후 업데이트
    const timer = setTimeout(() => {
      setDelayedState(state);
    }, delayMs);

    return () => clearTimeout(timer);
  }, [state]);

  const buildAutoPlaySrc = (url: string, muted: boolean) => {
    const base = url || defaultLiveSrc;
    const hasQuery = base.includes('?');
    const hasAutoplay = /[?&]autoplay=/i.test(base);
    const hasMute = /[?&]mute=/i.test(base);
    const hasPlaysinline = /[?&]playsinline=/i.test(base);
    const hasFs = /[?&]fs=/i.test(base);

    const params: string[] = [];
    if (!hasAutoplay) params.push('autoplay=1');
    if (!hasMute) params.push(`mute=${muted ? '1' : '0'}`);
    if (!hasPlaysinline) params.push('playsinline=1');
    if (!hasFs) params.push('fs=0');

    if (!params.length) return base;
    return `${base}${hasQuery ? '&' : '?'}${params.join('&')}`;
  };

  const youtubeLiveSrc = buildAutoPlaySrc((state.liveVideoUrl || '').trim() || defaultLiveSrc, isMuted);
  const battingSide = delayedState.half === 'top' ? 'away' : 'home';
  const fieldingSide = battingSide === 'home' ? 'away' : 'home';
  const inningHalfIcon = delayedState.half === 'top' ? '▲' : '▼';
  const inningLabel = `${inningHalfIcon} ${delayedState.inning}회${delayedState.half === 'top' ? '초' : '말'}`;
  const lastPlay = delayedState.lastPlay || '경기 대기 중';

  // 현재 투수 정보 (수비팀의 1번 포지션)
  const currentPitcher = useMemo(() => {
    const pitcher = delayedState.lineups[fieldingSide]?.[0];
    if (!pitcher || !pitcher.name) return null;
    return {
      name: pitcher.name,
      pitchCount: delayedState.pitchCount,
      balls: delayedState.balls,
      strikes: delayedState.strikes,
    };
  }, [delayedState.lineups, delayedState.pitchCount, delayedState.balls, delayedState.strikes, fieldingSide]);

  // 현재 타자 정보
  const currentBatter = useMemo(() => {
    const batterIdx = delayedState.batterIndex[battingSide];
    const batter = delayedState.lineups[battingSide]?.[batterIdx];
    if (!batter || !batter.name) return null;

    // 타자의 오늘 기록 계산 (events에서)
    let atBats = 0;
    let hits = 0;
    let walks = 0;
    let strikeouts = 0;

    if (delayedState.events && Array.isArray(delayedState.events)) {
      delayedState.events.forEach((event: { batterName?: string; batterSide?: string; result?: string }) => {
        if (event.batterName === batter.name && event.batterSide === battingSide) {
          // 타수 계산
          if (event.result === 'single' || event.result === 'double' ||
              event.result === 'triple' || event.result === 'homerun' ||
              event.result === 'out' || event.result === 'fieldersChoice') {
            atBats++;
          }
          // 안타 계산
          if (event.result === 'single' || event.result === 'double' ||
              event.result === 'triple' || event.result === 'homerun') {
            hits++;
          }
          // 볼넷
          if (event.result === 'walk' || event.result === 'intentionalWalk') {
            walks++;
          }
          // 삼진
          if (event.result === 'strikeOut') {
            strikeouts++;
            atBats++;
          }
        }
      });
    }

    return {
      name: batter.name,
      atBats,
      hits,
      walks,
      strikeouts,
      avg: atBats > 0 ? (hits / atBats).toFixed(3).substring(1) : '.000',
    };
  }, [delayedState.lineups, delayedState.batterIndex, delayedState.events, battingSide]);

  const toggleFullscreen = () => {
    if (isIOS || !supportsFullscreen) {
      // iOS 또는 Fullscreen API 미지원: CSS 가상 전체 화면 토글
      setIsFullscreen((prev) => !prev);
    } else {
      // 안드로이드/데스크톱: 실제 Fullscreen API 사용
      const root = document.documentElement;
      if (!document.fullscreenElement) {
        void root.requestFullscreen?.();
      } else {
        void document.exitFullscreen?.();
      }
    }
  };

  const containerStyle: React.CSSProperties = isRotated
    ? {
        width: 'min(100vh, calc(100vw * 1.7778))',
        height: 'min(100vw, calc(100vh / 1.7778))',
        transform: 'rotate(90deg)',
        transformOrigin: 'center center',
        position: 'absolute',
        boxShadow: '0 0 50px rgba(0,0,0,0.5)',
      }
    : {
        width: 'min(100vw, calc(100vh * 1.7778))',
        height: 'min(100vh, calc(100vw / 1.7778))',
        aspectRatio: '16 / 9',
        transform: 'none',
        position: 'relative',
        boxShadow: '0 0 50px rgba(0,0,0,0.5)',
      };

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        backgroundColor: isFullscreen ? '#000000' : '#020617',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        position: isFullscreen ? 'fixed' : 'relative',
        top: isFullscreen ? 0 : undefined,
        left: isFullscreen ? 0 : undefined,
        zIndex: isFullscreen ? 9999 : undefined,
      }}
    >
      <div style={containerStyle}>
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
        
        {/* 오버레이 UI 레이어: uiScale 적용 */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 2,
            color: '#f8fafc',
            fontFamily: '"Inter", "Pretendard", sans-serif',
            pointerEvents: 'none',
            fontSize: `${16 * uiScale}px`, // 기본 폰트 사이즈 스케일링
          }}
        >
          {/* 상단 컨트롤 버튼 그룹 */}
          <div
            style={{
              position: 'absolute',
              top: 12 * uiScale, // 여백 축소
              right: 12 * uiScale,
              display: 'flex',
              gap: 6 * uiScale,
              pointerEvents: 'auto',
              alignItems: 'center',
              flexWrap: 'wrap',
              justifyContent: 'flex-end',
              transformOrigin: 'top right',
            }}
          >
            <select
              value={state.activeMatchId ?? ''}
              onChange={(e) => actions.selectMatch(e.target.value || null)}
              style={{
                padding: `${6 * uiScale}px ${8 * uiScale}px`,
                borderRadius: '8px',
                border: '1px solid rgba(148,163,184,0.35)',
                background: 'rgba(15,23,42,0.9)',
                color: '#e2e8f0',
                fontSize: `${12 * uiScale}px`,
                minWidth: `${180 * uiScale}px`,
                maxWidth: `${250 * uiScale}px`,
                pointerEvents: 'auto',
              }}
            >
              {!state.activeMatchId ? (
                <option value="" disabled>
                  경기 선택
                </option>
              ) : null}
              {matches.map((match) => (
                <option key={match.id} value={match.id}>
                  {match.awayTeamName} vs {match.homeTeamName}
                </option>
              ))}
            </select>
            {/* 동접자 수 표시 */}
            <span
              style={{
                padding: `${5 * uiScale}px ${10 * uiScale}px`,
                borderRadius: '8px',
                background: 'rgba(34, 197, 94, 0.15)',
                color: '#22c55e',
                fontSize: `${11 * uiScale}px`,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: `${5 * uiScale}px`,
              }}
            >
              <span style={{ fontSize: `${13 * uiScale}px` }}>👥</span>
              {state.onlineViewerCount}명
            </span>
            <button
              type="button"
              onClick={() => navigate('/scoreboard-text')}
              style={{ ...controlButtonStyle, padding: `${6 * uiScale}px ${10 * uiScale}px`, fontSize: `${11 * uiScale}px` }}
            >
              문자중계
            </button>
            <button
              type="button"
              onClick={toggleFullscreen}
              style={{ ...controlButtonStyle, padding: `${6 * uiScale}px ${10 * uiScale}px`, fontSize: `${11 * uiScale}px`, color: isFullscreen ? '#22c55e' : '#f97316' }}
              title={isIOS ? 'iOS 가상 전체 화면' : supportsFullscreen ? '전체 화면' : '전체 화면 API 미지원'}
            >
              {isFullscreen ? '전체화면 해제' : '전체화면'}
              {isIOS && ' (iOS)'}
            </button>
            <button
              type="button"
              onClick={() => setIsMuted((prev) => !prev)}
              style={{
                ...controlButtonStyle,
                color: isMuted ? '#f87171' : '#22c55e',
                padding: `${6 * uiScale}px ${10 * uiScale}px`,
                fontSize: `${11 * uiScale}px`,
                fontWeight: 900,
              }}
              title={isMuted ? "소리 켜기" : "소리 끄기"}
            >
              {isMuted ? '🔇 소리 켜기' : '🔊 음소거'}
            </button>
            <button
              type="button"
              onClick={() => setIsRotated((prev) => !prev)}
              style={{ 
                ...controlButtonStyle, 
                color: '#38bdf8',
                padding: `${6 * uiScale}px ${8 * uiScale}px`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="화면 회전"
            >
               <svg 
                xmlns="http://www.w3.org/2000/svg" 
                width={16 * uiScale} 
                height={16 * uiScale} 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2.5" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              >
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
            </button>
          </div>

          {/* 왼쪽 상단 점수판 (컴팩트 버전) */}
          <div
            style={{
              position: 'absolute',
              top: 12 * uiScale,
              left: 12 * uiScale,
              background: 'rgba(15, 23, 42, 0.8)',
              border: '1px solid rgba(148, 163, 184, 0.3)',
              borderRadius: '12px',
              padding: `${10 * uiScale}px ${14 * uiScale}px`, // 패딩 축소
              display: 'grid',
              gap: `${6 * uiScale}px`,
              minWidth: `${200 * uiScale}px`,
            }}
          >
            {/* Away Score */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: `${18 * uiScale}px`, // 폰트 축소
                fontWeight: 700,
                color: battingSide === 'away' ? '#f97316' : '#f8fafc',
                lineHeight: 1.1,
              }}
            >
              <span>{delayedState.teamNames.away || 'AWAY'}</span>
              <span>{delayedState.score.away}</span>
            </div>
            {/* Home Score */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: `${18 * uiScale}px`, // 폰트 축소
                fontWeight: 700,
                color: battingSide === 'home' ? '#f97316' : '#f8fafc',
                lineHeight: 1.1,
              }}
            >
              <span>{delayedState.teamNames.home || 'HOME'}</span>
              <span>{delayedState.score.home}</span>
            </div>
            {/* Inning */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: `${13 * uiScale}px`,
                color: '#cbd5f5',
                marginTop: 0,
                paddingBottom: `${2 * uiScale}px`,
                borderBottom: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              <span>이닝</span>
              <span>{inningLabel}</span>
            </div>
            {/* BSO & Base */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                alignItems: 'center',
                gap: `${10 * uiScale}px`,
                paddingTop: `${2 * uiScale}px`,
              }}
            >
              <CountLights balls={delayedState.balls} strikes={delayedState.strikes} outs={delayedState.outs} scale={uiScale} />
              <BaseDiagram bases={delayedState.bases} scale={uiScale} />
            </div>
          </div>

          {/* 중앙 음소거 해제 버튼 (음소거 상태일 때만 10초간 표시) */}
          {isMuted && unmuteCountdown > 0 && (
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'auto',
                zIndex: 10,
              }}
            >
              <button
                type="button"
                onClick={() => setIsMuted(false)}
                style={{
                  padding: `${20 * uiScale}px ${40 * uiScale}px`,
                  borderRadius: '16px',
                  border: '3px solid #ef4444',
                  background: 'linear-gradient(135deg, rgba(239,68,68,0.95), rgba(220,38,38,0.95))',
                  color: '#ffffff',
                  fontSize: `${24 * uiScale}px`,
                  fontWeight: 900,
                  cursor: 'pointer',
                  boxShadow: '0 8px 32px rgba(239,68,68,0.6), 0 0 0 4px rgba(255,255,255,0.2)',
                  transition: 'all 0.3s',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: `${8 * uiScale}px`,
                  animation: 'pulse 2s infinite',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.05)';
                  e.currentTarget.style.boxShadow = '0 12px 40px rgba(239,68,68,0.8), 0 0 0 6px rgba(255,255,255,0.3)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.boxShadow = '0 8px 32px rgba(239,68,68,0.6), 0 0 0 4px rgba(255,255,255,0.2)';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: `${12 * uiScale}px` }}>
                  <span style={{ fontSize: `${32 * uiScale}px` }}>🔇</span>
                  <span>소리 켜기</span>
                </div>
                <span style={{
                  fontSize: `${16 * uiScale}px`,
                  fontWeight: 600,
                  opacity: 0.9,
                  color: '#fecaca'
                }}>
                  {unmuteCountdown}초 후 자동 숨김
                </span>
              </button>
            </div>
          )}

          {/* 하단 Last Play */}
          <div
            style={{
              position: 'absolute',
              left: 12 * uiScale,
              right: 12 * uiScale,
              bottom: 12 * uiScale,
              background: 'rgba(15, 23, 42, 0.85)',
              border: '1px solid rgba(148, 163, 184, 0.3)',
              borderRadius: '10px',
              padding: `${8 * uiScale}px ${12 * uiScale}px`,
              display: 'flex',
              alignItems: 'center',
              gap: `${12 * uiScale}px`,
              fontSize: `${14 * uiScale}px`,
            }}
          >
            {/* Last Play 영역 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: `${12 * uiScale}px`, flex: 1, minWidth: 0 }}>
              <span
                style={{
                  fontWeight: 700,
                  letterSpacing: '0.05em',
                  color: '#f97316',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                  fontSize: `${12 * uiScale}px`,
                }}
              >
                Last Play
              </span>
              <span style={{ color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                {lastPlay}
              </span>
            </div>

            {/* 투수/타자 정보 영역 */}
            <div style={{
              display: 'flex',
              gap: `${16 * uiScale}px`,
              alignItems: 'center',
              borderLeft: '1px solid rgba(148, 163, 184, 0.3)',
              paddingLeft: `${12 * uiScale}px`,
            }}>
              {/* 투수 정보 */}
              {currentPitcher && (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: `${2 * uiScale}px`,
                  alignItems: 'flex-end',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: `${6 * uiScale}px` }}>
                    <span style={{ fontSize: `${10 * uiScale}px`, color: '#94a3b8', fontWeight: 600 }}>P</span>
                    <span style={{ fontSize: `${13 * uiScale}px`, fontWeight: 700, color: '#e2e8f0' }}>
                      {currentPitcher.name}
                    </span>
                  </div>
                  <div style={{ fontSize: `${11 * uiScale}px`, color: '#cbd5e1', fontWeight: 600 }}>
                    {currentPitcher.pitchCount}구 (B{currentPitcher.balls} S{currentPitcher.strikes})
                  </div>
                </div>
              )}

              {/* 타자 정보 */}
              {currentBatter && (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: `${2 * uiScale}px`,
                  alignItems: 'flex-end',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: `${6 * uiScale}px` }}>
                    <span style={{ fontSize: `${10 * uiScale}px`, color: '#94a3b8', fontWeight: 600 }}>AB</span>
                    <span style={{ fontSize: `${13 * uiScale}px`, fontWeight: 700, color: '#e2e8f0' }}>
                      {currentBatter.name}
                    </span>
                  </div>
                  <div style={{ fontSize: `${11 * uiScale}px`, color: '#cbd5e1', fontWeight: 600 }}>
                    {currentBatter.atBats}타수 {currentBatter.hits}안타 ({currentBatter.avg})
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const controlButtonStyle: React.CSSProperties = {
  border: 'none',
  background: 'rgba(15,23,42,0.9)',
  color: '#e2e8f0',
  fontWeight: 800,
  borderRadius: '999px',
  borderInline: '1px solid rgba(148,163,184,0.35)',
  cursor: 'pointer',
  boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
  whiteSpace: 'nowrap',
  transition: 'all 0.2s',
};

function CountLights({ balls, strikes, outs, scale = 1 }: { balls: number; strikes: number; outs: number; scale?: number }) {
  const renderLights = (count: number, max: number, color: string, label: string) => (
    <div style={{ display: 'grid', gridTemplateColumns: `${16 * scale}px repeat(4, ${10 * scale}px)`, gap: `${3 * scale}px`, alignItems: 'center' }}>
      <span style={{ fontWeight: 800, color: '#cbd5e1', fontSize: `${11 * scale}px`, width: `${16 * scale}px`, display: 'inline-block' }}>
        {label}
      </span>
      {Array.from({ length: max }).map((_, idx) => {
        const isOn = idx < count;
        return (
          <div
            key={`${label}-${idx}`}
            style={{
              width: `${10 * scale}px`,
              height: `${10 * scale}px`,
              borderRadius: '50%',
              background: isOn ? color : 'rgba(148,163,184,0.2)',
              boxShadow: isOn ? `0 0 ${6 * scale}px ${color}` : 'none',
              border: '1px solid rgba(148,163,184,0.4)',
            }}
          />
        );
      })}
    </div>
  );

  return (
    <div style={{ display: 'grid', gap: `${3 * scale}px` }}>
      {renderLights(balls, 3, '#22c55e', 'B')}
      {renderLights(strikes, 2, '#facc15', 'S')}
      {renderLights(outs, 2, '#ef4444', 'O')}
    </div>
  );
}

function BaseDiagram({ bases, scale = 1 }: { bases: (string | null)[]; scale?: number }) {
  const hasRunner = (baseIndex: 0 | 1 | 2) => Boolean(bases[baseIndex]);
  const baseSize = 16 * scale; // 베이스 크기 축소
  const containerSize = 60 * scale; // 컨테이너 크기 축소

  const buildBaseStyle = (active: boolean) => ({
    width: baseSize,
    height: baseSize,
    transform: 'rotate(45deg)',
    background: active ? '#f97316' : 'transparent',
    border: '2px solid rgba(148,163,184,0.6)',
    boxShadow: active ? `0 0 ${8 * scale}px rgba(249,115,22,0.8)` : 'none',
  });

  return (
    <div
      style={{
        position: 'relative',
        width: containerSize,
        height: containerSize,
        display: 'grid',
        placeItems: 'center',
      }}
    >
      <div
        style={{
          ...buildBaseStyle(hasRunner(1)),
          position: 'absolute',
          top: containerSize * 0.15,
          left: '50%',
          marginLeft: -baseSize / 2,
        }}
      />
      <div
        style={{
          ...buildBaseStyle(hasRunner(0)),
          position: 'absolute',
          bottom: containerSize * 0.15,
          right: containerSize * 0.1,
        }}
      />
      <div
        style={{
          ...buildBaseStyle(hasRunner(2)),
          position: 'absolute',
          bottom: containerSize * 0.15,
          left: containerSize * 0.1,
        }}
      />
    </div>
  );
}

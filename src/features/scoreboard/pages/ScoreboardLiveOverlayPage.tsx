import { useMemo, useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useDemoStore } from '@shared/state/demoStore';
import { useAdmin } from '@shared/auth/useAdmin';

const defaultLiveSrc = 'https://www.youtube.com/embed/live_stream?channel=YOUR_CHANNEL_ID';

type PlayerNameParts = { raw: string; base: string; number?: string };

function parsePlayerName(raw: string | null | undefined): PlayerNameParts {
  const trimmed = (raw ?? '').trim();
  const match = trimmed.match(/^(.*?)(?:\(([^)]*)\))?\s*$/);
  const base = (match?.[1] ?? '').trim();
  const number = (match?.[2] ?? '').trim();
  return { raw: trimmed, base, number: number || undefined };
}

function isSamePlayerName(a: string | null | undefined, b: string | null | undefined): boolean {
  const pa = parsePlayerName(a);
  const pb = parsePlayerName(b);
  if (!pa.base || !pb.base) return (pa.raw || '') === (pb.raw || '');
  if (pa.base !== pb.base) return false;
  if (pa.number && pb.number) return pa.number === pb.number;
  return true;
}

function classifyResult(result: string) {
  const normalized = result.replace(/\s+/g, '');
  if (normalized.includes('홈런')) return 'hr' as const;
  if (normalized.includes('3루타')) return 'triple' as const;
  if (normalized.includes('2루타')) return 'double' as const;
  if (normalized.includes('1루타')) return 'single' as const;
  if (normalized.includes('고의') || normalized.toUpperCase().includes('IB')) return 'bb' as const;
  if (normalized.includes('볼넷')) return 'bb' as const;
  if (normalized.includes('몸에맞는공')) return 'hbp' as const;
  if (normalized.includes('타격방해')) return 'ci' as const;
  if (normalized.includes('야수선택') || normalized.toUpperCase().includes('F.C')) return 'fc' as const;
  if (normalized.includes('희생플라이')) return 'sac' as const;
  if (normalized.includes('희생번트')) return 'sac' as const;
  if (normalized.includes('낫아웃')) return 'so_reach' as const;
  if (normalized.includes('삼진')) return 'so' as const;
  if (normalized.includes('아웃') && !normalized.includes('도루')) return 'out' as const;
  return null;
}

export default function ScoreboardLiveOverlayPage() {
  const { state, actions } = useDemoStore();
  const { selectMatch } = actions;
  const { isAdmin } = useAdmin();
  const navigate = useNavigate();
  const { matchId } = useParams<{ matchId?: string }>();
  const matches = useMemo(() => state.matches.filter((m) => !m.deleted), [state.matches]);
  const activeMatch = useMemo(
    () => state.matches.find((match) => match.id === state.activeMatchId) ?? null,
    [state.matches, state.activeMatchId],
  );
  const lineupVisible = isAdmin || state.gameStarted || Boolean(activeMatch?.lineupPublic);

  useEffect(() => {
    if (matchId && matchId !== state.activeMatchId) {
      const matchExists = state.matches.some((m) => m.id === matchId);
      if (matchExists) {
        selectMatch(matchId);
      }
    }
  }, [matchId, state.activeMatchId, state.matches, selectMatch]);

  useEffect(() => {
    if (!matchId && state.activeMatchId) {
      navigate(`/live-overlay/${state.activeMatchId}`, { replace: true });
    }
  }, [matchId, state.activeMatchId, navigate]);

  // 모바일 감지 함수
  const isMobileDevice = () => {
    const userAgent = navigator.userAgent || navigator.vendor || (window as Window & { opera?: string }).opera || '';
    const isMobileUA = /android|iphone|ipod/i.test(userAgent);
    const isSmallScreen = Math.min(window.innerWidth, window.innerHeight) < 768;
    // 태블릿(iPad, 대화면 Android)은 제외하고, 작은 모바일만 회전 기본값 적용
    return isMobileUA && isSmallScreen;
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
  const [showUnmuteHint, setShowUnmuteHint] = useState(true);

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
      const resetTimer = setTimeout(() => setUnmuteCountdown(10), 0);
      return () => clearTimeout(resetTimer);
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

  // 우측 상단 음소거 해제 안내 메시지 (5초 표시)
  useEffect(() => {
    const timer = setTimeout(() => setShowUnmuteHint(false), 5000);
    return () => clearTimeout(timer);
  }, []);

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
      const immediateTimer = setTimeout(() => setDelayedState(state), 0);
      return () => clearTimeout(immediateTimer);
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
    if (!lineupVisible) return null;
    const pitcher = delayedState.lineups[fieldingSide]?.[0];
    if (!pitcher || !pitcher.name) return null;
    return {
      name: pitcher.name,
      pitchCount: delayedState.pitchCount,
      balls: delayedState.balls,
      strikes: delayedState.strikes,
    };
  }, [delayedState.lineups, delayedState.pitchCount, delayedState.balls, delayedState.strikes, fieldingSide, lineupVisible]);

  // 현재 타자 정보
  const currentBatter = useMemo(() => {
    if (!lineupVisible) return null;
    const batterIdx = delayedState.batterIndex[battingSide];
    const batter = delayedState.lineups[battingSide]?.[batterIdx];
    if (!batter || !batter.name) return null;

    // 타자의 오늘 기록 계산 (feed 기반)
    let atBats = 0;
    let hits = 0;
    let walks = 0;
    let strikeouts = 0;

    (delayedState.feed ?? []).forEach((entry) => {
      const side = entry.half === 'top' ? 'away' : 'home';
      if (side !== battingSide) return;
      if (!isSamePlayerName(entry.batter, batter.name)) return;
      const kind = classifyResult(entry.result || '');
      switch (kind) {
        case 'single':
          hits += 1;
          atBats += 1;
          break;
        case 'double':
          hits += 1;
          atBats += 1;
          break;
        case 'triple':
          hits += 1;
          atBats += 1;
          break;
        case 'hr':
          hits += 1;
          atBats += 1;
          break;
        case 'so':
          strikeouts += 1;
          atBats += 1;
          break;
        case 'so_reach':
          strikeouts += 1;
          atBats += 1;
          break;
        case 'out':
          atBats += 1;
          break;
        case 'fc':
          atBats += 1;
          break;
        case 'bb':
          walks += 1;
          break;
        default:
          break;
      }
    });

    return {
      name: batter.name,
      atBats,
      hits,
      walks,
      strikeouts,
      avg: atBats > 0 ? (hits / atBats).toFixed(3).substring(1) : '.000',
    };
  }, [delayedState.lineups, delayedState.batterIndex, delayedState.feed, battingSide, lineupVisible]);

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
      <style>
        {`
          @keyframes muteGlow {
            0% { box-shadow: 0 0 0 1px rgba(248,113,113,0.35), 0 0 10px rgba(248,113,113,0.25); }
            50% { box-shadow: 0 0 0 2px rgba(248,113,113,0.65), 0 0 22px rgba(248,113,113,0.55); }
            100% { box-shadow: 0 0 0 1px rgba(248,113,113,0.35), 0 0 10px rgba(248,113,113,0.25); }
          }
        `}
      </style>
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
              onChange={(e) => {
                const nextId = e.target.value || null;
                actions.selectMatch(nextId);
                if (nextId) {
                  navigate(`/live-overlay/${nextId}`);
                } else {
                  navigate('/live-overlay');
                }
              }}
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
              onClick={() =>
                navigate(state.activeMatchId ? `/scoreboard-text/${state.activeMatchId}` : '/scoreboard-text')
              }
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
                border: isMuted && unmuteCountdown > 0
                  ? '1px solid rgba(248,113,113,0.8)'
                  : undefined,
                animation: isMuted && unmuteCountdown > 0 ? 'muteGlow 2.4s ease-in-out infinite' : undefined,
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

          {showUnmuteHint && isMuted && (
            <div
              style={{
                position: 'absolute',
                top: '24%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                padding: `${14 * uiScale}px ${22 * uiScale}px`,
                borderRadius: '16px',
                background: 'rgba(15,23,42,0.85)',
                border: '2px solid rgba(248,113,113,0.85)',
                color: '#fee2e2',
                fontSize: `${16 * uiScale}px`,
                fontWeight: 900,
                whiteSpace: 'nowrap',
                boxShadow:
                  '0 22px 56px rgba(15,23,42,0.75), 0 0 0 2px rgba(248,113,113,0.35), 0 0 36px rgba(248,113,113,0.9), 0 0 70px rgba(248,113,113,0.7)',
                pointerEvents: 'none',
              }}
            >
              우측 상단 음소거 해제
            </div>
          )}

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

          {/* 중앙 음소거 해제 버튼 제거됨 */}

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

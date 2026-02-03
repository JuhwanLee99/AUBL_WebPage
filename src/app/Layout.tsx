// **`src/app/Layout.tsx`**

import { Outlet, Link, useLocation } from 'react-router-dom';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../shared/auth/AuthProvider';
import { useAdmin } from '../shared/auth/useAdmin';
import { useDemoStore } from '../shared/state/demoStore';
import { ContentProvider } from '../shared/state/contentProvider';

const NOTIFICATION_PROMPT_KEY = 'aubl:notificationPrompt:v1';
const NOTIFICATION_PROMPT_SNOOZE_MS = 1000 * 60 * 60 * 24; // 24시간 동안 재등장 방지
const NOTIFICATION_PROMPT_SNOOZE_WEEK_MS = NOTIFICATION_PROMPT_SNOOZE_MS * 7; // 1주일 동안 재등장 방지
const MOBILE_NOTICE_KEY = 'aubl:mobileNotice:v1';
const MOBILE_NOTICE_SNOOZE_MS = 1000 * 60 * 60 * 24; // 모바일 팝업 24시간 스누즈

export default function Layout() {
  const location = useLocation();
  const { user, logout, initializing } = useAuth();
  const { isAdmin, roleLabel, roleDetail } = useAdmin();
  const { state } = useDemoStore();
  const isLiveOverlay = location.pathname === '/live-overlay';
  const isScoreboardText = location.pathname === '/scoreboard-text';
  const isLanding = location.pathname === '/';
  const headerInnerRef = useRef<HTMLDivElement>(null);
  const linkRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches ? 'mobile' : 'desktop',
  );
  const [showNotificationPrompt, setShowNotificationPrompt] = useState(false);
  const [notificationRequesting, setNotificationRequesting] = useState(false);
  const [notificationBlocked, setNotificationBlocked] = useState(false);
  const [showMobileNotice, setShowMobileNotice] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-preview-mode', previewMode);
  }, [previewMode]);

  // 초기 진입 시(SSR 포함) 모바일 폭이면 모바일 모드로 강제 전환 (테블릿 이상은 데스크톱 유지)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const isNarrowMobile = window.matchMedia('(max-width: 640px)').matches;
    setPreviewMode(isNarrowMobile ? 'mobile' : 'desktop');
  }, []);

  // 첫 방문 모바일 사용자에게 PC 최적화 안내
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isLiveOverlay) return;
    const isMobileViewport = window.matchMedia('(max-width: 768px)').matches;
    if (!isMobileViewport) return;
    const stored = window.localStorage.getItem(MOBILE_NOTICE_KEY);
    let snoozedUntil = 0;
    let dismissedPermanently = false;
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as { snoozedUntil?: number; dismissedPermanently?: boolean; updatedAt?: number };
        snoozedUntil = parsed.snoozedUntil ?? 0;
        dismissedPermanently = Boolean(parsed.dismissedPermanently);
      } catch {
        // 기존 ISO 문자열 등은 무시하고 다시 표시
      }
    }
    const now = Date.now();
    if (dismissedPermanently) return;
    if (now < snoozedUntil) return;
    setShowMobileNotice(true);
  }, [isLiveOverlay]);

  const handleMobileNoticeConfirm = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(MOBILE_NOTICE_KEY, JSON.stringify({ updatedAt: Date.now(), lastAction: 'confirm' }));
    }
    setShowMobileNotice(false);
  }, []);

  const handleMobileNoticeSnoozeDay = useCallback(() => {
    if (typeof window !== 'undefined') {
      const now = Date.now();
      window.localStorage.setItem(
        MOBILE_NOTICE_KEY,
        JSON.stringify({ updatedAt: now, lastAction: 'snooze', snoozedUntil: now + MOBILE_NOTICE_SNOOZE_MS }),
      );
    }
    setShowMobileNotice(false);
  }, []);

  const handleMobileNoticeNever = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(
        MOBILE_NOTICE_KEY,
        JSON.stringify({ updatedAt: Date.now(), lastAction: 'never', dismissedPermanently: true }),
      );
    }
    setShowMobileNotice(false);
  }, []);

  // 첫 방문 시에만 노출되는 경기 시작 알림 CTA (사용자 제스처로 권한 요청)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof Notification === 'undefined') return;
    if (isLiveOverlay) return; // 오버레이 뷰에서는 불필요

    const now = Date.now();
    const stored = window.localStorage.getItem(NOTIFICATION_PROMPT_KEY);
    let snoozedUntil = 0;
    let blockedSnoozedUntil = 0;
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as {
          snoozedAt?: number;
          snoozedUntil?: number;
          blockedSnoozedUntil?: number;
          permission?: NotificationPermission;
        };
        if (parsed.permission === 'granted') {
          setShowNotificationPrompt(false);
          setNotificationBlocked(false);
          return;
        }
        if (typeof parsed.snoozedUntil === 'number') {
          snoozedUntil = parsed.snoozedUntil;
        } else if (typeof parsed.snoozedAt === 'number') {
          // backward compatibility with previous single-day snooze
          snoozedUntil = parsed.snoozedAt + NOTIFICATION_PROMPT_SNOOZE_MS;
        }
        if (typeof parsed.blockedSnoozedUntil === 'number') {
          blockedSnoozedUntil = parsed.blockedSnoozedUntil;
        }
      } catch {
        // ignore malformed cache
      }
    }

    if (Notification.permission === 'granted') {
      window.localStorage.setItem(NOTIFICATION_PROMPT_KEY, JSON.stringify({ permission: 'granted', updatedAt: now }));
      setShowNotificationPrompt(false);
      setNotificationBlocked(false);
      return;
    }

    if (Notification.permission === 'denied') {
      if (now < blockedSnoozedUntil) {
        setNotificationBlocked(false);
        setShowNotificationPrompt(false);
        return;
      }
      window.localStorage.setItem(NOTIFICATION_PROMPT_KEY, JSON.stringify({ permission: 'denied', updatedAt: now }));
      setNotificationBlocked(true);
      setShowNotificationPrompt(false);
      return;
    }

    if (now < snoozedUntil) {
      setShowNotificationPrompt(false);
      return;
    }

    setShowNotificationPrompt(true);
    setNotificationBlocked(false);
  }, [isLiveOverlay]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, [location.pathname]);

  const handleRequestNotification = useCallback(async () => {
    if (typeof window === 'undefined' || typeof Notification === 'undefined') return;
    setNotificationRequesting(true);
    try {
      const result = await Notification.requestPermission();
      const now = Date.now();
      const payload: { permission: NotificationPermission; updatedAt: number; snoozedUntil?: number } = {
        permission: result,
        updatedAt: now,
      };
      if (result === 'default') payload.snoozedUntil = now + NOTIFICATION_PROMPT_SNOOZE_MS; // 사용자가 닫은 경우 24시간 백오프
      window.localStorage.setItem(NOTIFICATION_PROMPT_KEY, JSON.stringify(payload));
      setNotificationBlocked(result === 'denied');
      setShowNotificationPrompt(false);
    } catch {
      // ignore
    } finally {
      setNotificationRequesting(false);
    }
  }, []);

  const handleSnoozeNotification = useCallback((durationMs: number = NOTIFICATION_PROMPT_SNOOZE_MS) => {
    if (typeof window === 'undefined') return;
    const now = Date.now();
    window.localStorage.setItem(
      NOTIFICATION_PROMPT_KEY,
      JSON.stringify({ permission: 'default', updatedAt: now, snoozedUntil: now + durationMs }),
    );
    setShowNotificationPrompt(false);
  }, []);

  const handleSnoozeBlocked = useCallback((durationMs: number = NOTIFICATION_PROMPT_SNOOZE_WEEK_MS) => {
    if (typeof window === 'undefined') return;
    const now = Date.now();
    window.localStorage.setItem(
      NOTIFICATION_PROMPT_KEY,
      JSON.stringify({ permission: 'denied', updatedAt: now, blockedSnoozedUntil: now + durationMs }),
    );
    setNotificationBlocked(false);
    setShowNotificationPrompt(false);
  }, []);

  useEffect(() => {
    const syncPermission = () => {
      if (typeof window === 'undefined' || typeof Notification === 'undefined') return;
      if (Notification.permission === 'granted') {
        const now = Date.now();
        window.localStorage.setItem(NOTIFICATION_PROMPT_KEY, JSON.stringify({ permission: 'granted', updatedAt: now }));
        setNotificationBlocked(false);
        setShowNotificationPrompt(false);
      }
    };
    window.addEventListener('focus', syncPermission);
    return () => window.removeEventListener('focus', syncPermission);
  }, []);

  const activeMatch = useMemo(() => state.matches.find((m) => m.id === state.activeMatchId), [state.matches, state.activeMatchId]);
  const hasLiveOverlay = Boolean((activeMatch?.liveVideoUrl || '').trim());
  const isMobileHeader = previewMode === 'mobile';

  const navItems = useMemo(
    () => [
      {
        path: '/intro',
        label: '리그 소개',
        children: [
          { path: '/rules', label: '회칙' },
          { path: '/intro/teams', label: '참가팀 · 조편성' },
        ],
      },
      {
        path: '/schedule',
        label: '경기 일정',
        children: [
          { path: '/schedule/results', label: '경기 결과' },
          { path: '/schedule/groups', label: '조별 일정' },
          { path: '/schedule/practice', label: '연습경기' },
          { path: '/schedule/manage', label: '일정 관리', requiresAdmin: true },
        ],
      },
      {
        path: '/records',
        label: '기록',
        children: [
          { path: '/records/pitchers', label: '투수 기록' },
          { path: '/records/batters', label: '타자 기록' },
        ],
      },
      { path: '/community', label: '커뮤니티' },
      {
        path: '/standings',
        label: '순위',
        children: [{ path: '/standings/power-ranking', label: '파워랭킹' }],
      },
      { path: '/prediction', label: '승부예측' },
      // 기록원: 항상 보이지만 비관리자는 클릭 시 안내 버블만 노출
      { path: '/scorekeeper', label: '기록원', requiresAdmin: true, showWhenBlocked: true },
      // 사용설명서: 외부 링크
      {
        path: 'https://docs.google.com/document/d/e/2PACX-1vRYQNkS6wuqoYWokWN_rnPpmZuWLHcNyn_j5K5Vhw3g8voduO20VMJYFH_3FTjW9Whgk7nxywV8ps_9/pub',
        label: '사용설명서',
        isExternal: true,
      },
    ],
    [],
  );
  const [hoveredMenu, setHoveredMenu] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);

  const filteredNavItems = useMemo(
    () =>
      navItems.filter((item) => {
        if (item.requiresAdmin && !isAdmin) {
          return item.showWhenBlocked === true;
        }
        return true;
      }),
    [navItems, isAdmin],
  );

  const activeParentPath = useMemo(() => {
    if (hoveredMenu) {
      const hoveredHasChildren = filteredNavItems.some((item) => item.path === hoveredMenu && item.children);
      if (hoveredHasChildren) return hoveredMenu;
    }

    const matched = filteredNavItems.find((item) => {
      // External link check
      if ((item as { isExternal?: boolean }).isExternal) return false;

      if (item.children?.some((child) => location.pathname === child.path || location.pathname.startsWith(child.path))) return true;
      if (item.children && location.pathname === item.path) return true; // 부모 경로 자체를 방문했을 때도 유지
      return false;
    });

    return matched?.path ?? null;
  }, [hoveredMenu, location.pathname, filteredNavItems]);

  const activeChildren = useMemo(() => {
    const parent = filteredNavItems.find((item) => item.path === activeParentPath);
    return parent?.children?.filter((child) => !child.requiresAdmin || isAdmin) ?? [];
  }, [activeParentPath, filteredNavItems, isAdmin]);
  const showSubnav = activeChildren.length > 0;
  const [subnavAnchor, setSubnavAnchor] = useState<number | null>(null);

  useEffect(() => {
    if (!showSubnav || !activeParentPath) {
      setSubnavAnchor(null);
      return;
    }

    const recalcAnchor = () => {
      const parentEl = linkRefs.current[activeParentPath];
      const headerEl = headerInnerRef.current;
      if (!parentEl || !headerEl) return;

      const parentRect = parentEl.getBoundingClientRect();
      const headerRect = headerEl.getBoundingClientRect();
      setSubnavAnchor(parentRect.left + parentRect.width / 2 - headerRect.left);
    };

    recalcAnchor();
    window.addEventListener('resize', recalcAnchor);
    return () => window.removeEventListener('resize', recalcAnchor);
  }, [showSubnav, activeParentPath, location.pathname]);

  return (
    <ContentProvider>
      <div className="app-shell">
      {!isLiveOverlay && (
        <header className="app-header">
          <div
            className="app-header__inner"
            ref={headerInnerRef}
            onMouseLeave={() => setHoveredMenu(null)}
            style={{
              position: 'relative',
              alignItems: 'center',
              height: isMobileHeader
                ? showSubnav
                  ? 'calc(var(--header-height) + 64px)'
                  : 'calc(var(--header-height) + 32px)'
                : showSubnav
                  ? 'calc(var(--header-height) + 32px)'
                  : 'var(--header-height)',
              transition: 'height 180ms ease',
              padding: 0,
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: 'var(--header-height)',
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                flexWrap: isMobileHeader ? 'wrap' : 'nowrap',
                rowGap: isMobileHeader ? '8px' : '0px',
                padding: 'var(--header-padding)',
                paddingTop: isMobileHeader ? '8px' : '10px',
                boxSizing: 'border-box',
                gap: '12px',
              }}
            >
              <Link
                to="/"
                style={{
                  fontSize: 'clamp(20px, 4vw, 24px)',
                  fontWeight: 900,
                  letterSpacing: '-0.03em',
                  color: isLanding ? '#c084fc' : '#60a5fa',
                  whiteSpace: 'nowrap',
                }}
              >
                AUBL
                <span
                  style={{
                    color: isLanding ? '#f97316' : '#3b82f6',
                    transition: 'color 140ms ease',
                  }}
                >
                  .
                </span>
              </Link>
              <nav
                className="nav-scroll"
                style={{
                  marginLeft: isMobileHeader ? 0 : 'auto',
                  flex: isMobileHeader ? '0 0 100%' : 1,
                  width: isMobileHeader ? '100%' : undefined,
                  minWidth: 0,
                  paddingLeft: isMobileHeader ? '14px' : '18px',
                  paddingRight: isMobileHeader ? '8px' : 0,
                  marginRight: isMobileHeader ? '-6px' : 0,
                  position: 'relative',
                  order: isMobileHeader ? 3 : undefined,
                  marginTop: isMobileHeader ? '4px' : 0,
                }}
              >
                <div className="nav-scroll__rail">
                  {filteredNavItems.map((item) => {
                    const isActive = location.pathname === item.path || activeParentPath === item.path;
                    const isHovering = hoveredMenu === item.path;
                    const blocked = item.requiresAdmin && !isAdmin;
                    const isExternal = (item as { isExternal?: boolean }).isExternal;

                    const handleBlockedHover = (el: HTMLAnchorElement | null) => {
                      if (!blocked || !el) return;
                      const rect = el.getBoundingClientRect();
                      setTooltip({
                        text: '관리자 로그인이 필요합니다',
                        x: rect.left + rect.width / 2,
                        y: rect.bottom,
                      });
                    };

                    const style = {
                      fontSize: 'var(--nav-font-size)',
                      fontWeight: 700,
                      color: blocked ? 'rgba(203,213,225,0.55)' : isActive || isHovering ? '#f97316' : '#cbd5e1',
                      transition: 'color 120ms ease',
                      whiteSpace: 'nowrap',
                      scrollSnapAlign: 'start',
                      padding: '10px 0',
                      cursor: blocked ? 'not-allowed' : 'pointer',
                      textDecoration: 'none',
                    };

                    if (isExternal) {
                      return (
                        <a
                          key={item.path}
                          href={item.path}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={style}
                          ref={(el) => {
                            linkRefs.current[item.path] = el;
                          }}
                          onMouseEnter={() => {
                            setHoveredMenu(item.path);
                          }}
                          onMouseLeave={() => {
                            setHoveredMenu(null);
                            setTooltip(null);
                          }}
                          onFocus={() => {
                            setHoveredMenu(item.path);
                          }}
                          onBlur={() => setTooltip(null)}
                        >
                          {item.label}
                        </a>
                      );
                    }

                    return (
                      <Link
                        key={item.path}
                        to={blocked ? location.pathname : item.path}
                        style={style}
                        ref={(el) => {
                          linkRefs.current[item.path] = el;
                        }}
                        onMouseEnter={() => {
                          setHoveredMenu(item.path);
                          handleBlockedHover(linkRefs.current[item.path]);
                        }}
                        onMouseLeave={() => {
                          setHoveredMenu(null);
                          setTooltip(null);
                        }}
                        onFocus={() => {
                          setHoveredMenu(item.path);
                          handleBlockedHover(linkRefs.current[item.path]);
                        }}
                        onBlur={() => setTooltip(null)}
                        onClick={(e) => {
                          if (blocked) {
                            e.preventDefault();
                            handleBlockedHover(linkRefs.current[item.path]);
                            return;
                          }
                          if (item.children) setHoveredMenu(item.path);
                        }}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </nav>

              {tooltip && (
                <div
                  style={{
                    position: 'fixed',
                    left: tooltip.x,
                    top: tooltip.y + 10,
                    transform: 'translate(-50%, 0)',
                    background: 'rgba(15,23,42,0.95)',
                    color: '#f97316',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    border: '1px solid rgba(148,163,184,0.35)',
                    fontSize: '12px',
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
                    zIndex: 2000,
                  }}
                >
                  {tooltip.text}
                </div>
              )}

              {isScoreboardText && (
                <div
                  style={{
                    display: 'flex',
                    gap: '8px',
                    alignItems: 'center',
                    marginLeft: isMobileHeader ? 0 : '12px',
                    background: 'rgba(148,163,184,0.12)',
                    borderRadius: '999px',
                    padding: '6px 8px',
                    flexShrink: 0,
                    order: isMobileHeader ? 2 : undefined,
                    flexWrap: 'wrap',
                  }}
                >
                  <Link
                    to="/scoreboard-text"
                    aria-current="page"
                    style={{
                      border: 'none',
                      background: '#f97316',
                      color: '#0b0f1a',
                      fontWeight: 800,
                      fontSize: '13px',
                      borderRadius: '999px',
                      padding: '6px 12px',
                      textDecoration: 'none',
                      boxShadow: '0 8px 18px rgba(249,115,22,0.35)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    문자중계
                  </Link>
                  {hasLiveOverlay ? (
                    <Link
                      to="/live-overlay"
                      style={{
                        border: 'none',
                        background: 'rgba(148,163,184,0.25)',
                        color: '#e2e8f0',
                        fontWeight: 800,
                        fontSize: '13px',
                        borderRadius: '999px',
                        padding: '6px 12px',
                        textDecoration: 'none',
                        whiteSpace: 'nowrap',
                        cursor: 'pointer',
                      }}
                      title="라이브 오버레이"
                    >
                      라이브 오버레이
                    </Link>
                  ) : (
                    <span
                      style={{
                        border: '1px dashed rgba(248,113,113,0.6)',
                        background: 'rgba(248,113,113,0.08)',
                        color: '#fca5a5',
                        fontWeight: 800,
                        fontSize: '13px',
                        borderRadius: '999px',
                        padding: '6px 12px',
                        whiteSpace: 'nowrap',
                      }}
                      title="이 경기에는 라이브 링크가 없습니다"
                    >
                      라이브 없음
                    </span>
                  )}
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: isMobileHeader ? '6px' : '10px',
                  marginLeft: isMobileHeader ? 'auto' : isScoreboardText ? '8px' : '12px',
                  order: isMobileHeader ? 2 : undefined,
                  flexWrap: 'nowrap',
                  justifyContent: isMobileHeader ? 'flex-end' : 'flex-start',
                  width: 'auto',
                  flexShrink: isMobileHeader ? 0 : undefined,
                }}
              >
                {initializing ? (
                  <span style={{ color: '#cbd5e1', fontSize: '13px' }}>로그인 확인 중...</span>
                ) : user ? (
                  <>
                    {isAdmin ? (
                      <Link to="/admin" style={{ textDecoration: 'none' }}>
                        <span
                          className="badge-hoverable"
                          style={{
                            padding: '6px 10px',
                            borderRadius: '10px',
                            background: 'linear-gradient(120deg, rgba(249,115,22,0.3), rgba(253,186,116,0.35))',
                            color: '#f97316',
                            fontWeight: 800,
                            fontSize: '12px',
                            border: '1px solid rgba(249,115,22,0.6)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.02em',
                            display: 'inline-block',
                          }}
                          title={`권한: ${roleLabel} (${roleDetail}) · 클릭하면 관리자 페이지로 이동`}
                        >
                          {roleLabel}
                        </span>
                      </Link>
                    ) : (
                      <span
                        className="badge-hoverable"
                        style={{
                          padding: '6px 10px',
                          borderRadius: '10px',
                          background: 'rgba(148,163,184,0.18)',
                          color: '#e2e8f0',
                          fontWeight: 800,
                          fontSize: '12px',
                          border: '1px solid rgba(148,163,184,0.35)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.02em',
                        }}
                        title={`권한: ${roleLabel} (${roleDetail})`}
                      >
                        {roleLabel}
                      </span>
                    )}
                    <Link
                      to="/account"
                      className="badge-hoverable"
                      style={{
                        padding: isMobileHeader ? '6px 10px' : '8px 12px',
                        borderRadius: '999px',
                        background: 'rgba(148,163,184,0.16)',
                        color: '#e2e8f0',
                        fontWeight: 700,
                        fontSize: isMobileHeader ? '12px' : '13px',
                        maxWidth: isMobileHeader ? '120px' : '180px',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        textDecoration: 'none',
                        border: '1px solid rgba(148,163,184,0.3)',
                        display: 'inline-block',
                      }}
                      title="계정 페이지로 이동"
                    >
                      {user.email ?? user.uid}
                    </Link>
                    <button
                      type="button"
                      onClick={logout}
                      style={{
                        background: 'rgba(148,163,184,0.25)',
                        color: '#e2e8f0',
                        padding: isMobileHeader ? '6px 10px' : '8px 12px',
                        borderRadius: '12px',
                        fontSize: isMobileHeader ? '12px' : '13px',
                        fontWeight: 800,
                        flexShrink: 0,
                      }}
                    >
                      로그아웃
                    </button>
                  </>
                ) : (
                  <Link
                    to="/login"
                    style={{
                      background: 'linear-gradient(120deg, #f97316, #f59e0b)',
                      color: '#0b0f1a',
                      padding: '10px 14px',
                      borderRadius: '12px',
                      fontWeight: 900,
                      fontSize: '13px',
                      boxShadow: '0 10px 24px rgba(249,115,22,0.35)',
                    }}
                  >
                    로그인
                  </Link>
                )}
              </div>
            </div>

            <div
              onMouseEnter={() => activeParentPath && setHoveredMenu(activeParentPath)}
              onMouseLeave={() => setHoveredMenu(null)}
              style={{
                position: 'absolute',
                top: isMobileHeader ? 'calc(var(--header-height) + 24px)' : 'calc(var(--header-height) - 6px)',
                left: 0,
                width: '100%',
                height: showSubnav ? '32px' : '0px',
                overflow: 'visible',
                pointerEvents: showSubnav ? 'auto' : 'none',
                opacity: showSubnav ? 1 : 0,
                transform: showSubnav ? 'translateY(0px)' : 'translateY(-4px)',
                transition: 'opacity 140ms ease, transform 160ms ease',
                zIndex: 20,
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  left: subnavAnchor !== null ? `${subnavAnchor}px` : '50%',
                  transform: 'translateX(-50%)',
                  display: 'flex',
                  gap: '3px',
                  padding: '1px 4px',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: 0,
                  boxShadow: 'none',
                  backdropFilter: 'none',
                  alignItems: 'center',
                  minHeight: '10px',
                  whiteSpace: 'nowrap',
                }}
              >
                {activeChildren.map((child) => {
                  const isActiveChild = location.pathname === child.path;
                  const isHoveringChild = hoveredMenu === child.path;
                  return (
                    <Link
                      key={child.path}
                      to={child.path}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontWeight: 800,
                        fontSize: '13px',
                        color: isActiveChild || isHoveringChild ? '#f97316' : '#e2e8f0',
                        padding: '6px 6px',
                        borderBottom: isActiveChild ? '2px solid #f97316' : '2px solid transparent',
                        transition: 'color 120ms ease, border-color 120ms ease, transform 120ms ease',
                        whiteSpace: 'nowrap',
                        transform: isActiveChild ? 'translateY(-1px)' : 'translateY(0)',
                      }}
                      onMouseEnter={() => setHoveredMenu(child.path)}
                      onMouseLeave={() => setHoveredMenu(null)}
                      onFocus={() => setHoveredMenu(child.path)}
                    >
                      {child.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </header>
      )}

      <main className="app-main" style={isLiveOverlay ? { maxWidth: '100%', margin: 0, padding: 0 } : undefined}>
        {!isLiveOverlay && showMobileNotice && (
          <div
            role="alertdialog"
            aria-live="polite"
            style={{
              position: 'relative',
              display: 'flex',
              gap: '14px',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              padding: '18px 20px',
              marginBottom: '18px',
              borderRadius: '18px',
              border: '1px solid rgba(248,184,12,0.4)',
              background: 'linear-gradient(120deg, rgba(30,41,59,0.92), rgba(15,23,42,0.92))',
              boxShadow: '0 18px 46px rgba(0,0,0,0.4)',
            }}
          >
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', minWidth: '220px' }}>
              <span style={{ fontSize: '24px', lineHeight: 1 }}>💻</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ fontSize: '15px', fontWeight: 900, color: '#fde68a' }}>PC 화면에 최적화된 사이트입니다.</div>
                <div style={{ fontSize: '13px', color: '#e2e8f0', lineHeight: 1.55 }}>
                  모바일 버전은 아직 최적화 중이라 일부 레이아웃이 깨질 수 있어요. 원활한 이용을 위해 PC 브라우저 사용을 권장합니다.
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleMobileNoticeConfirm}
                style={{
                  background: 'linear-gradient(120deg, #f59e0b, #f97316)',
                  color: '#0b0f1a',
                  padding: '11px 14px',
                  fontWeight: 900,
                  fontSize: '13px',
                  borderRadius: '12px',
                  boxShadow: '0 10px 24px rgba(249,115,22,0.35)',
                }}
              >
                확인
              </button>
              <button
                type="button"
                onClick={handleMobileNoticeSnoozeDay}
                style={{
                  background: 'rgba(15,23,42,0.7)',
                  color: '#e2e8f0',
                  border: '1px solid rgba(148,163,184,0.45)',
                  padding: '10px 12px',
                  fontWeight: 800,
                  fontSize: '12px',
                  borderRadius: '10px',
                }}
              >
                하루 동안 보지 않기
              </button>
              <button
                type="button"
                onClick={handleMobileNoticeNever}
                style={{
                  background: 'rgba(239,68,68,0.12)',
                  color: '#fecdd3',
                  border: '1px solid rgba(248,113,113,0.45)',
                  padding: '10px 12px',
                  fontWeight: 800,
                  fontSize: '12px',
                  borderRadius: '10px',
                }}
              >
                다시 보지 않기
              </button>
            </div>
          </div>
        )}

        {!isLiveOverlay && showNotificationPrompt && typeof Notification !== 'undefined' && (
          <div
            style={{
              display: 'flex',
              gap: '14px',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              padding: '16px 18px',
              marginBottom: '18px',
              borderRadius: '18px',
              border: '1px solid rgba(96,165,250,0.28)',
              background: 'linear-gradient(120deg, rgba(59,130,246,0.16), rgba(249,115,22,0.16))',
              boxShadow: '0 16px 40px rgba(0,0,0,0.35)',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minWidth: '220px' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '13px',
                  fontWeight: 800,
                  letterSpacing: '0.04em',
                  color: '#cbd5e1',
                  textTransform: 'uppercase',
                }}
              >
                <span style={{ fontSize: '18px' }}>🔔</span>
                경기 시작 알림
              </span>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#e2e8f0' }}>
                첫 방문이라면 &ldquo;알림 허용&rdquo;을 눌러 경기 시작 푸시를 받아보세요.
              </div>
              <div style={{ fontSize: '13px', color: '#cbd5e1', lineHeight: 1.5 }}>
                버튼을 누르는 사용자 제스처가 있어야 크롬의 조용한 알림 모드에서도 권한 팝업이 바로 뜹니다. 거부하거나 닫으면 24시간,
                &ldquo;일주일 뒤 묻기&rdquo;를 누르면 7일 동안 다시 묻지 않아요.
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleRequestNotification}
                disabled={notificationRequesting}
                style={{
                  background: 'linear-gradient(120deg, #f97316, #f59e0b)',
                  color: '#0b0f1a',
                  padding: '12px 16px',
                  fontWeight: 900,
                  fontSize: '14px',
                  minWidth: '140px',
                  opacity: notificationRequesting ? 0.75 : 1,
                  cursor: notificationRequesting ? 'not-allowed' : 'pointer',
                }}
              >
                {notificationRequesting ? '요청 중...' : '알림 허용'}
              </button>
              <button
                type="button"
                onClick={() => handleSnoozeNotification(NOTIFICATION_PROMPT_SNOOZE_MS)}
                style={{
                  background: 'rgba(15,23,42,0.65)',
                  color: '#cbd5e1',
                  border: '1px solid rgba(148,163,184,0.45)',
                  padding: '12px 14px',
                  fontWeight: 800,
                  fontSize: '13px',
                }}
              >
                하루 뒤 묻기
              </button>
              <button
                type="button"
                onClick={() => handleSnoozeNotification(NOTIFICATION_PROMPT_SNOOZE_WEEK_MS)}
                style={{
                  background: 'rgba(15,23,42,0.65)',
                  color: '#cbd5e1',
                  border: '1px solid rgba(148,163,184,0.45)',
                  padding: '12px 14px',
                  fontWeight: 800,
                  fontSize: '13px',
                }}
              >
                일주일 뒤 묻기
              </button>
            </div>
          </div>
        )}

        {!isLiveOverlay && notificationBlocked && (
          <div
            style={{
              display: 'flex',
              gap: '12px',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              padding: '14px 16px',
              marginBottom: '18px',
              borderRadius: '14px',
              border: '1px solid rgba(248,113,113,0.5)',
              background: 'linear-gradient(120deg, rgba(248,113,113,0.12), rgba(248,113,113,0.22))',
              color: '#fecdd3',
            }}
          >
            <div style={{ flex: 1, minWidth: '220px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ fontWeight: 800, fontSize: '14px' }}>알림이 브라우저에서 차단되어 있어 경기 시작 알림을 보낼 수 없습니다.</div>
              <div style={{ fontSize: '13px', color: '#ffe4e6' }}>
                주소창 왼쪽의 자물쇠(🔒) 또는 종(🔔) 아이콘 → 알림 → &ldquo;허용&rdquo;으로 변경한 뒤 새로고침 해주세요.
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => {
                  setNotificationBlocked(false);
                  if (typeof Notification !== 'undefined' && Notification.permission === 'default') setShowNotificationPrompt(true);
                }}
                style={{
                  background: 'rgba(255,255,255,0.12)',
                  color: '#0b1220',
                  fontWeight: 900,
                  fontSize: '13px',
                  padding: '10px 14px',
                }}
              >
                설정 완료
              </button>
              <button
                type="button"
                onClick={() => handleSnoozeBlocked(NOTIFICATION_PROMPT_SNOOZE_WEEK_MS)}
                style={{
                  background: 'rgba(15,23,42,0.7)',
                  color: '#ffe4e6',
                  border: '1px solid rgba(252,165,165,0.55)',
                  fontWeight: 800,
                  fontSize: '13px',
                  padding: '10px 14px',
                }}
              >
                일주일 동안 보지 않기
              </button>
            </div>
          </div>
        )}

        <Outlet />
      </main>

      {!isLiveOverlay && (
        <footer
          style={{
            marginTop: 'auto',
            borderTop: '1px solid rgba(148, 163, 184, 0.2)',
            padding: '32px 0',
            color: '#94a3b8',
            fontSize: '14px',
            textAlign: 'center',
          }}
        >
          <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '0 24px' }}>
            &copy; 2026 Amateur University Baseball League. All rights reserved.
          </div>
          <div className="preview-toggle-inline">
            <span className="preview-toggle-inline__label">보기 전환</span>
            {(['desktop', 'mobile'] as const).map((mode) => {
              const isActive = previewMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setPreviewMode(mode)}
                  className={`preview-toggle-inline__button${isActive ? ' is-active' : ''}`}
                >
                  {mode === 'desktop' ? 'PC 보기' : '모바일 보기'}
                </button>
              );
            })}
          </div>
        </footer>
      )}
      </div>
    </ContentProvider>
  );
}

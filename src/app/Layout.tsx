// **`src/app/Layout.tsx`**

import { Outlet, Link, useLocation } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../shared/auth/AuthProvider';
import { useAdmin } from '../shared/auth/useAdmin';

export default function Layout() {
  const location = useLocation();
  const { user, logout, initializing } = useAuth();
  const { isAdmin } = useAdmin();
  const isLiveOverlay = location.pathname === '/live-overlay';
  const isScoreboardText = location.pathname === '/scoreboard-text';
  const isLanding = location.pathname === '/';
  const headerInnerRef = useRef<HTMLDivElement>(null);
  const linkRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches ? 'mobile' : 'desktop',
  );

  useEffect(() => {
    document.documentElement.setAttribute('data-preview-mode', previewMode);
  }, [previewMode]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, [location.pathname]);

  const navItems = [
    { path: '/intro', label: '리그 소개' },
    {
      path: '/schedule',
      label: '경기 일정',
      children: [
        { path: '/schedule/results', label: '경기 결과' },
        { path: '/schedule/groups', label: '조별 일정' },
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
  ];
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
              height: showSubnav ? 'calc(var(--header-height) + 32px)' : 'var(--header-height)',
              transition: 'height 180ms ease',
              padding: 0,
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                height: 'var(--header-height)',
                display: 'flex',
                alignItems: 'center',
                padding: 'var(--header-padding)',
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
              <nav className="nav-scroll" style={{ marginLeft: 'auto', flex: 1, minWidth: 0, paddingLeft: '18px', position: 'relative' }}>
                <div className="nav-scroll__rail">
                  {filteredNavItems.map((item) => {
                    const isActive = location.pathname === item.path || activeParentPath === item.path;
                    const isHovering = hoveredMenu === item.path;
                    const blocked = item.requiresAdmin && !isAdmin;
                    const handleBlockedHover = (el: HTMLAnchorElement | null) => {
                      if (!blocked || !el) return;
                      const rect = el.getBoundingClientRect();
                      setTooltip({
                        text: '관리자 로그인이 필요합니다',
                        x: rect.left + rect.width / 2,
                        y: rect.bottom,
                      });
                    };
                    return (
                      <Link
                        key={item.path}
                        to={blocked ? location.pathname : item.path}
                        style={{
                          fontSize: 'var(--nav-font-size)',
                          fontWeight: 700,
                          color: blocked ? 'rgba(203,213,225,0.55)' : isActive || isHovering ? '#f97316' : '#cbd5e1',
                          transition: 'color 120ms ease',
                          whiteSpace: 'nowrap',
                          scrollSnapAlign: 'start',
                          padding: '10px 0',
                          cursor: blocked ? 'not-allowed' : 'pointer',
                        }}
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
                    marginLeft: '12px',
                    background: 'rgba(148,163,184,0.12)',
                    borderRadius: '999px',
                    padding: '6px 8px',
                    flexShrink: 0,
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
                    }}
                  >
                    라이브 오버레이
                  </Link>
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  marginLeft: isScoreboardText ? '8px' : '12px',
                }}
              >
                {initializing ? (
                  <span style={{ color: '#cbd5e1', fontSize: '13px' }}>로그인 확인 중...</span>
                ) : user ? (
                  <>
                    <span
                      style={{
                        padding: '8px 12px',
                        borderRadius: '999px',
                        background: 'rgba(148,163,184,0.16)',
                        color: '#e2e8f0',
                        fontWeight: 700,
                        fontSize: '13px',
                        maxWidth: '180px',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                      title={user.email ?? user.uid}
                    >
                      {user.email ?? user.uid}
                    </span>
                    <button
                      type="button"
                      onClick={logout}
                      style={{
                        background: 'rgba(148,163,184,0.25)',
                        color: '#e2e8f0',
                        padding: '8px 12px',
                        borderRadius: '12px',
                        fontSize: '13px',
                        fontWeight: 800,
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
                top: 'calc(var(--header-height) - 6px)',
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
            &copy; 2025 Amateur University Baseball League. All rights reserved.
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
  );
}

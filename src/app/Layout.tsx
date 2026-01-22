// **`src/app/Layout.tsx`**

import { Outlet, Link, useLocation } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState } from 'react';

export default function Layout() {
  const location = useLocation();
  const isLiveOverlay = location.pathname === '/live-overlay';
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
      path: '/records',
      label: '기록',
      children: [
        { path: '/records/pitchers', label: '투수 기록' },
        { path: '/records/batters', label: '타자 기록' },
      ],
    },
    { path: '/community', label: '커뮤니티' },
    { path: '/standings', label: '순위' },
    { path: '/prediction', label: '승부예측' },
    { path: '/schedule', label: '경기 일정' },
    { path: '/scoreboard', label: '전광판' },
    { path: '/scoreboard-text', label: '문자중계' },
    { path: '/live-overlay', label: '라이브 오버레이' },
    { path: '/scorekeeper', label: '기록원' },
  ];
  const [hoveredMenu, setHoveredMenu] = useState<string | null>(null);

  const activeParentPath = useMemo(() => {
    if (hoveredMenu) {
      const hoveredHasChildren = navItems.some((item) => item.path === hoveredMenu && item.children);
      if (hoveredHasChildren) return hoveredMenu;
    }

    const matched = navItems.find((item) => {
      if (item.children?.some((child) => location.pathname === child.path || location.pathname.startsWith(child.path))) return true;
      if (item.children && location.pathname === item.path) return true; // 부모 경로 자체를 방문했을 때도 유지
      return false;
    });

    return matched?.path ?? null;
  }, [hoveredMenu, location.pathname, navItems]);

  const activeChildren = useMemo(() => navItems.find((item) => item.path === activeParentPath)?.children ?? [], [activeParentPath, navItems]);
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
                  color: '#c084fc',
                  whiteSpace: 'nowrap',
                }}
              >
                AUBL<span style={{ color: '#f97316' }}>.</span>
              </Link>
              <nav className="nav-scroll" style={{ marginLeft: 'auto', flex: 1, minWidth: 0, paddingLeft: '18px', position: 'relative' }}>
                <div className="nav-scroll__rail">
                  {navItems.map((item) => {
                    const isActive = location.pathname === item.path || activeParentPath === item.path;
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        style={{
                          fontSize: 'var(--nav-font-size)',
                          fontWeight: 700,
                          color: isActive ? '#f97316' : '#cbd5e1',
                          transition: 'color 120ms ease',
                          whiteSpace: 'nowrap',
                          scrollSnapAlign: 'start',
                          padding: '10px 0',
                        }}
                        ref={(el) => {
                          linkRefs.current[item.path] = el;
                        }}
                        onMouseEnter={() => setHoveredMenu(item.children ? item.path : null)}
                        onFocus={() => setHoveredMenu(item.children ? item.path : null)}
                        onClick={() => item.children && setHoveredMenu(item.path)}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </nav>
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
                  return (
                    <Link
                      key={child.path}
                      to={child.path}
                      style={{
                        fontWeight: 800,
                        fontSize: '13px',
                        color: isActiveChild ? '#f97316' : '#e2e8f0',
                        padding: '6px 4px',
                        borderBottom: isActiveChild ? '2px solid #f97316' : '2px solid transparent',
                        transition: 'color 120ms ease, border-color 120ms ease',
                        whiteSpace: 'nowrap',
                      }}
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

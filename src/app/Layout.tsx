// **`src/app/Layout.tsx`**

import { Outlet, Link, useLocation } from 'react-router-dom';
import { useEffect, useState, useRef } from 'react';

export default function Layout() {
  const location = useLocation();
  const isLiveOverlay = location.pathname === '/live-overlay';
  const headerInnerRef = useRef<HTMLDivElement>(null);
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
  const isRecordsRoute = location.pathname.startsWith('/records');
  const showRecordSubnav = isRecordsRoute || hoveredMenu === '/records';

  return (
    <div className="app-shell">
      {!isLiveOverlay && (
        <header className="app-header">
          <div className="app-header__inner" ref={headerInnerRef} style={{ position: 'relative' }}>
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
                  const isActive =
                    location.pathname === item.path ||
                    (item.path === '/records' && isRecordsRoute);
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
                      onMouseEnter={() => setHoveredMenu(item.path)}
                      onMouseLeave={() => {
                        if (!item.children) setHoveredMenu((prev) => (prev === item.path ? null : prev));
                      }}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </nav>

            <div
              onMouseEnter={() => setHoveredMenu('/records')}
              onMouseLeave={() => setHoveredMenu(null)}
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                width: '100%',
                overflow: 'hidden',
                maxHeight: showRecordSubnav ? '72px' : '0px',
                opacity: showRecordSubnav ? 1 : 0,
                pointerEvents: showRecordSubnav ? 'auto' : 'none',
                transition: 'max-height 180ms ease, opacity 160ms ease',
                zIndex: 20,
              }}
            >
              <div
                style={{
                  marginTop: '2px',
                  padding: '8px 18px',
                  background:
                    'linear-gradient(180deg, rgba(15,23,42,0.94) 0%, rgba(15,23,42,0.86) 100%), radial-gradient(circle at 12% 20%, rgba(249,115,22,0.12), transparent 38%), radial-gradient(circle at 78% 0%, rgba(59,130,246,0.10), transparent 30%)',
                  borderTop: '1px solid rgba(148,163,184,0.28)',
                  borderBottom: '1px solid rgba(148,163,184,0.18)',
                  display: 'flex',
                  gap: '14px',
                  alignItems: 'center',
                  boxShadow: '0 14px 32px rgba(0,0,0,0.32)',
                  backdropFilter: 'blur(6px)',
                }}
              >
                {navItems
                  .find((item) => item.path === '/records')
                  ?.children?.map((child) => {
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

// **`src/app/Layout.tsx`**

import { Outlet, Link, useLocation } from 'react-router-dom';

export default function Layout() {
  const location = useLocation();
  const isLiveOverlay = location.pathname === '/live-overlay';

  const navItems = [
    { path: '/intro', label: '리그 소개' },
    { path: '/records', label: '기록' },
    { path: '/record-room', label: '기록실' },
    { path: '/community', label: '커뮤니티' },
    { path: '/standings', label: '순위' },
    { path: '/prediction', label: '승부예측' },
    { path: '/schedule', label: '경기 일정' },
    { path: '/scoreboard', label: '전광판' },
    { path: '/scoreboard-text', label: '문자중계' },
    { path: '/live-overlay', label: '라이브 오버레이' },
    { path: '/scorekeeper', label: '기록원' },
  ];

  return (
    <div className="app-shell">
      {!isLiveOverlay && (
        <header className="app-header">
          <div className="app-header__inner">
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
            <nav className="nav-scroll" style={{ marginLeft: 'auto', flex: 1, minWidth: 0 }}>
              <div className="nav-scroll__rail">
                {navItems.map((item) => {
                  const isActive = location.pathname === item.path;
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
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </nav>
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
        </footer>
      )}
    </div>
  );
}

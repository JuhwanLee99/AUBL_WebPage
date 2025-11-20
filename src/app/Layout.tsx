// **`src/app/Layout.tsx`**

import { Outlet, Link, useLocation } from 'react-router-dom';

export default function Layout() {
  const location = useLocation();

  const navItems = [
    { path: '/intro', label: '리그 소개' },
    { path: '/records', label: '기록' },
    { path: '/standings', label: '순위' },
    { path: '/prediction', label: '승부예측' },
  ];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          backdropFilter: 'blur(12px)',
          background: 'rgba(17, 24, 39, 0.7)',
          borderBottom: '1px solid rgba(148, 163, 184, 0.2)',
        }}
      >
        <div
          style={{
            maxWidth: '1100px',
            margin: '0 auto',
            padding: '0 24px',
            height: '72px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Link to="/" style={{ fontSize: '24px', fontWeight: 900, letterSpacing: '-0.03em', color: '#c084fc' }}>
            AUBL<span style={{ color: '#f97316' }}>.</span>
          </Link>
          <nav style={{ display: 'flex', gap: '28px' }}>
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  style={{
                    fontSize: '15px',
                    fontWeight: 600,
                    color: isActive ? '#f97316' : '#cbd5e1',
                    transition: 'color 120ms ease',
                  }}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main style={{ flex: 1, maxWidth: '1100px', margin: '0 auto', padding: '40px 24px 72px' }}>
        <Outlet />
      </main>

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
        <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '0 24px' }}>
          &copy; 2025 Amateur University Baseball League. All rights reserved.
        </div>
      </footer>
    </div>
  );
}

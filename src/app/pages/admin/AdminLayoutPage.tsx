import { NavLink, Outlet, Link } from 'react-router-dom';

const tabs = [
  { path: '/admin/landing', label: '랜딩 관리' },
  { path: '/admin/intro', label: '리그 소개 관리' },
  { path: '/admin/rules', label: '회칙 관리' },
  { path: '/admin/teams', label: '참가팀 · 조편성 관리' },
  { path: '/admin/roles', label: '계정 권한' },
  { path: '/admin/games', label: '경기 기록 수정' },
  { path: '/admin/maintenance', label: '🔴 서비스 점검' },
] as const;

export default function AdminLayoutPage() {
  return (
    <div style={{ display: 'grid', gap: '18px', padding: 'var(--section-padding) 0' }}>
      <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
        <div style={{ display: 'grid', gap: '6px' }}>
          <h1 style={{ margin: 0, fontSize: '30px', fontWeight: 900, color: '#e2e8f0' }}>콘텐츠 CMS</h1>
          <p style={{ margin: 0, color: '#94a3b8', fontWeight: 700 }}>랜딩 · 리그소개 · 회칙 · 참가팀/조편성을 관리합니다.</p>
        </div>
        <Link
          to="/draw"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 20px',
            borderRadius: '14px',
            fontWeight: 900,
            fontSize: '14px',
            textDecoration: 'none',
            background: 'linear-gradient(120deg, rgba(249,115,22,0.22), rgba(168,85,247,0.22))',
            color: '#fdba74',
            border: '1.5px solid rgba(249,115,22,0.45)',
            boxShadow: '0 6px 20px rgba(249,115,22,0.18)',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          조추첨식 페이지 →
        </Link>
      </header>

      <nav style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {tabs.map((tab) => (
          <NavLink
            key={tab.path}
            to={tab.path}
            style={({ isActive }) => ({
              padding: '9px 14px',
              borderRadius: '11px',
              textDecoration: 'none',
              fontWeight: 800,
              fontSize: '13px',
              color: isActive ? '#f8fafc' : '#cbd5e1',
              border: isActive ? '1px solid rgba(96,165,250,0.6)' : '1px solid rgba(148,163,184,0.35)',
              background: isActive ? 'rgba(96,165,250,0.26)' : 'rgba(15,23,42,0.65)',
            })}
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>

      <Outlet />
    </div>
  );
}

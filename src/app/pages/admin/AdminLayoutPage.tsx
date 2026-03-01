import { NavLink, Outlet, Link } from 'react-router-dom';
import { useAdmin } from '@shared/auth/useAdmin';

const tabs = [
  { path: '/admin/landing', label: '랜딩 관리', requiresAdmin: true },
  { path: '/admin/intro', label: '리그 소개 관리', requiresAdmin: true },
  { path: '/admin/rules', label: '회칙 관리', requiresAdmin: true },
  { path: '/admin/teams', label: '참가팀 · 조편성 관리', requiresAdmin: true },
  { path: '/admin/roles', label: '계정 권한', requiresAdmin: true },
  { path: '/admin/games', label: '경기 기록 수정', requiresGameEditor: true },
  { path: '/admin/power-ranking', label: '파워랭킹 재계산', requiresAdmin: true },
  { path: '/admin/maintenance', label: '🔴 서비스 점검', requiresAdmin: true },
] as const;

export default function AdminLayoutPage() {
  const { isAdmin, canEditGameRecords } = useAdmin();
  const visibleTabs = tabs.filter((tab) => {
    if (tab.requiresAdmin && !isAdmin) return false;
    if (tab.requiresGameEditor && !canEditGameRecords) return false;
    return true;
  });

  return (
    <div style={{ display: 'grid', gap: '18px', padding: 'var(--section-padding) 0' }}>
      <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
        <div style={{ display: 'grid', gap: '6px' }}>
          <h1 style={{ margin: 0, fontSize: '30px', fontWeight: 900, color: '#e2e8f0' }}>콘텐츠 CMS</h1>
          <p style={{ margin: 0, color: '#94a3b8', fontWeight: 700 }}>
            {isAdmin
              ? '랜딩 · 리그소개 · 회칙 · 참가팀/조편성을 관리합니다.'
              : '기록원 권한: 경기 기록 수정 메뉴만 사용할 수 있습니다.'}
          </p>
        </div>
        {isAdmin && (
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
        )}
      </header>

      <nav style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {visibleTabs.map((tab) => (
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

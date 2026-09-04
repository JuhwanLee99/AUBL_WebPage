import { NavLink, Outlet } from 'react-router-dom';
import { useAdmin } from '@shared/auth/useAdmin';
import { SeasonLinkButton } from '@shared/components/season';

const tabs = [
  { path: '/admin/landing', label: '랜딩 관리', requiresAdmin: true },
  { path: '/admin/intro', label: '리그 소개 관리', requiresAdmin: true },
  { path: '/admin/rules', label: '회칙 관리', requiresAdmin: true },
  { path: '/admin/teams', label: '참가팀 · 조편성 관리', requiresAdmin: true },
  { path: '/admin/roles', label: '계정 권한', requiresAdmin: true },
  { path: '/admin/games', label: '경기 기록 수정', requiresGameEditor: true },
  { path: '/admin/unique-play-sync', label: 'UniquePlay 동기화', requiresAdmin: true },
  { path: '/admin/moderation', label: '신고/차단 관리', requiresAdmin: true },
  { path: '/admin/allstar-voting', label: '올스타 투표 관리', requiresAdmin: true },
  { path: '/admin/power-ranking', label: '파워랭킹 재계산', requiresAdmin: true },
  { path: '/admin/maintenance', label: '서비스 점검', requiresAdmin: true },
] as const;

export default function AdminLayoutPage() {
  const { isAdmin, canEditGameRecords } = useAdmin();
  const visibleTabs = tabs.filter((tab) => {
    if ('requiresAdmin' in tab && tab.requiresAdmin && !isAdmin) return false;
    if ('requiresGameEditor' in tab && tab.requiresGameEditor && !canEditGameRecords) return false;
    return true;
  });

  return (
    <div className="season-content-page admin-cms-page" style={{ display: 'grid', gap: '18px', padding: 'var(--section-padding) 0' }}>
      <header className="admin-cms-page__header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
        <div style={{ display: 'grid', gap: '6px' }}>
          <h1 style={{ margin: 0, fontSize: '30px', fontWeight: 900, color: '#e2e8f0' }}>콘텐츠 CMS</h1>
          <p style={{ margin: 0, color: '#94a3b8', fontWeight: 700 }}>
            {isAdmin
              ? '랜딩 · 리그소개 · 회칙 · 팀/권한 · 데이터 동기화 · 신고/차단 · 올스타 투표를 관리합니다.'
              : '기록원 권한: 경기 기록 수정 메뉴만 사용할 수 있습니다.'}
          </p>
        </div>
        {isAdmin && (
          <SeasonLinkButton
            to="/draw"
            variant="secondary"
            className="admin-cms-page__draw-link"
          >
            조추첨식 페이지 →
          </SeasonLinkButton>
        )}
      </header>

      <nav className="admin-cms-page__nav" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
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

import { Navigate } from 'react-router-dom';
import type { RouteObject } from 'react-router-dom';
import AdminLayoutPage from '../pages/admin/AdminLayoutPage';
import AdminLandingPage from '../pages/admin/AdminLandingPage';
import AdminIntroPage from '../pages/admin/AdminIntroPage';
import AdminRulesPage from '../pages/admin/AdminRulesPage';
import AdminTeamsPage from '../pages/admin/AdminTeamsPage';
import AdminRolesPage from '../pages/admin/AdminRolesPage';
import AdminMaintenancePage from '../pages/admin/AdminMaintenancePage';
import AdminGamesPage from '../pages/admin/AdminGamesPage';
import AdminGameEditPage from '../pages/admin/AdminGameEditPage';
import AdminPowerRankingPage from '../pages/admin/AdminPowerRankingPage';
import AdminModerationPage from '../pages/admin/AdminModerationPage';
import AdminAllStarVotingPage from '../pages/admin/AdminAllStarVotingPage';
import AdminUniquePlaySyncPage from '../pages/admin/AdminUniquePlaySyncPage';
import { RequireAdmin } from '@shared/auth/RequireAdmin';
import { RequireScorerOrAdmin } from '@shared/auth/RequireScorerOrAdmin';
import { useAdmin } from '@shared/auth/useAdmin';

function AdminIndexRedirect() {
  const { isAdmin, canEditGameRecords, loading } = useAdmin();

  if (loading) {
    return (
      <div style={{ padding: '32px', textAlign: 'center', color: '#cbd5e1' }}>
        권한 확인 중...
      </div>
    );
  }

  if (isAdmin) return <Navigate to="landing" replace />;
  if (canEditGameRecords) return <Navigate to="games" replace />;
  return <Navigate to="/access-denied" replace />;
}

export const adminRoutes: RouteObject[] = [
  {
    path: 'admin',
    element: (
      <RequireScorerOrAdmin>
        <AdminLayoutPage />
      </RequireScorerOrAdmin>
    ),
    children: [
      { index: true, element: <AdminIndexRedirect /> },
      {
        path: 'landing',
        element: (
          <RequireAdmin>
            <AdminLandingPage />
          </RequireAdmin>
        ),
      },
      {
        path: 'intro',
        element: (
          <RequireAdmin>
            <AdminIntroPage />
          </RequireAdmin>
        ),
      },
      {
        path: 'rules',
        element: (
          <RequireAdmin>
            <AdminRulesPage />
          </RequireAdmin>
        ),
      },
      {
        path: 'teams',
        element: (
          <RequireAdmin>
            <AdminTeamsPage />
          </RequireAdmin>
        ),
      },
      {
        path: 'roles',
        element: (
          <RequireAdmin>
            <AdminRolesPage />
          </RequireAdmin>
        ),
      },
      { path: 'games', element: <AdminGamesPage /> },
      { path: 'games/:matchId', element: <AdminGameEditPage /> },
      {
        path: 'power-ranking',
        element: (
          <RequireAdmin>
            <AdminPowerRankingPage />
          </RequireAdmin>
        ),
      },
      {
        path: 'unique-play-sync',
        element: (
          <RequireAdmin>
            <AdminUniquePlaySyncPage />
          </RequireAdmin>
        ),
      },
      {
        path: 'maintenance',
        element: (
          <RequireAdmin>
            <AdminMaintenancePage />
          </RequireAdmin>
        ),
      },
      {
        path: 'allstar-voting',
        element: (
          <RequireAdmin>
            <AdminAllStarVotingPage />
          </RequireAdmin>
        ),
      },
      {
        path: 'moderation',
        element: (
          <RequireAdmin>
            <AdminModerationPage />
          </RequireAdmin>
        ),
      },
    ],
  },
];

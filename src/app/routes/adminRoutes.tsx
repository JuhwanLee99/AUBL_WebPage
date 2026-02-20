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
import { RequireAdmin } from '@shared/auth/RequireAdmin';

export const adminRoutes: RouteObject[] = [
  {
    path: 'admin',
    element: (
      <RequireAdmin>
        <AdminLayoutPage />
      </RequireAdmin>
    ),
    children: [
      { index: true, element: <Navigate to="landing" replace /> },
      { path: 'landing', element: <AdminLandingPage /> },
      { path: 'intro', element: <AdminIntroPage /> },
      { path: 'rules', element: <AdminRulesPage /> },
      { path: 'teams', element: <AdminTeamsPage /> },
      { path: 'roles', element: <AdminRolesPage /> },
      { path: 'games', element: <AdminGamesPage /> },
      { path: 'games/:matchId', element: <AdminGameEditPage /> },
      { path: 'maintenance', element: <AdminMaintenancePage /> },
    ],
  },
];

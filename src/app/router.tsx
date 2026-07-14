import { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import Layout from './Layout';
import { MaintenanceGuard } from '@shared/auth/MaintenanceGuard';
import { publicRoutes } from './routes/publicRoutes';
import { scoreRoutes } from './routes/scoreRoutes';
import { adminRoutes } from './routes/adminRoutes';

const AllStarVotingPage = lazy(() => import('@features/allstar/pages/AllStarVotingPage'));

export const router = createBrowserRouter([
  {
    path: '/allstar',
    element: (
      <MaintenanceGuard>
        <Suspense fallback={<div role="status" aria-live="polite">올스타전 페이지를 불러오는 중…</div>}>
          <AllStarVotingPage />
        </Suspense>
      </MaintenanceGuard>
    ),
  },
  {
    path: '/',
    element: (
      <MaintenanceGuard>
        <Layout />
      </MaintenanceGuard>
    ),
    children: [...publicRoutes, ...scoreRoutes, ...adminRoutes],
  },
]);

import { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import Layout from './Layout';
import { MaintenanceGuard } from '@shared/auth/MaintenanceGuard';
import { publicRoutes } from './routes/publicRoutes';
import { scoreRoutes } from './routes/scoreRoutes';
import { adminRoutes } from './routes/adminRoutes';
import { AllStarFeatureGate } from '@shared/config/AllStarFeatureGate';
import { RequireAdmin } from '@shared/auth/RequireAdmin';

const AllStarVotingPage = lazy(() => import('@features/allstar/pages/AllStarVotingPage'));
const CardAssetPreview = lazy(() => import('@features/allstar/pages/CardAssetPreview'));

export const router = createBrowserRouter([
  {
    path: '/allstar-card-preview',
    element: (
      <RequireAdmin>
        <Suspense fallback={<div role="status" aria-live="polite">카드 디자인을 불러오는 중…</div>}>
          <CardAssetPreview />
        </Suspense>
      </RequireAdmin>
    ),
  },
  {
    path: '/allstar',
    element: (
      <MaintenanceGuard>
        <AllStarFeatureGate>
          <Suspense fallback={<div role="status" aria-live="polite">올스타전 페이지를 불러오는 중…</div>}>
            <AllStarVotingPage />
          </Suspense>
        </AllStarFeatureGate>
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

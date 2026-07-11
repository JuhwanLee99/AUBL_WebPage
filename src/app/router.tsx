import { createBrowserRouter } from 'react-router-dom';
import Layout from './Layout';
import { MaintenanceGuard } from '@shared/auth/MaintenanceGuard';
import { publicRoutes } from './routes/publicRoutes';
import { scoreRoutes } from './routes/scoreRoutes';
import { adminRoutes } from './routes/adminRoutes';
import AllStarVotingPage from '@features/allstar/pages/AllStarVotingPage';

export const router = createBrowserRouter([
  {
    path: '/allstar',
    element: (
      <MaintenanceGuard>
        <AllStarVotingPage />
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

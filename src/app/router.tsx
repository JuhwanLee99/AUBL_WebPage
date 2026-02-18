import { createBrowserRouter } from 'react-router-dom';
import Layout from './Layout';
import { MaintenanceGuard } from '@shared/auth/MaintenanceGuard';
import { publicRoutes } from './routes/publicRoutes';
import { scoreRoutes } from './routes/scoreRoutes';
import { adminRoutes } from './routes/adminRoutes';

export const router = createBrowserRouter([
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

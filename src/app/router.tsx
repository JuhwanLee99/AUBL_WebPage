import { createBrowserRouter } from 'react-router-dom';
import Layout from './Latout';
import LandingPage from '../pages/LandingPage';
import StandingsPage from '../pages/StandingPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      {
        index: true,
        element: <LandingPage />,
      },
      {
        path: 'standings',
        element: <StandingsPage />,
      },
    ],
  },
]);

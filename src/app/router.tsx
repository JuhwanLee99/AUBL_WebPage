import { createBrowserRouter } from 'react-router-dom';
import Layout from './Layout';
import LandingPage from '../pages/LandingPage';
import StandingsPage from '../pages/StandingPage';
import IntroPage from '../pages/IntroPage';
import PredictionPage from '../pages/PredictionPage';
import RecordPage from '../pages/RecordPage';

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
        path: 'intro',
        element: <IntroPage />,
      },
      {
        path: 'standings',
        element: <StandingsPage />,
      },
      {
        path: 'prediction',
        element: <PredictionPage />,
      },
      {
        path: 'records',
        element: <RecordPage />,
      },
    ],
  },
]);

import { createBrowserRouter } from 'react-router-dom';
import Layout from './Layout';
import LandingPage from '../front/pages/LandingPage';
import IntroPage from '../front/pages/IntroPage';
import StandingsPage from './pages/StandingPage';
import PredictionPage from './pages/PredictionPage';
import RecordPage from './pages/RecordPage';
import ScoreboardPage from '../scoreboard/pages/ScoreboardPage';
import ScorekeeperPage from '../scorekeeper/pages/ScorekeeperPage';
import RecordRoomPage from './pages/RecordRoomPage';
import PlayerDetailPage from './pages/PlayerDetailPage';

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
      {
        path: 'record-room',
        element: <RecordRoomPage />,
      },
      {
        path: 'scoreboard',
        element: <ScoreboardPage />,
      },
      {
        path: 'scorekeeper',
        element: <ScorekeeperPage />,
      },
      {
        path: 'player/:name',
        element: <PlayerDetailPage />,
      },
    ],
  },
]);

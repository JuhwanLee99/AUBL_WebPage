import { createBrowserRouter } from 'react-router-dom';
import Layout from './Layout';
import LandingPage from '../front/pages/LandingPage';
import IntroPage from '../front/pages/IntroPage';
import StandingsPage from './pages/StandingPage';
import PredictionPage from './pages/PredictionPage';
import RecordPage from './pages/RecordPage';
import CommunityPage from './pages/CommunityPage';
import ScoreboardPage from '../scoreboard/pages/ScoreboardPage';
import ScoreboardTextPage from '../scoreboard/pages/ScoreboardTextPage';
import ScoreboardLiveOverlayPage from '../scoreboard/pages/ScoreboardLiveOverlayPage';
import ScorekeeperPage from '../scorekeeper/pages/ScorekeeperPage';
import RecordRoomPage from './pages/RecordRoomPage';
import PlayerDetailPage from './pages/PlayerDetailPage';
import MatchSchedulePage from './pages/MatchSchedulePage';

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
        path: 'community',
        element: <CommunityPage />,
      },
      {
        path: 'schedule',
        element: <MatchSchedulePage />,
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
        path: 'scoreboard-text',
        element: <ScoreboardTextPage />,
      },
      {
        path: 'live-overlay',
        element: <ScoreboardLiveOverlayPage />,
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

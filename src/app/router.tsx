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
import PitcherRecordPage from './pages/PitcherRecordPage';
import BatterRecordPage from './pages/BatterRecordPage';
import PlayerDetailPage from './pages/PlayerDetailPage';
import MatchSchedulePage from './pages/MatchSchedulePage';
import ScheduleResultsPage from './pages/ScheduleResultsPage';
import ScheduleGroupsPage from './pages/ScheduleGroupsPage';
import ScheduleManagePage from './pages/ScheduleManagePage';
import PowerRankingPage from './pages/PowerRankingPage';
import LoginPage from './pages/LoginPage';
import AccessDeniedPage from './pages/AccessDeniedPage';

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
        path: 'standings/power-ranking',
        element: <PowerRankingPage />,
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
        path: 'schedule/results',
        element: <ScheduleResultsPage />,
      },
      {
        path: 'schedule/groups',
        element: <ScheduleGroupsPage />,
      },
      {
        path: 'schedule/manage',
        element: <ScheduleManagePage />,
      },
      {
        path: 'records',
        element: <RecordPage />,
      },
      {
        path: 'records/pitchers',
        element: <PitcherRecordPage />,
      },
      {
        path: 'records/batters',
        element: <BatterRecordPage />,
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
      {
        path: 'login',
        element: <LoginPage />,
      },
      {
        path: 'access-denied',
        element: <AccessDeniedPage />,
      },
    ],
  },
]);

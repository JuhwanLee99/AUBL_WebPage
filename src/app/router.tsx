import { Navigate, createBrowserRouter } from 'react-router-dom';
import Layout from './Layout';
import LandingPage from '../front/pages/LandingPage';
import IntroPage from '../front/pages/IntroPage';
import RulePage from '../front/pages/RulePage';
import TeamsPage from '../front/pages/TeamsPage';
import StandingsPage from './pages/StandingPage';
import PredictionPage from './pages/PredictionPage';
import RecordPage from './pages/RecordPage';
import CommunityPage from './pages/CommunityPage';
import CommunityGalleryPage from './pages/CommunityGalleryPage'; // 새로 추가
import CommunityNoticesPage from './pages/CommunityNoticesPage'; // 새로 추가
import NoticeWritePage from './pages/NoticeWritePage'; // 새로 추가
import NoticeDetailPage from './pages/NoticeDetailPage'; // 새로 추가
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
import ScheduleLivePage from './pages/ScheduleLivePage';
import SchedulePracticePage from './pages/SchedulePracticePage';
import PowerRankingPage from './pages/PowerRankingPage';
import LoginPage from './pages/LoginPage';
import AccessDeniedPage from './pages/AccessDeniedPage';
import AccountPage from './pages/AccountPage';
import { RequireAdmin } from '../shared/auth/RequireAdmin';
import { MaintenanceGuard } from '../shared/auth/MaintenanceGuard';
import AdminLayoutPage from './pages/admin/AdminLayoutPage';
import AdminLandingPage from './pages/admin/AdminLandingPage';
import AdminIntroPage from './pages/admin/AdminIntroPage';
import AdminRulesPage from './pages/admin/AdminRulesPage';
import AdminTeamsPage from './pages/admin/AdminTeamsPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <MaintenanceGuard>
        <Layout />
      </MaintenanceGuard>
    ),
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
        path: 'rules',
        element: <RulePage />,
      },
      {
        path: 'intro/teams',
        element: <TeamsPage />,
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
        children: [
          { index: true, element: <CommunityPage /> }, // 메인 대시보드
          { path: 'gallery', element: <CommunityGalleryPage /> }, // 갤러리 임베드
          { path: 'notices', element: <CommunityNoticesPage /> }, // 공지 목록
          { 
            path: 'notices/new', 
            element: (
              <RequireAdmin>
                <NoticeWritePage />
              </RequireAdmin>
            ) 
          }, // 공지 작성 (관리자만)
          // 개별 공지 상세 페이지가 필요하다면 'notices/:id' 추가 가능
          { path: 'notices/:noticeId', element: <NoticeDetailPage /> },
        ]
      },
      {
        path: 'schedule',
        element: <MatchSchedulePage />,
      },
      {
        path: 'schedule/live',
        element: <ScheduleLivePage />,
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
        path: 'schedule/practice',
        element: <SchedulePracticePage />,
      },
      {
        path: 'schedule/manage',
        element: (
          <RequireAdmin>
            <ScheduleManagePage />
          </RequireAdmin>
        ),
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
        path: 'scoreboard-text/:matchId',
        element: <ScoreboardTextPage />,
      },
      {
        path: 'live-overlay',
        element: <ScoreboardLiveOverlayPage />,
      },
      {
        path: 'scorekeeper',
        element: (
          <RequireAdmin>
            <ScorekeeperPage />
          </RequireAdmin>
        ),
      },
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
        ],
      },
      {
        path: 'player/:name',
        element: <PlayerDetailPage />,
      },
      {
        path: 'account',
        element: <AccountPage />,
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

import { Navigate, createBrowserRouter } from 'react-router-dom';
import Layout from './Layout';
import LandingPage from '../front/pages/LandingPage';
import IntroPage from '../front/pages/IntroPage';
import RulePage from '../front/pages/RulePage';
import PrivacyPage from '../front/pages/PrivacyPage';
import TermsPage from '../front/pages/TermsPage';
import UserManualPage from '../front/pages/UserManualPage';
import TeamsPage from '../front/pages/TeamsPage';
import TeamHubPage from '../front/pages/TeamHubPage';
import TeamDetailPage from '../front/pages/TeamDetailPage';
import TeamNoticeDetailPage from '../front/pages/TeamNoticeDetailPage';
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
import PlayerDetailPage from './pages/PlayerDetailPage';
import MatchSchedulePage from './pages/MatchSchedulePage';
import ScheduleResultsPage from './pages/ScheduleResultsPage';
import ScheduleGroupsPage from './pages/ScheduleGroupsPage';
import ScheduleManagePage from './pages/ScheduleManagePage';
import ScheduleLivePage from './pages/ScheduleLivePage';
import SchedulePracticePage from './pages/SchedulePracticePage';
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
import AdminRolesPage from './pages/admin/AdminRolesPage';

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
        path: 'privacy',
        element: <PrivacyPage />,
      },
      {
        path: 'terms',
        element: <TermsPage />,
      },
      {
        path: 'manual',
        element: <UserManualPage />,
      },
      {
        path: 'intro/teams',
        element: <TeamsPage />,
      },
      {
        path: 'teams',
        element: <TeamHubPage />,
      },
      {
        path: 'teams/:teamId',
        element: <TeamDetailPage />,
      },
      {
        path: 'teams/:teamId/notices/:noticeId',
        element: <TeamNoticeDetailPage />,
      },
      {
        path: 'standings',
        element: <Navigate to="/records?tab=standings" replace />,
      },
      {
        path: 'standings/power-ranking',
        element: <Navigate to="/records?tab=power" replace />,
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
        element: <Navigate to="/records?tab=pitchers" replace />,
      },
      {
        path: 'records/batters',
        element: <Navigate to="/records?tab=batters" replace />,
      },
      {
        path: 'records/player',
        element: <PlayerDetailPage />,
      },
      {
        path: 'records/player/:playerId',
        element: <PlayerDetailPage />,
      },
      {
        path: 'scoreboard',
        element: <ScoreboardPage />,
      },
      {
        path: 'scoreboard/:matchId',
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
        path: 'live-overlay/:matchId',
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
        path: 'scorekeeper/:matchId',
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
          { path: 'roles', element: <AdminRolesPage /> },
        ],
      },
      {
        path: 'player',
        element: <PlayerDetailPage />,
      },
      {
        path: 'player/:playerId',
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

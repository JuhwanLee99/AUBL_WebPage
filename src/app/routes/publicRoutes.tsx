import { Navigate } from 'react-router-dom';
import type { RouteObject } from 'react-router-dom';
import LandingPage from '@features/front/pages/LandingPage';
import IntroPage from '@features/front/pages/IntroPage';
import RulePage from '@features/front/pages/RulePage';
import PrivacyPage from '@features/front/pages/PrivacyPage';
import TermsPage from '@features/front/pages/TermsPage';
import UserManualPage from '@features/front/pages/UserManualPage';
import TeamsPage from '@features/front/pages/TeamsPage';
import TeamHubPage from '@features/front/pages/TeamHubPage';
import TeamDetailPage from '@features/front/pages/TeamDetailPage';
import TeamNoticeDetailPage from '@features/front/pages/TeamNoticeDetailPage';
import PredictionPage from '../pages/PredictionPage';
import RecordPage from '../pages/RecordPage';
import CommunityPage from '../pages/CommunityPage';
import CommunityGalleryPage from '../pages/CommunityGalleryPage';
import CommunityNoticesPage from '../pages/CommunityNoticesPage';
import NoticeWritePage from '../pages/NoticeWritePage';
import NoticeDetailPage from '../pages/NoticeDetailPage';
import InquiryBoardPage from '../pages/InquiryBoardPage';
import InquiryWritePage from '../pages/InquiryWritePage';
import InquiryDetailPage from '../pages/InquiryDetailPage';
import PlayerDetailPage from '../pages/PlayerDetailPage';
import MatchSchedulePage from '../pages/MatchSchedulePage';
import ScheduleResultsPage from '../pages/ScheduleResultsPage';
import ScheduleGroupsPage from '../pages/ScheduleGroupsPage';
import ScheduleManagePage from '../pages/ScheduleManagePage';
import ScheduleLivePage from '../pages/ScheduleLivePage';
import SchedulePracticePage from '../pages/SchedulePracticePage';
import LoginPage from '../pages/LoginPage';
import AccessDeniedPage from '../pages/AccessDeniedPage';
import AccountPage from '../pages/AccountPage';
import { RequireAdmin } from '@shared/auth/RequireAdmin';

export const publicRoutes: RouteObject[] = [
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
      { index: true, element: <CommunityPage /> },
      { path: 'gallery', element: <CommunityGalleryPage /> },
      { path: 'notices', element: <CommunityNoticesPage /> },
      {
        path: 'notices/new',
        element: (
          <RequireAdmin>
            <NoticeWritePage />
          </RequireAdmin>
        ),
      },
      { path: 'notices/:noticeId', element: <NoticeDetailPage /> },
      { path: 'inquiry', element: <InquiryBoardPage /> },
      { path: 'inquiry/new', element: <InquiryWritePage /> },
      { path: 'inquiry/:inquiryId', element: <InquiryDetailPage /> },
    ],
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
];

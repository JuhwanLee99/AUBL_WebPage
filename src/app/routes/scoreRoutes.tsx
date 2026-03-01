import type { RouteObject } from 'react-router-dom';
import ScoreboardPage from '@features/scoreboard/pages/ScoreboardPage';
import ScoreboardTextPage from '@features/scoreboard/pages/ScoreboardTextPage';
import ScoreboardLiveOverlayPage from '@features/scoreboard/pages/ScoreboardLiveOverlayPage';
import ScorekeeperPage from '@features/scorekeeper/pages/ScorekeeperPage';
import { RequireScorerOrAdmin } from '@shared/auth/RequireScorerOrAdmin';

export const scoreRoutes: RouteObject[] = [
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
      <RequireScorerOrAdmin>
        <ScorekeeperPage />
      </RequireScorerOrAdmin>
    ),
  },
  {
    path: 'scorekeeper/:matchId',
    element: (
      <RequireScorerOrAdmin>
        <ScorekeeperPage />
      </RequireScorerOrAdmin>
    ),
  },
];

import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ScoreboardFrame from '../components/ScoreboardFrame';
import { useDemoStore } from '@shared/state/demoStore';

export default function ScoreboardPage() {
  const { state, actions } = useDemoStore();
  const { selectMatch } = actions;
  const { matchId } = useParams<{ matchId?: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    if (matchId && matchId !== state.activeMatchId) {
      const matchExists = state.matches.some((m) => m.id === matchId);
      if (matchExists) {
        selectMatch(matchId);
      }
    }
  }, [matchId, state.activeMatchId, state.matches, selectMatch]);

  useEffect(() => {
    if (!matchId && state.activeMatchId) {
      navigate(`/scoreboard/${state.activeMatchId}`, { replace: true });
    }
  }, [matchId, state.activeMatchId, navigate]);

  const MIN_PANEL_HEIGHT_PX = 640;
  const targetHeight = `max(${MIN_PANEL_HEIGHT_PX}px, min(74vh, calc(100vh - 320px)))`;

  return (
    <ScoreboardFrame
      variant="page"
      panelStyle={{
        width: '100%',
        maxWidth: `min(100%, calc(${targetHeight} * 16 / 9))`,
        height: targetHeight,
        minHeight: `${MIN_PANEL_HEIGHT_PX}px`,
      }}
    />
  );
}

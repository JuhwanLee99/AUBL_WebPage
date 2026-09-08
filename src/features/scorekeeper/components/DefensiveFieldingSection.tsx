import { useDemoStore } from '../../../shared/state/demoStore';
import DefensiveFieldingPanel from './DefensiveFieldingPanel';

export default function DefensiveFieldingSection({ allowed = false }: { allowed?: boolean }) {
  const { state } = useDemoStore();
  if (!allowed) return null;
  return <DefensiveFieldingPanel events={state.events} matchId={state.activeMatchId} />;
}

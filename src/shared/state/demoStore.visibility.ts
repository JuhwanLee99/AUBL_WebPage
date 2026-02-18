import { auth } from '../firebase/client';
import {
  cloneBenches,
  cloneLineups,
  ensureCompleteLineups,
  hasActualPlayers,
  isDemoLineups,
  isPracticeMatch,
} from './demoStore.lineup';
import type { DemoState, MatchSchedule, SharedGameState } from './demoStore';

export function applyLineupVisibility(
  data: SharedGameState,
  match: MatchSchedule | null | undefined,
  isAdmin: boolean,
): SharedGameState {
  if (!match) return data;
  const lineupVisible =
    Boolean(match.lineupPublic) ||
    data.gameStarted === true ||
    match.status === 'inProgress' ||
    match.status === 'completed';

  if (!isAdmin && !lineupVisible) {
    return {
      ...data,
      lineups: { home: [], away: [] },
      benches: { home: [], away: [] },
    };
  }

  if (isAdmin && match.lineups) {
    const dataLineups = data.lineups ?? { home: [], away: [] };
    const dataIsDemo = isDemoLineups(dataLineups);
    const dataHasPlayers =
      !dataIsDemo && (hasActualPlayers(dataLineups.home) || hasActualPlayers(dataLineups.away));
    const matchHasPlayers =
      hasActualPlayers(match.lineups.home) || hasActualPlayers(match.lineups.away);
    if (matchHasPlayers && match.status === 'scheduled' && !data.scorerUid) {
      const preparedLineups = isPracticeMatch(match)
        ? cloneLineups(match.lineups)
        : ensureCompleteLineups(match.lineups);
      return {
        ...data,
        lineups: preparedLineups,
        benches: match.benches ? cloneBenches(match.benches) : data.benches,
      };
    }
    if (!dataHasPlayers && matchHasPlayers) {
      const preparedLineups = isPracticeMatch(match)
        ? cloneLineups(match.lineups)
        : ensureCompleteLineups(match.lineups);
      return {
        ...data,
        lineups: preparedLineups,
        benches: match.benches ? cloneBenches(match.benches) : data.benches,
      };
    }
  }

  return data;
}

export function mergeOwnerLineups(
  data: SharedGameState,
  matchId: string | null,
  localState: DemoState,
): SharedGameState {
  const currentUid = auth.currentUser?.uid ?? null;
  if (!currentUid || !matchId) return data;
  if (data.scorerUid && data.scorerUid !== currentUid) return data;

  const localIsDemo = isDemoLineups(localState.lineups);
  const localHasPlayers =
    !localIsDemo && (hasActualPlayers(localState.lineups.home) || hasActualPlayers(localState.lineups.away));
  if (!localHasPlayers) return data;

  return {
    ...data,
    lineups: cloneLineups(localState.lineups),
    benches: cloneBenches(localState.benches),
  };
}

import { useMemo } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { firestore } from '../firebase/client';
import { SPECTATOR_EXPANDED_FEED_LIMIT } from './demoStore.constants';
import { buildPostGameRecord } from './demoStore.record';
import type {
  BattedBallDetails,
  DemoState,
  ErrorDetails,
  MatchSchedule,
  PlayerSlot,
  RunnerAdvanceSelections,
} from './demoStore';

type Side = 'home' | 'away';
type RefLike<T> = { current: T };

type GameAction =
  | { type: 'ball' }
  | { type: 'strike'; strikeType?: 'swinging' | 'looking' }
  | { type: 'foul'; isBunt?: boolean }
  | { type: 'strikeOut'; strikeType?: 'swinging' | 'looking' }
  | { type: 'droppedThirdStrike'; variant?: 'strikeout' | 'reach' | 'tag_out' | 'force_out'; strikeType?: 'swinging' | 'looking'; runnerOuts?: string[] }
  | { type: 'out'; battedBall?: BattedBallDetails | null }
  | { type: 'outWithMessage'; note: string; battedBall?: BattedBallDetails | null }
  | { type: 'doublePlay'; battedBall?: BattedBallDetails | null; selectedRunners?: number[]; route?: number[]; runnerAdvancements?: Record<number, number> }
  | { type: 'triplePlay'; battedBall?: BattedBallDetails | null; selectedRunners?: number[]; route?: number[]; runnerAdvancements?: Record<number, number> }
  | { type: 'hit'; bases: 1 | 2 | 3 | 4; advances?: RunnerAdvanceSelections; battedBall?: BattedBallDetails | null }
  | { type: 'fielderChoice'; advances?: RunnerAdvanceSelections; battedBall?: BattedBallDetails | null; context?: string }
  | { type: 'walk' }
  | { type: 'intentionalWalk' }
  | { type: 'catcherInterference' }
  | { type: 'hbp' }
  | { type: 'sac'; battedBall?: BattedBallDetails | null; sacType?: 'fly' | 'bunt' }
  | { type: 'error'; details: ErrorDetails }
  | { type: 'stealSuccess' }
  | { type: 'stealFail' }
  | { type: 'runnerRundownOut'; base: 0 | 1 | 2 }
  | { type: 'runnerInterference'; base: 0 | 1 | 2 }
  | { type: 'resetCount' }
  | { type: 'clearBases' }
  | { type: 'nextHalf' }
  | { type: 'advanceRunners'; selections: RunnerAdvanceSelections; message: string; preserveLastPlay?: boolean }
  | { type: 'runnerStealSuccess'; base: 0 | 1 | 2 }
  | { type: 'runnerCaught'; base: 0 | 1 | 2 }
  | { type: 'runnerPickoff'; base: 0 | 1 | 2 }
  | { type: 'runnerOut'; base: 0 | 1 | 2 }
  | { type: 'multipleRunnersOut'; bases: number[]; label?: string }
  | { type: 'manualLog'; message: string }
  | { type: 'setLiveVideoUrl'; url: string }
  | { type: 'setLiveDelaySeconds'; seconds: number }
  | { type: 'setTeamName'; side: Side; name: string }
  | { type: 'setLineup'; side: Side; index: number; updates: Partial<PlayerSlot> }
  | { type: 'removeLineupSlot'; side: Side; index: number }
  | { type: 'removePracticeBatter'; side: Side; battingOrderIndex: number }
  | { type: 'swapPositions'; side: Side; swaps: { index: number; newPos: string }[]; benchSwaps?: { index: number; newPos: string }[] }
  | { type: 'addBench'; side: Side; player: PlayerSlot }
  | { type: 'removeBench'; side: Side; benchIndex: number }
  | { type: 'substitute'; side: Side; benchIndex: number; lineupIndex: number; substitutionType?: '대수비' | '대타' | '대주자' }
  | { type: 'setPlay'; message: string }
  | { type: 'startGame' }
  | { type: 'endGame'; endedAt: string }
  | { type: 'resetGame' }
  | { type: 'undo' }
  | { type: 'setGameLimit'; minutes: number | null }
  | { type: 'pauseGameTimer' }
  | { type: 'resumeGameTimer' };

type Dispatch = (action: GameAction) => void;

export function useGameActions(params: {
  dispatch: Dispatch;
  stateRef: RefLike<DemoState>;
  spectatorFeedLimitRef: RefLike<number>;
  setSpectatorFeedLimit: (limit: number) => void;
  pushMatchUpdate: (matchId: string, overrides?: Partial<MatchSchedule>) => Promise<unknown> | unknown;
}) {
  const { dispatch, stateRef, spectatorFeedLimitRef, setSpectatorFeedLimit, pushMatchUpdate } = params;

  return useMemo(() => ({
    addBall: () => dispatch({ type: 'ball' }),
    addStrike: (strikeType?: 'swinging' | 'looking') => dispatch({ type: 'strike', strikeType }),
    addFoul: (isBunt?: boolean) => dispatch({ type: 'foul', isBunt }),
    strikeOut: (strikeType?: 'swinging' | 'looking') => dispatch({ type: 'strikeOut', strikeType }),
    droppedThirdStrike: (variant?: 'strikeout' | 'reach' | 'tag_out' | 'force_out', strikeType?: 'swinging' | 'looking', runnerOuts?: string[]) =>
      dispatch({ type: 'droppedThirdStrike', variant, strikeType, runnerOuts }),
    addOut: (battedBall?: BattedBallDetails | null) => dispatch({ type: 'out', battedBall }),
    hitSingle: (advances?: RunnerAdvanceSelections, battedBall?: BattedBallDetails | null) =>
      dispatch({ type: 'hit', bases: 1, advances, battedBall }),
    hitDouble: (advances?: RunnerAdvanceSelections, battedBall?: BattedBallDetails | null) =>
      dispatch({ type: 'hit', bases: 2, advances, battedBall }),
    hitTriple: (advances?: RunnerAdvanceSelections, battedBall?: BattedBallDetails | null) =>
      dispatch({ type: 'hit', bases: 3, advances, battedBall }),
    homeRun: (battedBall?: BattedBallDetails | null) => dispatch({ type: 'hit', bases: 4, battedBall }),
    fielderChoice: (advances?: RunnerAdvanceSelections, battedBall?: BattedBallDetails | null, context?: string) =>
      dispatch({ type: 'fielderChoice', advances, battedBall, context }),
    walk: () => dispatch({ type: 'walk' }),
    intentionalWalk: () => dispatch({ type: 'intentionalWalk' }),
    catcherInterference: () => dispatch({ type: 'catcherInterference' }),
    hbp: () => dispatch({ type: 'hbp' }),
    sacFly: (battedBall?: BattedBallDetails | null) => dispatch({ type: 'sac', battedBall, sacType: 'fly' }),
    sacBunt: (battedBall?: BattedBallDetails | null) => dispatch({ type: 'sac', battedBall, sacType: 'bunt' }),
    recordError: (details: ErrorDetails) => dispatch({ type: 'error', details }),
    stealSuccess: () => dispatch({ type: 'stealSuccess' }),
    stealFail: () => dispatch({ type: 'stealFail' }),
    runnerRundownOut: (base: 0 | 1 | 2) => dispatch({ type: 'runnerRundownOut', base }),
    runnerInterference: (base: 0 | 1 | 2) => dispatch({ type: 'runnerInterference', base }),
    resetCount: () => dispatch({ type: 'resetCount' }),
    clearBases: () => dispatch({ type: 'clearBases' }),
    nextHalf: () => dispatch({ type: 'nextHalf' }),
    loadMoreFeed: () => {
      const current = spectatorFeedLimitRef.current;
      const next = current >= SPECTATOR_EXPANDED_FEED_LIMIT ? current : SPECTATOR_EXPANDED_FEED_LIMIT;
      spectatorFeedLimitRef.current = next;
      setSpectatorFeedLimit(next);
    },
    advanceRunners: (selections: RunnerAdvanceSelections, message: string, preserveLastPlay?: boolean) =>
      dispatch({ type: 'advanceRunners', selections, message, preserveLastPlay }),
    runnerStealSuccess: (base: 0 | 1 | 2) => dispatch({ type: 'runnerStealSuccess', base }),
    runnerCaught: (base: 0 | 1 | 2) => dispatch({ type: 'runnerCaught', base }),
    runnerPickoff: (base: 0 | 1 | 2) => dispatch({ type: 'runnerPickoff', base }),
    runnerOut: (base: 0 | 1 | 2) => dispatch({ type: 'runnerOut', base }),
    multipleRunnersOut: (bases: number[], label?: string) => dispatch({ type: 'multipleRunnersOut', bases, label }),
    addManualLog: (message: string) => dispatch({ type: 'manualLog', message }),
    setLiveVideoUrl: (url: string) => {
      dispatch({ type: 'setLiveVideoUrl', url });
      const matchId = stateRef.current.activeMatchId;
      if (!matchId) return;
      const trimmed = url.trim();
      void setDoc(doc(firestore, 'matches', matchId), { liveVideoUrl: trimmed }, { merge: true }).catch(() => {});
    },
    setLiveDelaySeconds: (seconds: number) => {
      dispatch({ type: 'setLiveDelaySeconds', seconds });
      const matchId = stateRef.current.activeMatchId;
      if (!matchId) return;
      const validSeconds = Math.max(0, seconds);
      void setDoc(doc(firestore, 'matches', matchId), { liveDelaySeconds: validSeconds }, { merge: true }).catch(() => {});
    },
    addOutWithMessage: (note: string, battedBall?: BattedBallDetails | null) =>
      dispatch({ type: 'outWithMessage', note, battedBall }),
    doublePlay: (battedBall?: BattedBallDetails | null, selectedRunners?: number[], route?: number[], runnerAdvancements?: Record<number, number>) =>
      dispatch({ type: 'doublePlay', battedBall, selectedRunners, route, runnerAdvancements }),
    triplePlay: (battedBall?: BattedBallDetails | null, selectedRunners?: number[], route?: number[], runnerAdvancements?: Record<number, number>) =>
      dispatch({ type: 'triplePlay', battedBall, selectedRunners, route, runnerAdvancements }),
    setTeamName: (side: Side, name: string) => dispatch({ type: 'setTeamName', side, name }),
    setLineup: (side: Side, index: number, updates: Partial<PlayerSlot>) =>
      dispatch({ type: 'setLineup', side, index, updates }),
    removeLineupSlot: (side: Side, index: number) => dispatch({ type: 'removeLineupSlot', side, index }),
    removePracticeBatter: (side: Side, battingOrderIndex: number) =>
      dispatch({ type: 'removePracticeBatter', side, battingOrderIndex }),
    swapPositions: (side: Side, swaps: { index: number; newPos: string }[], benchSwaps?: { index: number; newPos: string }[]) =>
      dispatch({ type: 'swapPositions', side, swaps, benchSwaps }),
    addBench: (side: Side, player: PlayerSlot) => dispatch({ type: 'addBench', side, player }),
    removeBench: (side: Side, benchIndex: number) => dispatch({ type: 'removeBench', side, benchIndex }),
    substitute: (side: Side, benchIndex: number, lineupIndex: number, substitutionType?: '대수비' | '대타' | '대주자') =>
      dispatch({ type: 'substitute', side, benchIndex, lineupIndex, substitutionType }),
    setPlay: (message: string) => dispatch({ type: 'setPlay', message }),
    startGame: () => {
      dispatch({ type: 'startGame' });
      const matchId = stateRef.current.activeMatchId;
      if (matchId) {
        void pushMatchUpdate(matchId, { status: 'inProgress', lineupPublic: true }).catch(() => {});
      }
    },
    endGame: (endedAt: string) => {
      dispatch({ type: 'endGame', endedAt });
      const matchId = stateRef.current.activeMatchId;
      if (!matchId) return;
      const snapshot = stateRef.current;
      const activeMatch = snapshot.matches.find((match) => match.id === matchId);
      const postGame = buildPostGameRecord(snapshot, activeMatch);
      void pushMatchUpdate(matchId, {
        status: 'completed',
        homeScore: snapshot.score.home,
        awayScore: snapshot.score.away,
        postGame,
      }).catch(() => {});
    },
    resetGame: () => dispatch({ type: 'resetGame' }),
    undo: () => dispatch({ type: 'undo' }),
    setGameLimit: (minutes: number | null) => dispatch({ type: 'setGameLimit', minutes }),
    pauseGameTimer: () => dispatch({ type: 'pauseGameTimer' }),
    resumeGameTimer: () => dispatch({ type: 'resumeGameTimer' }),
  }), [dispatch, stateRef, spectatorFeedLimitRef, setSpectatorFeedLimit, pushMatchUpdate]);
}

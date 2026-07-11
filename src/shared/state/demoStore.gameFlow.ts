import { formatUniqueName } from './demoStore.helpers';
import { getBattingEntriesForLineup, isPracticeMatch } from './demoStore.lineup';
import type { DemoState, PlayLog } from './demoStore';

type PushFeed = (feed: PlayLog[], entry: PlayLog) => PlayLog[];
type CreateLogEntry = (state: DemoState, result: string, pitch: number, eventId?: string) => PlayLog;

const hittingSide = (state: DemoState): 'home' | 'away' => (state.half === 'top' ? 'away' : 'home');

const isPracticeActiveMatch = (state: DemoState) => {
  if (!state.activeMatchId) return false;
  const activeMatch = state.matches.find((match) => match.id === state.activeMatchId);
  return isPracticeMatch(activeMatch);
};

export function nextBatter(state: DemoState) {
  const side = hittingSide(state);
  const lineup = state.lineups[side];
  const battingLineup = getBattingEntriesForLineup(lineup, isPracticeActiveMatch(state));

  const activeLineup = battingLineup.length ? battingLineup : lineup;
  const safeLength = activeLineup.length || 1;
  const idx = state.batterIndex[side] % safeLength;
  const batterSlot = activeLineup[idx];
  const batterName = batterSlot ? formatUniqueName(batterSlot.name, batterSlot.number) : '타자';
  const batterIndex = { ...state.batterIndex, [side]: (idx + 1) % safeLength };
  return { batterName, batterIndex };
}

export function changeHalf(
  state: DemoState,
  message: string,
  createLogEntry: CreateLogEntry,
  pushFeed: PushFeed,
  pitchNumber = 0,
  logState?: DemoState,
): DemoState {
  const nextHalf: 'top' | 'bottom' = state.half === 'top' ? 'bottom' : 'top';
  const nextInning = nextHalf === 'top' ? state.inning + 1 : state.inning;
  const logSource = logState ?? state;
  const inningLabel = `${state.inning}회${state.half === 'top' ? '초' : '말'}`;
  const endMarker = `${inningLabel} 종료`;
  const hasEndMarker = state.feed.some(
    (entry) => entry.inning === state.inning && entry.half === state.half && entry.result.includes('종료'),
  );
  const shouldAddEndMarker = !hasEndMarker;
  const feed = shouldAddEndMarker ? pushFeed(state.feed, createLogEntry(logSource, endMarker, pitchNumber)) : state.feed;
  return {
    ...state,
    inning: nextInning,
    half: nextHalf,
    outs: 0,
    balls: 0,
    strikes: 0,
    pitchCount: 0,
    bases: [null, null, null],
    runnerResponsiblePitcher: { 0: null, 1: null, 2: null },
    lastPlay: message,
    feed,
  };
}

import type { DemoState, MatchSchedule } from './demoStore';

// A new object represents a new access session, including A -> B -> A and live -> blocked -> live.
export type LiveRecordAccess = { matchId: string | null; allowed: boolean };

export function captureLiveRecordAccess(read: () => LiveRecordAccess, matchId: string | null) {
  const captured = read();
  return () => Boolean(matchId && captured.allowed && captured.matchId === matchId && read() === captured);
}

export function redactLiveScheduleRecord(match: MatchSchedule): MatchSchedule {
  return { ...match, lineups: undefined, benches: undefined, postGame: undefined, manualEntryDraft: undefined, notes: undefined };
}

export function clearLiveRecordState(base: DemoState, current: DemoState): DemoState {
  return {
    ...base, activeMatchId: current.activeMatchId, matches: current.matches,
    followCurrent: current.followCurrent, scorerPaused: true,
    lineups: { home: [], away: [] }, benches: { home: [], away: [] }, removed: { home: [], away: [] },
    feed: [], events: [], history: [], futureHistory: [],
  };
}

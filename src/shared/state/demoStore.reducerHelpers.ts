import {
  cloneBenches,
  cloneLineups,
  ensureCompleteLineups,
  hasActualPlayers,
  isPracticeMatch,
} from './demoStore.lineup';
import type { DemoState, MatchSchedule } from './demoStore';

const isPracticeActiveMatch = (state: DemoState) => {
  if (!state.activeMatchId) return false;
  const activeMatch = state.matches.find((match) => match.id === state.activeMatchId);
  return isPracticeMatch(activeMatch);
};

export function updateMatchSchedule(matches: MatchSchedule[], matchId: string, updates: Partial<MatchSchedule>) {
  return matches.map((match) => (match.id === matchId ? { ...match, ...updates } : match));
}

export function resetGameForMatch(state: DemoState, match: MatchSchedule): DemoState {
  const rawLineups = match.lineups ?? { home: [], away: [] };
  const hasLineups = hasActualPlayers(rawLineups.home) || hasActualPlayers(rawLineups.away);
  const lineups =
    hasLineups
      ? isPracticeMatch(match)
        ? cloneLineups(rawLineups)
        : ensureCompleteLineups(rawLineups)
      : rawLineups;
  const benches = match.benches ?? { home: [], away: [] };
  return {
    inning: 1,
    half: 'top',
    balls: 0,
    strikes: 0,
    outs: 0,
    pitchCount: 0,
    bases: [null, null, null],
    runnerResponsiblePitcher: { 0: null, 1: null, 2: null },
    score: { home: 0, away: 0 },
    lineScore: { home: [], away: [] },
    lastPlay: '경기 대기 중',
    feed: [],
    events: [],
    homeTeamId: match.homeTeamId ?? state.homeTeamId,
    awayTeamId: match.awayTeamId ?? state.awayTeamId,
    batterIndex: { home: 0, away: 0 },
    lineups: cloneLineups(lineups),
    benches: cloneBenches(benches),
    teamNames: { home: match.homeTeamName, away: match.awayTeamName },
    gameStarted: false,
    gameOver: false,
    endedAt: null,
    liveVideoUrl: state.liveVideoUrl,
    liveDelaySeconds: state.liveDelaySeconds,
    history: [],
    futureHistory: [],
    removed: { home: [], away: [] },
    matches: state.matches,
    activeMatchId: match.id,
    scorerUid: state.scorerUid,
    scorerName: state.scorerName,
    scorerEmail: state.scorerEmail,
    scorerLockedAt: state.scorerLockedAt,
    scorerRole: state.scorerRole,
    scorerPaused: false,
    followCurrent: state.followCurrent,
    gameLimitMinutes: null,
    gameStartTimestamp: null,
    gamePausedAt: null,
    gamePausedDuration: 0,
    onlineViewerCount: state.onlineViewerCount,
  };
}

export function createNewGame(state: DemoState): DemoState {
  const preparedLineups = isPracticeActiveMatch(state)
    ? cloneLineups(state.lineups)
    : ensureCompleteLineups(state.lineups);
  return {
    inning: 1,
    half: 'top',
    balls: 0,
    strikes: 0,
    outs: 0,
    pitchCount: 0,
    bases: [null, null, null],
    runnerResponsiblePitcher: { 0: null, 1: null, 2: null },
    score: { home: 0, away: 0 },
    lineScore: { home: [], away: [] },
    lastPlay: '경기 대기 중',
    feed: [],
    events: [],
    homeTeamId: state.homeTeamId,
    awayTeamId: state.awayTeamId,
    batterIndex: { home: 0, away: 0 },
    lineups: cloneLineups(preparedLineups),
    benches: cloneBenches(state.benches),
    teamNames: { ...state.teamNames },
    gameStarted: false,
    gameOver: false,
    endedAt: null,
    liveVideoUrl: state.liveVideoUrl,
    liveDelaySeconds: state.liveDelaySeconds,
    history: [],
    futureHistory: [],
    removed: { home: [], away: [] },
    matches: state.matches,
    activeMatchId: state.activeMatchId,
    scorerUid: state.scorerUid,
    scorerName: state.scorerName,
    scorerEmail: state.scorerEmail,
    scorerLockedAt: state.scorerLockedAt,
    scorerRole: state.scorerRole,
    scorerPaused: false,
    followCurrent: state.followCurrent,
    gameLimitMinutes: null,
    gameStartTimestamp: null,
    gamePausedAt: null,
    gamePausedDuration: 0,
    onlineViewerCount: state.onlineViewerCount,
  };
}

import { buildLineScoreFromFeed } from './demoStore.helpers';
import { ensureCompleteLineups, hasActualPlayers, isDemoLineups, isPracticeMatch } from './demoStore.lineup';
import { normalizeEvents, normalizeFeed, normalizeRunArray } from './demoStore.normalize';
import { normalizeMatches } from './demoStore.schedule';
import type { DemoSnapshot, DemoState, PlayerSlot } from './demoStore';

export function normalizeState(base: DemoState, incoming: DemoState): DemoState {
  const merged = { ...base, ...incoming } as DemoState;
  const feed = normalizeFeed(merged.feed, { inning: merged.inning, half: merged.half });
  const events = normalizeEvents(merged.events, { inning: merged.inning, half: merged.half });
  const matches = normalizeMatches(merged.matches ?? base.matches);
  const hasIncomingLineScore = Object.prototype.hasOwnProperty.call(incoming, 'lineScore');
  const lineScore =
    hasIncomingLineScore && merged.lineScore && typeof merged.lineScore === 'object'
      ? {
          home: normalizeRunArray((merged.lineScore as { home?: unknown }).home),
          away: normalizeRunArray((merged.lineScore as { away?: unknown }).away),
        }
      : buildLineScoreFromFeed(feed);
  let rawLineups = merged.lineups ?? base.lineups;
  const hasLineups = hasActualPlayers(rawLineups.home) || hasActualPlayers(rawLineups.away);
  const isDemo = isDemoLineups(rawLineups);
  if ((!hasLineups || isDemo) && merged.activeMatchId) {
    const active = matches.find((match) => match.id === merged.activeMatchId);
    const activeLineups = active?.lineups;
    const activeHasPlayers = activeLineups
      ? hasActualPlayers(activeLineups.home) || hasActualPlayers(activeLineups.away)
      : false;
    if (activeLineups && activeHasPlayers) {
      rawLineups = activeLineups;
    }
  }
  const safeLineups = hasActualPlayers(rawLineups.home) || hasActualPlayers(rawLineups.away)
    ? ensureCompleteLineups(rawLineups)
    : rawLineups;
  const history = Array.isArray(merged.history)
    ? merged.history.map((snap) => {
        const normalizedHistoryFeed = normalizeFeed((snap as DemoSnapshot).feed, { inning: snap.inning, half: snap.half });
        const normalizedHistoryEvents = normalizeEvents((snap as DemoSnapshot).events, {
          inning: snap.inning,
          half: snap.half,
        });
        const normalizedGameStarted =
          typeof (snap as DemoSnapshot).gameStarted === 'boolean'
            ? (snap as DemoSnapshot).gameStarted
            : normalizedHistoryFeed.length > 0;
        return {
          ...base,
          ...snap,
          pitchCount: typeof snap.pitchCount === 'number' ? snap.pitchCount : 0,
          feed: normalizedHistoryFeed,
          events: normalizedHistoryEvents,
          gameOver: Boolean((snap as DemoSnapshot).gameOver),
          endedAt: typeof (snap as DemoSnapshot).endedAt === 'string' ? (snap as DemoSnapshot).endedAt : null,
          gameStarted: normalizedGameStarted,
        };
      })
    : [];
  const gameStarted = typeof incoming.gameStarted === 'boolean' ? incoming.gameStarted : feed.length > 0;
  const gameLimitMinutes =
    typeof merged.gameLimitMinutes === 'number' ? merged.gameLimitMinutes : merged.gameLimitMinutes === null ? null : null;
  const gameStartTimestamp =
    typeof merged.gameStartTimestamp === 'number'
      ? merged.gameStartTimestamp
      : gameStarted && gameLimitMinutes !== null
        ? Date.now()
        : null;
  return {
    ...merged,
    pitchCount: merged.pitchCount ?? 0,
    feed,
    events,
    matches,
    lineScore,
    history,
    lineups: safeLineups,
    gameOver: Boolean(merged.gameOver),
    endedAt: typeof merged.endedAt === 'string' ? merged.endedAt : null,
    removed: merged.removed ?? base.removed,
    gameStarted,
    gameLimitMinutes,
    gameStartTimestamp,
    liveVideoUrl: typeof merged.liveVideoUrl === 'string' ? merged.liveVideoUrl : base.liveVideoUrl,
    liveDelaySeconds: typeof merged.liveDelaySeconds === 'number' ? merged.liveDelaySeconds : base.liveDelaySeconds,
    activeMatchId: typeof merged.activeMatchId === 'string' ? merged.activeMatchId : merged.activeMatchId === null ? null : base.activeMatchId,
    scorerUid: typeof merged.scorerUid === 'string' ? merged.scorerUid : null,
    scorerName: typeof merged.scorerName === 'string' ? merged.scorerName : null,
    scorerEmail: typeof merged.scorerEmail === 'string' ? merged.scorerEmail : null,
    scorerLockedAt: typeof merged.scorerLockedAt === 'number' ? merged.scorerLockedAt : null,
    scorerRole: typeof merged.scorerRole === 'string' ? merged.scorerRole : null,
    scorerPaused: typeof merged.scorerPaused === 'boolean' ? merged.scorerPaused : false,
    followCurrent: typeof merged.followCurrent === 'boolean' ? merged.followCurrent : true,
  };
}

export function snapshotState(state: DemoState): DemoSnapshot {
  const { history: _history, ...snapshot } = state;
  const activeMatch = state.activeMatchId
    ? state.matches.find((match) => match.id === state.activeMatchId)
    : null;
  const preserveEmptySlots = isPracticeMatch(activeMatch);
  const filterEmptySlots = (lineup: PlayerSlot[]) =>
    lineup.filter((slot) => slot.name && slot.name.trim() !== '');

  return {
    ...snapshot,
    lineups: preserveEmptySlots
      ? snapshot.lineups
      : {
          home: filterEmptySlots(snapshot.lineups.home),
          away: filterEmptySlots(snapshot.lineups.away),
        },
  };
}

export function shouldTrackHistory(actionType: string) {
  return ![
    'setTeamName',
    'setLineup',
    'addBench',
    'removeBench',
    'substitute',
    'addMatch',
    'updateMatch',
    'deleteMatch',
    'saveMatchLineups',
    'selectMatch',
    'setMatches',
    'moveMatchToTrash',
    'restoreMatch',
    'purgeTrash',
    'syncActiveMatch',
    'hydrate',
    'resetGame',
    'startGame',
    'setLiveVideoUrl',
    'setFeed',
    'setEvents',
  ].includes(actionType);
}

import type { DemoSnapshot } from '../state/demoStore';

/** Every new DemoSnapshot field must be explicitly classified at compile time. */
export const SCORING_STATE_FIELDS = {
  scoringRejections: 'ambient',
  inning: 'record', half: 'record', balls: 'record', strikes: 'record', outs: 'record',
  pitchCount: 'record', bases: 'record', runnerResponsiblePitcher: 'record',
  score: 'record', lineScore: 'record', lastPlay: 'record', feed: 'record', events: 'record',
  homeTeamId: 'record', awayTeamId: 'record', batterIndex: 'record',
  lineups: 'record', benches: 'record', removed: 'record', teamNames: 'record',
  gameStarted: 'record', gameOver: 'record', endedAt: 'record', activeMatchId: 'record',
  gameLimitMinutes: 'record', gameStartTimestamp: 'record', gamePausedAt: 'record', gamePausedDuration: 'record',
  liveVideoUrl: 'ambient', liveDelaySeconds: 'ambient', matches: 'ambient',
  followCurrent: 'ambient', onlineViewerCount: 'ambient',
  scorerUid: 'access', scorerName: 'ambient', scorerEmail: 'ambient',
  scorerLockedAt: 'access', scorerRole: 'access', scorerPaused: 'access',
} as const satisfies Record<keyof DemoSnapshot, 'record' | 'access' | 'ambient'>;

type RecordKey = {
  [Key in keyof typeof SCORING_STATE_FIELDS]: typeof SCORING_STATE_FIELDS[Key] extends 'record' ? Key : never
}[keyof typeof SCORING_STATE_FIELDS];

/** A partial state for comparison/persistence, never a replacement for the live state. */
export function scoringCheckpoint<State extends object>(state: State): Pick<State, Extract<keyof State, RecordKey>> {
  const entries = Object.entries(state).filter(([key]) => {
    if (key === 'history' || key === 'futureHistory') return false;
    if (!Object.hasOwn(SCORING_STATE_FIELDS, key)) throw new Error(`unclassified-scoring-field:${key}`);
    return SCORING_STATE_FIELDS[key as keyof typeof SCORING_STATE_FIELDS] === 'record';
  });
  return Object.fromEntries(entries) as Pick<State, Extract<keyof State, RecordKey>>;
}

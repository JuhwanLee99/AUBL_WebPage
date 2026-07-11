import { FEED_LIMIT, SPECTATOR_EXPANDED_FEED_LIMIT } from './demoStore.constants';

export const formatUniqueName = (
  name: string,
  number: string | number | undefined | null,
) => {
  if (!name) return '';
  return number ? `${name}(${number})` : name;
};

type LineScore = { home: number[]; away: number[] };
type LineScoreSide = 'home' | 'away';
type FeedHalf = 'top' | 'bottom';
type FeedEntry = {
  eventId?: string;
  order: number;
  result: string;
  half: FeedHalf;
  inning: number;
};

const extractRuns = (result: string): number => {
  const match = result.match(/(\d+)\s*득점/);
  if (match) {
    const n = Number(match[1]);
    return Number.isFinite(n) && n > 0 ? n : 1;
  }
  if (!result.includes('득점')) return 0;
  const mentions = result.match(/득점/g);
  return mentions?.length ? mentions.length : 1;
};

export const addRunsToLineScore = (
  lineScore: LineScore | undefined,
  side: LineScoreSide,
  inning: number,
  runs: number,
): LineScore => {
  if (!runs) return lineScore ?? { home: [], away: [] };
  const next = {
    home: [...(lineScore?.home ?? [])],
    away: [...(lineScore?.away ?? [])],
  };
  const idx = Math.max(0, inning - 1);
  const target = side === 'home' ? next.home : next.away;
  if (target.length <= idx) {
    for (let i = target.length; i <= idx; i += 1) {
      target[i] = 0;
    }
  }
  target[idx] = Math.max(0, (target[idx] ?? 0) + runs);
  return next;
};

export const buildLineScoreFromFeed = (feed: FeedEntry[]): LineScore => {
  const groups = new Map<string, FeedEntry[]>();
  feed.forEach((entry, idx) => {
    const key = entry.eventId ?? `idx-${idx}`;
    const bucket = groups.get(key);
    if (bucket) {
      bucket.push(entry);
    } else {
      groups.set(key, [entry]);
    }
  });

  let lineScore: LineScore = { home: [], away: [] };

  groups.forEach((entries) => {
    const batterEntries = entries.filter((entry) => entry.order > 0);
    const targetEntries = batterEntries.length ? batterEntries : entries;
    const runs = targetEntries.reduce((sum, entry) => sum + extractRuns(entry.result), 0);
    if (!runs) return;
    const ref = batterEntries[0] ?? entries[0];
    const side: LineScoreSide = ref.half === 'top' ? 'away' : 'home';
    lineScore = addRunsToLineScore(lineScore, side, ref.inning, runs);
  });

  return lineScore;
};

export const isCompletedMatch = (match?: { status?: string } | null) =>
  match?.status === 'completed' || match?.status === 'canceled';

export const getSpectatorFeedLimitForMatch = (
  match?: { status?: string } | null,
  gameOver?: boolean,
) =>
  isCompletedMatch(match) || gameOver ? SPECTATOR_EXPANDED_FEED_LIMIT : FEED_LIMIT;

// Firestore는 undefined를 허용하지 않으므로 중첩 객체/배열에서 undefined를 제거한다.
export function pruneUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => pruneUndefined(v)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>((acc, [k, v]) => {
      if (v === undefined) return acc;
      acc[k] = pruneUndefined(v);
      return acc;
    }, {});
    return entries as unknown as T;
  }
  return value;
}

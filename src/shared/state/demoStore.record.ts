import type {
  MatchSchedule,
  PlayEvent,
  PlayLog,
  PlayerSlot,
  PostGameBatterLine,
  PostGameRecord,
} from './demoStore';
import { buildLineScoreFromFeed, formatUniqueName } from './demoStore.helpers';
import { getBattingOrder } from './demoStore.lineup';

type Side = 'home' | 'away';

type GameRecordSource = {
  homeTeamId: string;
  awayTeamId: string;
  teamNames: { home: string; away: string };
  inning: number;
  half: PlayLog['half'];
  gameStarted: boolean;
  gameOver: boolean;
  endedAt: string | null;
  scorerUid: string | null;
  scorerName: string | null;
  scorerEmail: string | null;
  scorerRole: string | null;
  score: { home: number; away: number };
  balls: number;
  strikes: number;
  outs: number;
  pitchCount: number;
  bases: (string | null)[];
  batterIndex: { home: number; away: number };
  lineups: { home: PlayerSlot[]; away: PlayerSlot[] };
  benches: { home: PlayerSlot[]; away: PlayerSlot[] };
  removed: { home: PlayerSlot[]; away: PlayerSlot[] };
  feed: PlayLog[];
  events: PlayEvent[];
  lastPlay: string;
  lineScore?: { home: number[]; away: number[] };
};

export interface GameRecord {
  meta: {
    homeTeamId: string;
    awayTeamId: string;
    homeTeamName: string;
    awayTeamName: string;
    inning: number;
    half: PlayLog['half'];
    gameStarted: boolean;
    gameOver: boolean;
    endedAt: string | null;
    scorerUid: string | null;
    scorerName: string | null;
    scorerEmail: string | null;
    scorerRole: string | null;
  };
  score: GameRecordSource['score'];
  counts: { balls: number; strikes: number; outs: number; pitchCount: number };
  bases: (string | null)[];
  batterIndex: GameRecordSource['batterIndex'];
  lineups: GameRecordSource['lineups'];
  benches: GameRecordSource['benches'];
  removed: GameRecordSource['removed'];
  feed: PlayLog[];
  events: PlayEvent[];
  lastPlay: string;
  liveStats: {
    lineScore: { home: number[]; away: number[] };
    hits: { home: number; away: number };
    errors: { home: number; away: number };
  };
}

type BatterStat = {
  pa: number;
  ab: number;
  h: number;
  singles: number;
  doubles: number;
  triples: number;
  hr: number;
  bb: number;
  hbp: number;
  so: number;
  sac: number;
  fc: number;
  ci: number;
  rbi: number;
  r: number;
};

type BatterStatsBySide = Record<Side, Map<string, BatterStat>>;

export function calculateGameStats(record: GameRecord): BatterStatsBySide {
  const stats: BatterStatsBySide = {
    home: new Map(),
    away: new Map(),
  };

  const buildRoster = (side: Side) => {
    const roster = new Map<string, PlayerSlot>();
    const add = (player: PlayerSlot) => {
      const name = player.name?.trim();
      if (!name) return;
      roster.set(name, player);
    };
    record.lineups[side].forEach(add);
    record.benches[side].forEach(add);
    record.removed[side].forEach(add);
    return roster;
  };

  const rosters = {
    home: buildRoster('home'),
    away: buildRoster('away'),
  };

  const resolveName = (raw: string, side: Side) => {
    const name = raw.trim();
    if (!name) return name;
    const roster = rosters[side];
    if (roster.has(name)) return name;
    const base = name.replace(/\([^)]*\)/g, '').trim();
    if (base && roster.has(base)) return base;
    for (const key of roster.keys()) {
      if (key.startsWith(`${name}(`) || (base && key.startsWith(`${base}(`))) return key;
    }
    return name;
  };

  const ensureStat = (side: Side, name: string) => {
    const store = stats[side];
    if (!store.has(name)) {
      store.set(name, {
        pa: 0,
        ab: 0,
        h: 0,
        singles: 0,
        doubles: 0,
        triples: 0,
        hr: 0,
        bb: 0,
        hbp: 0,
        so: 0,
        sac: 0,
        fc: 0,
        ci: 0,
        rbi: 0,
        r: 0,
      });
    }
    return store.get(name)!;
  };

  const extractRunnerName = (summary: string) => {
    if (!summary.includes('득점')) return null;
    const parts = summary
      .split('·')
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length >= 2) {
      return parts[parts.length - 1];
    }
    const match = summary.match(/(.+?)\s*득점/);
    return match ? match[1].trim() : null;
  };

  record.feed.forEach((entry) => {
    const side: Side = entry.half === 'top' ? 'away' : 'home';
    const rawName = entry.batter?.trim();
    if (!rawName) return;
    const name = resolveName(rawName, side);

    const normalized = entry.result.replace(/\s+/g, '');
    let kind = '';

    if (normalized.includes('홈런')) kind = 'hr';
    else if (normalized.includes('3루타')) kind = 'triple';
    else if (normalized.includes('2루타')) kind = 'double';
    else if (normalized.includes('1루타')) kind = 'single';
    else if (normalized.includes('고의') || normalized.toUpperCase().includes('IB')) kind = 'bb';
    else if (normalized.includes('볼넷')) kind = 'bb';
    else if (normalized.includes('몸에맞는공')) kind = 'hbp';
    else if (normalized.includes('타격방해')) kind = 'ci';
    else if (normalized.includes('야수선택') || normalized.toUpperCase().includes('F.C')) kind = 'fc';
    else if (normalized.includes('희생플라이') || normalized.includes('희생번트')) kind = 'sac';
    else if (normalized.includes('낫아웃')) kind = 'so_reach';
    else if (normalized.includes('삼진')) kind = 'so';
    else if (normalized.includes('아웃') && !normalized.includes('도루')) kind = 'out';

    if (!kind) return;

    const stat = ensureStat(side, name);
    switch (kind) {
      case 'single':
        stat.pa += 1;
        stat.ab += 1;
        stat.h += 1;
        stat.singles += 1;
        break;
      case 'double':
        stat.pa += 1;
        stat.ab += 1;
        stat.h += 1;
        stat.doubles += 1;
        break;
      case 'triple':
        stat.pa += 1;
        stat.ab += 1;
        stat.h += 1;
        stat.triples += 1;
        break;
      case 'hr':
        stat.pa += 1;
        stat.ab += 1;
        stat.h += 1;
        stat.hr += 1;
        break;
      case 'bb':
        stat.pa += 1;
        stat.bb += 1;
        break;
      case 'ci':
        stat.pa += 1;
        stat.ci += 1;
        break;
      case 'fc':
        stat.pa += 1;
        stat.ab += 1;
        stat.fc += 1;
        break;
      case 'hbp':
        stat.pa += 1;
        stat.hbp += 1;
        break;
      case 'so':
      case 'so_reach':
        stat.pa += 1;
        stat.ab += 1;
        stat.so += 1;
        break;
      case 'out':
        stat.pa += 1;
        stat.ab += 1;
        break;
      case 'sac':
        stat.pa += 1;
        stat.sac += 1;
        break;
      default:
        break;
    }
  });

  record.events.forEach((event) => {
    const side: Side = event.half === 'top' ? 'away' : 'home';
    if (event.rbi && event.rbi > 0 && event.batter) {
      const batterName = resolveName(event.batter.trim(), side);
      const stat = ensureStat(side, batterName);
      stat.rbi += event.rbi;
    }
    if (Array.isArray(event.runners)) {
      event.runners.forEach((runnerSummary) => {
        const rawRunner = extractRunnerName(runnerSummary);
        if (!rawRunner) return;
        const runnerName = resolveName(rawRunner, side);
        const stat = ensureStat(side, runnerName);
        stat.r += 1;
      });
    }
  });

  return stats;
}

export function buildGameRecord(state: GameRecordSource): GameRecord {
  const transformPlayer = (player: PlayerSlot) => ({
    ...player,
    name: formatUniqueName(player.name, player.number),
  });

  const chronologicalFeed = state.feed;

  const liveHits = chronologicalFeed.reduce(
    (acc, entry) => {
      const offense: Side = entry.half === 'top' ? 'away' : 'home';
      const text = entry.result.replace(/\s+/g, '');
      if (
        text.includes('1루타') ||
        text.includes('2루타') ||
        text.includes('3루타') ||
        text.includes('홈런')
      ) {
        acc[offense] += 1;
      }
      return acc;
    },
    { home: 0, away: 0 },
  );

  const liveErrors = chronologicalFeed.reduce(
    (acc, entry) => {
      const text = entry.result.replace(/\s+/g, '');
      const hasError = text.includes('실책') || /\bE[1-9]\b/i.test(text);
      if (hasError) {
        const side: Side = entry.half === 'top' ? 'home' : 'away';
        acc[side] += 1;
      }
      return acc;
    },
    { home: 0, away: 0 },
  );

  const baseLineScore =
    state.lineScore && (state.lineScore.home.length || state.lineScore.away.length)
      ? state.lineScore
      : buildLineScoreFromFeed(chronologicalFeed);
  const maxInning = Math.max(state.inning, baseLineScore.home.length, baseLineScore.away.length);
  const padLine = (arr: number[]) => Array.from({ length: maxInning }, (_, idx) => arr[idx] ?? 0);
  const liveLine = { home: padLine(baseLineScore.home), away: padLine(baseLineScore.away) };

  return {
    meta: {
      homeTeamId: state.homeTeamId,
      awayTeamId: state.awayTeamId,
      homeTeamName: state.teamNames.home,
      awayTeamName: state.teamNames.away,
      inning: state.inning,
      half: state.half,
      gameStarted: state.gameStarted,
      gameOver: state.gameOver,
      endedAt: state.endedAt,
      scorerUid: state.scorerUid,
      scorerName: state.scorerName,
      scorerEmail: state.scorerEmail,
      scorerRole: state.scorerRole,
    },
    score: { ...state.score },
    counts: {
      balls: state.balls,
      strikes: state.strikes,
      outs: state.outs,
      pitchCount: state.pitchCount,
    },
    bases: [...state.bases],
    batterIndex: { ...state.batterIndex },
    lineups: {
      home: state.lineups.home.map(transformPlayer),
      away: state.lineups.away.map(transformPlayer),
    },
    benches: {
      home: state.benches.home.map(transformPlayer),
      away: state.benches.away.map(transformPlayer),
    },
    removed: {
      home: state.removed.home.map(transformPlayer),
      away: state.removed.away.map(transformPlayer),
    },
    feed: state.feed.map((entry) => ({ ...entry })),
    events: state.events.map((entry) => ({
      ...entry,
      runners: [...entry.runners],
      battedBall: entry.battedBall ? { ...entry.battedBall } : null,
      error: entry.error
        ? typeof entry.error === 'string'
          ? entry.error
          : {
              ...entry.error,
              advanceResults: {
                batter: entry.error.advanceResults.batter,
                runners: { ...entry.error.advanceResults.runners },
              },
            }
        : null,
    })),
    lastPlay: state.lastPlay,
    liveStats: {
      lineScore: liveLine,
      hits: liveHits,
      errors: liveErrors,
    },
  };
}

export function buildPostGameRecord(
  snapshot: GameRecordSource,
  activeMatch?: MatchSchedule | null,
): PostGameRecord | undefined {
  if (activeMatch?.recordMode === 'practice') return undefined;

  const gameRecord = buildGameRecord(snapshot);
  const statsMap = calculateGameStats(gameRecord);

  const buildRosterMap = (side: Side) => {
    const roster = new Map<string, PlayerSlot>();
    const add = (player: PlayerSlot) => {
      const name = formatUniqueName(player.name, player.number);
      if (!name) return;
      roster.set(name, player);
    };
    snapshot.lineups[side].forEach(add);
    snapshot.removed[side].forEach(add);
    snapshot.benches[side].forEach(add);
    return roster;
  };

  const rosterBySide = {
    home: buildRosterMap('home'),
    away: buildRosterMap('away'),
  };

  const buildOrderMap = (side: Side) => {
    const orderMap = new Map<number, string[]>();
    const lineup = snapshot.lineups[side];
    lineup.forEach((player, idx) => {
      const order = getBattingOrder(lineup, idx, false);
      if (!order) return;
      const name = formatUniqueName(player.name, player.number);
      if (!name) return;
      const list = orderMap.get(order) ?? [];
      if (!list.includes(name)) list.push(name);
      orderMap.set(order, list);
    });

    [...snapshot.removed[side]].reverse().forEach((player) => {
      const order = typeof player.order === 'number' && player.order > 0 ? player.order : null;
      if (!order) return;
      const name = formatUniqueName(player.name, player.number);
      if (!name) return;
      const list = orderMap.get(order) ?? [];
      if (!list.includes(name)) list.unshift(name);
      orderMap.set(order, list);
    });

    return orderMap;
  };

  const toBatterLines = (side: Side): PostGameBatterLine[] => {
    const sideStats = statsMap[side];
    const roster = rosterBySide[side];
    const orderMap = buildOrderMap(side);
    const rows: PostGameBatterLine[] = [];
    const included = new Set<string>();
    const baseName = (name: string) => name.replace(/\([^)]*\)/g, '').trim();

    const pushLine = (name: string, order?: number | null) => {
      if (!name || included.has(name)) return;
      included.add(name);
      const stat = sideStats.get(name) ?? (baseName(name) ? sideStats.get(baseName(name)) : undefined);
      const pos = roster.get(name)?.pos;
      const ab = stat?.ab ?? 0;
      const h = stat?.h ?? 0;
      const avg = ab > 0 ? Number((h / ab).toFixed(3)) : undefined;

      rows.push({
        name,
        pos,
        order: order ?? undefined,
        pa: stat?.pa ?? 0,
        ab,
        h,
        r: stat?.r ?? 0,
        rbi: stat?.rbi ?? 0,
        singles: stat?.singles ?? 0,
        doubles: stat?.doubles ?? 0,
        triples: stat?.triples ?? 0,
        hr: stat?.hr ?? 0,
        bb: stat?.bb ?? 0,
        hbp: stat?.hbp ?? 0,
        so: stat?.so ?? 0,
        sac: stat?.sac ?? 0,
        fc: stat?.fc ?? 0,
        avg,
      });
    };

    const orders = [...orderMap.keys()].sort((a, b) => a - b);
    orders.forEach((order) => {
      const players = orderMap.get(order) ?? [];
      players.forEach((name) => pushLine(name, order));
    });

    sideStats.forEach((_stat, name) => {
      if (!included.has(name)) pushLine(name, null);
    });

    return rows;
  };

  const summarizeBatters = (side: Side) => {
    let ab = 0;
    let h = 0;
    let r = 0;
    let rbi = 0;
    statsMap[side].forEach((stat) => {
      ab += stat.ab;
      h += stat.h;
      r += stat.r;
      rbi += stat.rbi;
    });
    return { ab, h, r, rbi };
  };

  const lineScoreBase = snapshot.lineScore ?? { home: [], away: [] };
  const maxInning = Math.max(lineScoreBase.home.length, lineScoreBase.away.length);
  const innings = Array.from({ length: maxInning }, (_unused, idx) => idx + 1);
  const fillLine = (arr: number[]) => Array.from({ length: maxInning }, (_unused, idx) => arr[idx] ?? 0);

  return {
    lineScore: { innings, home: fillLine(lineScoreBase.home), away: fillLine(lineScoreBase.away) },
    totals: {
      home: { runs: snapshot.score.home, hits: 0, errors: 0 },
      away: { runs: snapshot.score.away, hits: 0, errors: 0 },
    },
    teamBatterSummary: {
      home: summarizeBatters('home'),
      away: summarizeBatters('away'),
    },
    batters: {
      home: toBatterLines('home'),
      away: toBatterLines('away'),
    },
  };
}

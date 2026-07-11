import type {
  BattedBallDetails,
  PlayEvent,
  PlayLog,
  PlayerSlot,
  PostGameBatterLine,
  PostGameLineScore,
  PostGamePitcherLine,
  PostGameRecord,
  PostGameTotals,
} from './demoStore';

type Half = 'top' | 'bottom';

export function normalizeFeed(feed: unknown, fallback: { inning: number; half: Half }): PlayLog[] {
  if (!Array.isArray(feed)) return [];
  const normalized = feed.map((entry) => {
    if (typeof entry === 'string') {
      return {
        inning: fallback.inning,
        half: fallback.half,
        order: 0,
        batter: '',
        pitch: 0,
        result: entry,
      };
    }
    if (entry && typeof entry === 'object') {
      const e = entry as Partial<PlayLog>;
      const half = e.half === 'top' || e.half === 'bottom' ? e.half : fallback.half;
      return {
        inning: typeof e.inning === 'number' ? e.inning : fallback.inning,
        half,
        order: typeof e.order === 'number' ? e.order : 0,
        batter: typeof e.batter === 'string' ? e.batter : '',
        pitch: typeof e.pitch === 'number' ? e.pitch : 0,
        result: typeof e.result === 'string' ? e.result : '',
        createdAt: typeof e.createdAt === 'number' ? e.createdAt : undefined,
        eventId: typeof e.eventId === 'string' ? e.eventId : undefined,
      };
    }
    return {
      inning: fallback.inning,
      half: fallback.half,
      order: 0,
      batter: '',
      pitch: 0,
      result: String(entry),
    };
  });

  return normalized.sort((a, b) => {
    if (a.inning !== b.inning) return a.inning - b.inning;
    if (a.half !== b.half) return a.half === 'top' ? -1 : 1;
    if (a.createdAt !== undefined && b.createdAt !== undefined) {
      return a.createdAt - b.createdAt;
    }
    if (a.createdAt === undefined && b.createdAt !== undefined) return 1;
    if (a.createdAt !== undefined && b.createdAt === undefined) return -1;
    if (a.order !== b.order) return a.order - b.order;
    return a.pitch - b.pitch;
  });
}

export function normalizeEvents(events: unknown, fallback: { inning: number; half: Half }): PlayEvent[] {
  if (!Array.isArray(events)) return [];
  return events.map((entry) => {
    if (typeof entry === 'string') {
      return {
        inning: fallback.inning,
        half: fallback.half,
        order: 0,
        batter: '',
        pitch: 0,
        type: 'note',
        runners: [],
        notes: entry,
      };
    }
    if (entry && typeof entry === 'object') {
      const e = entry as Partial<PlayEvent>;
      const half = e.half === 'top' || e.half === 'bottom' ? e.half : fallback.half;
      const battedBall =
        e.battedBall && typeof e.battedBall === 'object'
          ? (e.battedBall as BattedBallDetails)
          : typeof e.battedBall === 'string'
            ? { type: e.battedBall, zone: '' }
            : null;
      return {
        inning: typeof e.inning === 'number' ? e.inning : fallback.inning,
        half,
        order: typeof e.order === 'number' ? e.order : 0,
        batter: typeof e.batter === 'string' ? e.batter : '',
        pitch: typeof e.pitch === 'number' ? e.pitch : 0,
        type: typeof e.type === 'string' ? e.type : 'play',
        runners: Array.isArray(e.runners) ? e.runners.filter((r): r is string => typeof r === 'string') : [],
        battedBall,
        error: e.error ?? null,
        notes: typeof e.notes === 'string' ? e.notes : undefined,
        strikeType: e.strikeType === 'swinging' || e.strikeType === 'looking' ? e.strikeType : undefined,
        rbi: typeof e.rbi === 'number' ? e.rbi : undefined,
        dpRoute: Array.isArray(e.dpRoute) ? e.dpRoute.filter((v): v is number => typeof v === 'number') : undefined,
        earnedRunsBy:
          e.earnedRunsBy && typeof e.earnedRunsBy === 'object'
            ? (e.earnedRunsBy as Record<string, number>)
            : undefined,
        createdAt: typeof e.createdAt === 'number' ? e.createdAt : undefined,
        eventId: typeof e.eventId === 'string' ? e.eventId : undefined,
      };
    }
    return {
      inning: fallback.inning,
      half: fallback.half,
      order: 0,
      batter: '',
      pitch: 0,
      type: 'play',
      runners: [],
      notes: String(entry),
    };
  });
}

export function normalizePlayerSlot(slot: unknown): PlayerSlot | null {
  if (!slot || typeof slot !== 'object') return null;
  const s = slot as Partial<PlayerSlot>;
  return {
    name: typeof s.name === 'string' ? s.name : '미정',
    pos: typeof s.pos === 'string' ? s.pos : 'UT',
    number: typeof s.number === 'string' ? s.number : '',
    throws: typeof s.throws === 'string' ? s.throws : 'R',
    bats: typeof s.bats === 'string' ? s.bats : 'R',
    order: typeof s.order === 'number' ? s.order : s.order ?? null,
    isOhtaniRule: typeof s.isOhtaniRule === 'boolean' ? s.isOhtaniRule : undefined,
    substitutionType:
      typeof s.substitutionType === 'string' &&
      ['대수비', '대타', '대주자'].includes(s.substitutionType)
        ? (s.substitutionType as '대수비' | '대타' | '대주자')
        : undefined,
    isElite: typeof s.isElite === 'boolean' ? s.isElite : undefined,
  };
}

export function normalizeLineups(lineups: unknown): { home: PlayerSlot[]; away: PlayerSlot[] } | undefined {
  if (!lineups || typeof lineups !== 'object') return undefined;
  const l = lineups as { home?: unknown; away?: unknown };
  const home = Array.isArray(l.home) ? l.home.map(normalizePlayerSlot).filter((p): p is PlayerSlot => Boolean(p)) : [];
  const away = Array.isArray(l.away) ? l.away.map(normalizePlayerSlot).filter((p): p is PlayerSlot => Boolean(p)) : [];
  if (!home.length && !away.length) return undefined;
  return { home, away };
}

export function normalizeBenches(benches: unknown): { home: PlayerSlot[]; away: PlayerSlot[] } | undefined {
  if (!benches || typeof benches !== 'object') return undefined;
  const b = benches as { home?: unknown; away?: unknown };
  const home = Array.isArray(b.home) ? b.home.map(normalizePlayerSlot).filter((p): p is PlayerSlot => Boolean(p)) : [];
  const away = Array.isArray(b.away) ? b.away.map(normalizePlayerSlot).filter((p): p is PlayerSlot => Boolean(p)) : [];
  if (!home.length && !away.length) return undefined;
  return { home, away };
}

const asNumber = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
};

export const normalizeRunArray = (value: unknown): number[] =>
  Array.isArray(value)
    ? Array.from({ length: value.length }, (_v, i) => asNumber((value as unknown[])[i]) ?? 0)
    : [];

export function normalizeLineScore(lineScore: unknown): PostGameLineScore | undefined {
  if (!lineScore || typeof lineScore !== 'object') return undefined;
  const ls = lineScore as Partial<PostGameLineScore>;
  const innings = Array.isArray(ls.innings) ? ls.innings.map(asNumber).filter((n): n is number => n !== undefined) : [];
  const home = Array.isArray(ls.home) ? ls.home.map(asNumber).filter((n): n is number => n !== undefined) : [];
  const away = Array.isArray(ls.away) ? ls.away.map(asNumber).filter((n): n is number => n !== undefined) : [];
  if (!innings.length || !home.length || !away.length) return undefined;
  return { innings, home, away };
}

export function normalizeTotals(totals: unknown): PostGameTotals | undefined {
  if (!totals || typeof totals !== 'object') return undefined;
  const t = totals as PostGameTotals;
  const pick = (side: 'home' | 'away') => {
    const src = (t as Record<'home' | 'away', Partial<PostGameTotals['home']>>)[side] ?? {};
    const runs = asNumber(src.runs);
    const hits = asNumber(src.hits);
    const errors = asNumber(src.errors);
    if (runs === undefined || hits === undefined || errors === undefined) return undefined;
    const lob = asNumber(src.lob);
    return lob !== undefined ? { runs, hits, errors, lob } : { runs, hits, errors };
  };
  const home = pick('home');
  const away = pick('away');
  if (!home || !away) return undefined;
  return { home, away };
}

function normalizePitcherLine(entry: unknown): PostGamePitcherLine | null {
  if (!entry || typeof entry !== 'object') return null;
  const p = entry as Partial<PostGamePitcherLine>;
  if (typeof p.name !== 'string' || !p.name.trim()) return null;
  const fields: (keyof PostGamePitcherLine)[] = [
    'name',
    'result',
    'ip',
    'bf',
    'ab',
    'h',
    'hr',
    'bb',
    'hbp',
    'so',
    'r',
    'er',
    'pitches',
    'wp',
    'bk',
    'sh',
    'sf',
    'era',
  ];
  const out: Partial<PostGamePitcherLine> = { name: p.name.trim() };
  if (typeof p.slot === 'string' && p.slot.trim()) out.slot = p.slot.trim();
  fields.forEach((key) => {
    if (key === 'name' || key === 'result') return;
    const val = asNumber((p as Record<string, unknown>)[key]);
    if (val !== undefined) (out as Record<string, unknown>)[key] = val;
  });
  if (typeof p.result === 'string' && p.result.trim()) out.result = p.result.trim();
  return out as PostGamePitcherLine;
}

export function normalizePitchers(pitchers: unknown): PostGameRecord['pitchers'] | undefined {
  if (!pitchers || typeof pitchers !== 'object') return undefined;
  const src = pitchers as { home?: unknown; away?: unknown };
  const normalizeSide = (side: unknown) =>
    Array.isArray(side)
      ? side
          .map(normalizePitcherLine)
          .filter((p): p is PostGamePitcherLine => Boolean(p && p.name))
      : [];
  const home = normalizeSide(src.home);
  const away = normalizeSide(src.away);
  if (!home.length && !away.length) return undefined;
  return { home, away };
}

function normalizeBatterLine(entry: unknown): PostGameBatterLine | null {
  if (!entry || typeof entry !== 'object') return null;
  const b = entry as Partial<PostGameBatterLine>;
  if (typeof b.name !== 'string' || !b.name.trim()) return null;
  const out: Partial<PostGameBatterLine> = { name: b.name.trim() };
  if (typeof b.pos === 'string' && b.pos.trim()) out.pos = b.pos.trim();
  if (typeof b.slot === 'string' && b.slot.trim()) out.slot = b.slot.trim();
  if (typeof b.order === 'number' && Number.isFinite(b.order)) out.order = b.order;
  if (Array.isArray(b.innings)) {
    out.innings = b.innings.map((v) => (typeof v === 'string' ? v : v == null ? null : String(v)));
  }
  [
    'pa',
    'ab',
    'h',
    'singles',
    'doubles',
    'triples',
    'hr',
    'bb',
    'hbp',
    'so',
    'sac',
    'fc',
    'rbi',
    'r',
    'sb',
    'avg',
    'seasonAvg',
  ].forEach((k) => {
    const key = k as keyof PostGameBatterLine;
    const val = asNumber((b as Record<string, unknown>)[key]);
    if (val !== undefined) (out as Record<string, unknown>)[key] = val;
  });
  return out as PostGameBatterLine;
}

export function normalizeBatters(batters: unknown): PostGameRecord['batters'] | undefined {
  if (!batters || typeof batters !== 'object') return undefined;
  const src = batters as { home?: unknown; away?: unknown };
  const normalizeSide = (side: unknown) =>
    Array.isArray(side)
      ? side
          .map(normalizeBatterLine)
          .filter((b): b is PostGameBatterLine => Boolean(b && b.name))
      : [];
  const home = normalizeSide(src.home);
  const away = normalizeSide(src.away);
  if (!home.length && !away.length) return undefined;
  return { home, away };
}

export function normalizePostGame(pg: unknown): PostGameRecord | undefined {
  if (!pg || typeof pg !== 'object') return undefined;
  const record = pg as Partial<PostGameRecord>;
  const lineScore = normalizeLineScore(record.lineScore);
  const totals = normalizeTotals(record.totals);
  if (!lineScore || !totals) return undefined;
  const teamBatterSummary = record.teamBatterSummary;
  const batters = normalizeBatters(record.batters);
  const pitchers = normalizePitchers(record.pitchers);
  const note = typeof record.note === 'string' ? record.note : undefined;
  return {
    lineScore,
    totals,
    teamBatterSummary,
    batters,
    pitchers,
    note,
  };
}

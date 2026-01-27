import { createContext, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import { collection, doc, onSnapshot, orderBy, query, setDoc, writeBatch, deleteDoc } from 'firebase/firestore';
import { auth, firestore } from '../firebase/client';
import { MATCHES, TEAMS } from '../lib/mockData';

type Half = 'top' | 'bottom';

type Bases = (string | null)[];

type Side = 'home' | 'away';
interface PlayerSlot {
  name: string;
  pos: string;
  number: string;
  throws: string;
  bats: string;
  order?: number | null;
}

export type PostGameLineScore = { innings: number[]; home: number[]; away: number[] };

export type PostGameTotals = {
  home: { runs: number; hits: number; errors: number; lob?: number };
  away: { runs: number; hits: number; errors: number; lob?: number };
};

export type PostGameBatterLine = {
  name: string;
  pos?: string;
  order?: number | null;
  slot?: string; // e.g., 대타/대주 표기
  innings?: (string | null | undefined)[];
  ab?: number;
  h?: number;
  rbi?: number;
  r?: number;
  sb?: number;
  avg?: number;
  seasonAvg?: number;
};

export type PostGamePitcherLine = {
  name: string;
  result?: string; // 승/패/세/홀드 등
  ip?: number;
  bf?: number;
  ab?: number;
  h?: number;
  hr?: number;
  bb?: number;
  hbp?: number;
  so?: number;
  r?: number;
  er?: number;
  pitches?: number;
  wp?: number;
  bk?: number;
  sh?: number; // 희생타 허용
  sf?: number; // 희생플라이 허용
  era?: number;
};

export type PostGameRecord = {
  lineScore: PostGameLineScore;
  totals: PostGameTotals;
  teamBatterSummary?: { home?: { ab?: number; h?: number; r?: number; rbi?: number; sb?: number }; away?: { ab?: number; h?: number; r?: number; rbi?: number; sb?: number } };
  batters?: { home?: PostGameBatterLine[]; away?: PostGameBatterLine[] };
  pitchers?: { home?: PostGamePitcherLine[]; away?: PostGamePitcherLine[] };
  note?: string;
};

export type MatchStatus = 'scheduled' | 'inProgress' | 'completed' | 'canceled';

export interface MatchSchedule {
  id: string;
  homeTeamId?: string;
  awayTeamId?: string;
  homeTeamName: string;
  awayTeamName: string;
  startTime: string;
  venue: string;
  status: MatchStatus;
  homeScore?: number | null;
  awayScore?: number | null;
  lineups?: { home: PlayerSlot[]; away: PlayerSlot[] };
  benches?: { home: PlayerSlot[]; away: PlayerSlot[] };
  notes?: string;
  postGame?: PostGameRecord;
}

export type RunnerAdvanceOutcome = 'hold' | 'advance' | 'out' | 'score' | 1 | 2 | 3 | 4;
export type RunnerAdvanceSelections = Partial<Record<0 | 1 | 2, RunnerAdvanceOutcome>>;

export type BattedBallDetails = {
  type: string;
  zone: string;
};

export type ErrorAdvanceResults = {
  batter: 'out' | 'hold' | 1 | 2 | 3 | 4;
  runners: RunnerAdvanceSelections;
};

export type ErrorDetails = {
  fielderPos: string;
  errorType: string;
  context: string;
  advanceResults: ErrorAdvanceResults;
};

export interface PlayLog {
  inning: number;
  half: Half;
  order: number;
  batter: string;
  pitch: number;
  result: string;
}

export interface PlayEvent {
  inning: number;
  half: Half;
  order: number;
  batter: string;
  pitch: number;
  type: string;
  runners: string[];
  battedBall?: BattedBallDetails | null;
  error?: ErrorDetails | string | null;
  notes?: string;
}

interface DemoSnapshot {
  inning: number;
  half: Half;
  balls: number;
  strikes: number;
  outs: number;
  pitchCount: number;
  bases: Bases; // [1B, 2B, 3B] occupant name
  score: { home: number; away: number };
  lastPlay: string;
  feed: PlayLog[];
  events: PlayEvent[];
  homeTeamId: string;
  awayTeamId: string;
  batterIndex: { home: number; away: number };
  lineups: { home: PlayerSlot[]; away: PlayerSlot[] };
  benches: { home: PlayerSlot[]; away: PlayerSlot[] };
  removed: { home: PlayerSlot[]; away: PlayerSlot[] };
  teamNames: { home: string; away: string };
  gameStarted: boolean;
  gameOver: boolean;
  endedAt: string | null;
  liveVideoUrl: string;
  matches: MatchSchedule[];
  activeMatchId: string | null;
}

interface DemoState extends DemoSnapshot {
  history: DemoSnapshot[];
}

type SharedGameState = Omit<DemoSnapshot, 'matches'> & { updatedAt?: number };

type Action =
  | { type: 'ball' }
  | { type: 'strike' }
  | { type: 'foul' }
  | { type: 'strikeOut' }
  | { type: 'droppedThirdStrike' }
  | { type: 'out'; battedBall?: BattedBallDetails | null }
  | { type: 'outWithMessage'; note: string; battedBall?: BattedBallDetails | null }
  | { type: 'doublePlay'; battedBall?: BattedBallDetails | null }
  | { type: 'triplePlay'; battedBall?: BattedBallDetails | null }
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
  | { type: 'setPlay'; message: string }
  | { type: 'runnerStealSuccess'; base: 0 | 1 | 2 }
  | { type: 'runnerCaught'; base: 0 | 1 | 2 }
  | { type: 'runnerPickoff'; base: 0 | 1 | 2 }
  | { type: 'runnerOut'; base: 0 | 1 | 2 }
  | { type: 'manualLog'; message: string }
  | { type: 'setTeamName'; side: Side; name: string }
  | { type: 'setLineup'; side: Side; index: number; updates: Partial<PlayerSlot> }
  | { type: 'addBench'; side: Side; player: PlayerSlot }
  | { type: 'removeBench'; side: Side; benchIndex: number }
  | { type: 'substitute'; side: Side; benchIndex: number; lineupIndex: number }
  | { type: 'setLiveVideoUrl'; url: string }
  | { type: 'startGame' }
  | { type: 'endGame'; endedAt: string }
  | { type: 'resetGame' }
  | { type: 'undo' }
  | { type: 'hydrate'; state: DemoState }
  | { type: 'addMatch'; match: MatchSchedule }
  | { type: 'updateMatch'; matchId: string; updates: Partial<MatchSchedule> }
  | { type: 'deleteMatch'; matchId: string }
  | { type: 'selectMatch'; matchId: string | null }
  | { type: 'setMatches'; matches: MatchSchedule[] }
  | { type: 'syncActiveMatch'; matchId: string | null }
  | {
      type: 'saveMatchLineups';
      matchId: string;
      lineups: { home: PlayerSlot[]; away: PlayerSlot[] };
      benches: { home: PlayerSlot[]; away: PlayerSlot[] };
    };

const STORAGE_KEY = 'aubl-demo-store';

const initialMatch = MATCHES[0];
const demoLineups: { home: PlayerSlot[]; away: PlayerSlot[] } = {
  home: [
    { name: '김지찬', pos: '2B', number: '1', throws: 'R', bats: 'L' },
    { name: '구자욱', pos: 'LF', number: '5', throws: 'R', bats: 'L' },
    { name: '피렐라', pos: 'DH', number: '39', throws: 'R', bats: 'L' },
    { name: '오재일', pos: '1B', number: '16', throws: 'R', bats: 'L' },
    { name: '강민호', pos: 'C', number: '47', throws: 'R', bats: 'R' },
    { name: '김헌곤', pos: 'RF', number: '7', throws: 'R', bats: 'L' },
    { name: '류지혁', pos: '3B', number: '13', throws: 'R', bats: 'L' },
    { name: '김영웅', pos: 'SS', number: '24', throws: 'R', bats: 'R' },
    { name: '김성윤', pos: 'CF', number: '65', throws: 'R', bats: 'L' },
    { name: '원태인', pos: 'P', number: '18', throws: 'R', bats: 'R' },
  ],
  away: [
    { name: '정수빈', pos: 'CF', number: '31', throws: 'R', bats: 'L' },
    { name: '허경민', pos: '3B', number: '13', throws: 'R', bats: 'R' },
    { name: '양석환', pos: '1B', number: '53', throws: 'R', bats: 'R' },
    { name: '양의지', pos: 'C', number: '25', throws: 'R', bats: 'R' },
    { name: '김재환', pos: 'DH', number: '32', throws: 'R', bats: 'L' },
    { name: '강승호', pos: '2B', number: '52', throws: 'R', bats: 'R' },
    { name: '조수행', pos: 'LF', number: '25', throws: 'R', bats: 'L' },
    { name: '박준영', pos: 'SS', number: '4', throws: 'R', bats: 'R' },
    { name: '김인태', pos: 'RF', number: '17', throws: 'R', bats: 'L' },
    { name: '곽빈', pos: 'P', number: '47', throws: 'R', bats: 'R' },
  ],
};

const cloneLineups = (lineups: { home: PlayerSlot[]; away: PlayerSlot[] }) => ({
  home: lineups.home.map((player) => ({ ...player })),
  away: lineups.away.map((player) => ({ ...player })),
});

const cloneBenches = (benches: { home: PlayerSlot[]; away: PlayerSlot[] }) => ({
  home: benches.home.map((player) => ({ ...player })),
  away: benches.away.map((player) => ({ ...player })),
});

const emptyPlayerSlot: PlayerSlot = { name: '', pos: '', number: '', throws: 'R', bats: 'R', order: null };

const normalizePlayerSlotForGame = (player: PlayerSlot): PlayerSlot => ({
  name: typeof player.name === 'string' ? player.name : '',
  pos: typeof player.pos === 'string' ? player.pos : '',
  number: typeof player.number === 'string' ? player.number : '',
  throws: player.throws === 'L' ? 'L' : 'R',
  bats: player.bats === 'L' ? 'L' : 'R',
  order: typeof player.order === 'number' ? player.order : null,
});

const ensureLineupFilled = (lineup: PlayerSlot[]) => {
  const normalized = lineup.map(normalizePlayerSlotForGame);
  let hasPitcher = normalized.some((slot) => slot.pos.toUpperCase() === 'P');
  let battingCount = normalized.reduce((count, slot) => (slot.pos.toUpperCase() === 'P' ? count : count + 1), 0);
  while (battingCount < 9) {
    normalized.push({ ...emptyPlayerSlot });
    battingCount += 1;
  }
  if (!hasPitcher) {
    normalized.push({ ...emptyPlayerSlot, pos: 'P' });
    hasPitcher = true;
  }
  return normalized;
};

const ensureCompleteLineups = (lineups: { home: PlayerSlot[]; away: PlayerSlot[] }) => ({
  home: ensureLineupFilled(lineups.home),
  away: ensureLineupFilled(lineups.away),
});

const teamNameById = (teamId?: string) => TEAMS.find((team) => team.id === teamId)?.name ?? '미정';

const initialScheduledMatches: MatchSchedule[] = [
  {
    id: 'schedule-1',
    homeTeamId: 'team-1',
    awayTeamId: 'team-2',
    homeTeamName: teamNameById('team-1'),
    awayTeamName: teamNameById('team-2'),
    startTime: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
    venue: 'AUBL 메인구장',
    status: 'scheduled',
    lineups: cloneLineups(demoLineups),
    notes: '라인업 사전 등록 완료',
  },
  {
    id: 'schedule-2',
    homeTeamId: 'team-3',
    awayTeamId: 'team-4',
    homeTeamName: teamNameById('team-3'),
    awayTeamName: teamNameById('team-4'),
    startTime: new Date(Date.now() + 1000 * 60 * 60 * 48).toISOString(),
    venue: 'AUBL 보조구장',
    status: 'scheduled',
  },
  {
    id: 'schedule-3',
    homeTeamId: 'team-5',
    awayTeamId: 'team-1',
    homeTeamName: teamNameById('team-5'),
    awayTeamName: teamNameById('team-1'),
    startTime: new Date(Date.now() + 1000 * 60 * 60 * 72).toISOString(),
    venue: 'Epsilon Field',
    status: 'scheduled',
    notes: '버금/EUTTEUM 간 인기 매치업',
  },
  {
    id: 'schedule-4',
    homeTeamId: 'team-4',
    awayTeamId: 'team-3',
    homeTeamName: teamNameById('team-4'),
    awayTeamName: teamNameById('team-3'),
    startTime: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    venue: 'Delta Dome',
    status: 'inProgress',
  },
  {
    id: 'schedule-5',
    homeTeamId: 'team-2',
    awayTeamId: 'team-5',
    homeTeamName: teamNameById('team-2'),
    awayTeamName: teamNameById('team-5'),
    startTime: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
    venue: 'Beta Stadium',
    status: 'completed',
    homeScore: 4,
    awayScore: 6,
  },
  ...MATCHES.slice(0, 1).map((match, index) => ({
    id: `result-${index + 1}`,
    homeTeamId: match.homeTeamId,
    awayTeamId: match.awayTeamId,
    homeTeamName: teamNameById(match.homeTeamId),
    awayTeamName: teamNameById(match.awayTeamId),
    startTime: new Date(Date.now() - 1000 * 60 * 60 * 24 * (index + 1)).toISOString(),
    venue: 'AUBL 기록실',
    status: 'completed' as const,
    homeScore: match.homeScore,
    awayScore: match.awayScore,
  })),
];

const initialState: DemoState = {
  inning: 1,
  half: 'top',
  balls: 0,
  strikes: 0,
  outs: 0,
  pitchCount: 0,
  bases: [null, null, null],
  score: { home: 0, away: 0 },
  lastPlay: '경기 대기 중',
  feed: [],
  events: [],
  homeTeamId: initialMatch?.homeTeamId ?? 'home',
  awayTeamId: initialMatch?.awayTeamId ?? 'away',
  batterIndex: { home: 0, away: 0 },
  lineups: demoLineups,
  benches: {
    home: [
      { name: '김태군', pos: 'C', number: '12', throws: 'R', bats: 'R' },
      { name: '이성규', pos: 'OF', number: '67', throws: 'R', bats: 'R' },
    ],
    away: [
      { name: '안권수', pos: 'OF', number: '27', throws: 'R', bats: 'L' },
      { name: '이유찬', pos: 'SS', number: '6', throws: 'R', bats: 'R' },
    ],
  },
  removed: { home: [], away: [] },
  teamNames: { home: '홈팀', away: '원정팀' },
  gameStarted: false,
  gameOver: false,
  endedAt: null,
  liveVideoUrl: 'https://www.youtube.com/embed/live_stream?channel=YOUR_CHANNEL_ID',
  history: [],
  matches: initialScheduledMatches,
  activeMatchId: null,
};

function normalizeFeed(feed: unknown, fallback: { inning: number; half: Half }): PlayLog[] {
  if (!Array.isArray(feed)) return [];
  return feed.map((entry) => {
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
}

function normalizeEvents(events: unknown, fallback: { inning: number; half: Half }): PlayEvent[] {
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

function normalizePlayerSlot(slot: unknown): PlayerSlot | null {
  if (!slot || typeof slot !== 'object') return null;
  const s = slot as Partial<PlayerSlot>;
  return {
    name: typeof s.name === 'string' ? s.name : '미정',
    pos: typeof s.pos === 'string' ? s.pos : 'UT',
    number: typeof s.number === 'string' ? s.number : '',
    throws: typeof s.throws === 'string' ? s.throws : 'R',
    bats: typeof s.bats === 'string' ? s.bats : 'R',
    order: typeof s.order === 'number' ? s.order : s.order ?? null,
  };
}

function normalizeLineups(lineups: unknown): { home: PlayerSlot[]; away: PlayerSlot[] } | undefined {
  if (!lineups || typeof lineups !== 'object') return undefined;
  const l = lineups as { home?: unknown; away?: unknown };
  const home = Array.isArray(l.home) ? l.home.map(normalizePlayerSlot).filter((p): p is PlayerSlot => Boolean(p)) : [];
  const away = Array.isArray(l.away) ? l.away.map(normalizePlayerSlot).filter((p): p is PlayerSlot => Boolean(p)) : [];
  if (!home.length && !away.length) return undefined;
  return { home, away };
}

function normalizeBenches(benches: unknown): { home: PlayerSlot[]; away: PlayerSlot[] } | undefined {
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

function normalizeLineScore(lineScore: unknown): PostGameLineScore | undefined {
  if (!lineScore || typeof lineScore !== 'object') return undefined;
  const ls = lineScore as Partial<PostGameLineScore>;
  const innings = Array.isArray(ls.innings) ? ls.innings.map(asNumber).filter((n): n is number => n !== undefined) : [];
  const home = Array.isArray(ls.home) ? ls.home.map(asNumber).filter((n): n is number => n !== undefined) : [];
  const away = Array.isArray(ls.away) ? ls.away.map(asNumber).filter((n): n is number => n !== undefined) : [];
  if (!innings.length || !home.length || !away.length) return undefined;
  return { innings, home, away };
}

function normalizeTotals(totals: unknown): PostGameTotals | undefined {
  if (!totals || typeof totals !== 'object') return undefined;
  const t = totals as PostGameTotals;
  const pick = (side: 'home' | 'away') => {
    const src = (t as any)[side] ?? {};
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
  fields.forEach((key) => {
    if (key === 'name' || key === 'result') return;
    const val = asNumber((p as any)[key]);
    if (val !== undefined) (out as any)[key] = val;
  });
  if (typeof p.result === 'string' && p.result.trim()) out.result = p.result.trim();
  return out as PostGamePitcherLine;
}

function normalizePitchers(pitchers: unknown): PostGameRecord['pitchers'] | undefined {
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
  ['ab', 'h', 'rbi', 'r', 'sb', 'avg', 'seasonAvg'].forEach((k) => {
    const key = k as keyof PostGameBatterLine;
    const val = asNumber((b as any)[key]);
    if (val !== undefined) (out as any)[key] = val;
  });
  return out as PostGameBatterLine;
}

function normalizeBatters(batters: unknown): PostGameRecord['batters'] | undefined {
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

function normalizePostGame(pg: unknown): PostGameRecord | undefined {
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

function normalizeMatches(matches: unknown): MatchSchedule[] {
  if (!Array.isArray(matches)) return [];
  return matches.map((entry) => {
    if (!entry || typeof entry !== 'object') {
      return {
        id: `match-${Math.random().toString(36).slice(2, 8)}`,
        homeTeamName: '미정',
        awayTeamName: '미정',
        startTime: new Date().toISOString(),
        venue: '미정',
        status: 'scheduled',
      } satisfies MatchSchedule;
    }
    const match = entry as Partial<MatchSchedule>;
    return {
      id: typeof match.id === 'string' ? match.id : `match-${Math.random().toString(36).slice(2, 8)}`,
      homeTeamId: typeof match.homeTeamId === 'string' ? match.homeTeamId : undefined,
      awayTeamId: typeof match.awayTeamId === 'string' ? match.awayTeamId : undefined,
      homeTeamName: typeof match.homeTeamName === 'string' ? match.homeTeamName : '미정',
      awayTeamName: typeof match.awayTeamName === 'string' ? match.awayTeamName : '미정',
      startTime: typeof match.startTime === 'string' ? match.startTime : new Date().toISOString(),
      venue: typeof match.venue === 'string' ? match.venue : '미정',
      status: match.status === 'completed' || match.status === 'inProgress' ? match.status : 'scheduled',
      homeScore: typeof match.homeScore === 'number' ? match.homeScore : null,
      awayScore: typeof match.awayScore === 'number' ? match.awayScore : null,
      lineups: normalizeLineups(match.lineups),
      benches: normalizeBenches(match.benches),
      notes: typeof match.notes === 'string' ? match.notes : undefined,
      postGame: normalizePostGame(match.postGame),
    };
  });
}

function normalizeState(base: DemoState, incoming: DemoState): DemoState {
  const merged = { ...base, ...incoming } as DemoState;
  const feed = normalizeFeed(merged.feed, { inning: merged.inning, half: merged.half });
  const events = normalizeEvents(merged.events, { inning: merged.inning, half: merged.half });
  const matches = normalizeMatches(merged.matches ?? base.matches);
  const safeLineups = ensureCompleteLineups(merged.lineups ?? base.lineups);
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
  return {
    ...merged,
    pitchCount: merged.pitchCount ?? 0,
    feed,
    events,
    matches,
    history,
    lineups: safeLineups,
    gameOver: Boolean(merged.gameOver),
    endedAt: typeof merged.endedAt === 'string' ? merged.endedAt : null,
    removed: merged.removed ?? base.removed,
    gameStarted,
    liveVideoUrl: typeof merged.liveVideoUrl === 'string' ? merged.liveVideoUrl : base.liveVideoUrl,
    activeMatchId: typeof merged.activeMatchId === 'string' ? merged.activeMatchId : merged.activeMatchId === null ? null : base.activeMatchId,
  };
}

export interface GameRecord {
  meta: {
    homeTeamId: string;
    awayTeamId: string;
    homeTeamName: string;
    awayTeamName: string;
    inning: number;
    half: Half;
    gameStarted: boolean;
    gameOver: boolean;
    endedAt: string | null;
  };
  score: DemoState['score'];
  counts: { balls: number; strikes: number; outs: number; pitchCount: number };
  bases: Bases;
  batterIndex: DemoState['batterIndex'];
  lineups: DemoState['lineups'];
  benches: DemoState['benches'];
  removed: DemoState['removed'];
  feed: PlayLog[];
  events: PlayEvent[];
  lastPlay: string;
}

export function buildGameRecord(state: DemoState): GameRecord {
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
    },
    score: { ...state.score },
    counts: { balls: state.balls, strikes: state.strikes, outs: state.outs, pitchCount: state.pitchCount },
    bases: [...state.bases],
    batterIndex: { ...state.batterIndex },
    lineups: {
      home: state.lineups.home.map((player) => ({ ...player })),
      away: state.lineups.away.map((player) => ({ ...player })),
    },
    benches: {
      home: state.benches.home.map((player) => ({ ...player })),
      away: state.benches.away.map((player) => ({ ...player })),
    },
    removed: {
      home: state.removed.home.map((player) => ({ ...player })),
      away: state.removed.away.map((player) => ({ ...player })),
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
  };
}

function snapshotState(state: DemoState): DemoSnapshot {
  const { history, ...snapshot } = state;
  return snapshot;
}

function shouldTrackHistory(actionType: Action['type']) {
  return ![
    'setTeamName',
    'setLineup',
    'addBench',
    'removeBench',
    'substitute',
    'addMatch',
    'updateMatch',
    'saveMatchLineups',
    'selectMatch',
    'setMatches',
    'syncActiveMatch',
    'hydrate',
    'resetGame',
    'startGame',
    'setLiveVideoUrl',
  ].includes(actionType);
}

function reducer(state: DemoState, action: Action): DemoState {
  if (action.type === 'hydrate') {
    return normalizeState(initialState, action.state);
  }
  if (action.type === 'undo') {
    if (!state.history.length) return state;
    const previous = state.history[state.history.length - 1];
    return { ...previous, history: state.history.slice(0, -1) };
  }
  const setupActions: Action['type'][] = [
    'setTeamName',
    'setLineup',
    'addBench',
    'removeBench',
    'substitute',
    'manualLog',
    'resetGame',
    'startGame',
    'setLiveVideoUrl',
    'addMatch',
    'updateMatch',
    'saveMatchLineups',
    'selectMatch',
    'setMatches',
    'syncActiveMatch',
  ];
  if (!state.gameStarted && !setupActions.includes(action.type)) {
    return state;
  }

  const snapshot = snapshotState(state);
  let nextState = state;

  switch (action.type) {
    case 'ball':
      if (state.balls >= 3) {
        nextState = applyWalk(state, '볼넷', state.pitchCount + 1);
      } else {
        const pitchCount = state.pitchCount + 1;
        nextState = {
          ...state,
          balls: state.balls + 1,
          pitchCount,
          lastPlay: '볼',
          feed: pushPlayFeed(state, createLogEntry(state, '볼', pitchCount)),
        };
      }
      break;
    case 'strike':
      if (state.strikes >= 2) {
        nextState = applyOut(state, '삼진', { pitchNumber: state.pitchCount + 1 });
      } else {
        const pitchCount = state.pitchCount + 1;
        nextState = {
          ...state,
          strikes: state.strikes + 1,
          pitchCount,
          lastPlay: '스트라이크',
          feed: pushPlayFeed(state, createLogEntry(state, '스트라이크', pitchCount)),
        };
      }
      break;
    case 'foul':
      if (state.strikes >= 2) {
        const pitchCount = state.pitchCount + 1;
        nextState = {
          ...state,
          pitchCount,
          lastPlay: '파울',
          feed: pushPlayFeed(state, createLogEntry(state, '파울', pitchCount)),
        };
      } else {
        const pitchCount = state.pitchCount + 1;
        nextState = {
          ...state,
          strikes: state.strikes + 1,
          pitchCount,
          lastPlay: '파울',
          feed: pushPlayFeed(state, createLogEntry(state, '파울', pitchCount)),
        };
      }
      break;
    case 'strikeOut':
      nextState = applyOut(state, '삼진', { pitchNumber: state.pitchCount + 1 });
      break;
    case 'droppedThirdStrike':
      nextState = applyDroppedThirdStrike(state);
      break;
    case 'out':
      nextState = applyOut(state, '아웃', { pitchNumber: state.pitchCount + 1, battedBall: action.battedBall });
      break;
    case 'outWithMessage':
      nextState = applyOut(state, action.note, { pitchNumber: state.pitchCount + 1, battedBall: action.battedBall });
      break;
    case 'doublePlay':
      nextState = applyDoublePlay(state, 2, '병살타', action.battedBall);
      break;
    case 'triplePlay':
      nextState = applyDoublePlay(state, 3, '삼중살', action.battedBall);
      break;
    case 'hit':
      nextState = applyHitWithAdvances(state, action.bases, state.pitchCount + 1, action.advances, action.battedBall);
      break;
    case 'fielderChoice':
      nextState = applyFielderChoice(state, state.pitchCount + 1, action.advances, action.battedBall, action.context);
      break;
    case 'walk':
      nextState = applyWalk(state, '볼넷', state.pitchCount + 1);
      break;
    case 'intentionalWalk':
      nextState = applyWalk(state, '고의4구', state.pitchCount + 1);
      break;
    case 'catcherInterference':
      nextState = applyWalk(state, '타격방해', state.pitchCount + 1);
      break;
    case 'hbp':
      nextState = applyWalk(state, '몸에 맞는 공', state.pitchCount + 1);
      break;
    case 'sac':
      nextState = applySacrifice(state, state.pitchCount + 1, action.battedBall, action.sacType ?? 'fly');
      break;
    case 'error':
      nextState = applyError(state, action.details);
      break;
    case 'stealSuccess':
      nextState = applySteal(state, true);
      break;
    case 'stealFail':
      nextState = applySteal(state, false);
      break;
    case 'runnerRundownOut':
      nextState = applyRunnerOut(state, action.base, '런다운 아웃');
      break;
    case 'runnerInterference':
      nextState = applyRunnerOut(state, action.base, '주루 방해');
      break;
    case 'resetCount':
      nextState = {
        ...state,
        balls: 0,
        strikes: 0,
        pitchCount: 0,
        lastPlay: '카운트 리셋',
        feed: pushPlayFeed(state, createLogEntry(state, '카운트 리셋', 0)),
      };
      break;
    case 'clearBases':
      nextState = {
        ...state,
        bases: [null, null, null],
        lastPlay: '주자 모두 귀환',
        feed: pushFeed(state.feed, createLogEntry(state, '주자 모두 귀환', 0)),
      };
      break;
    case 'startGame': {
      if (state.gameStarted || state.gameOver) return state;
      const startLabel = '경기 시작';
      const broadcast = `*기록원* - ${startLabel}`;
      const feed = pushFeed(state.feed, createLogEntryForBaserunning(state, broadcast, 0));
      const matches = state.activeMatchId
        ? updateMatchSchedule(state.matches, state.activeMatchId, { status: 'inProgress' })
        : state.matches;
      nextState = {
        ...state,
        inning: 1,
        half: 'top',
        balls: 0,
        strikes: 0,
        outs: 0,
        pitchCount: 0,
        bases: [null, null, null],
        score: { home: 0, away: 0 },
        batterIndex: { home: 0, away: 0 },
        lastPlay: startLabel,
        gameStarted: true,
        gameOver: false,
        endedAt: null,
        liveVideoUrl: state.liveVideoUrl,
        feed,
        history: [],
        removed: { ...state.removed },
        matches,
      };
      break;
    }
    case 'manualLog': {
      const text = action.message.trim();
      if (!text) return state;
      const payload = `*기록원* - ${text}`;
      nextState = {
        ...state,
        lastPlay: payload,
        feed: pushFeed(state.feed, createLogEntryForBaserunning(state, payload, 0)),
      };
      break;
    }
    case 'nextHalf':
      nextState = changeHalf(state, '이닝 전환');
      break;
    case 'setPlay':
      nextState = {
        ...state,
        lastPlay: action.message,
        feed: pushPlayFeed(state, createLogEntry(state, action.message, 0)),
        events: pushEvent(
          state.events,
          createPlayEventForBaserunning(
            state,
            { type: 'setPlay', runners: getRunnerNames(state.bases), notes: action.message },
            0,
          ),
        ),
      };
      break;
    case 'runnerStealSuccess':
      nextState = applyRunnerAdvance(state, action.base, 1, '도루 성공');
      break;
    case 'runnerCaught':
      nextState = applyRunnerOut(state, action.base, '도루자 아웃');
      break;
    case 'runnerPickoff':
      nextState = applyRunnerOut(state, action.base, '견제사');
      break;
    case 'runnerOut':
      nextState = applyRunnerOut(state, action.base, '주루사');
      break;
    case 'setTeamName':
      nextState = { ...state, teamNames: { ...state.teamNames, [action.side]: action.name } };
      break;
    case 'setLineup':
      nextState = updateLineup(state, action.side, action.index, action.updates);
      break;
    case 'addBench':
      nextState = {
        ...state,
        benches: {
          ...state.benches,
          [action.side]: [...state.benches[action.side], action.player],
        },
      };
      break;
    case 'removeBench': {
      const nextBench = state.benches[action.side].filter((_, idx) => idx !== action.benchIndex);
      if (nextBench.length === state.benches[action.side].length) {
        return state;
      }
      nextState = {
        ...state,
        benches: { ...state.benches, [action.side]: nextBench },
      };
      break;
    }
    case 'substitute':
      nextState = substitutePlayer(state, action.side, action.benchIndex, action.lineupIndex);
      break;
    case 'setLiveVideoUrl': {
      const trimmed = action.url.trim();
      nextState = { ...state, liveVideoUrl: trimmed };
      break;
    }
    case 'endGame':
      nextState = applyEndGame(state, action.endedAt);
      if (state.activeMatchId) {
        nextState = {
          ...nextState,
          matches: updateMatchSchedule(nextState.matches, state.activeMatchId, {
            status: 'completed',
            homeScore: nextState.score.home,
            awayScore: nextState.score.away,
          }),
        };
      }
      break;
    case 'resetGame':
      nextState = createNewGame(state);
      break;
    case 'addMatch':
      nextState = {
        ...state,
        matches: [...state.matches, action.match],
      };
      break;
    case 'updateMatch':
      nextState = {
        ...state,
        matches: updateMatchSchedule(state.matches, action.matchId, action.updates),
      };
      break;
    case 'deleteMatch': {
      const filtered = state.matches.filter((m) => m.id !== action.matchId);
      nextState = {
        ...state,
        matches: filtered,
        activeMatchId: state.activeMatchId === action.matchId ? null : state.activeMatchId,
      };
      break;
    }
    case 'saveMatchLineups':
      nextState = {
        ...state,
        matches: updateMatchSchedule(state.matches, action.matchId, {
          lineups: cloneLineups(action.lineups),
          benches: cloneBenches(action.benches),
        }),
      };
      break;
    case 'selectMatch': {
      if (!action.matchId) {
        nextState = { ...state, activeMatchId: null };
        break;
      }
      const selected = state.matches.find((match) => match.id === action.matchId);
      if (!selected) return state;
      nextState = resetGameForMatch(state, selected);
      break;
    }
    case 'setMatches':
      nextState = {
        ...state,
        matches: action.matches,
      };
      break;
    case 'syncActiveMatch':
      if (action.matchId === state.activeMatchId) return state;
      nextState = { ...state, activeMatchId: action.matchId };
      break;
    default:
      nextState = state;
  }

  if (nextState === state) return state;
  if (!shouldTrackHistory(action.type)) return nextState;
  return { ...nextState, history: [...state.history, snapshot] };
}

function pushFeed(feed: PlayLog[], entry: PlayLog) {
  return [entry, ...feed];
}

function pushEvent(events: PlayEvent[], entry: PlayEvent) {
  return [entry, ...events];
}

function ensureHalfPitcherLogged(state: DemoState, feed: PlayLog[]) {
  const exists = feed.some(
    (entry) => entry.inning === state.inning && entry.half === state.half && entry.result.endsWith('투수'),
  );
  if (exists) return feed;
  const defenseSide: Side = state.half === 'top' ? 'home' : 'away';
  const pitcher = state.lineups[defenseSide].find((slot) => slot.pos.toUpperCase() === 'P');
  if (!pitcher) return feed;
  const pitcherEntry: PlayLog = {
    inning: state.inning,
    half: state.half,
    order: 0,
    batter: '',
    pitch: 0,
    result: `${pitcher.name}${pitcher.number ? `(${pitcher.number})` : ''} 투수`,
  };
  return pushFeed(feed, pitcherEntry);
}

function pushPlayFeed(state: DemoState, entry: PlayLog, baseFeed?: PlayLog[]) {
  const withPitcher = ensureHalfPitcherLogged(state, baseFeed ?? state.feed);
  return pushFeed(withPitcher, entry);
}

function baseLabel(idx: number) {
  return idx >= 3 ? '홈' : `${idx + 1}루`;
}

function formatRunnerMove({
  runner,
  from,
  to,
  outcome,
  message,
  outsCount,
}: {
  runner: string;
  from: number;
  to: number;
  outcome: RunnerAdvanceOutcome;
  message?: string;
  outsCount?: number;
}) {
  const runnerLabel = `${baseLabel(from)} 주자`;
  const fromLabel = baseLabel(from);
  const toLabel = baseLabel(to);
  const moveLabel =
    outcome === 'score'
      ? `${fromLabel}→홈 득점`
      : outcome === 'out'
        ? `${toLabel} 아웃`
        : outcome === 'hold'
          ? `${fromLabel} 정지`
          : `${fromLabel}→${toLabel} 진루`;
  const runnerMove = `${runnerLabel} ${moveLabel}`;
  const messagePrefix = message ? `${message} · ` : '';
  const feedText = `${messagePrefix}${runnerMove} · ${runner}`;
  const outText = outsCount && outcome === 'out' ? ` · ${outsCount}아웃` : '';
  const lastPlay = `${messagePrefix}${runnerMove} · ${runner}${outText}`;
  return { feedText, lastPlay, runnerSummary: `${runnerMove} · ${runner}` };
}

function currentBatterInfo(state: DemoState) {
  const side = hittingSide(state);
  const lineup = state.lineups[side];
  const battingLineup = lineup.filter((slot) => slot.pos.toUpperCase() !== 'P');
  const activeLineup = battingLineup.length ? battingLineup : lineup;
  const safeLength = activeLineup.length || 1;
  const idx = state.batterIndex[side] % safeLength;
  return {
    order: idx + 1,
    batter: activeLineup[idx]?.name ?? '타자',
  };
}

function getRunnerNames(bases: Bases) {
  return bases.filter((runner): runner is string => typeof runner === 'string');
}

function createLogEntry(state: DemoState, result: string, pitch: number): PlayLog {
  const info = currentBatterInfo(state);
  return {
    inning: state.inning,
    half: state.half,
    order: info.order,
    batter: info.batter,
    pitch,
    result,
  };
}

function createLogEntryWithBatter(state: DemoState, batter: string, order: number | null, result: string, pitch: number): PlayLog {
  return {
    inning: state.inning,
    half: state.half,
    order: order ?? 0,
    batter,
    pitch,
    result,
  };
}

function createLogEntryForBaserunning(state: DemoState, result: string, pitch: number): PlayLog {
  return {
    inning: state.inning,
    half: state.half,
    order: 0,
    batter: '',
    pitch,
    result,
  };
}

function createPlayEvent(
  state: DemoState,
  details: {
    type: string;
    runners?: string[];
    battedBall?: BattedBallDetails | null;
    error?: ErrorDetails | string | null;
    notes?: string;
  },
  pitch: number,
): PlayEvent {
  const info = currentBatterInfo(state);
  return {
    inning: state.inning,
    half: state.half,
    order: info.order,
    batter: info.batter,
    pitch,
    type: details.type,
    runners: details.runners ?? getRunnerNames(state.bases),
    battedBall: details.battedBall ?? null,
    error: details.error ?? null,
    notes: details.notes,
  };
}

function createPlayEventWithBatter(
  state: DemoState,
  details: {
    type: string;
    runners?: string[];
    battedBall?: BattedBallDetails | null;
    error?: ErrorDetails | string | null;
    notes?: string;
  },
  pitch: number,
  batter: string,
  order: number | null,
): PlayEvent {
  return {
    inning: state.inning,
    half: state.half,
    order: order ?? 0,
    batter,
    pitch,
    type: details.type,
    runners: details.runners ?? getRunnerNames(state.bases),
    battedBall: details.battedBall ?? null,
    error: details.error ?? null,
    notes: details.notes,
  };
}

function createPlayEventForBaserunning(
  state: DemoState,
  details: {
    type: string;
    runners?: string[];
    battedBall?: BattedBallDetails | null;
    error?: ErrorDetails | string | null;
    notes?: string;
  },
  pitch: number,
): PlayEvent {
  return {
    inning: state.inning,
    half: state.half,
    order: 0,
    batter: '',
    pitch,
    type: details.type,
    runners: details.runners ?? [],
    battedBall: details.battedBall ?? null,
    error: details.error ?? null,
    notes: details.notes,
  };
}

function hittingSide(state: DemoState) {
  return state.half === 'top' ? 'away' : 'home';
}

function applyOut(
  state: DemoState,
  message: string,
  options?: {
    advanceBatter?: boolean;
    pitchNumber?: number;
    eventType?: string;
    runners?: string[];
    battedBall?: BattedBallDetails | null;
    error?: string | null;
    notes?: string;
  },
): DemoState {
  const outs = state.outs + 1;
  const advanceBatter = options?.advanceBatter ?? true;
  const pitchNumber = options?.pitchNumber ?? Math.max(1, state.pitchCount + 1);
  const resetCounts = { balls: 0, strikes: 0 };
  const batterIndex = advanceBatter ? nextBatter(state).batterIndex : state.batterIndex;
  const pitchCount = advanceBatter ? 0 : state.pitchCount;
  const logResult = `${message} (${outs} 아웃)`;
  const eventEntry = createPlayEvent(
    state,
    {
      type: options?.eventType ?? 'out',
      runners: options?.runners,
      battedBall: options?.battedBall ?? null,
      error: options?.error ?? null,
      notes: options?.notes ?? message,
    },
    advanceBatter ? pitchNumber : 0,
  );
  if (outs >= 3) {
    const finalMessage = `${message} · 3아웃 · 이닝 종료`;
    const feedWithPlay = pushPlayFeed(state, createLogEntry(state, logResult, advanceBatter ? pitchNumber : 0));
    const eventsWithPlay = pushEvent(state.events, eventEntry);
    return changeHalf(
      { ...state, batterIndex, pitchCount, feed: feedWithPlay, events: eventsWithPlay },
      finalMessage,
      advanceBatter ? pitchNumber : 0,
      state,
    );
  }
  return {
    ...state,
    outs,
    ...resetCounts,
    batterIndex,
    pitchCount,
    lastPlay: message,
    feed: pushPlayFeed(state, createLogEntry(state, logResult, advanceBatter ? pitchNumber : 0)),
    events: pushEvent(state.events, eventEntry),
  };
}

function placeRunnerOnBases(bases: Bases, runner: string, targetBase: number) {
  let dest = targetBase;
  while (dest < 3 && bases[dest]) {
    dest += 1;
  }
  if (dest >= 3) {
    return { bases, scored: true, dest };
  }
  bases[dest] = runner;
  return { bases, scored: false, dest };
}

function applyHitWithAdvances(
  state: DemoState,
  basesToAdvance: 1 | 2 | 3 | 4,
  pitchNumber: number,
  advances?: RunnerAdvanceSelections,
  battedBall?: BattedBallDetails | null,
): DemoState {
  const { batterName, batterIndex } = nextBatter(state);
  const result = basesToAdvance === 4 ? '홈런' : `${basesToAdvance}루타`;
  const message = `${result} · ${batterName}`;
  const bases = [null, null, null] as Bases;
  let runs = 0;
  let outs = state.outs;
  const runnerMoves: { feedText: string; lastPlay: string; runnerSummary: string }[] = [];

  for (let i = 2; i >= 0; i -= 1) {
    const runner = state.bases[i];
    if (!runner) continue;
    const outcome = advances?.[i as 0 | 1 | 2];
    const resolved = resolveAdvanceOutcome(outcome, i, basesToAdvance);
    if (resolved.type === 'out') {
      outs += 1;
      runnerMoves.push(
        formatRunnerMove({ runner, from: i, to: i, outcome: 'out', outsCount: outs }),
      );
      continue;
    }
    if (resolved.type === 'score') {
      runs += 1;
      runnerMoves.push(formatRunnerMove({ runner, from: i, to: 3, outcome: 'score' }));
      continue;
    }
    if (resolved.type === 'hold') {
      const placed = placeRunnerOnBases(bases, runner, resolved.targetBaseIndex);
      if (placed.scored) {
        runs += 1;
        runnerMoves.push(formatRunnerMove({ runner, from: i, to: 3, outcome: 'score' }));
      } else {
        runnerMoves.push(formatRunnerMove({ runner, from: i, to: placed.dest, outcome: 'hold' }));
      }
      continue;
    }
    const placed = placeRunnerOnBases(bases, runner, resolved.targetBaseIndex);
    if (placed.scored) {
      runs += 1;
      runnerMoves.push(formatRunnerMove({ runner, from: i, to: 3, outcome: 'score' }));
    } else {
      runnerMoves.push(formatRunnerMove({ runner, from: i, to: placed.dest, outcome: 'advance' }));
    }
  }

  if (basesToAdvance >= 4) {
    runs += 1;
  } else {
    const batterDest = basesToAdvance - 1;
    const placed = placeRunnerOnBases(bases, batterName, batterDest);
    if (placed.scored) {
      runs += 1;
    }
  }

  const side = hittingSide(state);
  const score =
    side === 'home'
      ? { ...state.score, home: state.score.home + runs }
      : { ...state.score, away: state.score.away + runs };
  const eventEntry = createPlayEvent(
    state,
    {
      type: 'hit',
      runners: runnerMoves.map((move) => move.runnerSummary),
      battedBall: battedBall ?? null,
      notes: message,
    },
    pitchNumber,
  );
  
  let feed = state.feed;
  runnerMoves.forEach((move) => {
    feed = pushFeed(feed, createLogEntryForBaserunning(state, move.feedText, pitchNumber));
  });
  const resultLog = runs ? `${result} · ${runs}득점` : result;
  feed = pushPlayFeed(state, createLogEntry(state, resultLog, pitchNumber), feed);

  const nextState = {
    ...state,
    bases,
    score,
    balls: 0,
    strikes: 0,
    pitchCount: 0,
    batterIndex,
    outs,
    lastPlay: message,
    feed,
    events: pushEvent(state.events, eventEntry),
  };

  if (outs >= 3) {
    return changeHalf(nextState, `${result} · 3아웃 · 이닝 종료`, pitchNumber, state);
  }

  return nextState;
}

function applyFielderChoice(
  state: DemoState,
  pitchNumber: number,
  advances?: RunnerAdvanceSelections,
  battedBall?: BattedBallDetails | null,
  context?: string,
): DemoState {
  const batterInfo = currentBatterInfo(state);
  const { batterIndex } = nextBatter(state);
  const batterName = batterInfo.batter;
  const batterOrder = batterInfo.order;
  const bases = [null, null, null] as Bases;
  let runs = 0;
  let outs = state.outs;
  let feed = state.feed;
  const runnerMoves: { feedText: string; lastPlay: string; runnerSummary: string }[] = [];

  for (let i = 2; i >= 0; i -= 1) {
    const runner = state.bases[i];
    if (!runner) continue;
    const resolved = resolveAdvanceOutcome(advances?.[i as 0 | 1 | 2], i, 1);
    if (resolved.type === 'out') {
      outs += 1;
      const detail = formatRunnerMove({ runner, from: i, to: i, outcome: 'out', outsCount: outs, message: '야수선택' });
      runnerMoves.push(detail);
      continue;
    }
    if (resolved.type === 'score') {
      runs += 1;
      runnerMoves.push(formatRunnerMove({ runner, from: i, to: 3, outcome: 'score', message: '야수선택' }));
      continue;
    }
    if (resolved.type === 'hold') {
      const placed = placeRunnerOnBases(bases, runner, resolved.targetBaseIndex);
      if (placed.scored) {
        runs += 1;
        runnerMoves.push(formatRunnerMove({ runner, from: i, to: 3, outcome: 'score', message: '야수선택' }));
      } else {
        runnerMoves.push(formatRunnerMove({ runner, from: i, to: placed.dest, outcome: 'hold', message: '야수선택' }));
      }
      continue;
    }
    const placed = placeRunnerOnBases(bases, runner, resolved.targetBaseIndex);
    if (placed.scored) {
      runs += 1;
      runnerMoves.push(formatRunnerMove({ runner, from: i, to: 3, outcome: 'score', message: '야수선택' }));
    } else {
      runnerMoves.push(formatRunnerMove({ runner, from: i, to: placed.dest, outcome: 'advance', message: '야수선택' }));
    }
  }

  const placedBatter = placeRunnerOnBases(bases, batterName, 0);
  if (placedBatter.scored) runs += 1;

  const side = hittingSide(state);
  const score =
    side === 'home'
      ? { ...state.score, home: state.score.home + runs }
      : { ...state.score, away: state.score.away + runs };

  const contextNote = context?.trim() ? ` (${context.trim()})` : '';
  const resultLog = runs ? `야수선택${contextNote} · ${runs}득점` : `야수선택${contextNote}`;
  feed = pushPlayFeed(state, createLogEntryWithBatter(state, batterName, batterOrder, resultLog, pitchNumber), feed);
  runnerMoves.forEach((move) => {
    feed = pushFeed(feed, createLogEntryForBaserunning(state, move.feedText, pitchNumber));
  });

  const eventEntry = createPlayEventWithBatter(
    state,
    {
      type: 'fc',
      runners: runnerMoves.map((move) => move.runnerSummary),
      battedBall: battedBall ?? null,
      notes: `야수선택${contextNote ? ` ${contextNote}` : ''} · ${batterName}`,
    },
    pitchNumber,
    batterName,
    batterOrder,
  );

  const nextState: DemoState = {
    ...state,
    bases,
    score,
    balls: 0,
    strikes: 0,
    pitchCount: 0,
    batterIndex,
    outs,
    lastPlay: resultLog,
    feed,
    events: pushEvent(state.events, eventEntry),
  };

  if (outs >= 3) {
    return changeHalf(nextState, `${resultLog} · 3아웃 · 이닝 종료`, pitchNumber, state);
  }

  return nextState;
}

function applyWalk(state: DemoState, message: string, pitchNumber: number): DemoState {
  const { batterName, batterIndex } = nextBatter(state);
  const { bases, runs } = advanceBasesOnWalk(state.bases, batterName);
  const side = hittingSide(state);
  const score =
    side === 'home'
      ? { ...state.score, home: state.score.home + runs }
      : { ...state.score, away: state.score.away + runs };
  const eventEntry = createPlayEvent(
    state,
    {
      type: message === '몸에 맞는 공' ? 'hbp' : 'walk',
      runners: getRunnerNames(state.bases),
      notes: `${message} · ${batterName}`,
    },
    pitchNumber,
  );
  return {
    ...state,
    bases,
    score,
    balls: 0,
    strikes: 0,
    pitchCount: 0,
    batterIndex,
    lastPlay: `${message} · ${batterName}`,
    feed: pushPlayFeed(state, createLogEntry(state, runs ? `${message} · ${runs}득점` : message, pitchNumber)),
    events: pushEvent(state.events, eventEntry),
  };
}

function applyDroppedThirdStrike(state: DemoState): DemoState {
  const pitchNumber = Math.max(1, state.pitchCount + 1);
  const { batterName, batterIndex } = nextBatter(state);
  const { bases, runs } = advanceBasesOnWalk(state.bases, batterName);
  const side = hittingSide(state);
  const score =
    side === 'home'
      ? { ...state.score, home: state.score.home + runs }
      : { ...state.score, away: state.score.away + runs };
  const message = '삼진 낫아웃';
  const eventEntry = createPlayEvent(
    state,
    {
      type: 'dropped_third_strike',
      runners: getRunnerNames(state.bases),
      notes: `${message} · ${batterName}`,
    },
    pitchNumber,
  );
  return {
    ...state,
    bases,
    score,
    balls: 0,
    strikes: 0,
    pitchCount: 0,
    batterIndex,
    lastPlay: `${message} · ${batterName}`,
    feed: pushPlayFeed(state, createLogEntry(state, runs ? `${message} · ${runs}득점` : message, pitchNumber)),
    events: pushEvent(state.events, eventEntry),
  };
}

function applySacrifice(
  state: DemoState,
  pitchNumber: number,
  battedBall?: BattedBallDetails | null,
  sacType: 'fly' | 'bunt' = 'fly',
): DemoState {
  if (sacType === 'bunt') {
    const bases = [null, null, null] as Bases;
    let runs = 0;
    for (let i = 2; i >= 0; i -= 1) {
      const runner = state.bases[i];
      if (!runner) continue;
      if (i === 2) {
        runs += 1;
        continue;
      }
      const placed = placeRunnerOnBases(bases, runner, i + 1);
      if (placed.scored) runs += 1;
    }
    const side = hittingSide(state);
    const score =
      side === 'home'
        ? { ...state.score, home: state.score.home + runs }
        : { ...state.score, away: state.score.away + runs };
    return applyOut(
      { ...state, bases, score },
      runs ? `희생번트 · ${runs}득점` : '희생번트',
      { pitchNumber, eventType: 'sac', runners: getRunnerNames(bases), notes: '희생번트', battedBall },
    );
  }

  const bases = [...state.bases] as Bases;
  let runs = 0;
  if (bases[2]) {
    runs += 1;
    bases[2] = null;
  }
  const side = hittingSide(state);
  const score =
    side === 'home'
      ? { ...state.score, home: state.score.home + runs }
      : { ...state.score, away: state.score.away + runs };
  return applyOut(
    { ...state, bases, score },
    runs ? `희생플라이 · ${runs}득점` : '희생플라이',
    { pitchNumber, eventType: 'sac', runners: getRunnerNames(bases), notes: '희생플라이', battedBall },
  );
}

function applyError(state: DemoState, details: ErrorDetails): DemoState {
  const pitchNumber = Math.max(1, state.pitchCount + 1);
  const isBatterHold = details.advanceResults.batter === 'hold';
  const { batter } = currentBatterInfo(state);
  const batterName = isBatterHold ? batter : nextBatter(state).batterName;
  const batterIndex = isBatterHold ? state.batterIndex[hittingSide(state)] : nextBatter(state).batterIndex;
  const bases = [null, null, null] as Bases;
  const runnerMoves: { feedText: string; lastPlay: string; runnerSummary: string }[] = [];
  let runs = 0;
  let outs = state.outs;

  for (let i = 2; i >= 0; i -= 1) {
    const runner = state.bases[i];
    if (!runner) continue;
    const outcome = details.advanceResults.runners[i as 0 | 1 | 2];
    const resolved = resolveAdvanceOutcome(outcome, i, 1);
    if (resolved.type === 'out') {
      outs += 1;
      runnerMoves.push(formatRunnerMove({ runner, from: i, to: i, outcome: 'out', outsCount: outs, message: `실책(${details.errorType})` }));
      continue;
    }
    if (resolved.type === 'score') {
      runs += 1;
      runnerMoves.push(formatRunnerMove({ runner, from: i, to: 3, outcome: 'score', message: `실책(${details.errorType})` }));
      continue;
    }
    if (resolved.type === 'hold') {
      const placed = placeRunnerOnBases(bases, runner, resolved.targetBaseIndex);
      if (placed.scored) {
        runs += 1;
        runnerMoves.push(formatRunnerMove({ runner, from: i, to: 3, outcome: 'score', message: `실책(${details.errorType})` }));
      }
      continue;
    }
    const placed = placeRunnerOnBases(bases, runner, resolved.targetBaseIndex);
    if (placed.scored) {
      runs += 1;
      runnerMoves.push(formatRunnerMove({ runner, from: i, to: 3, outcome: 'score', message: `실책(${details.errorType})` }));
    } else {
      runnerMoves.push(formatRunnerMove({ runner, from: i, to: placed.dest, outcome: 'advance', message: `실책(${details.errorType})` }));
    }
  }

  const batterResult = details.advanceResults.batter;
  if (batterResult === 'out') {
    outs += 1;
  } else if (batterResult === 'hold') {
    // batter stays at plate; no movement
  } else if (batterResult >= 4) {
    runs += 1;
  } else {
    const placed = placeRunnerOnBases(bases, batterName, batterResult - 1);
    if (placed.scored) {
      runs += 1;
    }
  }

  const side = hittingSide(state);
  const score =
    side === 'home'
      ? { ...state.score, home: state.score.home + runs }
      : { ...state.score, away: state.score.away + runs };

  const errorContext = details.context.trim();
  const summary = `실책 · ${details.errorType} · ${details.fielderPos}${errorContext ? ` · ${errorContext}` : ''}`;
  const resultTags: string[] = [summary];
  if (batterResult === 'out') {
    resultTags.push('타자 아웃');
  }
  if (runs > 0) {
    resultTags.push(`${runs}득점`);
  }
  const resultText = resultTags.join(' · ');

  let feed = state.feed;
  runnerMoves.forEach((move) => {
    feed = pushFeed(feed, createLogEntryForBaserunning(state, move.feedText, pitchNumber));
  });
  feed = pushPlayFeed(state, createLogEntry(state, resultText, pitchNumber), feed);

  const eventEntry = createPlayEvent(
    state,
    {
      type: 'error',
      runners: runnerMoves.map((move) => move.runnerSummary),
      error: details,
      notes: summary,
    },
    pitchNumber,
  );

  const nextState = {
    ...state,
    bases,
    score,
    balls: 0,
    strikes: 0,
    pitchCount: isBatterHold ? state.pitchCount : 0,
    batterIndex: isBatterHold
      ? state.batterIndex
      : { ...state.batterIndex, [hittingSide(state)]: batterIndex },
    outs,
    lastPlay: summary,
    feed,
    events: pushEvent(state.events, eventEntry),
  };

  if (outs >= 3) {
    return changeHalf(nextState, `${resultText} · 3아웃 · 이닝 종료`, pitchNumber, state);
  }

  return nextState;
}

function applySteal(state: DemoState, success: boolean): DemoState {
  if (!state.bases.some(Boolean)) {
    return {
      ...state,
      lastPlay: success ? '도루 시도 (주자 없음)' : '도루 실패 (주자 없음)',
      feed: pushFeed(state.feed, createLogEntry(state, '주자 없음', 0)),
    };
  }
  if (!success) {
    const bases = [...state.bases] as Bases;
    let foundIndex: number | null = null;
    const runner = bases.find((r, idx) => {
      if (r) foundIndex = idx;
      return Boolean(r);
    }) ?? '주자';
    for (let i = 2; i >= 0; i -= 1) {
      if (bases[i]) {
        bases[i] = null;
        break;
      }
    }
    const detail = formatRunnerMove({
      runner,
      from: foundIndex ?? 0,
      to: foundIndex ?? 0,
      outcome: 'out',
      message: '도루 실패',
      outsCount: state.outs + 1,
    });
    const afterOut = applyOut({ ...state, bases }, detail.feedText, { advanceBatter: false, pitchNumber: 0 });
    const feedEntry = createLogEntryForBaserunning(state, detail.feedText, state.pitchCount);
    return { ...afterOut, lastPlay: detail.lastPlay, feed: pushFeed(afterOut.feed, feedEntry) };
  }
  let runs = 0;
  const bases = [...state.bases] as Bases;
  let moved: { name: string; from: number; to: number; scored: boolean } | null = null;
  for (let i = 2; i >= 0; i -= 1) {
    if (!bases[i]) continue;
    const runner = bases[i];
    if (!runner) continue;
    bases[i] = null;
    const dest = i + 1;
    if (dest >= 3) {
      runs += 1;
    } else {
      bases[dest] = runner;
    }
    moved = { name: runner, from: i, to: dest, scored: dest >= 3 };
    break;
  }
  const side = hittingSide(state);
  const score =
    side === 'home'
      ? { ...state.score, home: state.score.home + runs }
      : { ...state.score, away: state.score.away + runs };
  const detail = moved
    ? formatRunnerMove({
        runner: moved.name,
        from: moved.from,
        to: moved.to,
        outcome: moved.scored ? 'score' : 'advance',
        message: '도루 성공',
      })
    : null;    
  const feedEntry = detail ? createLogEntryForBaserunning(state, detail.feedText, state.pitchCount + 1) : null;
  const eventEntry = createPlayEventForBaserunning(
    state,
    {
      type: success ? 'steal' : 'steal_fail',
      runners: detail ? [detail.runnerSummary] : [],
      notes: detail?.feedText ?? (runs ? `도루 성공 · ${runs}득점` : '도루 성공'),
    },
    state.pitchCount + 1,
  );
  return {
    ...state,
    bases,
    score,
    balls: 0,
    strikes: 0,
    pitchCount: 0,
    lastPlay: detail?.lastPlay ?? (runs ? `도루 성공 · ${runs}득점` : '도루 성공'),
    feed: pushFeed(
      state.feed,
      feedEntry ?? createLogEntry(state, detail?.feedText ?? (runs ? `도루 성공 · ${runs}득점` : '도루 성공'), 0),
    ),
    events: pushEvent(state.events, eventEntry),
  };
}

function applyRunnerAdvance(state: DemoState, baseIndex: 0 | 1 | 2, steps: number, message: string): DemoState {
  const bases = [...state.bases] as Bases;
  const runner = bases[baseIndex];
  if (!runner) return state;
  bases[baseIndex] = null;
  let runs = 0;
  const dest = baseIndex + steps;
  if (dest >= 3) {
    runs = 1;
  } else {
    bases[dest] = runner;
  }
  const side = hittingSide(state);
  const score =
    side === 'home'
      ? { ...state.score, home: state.score.home + runs }
      : { ...state.score, away: state.score.away + runs };
  const detail = formatRunnerMove({
    runner,
    from: baseIndex,
    to: dest,
    outcome: runs > 0 ? 'score' : 'advance',
    message,
  });
  const eventEntry = createPlayEventForBaserunning(
    state,
    { type: 'runner', runners: [detail.runnerSummary], notes: detail.feedText },
    state.pitchCount,
  );
  return {
    ...state,
    bases,
    score,
    lastPlay: detail.lastPlay,
    feed: pushFeed(state.feed, createLogEntry(state, detail.feedText, 0)),
    events: pushEvent(state.events, eventEntry),
  };
}

function applyRunnerOut(state: DemoState, baseIndex: 0 | 1 | 2, message: string): DemoState {
  const bases = [...state.bases] as Bases;
  if (!bases[baseIndex]) return state;
  const runner = bases[baseIndex];
  bases[baseIndex] = null;
  const outs = state.outs + 1;
  const detail = formatRunnerMove({
    runner: runner ?? '주자',
    from: baseIndex,
    to: baseIndex,
    outcome: 'out',
    message,
    outsCount: outs,
  });
  const feedEntry = createLogEntryForBaserunning(state, detail.feedText, state.pitchCount);
  const eventEntry = createPlayEventForBaserunning(
    state,
    { type: 'runner_out', runners: [detail.runnerSummary], notes: detail.feedText },
    state.pitchCount,
  );
  if (outs >= 3) {
    const finalMessage = `${detail.lastPlay} · 이닝 종료`;
    const afterHalf = changeHalf(
      { ...state, bases, outs, feed: pushFeed(state.feed, feedEntry), events: pushEvent(state.events, eventEntry) },
      finalMessage,
      state.pitchCount,
      state,
    );
    return afterHalf;
  }
  return {
    ...state,
    bases,
    outs,
    lastPlay: detail.lastPlay,
    pitchCount: state.pitchCount,
    feed: pushFeed(state.feed, feedEntry),
    events: pushEvent(state.events, eventEntry),
  };
}

function applyDoublePlay(
  state: DemoState,
  outsToAdd: 2 | 3,
  label: string,
  battedBall?: BattedBallDetails | null,
): DemoState {
  const bases = [...state.bases] as Bases;
  const current = currentBatterInfo(state);
  const batterName = current.batter;
  const batterIndex = nextBatter(state).batterIndex;
  const runnersOut: { name: string; base: number }[] = [];
  const outs = Math.min(3, state.outs + outsToAdd);

  // Batter out
  runnersOut.push({ name: batterName, base: -1 });

  // Remove lead runners
  for (let i = 2; i >= 0 && runnersOut.length < outsToAdd; i -= 1) {
    if (bases[i]) {
      runnersOut.push({ name: bases[i] as string, base: i });
      bases[i] = null;
    }
  }

  const runnerDesc = runnersOut
    .filter((r) => r.base >= 0)
    .map((r) => `${r.name} ${baseLabel(r.base)}`)
    .join(', ');
  const feedText = runnerDesc ? `${label} · ${batterName} 아웃 / ${runnerDesc} 아웃` : `${label} · ${batterName} 아웃`;
  const lastPlay = feedText;
  const eventEntry = createPlayEvent(
    state,
    { type: 'out', runners: getRunnerNames(state.bases), notes: feedText, battedBall: battedBall ?? null },
    Math.max(1, state.pitchCount + 1),
  );

  const nextState = {
    ...state,
    bases,
    outs,
    balls: 0,
    strikes: 0,
    pitchCount: 0,
    batterIndex,
    lastPlay,
    feed: pushPlayFeed(state, createLogEntry(state, feedText, Math.max(1, state.pitchCount + 1))),
    events: pushEvent(state.events, eventEntry),
  };

  if (outs >= 3) {
    return changeHalf(nextState, lastPlay, state.pitchCount + 1, state);
  }
  return nextState;
}

function applyEndGame(state: DemoState, endedAt: string): DemoState {
  if (state.gameOver) return state;
  const message = '경기 종료';
  const feedEntry = createLogEntry(state, message, state.pitchCount);
  return {
    ...state,
    balls: 0,
    strikes: 0,
    pitchCount: 0,
    bases: [null, null, null],
    gameOver: true,
    endedAt,
    lastPlay: message,
    feed: pushFeed(state.feed, feedEntry),
  };
}

function updateMatchSchedule(matches: MatchSchedule[], matchId: string, updates: Partial<MatchSchedule>) {
  return matches.map((match) => (match.id === matchId ? { ...match, ...updates } : match));
}

function resetGameForMatch(state: DemoState, match: MatchSchedule): DemoState {
  const lineups = ensureCompleteLineups(match.lineups ?? state.lineups);
  const benches = match.benches ?? state.benches;
  return {
    inning: 1,
    half: 'top',
    balls: 0,
    strikes: 0,
    outs: 0,
    pitchCount: 0,
    bases: [null, null, null],
    score: { home: 0, away: 0 },
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
    history: [],
    removed: { home: [], away: [] },
    matches: state.matches,
    activeMatchId: match.id,
  };
}

function createNewGame(state: DemoState): DemoState {
  const preparedLineups = ensureCompleteLineups(state.lineups);
  return {
    inning: 1,
    half: 'top',
    balls: 0,
    strikes: 0,
    outs: 0,
    pitchCount: 0,
    bases: [null, null, null],
    score: { home: 0, away: 0 },
    lastPlay: '경기 대기 중',
    feed: [],
    events: [],
    homeTeamId: state.homeTeamId,
    awayTeamId: state.awayTeamId,
    batterIndex: { home: 0, away: 0 },
    lineups: cloneLineups(preparedLineups),
    benches: {
      home: state.benches.home.map((p) => ({ ...p })),
      away: state.benches.away.map((p) => ({ ...p })),
    },
    teamNames: { ...state.teamNames },
    gameStarted: false,
    gameOver: false,
    endedAt: null,
    liveVideoUrl: state.liveVideoUrl,
    history: [],
    removed: { home: [], away: [] },
    matches: state.matches,
    activeMatchId: state.activeMatchId,
  };
}

function changeHalf(state: DemoState, message: string, pitchNumber = 0, logState?: DemoState): DemoState {
  const nextHalf: Half = state.half === 'top' ? 'bottom' : 'top';
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
    lastPlay: message,
    feed,
  };
}

function resolveAdvanceOutcome(
  outcome: RunnerAdvanceOutcome | undefined,
  fromBase: number,
  defaultSteps: number,
): { type: 'hold' | 'advance' | 'score' | 'out'; targetBaseIndex: number } {
  if (outcome === 'out') return { type: 'out', targetBaseIndex: fromBase };
  if (outcome === 'score') return { type: 'score', targetBaseIndex: 3 };
  if (outcome === 'hold') return { type: 'hold', targetBaseIndex: fromBase };
  if (typeof outcome === 'number') {
    if (outcome >= 4) return { type: 'score', targetBaseIndex: 3 };
    const targetBaseIndex = Math.max(0, outcome - 1);
    if (targetBaseIndex <= fromBase) {
      return { type: 'hold', targetBaseIndex: fromBase };
    }
    return { type: 'advance', targetBaseIndex };
  }
  const targetBaseIndex = fromBase + defaultSteps;
  if (targetBaseIndex >= 3) {
    return { type: 'score', targetBaseIndex: 3 };
  }
  return { type: 'advance', targetBaseIndex };
}

function advanceBasesOnWalk(currentBases: Bases, batterName: string) {
  const bases = [...currentBases] as Bases;
  let runs = 0;

  if (bases[0]) {
    if (bases[1] && bases[2]) {
      runs += 1;
      bases[2] = null;
    }
    if (bases[1]) {
      bases[2] = bases[1];
      bases[1] = null;
    }
    bases[1] = bases[0];
    bases[0] = null;
  }

  bases[0] = batterName;

  return { bases, runs };
}

function nextBatter(state: DemoState) {
  const side = hittingSide(state);
  const lineup = state.lineups[side];
  const battingLineup = lineup.filter((slot) => slot.pos.toUpperCase() !== 'P');
  const activeLineup = battingLineup.length ? battingLineup : lineup;
  const safeLength = activeLineup.length || 1;
  const idx = state.batterIndex[side] % safeLength;
  const batterName = activeLineup[idx]?.name ?? '타자';
  const batterIndex = { ...state.batterIndex, [side]: (idx + 1) % safeLength };
  return { batterName, batterIndex };
}

function updateLineup(state: DemoState, side: Side, index: number, updates: Partial<PlayerSlot>): DemoState {
  const updated = state.lineups[side].map((slot, idx) => (idx === index ? { ...slot, ...updates } : slot));
  return { ...state, lineups: { ...state.lineups, [side]: updated } };
}

function substitutePlayer(state: DemoState, side: Side, benchIndex: number, lineupIndex: number): DemoState {
  const bench = [...state.benches[side]];
  const lineup = [...state.lineups[side]];
  const benchPlayer = bench[benchIndex];
  if (!benchPlayer) return state;
  const outgoing = lineup[lineupIndex];
  const battingOrder = getBattingOrder(state.lineups[side], lineupIndex);
  lineup[lineupIndex] = benchPlayer;
  bench.splice(benchIndex, 1);
  const removed = {
    ...state.removed,
    [side]:
      outgoing && !state.removed[side].some((p) => p.name === outgoing.name)
        ? [...state.removed[side], { ...outgoing, order: battingOrder }]
        : [...state.removed[side]],
  };
  const incomingIsP = benchPlayer.pos.toUpperCase() === 'P';
  const outgoingIsP = outgoing?.pos?.toUpperCase() === 'P';
  const isPitcherChange = incomingIsP || outgoingIsP;
  const formatPlayer = (player?: PlayerSlot) => {
    if (!player) return '미정';
    const num = player.number ? `(${player.number})` : '';
    return `${player.name}${num}`;
  };
  const changeLabel = isPitcherChange ? '투수 교체' : '타자 교체';
  const changeText = `${changeLabel} · ${formatPlayer(outgoing)} → ${formatPlayer(benchPlayer)}`;
  const feed = pushFeed(state.feed, createLogEntryForBaserunning(state, changeText, 0));
  return {
    ...state,
    lineups: { ...state.lineups, [side]: lineup },
    benches: { ...state.benches, [side]: bench },
    removed,
    lastPlay: changeText,
    feed,
  };
}

function getBattingOrder(lineup: PlayerSlot[], lineupIndex: number) {
  const slot = lineup[lineupIndex];
  if (!slot || slot.pos.toUpperCase() === 'P') return null;
  let order = 0;
  for (let i = 0; i < lineup.length; i += 1) {
    const player = lineup[i];
    if (player.pos.toUpperCase() === 'P') continue;
    order += 1;
    if (i === lineupIndex) return order;
  }
  return order || null;
}

interface DemoStoreValue {
  state: DemoState;
  actions: {
    addBall: () => void;
    addStrike: () => void;
    addFoul: () => void;
    strikeOut: () => void;
    droppedThirdStrike: () => void;
    addOut: (battedBall?: BattedBallDetails | null) => void;
    hitSingle: (advances?: RunnerAdvanceSelections, battedBall?: BattedBallDetails | null) => void;
    hitDouble: (advances?: RunnerAdvanceSelections, battedBall?: BattedBallDetails | null) => void;
    hitTriple: (advances?: RunnerAdvanceSelections, battedBall?: BattedBallDetails | null) => void;
    homeRun: (battedBall?: BattedBallDetails | null) => void;
    fielderChoice: (advances?: RunnerAdvanceSelections, battedBall?: BattedBallDetails | null, context?: string) => void;
    walk: () => void;
    intentionalWalk: () => void;
    catcherInterference: () => void;
    hbp: () => void;
    sacFly: (battedBall?: BattedBallDetails | null) => void;
    sacBunt: (battedBall?: BattedBallDetails | null) => void;
    recordError: (details: ErrorDetails) => void;
    stealSuccess: () => void;
    stealFail: () => void;
    resetCount: () => void;
    clearBases: () => void;
    nextHalf: () => void;
    runnerStealSuccess: (base: 0 | 1 | 2) => void;
    runnerCaught: (base: 0 | 1 | 2) => void;
    runnerPickoff: (base: 0 | 1 | 2) => void;
    runnerOut: (base: 0 | 1 | 2) => void;
    runnerRundownOut: (base: 0 | 1 | 2) => void;
    runnerInterference: (base: 0 | 1 | 2) => void;
    addManualLog: (message: string) => void;
    setLiveVideoUrl: (url: string) => void;
    setTeamName: (side: Side, name: string) => void;
    setLineup: (side: Side, index: number, updates: Partial<PlayerSlot>) => void;
    addBench: (side: Side, player: PlayerSlot) => void;
    removeBench: (side: Side, benchIndex: number) => void;
    substitute: (side: Side, benchIndex: number, lineupIndex: number) => void;
    setPlay: (message: string) => void;
    startGame: () => void;
    endGame: (endedAt: string) => void;
    resetGame: () => void;
    undo: () => void;
    addOutWithMessage: (note: string, battedBall?: BattedBallDetails | null) => void;
    doublePlay: (battedBall?: BattedBallDetails | null) => void;
    triplePlay: (battedBall?: BattedBallDetails | null) => void;
    addMatch: (match: MatchSchedule) => void;
    updateMatch: (matchId: string, updates: Partial<MatchSchedule>) => void;
    deleteMatch: (matchId: string) => void;
    saveMatchLineups: (
      matchId: string,
      lineups: { home: PlayerSlot[]; away: PlayerSlot[] },
      benches: { home: PlayerSlot[]; away: PlayerSlot[] },
    ) => void;
    selectMatch: (matchId: string | null) => void;
  };
}

const DemoStoreContext = createContext<DemoStoreValue | null>(null);

export function DemoStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState, (init) => {
    if (typeof window === 'undefined') return init;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (!stored) return init;
      const parsed = JSON.parse(stored) as DemoState;
      return normalizeState(init, parsed);
    } catch {
      return init;
    }
  });
  const skipSyncRef = useRef(false);
  const stateRef = useRef(state);
  const skipFirestoreWriteRef = useRef(false);
  const skipMatchesWriteRef = useRef(false);
  const lastStateKeyRef = useRef('');
  const lastMatchesKeyRef = useRef('');

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (skipSyncRef.current) {
      skipSyncRef.current = false;
      return;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore storage write failures.
    }
  }, [state]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      try {
        const nextState = JSON.parse(event.newValue) as DemoState;
        skipSyncRef.current = true;
        dispatch({ type: 'hydrate', state: nextState });
      } catch {
        // Ignore invalid payloads.
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Subscribe to schedule collection for spectators (read-only) and admins.
  useEffect(() => {
    const q = query(collection(firestore, 'matches'), orderBy('startTime', 'asc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const incoming = snap.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Partial<MatchSchedule>),
        }));
        const normalized = normalizeMatches(incoming);
        skipMatchesWriteRef.current = true;
        dispatch({ type: 'setMatches', matches: normalized });
      },
      (error) => {
        // eslint-disable-next-line no-console
        console.error('[firestore] matches snapshot error', error);
      },
    );
    return () => unsub();
  }, []);

  // Listen to current active match pointer so spectators know which match to watch.
  useEffect(() => {
    const currentRef = doc(firestore, 'app', 'current');
    const unsub = onSnapshot(
      currentRef,
      (snap) => {
        const data = snap.data();
        if (!data) return;
        const nextId = typeof data.activeMatchId === 'string' ? data.activeMatchId : null;
        if (nextId === stateRef.current.activeMatchId) return;
        dispatch({ type: 'syncActiveMatch', matchId: nextId });
      },
      () => {
        // ignore errors
      },
    );
    return () => unsub();
  }, []);

  // Live subscribe to the active match state.
  useEffect(() => {
    const matchId = state.activeMatchId;
    if (!matchId) return;
    const stateDoc = doc(firestore, 'matchStates', matchId);
    const unsub = onSnapshot(
      stateDoc,
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data() as SharedGameState;
        skipFirestoreWriteRef.current = true;
        dispatch({
          type: 'hydrate',
          state: normalizeState(initialState, {
            ...stateRef.current,
            ...data,
            matches: stateRef.current.matches,
          }),
        });
      },
      () => {
        // ignore snapshot errors
      },
    );
    return () => unsub();
  }, [state.activeMatchId]);

  // Push game state to Firestore when admin updates locally.
  useEffect(() => {
    const matchId = state.activeMatchId;
    if (!matchId) return;
    if (!auth.currentUser) return;
    if (skipFirestoreWriteRef.current) {
      skipFirestoreWriteRef.current = false;
      return;
    }
    const snapshot = snapshotState(state);
    const { matches, ...rest } = snapshot;
    const key = `${matchId}:${rest.inning}:${rest.half}:${rest.score.home}:${rest.score.away}:${rest.pitchCount}:${rest.feed.length}:${rest.events.length}:${rest.gameStarted}:${rest.gameOver}`;
    if (key === lastStateKeyRef.current) return;
    lastStateKeyRef.current = key;
    void setDoc(
      doc(firestore, 'matchStates', matchId),
      { ...rest, updatedAt: Date.now() },
      { merge: true },
    ).catch(() => {});
  }, [state]);

  // Sync schedule changes to Firestore (admin routes only; spectators skip via flag/auth).
  useEffect(() => {
    if (!auth.currentUser) return;
    if (skipMatchesWriteRef.current) {
      skipMatchesWriteRef.current = false;
      return;
    }
    const key = JSON.stringify(state.matches.map((m) => [m.id, m.status, m.startTime, m.homeScore, m.awayScore, m.notes]));
    if (key === lastMatchesKeyRef.current) return;
    lastMatchesKeyRef.current = key;
    const syncMatches = async () => {
      const batch = writeBatch(firestore);
      state.matches.forEach((match) => {
        batch.set(doc(firestore, 'matches', match.id), match, { merge: true });
      });
      await batch.commit();
    };
    void syncMatches().catch(() => {});
  }, [state.matches]);

  const updateCurrentMatchPointer = (matchId: string | null) => {
    if (!auth.currentUser) return;
    void setDoc(
      doc(firestore, 'app', 'current'),
      { activeMatchId: matchId, updatedAt: Date.now() },
      { merge: true },
    ).catch(() => {});
  };

  const actions = useMemo(
    () => ({
      addBall: () => dispatch({ type: 'ball' }),
      addStrike: () => dispatch({ type: 'strike' }),
      addFoul: () => dispatch({ type: 'foul' }),
      strikeOut: () => dispatch({ type: 'strikeOut' }),
      droppedThirdStrike: () => dispatch({ type: 'droppedThirdStrike' }),
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
      runnerStealSuccess: (base: 0 | 1 | 2) => dispatch({ type: 'runnerStealSuccess', base }),
      runnerCaught: (base: 0 | 1 | 2) => dispatch({ type: 'runnerCaught', base }),
      runnerPickoff: (base: 0 | 1 | 2) => dispatch({ type: 'runnerPickoff', base }),
      runnerOut: (base: 0 | 1 | 2) => dispatch({ type: 'runnerOut', base }),
      addManualLog: (message: string) => dispatch({ type: 'manualLog', message }),
      setLiveVideoUrl: (url: string) => dispatch({ type: 'setLiveVideoUrl', url }),
      addOutWithMessage: (note: string, battedBall?: BattedBallDetails | null) =>
        dispatch({ type: 'outWithMessage', note, battedBall }),
      doublePlay: (battedBall?: BattedBallDetails | null) => dispatch({ type: 'doublePlay', battedBall }),
      triplePlay: (battedBall?: BattedBallDetails | null) => dispatch({ type: 'triplePlay', battedBall }),
      setTeamName: (side: Side, name: string) => dispatch({ type: 'setTeamName', side, name }),
      setLineup: (side: Side, index: number, updates: Partial<PlayerSlot>) =>
        dispatch({ type: 'setLineup', side, index, updates }),
      addBench: (side: Side, player: PlayerSlot) => dispatch({ type: 'addBench', side, player }),
      removeBench: (side: Side, benchIndex: number) => dispatch({ type: 'removeBench', side, benchIndex }),
      substitute: (side: Side, benchIndex: number, lineupIndex: number) =>
        dispatch({ type: 'substitute', side, benchIndex, lineupIndex }),
      setPlay: (message: string) => dispatch({ type: 'setPlay', message }),
      startGame: () => dispatch({ type: 'startGame' }),
      endGame: (endedAt: string) => dispatch({ type: 'endGame', endedAt }),
      resetGame: () => dispatch({ type: 'resetGame' }),
      undo: () => dispatch({ type: 'undo' }),
      addMatch: (match: MatchSchedule) => dispatch({ type: 'addMatch', match }),
      updateMatch: (matchId: string, updates: Partial<MatchSchedule>) => dispatch({ type: 'updateMatch', matchId, updates }),
      deleteMatch: (matchId: string) => {
        dispatch({ type: 'deleteMatch', matchId });
        if (stateRef.current.activeMatchId === matchId) {
          updateCurrentMatchPointer(null);
        }
        if (auth.currentUser) {
          void deleteDoc(doc(firestore, 'matches', matchId)).catch(() => {});
        }
      },
      saveMatchLineups: (
        matchId: string,
        lineups: { home: PlayerSlot[]; away: PlayerSlot[] },
        benches: { home: PlayerSlot[]; away: PlayerSlot[] },
      ) => dispatch({ type: 'saveMatchLineups', matchId, lineups, benches }),
      selectMatch: (matchId: string | null) => {
        dispatch({ type: 'selectMatch', matchId });
        updateCurrentMatchPointer(matchId);
      },
    }),
    [],
  );

  const value = useMemo(() => ({ state, actions }), [state, actions]);

  return <DemoStoreContext.Provider value={value}>{children}</DemoStoreContext.Provider>;
}

export function useDemoStore() {
  const ctx = useContext(DemoStoreContext);
  if (!ctx) {
    throw new Error('DemoStoreProvider가 설정되지 않았습니다.');
  }
  return ctx;
}

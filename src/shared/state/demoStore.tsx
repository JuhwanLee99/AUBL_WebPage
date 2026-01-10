import { createContext, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import { MATCHES } from '../lib/mockData';

type Half = 'top' | 'bottom';

type Bases = (string | null)[];

type Side = 'home' | 'away';
interface PlayerSlot {
  name: string;
  pos: string;
  number: string;
  throws: string;
  bats: string;
}

export interface PlayLog {
  inning: number;
  half: Half;
  order: number;
  batter: string;
  pitch: number;
  result: string;
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
  homeTeamId: string;
  awayTeamId: string;
  batterIndex: { home: number; away: number };
  lineups: { home: PlayerSlot[]; away: PlayerSlot[] };
  benches: { home: PlayerSlot[]; away: PlayerSlot[] };
  teamNames: { home: string; away: string };
  gameOver: boolean;
  endedAt: string | null;
}

interface DemoState extends DemoSnapshot {
  history: DemoSnapshot[];
}

type Action =
  | { type: 'ball' }
  | { type: 'strike' }
  | { type: 'foul' }
  | { type: 'strikeOut' }
  | { type: 'out' }
  | { type: 'outWithMessage'; note: string }
  | { type: 'hit'; bases: 1 | 2 | 3 | 4 }
  | { type: 'walk' }
  | { type: 'hbp' }
  | { type: 'sac' }
  | { type: 'stealSuccess' }
  | { type: 'stealFail' }
  | { type: 'resetCount' }
  | { type: 'clearBases' }
  | { type: 'nextHalf' }
  | { type: 'setPlay'; message: string }
  | { type: 'runnerStealSuccess'; base: 0 | 1 | 2 }
  | { type: 'runnerCaught'; base: 0 | 1 | 2 }
  | { type: 'runnerPickoff'; base: 0 | 1 | 2 }
  | { type: 'runnerOut'; base: 0 | 1 | 2 }
  | { type: 'setTeamName'; side: Side; name: string }
  | { type: 'setLineup'; side: Side; index: number; updates: Partial<PlayerSlot> }
  | { type: 'addBench'; side: Side; player: PlayerSlot }
  | { type: 'substitute'; side: Side; benchIndex: number; lineupIndex: number }
  | { type: 'endGame'; endedAt: string }
  | { type: 'resetGame' }
  | { type: 'undo' }
  | { type: 'hydrate'; state: DemoState };

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

const initialState: DemoState = {
  inning: 1,
  half: 'top',
  balls: 0,
  strikes: 0,
  outs: 0,
  pitchCount: 0,
  bases: [null, null, null],
  score: { home: initialMatch?.homeScore ?? 0, away: initialMatch?.awayScore ?? 0 },
  lastPlay: '데모 세션 시작',
  feed: [
    {
      inning: 1,
      half: 'top',
      order: 1,
      batter: demoLineups.away[0]?.name ?? '타자',
      pitch: 0,
      result: '데모 세션 시작',
    },
  ],
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
  teamNames: { home: '삼성 라이온즈', away: '두산 베어스' },
  gameOver: false,
  endedAt: null,
  history: [],
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

function normalizeState(base: DemoState, incoming: DemoState): DemoState {
  const merged = { ...base, ...incoming } as DemoState;
  const feed = normalizeFeed(merged.feed, { inning: merged.inning, half: merged.half });
  const history = Array.isArray(merged.history)
    ? merged.history.map((snap) => ({
        ...base,
        ...snap,
        pitchCount: typeof snap.pitchCount === 'number' ? snap.pitchCount : 0,
        feed: normalizeFeed((snap as DemoSnapshot).feed, { inning: snap.inning, half: snap.half }),
        gameOver: Boolean((snap as DemoSnapshot).gameOver),
        endedAt: typeof (snap as DemoSnapshot).endedAt === 'string' ? (snap as DemoSnapshot).endedAt : null,
      }))
    : [];
  return {
    ...merged,
    pitchCount: merged.pitchCount ?? 0,
    feed,
    history,
    gameOver: Boolean(merged.gameOver),
    endedAt: typeof merged.endedAt === 'string' ? merged.endedAt : null,
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
    gameOver: boolean;
    endedAt: string | null;
  };
  score: DemoState['score'];
  counts: { balls: number; strikes: number; outs: number; pitchCount: number };
  bases: Bases;
  batterIndex: DemoState['batterIndex'];
  lineups: DemoState['lineups'];
  benches: DemoState['benches'];
  feed: PlayLog[];
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
    feed: state.feed.map((entry) => ({ ...entry })),
    lastPlay: state.lastPlay,
  };
}

function snapshotState(state: DemoState): DemoSnapshot {
  const { history, ...snapshot } = state;
  return snapshot;
}

function leadOffName(lineup: PlayerSlot[]) {
  const batting = lineup.filter((slot) => slot.pos.toUpperCase() !== 'P');
  const active = batting.length ? batting : lineup;
  return active[0]?.name ?? '타자';
}

function shouldTrackHistory(actionType: Action['type']) {
  return !['setTeamName', 'setLineup', 'addBench', 'substitute', 'hydrate', 'resetGame'].includes(actionType);
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
          feed: pushFeed(state.feed, createLogEntry(state, '볼', pitchCount)),
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
          feed: pushFeed(state.feed, createLogEntry(state, '스트라이크', pitchCount)),
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
          feed: pushFeed(state.feed, createLogEntry(state, '파울', pitchCount)),
        };
      } else {
        const pitchCount = state.pitchCount + 1;
        nextState = {
          ...state,
          strikes: state.strikes + 1,
          pitchCount,
          lastPlay: '파울',
          feed: pushFeed(state.feed, createLogEntry(state, '파울', pitchCount)),
        };
      }
      break;
    case 'strikeOut':
      nextState = applyOut(state, '삼진', { pitchNumber: state.pitchCount + 1 });
      break;
    case 'out':
      nextState = applyOut(state, '아웃', { pitchNumber: state.pitchCount + 1 });
      break;
    case 'outWithMessage':
      nextState = applyOut(state, action.note, { pitchNumber: state.pitchCount + 1 });
      break;
    case 'hit':
      nextState = applyHit(state, action.bases, state.pitchCount + 1);
      break;
    case 'walk':
      nextState = applyWalk(state, '볼넷', state.pitchCount + 1);
      break;
    case 'hbp':
      nextState = applyWalk(state, '몸에 맞는 공', state.pitchCount + 1);
      break;
    case 'sac':
      nextState = applySacrifice(state, state.pitchCount + 1);
      break;
    case 'stealSuccess':
      nextState = applySteal(state, true);
      break;
    case 'stealFail':
      nextState = applySteal(state, false);
      break;
    case 'resetCount':
      nextState = {
        ...state,
        balls: 0,
        strikes: 0,
        pitchCount: 0,
        lastPlay: '카운트 리셋',
        feed: pushFeed(state.feed, createLogEntry(state, '카운트 리셋', 0)),
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
    case 'nextHalf':
      nextState = changeHalf(state, '이닝 전환');
      break;
    case 'setPlay':
      nextState = { ...state, lastPlay: action.message, feed: pushFeed(state.feed, createLogEntry(state, action.message, 0)) };
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
    case 'substitute':
      nextState = substitutePlayer(state, action.side, action.benchIndex, action.lineupIndex);
      break;
    case 'endGame':
      nextState = applyEndGame(state, action.endedAt);
      break;
    case 'resetGame':
      nextState = createNewGame(state);
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

function baseLabel(idx: number) {
  return idx >= 3 ? '홈' : `${idx + 1}루`;
}

function formatRunnerMove(runner: string, from: number, to: number, scored: boolean, baseMessage: string, outsCount?: number) {
  const move = `${baseLabel(from)}→${baseLabel(to)}`;
  const scoredText = scored ? ' · 득점' : '';
  const feedText = `${baseMessage} · ${runner} ${move}${scoredText}`;
  const outText = outsCount && baseMessage.includes('아웃') ? ` · ${outsCount}아웃` : '';
  const lastPlay = `${feedText}${outText}`;
  return { feedText, lastPlay };
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

function hittingSide(state: DemoState) {
  return state.half === 'top' ? 'away' : 'home';
}

function applyOut(
  state: DemoState,
  message: string,
  options?: { advanceBatter?: boolean; pitchNumber?: number },
): DemoState {
  const outs = state.outs + 1;
  const advanceBatter = options?.advanceBatter ?? true;
  const pitchNumber = options?.pitchNumber ?? Math.max(1, state.pitchCount + 1);
  const resetCounts = { balls: 0, strikes: 0 };
  const batterIndex = advanceBatter ? nextBatter(state).batterIndex : state.batterIndex;
  const pitchCount = advanceBatter ? 0 : state.pitchCount;
  const logResult = `${message} (${outs} 아웃)`;
  if (outs >= 3) {
    const finalMessage = `${message} · 3아웃 · 이닝 종료`;
    return changeHalf({ ...state, batterIndex, pitchCount }, finalMessage, advanceBatter ? pitchNumber : 0, state);
  }
  return {
    ...state,
    outs,
    ...resetCounts,
    batterIndex,
    pitchCount,
    lastPlay: message,
    feed: pushFeed(state.feed, createLogEntry(state, logResult, advanceBatter ? pitchNumber : 0)),
  };
}

function applyHit(state: DemoState, basesToAdvance: 1 | 2 | 3 | 4, pitchNumber: number): DemoState {
  const { batterName, batterIndex } = nextBatter(state);
  const { bases, runs } = advanceBases(state.bases, basesToAdvance, batterName);
  const side = hittingSide(state);
  const score =
    side === 'home'
      ? { ...state.score, home: state.score.home + runs }
      : { ...state.score, away: state.score.away + runs };
  const result = basesToAdvance === 4 ? '홈런' : `${basesToAdvance}루타`;
  const message = `${result} · ${batterName}`;
  return {
    ...state,
    bases,
    score,
    balls: 0,
    strikes: 0,
    pitchCount: 0,
    batterIndex,
    lastPlay: message,
    feed: pushFeed(state.feed, createLogEntry(state, runs ? `${result} · ${runs}득점` : result, pitchNumber)),
  };
}

function applyWalk(state: DemoState, message: string, pitchNumber: number): DemoState {
  const { batterName, batterIndex } = nextBatter(state);
  const { bases, runs } = advanceBases(state.bases, 1, batterName);
  const side = hittingSide(state);
  const score =
    side === 'home'
      ? { ...state.score, home: state.score.home + runs }
      : { ...state.score, away: state.score.away + runs };
  return {
    ...state,
    bases,
    score,
    balls: 0,
    strikes: 0,
    pitchCount: 0,
    batterIndex,
    lastPlay: `${message} · ${batterName}`,
    feed: pushFeed(state.feed, createLogEntry(state, runs ? `${message} · ${runs}득점` : message, pitchNumber)),
  };
}

function applySacrifice(state: DemoState, pitchNumber: number): DemoState {
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
  const newState = applyOut(
    { ...state, bases, score },
    runs ? `희생플라이 · ${runs}득점` : '희생플라이',
    { pitchNumber },
  );
  return newState;
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
    const detail = formatRunnerMove(runner, foundIndex ?? 0, foundIndex ?? 0, false, '도루 실패 아웃', state.outs + 1);
    const afterOut = applyOut({ ...state, bases }, detail.feedText, { advanceBatter: false, pitchNumber: 0 });
    return { ...afterOut, lastPlay: detail.lastPlay };
  }
  let runs = 0;
  const bases = [...state.bases] as Bases;
  let moved: { name: string; from: number; to: number; scored: boolean } | null = null;
  for (let i = 2; i >= 0; i -= 1) {
    if (bases[i]) {
      const runner = bases[i];
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
  }
  const side = hittingSide(state);
  const score =
    side === 'home'
      ? { ...state.score, home: state.score.home + runs }
      : { ...state.score, away: state.score.away + runs };
  const detail = moved ? formatRunnerMove(moved.name, moved.from, moved.to, moved.scored, '도루 성공') : null;
  return {
    ...state,
    bases,
    score,
    balls: 0,
    strikes: 0,
    pitchCount: 0,
    lastPlay: detail?.lastPlay ?? (runs ? `도루 성공 · ${runs}득점` : '도루 성공'),
    feed: pushFeed(state.feed, createLogEntry(state, detail?.feedText ?? (runs ? `도루 성공 · ${runs}득점` : '도루 성공'), 0)),
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
  const detail = formatRunnerMove(runner, baseIndex, dest, runs > 0, message);
  return {
    ...state,
    bases,
    score,
    lastPlay: detail.lastPlay,
    feed: pushFeed(state.feed, createLogEntry(state, detail.feedText, 0)),
  };
}

function applyRunnerOut(state: DemoState, baseIndex: 0 | 1 | 2, message: string): DemoState {
  const bases = [...state.bases] as Bases;
  if (!bases[baseIndex]) return state;
  const runner = bases[baseIndex];
  bases[baseIndex] = null;
  const outs = state.outs + 1;
  const detail = formatRunnerMove(runner ?? '주자', baseIndex, baseIndex, false, `${message}`, outs);
  if (outs >= 3) {
    const finalMessage = `${detail.lastPlay} · 이닝 종료`;
    return changeHalf({ ...state, bases, outs }, finalMessage, state.pitchCount, state);
  }
  return {
    ...state,
    bases,
    outs,
    lastPlay: detail.lastPlay,
    pitchCount: state.pitchCount,
    feed: pushFeed(state.feed, createLogEntry(state, detail.feedText, 0)),
  };
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

function createNewGame(state: DemoState): DemoState {
  const awayBatter = leadOffName(state.lineups.away);
  return {
    inning: 1,
    half: 'top',
    balls: 0,
    strikes: 0,
    outs: 0,
    pitchCount: 0,
    bases: [null, null, null],
    score: { home: 0, away: 0 },
    lastPlay: '새 경기 시작',
    feed: [
      {
        inning: 1,
        half: 'top',
        order: 1,
        batter: awayBatter,
        pitch: 0,
        result: '새 경기 시작',
      },
    ],
    homeTeamId: state.homeTeamId,
    awayTeamId: state.awayTeamId,
    batterIndex: { home: 0, away: 0 },
    lineups: {
      home: state.lineups.home.map((p) => ({ ...p })),
      away: state.lineups.away.map((p) => ({ ...p })),
    },
    benches: {
      home: state.benches.home.map((p) => ({ ...p })),
      away: state.benches.away.map((p) => ({ ...p })),
    },
    teamNames: { ...state.teamNames },
    gameOver: false,
    endedAt: null,
    history: [],
  };
}

function changeHalf(state: DemoState, message: string, pitchNumber = 0, logState?: DemoState): DemoState {
  const nextHalf: Half = state.half === 'top' ? 'bottom' : 'top';
  const nextInning = nextHalf === 'top' ? state.inning + 1 : state.inning;
  const logSource = logState ?? state;
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
    feed: pushFeed(state.feed, createLogEntry(logSource, message, pitchNumber)),
  };
}

function advanceBases(currentBases: Bases, steps: number, batterName: string) {
  let runs = 0;
  const bases = [...currentBases] as Bases;

  for (let i = 2; i >= 0; i -= 1) {
    if (bases[i]) {
      const runner = bases[i];
      bases[i] = null;
      const dest = i + steps;
      if (dest >= 3) {
        runs += 1;
      } else {
        bases[dest] = runner;
      }
    }
  }

  if (steps >= 4) {
    runs += 1;
  } else {
    const dest = steps - 1;
    if (dest >= 3) {
      runs += 1;
    } else {
      bases[dest] = batterName;
    }
  }

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
  lineup[lineupIndex] = benchPlayer;
  bench.splice(benchIndex, 1);
  if (outgoing) {
    bench.push(outgoing);
  }
  return {
    ...state,
    lineups: { ...state.lineups, [side]: lineup },
    benches: { ...state.benches, [side]: bench },
  };
}

interface DemoStoreValue {
  state: DemoState;
  actions: {
    addBall: () => void;
    addStrike: () => void;
    addFoul: () => void;
    strikeOut: () => void;
    addOut: () => void;
    hitSingle: () => void;
    hitDouble: () => void;
    hitTriple: () => void;
    homeRun: () => void;
    walk: () => void;
    hbp: () => void;
    sacFly: () => void;
    stealSuccess: () => void;
    stealFail: () => void;
    resetCount: () => void;
    clearBases: () => void;
    nextHalf: () => void;
    runnerStealSuccess: (base: 0 | 1 | 2) => void;
    runnerCaught: (base: 0 | 1 | 2) => void;
    runnerPickoff: (base: 0 | 1 | 2) => void;
    runnerOut: (base: 0 | 1 | 2) => void;
    setTeamName: (side: Side, name: string) => void;
    setLineup: (side: Side, index: number, updates: Partial<PlayerSlot>) => void;
    addBench: (side: Side, player: PlayerSlot) => void;
    substitute: (side: Side, benchIndex: number, lineupIndex: number) => void;
    setPlay: (message: string) => void;
    endGame: (endedAt: string) => void;
    resetGame: () => void;
    undo: () => void;
    addOutWithMessage: (note: string) => void;
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

  const actions = useMemo(
    () => ({
      addBall: () => dispatch({ type: 'ball' }),
      addStrike: () => dispatch({ type: 'strike' }),
      addFoul: () => dispatch({ type: 'foul' }),
      strikeOut: () => dispatch({ type: 'strikeOut' }),
      addOut: () => dispatch({ type: 'out' }),
      hitSingle: () => dispatch({ type: 'hit', bases: 1 }),
      hitDouble: () => dispatch({ type: 'hit', bases: 2 }),
      hitTriple: () => dispatch({ type: 'hit', bases: 3 }),
      homeRun: () => dispatch({ type: 'hit', bases: 4 }),
      walk: () => dispatch({ type: 'walk' }),
      hbp: () => dispatch({ type: 'hbp' }),
      sacFly: () => dispatch({ type: 'sac' }),
      stealSuccess: () => dispatch({ type: 'stealSuccess' }),
      stealFail: () => dispatch({ type: 'stealFail' }),
      resetCount: () => dispatch({ type: 'resetCount' }),
      clearBases: () => dispatch({ type: 'clearBases' }),
      nextHalf: () => dispatch({ type: 'nextHalf' }),
      runnerStealSuccess: (base: 0 | 1 | 2) => dispatch({ type: 'runnerStealSuccess', base }),
      runnerCaught: (base: 0 | 1 | 2) => dispatch({ type: 'runnerCaught', base }),
      runnerPickoff: (base: 0 | 1 | 2) => dispatch({ type: 'runnerPickoff', base }),
      runnerOut: (base: 0 | 1 | 2) => dispatch({ type: 'runnerOut', base }),
      addOutWithMessage: (note: string) => dispatch({ type: 'outWithMessage', note }),
      setTeamName: (side: Side, name: string) => dispatch({ type: 'setTeamName', side, name }),
      setLineup: (side: Side, index: number, updates: Partial<PlayerSlot>) =>
        dispatch({ type: 'setLineup', side, index, updates }),
      addBench: (side: Side, player: PlayerSlot) => dispatch({ type: 'addBench', side, player }),
      substitute: (side: Side, benchIndex: number, lineupIndex: number) =>
        dispatch({ type: 'substitute', side, benchIndex, lineupIndex }),
      setPlay: (message: string) => dispatch({ type: 'setPlay', message }),
      endGame: (endedAt: string) => dispatch({ type: 'endGame', endedAt }),
      resetGame: () => dispatch({ type: 'resetGame' }),
      undo: () => dispatch({ type: 'undo' }),
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

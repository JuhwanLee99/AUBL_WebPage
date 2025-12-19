import { createContext, useContext, useMemo, useReducer } from 'react';
import { MATCHES } from '../lib/mockData';

type Half = 'top' | 'bottom';

interface DemoState {
  inning: number;
  half: Half;
  balls: number;
  strikes: number;
  outs: number;
  bases: boolean[]; // [1B, 2B, 3B]
  score: { home: number; away: number };
  lastPlay: string;
  feed: string[];
  homeTeamId: string;
  awayTeamId: string;
}

type Action =
  | { type: 'ball' }
  | { type: 'strike' }
  | { type: 'foul' }
  | { type: 'out' }
  | { type: 'hit'; bases: 1 | 2 | 3 | 4 }
  | { type: 'walk' }
  | { type: 'hbp' }
  | { type: 'sac' }
  | { type: 'stealSuccess' }
  | { type: 'stealFail' }
  | { type: 'resetCount' }
  | { type: 'clearBases' }
  | { type: 'nextHalf' }
  | { type: 'setPlay'; message: string };

const initialMatch = MATCHES[0];

const initialState: DemoState = {
  inning: 1,
  half: 'top',
  balls: 0,
  strikes: 0,
  outs: 0,
  bases: [false, false, false],
  score: { home: initialMatch?.homeScore ?? 0, away: initialMatch?.awayScore ?? 0 },
  lastPlay: '데모 세션 시작',
  feed: ['데모 세션 시작'],
  homeTeamId: initialMatch?.homeTeamId ?? 'home',
  awayTeamId: initialMatch?.awayTeamId ?? 'away',
};

function reducer(state: DemoState, action: Action): DemoState {
  switch (action.type) {
    case 'ball':
      if (state.balls >= 3) {
        return applyWalk(state, '볼넷');
      }
      return { ...state, balls: state.balls + 1, lastPlay: '볼', feed: pushFeed(state.feed, '볼') };
    case 'strike':
      if (state.strikes >= 2) {
        return applyOut(state, '삼진');
      }
      return { ...state, strikes: state.strikes + 1, lastPlay: '스트라이크', feed: pushFeed(state.feed, '스트라이크') };
    case 'foul':
      if (state.strikes >= 2) {
        return { ...state, lastPlay: '파울', feed: pushFeed(state.feed, '파울') };
      }
      return { ...state, strikes: state.strikes + 1, lastPlay: '파울', feed: pushFeed(state.feed, '파울') };
    case 'out':
      return applyOut(state, '아웃');
    case 'hit':
      return applyHit(state, action.bases);
    case 'walk':
      return applyWalk(state, '볼넷');
    case 'hbp':
      return applyWalk(state, '몸에 맞는 공');
    case 'sac':
      return applySacrifice(state);
    case 'stealSuccess':
      return applySteal(state, true);
    case 'stealFail':
      return applySteal(state, false);
    case 'resetCount':
      return { ...state, balls: 0, strikes: 0, lastPlay: '카운트 리셋', feed: pushFeed(state.feed, '카운트 리셋') };
    case 'clearBases':
      return { ...state, bases: [false, false, false], lastPlay: '주자 모두 귀환', feed: pushFeed(state.feed, '주자 모두 귀환') };
    case 'nextHalf':
      return changeHalf(state, '이닝 전환');
    case 'setPlay':
      return { ...state, lastPlay: action.message, feed: pushFeed(state.feed, action.message) };
    default:
      return state;
  }
}

function pushFeed(feed: string[], message: string) {
  return [message, ...feed].slice(0, 8);
}

function hittingSide(state: DemoState) {
  return state.half === 'top' ? 'away' : 'home';
}

function applyOut(state: DemoState, message: string): DemoState {
  const outs = state.outs + 1;
  const resetCounts = { balls: 0, strikes: 0 };
  if (outs >= 3) {
    return changeHalf(state, `${message} · 3아웃`);
  }
  return {
    ...state,
    outs,
    ...resetCounts,
    lastPlay: message,
    feed: pushFeed(state.feed, `${message} (${outs} 아웃)`),
  };
}

function applyHit(state: DemoState, basesToAdvance: 1 | 2 | 3 | 4): DemoState {
  const { bases, runs } = advanceBases(state.bases, basesToAdvance, true);
  const side = hittingSide(state);
  const score = side === 'home'
    ? { ...state.score, home: state.score.home + runs }
    : { ...state.score, away: state.score.away + runs };
  const message = basesToAdvance === 4 ? '홈런' : `${basesToAdvance}루타`;
  return {
    ...state,
    bases,
    score,
    balls: 0,
    strikes: 0,
    lastPlay: message,
    feed: pushFeed(state.feed, `${message} · ${runs}득점`),
  };
}

function applyWalk(state: DemoState, message: string): DemoState {
  const { bases, runs } = advanceBases(state.bases, 1, true);
  const side = hittingSide(state);
  const score = side === 'home'
    ? { ...state.score, home: state.score.home + runs }
    : { ...state.score, away: state.score.away + runs };
  return {
    ...state,
    bases,
    score,
    balls: 0,
    strikes: 0,
    lastPlay: message,
    feed: pushFeed(state.feed, `${message} · ${runs ? `${runs}득점` : '주자 진루'}`),
  };
}

function applySacrifice(state: DemoState): DemoState {
  let runs = 0;
  const bases = [...state.bases];
  if (bases[2]) {
    runs += 1;
    bases[2] = false;
  }
  const newState = applyOut(
    { ...state, bases, score: state.score },
    runs ? `희생플라이 · ${runs}득점` : '희생플라이',
  );
  const side = hittingSide(state);
  const score = side === 'home'
    ? { ...newState.score, home: newState.score.home + runs }
    : { ...newState.score, away: newState.score.away + runs };
  return { ...newState, score };
}

function applySteal(state: DemoState, success: boolean): DemoState {
  if (!state.bases.some(Boolean)) {
    return { ...state, lastPlay: success ? '도루 시도 (주자 없음)' : '도루 실패 (주자 없음)', feed: pushFeed(state.feed, '주자 없음') };
  }
  if (!success) {
    const bases = [...state.bases];
    for (let i = 2; i >= 0; i -= 1) {
      if (bases[i]) {
        bases[i] = false;
        break;
      }
    }
    const afterOut = applyOut({ ...state, bases }, '도루 실패 아웃');
    return { ...afterOut, lastPlay: '도루 실패 아웃' };
  }
  let runs = 0;
  const bases = [...state.bases];
  for (let i = 2; i >= 0; i -= 1) {
    if (bases[i]) {
      bases[i] = false;
      const dest = i + 1;
      if (dest >= 3) {
        runs += 1;
      } else {
        bases[dest] = true;
      }
      break;
    }
  }
  const side = hittingSide(state);
  const score = side === 'home'
    ? { ...state.score, home: state.score.home + runs }
    : { ...state.score, away: state.score.away + runs };
  return {
    ...state,
    bases,
    score,
    balls: 0,
    strikes: 0,
    lastPlay: runs ? `도루 성공 · ${runs}득점` : '도루 성공',
    feed: pushFeed(state.feed, runs ? `도루 성공 · ${runs}득점` : '도루 성공'),
  };
}

function changeHalf(state: DemoState, message: string): DemoState {
  const nextHalf: Half = state.half === 'top' ? 'bottom' : 'top';
  const nextInning = nextHalf === 'top' ? state.inning + 1 : state.inning;
  return {
    ...state,
    inning: nextInning,
    half: nextHalf,
    outs: 0,
    balls: 0,
    strikes: 0,
    bases: [false, false, false],
    lastPlay: message,
    feed: pushFeed(state.feed, message),
  };
}

function advanceBases(currentBases: boolean[], steps: number, includeBatter: boolean) {
  let runs = 0;
  const bases = [...currentBases];

  for (let i = 2; i >= 0; i -= 1) {
    if (bases[i]) {
      bases[i] = false;
      const dest = i + steps;
      if (dest >= 3) {
        runs += 1;
      } else {
        bases[dest] = true;
      }
    }
  }

  if (includeBatter) {
    if (steps >= 4) {
      runs += 1;
    } else {
      const dest = steps - 1;
      if (dest >= 3) {
        runs += 1;
      } else {
        bases[dest] = true;
      }
    }
  }

  return { bases, runs };
}

interface DemoStoreValue {
  state: DemoState;
  actions: {
    addBall: () => void;
    addStrike: () => void;
    addFoul: () => void;
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
  };
}

const DemoStoreContext = createContext<DemoStoreValue | null>(null);

export function DemoStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const actions = useMemo(
    () => ({
      addBall: () => dispatch({ type: 'ball' }),
      addStrike: () => dispatch({ type: 'strike' }),
      addFoul: () => dispatch({ type: 'foul' }),
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

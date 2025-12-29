import { createContext, useContext, useMemo, useReducer } from 'react';
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

interface DemoSnapshot {
  inning: number;
  half: Half;
  balls: number;
  strikes: number;
  outs: number;
  bases: Bases; // [1B, 2B, 3B] occupant name
  score: { home: number; away: number };
  lastPlay: string;
  feed: string[];
  homeTeamId: string;
  awayTeamId: string;
  batterIndex: { home: number; away: number };
  lineups: { home: PlayerSlot[]; away: PlayerSlot[] };
  benches: { home: PlayerSlot[]; away: PlayerSlot[] };
  teamNames: { home: string; away: string };
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
  | { type: 'runnerOut'; base: 0 | 1 | 2 }
  | { type: 'setTeamName'; side: Side; name: string }
  | { type: 'setLineup'; side: Side; index: number; updates: Partial<PlayerSlot> }
  | { type: 'addBench'; side: Side; player: PlayerSlot }
  | { type: 'substitute'; side: Side; benchIndex: number; lineupIndex: number }
  | { type: 'undo' };

const initialMatch = MATCHES[0];
const demoLineups: { home: PlayerSlot[]; away: PlayerSlot[] } = {
  home: [
    { name: '박해민', pos: 'CF', number: '17', throws: 'R', bats: 'L' },
    { name: '문성주', pos: 'LF', number: '2', throws: 'R', bats: 'L' },
    { name: '홍창기', pos: 'RF', number: '51', throws: 'R', bats: 'L' },
    { name: '오스틴', pos: '1B', number: '23', throws: 'R', bats: 'R' },
    { name: '오지환', pos: 'SS', number: '10', throws: 'R', bats: 'L' },
    { name: '문보경', pos: '3B', number: '9', throws: 'R', bats: 'L' },
    { name: '박동원', pos: 'C', number: '27', throws: 'R', bats: 'R' },
    { name: '김현수', pos: 'DH', number: '22', throws: 'R', bats: 'L' },
    { name: '신민재', pos: '2B', number: '4', throws: 'R', bats: 'L' },
    { name: '임찬규', pos: 'P', number: '1', throws: 'R', bats: 'R' },
  ],
  away: [
    { name: '박해민', pos: 'CF', number: '17', throws: 'R', bats: 'L' },
    { name: '문상주', pos: 'LF', number: '12', throws: 'R', bats: 'L' },
    { name: '황창기', pos: 'RF', number: '52', throws: 'R', bats: 'L' },
    { name: '오스틴', pos: '1B', number: '23', throws: 'R', bats: 'R' },
    { name: '오지환', pos: 'SS', number: '10', throws: 'R', bats: 'L' },
    { name: '문보경', pos: '3B', number: '9', throws: 'R', bats: 'L' },
    { name: '박동원', pos: 'C', number: '27', throws: 'R', bats: 'R' },
    { name: '김현수', pos: 'DH', number: '22', throws: 'R', bats: 'L' },
    { name: '신민재', pos: '2B', number: '4', throws: 'R', bats: 'L' },
    { name: '양현종', pos: 'P', number: '54', throws: 'L', bats: 'L' },
  ],
};

const initialState: DemoState = {
  inning: 1,
  half: 'top',
  balls: 0,
  strikes: 0,
  outs: 0,
  bases: [null, null, null],
  score: { home: initialMatch?.homeScore ?? 0, away: initialMatch?.awayScore ?? 0 },
  lastPlay: '데모 세션 시작',
  feed: ['데모 세션 시작'],
  homeTeamId: initialMatch?.homeTeamId ?? 'home',
  awayTeamId: initialMatch?.awayTeamId ?? 'away',
  batterIndex: { home: 0, away: 0 },
  lineups: demoLineups,
  benches: {
    home: [
      { name: '이재원', pos: 'PH', number: '33', throws: 'R', bats: 'R' },
      { name: '채은성', pos: 'RF', number: '32', throws: 'R', bats: 'R' },
    ],
    away: [
      { name: '김호령', pos: 'CF', number: '25', throws: 'R', bats: 'R' },
      { name: '박정우', pos: 'C', number: '47', throws: 'R', bats: 'R' },
    ],
  },
  teamNames: { home: 'HOME', away: 'AWAY' },
  history: [],
};

function snapshotState(state: DemoState): DemoSnapshot {
  const { history, ...snapshot } = state;
  return snapshot;
}

function shouldTrackHistory(actionType: Action['type']) {
  return !['setTeamName', 'setLineup', 'addBench', 'substitute'].includes(actionType);
}

function reducer(state: DemoState, action: Action): DemoState {
  if (action.type === 'undo') {
    if (!state.history.length) return state;
    const previous = state.history[state.history.length - 1];
    return { ...previous, history: state.history.slice(0, -1) };
  }

  const snapshot = snapshotState(state);
  let nextState = state;

  switch (action.type) {
    case 'ball':
      nextState =
        state.balls >= 3 ? applyWalk(state, '볼넷') : { ...state, balls: state.balls + 1, lastPlay: '볼', feed: pushFeed(state.feed, '볼') };
      break;
    case 'strike':
      nextState =
        state.strikes >= 2
          ? applyOut(state, '삼진')
          : { ...state, strikes: state.strikes + 1, lastPlay: '스트라이크', feed: pushFeed(state.feed, '스트라이크') };
      break;
    case 'foul':
      nextState =
        state.strikes >= 2
          ? { ...state, lastPlay: '파울', feed: pushFeed(state.feed, '파울') }
          : { ...state, strikes: state.strikes + 1, lastPlay: '파울', feed: pushFeed(state.feed, '파울') };
      break;
    case 'strikeOut':
      nextState = applyOut(state, '삼진');
      break;
    case 'out':
      nextState = applyOut(state, '아웃');
      break;
    case 'hit':
      nextState = applyHit(state, action.bases);
      break;
    case 'walk':
      nextState = applyWalk(state, '볼넷');
      break;
    case 'hbp':
      nextState = applyWalk(state, '몸에 맞는 공');
      break;
    case 'sac':
      nextState = applySacrifice(state);
      break;
    case 'stealSuccess':
      nextState = applySteal(state, true);
      break;
    case 'stealFail':
      nextState = applySteal(state, false);
      break;
    case 'resetCount':
      nextState = { ...state, balls: 0, strikes: 0, lastPlay: '카운트 리셋', feed: pushFeed(state.feed, '카운트 리셋') };
      break;
    case 'clearBases':
      nextState = { ...state, bases: [null, null, null], lastPlay: '주자 모두 귀환', feed: pushFeed(state.feed, '주자 모두 귀환') };
      break;
    case 'nextHalf':
      nextState = changeHalf(state, '이닝 전환');
      break;
    case 'setPlay':
      nextState = { ...state, lastPlay: action.message, feed: pushFeed(state.feed, action.message) };
      break;
    case 'runnerStealSuccess':
      nextState = applyRunnerAdvance(state, action.base, 1, '도루 성공');
      break;
    case 'runnerCaught':
      nextState = applyRunnerOut(state, action.base, '도루자 아웃');
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
    default:
      nextState = state;
  }

  if (nextState === state) return state;
  if (!shouldTrackHistory(action.type)) return nextState;
  return { ...nextState, history: [...state.history, snapshot] };
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
  const { batterName, batterIndex } = nextBatter(state);
  const { bases, runs } = advanceBases(state.bases, basesToAdvance, batterName);
  const side = hittingSide(state);
  const score =
    side === 'home'
      ? { ...state.score, home: state.score.home + runs }
      : { ...state.score, away: state.score.away + runs };
  const message = basesToAdvance === 4 ? `홈런 · ${batterName}` : `${basesToAdvance}루타 · ${batterName}`;
  return {
    ...state,
    bases,
    score,
    balls: 0,
    strikes: 0,
    batterIndex,
    lastPlay: message,
    feed: pushFeed(state.feed, `${message} · ${runs}득점`),
  };
}

function applyWalk(state: DemoState, message: string): DemoState {
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
    batterIndex,
    lastPlay: `${message} · ${batterName}`,
    feed: pushFeed(state.feed, `${message} · ${runs ? `${runs}득점` : '주자 진루'}`),
  };
}

function applySacrifice(state: DemoState): DemoState {
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
  );
  return newState;
}

function applySteal(state: DemoState, success: boolean): DemoState {
  if (!state.bases.some(Boolean)) {
    return { ...state, lastPlay: success ? '도루 시도 (주자 없음)' : '도루 실패 (주자 없음)', feed: pushFeed(state.feed, '주자 없음') };
  }
  if (!success) {
    const bases = [...state.bases] as Bases;
    for (let i = 2; i >= 0; i -= 1) {
      if (bases[i]) {
        bases[i] = null;
        break;
      }
    }
    const afterOut = applyOut({ ...state, bases }, '도루 실패 아웃');
    return { ...afterOut, lastPlay: '도루 실패 아웃' };
  }
  let runs = 0;
  const bases = [...state.bases] as Bases;
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
      break;
    }
  }
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
    lastPlay: runs ? `도루 성공 · ${runs}득점` : '도루 성공',
    feed: pushFeed(state.feed, runs ? `도루 성공 · ${runs}득점` : '도루 성공'),
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
  return {
    ...state,
    bases,
    score,
    lastPlay: runs ? `${message} · 득점` : message,
    feed: pushFeed(state.feed, runs ? `${message} · 득점` : message),
  };
}

function applyRunnerOut(state: DemoState, baseIndex: 0 | 1 | 2, message: string): DemoState {
  const bases = [...state.bases] as Bases;
  if (!bases[baseIndex]) return state;
  bases[baseIndex] = null;
  const outs = state.outs + 1;
  const resetCounts = { balls: 0, strikes: 0 };
  if (outs >= 3) {
    return changeHalf({ ...state, bases, outs, ...resetCounts }, `${message} · 3아웃`);
  }
  return {
    ...state,
    bases,
    outs,
    ...resetCounts,
    lastPlay: message,
    feed: pushFeed(state.feed, message),
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
    bases: [null, null, null],
    lastPlay: message,
    feed: pushFeed(state.feed, message),
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
    runnerOut: (base: 0 | 1 | 2) => void;
    setTeamName: (side: Side, name: string) => void;
    setLineup: (side: Side, index: number, updates: Partial<PlayerSlot>) => void;
    addBench: (side: Side, player: PlayerSlot) => void;
    substitute: (side: Side, benchIndex: number, lineupIndex: number) => void;
    setPlay: (message: string) => void;
    undo: () => void;
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
      runnerOut: (base: 0 | 1 | 2) => dispatch({ type: 'runnerOut', base }),
      setTeamName: (side: Side, name: string) => dispatch({ type: 'setTeamName', side, name }),
      setLineup: (side: Side, index: number, updates: Partial<PlayerSlot>) =>
        dispatch({ type: 'setLineup', side, index, updates }),
      addBench: (side: Side, player: PlayerSlot) => dispatch({ type: 'addBench', side, player }),
      substitute: (side: Side, benchIndex: number, lineupIndex: number) =>
        dispatch({ type: 'substitute', side, benchIndex, lineupIndex }),
      setPlay: (message: string) => dispatch({ type: 'setPlay', message }),
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

import { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState, useCallback } from 'react';
import { getIdTokenResult, onIdTokenChanged } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  setDoc,
  writeBatch,
  getDocs,
} from 'firebase/firestore';
import { auth, firestore } from '../firebase/client';
import type { LeagueDivision } from '../types';
import {
  ADMIN_EMAILS,
  FEED_LIMIT,
  SCORER_LOCK_TTL_MS,
  TRASH_RETENTION_MS,
} from './demoStore.constants';
import { advanceBasesOnWalk, resolveAdvanceOutcome } from './demoStore.baseRunning';
import {
  addRunsToLineScore,
  formatUniqueName,
  getSpectatorFeedLimitForMatch,
  pruneUndefined,
} from './demoStore.helpers';
import {
  canPitcherBat,
  cloneBenches,
  cloneLineups,
  demoLineups,
  getBattingEntriesForLineup,
  getBattingOrder,
  hasActualPlayers,
  isDemoLineups,
  isPracticeMatch,
} from './demoStore.lineup';
import {
  normalizeEvents,
  normalizeFeed,
  normalizeRunArray,
} from './demoStore.normalize';
import {
  autoPurgeExpiredMatches,
  syncGameStateWrite,
  syncLiveScorePatch,
  syncScheduleMatchesWrite,
  syncOnlineViewerCount,
  syncPresenceHeartbeat,
  syncScorerLock,
  syncScorerLockHeartbeat,
  subscribeActiveMatchState,
  subscribeCurrentMatchPointer,
  subscribeFeedAndEvents,
  subscribeMatchesSnapshot,
} from './demoStore.effects';
import { useGameActions } from './demoStore.gameActions';
import { changeHalf as changeHalfState, nextBatter } from './demoStore.gameFlow';
import { buildGameRecord } from './demoStore.record';
import { createNewGame, resetGameForMatch, updateMatchSchedule } from './demoStore.reducerHelpers';
import { useScheduleActions } from './demoStore.scheduleActions';
import { normalizeState, shouldTrackHistory, snapshotState } from './demoStore.state';

export { canPitcherBat };
export { buildGameRecord };

type Half = 'top' | 'bottom';

type Bases = (string | null)[];

type Side = 'home' | 'away';
export interface PlayerSlot {
  name: string;
  pos: string;
  number: string;
  throws: string;
  bats: string;
  order?: number | null;
  // 오타니룰: 투수가 DH 역할을 하는 경우 true
  // 이 플래그가 true인 투수는 마운드에서 내려와도 타석에 계속 들어갈 수 있음
  isOhtaniRule?: boolean;
  // 교체 유형: 대수비, 대타, 대주자
  substitutionType?: '대수비' | '대타' | '대주자';
  // 선출(선수 출신): 고등학교 이상 대한야구소프트볼협회/스포츠지원포털 등록자
  // 한 경기 최대 2명, 투수/포수 불가
  isElite?: boolean;
}

export type PostGameLineScore = { innings: number[]; home: number[]; away: number[] };

export type PostGameTotals = {
  home: { runs: number; hits: number; errors: number; lob?: number };
  away: { runs: number; hits: number; errors: number; lob?: number };
};

// [수정] PostGameBatterLine 타입 정의에 세부 스탯 필드를 추가합니다.
export type PostGameBatterLine = {
  name: string;
  pos?: string;
  order?: number | null;
  slot?: string;
  innings?: (string | null | undefined)[];
  ab?: number;
  h?: number;
  rbi?: number;
  r?: number;
  sb?: number;
  avg?: number;
  seasonAvg?: number;
  // ▼▼▼ 추가된 필드 ▼▼▼
  pa?: number;      // 타석
  singles?: number; // 1루타
  doubles?: number; // 2루타
  triples?: number; // 3루타
  hr?: number;      // 홈런
  bb?: number;      // 볼넷
  hbp?: number;     // 사구
  so?: number;      // 삼진
  sac?: number;     // 희생타
  fc?: number;      // 야수선택
  // ▲▲▲ 추가된 필드 ▲▲▲
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
export type MatchRecordMode = 'official' | 'practice';

export interface MatchSchedule {
  id: string;
  homeTeamId?: string;
  awayTeamId?: string;
  homeTeamName: string;
  awayTeamName: string;
  startTime: string;
  venue: string;
  status: MatchStatus;
  recordMode?: MatchRecordMode;
  liveVideoUrl?: string;
  liveDelaySeconds?: number;
  division?: LeagueDivision; // 으뜸/버금 구분 (관리자 지정)
  homeScore?: number | null;
  awayScore?: number | null;
  lineupPublic?: boolean;
  lineups?: { home: PlayerSlot[]; away: PlayerSlot[] };
  benches?: { home: PlayerSlot[]; away: PlayerSlot[] };
  notes?: string;
  postGame?: PostGameRecord;
  deleted?: boolean;
  deletedAt?: number;
  purgeAt?: number;
  deletedBy?: string;
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
  // [수정] 정렬을 위해 생성 시간 필드 추가
  createdAt?: number;
  eventId?: string;
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
  strikeType?: 'swinging' | 'looking';
  rbi?: number;
  dpRoute?: number[];
  earnedRunsBy?: Record<string, number>;
  createdAt?: number;
  eventId?: string;
}

export interface DemoSnapshot {
  inning: number;
  half: Half;
  balls: number;
  strikes: number;
  outs: number;
  pitchCount: number;
  bases: Bases; // [1B, 2B, 3B] occupant name
  // 주자별 책임 투수 기록 (주자가 출루할 때의 투수, 득점 시 해당 투수에게 실점 부과)
  runnerResponsiblePitcher: { 0: string | null; 1: string | null; 2: string | null };
  score: { home: number; away: number };
  lineScore: { home: number[]; away: number[] };
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
  liveDelaySeconds: number;
  matches: MatchSchedule[];
  activeMatchId: string | null;
  scorerUid: string | null;
  scorerName: string | null;
  scorerEmail: string | null;
  scorerLockedAt: number | null;
  scorerRole: string | null;
  scorerPaused: boolean;
  followCurrent: boolean;
  gameLimitMinutes: number | null;
  gameStartTimestamp: number | null;
  gamePausedAt: number | null;
  gamePausedDuration: number;
  onlineViewerCount: number;
}

export interface DemoState extends DemoSnapshot {
  history: DemoSnapshot[];
}

export type SharedGameState = Pick<
  DemoSnapshot,
  | 'inning'
  | 'half'
  | 'balls'
  | 'strikes'
  | 'outs'
  | 'pitchCount'
  | 'bases'
  | 'score'
  | 'lineScore'
  | 'lastPlay'
  | 'homeTeamId'
  | 'awayTeamId'
  | 'batterIndex'
  | 'lineups'
  | 'benches'
  | 'teamNames'
  | 'gameStarted'
  | 'gameOver'
  | 'endedAt'
  | 'liveVideoUrl'
  | 'liveDelaySeconds'
  | 'activeMatchId'
  | 'scorerUid'
  | 'scorerName'
  | 'scorerEmail'
  | 'scorerLockedAt'
  | 'scorerRole'
  | 'scorerPaused'
  | 'followCurrent'
  | 'gameLimitMinutes'
  | 'gameStartTimestamp'
  | 'gamePausedAt'
  | 'gamePausedDuration'
> & { updatedAt?: number };

type Action =
  | { type: 'ball' }
  | { type: 'strike'; strikeType?: 'swinging' | 'looking' }
  | { type: 'foul'; isBunt?: boolean }
  | { type: 'strikeOut'; strikeType?: 'swinging' | 'looking' }
  | { type: 'droppedThirdStrike'; variant?: 'strikeout' | 'reach' | 'tag_out' | 'force_out'; strikeType?: 'swinging' | 'looking'; runnerOuts?: string[] }
  | { type: 'advanceRunners'; selections: RunnerAdvanceSelections; message: string; preserveLastPlay?: boolean }
  | { type: 'out'; battedBall?: BattedBallDetails | null }
  | { type: 'outWithMessage'; note: string; battedBall?: BattedBallDetails | null }
  | { type: 'doublePlay'; battedBall?: BattedBallDetails | null; selectedRunners?: number[]; route?: number[]; runnerAdvancements?: Record<number, number> }
  | { type: 'triplePlay'; battedBall?: BattedBallDetails | null; selectedRunners?: number[]; route?: number[]; runnerAdvancements?: Record<number, number> }
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
  | { type: 'multipleRunnersOut'; bases: number[]; label?: string }
  | { type: 'manualLog'; message: string }
  | { type: 'setTeamName'; side: Side; name: string }
  | { type: 'setLineup'; side: Side; index: number; updates: Partial<PlayerSlot> }
  | { type: 'removeLineupSlot'; side: Side; index: number }
  | { type: 'removePracticeBatter'; side: Side; battingOrderIndex: number }
  | { type: 'swapPositions'; side: Side; swaps: { index: number; newPos: string }[]; benchSwaps?: { index: number; newPos: string }[] }
  | { type: 'addBench'; side: Side; player: PlayerSlot }
  | { type: 'removeBench'; side: Side; benchIndex: number }
  | { type: 'substitute'; side: Side; benchIndex: number; lineupIndex: number; substitutionType?: '대수비' | '대타' | '대주자' }
  | { type: 'setLiveVideoUrl'; url: string }
  | { type: 'setLiveDelaySeconds'; seconds: number }
  | { type: 'startGame' }
  | { type: 'endGame'; endedAt: string }
  | { type: 'resetGame' }
  | { type: 'undo' }
  | { type: 'hydrate'; state: DemoState }
  | { type: 'addMatch'; match: MatchSchedule }
  | { type: 'updateMatch'; matchId: string; updates: Partial<MatchSchedule> }
  | { type: 'deleteMatch'; matchId: string }
  | { type: 'moveMatchToTrash'; matchId: string; entry: MatchSchedule }
  | { type: 'restoreMatch'; matchId: string }
  | { type: 'purgeTrash'; matchId: string }
  | { type: 'selectMatch'; matchId: string | null; followCurrent?: boolean }
  | { type: 'setMatches'; matches: MatchSchedule[] }
  | { type: 'syncActiveMatch'; matchId: string | null }
  | {
      type: 'saveMatchLineups';
      matchId: string;
      lineups: { home: PlayerSlot[]; away: PlayerSlot[] };
      benches: { home: PlayerSlot[]; away: PlayerSlot[] };
    }
  | { type: 'setFeed'; feed: PlayLog[] }
  | { type: 'setEvents'; events: PlayEvent[] }
  | { type: 'releaseLock' }
  | { type: 'resumeLock'; payload: { scorerUid: string; scorerName: string | null; scorerEmail: string | null; scorerRole: string | null; lockedAt: number } }
  | { type: 'setGameLimit'; minutes: number | null }
  | { type: 'pauseGameTimer' }
  | { type: 'resumeGameTimer' }
  | { type: 'setOnlineViewerCount'; count: number };

function isPracticeActiveMatch(state: DemoState) {
  if (!state.activeMatchId) return false;
  const activeMatch = state.matches.find((m) => m.id === state.activeMatchId);
  return isPracticeMatch(activeMatch);
}

const initialState: DemoState = {
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
  homeTeamId: 'home',
  awayTeamId: 'away',
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
  liveVideoUrl: '',
  liveDelaySeconds: 0,
  history: [],
  matches: [],
  activeMatchId: null,
  scorerUid: null,
  scorerName: null,
  scorerEmail: null,
  scorerLockedAt: null,
  scorerRole: null,
  scorerPaused: false,
  followCurrent: true,
  gameLimitMinutes: null,
  gameStartTimestamp: null,
  gamePausedAt: null,
  gamePausedDuration: 0,
  onlineViewerCount: 0,
};

function syncActiveMatchScore(nextState: DemoState): DemoState {
  const matchId = nextState.activeMatchId;
  if (!matchId) return nextState;

  const activeMatch = nextState.matches.find((m) => m.id === matchId);
  if (!activeMatch || activeMatch.status !== 'inProgress') return nextState;

  const needsSync =
    activeMatch.homeScore !== nextState.score.home || activeMatch.awayScore !== nextState.score.away;

  if (!needsSync) return nextState;

  return {
    ...nextState,
    matches: updateMatchSchedule(nextState.matches, matchId, {
      homeScore: nextState.score.home,
      awayScore: nextState.score.away,
    }),
  };
}

function isLockedByOther(state: DemoState): boolean {
  const owner = state.scorerUid;
  const current = auth.currentUser?.uid ?? null;
  const expired = !state.scorerLockedAt || Date.now() - state.scorerLockedAt > SCORER_LOCK_TTL_MS;
  if (!owner || expired) return false;
  if (!current) return true;
  return owner !== current;
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
    'removeLineupSlot',
    'removePracticeBatter',
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
    'releaseLock',
    'resumeLock',
    'setFeed',
    'setEvents',
  ];
  const lockBypass: Action['type'][] = ['selectMatch', 'setMatches', 'syncActiveMatch', 'hydrate', 'setFeed', 'setEvents'];
  if (isLockedByOther(state) && !lockBypass.includes(action.type)) {
    return state;
  }
  if (!state.gameStarted && !setupActions.includes(action.type)) {
    return state;
  }

  const snapshot = snapshotState(state);
  let nextState = state;

  switch (action.type) {
    case 'setFeed':
      return {
        ...state,
        feed: normalizeFeed(action.feed, { inning: state.inning, half: state.half }),
      };
    case 'setEvents':
      return {
        ...state,
        events: normalizeEvents(action.events, { inning: state.inning, half: state.half }),
      };
    case 'releaseLock':
      return {
        ...state,
        scorerUid: null,
        scorerName: null,
        scorerEmail: null,
        scorerLockedAt: null,
        scorerRole: null,
        scorerPaused: true,
        lastPlay: '*기록원* - 기록원이 자리를 비웠습니다',
        feed: pushFeed(state.feed, createLogEntryForBaserunning(state, '*기록원* - 기록원이 자리를 비웠습니다', state.pitchCount)),
      };
    case 'resumeLock':
      return {
        ...state,
        scorerUid: action.payload.scorerUid,
        scorerName: action.payload.scorerName,
        scorerEmail: action.payload.scorerEmail,
        scorerLockedAt: action.payload.lockedAt,
        scorerRole: action.payload.scorerRole,
        scorerPaused: false,
        lastPlay: '*기록원* - 기록원이 기록을 재개했습니다',
        feed: pushFeed(state.feed, createLogEntryForBaserunning(state, '*기록원* - 기록을 재개합니다', state.pitchCount)),
      };
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
    case 'strike': {
      const strikeLabel =
        action.strikeType === 'looking'
          ? '루킹 스트라이크'
          : action.strikeType === 'swinging'
            ? '헛스윙 스트라이크'
            : '스트라이크';
      if (state.strikes >= 2) {
        const strikeOutLabel = action.strikeType === 'looking' ? '삼진(루킹)' : '삼진';
        nextState = applyOut(state, strikeOutLabel, { pitchNumber: state.pitchCount + 1, strikeType: action.strikeType });
      } else {
        const pitchCount = state.pitchCount + 1;
        nextState = {
          ...state,
          strikes: state.strikes + 1,
          pitchCount,
          lastPlay: strikeLabel,
          feed: pushPlayFeed(state, createLogEntry(state, strikeLabel, pitchCount)),
        };
      }
      break;
    }
    case 'foul': {
      const isBuntFoul = action.isBunt === true;
      const foulLabel = isBuntFoul ? '번트 파울' : '파울';

      // 2스트라이크 + 번트 파울 = 쓰리번트 아웃
      if (state.strikes >= 2 && isBuntFoul) {
        nextState = applyOut(state, '쓰리번트 아웃', { pitchNumber: state.pitchCount + 1 });
      } else if (state.strikes >= 2) {
        // 2스트라이크에서 일반 파울: 스트라이크 카운트 유지
        const pitchCount = state.pitchCount + 1;
        nextState = {
          ...state,
          pitchCount,
          lastPlay: foulLabel,
          feed: pushPlayFeed(state, createLogEntry(state, foulLabel, pitchCount)),
        };
      } else {
        // 2스트라이크 미만: 스트라이크 카운트 +1
        const pitchCount = state.pitchCount + 1;
        nextState = {
          ...state,
          strikes: state.strikes + 1,
          pitchCount,
          lastPlay: foulLabel,
          feed: pushPlayFeed(state, createLogEntry(state, foulLabel, pitchCount)),
        };
      }
      break;
    }
    case 'strikeOut': {
      const strikeLabel = action.strikeType === 'looking' ? '삼진(루킹)' : '삼진';
      nextState = applyOut(state, strikeLabel, { pitchNumber: state.pitchCount + 1, strikeType: action.strikeType });
      break;
    }
    case 'droppedThirdStrike': {
      if (action.variant === 'strikeout') {
        const strikeLabel = action.strikeType === 'looking' ? '삼진(루킹)' : '삼진';
        nextState = applyOut(state, strikeLabel, { pitchNumber: state.pitchCount + 1, strikeType: action.strikeType });
      } else if (action.variant === 'tag_out') {
        const tagLabel = action.strikeType === 'looking' ? '삼진 낫아웃 실패(포수 태그/루킹)' : '삼진 낫아웃 실패(포수 태그)';
        nextState = applyOut(state, tagLabel, { pitchNumber: state.pitchCount + 1, strikeType: action.strikeType });
      } else if (action.variant === 'force_out') {
        const forceLabel = action.strikeType === 'looking' ? '삼진 낫아웃 실패(1루 포스/루킹)' : '삼진 낫아웃 실패(1루 포스)';
        nextState = applyOut(state, forceLabel, { pitchNumber: state.pitchCount + 1, strikeType: action.strikeType });
      } else {
        nextState = applyDroppedThirdStrike(state, action.strikeType);
      }
      if (action.runnerOuts && action.runnerOuts.length) {
        nextState = applyRunnerOutsByName(nextState, action.runnerOuts);
      }
      break;
    }
    case 'out':
      nextState = applyOut(state, '아웃', { pitchNumber: state.pitchCount + 1, battedBall: action.battedBall });
      break;
    case 'outWithMessage':
      nextState = applyOut(state, action.note, { pitchNumber: state.pitchCount + 1, battedBall: action.battedBall });
      break;
    case 'doublePlay':
      nextState = applyDoublePlay(state, 2, '병살타', action.battedBall, action.selectedRunners, action.route, action.runnerAdvancements);
      break;
    case 'triplePlay':
      nextState = applyDoublePlay(state, 3, '삼중살', action.battedBall, action.selectedRunners, action.route, action.runnerAdvancements);
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
      // [수정] 경기 시작 시 기존 feed를 비우고([]) 새롭게 시작하도록 변경
      // 기존: const feed = pushFeed(state.feed, createLogEntryForBaserunning(state, broadcast, 0));
      const feed = pushFeed([], createLogEntryForBaserunning(state, broadcast, 0));
      
      const matches = state.activeMatchId
        ? updateMatchSchedule(state.matches, state.activeMatchId, { status: 'inProgress', lineupPublic: true })
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
        lineScore: { home: [], away: [] },
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
        gameStartTimestamp: state.gameLimitMinutes !== null ? Date.now() : null,
        gamePausedAt: null,
        gamePausedDuration: 0,
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
      {
        const playEvent = createPlayEventForBaserunning(
          state,
          { type: 'setPlay', runners: getRunnerNames(state.bases), notes: action.message },
          0,
        );
        nextState = {
          ...state,
          lastPlay: action.message,
          feed: pushPlayFeed(state, createLogEntry(state, action.message, 0, playEvent.eventId)),
          events: pushEvent(state.events, playEvent),
        };
      }
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
    case 'multipleRunnersOut':
      nextState = applyMultipleRunnersOut(state, action.bases, action.label);
      break;
    case 'advanceRunners':
      nextState = applyRunnerAdvancements(state, action.selections, action.message, action.preserveLastPlay);
      break;
    case 'setTeamName':
      nextState = { ...state, teamNames: { ...state.teamNames, [action.side]: action.name } };
      break;
    case 'setLineup':
      nextState = updateLineup(state, action.side, action.index, action.updates);
      break;
    case 'removeLineupSlot':
      nextState = removeLineupSlot(state, action.side, action.index);
      break;
    case 'removePracticeBatter':
      nextState = removePracticeBatter(state, action.side, action.battingOrderIndex);
      break;
    case 'swapPositions':
      nextState = swapPositions(state, action.side, action.swaps, action.benchSwaps);
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
      nextState = substitutePlayer(state, action.side, action.benchIndex, action.lineupIndex, action.substitutionType);
      break;
    case 'setLiveVideoUrl': {
      const trimmed = action.url.trim();
      const updatedMatches = state.activeMatchId
        ? updateMatchSchedule(state.matches, state.activeMatchId, { liveVideoUrl: trimmed })
        : state.matches;
      nextState = { ...state, liveVideoUrl: trimmed, matches: updatedMatches };
      break;
    }
    case 'setLiveDelaySeconds': {
      const seconds = Math.max(0, action.seconds);
      const updatedMatches = state.activeMatchId
        ? updateMatchSchedule(state.matches, state.activeMatchId, { liveDelaySeconds: seconds })
        : state.matches;
      nextState = { ...state, liveDelaySeconds: seconds, matches: updatedMatches };
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
    case 'setGameLimit': {
      // 경기 종료 후에는 설정 불가
      if (state.gameOver) return state;

      // 경기 시작 후에 제한시간을 설정하면 타이머를 현재 시간부터 시작
      if (state.gameStarted && action.minutes !== null) {
        nextState = {
          ...state,
          gameLimitMinutes: action.minutes,
          gameStartTimestamp: Date.now(),
          gamePausedAt: null,
          gamePausedDuration: 0,
        };
      } else {
        nextState = { ...state, gameLimitMinutes: action.minutes };
      }
      break;
    }
    case 'pauseGameTimer': {
      if (!state.gameStarted || state.gameOver || state.gamePausedAt !== null) return state;
      nextState = { ...state, gamePausedAt: Date.now() };
      break;
    }
    case 'resumeGameTimer': {
      if (!state.gameStarted || state.gameOver || state.gamePausedAt === null) return state;
      const pauseDuration = Date.now() - state.gamePausedAt;
      nextState = {
        ...state,
        gamePausedAt: null,
        gamePausedDuration: state.gamePausedDuration + pauseDuration,
      };
      break;
    }
    case 'setOnlineViewerCount':
      return { ...state, onlineViewerCount: action.count };
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
    case 'moveMatchToTrash':
      nextState = {
        ...state,
        matches: updateMatchSchedule(state.matches, action.matchId, {
          ...action.entry,
          deleted: true,
          deletedAt: action.entry.deletedAt ?? Date.now(),
          purgeAt: action.entry.purgeAt ?? Date.now() + TRASH_RETENTION_MS,
        }),
        activeMatchId: state.activeMatchId === action.matchId ? null : state.activeMatchId,
      };
      break;
    case 'restoreMatch':
      nextState = {
        ...state,
        matches: updateMatchSchedule(state.matches, action.matchId, {
          deleted: false,
          deletedAt: undefined,
          purgeAt: undefined,
          deletedBy: undefined,
        }),
      };
      break;
    case 'purgeTrash':
      nextState = {
        ...state,
        matches: state.matches.filter((m) => m.id !== action.matchId),
        activeMatchId: state.activeMatchId === action.matchId ? null : state.activeMatchId,
      };
      break;
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
        nextState = { ...state, activeMatchId: null, followCurrent: typeof action.followCurrent === 'boolean' ? action.followCurrent : state.followCurrent };
        break;
      }
      const selected = state.matches.find((match) => match.id === action.matchId);
      if (!selected) return state;
      if (selected.status === 'completed') {
        const resetState = resetGameForMatch(state, selected);
        const postLine = selected.postGame?.lineScore;
        const normalizedHome = postLine && typeof postLine === 'object'
          ? normalizeRunArray((postLine as { home?: unknown }).home)
          : [];
        const normalizedAway = postLine && typeof postLine === 'object'
          ? normalizeRunArray((postLine as { away?: unknown }).away)
          : [];
        const lineScore =
          normalizedHome.length || normalizedAway.length
            ? { home: normalizedHome, away: normalizedAway }
            : { home: [], away: [] };
        nextState = {
          ...resetState,
          activeMatchId: selected.id,
          followCurrent: typeof action.followCurrent === 'boolean' ? action.followCurrent : state.followCurrent,
          liveVideoUrl: selected.liveVideoUrl ?? '',
          liveDelaySeconds: selected.liveDelaySeconds ?? 0,
          teamNames: { home: selected.homeTeamName, away: selected.awayTeamName },
          homeTeamId: selected.homeTeamId ?? resetState.homeTeamId,
          awayTeamId: selected.awayTeamId ?? resetState.awayTeamId,
          score: {
            home: typeof selected.homeScore === 'number' ? selected.homeScore : resetState.score.home,
            away: typeof selected.awayScore === 'number' ? selected.awayScore : resetState.score.away,
          },
          lineScore,
          gameStarted: true,
          gameOver: true,
          lastPlay: '경기 기록 불러오는 중...',
        };
      } else {
        nextState = {
          ...resetGameForMatch(state, selected),
          followCurrent: typeof action.followCurrent === 'boolean' ? action.followCurrent : state.followCurrent,
          liveVideoUrl: selected.liveVideoUrl ?? '',
          liveDelaySeconds: selected.liveDelaySeconds ?? 0,
        };
      }
      break;
    }
    case 'setMatches':
      nextState = {
        ...state,
        matches: action.matches,
      };
      break;
    case 'syncActiveMatch':
      if (state.followCurrent === false) return state;
      if (action.matchId === state.activeMatchId) return state;
      nextState = { ...state, activeMatchId: action.matchId };
      break;
    default:
      nextState = state;
  }

  nextState = syncActiveMatchScore(nextState);

  if (nextState === state) return state;
  if (!shouldTrackHistory(action.type)) return nextState;
  return { ...nextState, history: [...state.history, snapshot] };
}

// [수정] 로컬 업데이트 시 시간순(과거->최신) 유지를 위해 배열 뒤에 추가 (append)
function pushFeed(feed: PlayLog[], entry: PlayLog) {
  return [...feed, entry];
}

function pushEvent(events: PlayEvent[], entry: PlayEvent) {
  return [entry, ...events];
}

const isPitcherLogEntry = (result: string) => {
  const text = result.trim();
  if (!text) return false;
  if (text.includes('투수 교체')) return false;
  return text.includes('투수 (') || /투수\s*$/.test(text);
};

function ensureHalfPitcherLogged(state: DemoState, feed: PlayLog[]) {
  // 투수 로그 형식: "이름(번호) 투수 (선발)" 또는 "이름(번호) 투수 (N차 계투)"
  const exists = feed.some(
    (entry) =>
      entry.inning === state.inning &&
      entry.half === state.half &&
      isPitcherLogEntry(entry.result),
  );
  if (exists) return feed;
  const defenseSide: Side = state.half === 'top' ? 'home' : 'away';
  const pitcher = state.lineups[defenseSide].find((slot) => slot.pos.toUpperCase() === 'P');
  if (!pitcher) return feed;

  // 투수 등판 순서 계산
  const pitcherAppearanceCount = calculatePitcherAppearanceCount(feed, defenseSide);
  const appearanceLabel = pitcherAppearanceCount === 0 ? '선발' : `${pitcherAppearanceCount}차 계투`;

  const pitcherEntry: PlayLog = {
    inning: state.inning,
    half: state.half,
    order: 0,
    batter: '',
    pitch: 0,
    result: `${pitcher.name}${pitcher.number ? `(${pitcher.number})` : ''} 투수 (${appearanceLabel})`,
    createdAt: Date.now(),
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
  const battingLineup = getBattingEntriesForLineup(lineup, isPracticeActiveMatch(state));

  const activeLineup = battingLineup.length ? battingLineup : lineup;
  const safeLength = activeLineup.length || 1;
  const idx = state.batterIndex[side] % safeLength;
  const batterSlot = activeLineup[idx];
  return {
    order: idx + 1,
    batter: batterSlot ? formatUniqueName(batterSlot.name, batterSlot.number) : '타자',
  };
}

function getRunnerNames(bases: Bases) {
  return bases.filter((runner): runner is string => typeof runner === 'string');
}

function createLogEntry(state: DemoState, result: string, pitch: number, eventId?: string): PlayLog {
  const info = currentBatterInfo(state);
  return {
    inning: state.inning,
    half: state.half,
    order: info.order,
    batter: info.batter,
    pitch,
    result,
    createdAt: Date.now(),
    eventId,
  };
}

function createLogEntryWithBatter(
  state: DemoState,
  batter: string,
  order: number | null,
  result: string,
  pitch: number,
  eventId?: string,
): PlayLog {
  return {
    inning: state.inning,
    half: state.half,
    order: order ?? 0,
    batter,
    pitch,
    result,
    createdAt: Date.now(),
    eventId,
  };
}

function createLogEntryForBaserunning(state: DemoState, result: string, pitch: number, eventId?: string): PlayLog {
  return {
    inning: state.inning,
    half: state.half,
    order: 0,
    batter: '',
    pitch,
    result,
    createdAt: Date.now(),
    eventId,
  };
}

function generateEventId(state: DemoState, pitch: number) {
  return `${state.inning}-${state.half}-${pitch}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createPlayEvent(
  state: DemoState,
  details: {
    type: string;
    runners?: string[];
    battedBall?: BattedBallDetails | null;
    error?: ErrorDetails | string | null;
    notes?: string;
    strikeType?: 'swinging' | 'looking';
    rbi?: number;
    dpRoute?: number[];
    earnedRunsBy?: Record<string, number>;
  },
  pitch: number,
): PlayEvent {
  const info = currentBatterInfo(state);
  const createdAt = Date.now();
  const eventId = generateEventId(state, pitch);
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
    strikeType: details.strikeType,
    rbi: details.rbi,
    dpRoute: details.dpRoute,
    earnedRunsBy: details.earnedRunsBy,
    createdAt,
    eventId,
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
    rbi?: number;
  },
  pitch: number,
  batter: string,
  order: number | null,
): PlayEvent {
  const createdAt = Date.now();
  const eventId = generateEventId(state, pitch);
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
    rbi: details.rbi,
    createdAt,
    eventId,
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
  const createdAt = Date.now();
  const eventId = generateEventId(state, pitch);
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
    createdAt,
    eventId,
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
    strikeType?: 'swinging' | 'looking';
    rbi?: number;
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
      strikeType: options?.strikeType,
      rbi: options?.rbi,
    },
    advanceBatter ? pitchNumber : 0,
  );
  if (outs >= 3) {
    const finalMessage = `${message} · 3아웃 · 이닝 종료`;
    const feedWithPlay = pushPlayFeed(
      state,
      createLogEntry(state, logResult, advanceBatter ? pitchNumber : 0, eventEntry.eventId),
    );
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
    feed: pushPlayFeed(state, createLogEntry(state, logResult, advanceBatter ? pitchNumber : 0, eventEntry.eventId)),
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
  const lineScore = addRunsToLineScore(state.lineScore, side, state.inning, runs);
  // 안타의 경우 득점 수가 곧 타점(RBI)
  const rbi = runs;
  const eventEntry = createPlayEvent(
    state,
    {
      type: 'hit',
      runners: runnerMoves.map((move) => move.runnerSummary),
      battedBall: battedBall ?? null,
      notes: message,
      rbi,
    },
    pitchNumber,
  );
  
  let feed = state.feed;
  runnerMoves.forEach((move) => {
    feed = pushFeed(feed, createLogEntryForBaserunning(state, move.feedText, pitchNumber, eventEntry.eventId));
  });
  // 타구 방향 정보 추가
  const zoneNote = battedBall?.zone && battedBall.zone !== '선택 안 함' ? ` · ${battedBall.zone}` : '';
  const resultLog = runs ? `${result}${zoneNote} · ${runs}득점` : `${result}${zoneNote}`;
  feed = pushPlayFeed(state, createLogEntry(state, resultLog, pitchNumber, eventEntry.eventId), feed);

  const nextState = {
    ...state,
    bases,
    score,
    lineScore,
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
  const lineScore = addRunsToLineScore(state.lineScore, side, state.inning, runs);

  const contextNote = context?.trim() ? ` (${context.trim()})` : '';
  const fcZoneNote = battedBall?.zone && battedBall.zone !== '선택 안 함' ? ` · ${battedBall.zone}` : '';
  const resultLog = runs ? `야수선택${fcZoneNote}${contextNote} · ${runs}득점` : `야수선택${fcZoneNote}${contextNote}`;
  const eventEntry = createPlayEventWithBatter(
    state,
    {
      type: 'fc',
      runners: runnerMoves.map((move) => move.runnerSummary),
      battedBall: battedBall ?? null,
      notes: `야수선택${contextNote ? ` ${contextNote}` : ''} · ${batterName}`,
      rbi: runs > 0 ? runs : undefined,
    },
    pitchNumber,
    batterName,
    batterOrder,
  );
  feed = pushPlayFeed(
    state,
    createLogEntryWithBatter(state, batterName, batterOrder, resultLog, pitchNumber, eventEntry.eventId),
    feed,
  );
  runnerMoves.forEach((move) => {
    feed = pushFeed(feed, createLogEntryForBaserunning(state, move.feedText, pitchNumber, eventEntry.eventId));
  });

  const nextState: DemoState = {
    ...state,
    bases,
    score,
    lineScore,
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
  const lineScore = addRunsToLineScore(state.lineScore, side, state.inning, runs);
  const eventEntry = createPlayEvent(
    state,
    {
      type: message === '몸에 맞는 공' ? 'hbp' : 'walk',
      runners: getRunnerNames(state.bases),
      notes: `${message} · ${batterName}`,
      rbi: runs > 0 ? runs : undefined,
    },
    pitchNumber,
  );
  return {
    ...state,
    bases,
    score,
    lineScore,
    balls: 0,
    strikes: 0,
    pitchCount: 0,
    batterIndex,
    lastPlay: `${message} · ${batterName}`,
    feed: pushPlayFeed(
      state,
      createLogEntry(state, runs ? `${message} · ${runs}득점` : message, pitchNumber, eventEntry.eventId),
    ),
    events: pushEvent(state.events, eventEntry),
  };
}

function applyDroppedThirdStrike(state: DemoState, strikeType?: 'swinging' | 'looking'): DemoState {
  const pitchNumber = Math.max(1, state.pitchCount + 1);
  const { batterName, batterIndex } = nextBatter(state);
  const { bases, runs } = advanceBasesOnWalk(state.bases, batterName);
  const side = hittingSide(state);
  const score =
    side === 'home'
      ? { ...state.score, home: state.score.home + runs }
      : { ...state.score, away: state.score.away + runs };
  const lineScore = addRunsToLineScore(state.lineScore, side, state.inning, runs);
  const message = strikeType === 'looking' ? '삼진 낫아웃(루킹)' : '삼진 낫아웃';
  const eventEntry = createPlayEvent(
    state,
    {
      type: 'dropped_third_strike',
      runners: getRunnerNames(state.bases),
      notes: `${message} · ${batterName}`,
      strikeType,
    },
    pitchNumber,
  );
  return {
    ...state,
    bases,
    score,
    lineScore,
    balls: 0,
    strikes: 0,
    pitchCount: 0,
    batterIndex,
    lastPlay: `${message} · ${batterName}`,
    feed: pushPlayFeed(
      state,
      createLogEntry(state, runs ? `${message} · ${runs}득점` : message, pitchNumber, eventEntry.eventId),
    ),
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
    const lineScore = addRunsToLineScore(state.lineScore, side, state.inning, runs);
    // 희생번트로 인한 득점은 타점(RBI)
    const buntZoneNote = battedBall?.zone && battedBall.zone !== '선택 안 함' ? ` · ${battedBall.zone}` : '';
    return applyOut(
      { ...state, bases, score, lineScore },
      runs ? `희생번트${buntZoneNote} · ${runs}득점` : `희생번트${buntZoneNote}`,
      { pitchNumber, eventType: 'sac', runners: getRunnerNames(bases), notes: '희생번트', battedBall, rbi: runs },
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
  const lineScore = addRunsToLineScore(state.lineScore, side, state.inning, runs);
  // 희생플라이로 인한 득점은 타점(RBI)
  const flyZoneNote = battedBall?.zone && battedBall.zone !== '선택 안 함' ? ` · ${battedBall.zone}` : '';
  return applyOut(
    { ...state, bases, score, lineScore },
    runs ? `희생플라이${flyZoneNote} · ${runs}득점` : `희생플라이${flyZoneNote}`,
    { pitchNumber, eventType: 'sac', runners: getRunnerNames(bases), notes: '희생플라이', battedBall, rbi: runs },
  );
}

function applyError(state: DemoState, details: ErrorDetails): DemoState {
  const pitchNumber = Math.max(1, state.pitchCount + 1);
  const isBatterHold = details.advanceResults.batter === 'hold';
  const { batter } = currentBatterInfo(state);
  const nextBatterResult = nextBatter(state);
  const batterName = isBatterHold ? batter : nextBatterResult.batterName;
  const newBatterIndex = isBatterHold ? state.batterIndex : nextBatterResult.batterIndex;
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
  const lineScore = addRunsToLineScore(state.lineScore, side, state.inning, runs);

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

  let feed = state.feed;
  runnerMoves.forEach((move) => {
    feed = pushFeed(feed, createLogEntryForBaserunning(state, move.feedText, pitchNumber, eventEntry.eventId));
  });
  feed = pushPlayFeed(state, createLogEntry(state, resultText, pitchNumber, eventEntry.eventId), feed);

  const nextState = {
    ...state,
    bases,
    score,
    lineScore,
    balls: 0,
    strikes: 0,
    pitchCount: isBatterHold ? state.pitchCount : 0,
    batterIndex: newBatterIndex,
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
  const lineScore = addRunsToLineScore(state.lineScore, side, state.inning, runs);
  const detail = moved
    ? formatRunnerMove({
        runner: moved.name,
        from: moved.from,
        to: moved.to,
        outcome: moved.scored ? 'score' : 'advance',
        message: '도루 성공',
      })
    : null;
  const eventEntry = createPlayEventForBaserunning(
    state,
    {
      type: success ? 'steal' : 'steal_fail',
      runners: detail ? [detail.runnerSummary] : [],
      notes: detail?.feedText ?? (runs ? `도루 성공 · ${runs}득점` : '도루 성공'),
    },
    state.pitchCount + 1,
  );
  const feedEntry = detail
    ? createLogEntryForBaserunning(state, detail.feedText, state.pitchCount + 1, eventEntry.eventId)
    : null;
  return {
    ...state,
    bases,
    score,
    lineScore,
    balls: 0,
    strikes: 0,
    pitchCount: 0,
    lastPlay: detail?.lastPlay ?? (runs ? `도루 성공 · ${runs}득점` : '도루 성공'),
    feed: pushFeed(
      state.feed,
      feedEntry ??
        createLogEntry(
          state,
          detail?.feedText ?? (runs ? `도루 성공 · ${runs}득점` : '도루 성공'),
          0,
          eventEntry.eventId,
        ),
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
  const lineScore = addRunsToLineScore(state.lineScore, side, state.inning, runs);
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
    lineScore,
    lastPlay: detail.lastPlay,
    feed: pushFeed(state.feed, createLogEntry(state, detail.feedText, 0, eventEntry.eventId)),
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
  const eventEntry = createPlayEventForBaserunning(
    state,
    { type: 'runner_out', runners: [detail.runnerSummary], notes: detail.feedText },
    state.pitchCount,
  );
  const feedEntry = createLogEntryForBaserunning(state, detail.feedText, state.pitchCount, eventEntry.eventId);
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

function applyMultipleRunnersOut(state: DemoState, bases: number[], label?: string): DemoState {
  const newBases = [...state.bases] as Bases;
  const runnersOut: { name: string; base: number }[] = [];

  // 선택된 베이스의 주자들을 아웃시킴
  for (const baseIndex of bases) {
    if (newBases[baseIndex]) {
      runnersOut.push({ name: newBases[baseIndex] as string, base: baseIndex });
      newBases[baseIndex] = null;
    }
  }

  if (runnersOut.length === 0) return state;

  const outs = Math.min(3, state.outs + runnersOut.length);
  const runnerDesc = runnersOut
    .map((r) => `${r.name} ${baseLabel(r.base)}`)
    .join(', ');
  const finalLabel = label || (runnersOut.length === 2 ? '더블아웃' : `${runnersOut.length}명 아웃`);
  const feedText = `${finalLabel} · ${runnerDesc} 아웃`;
  const lastPlay = feedText;

  const eventEntry = createPlayEventForBaserunning(
    state,
    { type: 'runner_out', runners: runnersOut.map(r => `${r.name} ${baseLabel(r.base)}`), notes: feedText },
    state.pitchCount,
  );

  const feedEntry = createLogEntryForBaserunning(state, feedText, state.pitchCount, eventEntry.eventId);

  const nextState = {
    ...state,
    bases: newBases,
    outs,
    lastPlay,
    pitchCount: state.pitchCount,
    feed: pushFeed(state.feed, feedEntry),
    events: pushEvent(state.events, eventEntry),
  };

  if (outs >= 3) {
    return changeHalf(nextState, lastPlay, state.pitchCount, state);
  }
  return nextState;
}

function applyRunnerOutsByName(state: DemoState, runnerNames: string[], label?: string): DemoState {
  if (!runnerNames.length) return state;
  const basesToRemove: number[] = [];
  runnerNames.forEach((name) => {
    const idx = state.bases.findIndex((runner) => runner === name);
    if (idx >= 0) basesToRemove.push(idx);
  });
  if (!basesToRemove.length) return state;
  const defaultLabel =
    label ??
    (runnerNames.length === 1 ? '주자 아웃' : runnerNames.length === 2 ? '더블아웃' : `${runnerNames.length}명 아웃`);
  return applyMultipleRunnersOut(state, basesToRemove, defaultLabel);
}

function applyRunnerAdvancements(
  state: DemoState,
  selections: RunnerAdvanceSelections,
  message: string,
  preserveLastPlay = false,
): DemoState {
  const hasSelections = Object.values(selections).some((value) => value && value !== 'hold');
  if (!hasSelections) return state;

  const bases = [null, null, null] as Bases;
  let runs = 0;
  let outs = state.outs;
  const runnerMoves: { feedText: string; lastPlay: string; runnerSummary: string }[] = [];

  for (let i = 2; i >= 0; i -= 1) {
    const runner = state.bases[i];
    if (!runner) continue;
    const outcome = selections[i as 0 | 1 | 2] ?? 'hold';
    const resolved = resolveAdvanceOutcome(outcome, i, 0);
    if (resolved.type === 'out') {
      outs += 1;
      runnerMoves.push(
        formatRunnerMove({
          runner,
          from: i,
          to: i,
          outcome: 'out',
          outsCount: outs,
          message,
        }),
      );
      continue;
    }
    if (resolved.type === 'score') {
      runs += 1;
      runnerMoves.push(
        formatRunnerMove({
          runner,
          from: i,
          to: 3,
          outcome: 'score',
          message,
        }),
      );
      continue;
    }
    if (resolved.type === 'hold') {
      const placed = placeRunnerOnBases(bases, runner, resolved.targetBaseIndex);
      if (placed.scored) {
        runs += 1;
        runnerMoves.push(
          formatRunnerMove({
            runner,
            from: i,
            to: 3,
            outcome: 'score',
            message,
          }),
        );
      } else {
        runnerMoves.push(
          formatRunnerMove({
            runner,
            from: i,
            to: placed.dest,
            outcome: 'hold',
            message,
          }),
        );
      }
      continue;
    }
    const placed = placeRunnerOnBases(bases, runner, resolved.targetBaseIndex);
    if (placed.scored) {
      runs += 1;
      runnerMoves.push(
        formatRunnerMove({
          runner,
          from: i,
          to: 3,
          outcome: 'score',
          message,
        }),
      );
    } else {
      runnerMoves.push(
        formatRunnerMove({
          runner,
          from: i,
          to: placed.dest,
          outcome: 'advance',
          message,
        }),
      );
    }
  }

  if (!runnerMoves.length) return state;

  const side = hittingSide(state);
  const score =
    side === 'home'
      ? { ...state.score, home: state.score.home + runs }
      : { ...state.score, away: state.score.away + runs };
  const lineScore = addRunsToLineScore(state.lineScore, side, state.inning, runs);

  const eventEntry = createPlayEventForBaserunning(
    state,
    { type: 'runner', runners: runnerMoves.map((move) => move.runnerSummary), notes: message },
    state.pitchCount,
  );

  let feed = state.feed;
  runnerMoves.forEach((move) => {
    feed = pushFeed(feed, createLogEntryForBaserunning(state, move.feedText, state.pitchCount, eventEntry.eventId));
  });

  const lastMove = runnerMoves[runnerMoves.length - 1];
  const lastPlay = preserveLastPlay ? state.lastPlay : lastMove.lastPlay;

  const nextState = {
    ...state,
    bases,
    score,
    lineScore,
    outs,
    lastPlay,
    feed,
    events: pushEvent(state.events, eventEntry),
  };

  if (outs >= 3) {
    return changeHalf(nextState, lastMove.lastPlay, state.pitchCount, state);
  }

  return nextState;
}

function applyDoublePlay(
  state: DemoState,
  outsToAdd: 2 | 3,
  label: string,
  battedBall?: BattedBallDetails | null,
  selectedRunners?: number[],
  route?: number[],
  runnerAdvancements?: Record<number, number>,
): DemoState {
  const bases = [...state.bases] as Bases;
  const current = currentBatterInfo(state);
  const batterName = current.batter;
  const batterIndex = nextBatter(state).batterIndex;
  const runnersOut: { name: string; base: number }[] = [];
  const outs = Math.min(3, state.outs + outsToAdd);
  let runsScored = 0;
  const runnersAdvanced: { name: string; from: number; to: number | 'home' }[] = [];

  // Batter out
  runnersOut.push({ name: batterName, base: -1 });

  // Remove selected runners or default to lead runners
  if (selectedRunners && selectedRunners.length > 0) {
    // 선택된 주자들을 아웃시킴
    for (const baseIndex of selectedRunners) {
      if (bases[baseIndex]) {
        runnersOut.push({ name: bases[baseIndex] as string, base: baseIndex });
        bases[baseIndex] = null;
      }
    }
  } else {
    // 기존 방식: 3루부터 역순으로 주자를 아웃시킴
    for (let i = 2; i >= 0 && runnersOut.length < outsToAdd; i -= 1) {
      if (bases[i]) {
        runnersOut.push({ name: bases[i] as string, base: i });
        bases[i] = null;
      }
    }
  }

  // 아웃되지 않은 주자들의 진루 처리
  if (runnerAdvancements && Object.keys(runnerAdvancements).length > 0) {
    // 3루->홈 순으로 처리 (역순으로 정렬)
    const sortedAdvancements = Object.entries(runnerAdvancements)
      .map(([from, to]) => ({ from: Number(from), to }))
      .sort((a, b) => b.from - a.from);

    for (const { from, to } of sortedAdvancements) {
      const runnerName = bases[from];
      if (runnerName && !selectedRunners?.includes(from)) {
        bases[from] = null;
        if (to === 3) {
          // 홈으로 진루 (득점)
          runsScored += 1;
          runnersAdvanced.push({ name: runnerName, from, to: 'home' });
        } else if (to >= 0 && to < 3) {
          // 다른 베이스로 진루
          bases[to] = runnerName;
          runnersAdvanced.push({ name: runnerName, from, to });
        }
      }
    }
  }

  const runnerDesc = runnersOut
    .filter((r) => r.base >= 0)
    .map((r) => `${r.name} ${baseLabel(r.base)}`)
    .join(', ');
  const advanceDesc = runnersAdvanced
    .map((r) => r.to === 'home' ? `${r.name} 득점` : `${r.name} ${baseLabel(r.from)}→${baseLabel(r.to as number)}`)
    .join(', ');
  const routeLabel = route && route.length > 0 ? `(${route.join('-')})` : '';
  const labelWithRoute = `${label}${routeLabel}`;
  let feedText = runnerDesc ? `${labelWithRoute} · ${batterName} 아웃 / ${runnerDesc} 아웃` : `${labelWithRoute} · ${batterName} 아웃`;
  if (advanceDesc) {
    feedText += ` / ${advanceDesc}`;
  }
  const lastPlay = feedText;
  const eventEntry = createPlayEvent(
    state,
    { type: 'out', runners: getRunnerNames(state.bases), notes: feedText, battedBall: battedBall ?? null, dpRoute: route },
    Math.max(1, state.pitchCount + 1),
  );

  // 득점 반영
  const updatedScore = { ...state.score };
  if (runsScored > 0) {
    if (state.half === 'top') {
      updatedScore.away = (updatedScore.away || 0) + runsScored;
    } else {
      updatedScore.home = (updatedScore.home || 0) + runsScored;
    }
  }
  const lineScore = addRunsToLineScore(state.lineScore, hittingSide(state), state.inning, runsScored);

  const nextState = {
    ...state,
    bases,
    outs,
    balls: 0,
    strikes: 0,
    pitchCount: 0,
    batterIndex,
    lastPlay,
    score: updatedScore,
    lineScore,
    feed: pushPlayFeed(
      state,
      createLogEntry(state, feedText, Math.max(1, state.pitchCount + 1), eventEntry.eventId),
    ),
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
    gamePausedAt: null,
  };
}

function changeHalf(state: DemoState, message: string, pitchNumber = 0, logState?: DemoState): DemoState {
  return changeHalfState(state, message, createLogEntry, pushFeed, pitchNumber, logState);
}

const normalizePositionCode = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const upper = trimmed.toUpperCase();
  if (upper === '1') return '1B';
  if (upper === '2') return '2B';
  if (upper === '3') return '3B';
  return upper;
};

const hasBatterLog = (feed: PlayLog[]) => feed.some((entry) => entry.order > 0);

const shouldLogLineupChange = (state: DemoState) =>
  state.gameStarted && !state.gameOver && hasBatterLog(state.feed);

function updateLineup(state: DemoState, side: Side, index: number, updates: Partial<PlayerSlot>): DemoState {
  const lineup = [...state.lineups[side]];

  // [수정] 배열 경계를 넘어가는 경우 빈 슬롯 추가 (빈 라인업에서 편집 시)
  const emptySlot: PlayerSlot = { name: '', pos: '', number: '', throws: 'R', bats: 'R', order: null };
  while (lineup.length <= index) {
    lineup.push({ ...emptySlot });
  }

  const original = lineup[index];
  const normalizedUpdates = { ...updates };
  let normalizedPos: string | undefined;
  if (typeof updates.pos === 'string') {
    normalizedPos = normalizePositionCode(updates.pos);
    normalizedUpdates.pos = normalizedPos;
  }
  lineup[index] = { ...lineup[index], ...normalizedUpdates };

  // 포지션 변경 시 feed에 기록
  let feed = state.feed;
  let lastPlay = state.lastPlay;

  if (shouldLogLineupChange(state)) {
    const prevPitcher = state.lineups[side].find((slot) => slot.pos?.toUpperCase() === 'P');
    const nextPitcher = lineup.find((slot) => slot.pos?.toUpperCase() === 'P');
    const prevKey = formatUniqueName(prevPitcher?.name ?? '', prevPitcher?.number);
    const nextKey = formatUniqueName(nextPitcher?.name ?? '', nextPitcher?.number);
    const pitcherChanged = prevKey !== nextKey;
    if (pitcherChanged && (prevPitcher || nextPitcher)) {
      const formatPlayer = (player?: PlayerSlot) => {
        if (!player) return '미정';
        const name = player.name?.trim() ? player.name.trim() : '미정';
        const num = player.number ? `(${player.number})` : '';
        return `${name}${num}`;
      };
      const changeText = `투수 교체 · ${formatPlayer(prevPitcher)} → ${formatPlayer(nextPitcher)}`;
      const appearanceCount = calculatePitcherAppearanceCount(state.feed, side);
      feed = pushFeed(feed, createLogEntryForBaserunning(state, changeText, 0));
      lastPlay = changeText;
      if (nextPitcher && nextPitcher.pos?.toUpperCase() === 'P' && (nextPitcher.name || nextPitcher.number)) {
        const appearanceLabel = appearanceCount === 0 ? '선발' : `${appearanceCount}차 계투`;
        const newPitcherLog = `${formatPlayer(nextPitcher)} 투수 (${appearanceLabel})`;
        feed = pushFeed(feed, createLogEntryForBaserunning(state, newPitcherLog, 0));
      }
    }
  }

  // [수정] 경기가 시작된 상태(state.gameStarted)일 때만 포지션 변경 로그를 남기도록 조건 추가
  if (shouldLogLineupChange(state) && normalizedPos && original?.pos) {
    const prevPos = normalizePositionCode(original.pos);
    const nextPos = normalizedPos;
    if (prevPos && nextPos !== prevPos) {
    const playerName = original.name || '선수';
    const playerNum = original.number ? `(${original.number})` : '';
      const changeText = `포지션 변경 · ${playerName}${playerNum}: ${prevPos} → ${nextPos}`;
      feed = pushFeed(feed, createLogEntryForBaserunning(state, changeText, 0));
      lastPlay = changeText;
    }
  }

  return { ...state, lineups: { ...state.lineups, [side]: lineup }, feed, lastPlay };
}

function removeLineupSlot(state: DemoState, side: Side, index: number): DemoState {
  const lineup = [...state.lineups[side]];
  if (index < 0 || index >= lineup.length) return state;

  // 기록원 연습모드 UI에서만 호출되므로, 삭제 판단은 "마지막 투수 전용 슬롯" 기준으로 단순화한다.
  // 타자가 P 포지션을 가져도 삭제 대상에서 제외되지 않도록, 마지막 슬롯이 P일 때만 투수 전용으로 본다.
  const dedicatedPitcherIndex =
    lineup.length > 0 && lineup[lineup.length - 1].pos.toUpperCase() === 'P'
      ? lineup.length - 1
      : -1;

  const battingIndices = lineup
    .map((_, idx) => idx)
    .filter((idx) => idx !== dedicatedPitcherIndex);

  if (battingIndices.length <= 9) return state;
  const battingOrder = battingIndices.indexOf(index);
  if (battingOrder < 0) return state;
  if (battingOrder < 9) return state; // 최소 9명 보장 (기본 1~9번 보호)
  lineup.splice(index, 1);
  return { ...state, lineups: { ...state.lineups, [side]: lineup } };
}

function removePracticeBatter(state: DemoState, side: Side, battingOrderIndex: number): DemoState {
  const lineup = [...state.lineups[side]];
  const dedicatedPitcherIndex =
    lineup.length > 0 && lineup[lineup.length - 1].pos.toUpperCase() === 'P'
      ? lineup.length - 1
      : -1;

  const battingCount = dedicatedPitcherIndex >= 0 ? lineup.length - 1 : lineup.length;
  if (battingCount <= 9) return state;
  if (battingOrderIndex < 9) return state;
  if (battingOrderIndex >= battingCount) return state;

  // 연습경기 UI에서 battingOrderIndex는 타자행 인덱스(0-based)와 동일하다.
  const targetIndex = battingOrderIndex;
  if (targetIndex < 0 || targetIndex >= lineup.length) return state;
  if (targetIndex === dedicatedPitcherIndex) return state;

  lineup.splice(targetIndex, 1);
  return { ...state, lineups: { ...state.lineups, [side]: lineup } };
}

function swapPositions(
  state: DemoState,
  side: Side,
  swaps: { index: number; newPos: string }[],
  benchSwaps?: { index: number; newPos: string }[]
): DemoState {
  if (swaps.length === 0 && (!benchSwaps || benchSwaps.length === 0)) return state;

  const lineup = [...state.lineups[side]];
  const bench = [...state.benches[side]];
  const changes: string[] = [];

  // 라인업 포지션 변경
  for (const { index, newPos } of swaps) {
    if (index >= 0 && index < lineup.length) {
      const original = lineup[index];
      const normalizedNewPos = normalizePositionCode(newPos);
      const prevPos = original ? normalizePositionCode(original.pos) : '';
      if (original && prevPos && prevPos !== normalizedNewPos) {
        const playerName = original.name || '선수';
        const playerNum = original.number ? `(${original.number})` : '';
        changes.push(`${playerName}${playerNum}: ${prevPos} → ${normalizedNewPos}`);
        lineup[index] = { ...original, pos: normalizedNewPos };
      }
    }
  }

  // 벤치 포지션 변경
  if (benchSwaps) {
    for (const { index, newPos } of benchSwaps) {
      if (index >= 0 && index < bench.length) {
        const original = bench[index];
        const normalizedNewPos = normalizePositionCode(newPos);
        const prevPos = original ? normalizePositionCode(original.pos) : '';
        if (original && prevPos && prevPos !== normalizedNewPos) {
          const playerName = original.name || '선수';
          const playerNum = original.number ? `(${original.number})` : '';
          changes.push(`${playerName}${playerNum}: ${prevPos} → ${normalizedNewPos}`);
          bench[index] = { ...original, pos: normalizedNewPos };
        }
      }
    }
  }

  // 변경사항이 없으면 그대로 반환
  if (changes.length === 0) return state;

  // 피드에 한 번만 기록
  let feed = state.feed;
  let lastPlay = state.lastPlay;

  if (shouldLogLineupChange(state)) {
    const changeText = `포지션 교체 · ${changes.join(', ')}`;
    feed = pushFeed(state.feed, createLogEntryForBaserunning(state, changeText, 0));
    lastPlay = changeText;

    // 야수 → 투수 포지션 변경 시 투수 등판 로그 추가 (투구수 누적을 위해)
    for (const { index, newPos } of swaps) {
      if (index >= 0 && index < lineup.length) {
        const player = lineup[index];
        const normalizedNewPos = normalizePositionCode(newPos);
        const originalPos = state.lineups[side][index]?.pos?.toUpperCase();
        // 기존 포지션이 투수가 아니고 새 포지션이 투수인 경우
        if (player && originalPos !== 'P' && normalizedNewPos === 'P') {
          const pitcherAppearanceCount = calculatePitcherAppearanceCount(feed, side);
          const appearanceLabel = pitcherAppearanceCount === 0 ? '선발' : `${pitcherAppearanceCount}차 계투`;
          const playerNum = player.number ? `(${player.number})` : '';
          const newPitcherLog = `${player.name}${playerNum} 투수 (${appearanceLabel})`;
          feed = pushFeed(feed, createLogEntryForBaserunning(state, newPitcherLog, 0));
        }
      }
    }
  }

  return {
    ...state,
    lineups: { ...state.lineups, [side]: lineup },
    benches: { ...state.benches, [side]: bench },
    feed,
    lastPlay,
  };
}

// 투수 등판 순서를 계산하는 헬퍼 함수
function calculatePitcherAppearanceCount(feed: PlayLog[], side: Side): number {
  let count = 0;
  // Feed is already in chronological order (oldest → newest), no need to reverse
  const chronological = feed;

  for (const entry of chronological) {
    const result = entry.result.trim();
    const entrySide: Side = entry.half === 'top' ? 'away' : 'home';
    const defenseSide: Side = entrySide === 'home' ? 'away' : 'home';

    // 수비팀(투수팀)만 카운트
    if (defenseSide !== side) continue;

    // 투수 등판 로그만 카운트 (교체 알림은 제외)
    if (isPitcherLogEntry(result)) {
      count++;
    }
  }

  return count;
}

function substitutePlayer(
  state: DemoState,
  side: Side,
  benchIndex: number,
  lineupIndex: number,
  substitutionType?: '대수비' | '대타' | '대주자'
): DemoState {
  const bench = [...state.benches[side]];
  const lineup = [...state.lineups[side]];
  const benchPlayer = bench[benchIndex];
  if (!benchPlayer) return state;
  const outgoing = lineup[lineupIndex];
  const battingOrder = getBattingOrder(state.lineups[side], lineupIndex, isPracticeActiveMatch(state));

  // 교체로 들어온 선수에 교체 유형 저장
  const incomingPlayer = { ...benchPlayer, substitutionType };

  lineup[lineupIndex] = incomingPlayer;
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

  // 교체 유형에 따른 레이블 생성
  let changeLabel: string;
  if (substitutionType) {
    changeLabel = substitutionType;
  } else {
    changeLabel = isPitcherChange ? '투수 교체' : '타자 교체';
  }

  const changeText = `${changeLabel} · ${formatPlayer(outgoing)} → ${formatPlayer(benchPlayer)}`;
  let feed = state.feed;
  let lastPlay = state.lastPlay;
  if (shouldLogLineupChange(state)) {
    feed = pushFeed(state.feed, createLogEntryForBaserunning(state, changeText, 0));
    lastPlay = changeText;
  }

  // 투수 교체 시 새로운 투수 로그 즉시 추가 (ensureHalfPitcherLogged가 나중에 중복 추가하는 것 방지)
  if (shouldLogLineupChange(state) && isPitcherChange && incomingIsP) {
    // 투수 등판 순서 계산
    const pitcherAppearanceCount = calculatePitcherAppearanceCount(state.feed, side);
    const appearanceLabel = pitcherAppearanceCount === 0 ? '선발' : `${pitcherAppearanceCount}차 계투`;
    const newPitcherLog = `${formatPlayer(benchPlayer)} 투수 (${appearanceLabel})`;
    feed = pushFeed(feed, createLogEntryForBaserunning(state, newPitcherLog, 0));
  }

  // 대주자 교체 시 베이스 업데이트
  let bases = state.bases;
  if (substitutionType === '대주자' && outgoing) {
    const outgoingUniqueName = formatUniqueName(outgoing.name, outgoing.number);
    const incomingUniqueName = formatUniqueName(incomingPlayer.name, incomingPlayer.number);
    bases = state.bases.map((runner) => (runner === outgoingUniqueName ? incomingUniqueName : runner)) as Bases;
  }

  return {
    ...state,
    lineups: { ...state.lineups, [side]: lineup },
    benches: { ...state.benches, [side]: bench },
    removed,
    lastPlay,
    feed,
    bases,
  };
}

interface DemoStoreValue {
  state: DemoState;
  actions: {
    addBall: () => void;
    addStrike: (strikeType?: 'swinging' | 'looking') => void;
    addFoul: (isBunt?: boolean) => void;
    strikeOut: (strikeType?: 'swinging' | 'looking') => void;
    droppedThirdStrike: (variant?: 'strikeout' | 'reach' | 'tag_out' | 'force_out', strikeType?: 'swinging' | 'looking', runnerOuts?: string[]) => void;
    advanceRunners: (selections: RunnerAdvanceSelections, message: string, preserveLastPlay?: boolean) => void;
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
    loadMoreFeed: () => void;
    runnerStealSuccess: (base: 0 | 1 | 2) => void;
    runnerCaught: (base: 0 | 1 | 2) => void;
    runnerPickoff: (base: 0 | 1 | 2) => void;
    runnerOut: (base: 0 | 1 | 2) => void;
    multipleRunnersOut: (bases: number[], label?: string) => void;
    runnerRundownOut: (base: 0 | 1 | 2) => void;
    runnerInterference: (base: 0 | 1 | 2) => void;
    addManualLog: (message: string) => void;
    setLiveVideoUrl: (url: string) => void;
    setLiveDelaySeconds: (seconds: number) => void;
    setTeamName: (side: Side, name: string) => void;
    setLineup: (side: Side, index: number, updates: Partial<PlayerSlot>) => void;
    removeLineupSlot: (side: Side, index: number) => void;
    removePracticeBatter: (side: Side, battingOrderIndex: number) => void;
    swapPositions: (side: Side, swaps: { index: number; newPos: string }[], benchSwaps?: { index: number; newPos: string }[]) => void;
    addBench: (side: Side, player: PlayerSlot) => void;
    removeBench: (side: Side, benchIndex: number) => void;
    substitute: (side: Side, benchIndex: number, lineupIndex: number, substitutionType?: '대수비' | '대타' | '대주자') => void;
    setPlay: (message: string) => void;
    startGame: () => void;
    endGame: (endedAt: string) => void;
    resetGame: () => void;
    undo: () => void;
    addOutWithMessage: (note: string, battedBall?: BattedBallDetails | null) => void;
    doublePlay: (battedBall?: BattedBallDetails | null, selectedRunners?: number[], route?: number[], runnerAdvancements?: Record<number, number>) => void;
    triplePlay: (battedBall?: BattedBallDetails | null, selectedRunners?: number[], route?: number[], runnerAdvancements?: Record<number, number>) => void;
    addMatch: (match: MatchSchedule) => void;
    updateMatch: (matchId: string, updates: Partial<MatchSchedule>) => void;
    deleteMatch: (matchId: string) => void;
    moveMatchToTrash: (matchId: string) => void;
    restoreMatch: (matchId: string) => void;
    purgeTrash: (matchId: string) => void;
    saveMatchLineups: (
      matchId: string,
      lineups: { home: PlayerSlot[]; away: PlayerSlot[] },
      benches: { home: PlayerSlot[]; away: PlayerSlot[] },
    ) => void;
    selectMatch: (matchId: string | null) => void;
    loadFullSchedule: () => Promise<void>;
    releaseLock: () => void;
    resumeLock: () => void;
    setScorerMode: (enabled: boolean) => void;
    setGameLimit: (minutes: number | null) => void;
    pauseGameTimer: () => void;
    resumeGameTimer: () => void;
  };
}

const DemoStoreContext = createContext<DemoStoreValue | null>(null);

export function DemoStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const stateRef = useRef(state);
  const skipFirestoreWriteRef = useRef(false);
  const skipMatchesWriteRef = useRef(false);
  const lastStateKeyRef = useRef('');
  const lastMatchesKeyRef = useRef('');
  const lastLiveScoreSyncKeyRef = useRef('');
  const lastFeedLengthRef = useRef(0);
  const lastEventsLengthRef = useRef(0);
  const writeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notifiedMatchStartRef = useRef<Set<string>>(new Set());
  const matchesReadyRef = useRef(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isScorer, setIsScorer] = useState(false);
  const canRecordGame = isAdmin || isScorer;
  const [scorerMode, setScorerMode] = useState(false);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const presenceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const visitorIdRef = useRef<string | null>(null);
  const STORAGE_KEY = 'aubl-demo-state';
  const [spectatorFeedLimit, setSpectatorFeedLimit] = useState(FEED_LIMIT);
  const spectatorFeedLimitRef = useRef(FEED_LIMIT);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    spectatorFeedLimitRef.current = spectatorFeedLimit;
  }, [spectatorFeedLimit]);

  useEffect(() => {
    if (!state.activeMatchId) return;
    const activeMatch = state.matches.find((match) => match.id === state.activeMatchId);
    const nextLimit = getSpectatorFeedLimitForMatch(activeMatch, state.gameOver);
    if (spectatorFeedLimitRef.current === nextLimit) return;
    const timer = setTimeout(() => setSpectatorFeedLimit(nextLimit), 0);
    spectatorFeedLimitRef.current = nextLimit;
    return () => clearTimeout(timer);
  }, [state.activeMatchId, state.matches, state.gameOver]);

  // [수정 1] 상태 변경 시 로컬 스토리지에 저장하던 로직을 주석 처리 또는 삭제
  /*
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!state.activeMatchId) return;
    if (!state.gameStarted && state.feed.length === 0 && state.events.length === 0) return;
    const snapshot = snapshotState(state);
    const trimmed: DemoSnapshot = {
      ...snapshot,
      feed: snapshot.feed.slice(0, 150),
      events: snapshot.events.slice(0, 150),
    };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
      // ignore storage quota errors
    }
  }, [state]);
  */

  const pushMatchUpdate = useCallback((matchId: string, overrides: Partial<MatchSchedule> = {}) => {
    const current = stateRef.current.matches.find((m) => m.id === matchId);
    if (!current) return Promise.resolve();
    matchesReadyRef.current = true;

    // [수정] 기본적으로는 빈 슬롯 필터링, 연습경기는 추가 타자 슬롯 유지를 위해 보존
    const filterEmptySlots = (lineup: PlayerSlot[]) =>
      lineup.filter(slot => slot.name && slot.name.trim() !== '');

    const merged = { ...current, ...overrides };
    const preserveEmptySlots = (merged.recordMode ?? 'official') === 'practice';
    const cleanedMatch = {
      ...merged,
      lineups: merged.lineups
        ? preserveEmptySlots
          ? merged.lineups
          : {
              home: filterEmptySlots(merged.lineups.home),
              away: filterEmptySlots(merged.lineups.away),
            }
        : undefined,
    };

    const payload = pruneUndefined(cleanedMatch);
    return setDoc(doc(firestore, 'matches', matchId), payload, { merge: true });
  }, []);

  const purgeMatchFromFirestore = useCallback(async (matchId: string) => {
    const [feedSnap, eventsSnap, presenceSnap] = await Promise.all([
      getDocs(collection(firestore, 'matchStates', matchId, 'feed')),
      getDocs(collection(firestore, 'matchStates', matchId, 'events')),
      getDocs(collection(firestore, 'matchStates', matchId, 'presence')),
    ]);

    const refs = [
      doc(firestore, 'matches', matchId),
      doc(firestore, 'matchStates', matchId),
      ...feedSnap.docs.map((d) => d.ref),
      ...eventsSnap.docs.map((d) => d.ref),
      ...presenceSnap.docs.map((d) => d.ref),
    ];

    const CHUNK_SIZE = 450;
    for (let i = 0; i < refs.length; i += CHUNK_SIZE) {
      const batch = writeBatch(firestore);
      refs.slice(i, i + CHUNK_SIZE).forEach((ref) => batch.delete(ref));
      await batch.commit();
    }
  }, []);

  // [수정 2] 로컬 스토리지에서 불러오던 로직을 삭제하고, 오히려 "초기화(삭제)"하도록 변경
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // 기존에 저장된 데이터가 있다면 충돌 방지를 위해 확실히 삭제합니다.
    // 이렇게 하면 새로고침 시 항상 깨끗한 상태(initialState)로 시작하여 
    // 아래의 onSnapshot 구독들이 파이어베이스의 최신 데이터를 채워넣게 됩니다.
    window.localStorage.removeItem(STORAGE_KEY);

    /* 기존 불러오기 로직은 주석 처리 또는 삭제
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<DemoSnapshot>;
      if (!parsed.activeMatchId) return;
      skipFirestoreWriteRef.current = true;
      dispatch({
        type: 'hydrate',
        state: normalizeState(initialState, {
          ...stateRef.current,
          ...parsed,
          matches: parsed.matches ?? stateRef.current.matches,
        } as DemoState),
      });
    } catch {
      // ignore corrupt cache
    }
    */
  }, []);

  // Determine admin (for schedule write privileges & full subscription)
  useEffect(() => {
    let cancelled = false;
    const unsubscribe = onIdTokenChanged(auth, async (user) => {
      if (cancelled) return;
      if (!user) {
        setIsAdmin(false);
        setIsScorer(false);
        return;
      }
      let adminByClaim = false;
      try {
        const token = await getIdTokenResult(user, true);
        if (cancelled) return;
        adminByClaim = Boolean((token.claims as Record<string, unknown>).admin);
      } catch {
        // ignore token fetch errors; fallback below
      }
      const adminByEmail = ADMIN_EMAILS.includes(user.email?.toLowerCase() ?? '');
      const admin = adminByClaim || adminByEmail;
      if (admin) {
        setIsAdmin(true);
        setIsScorer(false);
        return;
      }

      try {
        const roleDoc = await getDoc(doc(firestore, 'roles', user.uid));
        if (cancelled) return;
        const role = roleDoc.exists() ? roleDoc.data()?.role : null;
        setIsAdmin(false);
        setIsScorer(role === 'scorer');
      } catch {
        if (cancelled) return;
        setIsAdmin(false);
        setIsScorer(false);
      }
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // 새 경기로 전환될 때 이전 feed/events 잔상을 비운다.
  useEffect(() => {
    dispatch({ type: 'setFeed', feed: [] });
    dispatch({ type: 'setEvents', events: [] });
    lastFeedLengthRef.current = 0;
    lastEventsLengthRef.current = 0;
  }, [state.activeMatchId]);

  // Subscribe to schedule for everyone; non-admin은 민감 필드만 제거한 projected 데이터를 사용.
  useEffect(() => {
    return subscribeMatchesSnapshot({
      canRecordGame,
      stateRef,
      skipMatchesWriteRef,
      matchesReadyRef,
      skipFirestoreWriteRef,
      notifiedMatchStartRef,
      dispatch,
    });
  }, [canRecordGame]);

  // Admin: if active match lineups exist in schedule but local game state is empty, resync once.
  useEffect(() => {
    if (!canRecordGame) return;
    const matchId = state.activeMatchId;
    if (!matchId) return;
    if (state.gameStarted || state.gameOver) return;
    const match = state.matches.find((m) => m.id === matchId);
    if (!match?.lineups) return;
    const matchHasPlayers = hasActualPlayers(match.lineups.home) || hasActualPlayers(match.lineups.away);
    const stateIsDemo = isDemoLineups(state.lineups);
    const stateHasPlayers =
      !stateIsDemo && (hasActualPlayers(state.lineups.home) || hasActualPlayers(state.lineups.away));
    if (!matchHasPlayers || stateHasPlayers) return;
    skipFirestoreWriteRef.current = true;
    dispatch({ type: 'selectMatch', matchId, followCurrent: state.followCurrent });
  }, [canRecordGame, state.activeMatchId, state.gameStarted, state.gameOver, state.matches, state.lineups, state.followCurrent]);

  // Listen to current active match pointer so spectators know which match to watch.
  useEffect(() => {
    return subscribeCurrentMatchPointer({
      stateRef,
      skipFirestoreWriteRef,
      dispatch,
    });
  }, []);

  // Live subscribe to the active match state.
  useEffect(() => {
    return subscribeActiveMatchState({
      activeMatchId: state.activeMatchId,
      canRecordGame,
      scorerMode,
      stateRef,
      skipFirestoreWriteRef,
      dispatch,
      initialState,
    });
  }, [state.activeMatchId, canRecordGame, scorerMode]);

  // Subscribe to feed/events subcollections (최근 N개만).
  useEffect(() => {
    return subscribeFeedAndEvents({
      activeMatchId: state.activeMatchId,
      scorerMode,
      spectatorFeedLimit,
      stateRef,
      skipFirestoreWriteRef,
      lastFeedLengthRef,
      lastEventsLengthRef,
      dispatch,
    });
  }, [state.activeMatchId, state.scorerUid, spectatorFeedLimit, scorerMode]);

  // Attempt to acquire scorer lock for the active match.
  useEffect(() => {
    syncScorerLock({
      scorerMode,
      activeMatchId: state.activeMatchId,
      stateRef,
      skipFirestoreWriteRef,
      dispatch,
      initialState,
    });
  }, [state.activeMatchId, scorerMode]);

  // Heartbeat to keep scorer lock fresh; expires automatically when stopped.
  useEffect(() => {
    return syncScorerLockHeartbeat({
      scorerMode,
      activeMatchId: state.activeMatchId,
      scorerUid: state.scorerUid,
      scorerLockedAt: state.scorerLockedAt,
      heartbeatTimerRef,
    });
  }, [state.activeMatchId, state.scorerUid, state.scorerLockedAt, scorerMode]);

  // 동접자 집계: onSnapshot fan-out 대신 count 쿼리 폴링 사용
  useEffect(() => {
    return syncOnlineViewerCount({
      activeMatchId: state.activeMatchId,
      dispatch,
    });
  }, [state.activeMatchId]);

  // 동접자 Heartbeat: 익명/로그인 모두 포함, hidden 상태에서는 heartbeat 중지
  useEffect(() => {
    return syncPresenceHeartbeat({
      activeMatchId: state.activeMatchId,
      visitorIdRef,
      presenceTimerRef,
    });
  }, [state.activeMatchId]);

  // Push game state to Firestore when admin updates locally.
  useEffect(() => {
    return syncGameStateWrite({
      state,
      scorerMode,
      canRecordGame,
      stateRef,
      skipFirestoreWriteRef,
      lastStateKeyRef,
      lastFeedLengthRef,
      lastEventsLengthRef,
      writeTimerRef,
    });
  }, [state, canRecordGame, scorerMode]);

  // Sync schedule changes to Firestore (admin routes only; spectators skip via flag/auth).
  useEffect(() => {
    syncScheduleMatchesWrite({
      matches: state.matches,
      isAdmin,
      matchesReadyRef,
      skipMatchesWriteRef,
      lastMatchesKeyRef,
    });
  }, [state.matches, isAdmin]);

  // 진행 중인 경기 점수는 active match 1건만 patch 저장
  useEffect(() => {
    syncLiveScorePatch({
      canRecordGame,
      activeMatchId: state.activeMatchId,
      matches: state.matches,
      homeScore: state.score.home,
      awayScore: state.score.away,
      lastLiveScoreSyncKeyRef,
      pushMatchUpdate,
    });
  }, [canRecordGame, state.activeMatchId, state.matches, state.score.home, state.score.away, pushMatchUpdate]);

  // Auto purge expired trashed matches (deleted flag) from matches collection.
  useEffect(() => {
    autoPurgeExpiredMatches({
      matches: state.matches,
      purgeMatchFromFirestore,
    });
  }, [state.matches, purgeMatchFromFirestore]);

  const updateCurrentMatchPointer = useCallback((matchId: string | null) => {
    void setDoc(
      doc(firestore, 'app', 'current'),
      { activeMatchId: matchId },
      { merge: true },
    ).catch(() => {});
  }, []);

  const getState = useCallback(() => stateRef.current, []);
  const markMatchesReady = useCallback(() => {
    matchesReadyRef.current = true;
  }, []);
  const markSkipMatchesWrite = useCallback(() => {
    skipMatchesWriteRef.current = true;
  }, []);
  const markSkipFirestoreWrite = useCallback(() => {
    skipFirestoreWriteRef.current = true;
  }, []);
  const setLastFeedLength = useCallback((length: number) => {
    lastFeedLengthRef.current = length;
  }, []);
  const setLastEventsLength = useCallback((length: number) => {
    lastEventsLengthRef.current = length;
  }, []);

  const scheduleActions = useScheduleActions({
    dispatch,
    getState,
    isAdmin: canRecordGame,
    markMatchesReady,
    markSkipMatchesWrite,
    markSkipFirestoreWrite,
    setLastFeedLength,
    setLastEventsLength,
    pushMatchUpdate,
    purgeMatchFromFirestore,
    updateCurrentMatchPointer,
    initialState,
  });

  const gameActions = useGameActions({
    dispatch,
    stateRef,
    spectatorFeedLimitRef,
    setSpectatorFeedLimit,
    pushMatchUpdate,
  });

  const actions = useMemo(
    () => ({
      ...gameActions,
      ...scheduleActions,
      setScorerMode: (enabled: boolean) => setScorerMode(enabled),
    }),
    [gameActions, scheduleActions],
  );

  // Preload 전체 일정(예정/종료) once per actions ref to avoid 빈 목록 when 첫 진입.
  useEffect(() => {
    void actions.loadFullSchedule();
  }, [actions]);

  // Re-fetch schedule after auth state changes so 새로고침 직후에도 전체 일정이 복원된다.
  useEffect(() => {
    const unsub = onIdTokenChanged(auth, () => {
      void actions.loadFullSchedule();
    });
    return () => unsub();
  }, [actions]);

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

import { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState, useCallback } from 'react';
import { getIdTokenResult, onIdTokenChanged } from 'firebase/auth';
import {
  collection,
  doc,
  getCountFromServer,
  onSnapshot,
  orderBy,
  where,
  limit,
  query,
  setDoc,
  writeBatch,
  deleteDoc,
  getDoc,
  getDocs,
  runTransaction,
} from 'firebase/firestore';
import { auth, firestore } from '../firebase/client';
import { TEAMS } from '../lib/mockData';
import type { LeagueDivision } from '../types';

// 헬퍼 함수 추가
const formatUniqueName = (name: string, number: string | number | undefined | null) => {
  if (!name) return '';
  return number ? `${name}(${number})` : name;
};

const extractRuns = (result: string): number => {
  const match = result.match(/(\d+)\s*득점/);
  if (match) {
    const n = Number(match[1]);
    return Number.isFinite(n) && n > 0 ? n : 1;
  }
  if (result.includes('득점')) return 1;
  return 0;
};

const TRASH_RETENTION_MS = 1000 * 60 * 60 * 24 * 30; // 30일 보관
const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAILS ?? '')
  .split(',')
  .map((email: string) => email.trim().toLowerCase())
  .filter(Boolean);
const FEED_LIMIT = 50; // 관중 뷰 기본 구독 크기
const SCORER_FEED_LIMIT = 200; // 기록원 재접속 시 충분한 버퍼
const WRITE_DEBOUNCE_MS = 1_000; // 기록원 상태 동기화 디바운스 (쓰기 폭주 방지)
const SCORER_LOCK_TTL_MS = 300_000; // 5분 후 락 만료 (이닝 교대 대비 여유)
const SCORER_LOCK_HEARTBEAT_MS = 60_000; // 60초마다 하트비트 갱신
const PRESENCE_TTL_MS = 300_000; // 5분 후 동접자 만료
const PRESENCE_HEARTBEAT_MS = 120_000; // 120초마다 동접자 하트비트 갱신
const PRESENCE_POLL_INTERVAL_MS = 12_000; // 접속자 집계 폴링 주기

// Firestore는 undefined를 허용하지 않으므로 중첩 객체/배열에서 undefined를 제거한다.
function pruneUndefined<T>(value: T): T {
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

interface DemoSnapshot {
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

interface DemoState extends DemoSnapshot {
  history: DemoSnapshot[];
}

type SharedGameState = Pick<
  DemoSnapshot,
  | 'inning'
  | 'half'
  | 'balls'
  | 'strikes'
  | 'outs'
  | 'pitchCount'
  | 'bases'
  | 'score'
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
  | { type: 'strike' }
  | { type: 'foul'; isBunt?: boolean }
  | { type: 'strikeOut'; strikeType?: 'swinging' | 'looking' }
  | { type: 'droppedThirdStrike'; variant?: 'strikeout' | 'reach' | 'tag_out'; strikeType?: 'swinging' | 'looking' }
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

// 게임 로직용 슬롯 정규화 함수 (isOhtaniRule 보존 추가)
const normalizePlayerSlotForGame = (player: PlayerSlot): PlayerSlot => ({
  name: typeof player.name === 'string' ? player.name : '',
  pos: typeof player.pos === 'string' ? player.pos : '',
  number: typeof player.number === 'string' ? player.number : '',
  throws: player.throws === 'L' ? 'L' : 'R',
  bats: player.bats === 'L' ? 'L' : 'R',
  order: typeof player.order === 'number' ? player.order : null,
  // [수정] 오타니룰 플래그 보존
  isOhtaniRule: !!player.isOhtaniRule,
  // [수정] 교체 유형 보존 (추가됨: 이 부분이 없으면 게임 로직 진행 중 정보가 사라질 수 있음)
  substitutionType: player.substitutionType,
  // [수정] 선출 플래그 보존
  isElite: !!player.isElite,
});

// 라인업 채움 로직 (UI 9칸 유지 보장 수정)
const ensureLineupFilled = (lineup: PlayerSlot[]) => {
  const normalized = lineup.map(normalizePlayerSlotForGame);
  const hasPitcher = normalized.some((slot) => slot.pos.toUpperCase() === 'P');

  // [수정] DH 유무와 관계없이 항상 "투수가 아닌 타자 9명"을 확보하여 UI(TeamEditor) 입력칸 9개를 유지함.
  // TeamEditor에서는 pos !== 'P' 인 슬롯들만 상단 타자 리스트에 표시하므로,
  // 여기서 투수가 아닌 슬롯이 9개가 되도록 맞춰줍니다.
  let battingCount = normalized.reduce((count, slot) =>
    (slot.pos.toUpperCase() === 'P' ? count : count + 1), 0);

  while (battingCount < 9) {
    normalized.push({ ...emptyPlayerSlot });
    battingCount += 1;
  }

  // 투수가 명시적으로 없으면 별도 슬롯 추가 (TeamEditor 하단 투수칸용)
  if (!hasPitcher) {
    normalized.push({ ...emptyPlayerSlot, pos: 'P' });
  }

  return normalized;
};

const ensureCompleteLineups = (lineups: { home: PlayerSlot[]; away: PlayerSlot[] }) => ({
  home: ensureLineupFilled(lineups.home),
  away: ensureLineupFilled(lineups.away),
});

// 오타니룰 관련 헬퍼 함수
// 투수가 타석에 들어갈 수 있는지 확인 (오타니룰 적용 투수 또는 DH가 없는 경우)
export const canPitcherBat = (player: PlayerSlot, lineup: PlayerSlot[]): boolean => {
  if (player.pos.toUpperCase() !== 'P') return false;
  // 오타니룰 플래그가 설정된 경우
  if (player.isOhtaniRule) return true;
  // DH가 없는 리그인 경우 투수도 타석에 들어감
  const hasDH = lineup.some((slot) => slot.pos.toUpperCase() === 'DH');
  return !hasDH;
};

const teamDivisionById = (teamId?: string): LeagueDivision | undefined => TEAMS.find((team) => team.id === teamId)?.division;
const deriveMatchDivision = (
  division: unknown,
  homeTeamId?: string,
  awayTeamId?: string,
): LeagueDivision | undefined => {
  const normalized =
    typeof division === 'string' ? division.trim().toUpperCase() : undefined;
  if (normalized === 'EUTTEUM' || normalized === 'BEOGEUM') return normalized;
  const homeDiv = teamDivisionById(homeTeamId);
  const awayDiv = teamDivisionById(awayTeamId);
  if (homeDiv && awayDiv && homeDiv === awayDiv) return homeDiv;
  if (homeDiv && !awayDiv) return homeDiv;
  if (awayDiv && !homeDiv) return awayDiv;
  return undefined;
};

function isPracticeMatch(match?: MatchSchedule | null) {
  return match?.recordMode === 'practice';
}

function isPracticeActiveMatch(state: DemoState) {
  if (!state.activeMatchId) return false;
  const activeMatch = state.matches.find((m) => m.id === state.activeMatchId);
  return isPracticeMatch(activeMatch);
}

function getPracticePitcherIndex(lineup: PlayerSlot[]) {
  if (!lineup.length) return -1;
  const lastIndex = lineup.length - 1;
  return lineup[lastIndex].pos.toUpperCase() === 'P' ? lastIndex : -1;
}

function getBattingEntriesForLineup(
  lineup: PlayerSlot[],
  allowExtendedBattingOrder: boolean,
) {
  if (allowExtendedBattingOrder) {
    const pitcherIndex = getPracticePitcherIndex(lineup);
    return lineup.filter((_, idx) => idx !== pitcherIndex);
  }
  return lineup.filter((slot, idx) => {
    if (idx < 9) return true;
    if (slot.pos.toUpperCase() !== 'P') return true;
    return canPitcherBat(slot, lineup);
  });
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

function normalizeFeed(feed: unknown, fallback: { inning: number; half: Half }): PlayLog[] {
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
        // [수정] createdAt 보존
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

  // [수정] 정렬 로직 개선: createdAt이 있으면 최우선으로 사용하여 교체 로그 위치 보정
  return normalized.sort((a, b) => {
    if (a.inning !== b.inning) return a.inning - b.inning;
    if (a.half !== b.half) return a.half === 'top' ? -1 : 1;
    
    // createdAt이 둘 다 있으면 시간순 정렬 (교체 로그가 제자리 찾아감)
    if (a.createdAt !== undefined && b.createdAt !== undefined) {
      return a.createdAt - b.createdAt;
    }
    // 하나만 있으면 없는 쪽(로컬/최신)을 뒤로
    if (a.createdAt === undefined && b.createdAt !== undefined) return 1;
    if (a.createdAt !== undefined && b.createdAt === undefined) return -1;

    // 기존 fallback 정렬
    if (a.order !== b.order) return a.order - b.order;
    return a.pitch - b.pitch;
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

// 데이터 로딩 시 사용되는 정규화 함수 (isOhtaniRule 보존 추가)
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
    // [수정] 오타니룰 플래그 보존
    isOhtaniRule: typeof s.isOhtaniRule === 'boolean' ? s.isOhtaniRule : undefined,
    // [수정] 교체 유형 보존 (추가됨: 이 부분이 없으면 새로고침 시 정보가 사라짐)
    substitutionType:
      typeof s.substitutionType === 'string' &&
      ['대수비', '대타', '대주자'].includes(s.substitutionType)
        ? (s.substitutionType as '대수비' | '대타' | '대주자')
        : undefined,
    // [수정] 선출(선수 출신) 플래그 보존
    isElite: typeof s.isElite === 'boolean' ? s.isElite : undefined,
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
  fields.forEach((key) => {
    if (key === 'name' || key === 'result') return;
    const val = asNumber((p as Record<string, unknown>)[key]);
    if (val !== undefined) (out as Record<string, unknown>)[key] = val;
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
    const val = asNumber((b as Record<string, unknown>)[key]);
    if (val !== undefined) (out as Record<string, unknown>)[key] = val;
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
        division: undefined,
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
      recordMode: match.recordMode === 'practice' ? 'practice' : 'official',
      liveVideoUrl: typeof match.liveVideoUrl === 'string' ? match.liveVideoUrl : undefined,
      liveDelaySeconds: typeof match.liveDelaySeconds === 'number' ? match.liveDelaySeconds : undefined,
      division: deriveMatchDivision(match.division, match.homeTeamId, match.awayTeamId),
      homeScore: typeof match.homeScore === 'number' ? match.homeScore : null,
      awayScore: typeof match.awayScore === 'number' ? match.awayScore : null,
      lineups: normalizeLineups(match.lineups),
      benches: normalizeBenches(match.benches),
      notes: typeof match.notes === 'string' ? match.notes : undefined,
      postGame: normalizePostGame(match.postGame),
      deleted: match.deleted === true,
      deletedAt: typeof match.deletedAt === 'number' ? match.deletedAt : undefined,
      purgeAt: typeof match.purgeAt === 'number' ? match.purgeAt : undefined,
      deletedBy: typeof match.deletedBy === 'string' ? match.deletedBy : undefined,
    };
  });
}

function projectSpectatorMatch(match: MatchSchedule): MatchSchedule {
  return {
    id: match.id,
    homeTeamId: match.homeTeamId,
    awayTeamId: match.awayTeamId,
    homeTeamName: match.homeTeamName,
    awayTeamName: match.awayTeamName,
    startTime: match.startTime,
    venue: match.venue,
    status: match.status,
    recordMode: match.recordMode ?? 'official',
    liveVideoUrl: match.liveVideoUrl,
    liveDelaySeconds: match.liveDelaySeconds,
    division: match.division,
    homeScore: match.homeScore,
    awayScore: match.awayScore,
    deleted: match.deleted,
    deletedAt: match.deletedAt,
    purgeAt: match.purgeAt,
    deletedBy: match.deletedBy,
  };
}

function mergeMatches(base: MatchSchedule[], incoming: MatchSchedule[]) {
  const map = new Map<string, MatchSchedule>();
  base.forEach((m) => map.set(m.id, m));
  incoming.forEach((m) => {
    const existing = map.get(m.id);
    map.set(m.id, existing ? { ...existing, ...m } : m);
  });
  return Array.from(map.values());
}

function normalizeState(base: DemoState, incoming: DemoState): DemoState {
  const merged = { ...base, ...incoming } as DemoState;
  const feed = normalizeFeed(merged.feed, { inning: merged.inning, half: merged.half });
  const events = normalizeEvents(merged.events, { inning: merged.inning, half: merged.half });
  const matches = normalizeMatches(merged.matches ?? base.matches);
  // [수정] 라인업이 완전히 비어있는 경우 자동 채움을 하지 않음
  // 실제 선수가 있는지 확인 (name이 비어있지 않은 슬롯)
  const hasActualPlayers = (lineup: PlayerSlot[]) =>
    lineup.some(slot => slot.name && slot.name.trim() !== '');

  const rawLineups = merged.lineups ?? base.lineups;
  const hasLineups = hasActualPlayers(rawLineups.home) || hasActualPlayers(rawLineups.away);
  const safeLineups = hasLineups ? ensureCompleteLineups(rawLineups) : rawLineups;
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
    scorerUid: string | null;
    scorerName: string | null;
    scorerEmail: string | null;
    scorerRole: string | null;
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
  liveStats: {
    lineScore: { home: number[]; away: number[] };
    hits: { home: number; away: number };
    errors: { home: number; away: number };
  };
}

// [추가] 통계 집계 로직을 demoStore 내부에 추가합니다.
function calculateGameStats(record: GameRecord) {
  const stats = new Map<string, {
    pa: number; ab: number; h: number; singles: number; doubles: number;
    triples: number; hr: number; bb: number; hbp: number; so: number;
    sac: number; fc: number; ci: number; rbi: number; r: number;
  }>();

  const ensureStat = (name: string) => {
    if (!stats.has(name)) {
      stats.set(name, {
        pa: 0, ab: 0, h: 0, singles: 0, doubles: 0, triples: 0,
        hr: 0, bb: 0, hbp: 0, so: 0, sac: 0, fc: 0, ci: 0, rbi: 0, r: 0
      });
    }
    return stats.get(name)!;
  };

  // record.feed는 이미 오래된 순(oldest → newest)으로 정렬되어 있음
  const chronological = record.feed;
  
  chronological.forEach((entry) => {
    const name = entry.batter?.trim();
    if (!name) return;
    
    // 결과 텍스트 분석 (ScorekeeperPage의 classifyResult 로직과 동일)
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
    else if (normalized.includes('낫아웃')) kind = 'so_reach'; // 낫아웃 출루도 삼진으로 카운트
    else if (normalized.includes('삼진')) kind = 'so';
    else if (normalized.includes('아웃') && !normalized.includes('도루')) kind = 'out';
    
    if (!kind) return;
    
    const s = ensureStat(name);
    
    switch (kind) {
      case 'single': s.pa++; s.ab++; s.h++; s.singles++; break;
      case 'double': s.pa++; s.ab++; s.h++; s.doubles++; break;
      case 'triple': s.pa++; s.ab++; s.h++; s.triples++; break;
      case 'hr':     s.pa++; s.ab++; s.h++; s.hr++; break;
      case 'bb':     s.pa++; s.bb++; break;
      case 'ci':     s.pa++; s.ci++; break; // 타격방해는 타석엔 포함, 타수엔 미포함
      case 'fc':     s.pa++; s.ab++; s.fc++; break; // 야수선택은 타수 포함
      case 'hbp':    s.pa++; s.hbp++; break;
      case 'so':     s.pa++; s.ab++; s.so++; break;
      case 'so_reach': s.pa++; s.ab++; s.so++; break; // 낫아웃도 삼진
      case 'out':    s.pa++; s.ab++; break;
      case 'sac':    s.pa++; s.sac++; break;
    }
  });

  // events에서 RBI 집계
  if (record.events) {
    record.events.forEach((event) => {
      if (event.rbi && event.rbi > 0 && event.batter) {
        const s = ensureStat(event.batter.trim());
        s.rbi += event.rbi;
      }
    });
  }

  return stats;
}

export function buildGameRecord(state: DemoState): GameRecord {
  // [추가] 선수 객체의 이름을 '이름(등번호)'로 변환하는 내부 함수
  const transformPlayer = (p: PlayerSlot) => ({
    ...p,
    name: formatUniqueName(p.name, p.number),
  });

  // [추가] 실시간 라인스코어 및 집계 로직
  // state.feed는 이미 오래된 순(oldest → newest)으로 정렬되어 있음
  const chronologicalFeed = state.feed;

  const liveHits = chronologicalFeed.reduce(
    (acc, entry) => {
      const offense = entry.half === 'top' ? 'away' : 'home';
      const txt = entry.result.replace(/\s+/g, '');
      if (txt.includes('1루타') || txt.includes('2루타') || txt.includes('3루타') || txt.includes('홈런')) {
        acc[offense] += 1;
      }
      return acc;
    },
    { home: 0, away: 0 },
  );

  const liveErrors = chronologicalFeed.reduce(
    (acc, entry) => {
      const txt = entry.result.replace(/\s+/g, '');
      const hasError = txt.includes('실책') || /\bE[1-6]\b/i.test(txt);
      if (hasError) {
        const side = entry.half === 'top' ? 'home' : 'away';
        acc[side] += 1;
      }
      return acc;
    },
    { home: 0, away: 0 },
  );

  const liveLine = chronologicalFeed.reduce(
    (acc, entry) => {
      const runs = extractRuns(entry.result);
      if (!runs) return acc;
      const inningIdx = Math.max(0, entry.inning - 1);
      const side = entry.half === 'top' ? 'away' : 'home';
      const target = side === 'home' ? acc.home : acc.away;
      if (target.length <= inningIdx) target.length = inningIdx + 1;
      target[inningIdx] = (target[inningIdx] ?? 0) + runs;
      acc.maxInning = Math.max(acc.maxInning, entry.inning);
      return acc;
    },
    { home: [] as number[], away: [] as number[], maxInning: state.inning },
  );

  const reconcileRuns = (arr: number[], side: 'home' | 'away') => {
    const filled = Array.from({ length: arr.length }, (_, i) => arr[i] ?? 0);
    const sum = filled.reduce((s, v) => s + v, 0);
    const diff = state.score[side] - sum;
    if (diff === 0) return filled;
    const idx = Math.max(0, (liveLine.maxInning || state.inning) - 1);
    if (filled.length <= idx) {
      for (let k = filled.length; k <= idx; k++) filled[k] = 0;
    }
    filled[idx] = Math.max(0, filled[idx] + diff);
    return filled;
  };

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
    
    // [수정] 아래 lineups, benches, removed 부분에 transformPlayer 적용
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
      lineScore: { home: reconcileRuns(liveLine.home, 'home'), away: reconcileRuns(liveLine.away, 'away') },
      hits: liveHits,
      errors: liveErrors,
    },
  };
}

function snapshotState(state: DemoState): DemoSnapshot {
  const { history: _history, ...snapshot } = state;
  const activeMatch = state.activeMatchId
    ? state.matches.find((m) => m.id === state.activeMatchId)
    : null;
  const preserveEmptySlots = isPracticeMatch(activeMatch);
  // [수정] 기본적으로는 빈 슬롯을 제외하여 깜빡임을 줄이되, 연습경기는 추가 타자 슬롯 유지를 위해 보존
  const filterEmptySlots = (lineup: PlayerSlot[]) =>
    lineup.filter(slot => slot.name && slot.name.trim() !== '');

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

function shouldTrackHistory(actionType: Action['type']) {
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
  ];
  const lockBypass: Action['type'][] = ['selectMatch', 'setMatches', 'syncActiveMatch', 'hydrate'];
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
      } else {
        nextState = applyDroppedThirdStrike(state, action.strikeType);
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
        nextState = {
          ...state,
          activeMatchId: selected.id,
          followCurrent: typeof action.followCurrent === 'boolean' ? action.followCurrent : state.followCurrent,
          liveVideoUrl: selected.liveVideoUrl ?? '',
          liveDelaySeconds: selected.liveDelaySeconds ?? 0,
          teamNames: { home: selected.homeTeamName, away: selected.awayTeamName },
          homeTeamId: selected.homeTeamId ?? state.homeTeamId,
          awayTeamId: selected.awayTeamId ?? state.awayTeamId,
          score: {
            home: typeof selected.homeScore === 'number' ? selected.homeScore : state.score.home,
            away: typeof selected.awayScore === 'number' ? selected.awayScore : state.score.away,
          },
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

function ensureHalfPitcherLogged(state: DemoState, feed: PlayLog[]) {
  // 투수 로그 형식: "이름(번호) 투수 (선발)" 또는 "이름(번호) 투수 (N차 계투)"
  const exists = feed.some(
    (entry) =>
      entry.inning === state.inning &&
      entry.half === state.half &&
      (entry.result.includes('투수 (선발)') || entry.result.includes('차 계투)')),
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
  const fcZoneNote = battedBall?.zone && battedBall.zone !== '선택 안 함' ? ` · ${battedBall.zone}` : '';
  const resultLog = runs ? `야수선택${fcZoneNote}${contextNote} · ${runs}득점` : `야수선택${fcZoneNote}${contextNote}`;
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
    // 희생번트로 인한 득점은 타점(RBI)
    const buntZoneNote = battedBall?.zone && battedBall.zone !== '선택 안 함' ? ` · ${battedBall.zone}` : '';
    return applyOut(
      { ...state, bases, score },
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
  // 희생플라이로 인한 득점은 타점(RBI)
  const flyZoneNote = battedBall?.zone && battedBall.zone !== '선택 안 함' ? ` · ${battedBall.zone}` : '';
  return applyOut(
    { ...state, bases, score },
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

function updateMatchSchedule(matches: MatchSchedule[], matchId: string, updates: Partial<MatchSchedule>) {
  return matches.map((match) => (match.id === matchId ? { ...match, ...updates } : match));
}

function resetGameForMatch(state: DemoState, match: MatchSchedule): DemoState {
  // [수정] 경기에 저장된 라인업이 없으면(null/undefined) state.lineups(이전 경기 또는 mock)를 쓰는 대신 빈 라인업으로 초기화
  // [수정] 라인업이 완전히 비어있는 경우(공유 링크 등) 자동 채움을 하지 않음
  // 실제 선수가 있는지 확인 (name이 비어있지 않은 슬롯)
  const hasActualPlayers = (lineup: PlayerSlot[]) =>
    lineup.some(slot => slot.name && slot.name.trim() !== '');

  const rawLineups = match.lineups ?? { home: [], away: [] };
  const hasLineups = hasActualPlayers(rawLineups.home) || hasActualPlayers(rawLineups.away);
  const lineups =
    hasLineups
      ? isPracticeMatch(match)
        ? cloneLineups(rawLineups)
        : ensureCompleteLineups(rawLineups)
      : rawLineups;
  const benches = match.benches ?? { home: [], away: [] };
  return {
    inning: 1,
    half: 'top',
    balls: 0,
    strikes: 0,
    outs: 0,
    pitchCount: 0,
    bases: [null, null, null],
    runnerResponsiblePitcher: { 0: null, 1: null, 2: null },
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
    liveDelaySeconds: state.liveDelaySeconds,
    history: [],
    removed: { home: [], away: [] },
    matches: state.matches,
    activeMatchId: match.id,
  scorerUid: state.scorerUid,
  scorerName: state.scorerName,
  scorerEmail: state.scorerEmail,
  scorerLockedAt: state.scorerLockedAt,
  scorerRole: state.scorerRole,
  scorerPaused: false,
  followCurrent: state.followCurrent,
  gameLimitMinutes: null,
  gameStartTimestamp: null,
  gamePausedAt: null,
  gamePausedDuration: 0,
  onlineViewerCount: state.onlineViewerCount,
  };
}

function createNewGame(state: DemoState): DemoState {
  const preparedLineups = isPracticeActiveMatch(state)
    ? cloneLineups(state.lineups)
    : ensureCompleteLineups(state.lineups);
  return {
    inning: 1,
    half: 'top',
    balls: 0,
    strikes: 0,
    outs: 0,
    pitchCount: 0,
    bases: [null, null, null],
    runnerResponsiblePitcher: { 0: null, 1: null, 2: null },
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
    liveDelaySeconds: state.liveDelaySeconds,
    history: [],
    removed: { home: [], away: [] },
    matches: state.matches,
    activeMatchId: state.activeMatchId,
  scorerUid: state.scorerUid,
  scorerName: state.scorerName,
  scorerEmail: state.scorerEmail,
  scorerLockedAt: state.scorerLockedAt,
    scorerRole: state.scorerRole,
    scorerPaused: false,
    followCurrent: state.followCurrent,
    gameLimitMinutes: null,
    gameStartTimestamp: null,
    gamePausedAt: null,
    gamePausedDuration: 0,
    onlineViewerCount: state.onlineViewerCount,
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
    runnerResponsiblePitcher: { 0: null, 1: null, 2: null },
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
  const battingLineup = getBattingEntriesForLineup(lineup, isPracticeActiveMatch(state));

  const activeLineup = battingLineup.length ? battingLineup : lineup;
  const safeLength = activeLineup.length || 1;
  const idx = state.batterIndex[side] % safeLength;
  const batterSlot = activeLineup[idx];
  const batterName = batterSlot ? formatUniqueName(batterSlot.name, batterSlot.number) : '타자';
  const batterIndex = { ...state.batterIndex, [side]: (idx + 1) % safeLength };
  return { batterName, batterIndex };
}

function updateLineup(state: DemoState, side: Side, index: number, updates: Partial<PlayerSlot>): DemoState {
  const lineup = [...state.lineups[side]];

  // [수정] 배열 경계를 넘어가는 경우 빈 슬롯 추가 (빈 라인업에서 편집 시)
  const emptySlot: PlayerSlot = { name: '', pos: '', number: '', throws: 'R', bats: 'R', order: null };
  while (lineup.length <= index) {
    lineup.push({ ...emptySlot });
  }

  const original = lineup[index];
  lineup[index] = { ...lineup[index], ...updates };

  // 포지션 변경 시 feed에 기록
  let feed = state.feed;
  let lastPlay = state.lastPlay;

  // [수정] 경기가 시작된 상태(state.gameStarted)일 때만 포지션 변경 로그를 남기도록 조건 추가
  if (state.gameStarted && updates.pos && original?.pos && updates.pos !== original.pos) {
    const playerName = original.name || '선수';
    const playerNum = original.number ? `(${original.number})` : '';
    const changeText = `포지션 변경 · ${playerName}${playerNum}: ${original.pos} → ${updates.pos}`;
    feed = pushFeed(state.feed, createLogEntryForBaserunning(state, changeText, 0));
    lastPlay = changeText;
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
      const normalizedNewPos = newPos.toUpperCase();
      if (original && original.pos.toUpperCase() !== normalizedNewPos) {
        const playerName = original.name || '선수';
        const playerNum = original.number ? `(${original.number})` : '';
        changes.push(`${playerName}${playerNum}: ${original.pos} → ${normalizedNewPos}`);
        lineup[index] = { ...original, pos: normalizedNewPos };
      }
    }
  }

  // 벤치 포지션 변경
  if (benchSwaps) {
    for (const { index, newPos } of benchSwaps) {
      if (index >= 0 && index < bench.length) {
        const original = bench[index];
        const normalizedNewPos = newPos.toUpperCase();
        if (original && original.pos.toUpperCase() !== normalizedNewPos) {
          const playerName = original.name || '선수';
          const playerNum = original.number ? `(${original.number})` : '';
          changes.push(`${playerName}${playerNum}: ${original.pos} → ${normalizedNewPos}`);
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

  if (state.gameStarted) {
    const changeText = `포지션 교체 · ${changes.join(', ')}`;
    feed = pushFeed(state.feed, createLogEntryForBaserunning(state, changeText, 0));
    lastPlay = changeText;

    // 야수 → 투수 포지션 변경 시 투수 등판 로그 추가 (투구수 누적을 위해)
    for (const { index, newPos } of swaps) {
      if (index >= 0 && index < lineup.length) {
        const player = lineup[index];
        const normalizedNewPos = newPos.toUpperCase();
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

    // "투수 교체" 또는 "투수"로 끝나는 로그
    if (result.includes('투수 교체') || result.endsWith('투수')) {
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
  let feed = pushFeed(state.feed, createLogEntryForBaserunning(state, changeText, 0));

  // 투수 교체 시 새로운 투수 로그 즉시 추가 (ensureHalfPitcherLogged가 나중에 중복 추가하는 것 방지)
  if (isPitcherChange && incomingIsP) {
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
    lastPlay: changeText,
    feed,
    bases,
  };
}

function getBattingOrder(lineup: PlayerSlot[], lineupIndex: number, allowExtendedBattingOrder = false) {
  const slot = lineup[lineupIndex];
  if (!slot) return null;
  const practicePitcherIndex = allowExtendedBattingOrder ? getPracticePitcherIndex(lineup) : -1;
  if (allowExtendedBattingOrder && lineupIndex === practicePitcherIndex) return null;
  const isBatter =
    (allowExtendedBattingOrder ? true : lineupIndex < 9) ||
    slot.pos.toUpperCase() !== 'P' ||
    canPitcherBat(slot, lineup);

  if (!isBatter) {
    return null;
  }

  let order = 0;
  for (let i = 0; i < lineup.length; i += 1) {
    const player = lineup[i];
    if (allowExtendedBattingOrder && i === practicePitcherIndex) {
      if (i === lineupIndex) return null;
      continue;
    }
    const isCountable =
      (allowExtendedBattingOrder ? true : i < 9) ||
      player.pos.toUpperCase() !== 'P' ||
      canPitcherBat(player, lineup);
    
    if (isCountable) {
      order += 1;
    }
    if (i === lineupIndex) return order;
  }
  return order || null;
}

interface DemoStoreValue {
  state: DemoState;
  actions: {
    addBall: () => void;
    addStrike: () => void;
    addFoul: (isBunt?: boolean) => void;
    strikeOut: (strikeType?: 'swinging' | 'looking') => void;
    droppedThirdStrike: (variant?: 'strikeout' | 'reach' | 'tag_out', strikeType?: 'swinging' | 'looking') => void;
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
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const presenceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const visitorIdRef = useRef<string | null>(null);
  const STORAGE_KEY = 'aubl-demo-state';

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

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
    const run = async () => {
      const user = auth.currentUser;
      if (!user) {
        setIsAdmin(false);
        return;
      }
      try {
        const token = await getIdTokenResult(user, true);
        if (cancelled) return;
        const admin = Boolean((token.claims as Record<string, unknown>).admin) || ADMIN_EMAILS.includes(user.email?.toLowerCase() ?? '');
        setIsAdmin(admin);
      } catch {
        if (cancelled) return;
        setIsAdmin(ADMIN_EMAILS.includes(user.email?.toLowerCase() ?? ''));
      }
    };
    void run();
    return () => {
      cancelled = true;
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
    const matchesCol = collection(firestore, 'matches');
    const liveQuery = query(matchesCol, orderBy('startTime', 'asc'));

    const unsub = onSnapshot(
      liveQuery,
      (snap) => {
        const incoming = snap.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Partial<MatchSchedule>),
        }));
        const normalized = normalizeMatches(incoming);
        const projected = isAdmin ? normalized : normalized.map(projectSpectatorMatch);
        const merged = isAdmin
          ? projected
          : mergeMatches(
              stateRef.current.matches.filter((m) => m.status !== 'inProgress'),
              projected,
            );

        skipMatchesWriteRef.current = true;
        matchesReadyRef.current = true;
        dispatch({ type: 'setMatches', matches: merged });

        // If spectators can't read app/current (권한 제한), auto-follow 첫 진행중 경기.
        if (!stateRef.current.activeMatchId) {
          const live = merged.find((m) => m.status === 'inProgress');
          if (live) {
            skipFirestoreWriteRef.current = true;
            dispatch({ type: 'syncActiveMatch', matchId: live.id });
          }
        }

        // Notify locally when a 경기 status becomes inProgress (start).
        if (typeof window !== 'undefined' && typeof Notification !== 'undefined') {
          const started = projected.filter((m) => m.status === 'inProgress');
          started.forEach((match) => {
            if (notifiedMatchStartRef.current.has(match.id)) return;
            const permission = Notification.permission;
            const show = () => {
              const title = '경기 시작';
              const body = `${match.homeTeamName} vs ${match.awayTeamName} · ${new Date(match.startTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`;
              try {
                new Notification(title, { body });
                notifiedMatchStartRef.current.add(match.id);
              } catch {
                // ignore notification failures
              }
            };
            if (permission === 'granted') {
              show();
            } else if (permission === 'default') {
              void Notification.requestPermission().then((result) => {
                if (result === 'granted') show();
              });
            }
          });
        }
      },
      (error) => {
        console.error('[firestore] matches snapshot error', error);
      },
    );
    return () => unsub();
  }, [isAdmin]);

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
        skipFirestoreWriteRef.current = true;
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

    // 1) Fetch the latest state once immediately so spectators see current data without waiting for the next update.
    void getDoc(stateDoc)
      .then((snap) => {
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
      })
      .catch(() => {
        // ignore initial fetch errors; real-time listener below will retry on updates
      });

    // 2) Subscribe for real-time updates.
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

  // Subscribe to feed/events subcollections (최근 N개만).
  useEffect(() => {
    const matchId = state.activeMatchId;
    if (!matchId) return;

    const isScorer = stateRef.current.scorerUid && stateRef.current.scorerUid === (auth.currentUser?.uid ?? null);
    // 기록원이면 구독하지 않음 (로컬 상태가 Firestore 구독으로 덮어써지는 것을 방지)
    if (isScorer) return;

    const maxEntries = FEED_LIMIT;

    const feedQuery = query(
      collection(firestore, 'matchStates', matchId, 'feed'),
      orderBy('createdAt', 'desc'),
      limit(maxEntries),
    );
    const eventsQuery = query(
      collection(firestore, 'matchStates', matchId, 'events'),
      orderBy('createdAt', 'desc'),
      limit(maxEntries),
    );

    // One-time fetch to prefill feed/events for spectators so 기존 기록이 즉시 보임.
    const prime = async () => {
      try {
        const [feedSnap, eventsSnap] = await Promise.all([getDocs(feedQuery), getDocs(eventsQuery)]);
        const fallback = { inning: stateRef.current.inning, half: stateRef.current.half as Half };
        const feedEntries = normalizeFeed(
          feedSnap.docs.map((d) => d.data()),
          fallback,
        );
        const eventEntries = normalizeEvents(
          eventsSnap.docs.map((d) => d.data()),
          fallback,
        );
        skipFirestoreWriteRef.current = true;
        lastFeedLengthRef.current = feedEntries.length;
        lastEventsLengthRef.current = eventEntries.length;
        dispatch({ type: 'setFeed', feed: feedEntries });
        dispatch({ type: 'setEvents', events: eventEntries });
      } catch {
        // ignore prefetch errors; realtime listener below will retry on updates
      }
    };
    void prime();

    const unsubFeed = onSnapshot(
      feedQuery,
      (snap) => {
        const fallback = { inning: stateRef.current.inning, half: stateRef.current.half as Half };
        const feedEntries = normalizeFeed(
          snap.docs.map((d) => d.data()),
          fallback,
        );
        skipFirestoreWriteRef.current = true;
        lastFeedLengthRef.current = feedEntries.length;
        dispatch({ type: 'setFeed', feed: feedEntries });
      },
      () => {
        // ignore feed snapshot errors
      },
    );

    const unsubEvents = onSnapshot(
      eventsQuery,
      (snap) => {
        const fallback = { inning: stateRef.current.inning, half: stateRef.current.half as Half };
        const eventsEntries = normalizeEvents(
          snap.docs.map((d) => d.data()),
          fallback,
        );
        skipFirestoreWriteRef.current = true;
        lastEventsLengthRef.current = eventsEntries.length;
        dispatch({ type: 'setEvents', events: eventsEntries });
      },
      () => {
        // ignore events snapshot errors
      },
    );

    return () => {
      unsubFeed();
      unsubEvents();
    };
  }, [state.activeMatchId, state.scorerUid]);

  // Attempt to acquire scorer lock for the active match.
  useEffect(() => {
    const matchId = state.activeMatchId;
    const user = auth.currentUser;
    if (!matchId || !user) return;
    const run = async () => {
      const stateDoc = doc(firestore, 'matchStates', matchId);
      const now = Date.now();
      const roleLabel = await resolveUserRole(user);
      await runTransaction(firestore, async (tx) => {
        const snap = await tx.get(stateDoc);
        const data = snap.exists()
          ? (snap.data() as SharedGameState & { scorerUid?: string | null; scorerName?: string | null; scorerEmail?: string | null; scorerLockedAt?: number | null; scorerRole?: string | null })
          : null;
        const owner = data?.scorerUid;
        const lockedAt = data?.scorerLockedAt ?? 0;
        const expired = !lockedAt || now - lockedAt > SCORER_LOCK_TTL_MS;
        if (owner && owner !== user.uid && !expired) {
          return;
        }
        tx.set(
          stateDoc,
          {
            scorerUid: user.uid,
            scorerName: user.displayName ?? null,
            scorerEmail: user.email ?? null,
            scorerLockedAt: now,
            scorerRole: data?.scorerRole ?? roleLabel,
          },
          { merge: true },
        );
      });
      if (stateRef.current.activeMatchId !== matchId) return;
      skipFirestoreWriteRef.current = true;
      dispatch({
        type: 'hydrate',
        state: normalizeState(initialState, {
          ...stateRef.current,
          scorerUid: user.uid,
          scorerName: user.displayName ?? null,
          scorerEmail: user.email ?? null,
          scorerLockedAt: stateRef.current.scorerLockedAt ?? now,
          scorerRole: stateRef.current.scorerRole ?? roleLabel,
          matches: stateRef.current.matches,
        }),
      });
    };
    void run().catch(() => {
      // ignore lock acquisition errors
    });
  }, [state.activeMatchId]);

  // Heartbeat to keep scorer lock fresh; expires automatically when stopped.
  useEffect(() => {
    const matchId = state.activeMatchId;
    const user = auth.currentUser;
    const isOwner = matchId && user && state.scorerUid === user.uid;
    const expired = !state.scorerLockedAt || Date.now() - state.scorerLockedAt > SCORER_LOCK_TTL_MS;
    if (!isOwner || !matchId) return;

    // If somehow expired but still owner, refresh immediately.
    if (expired) {
      void setDoc(
        doc(firestore, 'matchStates', matchId),
        { scorerUid: user!.uid, scorerLockedAt: Date.now() },
        { merge: true },
      ).catch(() => {});
    }

    heartbeatTimerRef.current = setInterval(() => {
      const now = Date.now();
      void setDoc(
        doc(firestore, 'matchStates', matchId),
        { scorerUid: user!.uid, scorerLockedAt: now },
        { merge: true },
      ).catch(() => {});
    }, SCORER_LOCK_HEARTBEAT_MS);

    return () => {
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    };
  }, [state.activeMatchId, state.scorerUid, state.scorerLockedAt]);

  // 동접자 집계: onSnapshot fan-out 대신 count 쿼리 폴링 사용
  useEffect(() => {
    const matchId = state.activeMatchId;
    if (!matchId) {
      dispatch({ type: 'setOnlineViewerCount', count: 0 });
      return;
    }

    const presenceCol = collection(firestore, 'matchStates', matchId, 'presence');
    let cancelled = false;

    const pollViewerCount = async () => {
      try {
        const now = Date.now();
        const countQuery = query(presenceCol, where('expiresAt', '>=', now));
        const aggregate = await getCountFromServer(countQuery);
        if (cancelled) return;
        dispatch({ type: 'setOnlineViewerCount', count: aggregate.data().count });
      } catch {
        // ignore count errors
      }
    };

    void pollViewerCount();
    const timer = setInterval(() => {
      void pollViewerCount();
    }, PRESENCE_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [state.activeMatchId]);

  // 동접자 Heartbeat: 익명/로그인 모두 포함, hidden 상태에서는 heartbeat 중지
  useEffect(() => {
    const matchId = state.activeMatchId;
    if (!matchId) return;

    const getVisitorId = (): string => {
      if (visitorIdRef.current) return visitorIdRef.current;
      const user = auth.currentUser;
      if (user) {
        visitorIdRef.current = user.uid;
        return user.uid;
      }
      const storageKey = 'aubl-visitor-id';
      let vid = sessionStorage.getItem(storageKey);
      if (!vid) {
        vid = `anon_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        sessionStorage.setItem(storageKey, vid);
      }
      visitorIdRef.current = vid;
      return vid;
    };

    const visitorId = getVisitorId();
    const presenceDocRef = doc(firestore, 'matchStates', matchId, 'presence', visitorId);

    const updatePresence = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      const now = Date.now();
      void setDoc(
        presenceDocRef,
        {
          visitorId,
          isAnonymous: auth.currentUser == null,
          lastHeartbeat: now,
          expiresAt: now + PRESENCE_TTL_MS,
        },
        { merge: true },
      ).catch(() => {});
    };

    const stopHeartbeat = () => {
      if (!presenceTimerRef.current) return;
      clearInterval(presenceTimerRef.current);
      presenceTimerRef.current = null;
    };

    const startHeartbeat = () => {
      stopHeartbeat();
      presenceTimerRef.current = setInterval(() => {
        updatePresence();
      }, PRESENCE_HEARTBEAT_MS);
    };

    const handleVisibilityChange = () => {
      if (typeof document === 'undefined') return;
      if (document.visibilityState === 'hidden') {
        stopHeartbeat();
        return;
      }
      updatePresence();
      startHeartbeat();
    };

    updatePresence();
    startHeartbeat();

    const handleBeforeUnload = () => {
      void deleteDoc(presenceDocRef).catch(() => {});
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      stopHeartbeat();
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      void deleteDoc(presenceDocRef).catch(() => {});
    };
  }, [state.activeMatchId]);

  // Push game state to Firestore when admin updates locally.
  useEffect(() => {
    const matchId = state.activeMatchId;
    const currentUid = auth.currentUser?.uid ?? null;
    if (!matchId || !currentUid) return;
    if (state.scorerUid && state.scorerUid !== currentUid) return;
    if (skipFirestoreWriteRef.current) {
      skipFirestoreWriteRef.current = false;
      lastStateKeyRef.current = '';
      lastFeedLengthRef.current = state.feed.length;
      lastEventsLengthRef.current = state.events.length;
      return;
    }
    // 디바운스: 잦은 pitch 입력 시 write 폭주 방지
    if (writeTimerRef.current) clearTimeout(writeTimerRef.current);

    writeTimerRef.current = setTimeout(() => {
            const snapshot = snapshotState(stateRef.current);
            const { matches: _matches, feed: _feed, events: _events, onlineViewerCount: _onlineViewerCount, ...core } = snapshot;
            const key = JSON.stringify({ matchId, core });

            if (key !== lastStateKeyRef.current) {
              lastStateKeyRef.current = key;

              const payload = pruneUndefined({
                ...core,
                updatedAt: Date.now()
              });

              void setDoc(
                doc(firestore, 'matchStates', matchId),
                payload,
                { merge: true },
              ).catch((err) => {
                console.error("Firestore Save Error:", err); // 에러 확인용 로그 추가
              });
            }

      const newFeedCount = stateRef.current.feed.length - lastFeedLengthRef.current;
      const newEventCount = stateRef.current.events.length - lastEventsLengthRef.current;

      if (newFeedCount <= 0 && newEventCount <= 0) {
        lastFeedLengthRef.current = stateRef.current.feed.length;
        lastEventsLengthRef.current = stateRef.current.events.length;
        return;
      }

      const batch = writeBatch(firestore);
      const now = Date.now();

      if (newFeedCount > 0) {
        // 배열 끝에서부터 새로운 항목 가져오기
        const newEntries = stateRef.current.feed.slice(-newFeedCount);
        newEntries.forEach((entry, idx) => {
          const createdAt =
            typeof entry.createdAt === 'number' && Number.isFinite(entry.createdAt)
              ? entry.createdAt
              : now + idx;
          batch.set(
            doc(collection(firestore, 'matchStates', matchId, 'feed')),
            pruneUndefined({ ...entry, createdAt }),
          );
        });
      }

      if (newEventCount > 0) {
        // 배열 끝에서부터 새로운 항목 가져오기
        const newEntries = stateRef.current.events.slice(-newEventCount);
        newEntries.forEach((entry, idx) => {
          const createdAt =
            typeof entry.createdAt === 'number' && Number.isFinite(entry.createdAt)
              ? entry.createdAt
              : now + idx;
          batch.set(
            doc(collection(firestore, 'matchStates', matchId, 'events')),
            pruneUndefined({ ...entry, createdAt }),
          );
        });
      }

      void batch
        .commit()
        .then(() => {
          lastFeedLengthRef.current = stateRef.current.feed.length;
          lastEventsLengthRef.current = stateRef.current.events.length;
        })
        .catch(() => {
          // ignore sync errors; will retry on next state change
        });
    }, WRITE_DEBOUNCE_MS);

    return () => {
      if (writeTimerRef.current) {
        clearTimeout(writeTimerRef.current);
        writeTimerRef.current = null;
      }
    };
  }, [state]);

  // Sync schedule changes to Firestore (admin routes only; spectators skip via flag/auth).
  useEffect(() => {
    if (!isAdmin) return;
    if (!matchesReadyRef.current) return;
    if (skipMatchesWriteRef.current) {
      skipMatchesWriteRef.current = false;
      return;
    }
    const key = JSON.stringify(
      state.matches.map((m) => ({
        id: m.id,
        status: m.status,
        startTime: m.startTime,
        notes: m.notes ?? null,
        division: m.division ?? null,
        venue: m.venue,
        recordMode: m.recordMode ?? 'official',
        homeTeamName: m.homeTeamName,
        awayTeamName: m.awayTeamName,
        liveVideoUrl: m.liveVideoUrl ?? null,
        liveDelaySeconds: m.liveDelaySeconds ?? null,
        deleted: m.deleted ?? false,
        deletedAt: m.deletedAt ?? null,
        purgeAt: m.purgeAt ?? null,
        lineups: m.lineups ?? null,
        benches: m.benches ?? null,
        postGame: m.postGame ?? null,
      })),
    );
    if (key === lastMatchesKeyRef.current) return;
    lastMatchesKeyRef.current = key;
    const syncMatches = async () => {
      const batch = writeBatch(firestore);
      const filterEmptySlots = (lineup: PlayerSlot[]) =>
        lineup.filter(slot => slot.name && slot.name.trim() !== '');

      state.matches.forEach((match) => {
        const preserveEmptySlots = (match.recordMode ?? 'official') === 'practice';
        // [수정] 기본적으로는 빈 슬롯 필터링, 연습경기는 추가 타자 슬롯 유지를 위해 보존
        const cleanedMatch = {
          ...match,
          lineups: match.lineups
            ? preserveEmptySlots
              ? match.lineups
              : {
                  home: filterEmptySlots(match.lineups.home),
                  away: filterEmptySlots(match.lineups.away),
                }
            : undefined,
        };
        batch.set(doc(firestore, 'matches', match.id), pruneUndefined(cleanedMatch), { merge: true });
      });
      await batch.commit();
    };
    void syncMatches().catch(() => {});
  }, [state.matches, isAdmin]);

  // 진행 중인 경기 점수는 active match 1건만 patch 저장
  useEffect(() => {
    if (!isAdmin) return;
    const matchId = state.activeMatchId;
    if (!matchId) return;
    const activeMatch = state.matches.find((m) => m.id === matchId);
    if (!activeMatch || activeMatch.status !== 'inProgress') return;
    const homeScore = state.score.home;
    const awayScore = state.score.away;
    const scoreKey = `${matchId}:${homeScore}:${awayScore}`;
    if (scoreKey === lastLiveScoreSyncKeyRef.current) return;
    lastLiveScoreSyncKeyRef.current = scoreKey;
    void pushMatchUpdate(matchId, { homeScore, awayScore }).catch(() => {});
  }, [isAdmin, state.activeMatchId, state.matches, state.score.home, state.score.away, pushMatchUpdate]);

  // Auto purge expired trashed matches (deleted flag) from matches collection.
  useEffect(() => {
    const now = Date.now();
    const expired = state.matches.filter((m) => m.deleted && m.purgeAt && m.purgeAt <= now);
    if (!expired.length) return;
    expired.forEach((entry) => {
      void purgeMatchFromFirestore(entry.id).catch(() => {});
    });
  }, [state.matches, purgeMatchFromFirestore]);

  const updateCurrentMatchPointer = (matchId: string | null) => {
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
      addFoul: (isBunt?: boolean) => dispatch({ type: 'foul', isBunt }),
      strikeOut: (strikeType?: 'swinging' | 'looking') => dispatch({ type: 'strikeOut', strikeType }),
      droppedThirdStrike: (variant?: 'strikeout' | 'reach' | 'tag_out', strikeType?: 'swinging' | 'looking') => dispatch({ type: 'droppedThirdStrike', variant, strikeType }),
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
      multipleRunnersOut: (bases: number[], label?: string) => dispatch({ type: 'multipleRunnersOut', bases, label }),
      addManualLog: (message: string) => dispatch({ type: 'manualLog', message }),
      setLiveVideoUrl: (url: string) => {
        dispatch({ type: 'setLiveVideoUrl', url });
        const matchId = stateRef.current.activeMatchId;
        if (!matchId) return;
        const trimmed = url.trim();
        // persist to matches collection so 일정/오버레이 버튼이 올바르게 판단
        void setDoc(
          doc(firestore, 'matches', matchId),
          { liveVideoUrl: trimmed },
          { merge: true },
        ).catch(() => {});
      },
      setLiveDelaySeconds: (seconds: number) => {
        dispatch({ type: 'setLiveDelaySeconds', seconds });
        const matchId = stateRef.current.activeMatchId;
        if (!matchId) return;
        const validSeconds = Math.max(0, seconds);
        // persist to matches collection
        void setDoc(
          doc(firestore, 'matches', matchId),
          { liveDelaySeconds: validSeconds },
          { merge: true },
        ).catch(() => {});
      },
      addOutWithMessage: (note: string, battedBall?: BattedBallDetails | null) =>
        dispatch({ type: 'outWithMessage', note, battedBall }),
      doublePlay: (battedBall?: BattedBallDetails | null, selectedRunners?: number[], route?: number[], runnerAdvancements?: Record<number, number>) =>
        dispatch({ type: 'doublePlay', battedBall, selectedRunners, route, runnerAdvancements }),
      triplePlay: (battedBall?: BattedBallDetails | null, selectedRunners?: number[], route?: number[], runnerAdvancements?: Record<number, number>) =>
        dispatch({ type: 'triplePlay', battedBall, selectedRunners, route, runnerAdvancements }),
      setTeamName: (side: Side, name: string) => dispatch({ type: 'setTeamName', side, name }),
      setLineup: (side: Side, index: number, updates: Partial<PlayerSlot>) =>
        dispatch({ type: 'setLineup', side, index, updates }),
      removeLineupSlot: (side: Side, index: number) =>
        dispatch({ type: 'removeLineupSlot', side, index }),
      removePracticeBatter: (side: Side, battingOrderIndex: number) =>
        dispatch({ type: 'removePracticeBatter', side, battingOrderIndex }),
      swapPositions: (side: Side, swaps: { index: number; newPos: string }[], benchSwaps?: { index: number; newPos: string }[]) =>
        dispatch({ type: 'swapPositions', side, swaps, benchSwaps }),
      addBench: (side: Side, player: PlayerSlot) => dispatch({ type: 'addBench', side, player }),
      removeBench: (side: Side, benchIndex: number) => dispatch({ type: 'removeBench', side, benchIndex }),
      substitute: (side: Side, benchIndex: number, lineupIndex: number, substitutionType?: '대수비' | '대타' | '대주자') =>
        dispatch({ type: 'substitute', side, benchIndex, lineupIndex, substitutionType }),
      setPlay: (message: string) => dispatch({ type: 'setPlay', message }),
      startGame: () => {
        dispatch({ type: 'startGame' });
        const matchId = stateRef.current.activeMatchId;
        if (matchId) {
          void pushMatchUpdate(matchId, { status: 'inProgress' }).catch(() => {});
        }
      },
     // [수정] endGame 액션에서 상세 스탯을 계산하여 저장하도록 수정
      endGame: (endedAt: string) => {
        dispatch({ type: 'endGame', endedAt });
        const matchId = stateRef.current.activeMatchId;
        if (matchId) {
          const snapshot = stateRef.current;
          const activeMatch = snapshot.matches.find((m) => m.id === matchId);
          const isPractice = isPracticeMatch(activeMatch);

          if (isPractice) {
            void pushMatchUpdate(matchId, {
              status: 'completed',
              homeScore: snapshot.score.home,
              awayScore: snapshot.score.away,
              postGame: undefined,
            }).catch(() => {});
            return;
          }
          
          // 상세 기록 산출
          const gameRecord = buildGameRecord(snapshot);
          const statsMap = calculateGameStats(gameRecord);
          
          // PostGameRecord 형식으로 변환 함수
          const toBatterLines = (side: 'home' | 'away'): PostGameBatterLine[] => {
            return snapshot.lineups[side]
              .filter(p => p.pos.toUpperCase() !== 'P')
              .map(p => {
                // 이름(등번호) 형식 맞추기
                const uniqueName = p.number ? `${p.name}(${p.number})` : p.name;
                const stat = statsMap.get(uniqueName) ?? statsMap.get(p.name); // uniqueName으로 찾고 없으면 이름으로 시도
                
                return {
                  name: uniqueName, // 저장될 때도 이름(등번호)
                  pos: p.pos,
                  order: typeof p.order === 'number' ? p.order : undefined,
                  // 여기서부터 세부 스탯 매핑
                  pa: stat?.pa ?? 0,
                  ab: stat?.ab ?? 0,
                  h: stat?.h ?? 0,
                  singles: stat?.singles ?? 0,
                  doubles: stat?.doubles ?? 0,
                  triples: stat?.triples ?? 0,
                  hr: stat?.hr ?? 0,
                  bb: stat?.bb ?? 0,
                  hbp: stat?.hbp ?? 0,
                  so: stat?.so ?? 0,
                  sac: stat?.sac ?? 0,
                  fc: stat?.fc ?? 0,
                  // 득점(R)과 타점(RBI)은 현재 자동 집계가 안되므로 일단 0이나 기존 로직 따름
                  // 필요하다면 추후 calculateGameStats에서 r, rbi 로직도 추가 가능
                };
              });
          };

          const postGame: PostGameRecord = {
            lineScore: { innings: [], home: [], away: [] }, // 라인스코어는 별도 로직이 있거나 비워둠
            totals: { // 팀 합계 (간단 계산)
              home: { runs: snapshot.score.home, hits: 0, errors: 0 },
              away: { runs: snapshot.score.away, hits: 0, errors: 0 }
            },
            batters: {
              home: toBatterLines('home'),
              away: toBatterLines('away'),
            },
            // 투수 기록 등도 필요하면 여기서 추가 (현재는 타자 위주)
          };

          void pushMatchUpdate(matchId, {
            status: 'completed',
            homeScore: snapshot.score.home,
            awayScore: snapshot.score.away,
            postGame, // 상세 기록 저장
          }).catch(() => {});
        }
      },
      resetGame: () => dispatch({ type: 'resetGame' }),
      undo: () => dispatch({ type: 'undo' }),
      addMatch: (match: MatchSchedule) => {
        matchesReadyRef.current = true;

        // [수정] ID 생성 로직 추가 (날짜-홈팀-어웨이팀)
        // 기존의 랜덤 ID(match-xxxx) 대신 읽기 편한 포맷으로 변경합니다.
        const dateObj = new Date(match.startTime);
        const yyyy = dateObj.getFullYear();
        const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
        const dd = String(dateObj.getDate()).padStart(2, '0');
        
        // 팀 이름에서 공백 제거 (예: "LG 트윈스" -> "LG트윈스")
        const cleanName = (name: string) => name.trim().replace(/\s+/g, '');
        const home = cleanName(match.homeTeamName || 'Home');
        const away = cleanName(match.awayTeamName || 'Away');

        // 최종 ID: 20260130-Home-Away
        const customId = `${yyyy}${mm}${dd}-${home}-${away}`;
        const matchWithId = { ...match, id: customId };

        dispatch({ type: 'addMatch', match: matchWithId });
        
        // Firestore 저장 (새로운 ID 사용)
        void setDoc(doc(firestore, 'matches', matchWithId.id), pruneUndefined(matchWithId), { merge: true });
      },
      updateMatch: (matchId: string, updates: Partial<MatchSchedule>) => {
        matchesReadyRef.current = true;
        dispatch({ type: 'updateMatch', matchId, updates });
      },
      deleteMatch: (matchId: string) => {
        matchesReadyRef.current = true;
        dispatch({ type: 'deleteMatch', matchId });
        if (stateRef.current.activeMatchId === matchId) {
          updateCurrentMatchPointer(null);
        }
      },
      moveMatchToTrash: (matchId: string) => {
        const target = stateRef.current.matches.find((m) => m.id === matchId);
        if (!target) return;
        const deletedAt = Date.now();
        const payload: MatchSchedule = {
          ...target,
          deleted: true,
          deletedAt,
          purgeAt: deletedAt + TRASH_RETENTION_MS,
          deletedBy: auth.currentUser?.uid,
        };
        matchesReadyRef.current = true;
        dispatch({ type: 'moveMatchToTrash', matchId, entry: payload });
        void setDoc(doc(firestore, 'matches', matchId), pruneUndefined(payload), { merge: true }).catch(() => {
          // rollback locally if write fails
          dispatch({ type: 'restoreMatch', matchId });
          if (typeof window !== 'undefined') window.alert('삭제 권한을 확인해주세요. (휴지통 이동 실패)');
        });
        if (stateRef.current.activeMatchId === matchId) {
          updateCurrentMatchPointer(null);
        }
      },
      restoreMatch: (matchId: string) => {
        const entry = stateRef.current.matches.find((t) => t.id === matchId && t.deleted);
        if (!entry) return;
        matchesReadyRef.current = true;
        dispatch({ type: 'restoreMatch', matchId });
        const restored = { ...entry };
        delete restored.deleted;
        delete restored.deletedAt;
        delete restored.purgeAt;
        delete restored.deletedBy;
        void setDoc(doc(firestore, 'matches', matchId), pruneUndefined(restored), { merge: true }).catch(() => {
          // rollback locally if write fails
          dispatch({ type: 'moveMatchToTrash', matchId, entry });
          if (typeof window !== 'undefined') window.alert('복원 권한을 확인해주세요. (복원 실패)');
        });
      },
      purgeTrash: (matchId: string) => {
        matchesReadyRef.current = true;
        dispatch({ type: 'purgeTrash', matchId });
        if (stateRef.current.activeMatchId === matchId) {
          updateCurrentMatchPointer(null);
        }

        // matches + matchStates + 하위 컬렉션(feed/events/presence)까지 완전 삭제
        void (async () => {
          try {
            await purgeMatchFromFirestore(matchId);
          } catch (error) {
            console.error('Purge error:', error);
            if (typeof window !== 'undefined') window.alert('영구 삭제 권한을 확인해주세요. (삭제 실패)');
          }
        })();
      },
      saveMatchLineups: (
        matchId: string,
        lineups: { home: PlayerSlot[]; away: PlayerSlot[] },
        benches: { home: PlayerSlot[]; away: PlayerSlot[] },
      ) => {
        matchesReadyRef.current = true;
        dispatch({ type: 'saveMatchLineups', matchId, lineups, benches });
      },
      selectMatch: (matchId: string | null) => {
        const followCurrent = isAdmin;
        skipFirestoreWriteRef.current = true;
        dispatch({ type: 'selectMatch', matchId, followCurrent });
        if (isAdmin) updateCurrentMatchPointer(matchId);
        if (!matchId) return;
        const matchIdLocal = matchId;
        void (async () => {
          try {
            // Prime matchStates document
            const stateDoc = doc(firestore, 'matchStates', matchIdLocal);
            const snap = await getDoc(stateDoc);
            if (snap.exists()) {
              const data = snap.data() as SharedGameState & { feed?: PlayLog[]; events?: PlayEvent[] };
              skipFirestoreWriteRef.current = true;
              dispatch({
                type: 'hydrate',
                state: normalizeState(initialState, {
                  ...stateRef.current,
                  ...data,
                  matches: stateRef.current.matches,
                }),
              });
            }
            // Prime feed/events subcollections
            const isScorer = stateRef.current.scorerUid && stateRef.current.scorerUid === (auth.currentUser?.uid ?? null);
            const maxEntries = isScorer ? SCORER_FEED_LIMIT : FEED_LIMIT;
            const fallback = { inning: stateRef.current.inning, half: stateRef.current.half as Half };
            const [feedSnap, eventsSnap] = await Promise.all([
              getDocs(
                query(
                  collection(firestore, 'matchStates', matchIdLocal, 'feed'),
                  orderBy('createdAt', 'desc'),
                  limit(maxEntries),
                ),
              ),
              getDocs(
                query(
                  collection(firestore, 'matchStates', matchIdLocal, 'events'),
                  orderBy('createdAt', 'desc'),
                  limit(maxEntries),
                ),
              ),
            ]);
            const feedEntries = normalizeFeed(
              feedSnap.docs.map((d) => d.data()),
              fallback,
            );
            const eventEntries = normalizeEvents(
              eventsSnap.docs.map((d) => d.data()),
              fallback,
            );
            skipFirestoreWriteRef.current = true;
            lastFeedLengthRef.current = feedEntries.length;
            lastEventsLengthRef.current = eventEntries.length;
            dispatch({ type: 'setFeed', feed: feedEntries });
            dispatch({ type: 'setEvents', events: eventEntries });
          } catch {
            // ignore; realtime listener will still try
          }
        })();
      },
      loadFullSchedule: async () => {
        try {
          const snap = await getDocs(
            query(
              collection(firestore, 'matches'),
              where('status', 'in', ['scheduled', 'inProgress', 'completed', 'canceled']),
            ),
          );
          const incoming = snap.docs.map((docSnap) => ({
            id: docSnap.id,
            ...(docSnap.data() as Partial<MatchSchedule>),
          }));
          const normalized = normalizeMatches(incoming);
          const projected = isAdmin ? normalized : normalized.map(projectSpectatorMatch);
          skipMatchesWriteRef.current = true;
          matchesReadyRef.current = true;
          dispatch({
            type: 'setMatches',
            matches: mergeMatches(stateRef.current.matches, projected),
          });
        } catch {
          // ignore fetch errors for spectators; manual retry via action
        }
      },
      releaseLock: () => {
        dispatch({ type: 'releaseLock' });
        const matchId = stateRef.current.activeMatchId;
        const user = auth.currentUser;
        if (!matchId || !user) return;
        void setDoc(
          doc(firestore, 'matchStates', matchId),
          {
            scorerUid: null,
            scorerName: null,
            scorerEmail: null,
            scorerLockedAt: null,
            scorerRole: null,
            scorerPaused: true,
            updatedAt: Date.now(),
          },
          { merge: true },
        ).catch(() => {});
      },
      resumeLock: () => {
        const matchId = stateRef.current.activeMatchId;
        const user = auth.currentUser;
        if (!matchId || !user) return;
        const lockedAt = Date.now();
        const payload = {
          scorerUid: user.uid,
          scorerName: user.displayName ?? null,
          scorerEmail: user.email ?? null,
          scorerLockedAt: lockedAt,
          scorerRole: stateRef.current.scorerRole ?? null,
          scorerPaused: false,
        };
        void runTransaction(firestore, async (tx) => {
          const ref = doc(firestore, 'matchStates', matchId);
          const snap = await tx.get(ref);
          const data = snap.exists() ? (snap.data() as SharedGameState) : null;
          const owner = data?.scorerUid ?? null;
          const locked = data?.scorerLockedAt ?? 0;
          const expired = !locked || Date.now() - locked > SCORER_LOCK_TTL_MS;
          if (owner && owner !== user.uid && !expired) {
            return;
          }
          tx.set(ref, { ...payload, updatedAt: Date.now() }, { merge: true });
        }).catch(() => {});
        dispatch({
          type: 'resumeLock',
          payload: {
            scorerUid: user.uid,
            scorerName: user.displayName ?? null,
            scorerEmail: user.email ?? null,
            scorerRole: stateRef.current.scorerRole ?? null,
            lockedAt,
          },
        });
      },
      setGameLimit: (minutes: number | null) => dispatch({ type: 'setGameLimit', minutes }),
      pauseGameTimer: () => dispatch({ type: 'pauseGameTimer' }),
      resumeGameTimer: () => dispatch({ type: 'resumeGameTimer' }),
    }),
    [isAdmin, pushMatchUpdate],
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
async function resolveUserRole(user: typeof auth.currentUser): Promise<string | null> {
  if (!user) return null;
  try {
    const token = await getIdTokenResult(user, true);
    if ((token.claims as Record<string, unknown>).admin) return '관리자';
  } catch {
    // ignore token fetch errors; fall back to email list
  }
  const email = user.email?.toLowerCase();
  if (email && ADMIN_EMAILS.includes(email)) return '관리자';
  return '일반';
}

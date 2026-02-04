/**
 * 백엔드 API 타입 정의
 */

// 백엔드 API 요청/응답 타입

export interface CreateGameRequest {
  seasonId: number;
  gameDate: string; // YYYY-MM-DD 형식
  gameNumber: number;
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number;
  awayScore: number;
  gameType: string; // 예: "정규시즌", "플레이오프"
  csvFilePath?: string | null;
}

export interface CreateGameResponse {
  gameId: number;
  message: string;
}

export interface ImportFirestoreMatchesRequest {
  // 확장성을 위한 예약 필드 (현재 서버는 비워도 동작)
  force?: boolean;
}

export interface ImportFirestoreMatchesResponse {
  gamesProcessed: number;
  batterLogsInserted: number;
  pitcherLogsInserted: number;
}

export interface BatterStatSummary {
  id: number;
  teamPlayerId: number;
  seasonId: number;
  seasonType: string;
  gamesPlayed: number;
  plateAppearance: number;
  atBats: number;
  hits: number;
  homeRuns: number;
  battingAverage: number;
  onBasePct: number;
  sluggingPct: number;
  ops: number;
}

export interface PitcherStatSummary {
  id: number;
  teamPlayerId: number;
  seasonId: number;
  seasonType: string;
  gamesPlayed: number;
  gamesStarted: number;
  inningsPitched: number;
  wins: number;
  losses: number;
  saves: number;
  era: number;
  whip: number;
  kPer9: number;
  bbPer9: number;
}

export interface PlayerStatsResponse {
  batterStats: BatterStatSummary[];
  pitcherStats: PitcherStatSummary[];
}

export interface BatterGameLogSummary {
  id: number;
  gameId: number;
  teamId: number;
  teamSide: 'home' | 'away';
  playerId: number | null;
  playerName: string;
  playerPosition: string;
  atBats: number;
  runs: number;
  hits: number;
  rbi: number;
  walks: number;
  strikeouts: number;
}

export interface PitcherGameLogSummary {
  id: number;
  gameId: number;
  teamId: number;
  teamSide: 'home' | 'away';
  playerId: number | null;
  playerName: string;
  playerPosition: string;
  inningsPitched: number;
  hitsAllowed: number;
  runsAllowed: number;
  earnedRuns: number;
  walks: number;
  strikeouts: number;
}

export interface PlayerGameLogsResponse {
  batterLogs: BatterGameLogSummary[];
  pitcherLogs: PitcherGameLogSummary[];
}

export interface SeasonSummary {
  id: number;
  year: number;
}

export interface TeamRecordRow {
  teamId: number;
  teamName: string;
  teamCode?: string;
  division?: string;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  winPct?: number;
  runsFor?: number;
  runsAgainst?: number;
  era?: number;
  ops?: number;
  stolenBases?: number;
  dataSource?: string;
}

export interface RecordOverviewResponse {
  seasonId: number;
  year: number;
  totalGames: number;
  totalTeams: number;
  avgEra: number;
  avgOps: number;
  totalRuns: number;
  dataSource?: string;
  updatedAt?: string;
}

export interface BatterRecordRow {
  playerId: number;
  playerName: string;
  teamId: number;
  teamName: string;
  seasonId: number;
  seasonYear: number;
  gamesPlayed: number;
  plateAppearance: number;
  atBats: number;
  hits: number;
  homeRuns: number;
  runsBattedIn: number;
  runsScored: number;
  stolenBases: number;
  walks: number;
  strikeouts: number;
  battingAverage: number;
  onBasePct: number;
  sluggingPct: number;
  ops: number;
  dataSource?: string;
}

export interface PitcherRecordRow {
  playerId: number;
  playerName: string;
  teamId: number;
  teamName: string;
  seasonId: number;
  seasonYear: number;
  gamesPlayed: number;
  gamesStarted: number;
  inningsPitched: number;
  wins: number;
  losses: number;
  saves: number;
  strikeouts: number;
  walksAllowed: number;
  era: number;
  whip: number;
  kPer9: number;
  bbPer9: number;
  dataSource?: string;
}

// 백엔드로 전송할 경기 상세 데이터
export interface GameDetailRequest {
  gameId?: number; // 기존 게임 업데이트 시 사용
  seasonId: number;
  gameDate: string;
  gameNumber: number;
  homeTeamId: number;
  awayTeamId: number;
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number;
  awayScore: number;
  gameType: string;
  venue: string;
  // 이닝별 득점
  lineScore: {
    innings: number[];
    home: number[];
    away: number[];
  };
  // 타자 기록
  batters: {
    home: BatterLog[];
    away: BatterLog[];
  };
  // 투수 기록
  pitchers: {
    home: PitcherLog[];
    away: PitcherLog[];
  };
  // 팀 집계
  totals: {
    home: { runs: number; hits: number; errors: number; lob?: number };
    away: { runs: number; hits: number; errors: number; lob?: number };
  };
  notes?: string;
}

export interface BatterLog {
  playerId?: number; // 백엔드에서 매칭
  playerName: string;
  playerNumber: string;
  teamId: number;
  position: string;
  battingOrder?: number;
  plateAppearance: number;
  atBats: number;
  hits: number;
  singles?: number;
  doubles?: number;
  triples?: number;
  homeRuns: number;
  rbis: number;
  runs: number;
  walks: number;
  hitByPitch: number;
  strikeouts: number;
  stolenBases: number;
  sacrifices?: number;
  fieldersChoice?: number;
}

export interface PitcherLog {
  playerId?: number; // 백엔드에서 매칭
  playerName: string;
  playerNumber: string;
  teamId: number;
  result?: string; // 승/패/세/홀드
  inningsPitched: number; // 소수점 (예: 5.2 = 5와 2/3이닝)
  battersFaced: number;
  atBats: number;
  hits: number;
  homeRuns: number;
  walks: number;
  hitByPitch: number;
  strikeouts: number;
  runs: number;
  earnedRuns: number;
  pitches: number;
  wildPitches?: number;
  balks?: number;
  sacrificeHits?: number;
  sacrificeFlies?: number;
}

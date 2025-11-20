// `src/shared/types/index.ts`

export type LeagueDivision = 'EUTTEUM' | 'BEOGEUM'; // 으뜸/버금

export interface Team {
  id: string;
  name: string;
  university: string;
  division: LeagueDivision;
  logoColor: string; // 로고 이미지 대신 색상으로 대체 (프로토타입용)
  founded: number;
}

export interface MatchResult {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  isFinished: boolean;
}

export interface TeamRanking {
  teamId: string;
  teamName: string;
  wins: number;
  losses: number;
  draws: number;
  eloRating: number;
  btIndex: number; // Bradley-Terry Index
}

export interface PlayerSeasonStat {
  id: string;
  teamId: string;
  name: string;
  position: string;
  year: number;
  war: number;
  era?: number;
  ops?: number;
  avg?: number;
  obp?: number;
  slug?: number;
  stolenBases?: number;
  note?: string;
}

export interface TeamSeasonRecord {
  teamId: string;
  year: number;
  wins: number;
  losses: number;
  draws: number;
  era: number;
  ops: number;
  stolenBases: number;
  keyMoment: string;
  captains: string[];
  players: PlayerSeasonStat[];
}
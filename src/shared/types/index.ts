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

export type NoticeCategory = '일반' | '징계' | '경기공지' | '긴급';

export interface Notice {
  id: string;
  title: string;
  category: NoticeCategory;
  content: string; // 간단한 텍스트 또는 HTML
  author: string;
  createdAt: number;
  isImportant?: boolean; // 긴급/중요 상단 고정용
  allowComments?: boolean; // 댓글 허용 여부 (없으면 true로 취급)
}
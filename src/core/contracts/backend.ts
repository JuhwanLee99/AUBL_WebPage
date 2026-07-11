export type BackendRecordScope = 'ALL' | 'LEAGUE' | 'PLAYOFF';
export type BackendGroup = 'ALL' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H';

export interface BackendPaging {
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  hasNext: boolean;
}

export interface BackendGameSummary {
  gameId: number;
  seasonId: number;
  seasonYear: number;
  gameDate: string;
  status: string;
  homeTeamId: number;
  homeTeamName: string;
  awayTeamId: number;
  awayTeamName: string;
  homeScore: number;
  awayScore: number;
  partCode: string | null;
  group: BackendGroup | null;
  scope: BackendRecordScope;
  seasonType: string | null;
  playoffRound: string | null;
  venue: string | null;
}

export interface BackendGameListResponse extends BackendPaging {
  items: BackendGameSummary[];
}

export interface PowerRankingSeason {
  year: number; // 연도(시즌)
  /** 예선 승점(환산 포함) */
  prelimPoints: number;
  /** 본선 토너먼트 성적 점수 */
  finalsPoints: number;
}

export type FinalsStage = 'champion' | 'runnerUp' | 'semis' | 'quarters' | 'round16' | 'groupOut' | 'none';

// DB에서 가져올 최소 단위(연도별 팀 성적 원본)
export interface TeamSeasonPowerInput {
  teamId: string;
  university?: string;
  nickname?: string;
  division?: string;
  year: number;
  prelimWins?: number;
  prelimDraws?: number;
  prelimLosses?: number;
  prelimGamesPlayed?: number; // 없으면 wins+draws+losses 사용
  prelimBaseGames?: number; // 환산 기준 경기 수, 기본 4경기
  finalsStage?: FinalsStage;
  finalsPointsOverride?: number; // 필요 시 수동 지정
}

export interface PowerRankingRow {
  id: string;
  university: string;
  nickname?: string;
  division?: string;
  seasons: PowerRankingSeason[];
  note?: string;
}

export interface ComputedPowerRankingRow extends PowerRankingRow {
  yearTotals: Record<number, number>;
  weightedScore: number;
  windowYears: number[]; // 계산에 사용된 직전 3개년
}

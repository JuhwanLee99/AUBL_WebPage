export interface PowerRankingSeason {
  year: number; // 연도(시즌)
  /** 예선 승점(환산 포함) */
  prelimPoints: number;
  /** 본선 토너먼트 성적 점수 */
  finalsPoints: number;
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

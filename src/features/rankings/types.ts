export interface PowerRankingSeason {
  year: 2021 | 2022 | 2023;
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
  yearTotals: Record<PowerRankingSeason['year'], number>;
  weightedScore: number;
}

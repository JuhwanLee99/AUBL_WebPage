import type { ComputedPowerRankingRow, PowerRankingRow } from '../types';

// 직전 3개년 가중치(최근연도 → 1.0, -1년 → 0.6, -2년 → 0.3)
export const POWER_RANKING_WEIGHTS: number[] = [1, 0.6, 0.3];

// ✅ DB 연동 시 이 배열을 치환/확장하면 됩니다.
const basePowerRanking: PowerRankingRow[] = [
  {
    id: 'hanyang-bulse',
    university: '한양대학교',
    nickname: '불새',
    division: '으뜸',
    seasons: [
      // 오래된 시즌도 대비: 2015~2024 샘플
      { year: 2019, prelimPoints: 10, finalsPoints: 10 },
      { year: 2020, prelimPoints: 11, finalsPoints: 12 },
      { year: 2021, prelimPoints: 12, finalsPoints: 20 },
      { year: 2022, prelimPoints: 12, finalsPoints: 25 },
      { year: 2023, prelimPoints: 24, finalsPoints: 25 },
      { year: 2024, prelimPoints: 20, finalsPoints: 22 },
    ],
    note: '2022·2023 연속 우승, 3년 연속 결승 진출',
  },
  {
    id: 'hufs-seoul',
    university: '한국외대(서울)',
    nickname: 'UNION',
    division: '으뜸',
    seasons: [
      { year: 2019, prelimPoints: 9, finalsPoints: 10 },
      { year: 2020, prelimPoints: 10, finalsPoints: 12 },
      { year: 2021, prelimPoints: 10, finalsPoints: 15 },
      { year: 2022, prelimPoints: 14, finalsPoints: 18 },
      { year: 2023, prelimPoints: 21, finalsPoints: 23 },
      { year: 2024, prelimPoints: 19, finalsPoints: 20 },
    ],
    note: '23시즌 결승, 꾸준한 본선 상위권',
  },
  {
    id: 'yonsei-eagles',
    university: '연세대학교',
    nickname: 'EAGLES',
    division: '으뜸',
    seasons: [
      { year: 2019, prelimPoints: 8, finalsPoints: 9 },
      { year: 2020, prelimPoints: 10, finalsPoints: 11 },
      { year: 2021, prelimPoints: 11, finalsPoints: 13 },
      { year: 2022, prelimPoints: 15, finalsPoints: 17 },
      { year: 2023, prelimPoints: 20, finalsPoints: 23 },
      { year: 2024, prelimPoints: 18, finalsPoints: 21 },
    ],
    note: '최근 2년 연속 본선 4강권',
  },
  {
    id: 'skku-kingo',
    university: '성균관대학교',
    nickname: 'KINGO',
    division: '으뜸',
    seasons: [
      { year: 2019, prelimPoints: 8, finalsPoints: 9 },
      { year: 2020, prelimPoints: 10, finalsPoints: 10 },
      { year: 2021, prelimPoints: 9, finalsPoints: 12 },
      { year: 2022, prelimPoints: 14, finalsPoints: 14 },
      { year: 2023, prelimPoints: 19, finalsPoints: 22 },
      { year: 2024, prelimPoints: 17, finalsPoints: 19 },
    ],
    note: '타선 OPS 상위권',
  },
  {
    id: 'sejong-kings',
    university: '세종대학교',
    nickname: 'KINGS',
    division: '으뜸',
    seasons: [
      { year: 2019, prelimPoints: 7, finalsPoints: 8 },
      { year: 2020, prelimPoints: 9, finalsPoints: 9 },
      { year: 2021, prelimPoints: 10, finalsPoints: 10 },
      { year: 2022, prelimPoints: 13, finalsPoints: 16 },
      { year: 2023, prelimPoints: 19, finalsPoints: 21 },
      { year: 2024, prelimPoints: 16, finalsPoints: 18 },
    ],
    note: '23시즌 으뜸 4강, 장타율 상승세',
  },
  {
    id: 'inha-biryong',
    university: '인하대학교',
    nickname: '비룡',
    division: '으뜸',
    seasons: [
      { year: 2019, prelimPoints: 7, finalsPoints: 8 },
      { year: 2020, prelimPoints: 9, finalsPoints: 9 },
      { year: 2021, prelimPoints: 9, finalsPoints: 10 },
      { year: 2022, prelimPoints: 12, finalsPoints: 16 },
      { year: 2023, prelimPoints: 18, finalsPoints: 22 },
      { year: 2024, prelimPoints: 17, finalsPoints: 20 },
    ],
    note: '23시즌 준우승, 투수진 방어율 2점대',
  },
  {
    id: 'cau-rendezvous',
    university: '중앙대학교(서울)',
    nickname: 'RENDEZVOUS',
    division: '으뜸',
    seasons: [
      { year: 2019, prelimPoints: 6, finalsPoints: 8 },
      { year: 2020, prelimPoints: 8, finalsPoints: 9 },
      { year: 2021, prelimPoints: 8, finalsPoints: 12 },
      { year: 2022, prelimPoints: 12, finalsPoints: 15 },
      { year: 2023, prelimPoints: 18, finalsPoints: 21 },
      { year: 2024, prelimPoints: 15, finalsPoints: 18 },
    ],
    note: '23시즌 8강, 2026 시즌 호스트',
  },
  {
    id: 'hufs-global-union',
    university: '한국외대(글로벌)',
    nickname: 'UNION',
    division: '버금',
    seasons: [
      { year: 2019, prelimPoints: 6, finalsPoints: 7 },
      { year: 2020, prelimPoints: 7, finalsPoints: 9 },
      { year: 2021, prelimPoints: 8, finalsPoints: 11 },
      { year: 2022, prelimPoints: 12, finalsPoints: 14 },
      { year: 2023, prelimPoints: 18, finalsPoints: 20 },
      { year: 2024, prelimPoints: 16, finalsPoints: 18 },
    ],
    note: '23시즌 버금 우승',
  },
  {
    id: 'ajou-abba',
    university: '아주대학교',
    nickname: 'ABBA',
    division: '버금',
    seasons: [
      { year: 2019, prelimPoints: 6, finalsPoints: 8 },
      { year: 2020, prelimPoints: 7, finalsPoints: 10 },
      { year: 2021, prelimPoints: 7, finalsPoints: 12 },
      { year: 2022, prelimPoints: 11, finalsPoints: 15 },
      { year: 2023, prelimPoints: 17, finalsPoints: 20 },
      { year: 2024, prelimPoints: 15, finalsPoints: 18 },
    ],
    note: '23시즌 버금 준우승, 예선 전승 경험',
  },
  {
    id: 'kyunghee-braves',
    university: '경희대학교(서울)',
    nickname: 'BRAVES',
    division: '버금',
    seasons: [
      { year: 2019, prelimPoints: 5, finalsPoints: 7 },
      { year: 2020, prelimPoints: 6, finalsPoints: 8 },
      { year: 2021, prelimPoints: 7, finalsPoints: 10 },
      { year: 2022, prelimPoints: 10, finalsPoints: 14 },
      { year: 2023, prelimPoints: 17, finalsPoints: 19 },
      { year: 2024, prelimPoints: 15, finalsPoints: 17 },
    ],
    note: '23시즌 버금 4강, 도루 리그 1위',
  },
  {
    id: 'kookmin-windmills',
    university: '국민대학교',
    nickname: 'WINDMILLS',
    division: '버금',
    seasons: [
      { year: 2019, prelimPoints: 5, finalsPoints: 7 },
      { year: 2020, prelimPoints: 6, finalsPoints: 8 },
      { year: 2021, prelimPoints: 6, finalsPoints: 12 },
      { year: 2022, prelimPoints: 10, finalsPoints: 13 },
      { year: 2023, prelimPoints: 16, finalsPoints: 18 },
      { year: 2024, prelimPoints: 14, finalsPoints: 16 },
    ],
    note: '23시즌 버금 8강, 수비 효율 상위권',
  },
  {
    id: 'koreatech-winners',
    university: '한국공학대',
    nickname: 'WINNERS',
    division: '버금',
    seasons: [
      { year: 2019, prelimPoints: 4, finalsPoints: 6 },
      { year: 2020, prelimPoints: 5, finalsPoints: 7 },
      { year: 2021, prelimPoints: 5, finalsPoints: 8 },
      { year: 2022, prelimPoints: 9, finalsPoints: 12 },
      { year: 2023, prelimPoints: 15, finalsPoints: 18 },
      { year: 2024, prelimPoints: 13, finalsPoints: 15 },
    ],
    note: '23시즌 버금 준우승, 투수진 WAR 상승',
  },
];

export const getAvailableSeasonYears = (rows: PowerRankingRow[] = basePowerRanking) => {
  const years = new Set<number>();
  rows.forEach((row) => row.seasons.forEach((s) => years.add(s.year)));
  return Array.from(years).sort((a, b) => a - b);
};

export const computePowerRankingRows = (
  rankingYear: number,
  rows: PowerRankingRow[] = basePowerRanking,
  weights: number[] = POWER_RANKING_WEIGHTS,
): ComputedPowerRankingRow[] => {
  const windowYears = [rankingYear - 1, rankingYear - 2, rankingYear - 3];

  return rows.map((row) => {
    const yearTotals: Record<number, number> = {};
    windowYears.forEach((year) => {
      const season = row.seasons.find((s) => s.year === year);
      const total = season ? season.prelimPoints + season.finalsPoints : 0;
      yearTotals[year] = Math.round(total * 10) / 10;
    });

    const weightedScore = windowYears.reduce((acc, year, idx) => acc + yearTotals[year] * (weights[idx] ?? 0), 0);

    return {
      ...row,
      yearTotals,
      weightedScore: Math.round(weightedScore * 10) / 10,
      windowYears,
    };
  });
};

export const POWER_RANKING_DATA = basePowerRanking;

import type {
  ComputedPowerRankingRow,
  FinalsStage,
  PowerRankingRow,
  TeamSeasonPowerInput,
} from '../types';
import type { Team } from '../../shared/types';

// 직전 3개년 가중치(최근연도 → 1.0, -1년 → 0.6, -2년 → 0.3)
export const POWER_RANKING_WEIGHTS: number[] = [1, 0.6, 0.3];

const FINALS_STAGE_POINTS: Record<FinalsStage, number> = {
  champion: 25,
  runnerUp: 20,
  semis: 15,
  quarters: 10, // 8강 / 버금우승
  round16: 5, // 16강 / 버금준우승
  groupOut: 0,
  none: 0,
};

export const finalsStageToPoints = (stage: FinalsStage | undefined, override?: number) => {
  if (typeof override === 'number') return override;
  if (!stage) return 0;
  return FINALS_STAGE_POINTS[stage] ?? 0;
};

export const computePrelimPoints = (input: TeamSeasonPowerInput) => {
  const wins = input.prelimWins ?? 0;
  const draws = input.prelimDraws ?? 0;
  const losses = input.prelimLosses ?? 0;
  const gamesPlayed = input.prelimGamesPlayed ?? wins + draws + losses;
  const baseGames = input.prelimBaseGames ?? 4; // 4경기 기준 환산

  const raw = wins * 3 + draws * 1 + losses * 0;
  if (!gamesPlayed || gamesPlayed === baseGames) return raw;

  const adjustFactor = baseGames / gamesPlayed;
  return Math.round(raw * adjustFactor * 100) / 100;
};

export const buildPowerRankingRowsFromTeamSeasons = (
  seasons: TeamSeasonPowerInput[],
  teams?: Team[],
): PowerRankingRow[] => {
  const grouped = new Map<string, PowerRankingRow>();

  seasons.forEach((season) => {
    const teamMeta = teams?.find((t) => t.id === season.teamId);
    const prelimPoints = computePrelimPoints(season);
    const finalsPoints = finalsStageToPoints(season.finalsStage, season.finalsPointsOverride);

    if (!grouped.has(season.teamId)) {
      grouped.set(season.teamId, {
        id: season.teamId,
        university: season.university ?? teamMeta?.university ?? teamMeta?.name ?? season.teamId,
        nickname: season.nickname,
        division: season.division ?? undefined,
        seasons: [],
      });
    }

    grouped.get(season.teamId)!.seasons.push({
      year: season.year,
      prelimPoints,
      finalsPoints,
    });
  });

  return Array.from(grouped.values());
};

export const getAvailableSeasonYears = (rows: PowerRankingRow[]) => {
  const years = new Set<number>();
  rows.forEach((row) => row.seasons.forEach((s) => years.add(s.year)));
  return Array.from(years).sort((a, b) => a - b);
};

export const computePowerRankingRows = (
  rankingYear: number,
  rows: PowerRankingRow[],
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

    const weightedScore = windowYears.reduce((acc, year, idx) => acc + (yearTotals[year] ?? 0) * (weights[idx] ?? 0), 0);

    return {
      ...row,
      yearTotals,
      weightedScore: Math.round(weightedScore * 10) / 10,
      windowYears,
    };
  });
};

// ----- Demo: DB 형태 입력을 흉내 낸 시즌별 원시 데이터 -----
export const DEMO_TEAM_SEASONS: TeamSeasonPowerInput[] = [
  // 한양대
  { teamId: 'hanyang-bulse', university: '한양대학교', nickname: '불새', division: '으뜸', year: 2024, prelimWins: 6, prelimDraws: 2, prelimLosses: 0, finalsStage: 'semis' },
  { teamId: 'hanyang-bulse', university: '한양대학교', nickname: '불새', division: '으뜸', year: 2023, prelimWins: 8, prelimDraws: 0, prelimLosses: 0, finalsStage: 'champion' },
  { teamId: 'hanyang-bulse', university: '한양대학교', nickname: '불새', division: '으뜸', year: 2022, prelimWins: 4, prelimDraws: 0, prelimLosses: 0, finalsStage: 'champion' },
  { teamId: 'hanyang-bulse', university: '한양대학교', nickname: '불새', division: '으뜸', year: 2021, prelimWins: 4, prelimDraws: 0, prelimLosses: 0, finalsStage: 'runnerUp' },
  // 한국외대(서울)
  { teamId: 'hufs-seoul', university: '한국외대(서울)', nickname: 'UNION', division: '으뜸', year: 2024, prelimWins: 6, prelimDraws: 1, prelimLosses: 1, finalsStage: 'runnerUp' },
  { teamId: 'hufs-seoul', university: '한국외대(서울)', nickname: 'UNION', division: '으뜸', year: 2023, prelimWins: 7, prelimDraws: 0, prelimLosses: 1, finalsStage: 'runnerUp' },
  { teamId: 'hufs-seoul', university: '한국외대(서울)', nickname: 'UNION', division: '으뜸', year: 2022, prelimWins: 5, prelimDraws: 1, prelimLosses: 0, finalsStage: 'semis' },
  { teamId: 'hufs-seoul', university: '한국외대(서울)', nickname: 'UNION', division: '으뜸', year: 2021, prelimWins: 3, prelimDraws: 1, prelimLosses: 0, finalsStage: 'semis' },
  // 연세대
  { teamId: 'yonsei-eagles', university: '연세대학교', nickname: 'EAGLES', division: '으뜸', year: 2024, prelimWins: 6, prelimDraws: 1, prelimLosses: 1, finalsStage: 'semis' },
  { teamId: 'yonsei-eagles', university: '연세대학교', nickname: 'EAGLES', division: '으뜸', year: 2023, prelimWins: 6, prelimDraws: 0, prelimLosses: 2, finalsStage: 'semis' },
  { teamId: 'yonsei-eagles', university: '연세대학교', nickname: 'EAGLES', division: '으뜸', year: 2022, prelimWins: 5, prelimDraws: 1, prelimLosses: 0, finalsStage: 'semis' },
  { teamId: 'yonsei-eagles', university: '연세대학교', nickname: 'EAGLES', division: '으뜸', year: 2021, prelimWins: 3, prelimDraws: 2, prelimLosses: 0, finalsStage: 'quarters' },
  // 기타 버금/으뜸 샘플
  { teamId: 'hufs-global-union', university: '한국외대(글로벌)', nickname: 'UNION', division: '버금', year: 2024, prelimWins: 5, prelimDraws: 2, prelimLosses: 1, finalsStage: 'champion' },
  { teamId: 'hufs-global-union', university: '한국외대(글로벌)', nickname: 'UNION', division: '버금', year: 2023, prelimWins: 6, prelimDraws: 0, prelimLosses: 2, finalsStage: 'champion' },
  { teamId: 'hufs-global-union', university: '한국외대(글로벌)', nickname: 'UNION', division: '버금', year: 2022, prelimWins: 4, prelimDraws: 1, prelimLosses: 1, finalsStage: 'semis' },
  { teamId: 'hufs-global-union', university: '한국외대(글로벌)', nickname: 'UNION', division: '버금', year: 2021, prelimWins: 3, prelimDraws: 1, prelimLosses: 1, finalsStage: 'quarters' },
];

export const DEMO_POWER_RANKING_ROWS = buildPowerRankingRowsFromTeamSeasons(DEMO_TEAM_SEASONS);

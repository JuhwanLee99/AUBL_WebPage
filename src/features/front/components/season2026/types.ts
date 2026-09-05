import type {
  BatterRanking,
  PitcherRanking,
  SeasonOverviewFreshness,
  TeamRecordStanding,
} from '@core/api/backendClient';
import type { ScheduleLoadResult } from '@shared/state/demoStore.scheduleActions';

export const SEASON_2026_GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;

export type Season2026Group = (typeof SEASON_2026_GROUPS)[number];

export type QualificationState =
  | 'current-eutteum'
  | 'current-beogeum'
  | 'confirmed-eutteum'
  | 'confirmed-beogeum'
  | 'confirmed-out'
  | 'pending'
  | 'out'
  | 'unranked';

export type HomeDataPhase = 'loading' | 'ready' | 'partial' | 'unavailable';
export type HomeSchedulePhase = 'loading' | ScheduleLoadResult['status'];

export interface Season2026RecordPayload {
  phase: Exclude<HomeDataPhase, 'loading'>;
  seasonId: number | null;
  seasonYear: number;
  standings: TeamRecordStanding[];
  batters: BatterRanking[];
  pitchers: PitcherRanking[];
  checkedAt: number;
  warnings: string[];
  sourceFreshness: SeasonOverviewFreshness | null;
}

export interface HomeStandingRow {
  teamId: number;
  teamName: string;
  rank: number;
  wins: number;
  losses: number;
  ties: number;
  winPct: number;
  qualification: QualificationState;
  qualificationLabel: string;
  tied: boolean;
}

export interface HomeGroupView {
  group: Season2026Group;
  rows: HomeStandingRow[];
  completedGames: number;
  expectedGames: number;
  source: 'season-overview' | 'records-api' | 'schedule' | 'team-directory';
}

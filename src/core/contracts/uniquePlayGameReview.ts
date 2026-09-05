import type { OfficialGameDetail, OfficialGameDetailsResponse, OfficialRecordQualityMetadata } from '../api/backendClient';

export type GameCorrectionValue = number | string | boolean | null;
export type GameCorrectionSection = 'innings' | 'totals' | 'batters' | 'pitchers';

export interface GameCorrectionChange {
  teamName: string;
  section: GameCorrectionSection;
  rowKey?: string;
  inning?: number;
  field: string;
  expectedValue: GameCorrectionValue;
  value: GameCorrectionValue;
}

export interface GameRecordCorrection extends GameCorrectionChange {
  id: string;
  sourceGameId: string;
  playerName: string | null;
  jerseyNumber: string | null;
  status: 'APPLIED' | 'SOURCE_RESOLVED' | 'CONFLICT' | 'RETIRED';
  note: string;
  actor: string | null;
  correctedAt: string | null;
}

export interface GameReviewNotification {
  code: string;
  message: string;
  sourceGameId: string | null;
}

export interface GameRecordReviewEntry extends OfficialRecordQualityMetadata {
  sourceGameId: string;
  game: OfficialGameDetailsResponse['game'];
  originalDetail: OfficialGameDetail | null;
  detail: OfficialGameDetail | null;
  corrections: GameRecordCorrection[];
  notifications: GameReviewNotification[];
}

export interface UniquePlayGameRecordsReview {
  runId: string;
  checksum: string;
  reviewChecksum: string;
  expectedRevision: string;
  games: GameRecordReviewEntry[];
  notifications: GameReviewNotification[];
}

export interface CorrectGameRecordRequest {
  expectedChecksum: string;
  expectedRevision: string;
  note: string;
  changes: GameCorrectionChange[];
}

export interface ResolveGameCorrectionRequest {
  expectedChecksum: string;
  expectedRevision: string;
  note: string;
  resolution: 'USE_SOURCE' | 'KEEP_AUBL';
}

export interface CreateGameCorrectionRunRequest {
  expectedChecksum: string;
  expectedRevision: string;
  note: string;
}

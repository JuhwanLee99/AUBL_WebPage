export type UniquePlaySessionStatus =
  | 'READY'
  | 'CONNECTING'
  | 'REAUTH_REQUIRED'
  | 'UNAVAILABLE'
  | 'UNKNOWN';

export type UniquePlaySyncRunStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'REVIEW_REQUIRED'
  | 'VALIDATING'
  | 'VALIDATION_FAILED'
  | 'READY_TO_PUBLISH'
  | 'PUBLISHING'
  | 'PUBLISHED'
  | 'ACTIVATING'
  | 'ACTIVE'
  | 'REPAIR_REQUIRED'
  | 'FAILED'
  | 'CANCELED'
  | 'REAUTH_REQUIRED'
  | 'UNKNOWN';

export type UniquePlaySyncEntityType =
  | 'SEASON'
  | 'GROUP'
  | 'TEAM'
  | 'PLAYER'
  | 'GAME'
  | 'GAME_RECORD'
  | 'BATTER_STAT'
  | 'PITCHER_STAT'
  | 'UNKNOWN';

export type UniquePlaySyncDiffAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'UNCHANGED'
  | 'CONFLICT'
  | 'UNKNOWN';

export type UniquePlaySyncResolution = 'USE_SOURCE' | 'KEEP_AUBL' | 'MAP_ENTITY';

export type UniquePlayValidationStatus = 'NOT_RUN' | 'RUNNING' | 'PASSED' | 'FAILED' | 'UNKNOWN';

export interface UniquePlaySyncSession {
  status: UniquePlaySessionStatus;
  rawStatus: string;
  authenticated: boolean;
  expiresAt: string | null;
  checkedAt: string | null;
  message: string | null;
  reauthUrl: string | null;
  activeRunId: string | null;
}

export interface UniquePlaySyncProgress {
  phase: string | null;
  current: number | null;
  total: number | null;
  percent: number | null;
  message: string | null;
}

export interface UniquePlaySyncSummary {
  total: number;
  created: number;
  updated: number;
  deleted: number;
  unchanged: number;
  conflicts: number;
  unresolved: number;
  errors: number;
  warnings: number;
}

export interface UniquePlayValidationIssue {
  id: string;
  severity: 'ERROR' | 'WARNING' | 'INFO';
  code: string | null;
  message: string;
  entityType: UniquePlaySyncEntityType;
  itemId: string | null;
  field: string | null;
}

export interface UniquePlaySyncValidation {
  status: UniquePlayValidationStatus;
  validatedAt: string | null;
  issues: UniquePlayValidationIssue[];
  errorCount: number;
  warningCount: number;
}

export interface UniquePlayRevisionSummary {
  revisionId: string;
  checksum: string | null;
  active: boolean;
  createdBy: string | null;
  createdAt: string | null;
}

export interface UniquePlaySyncRun {
  runId: string;
  status: UniquePlaySyncRunStatus;
  rawStatus: string;
  seasonYear: number | null;
  checksum: string | null;
  expectedPublishedRevision: string | null;
  publishedRevision: string | null;
  revisionId: string | null;
  sessionStatus: UniquePlaySessionStatus | null;
  progress: UniquePlaySyncProgress;
  summary: UniquePlaySyncSummary;
  validation: UniquePlaySyncValidation;
  message: string | null;
  errorCode: string | null;
  startedAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
  revisions: UniquePlayRevisionSummary[];
}

export interface UniquePlaySyncFieldChange {
  field: string;
  label: string | null;
  sourceValue: unknown;
  aublValue: unknown;
}

export interface UniquePlayMappingCandidate {
  localEntityId: string;
  label: string;
  description: string | null;
  confidence: number | null;
}

export interface UniquePlaySyncDiffItem {
  itemId: string;
  entityType: UniquePlaySyncEntityType;
  rawEntityType: string;
  action: UniquePlaySyncDiffAction;
  rawAction: string;
  displayName: string;
  externalId: string | null;
  localEntityId: string | null;
  groupCode: string | null;
  changes: UniquePlaySyncFieldChange[];
  conflictReason: string | null;
  mappingCandidates: UniquePlayMappingCandidate[];
  resolution: UniquePlaySyncResolution | null;
  resolutionNote: string | null;
  resolved: boolean;
}

export interface UniquePlaySyncDiffPage {
  items: UniquePlaySyncDiffItem[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  hasNext: boolean;
  summary: UniquePlaySyncSummary;
}

export interface StartUniquePlaySyncRunRequest {
  seasonYear?: number;
}

export interface UniquePlaySyncDiffQuery {
  entity?: Exclude<UniquePlaySyncEntityType, 'UNKNOWN'>;
  action?: Exclude<UniquePlaySyncDiffAction, 'UNKNOWN'>;
  page?: number;
  size?: number;
}

export interface ResolveUniquePlaySyncItemRequest {
  resolution: UniquePlaySyncResolution;
  localEntityId?: string;
  note?: string;
}

export interface PublishUniquePlaySyncRunRequest {
  checksum: string;
  expectedPublishedRevision: string;
  reviewChecksum?: string;
  acknowledgeDetailWarnings?: boolean;
}

export interface ActivateUniquePlayRevisionRequest {
  expectedPublishedRevision: string;
}

export interface UniquePlaySyncPublishResult {
  run: UniquePlaySyncRun | null;
  revisionId: string;
  checksum: string | null;
  expectedPublishedRevision: string | null;
  publishedRevision: string | null;
  status: string;
  publishedAt: string | null;
}

export interface UniquePlayRevisionActivationResult {
  revisionId: string;
  status: string;
  expectedPublishedRevision: string | null;
  publishedRevision: string | null;
  activeRevision: string | null;
  activatedAt: string | null;
  run: UniquePlaySyncRun | null;
}

export type SeasonQualificationResolution =
  | 'CURRENT_EUTTEUM'
  | 'CURRENT_BEOGEUM'
  | 'CURRENT_OUT';

export interface FinalizeSeasonQualificationRequest {
  confirmed: true;
  expectedPublishedRevision: string;
  tieResolutions: Record<string, SeasonQualificationResolution>;
}

export interface FinalizedSeasonQualificationTeam {
  teamId: number;
  teamName: string;
  groupCode: string;
  standingRank: number | null;
  qualificationState: string;
  finalizedAt: string | null;
  syncRevision: string;
}

export interface FinalizeSeasonQualificationResult {
  seasonId: number;
  revisionId: string;
  finalizedAt: string | null;
  teams: FinalizedSeasonQualificationTeam[];
}

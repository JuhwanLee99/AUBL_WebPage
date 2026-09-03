import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { ensureFirebaseAppCheck } from '@core/firebase/client';

export type AdminVotingDivision = 'allstar' | 'rookie';

export type AdminVoteDistribution = {
  key: string;
  count: number;
};

export type AdminVoteLog = {
  receiptCode: string;
  submittedAt: string | null;
  division: string | null;
  candidateVersion: string | null;
  candidateSetHashPrefix: string | null;
  policy: string | null;
  periodKey: string | null;
  localDate: string | null;
  selectedCount: number;
  integrity: 'OK' | 'REVIEW';
  issues: string[];
};

export type AdminResultSummary = {
  exists: boolean;
  published: boolean;
  candidateVersion: string | null;
  candidateSetHashPrefix: string | null;
  writerVersion: string | null;
  generationId: string | null;
  sourceDigest: string | null;
  sourceBallotCount: number | null;
  totalBallots: number | null;
  updatedAt: string | null;
  matchesActiveCandidate: boolean;
  matchesBallotCount: boolean;
  schemaValid: boolean | null;
  countsMatchBallots: boolean | null;
  validationIssue: string | null;
};

export type AdminVoteOverview = {
  generatedAt: string;
  eventId: string;
  division: AdminVotingDivision;
  auditor: boolean;
  event: {
    title: string;
    divisionLabel: string;
    state: string;
    enabled: boolean;
    published: boolean;
    resultsPublished: boolean;
    policy: string;
    timezone: string;
    candidateSetId: string;
    candidateVersion: string;
    candidateSetHash: string;
    opensAt: string | null;
    closesAt: string | null;
  };
  metrics: {
    ballotCount: number;
    activeCandidateBallotCount: number;
    eligibilityCount: number;
    ledgerConsistent: boolean;
    ledgerLinksConsistent: boolean | null;
    validBallotCount: number;
    integrityIssueCount: number;
    inspectedBallotCount: number;
    recentFiveMinutes: number;
    recentHour: number;
    latestSubmittedAt: string | null;
  };
  distributions: {
    candidateVersions: AdminVoteDistribution[];
    policies: AdminVoteDistribution[];
    localDates: AdminVoteDistribution[];
    issues: AdminVoteDistribution[];
  };
  publicResult: AdminResultSummary;
  draftResult: AdminResultSummary;
  warnings: string[];
  logs: AdminVoteLog[];
  logLimit: number;
  audit: {
    mode: 'RECENT' | 'FULL';
    complete: boolean;
    stable: boolean;
    scopeDescription: string;
  };
  redacted: true;
};

type AdminVoteOverviewRequest = {
  eventId: string;
  division: AdminVotingDivision;
  limit?: number;
  fullAudit?: boolean;
};

type RebuildResultsRequest = {
  eventId: string;
  division: AdminVotingDivision;
  candidateVersion: string;
};

type SetResultsPublishedRequest = RebuildResultsRequest & {
  generationId: string;
  published: boolean;
};

export type SetAllStarFeatureEnabledRequest = {
  eventId: string;
  enabled: boolean;
  expectedRevision: number;
  confirmation?: string;
  reason?: string;
};

export type AllStarFeatureOperation = {
  feature: 'allstar';
  enabled: boolean;
  before: boolean;
  revision: number;
  updatedAt: string | null;
  eventIntakeDisabled: boolean;
};

export type AdminResultOperation = {
  eventId: string;
  division: AdminVotingDivision;
  candidateVersion: string;
  candidateSetHash: string;
  sourceDigest: string;
  generationId: string;
  totalBallots: number;
  published: boolean;
  generatedAt?: string;
  updatedAt?: string;
};

const functions = getFunctions(getApp(), 'asia-northeast3');
const getOverviewCallable = httpsCallable<AdminVoteOverviewRequest, AdminVoteOverview>(
  functions,
  'get_allstar_vote_admin_overview',
  // The same endpoint serves a light overview and a CLOSED-only 20k+20k full
  // audit. Keep the client deadline aligned with the heavy server path.
  { timeout: 300_000 },
);
const rebuildResultsCallable = httpsCallable<RebuildResultsRequest, AdminResultOperation>(
  functions,
  'rebuild_allstar_vote_results',
  { timeout: 300_000 },
);
const setResultsPublishedCallable = httpsCallable<SetResultsPublishedRequest, AdminResultOperation>(
  functions,
  'set_allstar_vote_results_published',
  // Publishing performs one final strict CLOSED-ledger rebuild before changing
  // the public gate, so it shares the heavy-path deadline.
  { timeout: 300_000 },
);
const setFeatureEnabledCallable = httpsCallable<SetAllStarFeatureEnabledRequest, AllStarFeatureOperation>(
  functions,
  'set_allstar_feature_enabled',
  { timeout: 30_000 },
);

export const allStarAdminVotingService = {
  isAvailable: true,
  async getOverview(input: AdminVoteOverviewRequest): Promise<AdminVoteOverview> {
    ensureFirebaseAppCheck();
    const response = await getOverviewCallable(input);
    return response.data;
  },
  async rebuildResults(input: RebuildResultsRequest): Promise<AdminResultOperation> {
    ensureFirebaseAppCheck();
    const response = await rebuildResultsCallable(input);
    return response.data;
  },
  async setResultsPublished(input: SetResultsPublishedRequest): Promise<AdminResultOperation> {
    ensureFirebaseAppCheck();
    const response = await setResultsPublishedCallable(input);
    return response.data;
  },
  async setFeatureEnabled(input: SetAllStarFeatureEnabledRequest): Promise<AllStarFeatureOperation> {
    ensureFirebaseAppCheck();
    const response = await setFeatureEnabledCallable(input);
    return response.data;
  },
};

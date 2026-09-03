import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { ensureFirebaseAppCheck } from '@core/firebase/client';
import type {
  AllStarDivision,
  BallotStatus,
  PublishedCandidateSet,
  SubmitBallotInput,
  VoteEvent,
  VotePolicy,
  VoteResults,
  VotingStatus,
} from '../types';

type BackendDivision = 'allstar' | 'rookie';
type CallableRequest = { eventId: string; division: BackendDivision; includeCandidateSet?: boolean };
type GetBallotStatusInput = Pick<SubmitBallotInput, 'eventId' | 'division'>;

type SubmitBallotResult = {
  submittedAt: string;
  submissionId: string;
  nextEligibleAt: string | null;
};

export type AllStarVoteService = {
  isAvailable: boolean;
  getVoteEvent: (input: GetBallotStatusInput) => Promise<VoteEvent>;
  getVoteEventState: (input: GetBallotStatusInput) => Promise<VoteEvent>;
  getVoteResults: (input: GetBallotStatusInput) => Promise<VoteResults>;
  getBallotStatus: (input: GetBallotStatusInput) => Promise<BallotStatus>;
  submitBallot: (input: SubmitBallotInput) => Promise<SubmitBallotResult>;
};

type VoteEventResponse = {
  eventId: string;
  division: BackendDivision;
  title: string;
  divisionLabel: string;
  state: VotingStatus;
  enabled: boolean;
  published: boolean;
  candidateVersion: string;
  policy: VotePolicy;
  timezone: string;
  allowedAuthProviders: string[];
  opensAt?: string | null;
  closesAt?: string | null;
  gameStartsAt?: string | null;
  venue?: string | null;
  candidateSet?: PublishedCandidateSet | null;
};

type BallotStatusResponse = {
  state: VotingStatus;
  candidateVersion: string;
  policy: VotePolicy;
  periodKey: string;
  published: boolean;
  submitted: boolean;
  canVote: boolean;
  submittedAt?: string | null;
  submissionId?: string | null;
  nextEligibleAt?: string | null;
};

type VoteResultsResponse = {
  available: boolean;
  candidateVersion: string;
  candidateSetHash?: string | null;
  totalBallots: number;
  counts: Record<string, number>;
  updatedAt?: string | null;
};

type SubmitBallotResponse = {
  submitted: boolean;
  submittedAt: string;
  submissionId?: string;
  nextEligibleAt?: string | null;
};

export const toBackendDivision = (division: AllStarDivision): BackendDivision =>
  division === 'ROOKIE' ? 'rookie' : 'allstar';

const fromBackendDivision = (division: BackendDivision): AllStarDivision =>
  division === 'rookie' ? 'ROOKIE' : 'ALL_STAR';

const functions = getFunctions(getApp(), 'asia-northeast3');

const getVoteEventCallable = httpsCallable<CallableRequest, VoteEventResponse>(
  functions,
  'get_allstar_vote_event',
  { timeout: 15_000 },
);

const getBallotStatusCallable = httpsCallable<CallableRequest, BallotStatusResponse>(
  functions,
  'get_allstar_ballot_status',
  { timeout: 15_000 },
);

const getVoteResultsCallable = httpsCallable<CallableRequest, VoteResultsResponse>(
  functions,
  'get_allstar_vote_results',
  { timeout: 15_000 },
);

const submitBallotCallable = httpsCallable<
  CallableRequest & Pick<SubmitBallotInput, 'candidateVersion' | 'submissionId' | 'selections'>,
  SubmitBallotResponse
>(functions, 'submit_allstar_ballot', { timeout: 20_000 });

export const allStarVoteService: AllStarVoteService = {
  // Runtime availability is controlled by the server-backed feature flag.
  // Public callables independently enforce the same flag as the authority.
  isAvailable: true,
  async getVoteEvent(input) {
    ensureFirebaseAppCheck();
    const response = await getVoteEventCallable({
      eventId: input.eventId,
      division: toBackendDivision(input.division),
      includeCandidateSet: true,
    });
    const payload = response.data;
    return {
      eventId: payload.eventId,
      division: fromBackendDivision(payload.division),
      title: payload.title,
      divisionLabel: payload.divisionLabel,
      state: payload.state,
      enabled: payload.enabled,
      published: payload.published,
      candidateVersion: payload.candidateVersion,
      policy: payload.policy,
      timezone: payload.timezone,
      allowedAuthProviders: payload.allowedAuthProviders,
      opensAt: payload.opensAt ?? null,
      closesAt: payload.closesAt ?? null,
      gameStartsAt: payload.gameStartsAt ?? null,
      venue: payload.venue ?? null,
      candidateSet: payload.candidateSet ?? null,
    };
  },
  async getVoteEventState(input) {
    ensureFirebaseAppCheck();
    const response = await getVoteEventCallable({
      eventId: input.eventId,
      division: toBackendDivision(input.division),
      includeCandidateSet: false,
    });
    const payload = response.data;
    return {
      eventId: payload.eventId,
      division: fromBackendDivision(payload.division),
      title: payload.title,
      divisionLabel: payload.divisionLabel,
      state: payload.state,
      enabled: payload.enabled,
      published: payload.published,
      candidateVersion: payload.candidateVersion,
      policy: payload.policy,
      timezone: payload.timezone,
      allowedAuthProviders: payload.allowedAuthProviders,
      opensAt: payload.opensAt ?? null,
      closesAt: payload.closesAt ?? null,
      gameStartsAt: payload.gameStartsAt ?? null,
      venue: payload.venue ?? null,
      candidateSet: null,
    };
  },
  async getVoteResults(input) {
    ensureFirebaseAppCheck();
    const response = await getVoteResultsCallable({
      eventId: input.eventId,
      division: toBackendDivision(input.division),
    });
    const payload = response.data;
    return {
      available: payload.available,
      candidateVersion: payload.candidateVersion,
      candidateSetHash: payload.candidateSetHash ?? null,
      totalBallots: payload.totalBallots,
      counts: payload.counts,
      updatedAt: payload.updatedAt ?? null,
    };
  },
  async getBallotStatus(input) {
    ensureFirebaseAppCheck();
    const response = await getBallotStatusCallable({
      eventId: input.eventId,
      division: toBackendDivision(input.division),
    });
    const payload = response.data;
    const eligibility = payload.submitted ? 'ALREADY_VOTED' : payload.canVote ? 'ELIGIBLE' : 'UNAVAILABLE';

    return {
      eligibility,
      votedAt: payload.submittedAt ?? null,
      submissionId: payload.submissionId ?? null,
      nextEligibleAt: payload.nextEligibleAt ?? null,
    };
  },
  async submitBallot(input) {
    ensureFirebaseAppCheck();
    const response = await submitBallotCallable({
      eventId: input.eventId,
      division: toBackendDivision(input.division),
      candidateVersion: input.candidateVersion,
      submissionId: input.submissionId,
      selections: input.selections,
    });

    return {
      submittedAt: response.data.submittedAt,
      submissionId: response.data.submissionId ?? input.submissionId,
      nextEligibleAt: response.data.nextEligibleAt ?? null,
    };
  },
};

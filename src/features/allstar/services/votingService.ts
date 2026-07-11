import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import type {
  AllStarDivision,
  BallotStatus,
  PublishedCandidateSet,
  SubmitBallotInput,
  VoteEvent,
  VotePolicy,
  VotingStatus,
} from '../types';

type BackendDivision = 'allstar' | 'rookie';
type CallableRequest = { eventId: string; division: BackendDivision };
type GetBallotStatusInput = Pick<SubmitBallotInput, 'eventId' | 'division'>;

type SubmitBallotResult = {
  submittedAt: string;
  nextEligibleAt: string | null;
};

export type AllStarVoteService = {
  isAvailable: boolean;
  getVoteEvent: (input: GetBallotStatusInput) => Promise<VoteEvent>;
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
  nextEligibleAt?: string | null;
};

type SubmitBallotResponse = {
  submitted: boolean;
  submittedAt: string;
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
);

const getBallotStatusCallable = httpsCallable<CallableRequest, BallotStatusResponse>(
  functions,
  'get_allstar_ballot_status',
);

const submitBallotCallable = httpsCallable<
  CallableRequest & Pick<SubmitBallotInput, 'candidateVersion' | 'selections'>,
  SubmitBallotResponse
>(functions, 'submit_allstar_ballot');

const isApiEnabled = import.meta.env.VITE_ALLSTAR_VOTING_API_ENABLED === 'true';

export const allStarVoteService: AllStarVoteService = {
  isAvailable: isApiEnabled,
  async getVoteEvent(input) {
    const response = await getVoteEventCallable({
      eventId: input.eventId,
      division: toBackendDivision(input.division),
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
      candidateSet: payload.candidateSet ?? null,
    };
  },
  async getBallotStatus(input) {
    const response = await getBallotStatusCallable({
      eventId: input.eventId,
      division: toBackendDivision(input.division),
    });
    const payload = response.data;
    const eligibility = payload.submitted ? 'ALREADY_VOTED' : payload.canVote ? 'ELIGIBLE' : 'UNAVAILABLE';

    return {
      eligibility,
      votedAt: payload.submittedAt ?? null,
      nextEligibleAt: payload.nextEligibleAt ?? null,
    };
  },
  async submitBallot(input) {
    const response = await submitBallotCallable({
      eventId: input.eventId,
      division: toBackendDivision(input.division),
      candidateVersion: input.candidateVersion,
      selections: input.selections,
    });

    return {
      submittedAt: response.data.submittedAt,
      nextEligibleAt: response.data.nextEligibleAt ?? null,
    };
  },
};

export type AllStarDivision = 'ALL_STAR' | 'ROOKIE';

export type AllStarTeam = 'TEAM_1' | 'TEAM_2';

export type AllStarPosition = 'P' | 'C' | '1B' | '2B' | '3B' | 'SS' | 'OF';

export type VotingStatus = 'DRAFT' | 'SCHEDULED' | 'OPEN' | 'CLOSED' | 'DISABLED';

export type VotePolicy = 'ONCE_PER_EVENT' | 'ONCE_PER_DAY';

export type BallotEligibility = 'ELIGIBLE' | 'ALREADY_VOTED' | 'UNAVAILABLE';

export type ContestKey = `${AllStarTeam}:${AllStarPosition}`;

export type VotingCandidate = {
  id: string;
  division: AllStarDivision;
  team: AllStarTeam;
  position: string;
  name: string;
  school: string;
  group: string;
  draft: boolean;
  number?: string;
};

export type RookieCandidate = {
  id: string;
  team: AllStarTeam;
  group: string;
  school: string;
  name: string;
  positions: readonly string[];
  note?: string;
};

export type VotingContest = {
  id: string;
  label: string;
  team: AllStarTeam;
  position: string;
  candidateIds: string[];
  minSelections: number;
  maxSelections: number;
};

export type AllStarEventConfig = {
  eventId: string;
  candidateVersion: string;
  seasonLabel: string;
  status: VotingStatus;
  votePolicy: VotePolicy;
  maxSelectionsByPosition: Record<AllStarPosition, number>;
  opensAt: string | null;
  closesAt: string | null;
  gameStartsAt: string | null;
  venue: string | null;
};

export type BallotStatus = {
  eligibility: BallotEligibility;
  votedAt: string | null;
  submissionId: string | null;
  nextEligibleAt: string | null;
};

export type VoteResults = {
  available: boolean;
  candidateVersion: string;
  candidateSetHash: string | null;
  totalBallots: number;
  counts: Record<string, number>;
  updatedAt: string | null;
};

export type PublishedCandidate = {
  id: string;
  name: string;
  school?: string;
  position?: string;
  side?: string;
  group?: string;
  number?: string;
};

export type PublishedContest = {
  id: string;
  label: string;
  side?: string;
  position?: string;
  candidateIds: string[];
  minSelections: number;
  maxSelections: number;
};

export type PublishedCandidateSet = {
  version: string;
  candidates: Record<string, PublishedCandidate>;
  contests: Record<string, PublishedContest>;
};

export type VoteEvent = {
  eventId: string;
  division: AllStarDivision;
  title: string;
  divisionLabel: string;
  state: VotingStatus;
  enabled: boolean;
  published: boolean;
  candidateVersion: string;
  policy: VotePolicy;
  timezone: string;
  allowedAuthProviders: string[];
  opensAt: string | null;
  closesAt: string | null;
  gameStartsAt: string | null;
  venue: string | null;
  candidateSet: PublishedCandidateSet | null;
};

export type SubmitBallotInput = {
  eventId: string;
  division: AllStarDivision;
  candidateVersion: string;
  submissionId: string;
  selections: Record<string, string[]>;
};

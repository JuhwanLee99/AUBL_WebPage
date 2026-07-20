import type { AllStarDivision } from '../types';

const STORAGE_PREFIX = 'aubl:allstar-vote-pending-submission';
const STORAGE_SCHEMA_VERSION = 1;
const SUBMISSION_ID_PATTERN = /^submission-[a-f0-9]{32}$/;

type PendingSubmission = {
  schemaVersion: number;
  eventId: string;
  division: AllStarDivision;
  candidateVersion: string;
  selectionFingerprint: string;
  submissionId: string;
  createdAt: string;
};

type SubmissionScope = {
  eventId: string;
  division: AllStarDivision;
};

type SubmissionIdentity = SubmissionScope & {
  candidateVersion: string;
  selectionFingerprint: string;
};

const storageKey = ({ eventId, division }: SubmissionScope) =>
  `${STORAGE_PREFIX}:${eventId}:${division}`;

const canonicalSelectionPayload = ({
  eventId,
  division,
  candidateVersion,
  selections,
}: SubmissionScope & { candidateVersion: string; selections: Record<string, string[]> }) => JSON.stringify({
  eventId,
  division,
  candidateVersion,
  selections: Object.fromEntries(
    Object.entries(selections)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([contestId, candidateIds]) => [contestId, [...candidateIds].sort()]),
  ),
});

const toHex = (buffer: ArrayBuffer) => Array.from(
  new Uint8Array(buffer),
  (value) => value.toString(16).padStart(2, '0'),
).join('');

/** Identifies one candidate-version/selection combination without account data. */
export const createSelectionFingerprint = async (
  input: SubmissionScope & { candidateVersion: string; selections: Record<string, string[]> },
): Promise<string | null> => {
  const canonical = canonicalSelectionPayload(input);
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  try {
    const digest = await subtle.digest('SHA-256', new TextEncoder().encode(canonical));
    return `sha256:${toHex(digest)}`;
  } catch {
    return null;
  }
};

const parsePendingSubmission = (raw: string | null): PendingSubmission | null => {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<PendingSubmission>;
    if (
      value.schemaVersion !== STORAGE_SCHEMA_VERSION
      || typeof value.eventId !== 'string'
      || (value.division !== 'ALL_STAR' && value.division !== 'ROOKIE')
      || typeof value.candidateVersion !== 'string'
      || typeof value.selectionFingerprint !== 'string'
      || !value.selectionFingerprint
      || typeof value.submissionId !== 'string'
      || !SUBMISSION_ID_PATTERN.test(value.submissionId)
      || typeof value.createdAt !== 'string'
    ) return null;
    return value as PendingSubmission;
  } catch {
    return null;
  }
};

export const loadPendingSubmissionId = (
  storage: Storage,
  identity: SubmissionIdentity,
): string | null => {
  const key = storageKey(identity);
  const pending = parsePendingSubmission(storage.getItem(key));
  if (
    !pending
    || pending.eventId !== identity.eventId
    || pending.division !== identity.division
    || pending.candidateVersion !== identity.candidateVersion
    || pending.selectionFingerprint !== identity.selectionFingerprint
  ) {
    storage.removeItem(key);
    return null;
  }
  return pending.submissionId;
};

export const savePendingSubmission = (
  storage: Storage,
  identity: SubmissionIdentity,
  submissionId: string,
) => {
  if (!SUBMISSION_ID_PATTERN.test(submissionId)) throw new Error('Invalid submission ID.');
  const pending: PendingSubmission = {
    schemaVersion: STORAGE_SCHEMA_VERSION,
    ...identity,
    submissionId,
    createdAt: new Date().toISOString(),
  };
  storage.setItem(storageKey(identity), JSON.stringify(pending));
};

export const clearPendingSubmission = (storage: Storage, scope: SubmissionScope) => {
  storage.removeItem(storageKey(scope));
};

export const clearPendingSubmissionForCandidateChange = (
  storage: Storage,
  scope: SubmissionScope & { candidateVersion: string },
) => {
  const key = storageKey(scope);
  const pending = parsePendingSubmission(storage.getItem(key));
  if (!pending || pending.candidateVersion !== scope.candidateVersion) storage.removeItem(key);
};

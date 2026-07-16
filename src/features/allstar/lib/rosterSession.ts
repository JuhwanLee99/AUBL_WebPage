import type { VotingCandidate, VotingContest } from '../types';

const RECEIPT_SCHEMA_VERSION = 1;
const RECEIPT_STORAGE_PREFIX = 'aubl:allstar:roster-receipt';

export type RosterReceipt = {
  schemaVersion: typeof RECEIPT_SCHEMA_VERSION;
  eventId: string;
  candidateVersion: string;
  selections: Record<string, string[]>;
  savedAt: string;
  submitted: boolean;
};

type RosterReceiptInput = {
  eventId: string;
  candidateVersion: string;
  selections: Record<string, string[]>;
  submitted: boolean;
};

type RosterReceiptValidation = {
  eventId: string;
  candidateVersion: string;
  contests: readonly VotingContest[];
  candidates: readonly VotingCandidate[];
};

const receiptKey = (eventId: string, candidateVersion: string) =>
  `${RECEIPT_STORAGE_PREFIX}:${eventId}:${candidateVersion}`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const validateSelections = (
  value: unknown,
  contests: readonly VotingContest[],
  candidates: readonly VotingCandidate[],
): Record<string, string[]> | null => {
  if (!isRecord(value) || contests.length !== 14) return null;
  const candidateIds = new Set(candidates.map((candidate) => candidate.id));
  const contestIds = new Set(contests.map((contest) => contest.id));
  if (Object.keys(value).some((contestId) => !contestIds.has(contestId))) return null;

  const normalized: Record<string, string[]> = {};
  const selectedAcrossBallot = new Set<string>();
  for (const contest of contests) {
    const rawIds = value[contest.id];
    if (!Array.isArray(rawIds)) return null;
    if (rawIds.length !== contest.minSelections || rawIds.length !== contest.maxSelections) return null;
    const allowed = new Set(contest.candidateIds);
    const ids = rawIds.filter((id): id is string => typeof id === 'string');
    if (ids.length !== rawIds.length || new Set(ids).size !== ids.length) return null;
    if (ids.some((id) => !allowed.has(id) || !candidateIds.has(id) || selectedAcrossBallot.has(id))) return null;
    ids.forEach((id) => selectedAcrossBallot.add(id));
    normalized[contest.id] = [...ids];
  }
  return normalized;
};

export const saveRosterReceipt = ({
  eventId,
  candidateVersion,
  selections,
  submitted,
}: RosterReceiptInput): RosterReceipt | null => {
  const receipt: RosterReceipt = {
    schemaVersion: RECEIPT_SCHEMA_VERSION,
    eventId,
    candidateVersion,
    selections: Object.fromEntries(
      Object.entries(selections).map(([contestId, ids]) => [contestId, [...ids]]),
    ),
    savedAt: new Date().toISOString(),
    submitted,
  };
  try {
    window.sessionStorage.setItem(receiptKey(eventId, candidateVersion), JSON.stringify(receipt));
  } catch {
    // Keep the in-memory receipt usable when private browsing blocks storage.
  }
  return receipt;
};

export const loadRosterReceipt = ({
  eventId,
  candidateVersion,
  contests,
  candidates,
}: RosterReceiptValidation): RosterReceipt | null => {
  try {
    const activeKey = receiptKey(eventId, candidateVersion);
    for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = window.sessionStorage.key(index);
      if (key?.startsWith(`${RECEIPT_STORAGE_PREFIX}:${eventId}:`) && key !== activeKey) {
        window.sessionStorage.removeItem(key);
      }
    }

    const raw = window.sessionStorage.getItem(activeKey);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)
      || parsed.schemaVersion !== RECEIPT_SCHEMA_VERSION
      || parsed.eventId !== eventId
      || parsed.candidateVersion !== candidateVersion
      || typeof parsed.savedAt !== 'string'
      || typeof parsed.submitted !== 'boolean') {
      window.sessionStorage.removeItem(activeKey);
      return null;
    }
    const normalizedSelections = validateSelections(parsed.selections, contests, candidates);
    if (!normalizedSelections) {
      window.sessionStorage.removeItem(activeKey);
      return null;
    }
    return {
      schemaVersion: RECEIPT_SCHEMA_VERSION,
      eventId,
      candidateVersion,
      selections: normalizedSelections,
      savedAt: parsed.savedAt,
      submitted: parsed.submitted,
    };
  } catch {
    return null;
  }
};

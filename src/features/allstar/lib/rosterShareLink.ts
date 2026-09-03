import type { VotingCandidate, VotingContest } from '../types';

const SHARE_SCHEMA_VERSION = 1;
const MAX_SHARE_TOKEN_LENGTH = 10_000;

type SharePayload = {
  v: typeof SHARE_SCHEMA_VERSION;
  c: string;
  s: number[][];
};

type CreateRosterShareTokenInput = {
  candidateVersion: string;
  contests: readonly VotingContest[];
  selections: Record<string, string[]>;
};

type ParseRosterShareTokenInput = {
  token: string;
  candidateVersion: string;
  contests: readonly VotingContest[];
  candidates: readonly VotingCandidate[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const encodeBase64Url = (value: string) => {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return window.btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
};

const decodeBase64Url = (value: string) => {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = window.atob(`${base64}${padding}`);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

export const createRosterShareToken = ({
  candidateVersion,
  contests,
  selections,
}: CreateRosterShareTokenInput): string | null => {
  if (!candidateVersion || contests.length !== 14) return null;
  const selectedAcrossBallot = new Set<string>();
  const compactSelections: number[][] = [];

  for (const contest of contests) {
    const ids = selections[contest.id];
    if (!Array.isArray(ids)
      || ids.length !== contest.minSelections
      || ids.length !== contest.maxSelections
      || new Set(ids).size !== ids.length) return null;

    const indices = ids.map((id) => contest.candidateIds.indexOf(id));
    if (indices.some((index) => index < 0)
      || ids.some((id) => selectedAcrossBallot.has(id))) return null;
    ids.forEach((id) => selectedAcrossBallot.add(id));
    compactSelections.push(indices);
  }

  const payload: SharePayload = {
    v: SHARE_SCHEMA_VERSION,
    c: candidateVersion,
    s: compactSelections,
  };
  return encodeBase64Url(JSON.stringify(payload));
};

export const parseRosterShareToken = ({
  token,
  candidateVersion,
  contests,
  candidates,
}: ParseRosterShareTokenInput): Record<string, string[]> | null => {
  if (!token || token.length > MAX_SHARE_TOKEN_LENGTH || contests.length !== 14) return null;
  try {
    const parsed: unknown = JSON.parse(decodeBase64Url(token));
    if (!isRecord(parsed)
      || parsed.v !== SHARE_SCHEMA_VERSION
      || parsed.c !== candidateVersion
      || !Array.isArray(parsed.s)
      || parsed.s.length !== contests.length) return null;

    const candidateIds = new Set(candidates.map((candidate) => candidate.id));
    const selectedAcrossBallot = new Set<string>();
    const selections: Record<string, string[]> = {};

    for (let contestIndex = 0; contestIndex < contests.length; contestIndex += 1) {
      const contest = contests[contestIndex];
      const indices = parsed.s[contestIndex];
      if (!Array.isArray(indices)
        || indices.length !== contest.minSelections
        || indices.length !== contest.maxSelections
        || indices.some((index) => !Number.isInteger(index))
        || new Set(indices).size !== indices.length) return null;

      const ids = indices.map((index) => contest.candidateIds[index as number]);
      if (ids.some((id) => !id || !candidateIds.has(id) || selectedAcrossBallot.has(id))) return null;
      ids.forEach((id) => selectedAcrossBallot.add(id));
      selections[contest.id] = ids;
    }

    return selections;
  } catch {
    return null;
  }
};

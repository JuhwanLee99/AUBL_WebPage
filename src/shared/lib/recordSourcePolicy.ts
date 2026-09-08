import type { OfficialGameDetailsResponse } from '../../core/api/backendClient';

export interface OfficialRecordSource {
  schemaVersion: 1;
  matchId: string;
  authority: 'UNIQUE_PLAY';
  liveVisibility: 'ADMIN_ONLY';
  revision: string;
  payloadHash: string;
  official: OfficialGameDetailsResponse;
}

export type RecordSourceState =
  | { status: 'loading' | 'blocked' | 'live'; source?: never }
  | { status: 'official'; source: OfficialRecordSource };

export function hasOfficialAuthority(match: { recordAuthority?: string } | null | undefined): boolean {
  return match?.recordAuthority === 'UNIQUE_PLAY';
}

// A missing server document is provisional, not an official-record failure fallback.
export function parseRecordSource(value: unknown, matchId: string): RecordSourceState {
  if (value === null) return { status: 'live' };
  if (!value || typeof value !== 'object') return { status: 'blocked' };
  const row = value as Partial<OfficialRecordSource>;
  if (row.schemaVersion !== 1 || row.matchId !== matchId || row.authority !== 'UNIQUE_PLAY'
    || row.liveVisibility !== 'ADMIN_ONLY' || !row.revision || !row.payloadHash
    || row.official?.provider !== 'UNIQUE_PLAY' || row.official.status !== 'AVAILABLE'
    || row.official.syncRevision !== row.revision || row.official.detail?.status !== 'AVAILABLE'
    || row.official.detail.sourceGameId !== row.official.sourceGameId
    || !Array.isArray(row.official.detail.teams)
    || row.official.detail.teams.length !== 2) return { status: 'blocked' };
  return { status: 'official', source: row as OfficialRecordSource };
}

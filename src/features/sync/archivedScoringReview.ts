import type { PlayEvent } from '../../shared/state/demoStore';
import { inspectScoringIntegrity } from '../../shared/lib/scoringIntegrity.ts';
import { buildDefensiveFieldingLedger } from '../../shared/lib/defensiveFielding.ts';

export type ReviewBinding = { matchId: string; revision: string; payloadHash: string };
export type ArchiveOrigin = 'documents' | 'legacy';
export type ReviewScope = { origin: ArchiveOrigin; loadedRows: number; partial: boolean };
export type ArchiveFinding = {
  id: string; kind: 'integrity' | 'defense' | 'scope'; reference: string;
  eventId?: string; documentIds: string[]; additionalDocumentCount: number;
  position?: string; code: string; message: string; category: 'UNKNOWN' | 'MAPPING';
};
export type ArchiveIssueDraft = ReviewBinding & {
  category: 'UNKNOWN' | 'MAPPING'; status: 'OPEN'; title: string; note: string; evidence: string;
};
export type ReviewComparisonRow = { key: string; label: string; status: string; live: unknown; official: unknown };
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const nonempty = (value: unknown, max = 200): value is string => typeof value === 'string' && Boolean(value.trim()) && value.length <= max;
const asEvents = (rows: unknown[]) => rows.filter(object) as unknown as PlayEvent[];

export function validReviewBinding(value: unknown): value is ReviewBinding {
  return object(value) && nonempty(value.matchId) && nonempty(value.revision) &&
    typeof value.payloadHash === 'string' && /^[a-f0-9]{64}$/.test(value.payloadHash);
}
export function isReviewDraftCurrent(draft: ReviewBinding | null | undefined, current: ReviewBinding): boolean {
  return validReviewBinding(draft) && validReviewBinding(current) && draft.matchId === current.matchId &&
    draft.revision === current.revision && draft.payloadHash === current.payloadHash;
}
function references(original: unknown, origin: ArchiveOrigin) {
  const rows = (Array.isArray(original) ? original : [original]).filter(object);
  const allIds = origin === 'documents'
    ? [...new Set(rows.map(row => row._documentId).filter((id): id is string => nonempty(id, 1500)))] : [];
  const eventId = rows.map(row => row.eventId).find((id): id is string => nonempty(id, 1500));
  return { eventId, documentIds: allIds.slice(0, 8), additionalDocumentCount: Math.max(0, allIds.length - 8) };
}

/** Reviews exactly one explicitly selected source. Never hydrates, repairs or combines archives. */
export function inspectArchivedScoring(rows: unknown, binding: ReviewBinding, origin: ArchiveOrigin, hasMore: boolean) {
  const selected = Array.isArray(rows) ? rows : [];
  const scope: ReviewScope = { origin, loadedRows: selected.length, partial: origin === 'documents' && hasMore };
  const findings: ArchiveFinding[] = [];
  const eligible: unknown[] = [];
  if (!Array.isArray(rows)) findings.push({ id: 'collection', kind: 'scope', reference: 'collection', documentIds: [], additionalDocumentCount: 0,
    code: 'invalid_collection', category: 'UNKNOWN', message: '선택한 원본 사건 목록의 형식이 올바르지 않습니다.' });
  selected.forEach((row, index) => {
    const event = object(row) ? row as unknown as PlayEvent : null;
    const sourceMatchId = event?.compositePlay?.input?.expected?.activeMatchId ?? event?.defensiveSnapshot?.matchId;
    if (sourceMatchId && sourceMatchId !== binding.matchId) {
      findings.push({ id: `scope:${index}`, kind: 'scope', reference: event?.eventId ?? `row-${index}`,
        ...references(row, origin), code: 'foreign_match', category: 'MAPPING', message: '보관 경로와 다른 경기 ID를 가진 사건입니다. 이 경기의 집계에 포함하지 않습니다.' });
    } else eligible.push(row);
  });
  const integrity = inspectScoringIntegrity(eligible as PlayEvent[]);
  const covered = new Set<string>();
  integrity.issues.forEach((issue, index) => {
    covered.add(issue.eventId);
    findings.push({ id: `integrity:${index}:${issue.eventId}`, kind: 'integrity', reference: issue.eventId,
      ...references(issue.original, origin), code: 'scoring_integrity', category: 'UNKNOWN', message: issue.reasons.join(' / ') });
  });
  const ledger = buildDefensiveFieldingLedger(asEvents(eligible), binding.matchId);
  ledger.issues.forEach((issue, index) => {
    if (covered.has(issue.eventId) && ['invalid_composite', 'manual_resolve', 'conflicting_source'].includes(issue.code)) return;
    const originals = eligible.filter(row => object(row) && (row.eventId === issue.eventId ||
      (row as unknown as PlayEvent).compositePlay?.input?.id === issue.eventId));
    findings.push({ id: `defense:${index}:${issue.eventId}`, kind: 'defense', reference: issue.eventId,
      ...references(originals, origin), position: issue.position, code: issue.code,
      category: issue.code === 'unassigned_defender' ? 'MAPPING' : 'UNKNOWN', message: issue.message });
  });
  return { scope, findings, ledger };
}

function draft(binding: ReviewBinding, category: ArchiveIssueDraft['category'], title: string, observation: string, evidence: object): ArchiveIssueDraft | null {
  if (!validReviewBinding(binding)) return null;
  const encoded = JSON.stringify({ schema: 'aubl-archive-review-v1', ...binding, ...evidence });
  // Do not truncate identifiers or revision evidence to fit the existing Rules limit.
  if (encoded.length > 2000) return null;
  const note = `관찰: ${observation.slice(0, 2800)}\n\n원인과 수정 여부는 아직 확정하지 않았습니다.\n재현 절차:\n수정 내용:\n검증 테스트와 결과:`;
  return { ...binding, category, status: 'OPEN', title, note, evidence: encoded };
}
export function prepareArchiveIssue(binding: ReviewBinding, finding: ArchiveFinding, scope: ReviewScope): ArchiveIssueDraft | null {
  if (!['documents', 'legacy'].includes(scope.origin) || !Number.isSafeInteger(scope.loadedRows) || scope.loadedRows < 0) return null;
  return draft(binding, finding.category, finding.kind === 'defense' ? '수비 귀속 확인' : '보관 사건 재심', finding.message, {
    kind: finding.kind, origin: scope.origin, coverage: scope.origin === 'legacy' ? 'legacy-array-only' : scope.partial ? 'partial-page' : 'loaded-collection',
    reviewedRows: scope.loadedRows, reference: finding.reference, eventId: finding.eventId,
    documentIds: finding.documentIds, additionalDocumentCount: finding.additionalDocumentCount,
    position: finding.position, code: finding.code,
  });
}
export function prepareComparisonIssue(binding: ReviewBinding, row: ReviewComparisonRow): ArchiveIssueDraft | null {
  if (!nonempty(row.key, 1500) || !['mismatch', 'missing', 'unmapped'].includes(row.status)) return null;
  const display = (value: unknown) => value === null || value === undefined ? '미수집' : String(value).slice(0, 500);
  return draft(binding, row.status === 'unmapped' ? 'MAPPING' : 'UNKNOWN', '공식·자체 기록 비교 확인',
    `${row.label.slice(0, 500)} / 자체: ${display(row.live)} / 공식: ${display(row.official)} / 비교 상태: ${row.status}`, {
      kind: 'comparison', origin: 'stored-summary', comparisonKey: row.key, comparisonStatus: row.status,
    });
}

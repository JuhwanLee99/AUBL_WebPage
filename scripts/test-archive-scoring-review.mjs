import assert from 'node:assert/strict';
import test from 'node:test';
import { archiveReviewEvent } from './e2e/record-sources/archive-review-fixtures.mjs';
import { inspectArchivedScoring, isReviewDraftCurrent, prepareArchiveIssue, prepareComparisonIssue, validReviewBinding } from '../src/features/sync/archivedScoringReview.ts';

const binding = { matchId: 'LOCAL_TEST_SOURCE_REVIEW_UNIT', revision: 'LOCAL_REVISION_1', payloadHash: 'a'.repeat(64) };
const scope = { origin: 'documents', loadedRows: 1, partial: true };
const compare = { key: 'team.away.runs', label: '원정 득점', status: 'mismatch', live: 4, official: 3 };
const fixture = (kind = 'missing') => ({ ...archiveReviewEvent(binding.matchId, kind), _documentId: `doc-${kind}` });
const inspect = (rows, origin = 'documents', more = false) => inspectArchivedScoring(rows, binding, origin, more);

test('published revision binding is accepted', () => assert.equal(validReviewBinding(binding), true));
for (const [field, value] of [
  ['matchId', ''], ['matchId', ' '], ['matchId', 'x'.repeat(201)], ['matchId', null],
  ['revision', ''], ['revision', null], ['revision', 'x'.repeat(201)],
  ['payloadHash', ''], ['payloadHash', 'a'.repeat(63)], ['payloadHash', 'g'.repeat(64)], ['payloadHash', null],
]) test(`reject invalid review binding ${field}: ${String(value).slice(0, 15)}`, () => {
  const invalid = { ...binding, [field]: value };
  assert.equal(validReviewBinding(invalid), false); assert.equal(prepareComparisonIssue(invalid, compare), null);
});
test('draft remains usable only in the same official context', () => assert.equal(isReviewDraftCurrent(binding, { ...binding }), true));
for (const field of ['matchId', 'revision', 'payloadHash']) {
  test(`invalidate draft after ${field} changes`, () => assert.equal(isReviewDraftCurrent(binding, { ...binding, [field]: field === 'payloadHash' ? 'b'.repeat(64) : 'OTHER' }), false));
}
for (const missing of [null, undefined, {}]) test(`missing draft cannot be applied: ${String(missing)}`, () => assert.equal(isReviewDraftCurrent(missing, binding), false));
for (const status of ['mismatch', 'missing', 'unmapped']) test(`comparison ${status} prepares only an OPEN issue`, () => {
  const draft = prepareComparisonIssue(binding, { ...compare, status });
  assert.equal(draft.status, 'OPEN'); assert.equal(draft.category, status === 'unmapped' ? 'MAPPING' : 'UNKNOWN');
  const proof = JSON.parse(draft.evidence); assert.equal(proof.comparisonKey, compare.key); assert.equal(proof.payloadHash, binding.payloadHash);
});
for (const status of ['equal', 'unknown', '']) test(`no automatic issue for comparison ${status}`, () => assert.equal(prepareComparisonIssue(binding, { ...compare, status }), null));
test('missing value and numeric zero remain distinct in the draft', () => {
  const draft = prepareComparisonIssue(binding, { ...compare, live: null, official: 0 });
  assert.match(draft.note, /자체: 미수집/); assert.match(draft.note, /공식: 0/);
});
test('unplayed X is not presented as zero', () => assert.match(prepareComparisonIssue(binding, { ...compare, live: 'X', official: 0 }).note, /자체: X/));
test('comparison evidence never truncates an oversized key', () => assert.equal(prepareComparisonIssue(binding, { ...compare, key: 'x'.repeat(2001) }), null));
test('long observations fit the existing note limit', () => {
  const draft = prepareComparisonIssue(binding, { ...compare, label: 'x'.repeat(8000), live: 'y'.repeat(8000) });
  assert.ok(draft.note.length <= 4000); assert.ok(draft.evidence.length <= 2000);
});
test('valid captured event has no diagnostic findings', () => assert.equal(inspect([fixture('valid')]).findings.length, 0));
test('missing defensive identity becomes a mapping finding with physical document reference', () => {
  const review = inspect([fixture()]); const finding = review.findings.find(item => item.kind === 'defense');
  assert.equal(finding.category, 'MAPPING'); assert.equal(finding.eventId, 'LOCAL_ARCHIVE_MISSING');
  assert.deepEqual(finding.documentIds, ['doc-missing']); assert.equal(review.ledger.unassigned.assists, 1);
});
test('invalid composite gets one integrity finding rather than a duplicate fielding finding', () => {
  const review = inspect([fixture('broken')]);
  assert.equal(review.findings.length, 1); assert.equal(review.findings[0].kind, 'integrity'); assert.equal(review.ledger.players.length, 0);
});
test('manual pending records remain unresolved and are never marked FIXED', () => {
  const review = inspect([fixture('pending')]); const draft = prepareArchiveIssue(binding, review.findings[0], review.scope);
  assert.equal(draft.status, 'OPEN'); assert.equal(draft.category, 'UNKNOWN'); assert.match(draft.note, /확정하지 않았습니다/);
});
test('partial pagination is captured in issue evidence', () => {
  const review = inspect([fixture()], 'documents', true); const proof = JSON.parse(prepareArchiveIssue(binding, review.findings[0], review.scope).evidence);
  assert.equal(proof.coverage, 'partial-page'); assert.equal(proof.reviewedRows, 1);
});
test('completed page sequence is still labeled as loaded collection rather than entire game certification', () => {
  const review = inspect([fixture()]); const proof = JSON.parse(prepareArchiveIssue(binding, review.findings[0], review.scope).evidence);
  assert.equal(proof.coverage, 'loaded-collection');
});
test('legacy arrays never pretend their embedded document IDs are physical collection IDs', () => {
  const review = inspect([fixture()], 'legacy'); const finding = review.findings[0];
  assert.deepEqual(finding.documentIds, []);
  const proof = JSON.parse(prepareArchiveIssue(binding, finding, review.scope).evidence);
  assert.equal(proof.coverage, 'legacy-array-only'); assert.deepEqual(proof.documentIds, []);
});
test('legacy selection does not inherit collection pagination uncertainty', () => assert.equal(inspect([fixture()], 'legacy', true).scope.partial, false));
test('separate source reviews do not add the two original representations together', () => {
  const docs = inspect([fixture()]); const legacy = inspect([fixture()], 'legacy');
  assert.equal(docs.ledger.totals.assists, 1); assert.equal(legacy.ledger.totals.assists, 1);
});
for (const raw of [null, 'broken', {}, 3]) test(`malformed collection creates a diagnostic: ${String(raw)}`, () => {
  const review = inspect(raw); assert.equal(review.findings[0].code, 'invalid_collection'); assert.equal(review.scope.loadedRows, 0);
});
test('malformed rows are reported without crashing', () => assert.equal(inspect([null, 2, 'broken']).findings.length, 3));
test('foreign-match records are flagged and excluded from fielding totals', () => {
  const foreign = { ...archiveReviewEvent('LOCAL_TEST_SOURCE_OTHER', 'valid'), _documentId: 'foreign-doc' };
  const review = inspect([foreign]); assert.equal(review.findings[0].code, 'foreign_match'); assert.equal(review.ledger.compositeEvents, 0);
});
test('diagnostic generation does not modify archived events or snapshots', () => {
  const rows = [fixture(), fixture('broken')]; const original = structuredClone(rows);
  const review = inspect(rows); review.findings.forEach(finding => prepareArchiveIssue(binding, finding, review.scope));
  assert.deepEqual(rows, original);
});
test('manual priority suppresses a lower-priority valid copy instead of reporting success', () => {
  const live = fixture('valid'); const manual = structuredClone(live);
  manual.source.kind = 'manual'; manual.manualResolve = { required: true };
  const review = inspect([live, manual]); assert.equal(review.ledger.players.length, 0); assert.ok(review.findings.length);
});
test('equal-priority conflicting copies retain both document references', () => {
  const one = fixture('valid'); const two = structuredClone(one);
  two._documentId = 'other-doc'; two.compositePlay.runs = 99;
  const finding = inspect([one, two]).findings.find(item => item.kind === 'integrity');
  assert.deepEqual(new Set(finding.documentIds), new Set(['doc-valid', 'other-doc']));
});
test('large conflict groups disclose omitted document-reference counts', () => {
  const copies = Array.from({ length: 12 }, (_, i) => ({ ...fixture('broken'), _documentId: `doc-${i}` }));
  const finding = inspect(copies).findings[0]; assert.equal(finding.documentIds.length, 8); assert.equal(finding.additionalDocumentCount, 4);
});
test('too-large evidence is rejected instead of silently truncating IDs', () => {
  const finding = inspect([fixture()]).findings[0]; finding.documentIds = ['x'.repeat(1500), 'y'.repeat(1500)];
  assert.equal(prepareArchiveIssue(binding, finding, scope), null);
});
test('a missing event ID stays missing; the physical document ID is retained separately', () => {
  const event = fixture('broken'); delete event.eventId;
  const finding = inspect([event]).findings[0]; assert.equal(finding.eventId, undefined); assert.deepEqual(finding.documentIds, ['doc-broken']);
  const proof = JSON.parse(prepareArchiveIssue(binding, finding, scope).evidence);
  assert.equal(proof.eventId, undefined); assert.ok(proof.reference.startsWith('legacy-'));
});
for (const loadedRows of [-1, 1.5, NaN]) test(`invalid reviewed-row count ${loadedRows} cannot generate evidence`, () => {
  const finding = inspect([fixture()]).findings[0]; assert.equal(prepareArchiveIssue(binding, finding, { ...scope, loadedRows }), null);
});
test('draft is a captured value, not a live reference to a changing finding', () => {
  const finding = inspect([fixture()]).findings[0]; const draft = prepareArchiveIssue(binding, finding, scope); const evidence = draft.evidence;
  finding.documentIds.push('NEW'); finding.message = 'CHANGED'; assert.equal(draft.evidence, evidence); assert.ok(!draft.note.includes('CHANGED'));
});

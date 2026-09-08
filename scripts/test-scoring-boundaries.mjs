import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveScoringEnvironment, localApiOrigin, LOCAL_SCORING_CSP } from '../src/core/firebase/scoringEnvironment.ts';
import { parseScoringTestRun, authorizeScoringTestAccess, scoringTestRecordPath } from '../src/shared/lib/scoringTestScope.ts';
import { extractArtifactDirectory, tapSummary, jsonCaseSummary } from './lib/scoringValidationReport.mjs';

const env = () => ({ VITE_SCORING_EXECUTION_MODE: 'local-emulator', VITE_FIREBASE_PROJECT_ID: 'demo-aubl-scoring',
  VITE_FIREBASE_AUTH_DOMAIN: 'localhost', VITE_BACKEND_API_URL: 'http://127.0.0.1:8080' });
test('unchanged production configuration stays production', () => assert.deepEqual(resolveScoringEnvironment({}), { mode: 'production' }));
test('local mode fixes all three Firebase endpoints', () => {
  const config = resolveScoringEnvironment(env());
  assert.equal(config.projectId, 'demo-aubl-scoring');
  assert.deepEqual([config.auth.port, config.firestore.port, config.functions.port], [9099, 8088, 5001]);
});
test('legacy emulator flag no longer permits a production project', () => {
  assert.throws(() => resolveScoringEnvironment({ VITE_USE_FIRESTORE_EMULATOR: 'true' }));
  assert.equal(resolveScoringEnvironment({ ...env(), VITE_SCORING_EXECUTION_MODE: '', VITE_USE_FIRESTORE_EMULATOR: 'true' }).mode, 'local-emulator');
});
for (const [key, value] of [
  ['VITE_SCORING_EXECUTION_MODE', 'production-test'], ['VITE_SCORING_EXECUTION_MODE', 'unknown'],
  ['VITE_FIREBASE_PROJECT_ID', 'production'], ['VITE_FIREBASE_AUTH_DOMAIN', 'production.firebaseapp.com'],
  ['VITE_BACKEND_API_URL', 'https://api.aubl.club'], ['VITE_BACKEND_PROXY_TARGET', 'https://api.aubl.club'],
  ['VITE_BACKEND_TEST_URL', 'http://localhost:8888'], ['VITE_AUTH_EMULATOR_HOST', 'example.com'],
  ['VITE_FIRESTORE_EMULATOR_HOST', '127.0.0.1.example.com'], ['VITE_FUNCTIONS_EMULATOR_PORT', '0'],
  ['VITE_AUTH_EMULATOR_PORT', '65536'], ['VITE_FIRESTORE_EMULATOR_PORT', 'NaN'],
  ['VITE_USE_FIRESTORE_EMULATOR', 'false'], ['VITE_USE_FIRESTORE_EMULATOR', 'yes'],
  ['VITE_FIREBASE_APPCHECK_SITE_KEY', 'not-for-local'], ['VITE_AUTH_EMULATOR_PORT', '8080'],
]) test(`environment rejects ${key}=${value}`, () => assert.throws(() => resolveScoringEnvironment({ ...env(), [key]: value })));
for (const url of ['', 'ftp://localhost', 'https://localhost', 'http://localhost/private', 'http://x:secret@localhost',
  'http://localhost?proxy=https://example.com', 'http://localhost#x', 'http://example.com'])
  test(`reject unsafe API origin ${url}`, () => assert.throws(() => localApiOrigin(url)));
test('local CSP limits outgoing browser connections', () => {
  assert.match(LOCAL_SCORING_CSP, /connect-src 'self' http:\/\/127\.0\.0\.1:\*/);
  assert.equal(LOCAL_SCORING_CSP.includes('https:'), false);
});

const now = 1_000_000;
const fixture = () => ({ version: 1, runId: 'TEST_RUN_ONE', projectId: 'declared-project', apiOrigin: 'https://api.example.invalid',
  status: 'active', createdAtMs: now - 100, expiresAtMs: now + 1000, approvedAtMs: now - 50, approvedByUid: 'admin',
  matchIds: ['TEST_SCORING_ONE'], participants: [{ uid: 'admin', role: 'admin' }, { uid: 'scorer', role: 'scorer' }, { uid: 'viewer', role: 'viewer' }],
  operations: ['read', 'record', 'review', 'promote'], maxRequests: 1000 });
const request = () => ({ testRunId: 'TEST_RUN_ONE', matchId: 'TEST_SCORING_ONE', uid: 'viewer',
  projectId: 'declared-project', apiOrigin: 'https://api.example.invalid', operation: 'read' });
for (const role of ['admin', 'scorer', 'viewer']) for (const operation of ['read', 'record', 'review', 'promote']) {
  test(`preflight role ${role}: ${operation}`, () => {
    const execute = () => authorizeScoringTestAccess(fixture(), { ...request(), uid: role, operation }, now);
    if (role === 'admin' || operation === 'read' || (role === 'scorer' && operation === 'record')) assert.equal(execute(), role);
    else assert.throws(execute);
  });
}
for (const [key, value] of [['testRunId', 'TEST_RUN_OTHER'], ['matchId', 'real-match'], ['uid', null], ['uid', 'outsider'],
  ['projectId', 'other-project'], ['apiOrigin', 'https://another.invalid']])
  test(`scope mismatch ${key}`, () => assert.throws(() => authorizeScoringTestAccess(fixture(), { ...request(), [key]: value }, now)));
for (const status of ['disabled', 'stopped', 'closed'])
  test(`closed status ${status}`, () => assert.throws(() => authorizeScoringTestAccess({ ...fixture(), status }, request(), now)));
for (const time of [now - 51, now + 1000, NaN])
  test(`invalid access time ${time}`, () => assert.throws(() => authorizeScoringTestAccess(fixture(), request(), time)));
for (const [name, patch] of [
  ['four matches', { matchIds: ['TEST_SCORING_A', 'TEST_SCORING_B', 'TEST_SCORING_C', 'TEST_SCORING_D'] }],
  ['duplicate matches', { matchIds: ['TEST_SCORING_A', 'TEST_SCORING_A'] }],
  ['real match', { matchIds: ['actual-match'] }], ['path traversal', { runId: '../TEST_RUN_ONE' }],
  ['over 24 hours', { expiresAtMs: now + 86_400_000 }], ['missing approval', { approvedByUid: '' }],
  ['approval by viewer', { approvedByUid: 'viewer' }], ['unbounded requests', { maxRequests: 0 }],
  ['too many requests', { maxRequests: 10_001 }], ['invalid API', { apiOrigin: 'https://api.example.invalid/path' }],
  ['empty operations', { operations: [] }], ['unknown operation', { operations: ['delete-all'] }],
]) test(`manifest rejects ${name}`, () => assert.throws(() => parseScoringTestRun({ ...fixture(), ...patch })));
test('manifest is detached from its input', () => {
  const input = fixture(), parsed = parseScoringTestRun(input); parsed.matchIds.push('TEST_SCORING_NEW');
  assert.equal(input.matchIds.length, 1);
});
for (const collection of ['matches', 'matchStates', 'recordSources', 'recordArchives', 'scoringAtomicMatches'])
  test(`scoped path ${collection}`, () => assert.equal(scoringTestRecordPath(request(), collection), `scoringTestRuns/TEST_RUN_ONE/${collection}/TEST_SCORING_ONE`));
test('arbitrary collection paths are refused', () => assert.throws(() => scoringTestRecordPath(request(), '../matches')));

for (const marker of ['RECORD_SOURCE_E2E_OUTPUT', 'RECORD_SOURCE_STORE_E2E_OUTPUT', 'MODAL_READINESS_OUTPUT', 'DEFENSIVE_OUTPUT', 'INTEGRITY_OUTPUT'])
  test(`artifact parser accepts ${marker}`, () => assert.equal(extractArtifactDirectory(`${marker}=/tmp/evidence\r\n`), '/tmp/evidence'));
test('missing artifacts are errors, not undefined paths', () => assert.throws(() => extractArtifactDirectory('nothing')));
test('multiple artifact roots are not guessed', () => assert.throws(() => extractArtifactDirectory('E2E_OUTPUT=/a\nE2E_OUTPUT=/b\n')));
test('TAP summary preserves skipped cases', () => assert.deepEqual(tapSummary('# tests 3\n# pass 2\n# fail 0\n# skipped 1\n'), { total: 3, passed: 2, failed: 0, skipped: 1 }));
test('failed TAP results cannot become a passing report', () => assert.throws(() => tapSummary('# tests 3\n# pass 2\n# fail 1\n# skipped 0\n')));
test('case count is enforced', () => assert.throws(() => jsonCaseSummary('{"status":"passed"}\n', 2)));
test('browser errors invalidate a passing label', () => assert.throws(() => jsonCaseSummary('{"status":"passed","errors":["error"]}\n', 1)));

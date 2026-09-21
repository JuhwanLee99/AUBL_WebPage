// Executed inside the Auth emulator container on a disposable internal network.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

const phase = process.argv[2];
assert.ok(['new-before', 'v25', 'new-after'].includes(phase));
const rows = fs.readFileSync('/rollback-fixture/runs.tsv', 'utf8').trim().split('\n').map((row) => {
  const [runId, checksum, status, mode, fromDate] = row.split('\t');
  return { runId, checksum, status, mode, fromDate };
});
assert.equal(rows.length, 3);
assert.ok(rows.some((row) => row.mode === 'FROM_DATE' && row.fromDate === '2026-09-11'));
assert.ok(rows.some((row) => row.mode === '<NULL>' && row.fromDate === '<NULL>'));
const activeRevision = fs.readFileSync('/rollback-fixture/active-revision.txt', 'utf8').trim();
assert.ok(activeRevision && !activeRevision.includes('\n'));
const base = `http://${phase}:8080/api/admin/sync/unique-play`;
const firstPath = `${base}/runs/${encodeURIComponent(rows[0].runId)}`;
const checks = [];

const deadline = Date.now() + 120000;
let ready = false;
while (Date.now() < deadline) {
  try {
    const response = await fetch(firstPath, { signal: AbortSignal.timeout(2000) });
    await response.text();
    if (response.status === 401) { ready = true; break; }
  } catch { /* App startup is bounded by the overall deadline. */ }
  await delay(500);
}
assert.equal(ready, true, `${phase}: secured HTTP server did not become ready`);
checks.push('secured-http-started-and-anonymous-denied');

const signIn = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fixture-only', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'fixture-admin@example.invalid', password: 'FixtureOnly-20260912', returnSecureToken: true }),
  signal: AbortSignal.timeout(10000),
});
assert.equal(signIn.status, 200, 'Auth emulator sign-in failed');
const { idToken } = await signIn.json();
assert.equal(typeof idToken, 'string');
const claims = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString('utf8'));
assert.equal(claims.admin, true);
assert.equal(claims.aud, 'demo-aubl-scoped-full');
checks.push('emulator-issued-admin-token');

async function get(url, authenticated = true) {
  const response = await fetch(url, {
    headers: authenticated ? { authorization: `Bearer ${idToken}` } : {},
    signal: AbortSignal.timeout(30000),
  });
  const body = await response.json();
  assert.equal(response.status, 200, `${phase}: GET failed (${response.status}) at ${new URL(url).pathname}`);
  return body;
}

const runs = [];
for (const row of rows) {
  const run = await get(`${base}/runs/${encodeURIComponent(row.runId)}`);
  assert.equal(run.runId, row.runId);
  assert.equal(run.checksum, row.checksum);
  assert.equal(run.status, row.status);
  assert.equal(run.seasonYear, 2026);
  assert.equal(run.leagueId, '57');
  checks.push(`run-read:${row.runId}`);
  const review = await get(`${base}/runs/${encodeURIComponent(row.runId)}/game-records`);
  assert.match(review.reviewChecksum, /^[a-f0-9]{64}$/i);
  checks.push(`game-record-review-read:${row.runId}`);
  runs.push({ runId: run.runId, checksum: run.checksum, status: run.status,
    seasonYear: run.seasonYear, leagueId: run.leagueId, baseRevision: run.baseRevision ?? null,
    reviewChecksum: review.reviewChecksum });
}

const firestoreBase = 'http://firestore:8080/v1/projects/demo-aubl-scoped-full/databases/(default)/documents';
const metadata = await get(`${firestoreBase}/syncMetadata/2026`, false);
assert.equal(metadata.fields.publishedRevision.stringValue, activeRevision);
const listed = await get(`${firestoreBase}/matches?pageSize=100`, false);
assert.equal(listed.nextPageToken, undefined);
const matches = [...(listed.documents ?? [])].sort((a, b) => a.name.localeCompare(b.name));
assert.equal(matches.length, 2);
for (const match of matches) {
  assert.equal(match.fields.syncRevision.stringValue, activeRevision);
  assert.equal(match.fields.sourceActive.booleanValue, true);
}
checks.push('firestore-official-revision-and-two-matches-preserved');
const snapshot = { runs, metadata, matches };
if (phase !== 'new-before') {
  const before = JSON.parse(fs.readFileSync('/rollback-fixture/new-before.json', 'utf8'));
  assert.deepEqual(snapshot, before.snapshot, `${phase}: read responses or official projection changed`);
  checks.push('matches-new-version-read-baseline');
}
process.stdout.write(JSON.stringify({ phase, checks, snapshot }, null, 2));

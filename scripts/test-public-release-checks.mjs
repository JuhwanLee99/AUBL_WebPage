import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assessChecksum, assessOverview, inspectHtmlCache } from './check-uniqueplay-public-release.mjs';

const hash = 'a'.repeat(64);
test('missing public checksum is not a mismatch', () => {
  assert.deepEqual(assessChecksum(undefined, hash), { preserved: null, status: 'not_checked', reason: 'checksum_not_exposed' });
});
test('missing expected checksum cannot pass', () => assert.equal(assessChecksum(hash).status, 'not_checked'));
test('valid identical hashes match case-insensitively', () => assert.equal(assessChecksum(hash, hash.toUpperCase()).preserved, true));
test('different hashes are explicitly mismatched', () => assert.equal(assessChecksum(hash, 'b'.repeat(64)).status, 'mismatched'));
test('malformed hashes cannot match', () => assert.equal(assessChecksum('bad', 'bad').status, 'invalid'));
for (const header of ['no-cache', 'public, no-cache', 'no-store', 'max-age=0, must-revalidate']) {
  test(`HTML revalidates: ${header}`, () => assert.equal(inspectHtmlCache(header), true));
}
for (const header of [null, 'max-age=3600', 'public,max-age=31536000,immutable', 'max-age=0']) {
  test(`HTML policy rejected: ${header}`, () => assert.equal(inspectHtmlCache(header), false));
}
test('revision preservation does not imply content checksum verification', () => {
  const result = assessOverview({ sourceFreshness: { publishedRevision: 'r1' }, recentGames: [{ syncRevision: 'r1' }] }, 'r1');
  assert.equal(result.officialRevisionPreserved, true);
  assert.equal(result.recordRevisionsConsistent, true);
  assert.equal(result.officialChecksumPreserved, null);
  assert.equal(result.officialChecksumStatus, 'not_checked');
});
test('mixed revisions are rejected', () => {
  const result = assessOverview({ sourceFreshness: { publishedRevision: 'r1' }, groups: [{ standings: [{ syncRevision: 'r2' }] }] }, 'r1');
  assert.equal(result.recordRevisionsConsistent, false);
});
test('missing published revision cannot pass', () => assert.equal(assessOverview({}, 'r1').officialRevisionPreserved, false));
test('missing expected revision fails closed', () => assert.throws(() => assessOverview({}, ''), /Expected revision/));
test('Hosting HTML fallback precedes immutable asset override', async () => {
  const { hosting } = JSON.parse(await readFile(new URL('../firebase.json', import.meta.url), 'utf8'));
  const fallback = hosting.headers.findIndex(rule => rule.source === '**');
  const assets = hosting.headers.findIndex(rule => rule.source === '**/*.@(js|css|png|jpg|jpeg|svg|webp|gif|ico)');
  assert.ok(fallback >= 0 && assets > fallback);
  assert.ok(inspectHtmlCache(hosting.headers[fallback].headers.find(header => header.key === 'Cache-Control').value));
  assert.match(hosting.headers[assets].headers.find(header => header.key === 'Cache-Control').value, /immutable/);
});

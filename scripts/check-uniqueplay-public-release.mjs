import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function assessChecksum(actual, expected) {
  if (actual == null) return { preserved: null, status: 'not_checked', reason: 'checksum_not_exposed' };
  if (expected == null) return { preserved: null, status: 'not_checked', reason: 'expected_checksum_not_supplied' };
  const valid = value => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
  if (!valid(actual) || !valid(expected)) return { preserved: null, status: 'invalid', reason: 'invalid_checksum' };
  const preserved = actual.toLowerCase() === expected.toLowerCase();
  return { preserved, status: preserved ? 'matched' : 'mismatched', reason: null };
}

export function inspectHtmlCache(header) {
  const directives = (header || '').toLowerCase().split(',').map(value => value.trim());
  return directives.includes('no-cache') || directives.includes('no-store')
    || (directives.includes('max-age=0') && directives.includes('must-revalidate'));
}

export function assessOverview(overview, expectedRevision) {
  if (typeof expectedRevision !== 'string' || !expectedRevision.trim()) throw new Error('Expected revision is required');
  const publishedRevision = overview?.sourceFreshness?.publishedRevision ?? null;
  const recordRevisions = [];
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (key === 'syncRevision') recordRevisions.push(child);
      else if (child && typeof child === 'object') visit(child);
    }
  };
  visit(overview);
  return {
    publishedRevision,
    officialRevisionPreserved: publishedRevision === expectedRevision,
    recordRevisionCount: recordRevisions.length,
    recordRevisionsConsistent: recordRevisions.every(value => value === expectedRevision),
    // This public endpoint does not expose an authoritative content checksum.
    officialChecksumPreserved: null,
    officialChecksumStatus: 'not_checked',
    officialChecksumReason: 'checksum_not_exposed',
  };
}

async function main() {
  const args = process.argv.slice(2);
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    if (!['--expected-revision', '--expected-bundle', '--output'].includes(args[index]) || !args[index + 1]) {
      throw new Error('Usage: --expected-revision ID --expected-bundle /assets/FILE.js [--output FILE]');
    }
    options[args[index]] = args[index + 1];
  }
  if (!options['--expected-revision'] || !/^\/assets\/[\w.-]+\.js$/.test(options['--expected-bundle'] || '')) {
    throw new Error('Expected revision and hashed bundle are required');
  }
  const fetchReadOnly = url => fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
  const response = await fetchReadOnly('https://api.aubl.club/api/seasons/12/overview');
  if (!response.ok) throw new Error(`Overview HTTP ${response.status}`);
  const overview = assessOverview(await response.json(), options['--expected-revision']);
  const pages = [];
  for (const path of ['/', '/admin/unique-play-sync']) {
    const page = await fetchReadOnly(`https://aubl.club${path}`);
    const html = await page.text();
    const cacheControl = page.headers.get('cache-control');
    pages.push({ path, status: page.status, expectedBundlePresent: html.includes(options['--expected-bundle']),
      cacheControl, revalidates: inspectHtmlCache(cacheControl) });
  }
  const asset = await fetchReadOnly(`https://aubl.club${options['--expected-bundle']}`);
  await asset.body?.cancel();
  const assetCache = asset.headers.get('cache-control') || '';
  const bundle = { status: asset.status, cacheControl: assetCache,
    immutable: /(?:^|,)\s*immutable\s*(?:,|$)/i.test(assetCache) };
  const passed = overview.officialRevisionPreserved && overview.recordRevisionsConsistent
    && pages.every(page => page.status === 200 && page.expectedBundlePresent && page.revalidates)
    && bundle.status === 200 && bundle.immutable;
  const report = { checkedAt: new Date().toISOString(), passed, scope: 'public_revision_and_hosting_only',
    contentIntegrityVerified: false, overview, pages, bundle };
  const text = `${JSON.stringify(report, null, 2)}\n`;
  if (options['--output']) await writeFile(options['--output'], text);
  process.stdout.write(text);
  if (!passed) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}

import assert from 'node:assert/strict';

export function extractArtifactDirectory(log) {
  const values = [...log.matchAll(/^[A-Z][A-Z0-9_]*_OUTPUT=(.+)$/gm)].map(match => match[1].trim());
  assert.equal(values.length, 1, 'Exactly one artifact directory is required');
  assert.ok(values[0], 'Artifact directory cannot be empty');
  return values[0];
}

export function tapSummary(log) {
  const count = key => {
    const matches = [...log.matchAll(new RegExp('^# ' + key + ' (\\d+)\\r?$', 'gm'))];
    assert.equal(matches.length, 1, 'Exactly one TAP summary is required: ' + key);
    return Number(matches[0][1]);
  };
  const result = { total: count('tests'), passed: count('pass'), failed: count('fail'), skipped: count('skipped') };
  assert.ok(result.total > 0); assert.equal(result.failed, 0);
  assert.equal(result.passed + result.skipped, result.total);
  return result;
}

export function jsonCaseSummary(log, expected) {
  const results = log.split('\n').flatMap(line => {
    try { const value = JSON.parse(line); return ['passed', 'failed'].includes(value?.status) ? [value] : []; }
    catch { return []; }
  });
  assert.equal(results.length, expected, 'Unexpected case count');
  assert.ok(results.every(row => row.status === 'passed'), 'Failed cases must not be dropped');
  for (const row of results) for (const key of ['errors', 'browserErrors', 'blocked']) {
    if (Array.isArray(row[key])) assert.deepEqual(row[key], [], 'Unexpected browser/network errors');
  }
  return { total: results.length, passed: results.length, failed: 0 };
}

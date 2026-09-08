import test from 'node:test';
import assert from 'node:assert/strict';
import { earnedRunsView, normalizeEarnedRunsStatus, serializeEarnedRuns } from '../src/shared/lib/earnedRuns.ts';

// Pure local fixtures only: no Firebase, credentials, application store or network.
for (const invalid of [undefined, null, '', '0', -1, 1.5, NaN, Infinity]) {
  test(`invalid earned runs never become confirmed zero: ${String(invalid)}`, () => {
    assert.equal(normalizeEarnedRunsStatus('confirmed', invalid), 'unconfirmed');
    assert.deepEqual(serializeEarnedRuns(invalid, 27, 'confirmed'), { earnedRunsStatus: 'unconfirmed' });
  });
}
test('legacy numeric record remains unconfirmed without destroying the stored value', () => {
  assert.deepEqual(serializeEarnedRuns(2, 27, undefined), { earnedRunsStatus: 'unconfirmed', er: 2 });
  assert.equal(earnedRunsView(2, 27, undefined).er, '미확정');
  assert.equal(earnedRunsView(2, 27, undefined).era, '-');
});
test('estimated values stay estimated after JSON persistence', () => {
  const row = JSON.parse(JSON.stringify(serializeEarnedRuns(2, 18, 'estimated')));
  assert.deepEqual(row, { earnedRunsStatus: 'estimated', er: 2, era: 3 });
  assert.equal(earnedRunsView(row.er, 18, row.earnedRunsStatus).era, '3.00 (추정)');
  assert.equal(earnedRunsView(row.er, 18, row.earnedRunsStatus).er, '2 (추정)');
});
test('explicitly reviewed zero differs from missing or estimated zero', () => {
  assert.equal(earnedRunsView(0, 3, 'confirmed').era, '0.00');
  assert.equal(earnedRunsView(0, 3, 'estimated').era, '0.00 (추정)');
  assert.equal(earnedRunsView(undefined, 3, 'confirmed').era, '-');
  assert.equal(earnedRunsView(0, 3, undefined).status, 'unconfirmed');
});
for (const outs of [0, -1, 1.5, Infinity, undefined]) {
  test(`invalid or zero outs do not manufacture a zero ERA: ${String(outs)}`, () => {
    assert.equal(serializeEarnedRuns(1, outs, 'confirmed').era, undefined);
    assert.equal(earnedRunsView(1, outs, 'confirmed').era, '-');
  });
}
test('serialization is idempotent and rounds fractional ERA', () => {
  const row = serializeEarnedRuns(1, 7, 'confirmed');
  assert.equal(row.era, 3.86);
  assert.deepEqual(serializeEarnedRuns(row.er, 7, row.earnedRunsStatus), row);
});
test('unknown status is not silently promoted', () => {
  assert.equal(normalizeEarnedRunsStatus('official', 1), 'unconfirmed');
});

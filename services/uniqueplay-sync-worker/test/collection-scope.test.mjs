import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCollectionScope, includesGameDate } from '../src/collection-scope.mjs';
const scope = (fromDate) => ({ version: 1, mode: 'FROM_DATE', fromDate });
for (const [timestamp, expected] of [
  ['2026-09-10T14:59:59Z', false],
  ['2026-09-10T15:00:00Z', true],
  ['2026-09-11T00:00:00+09:00', true],
  ['2026-09-12T00:00:00+09:00', true],
]) test(`KST inclusive boundary ${timestamp}`, () => assert.equal(includesGameDate(timestamp, '2026-09-11'), expected));
for (const date of ['2026-02-30', '2025-09-11', '2026-13-01', '2026-9-1', '']) {
  test(`reject invalid scope date ${date}`, () => assert.throws(() => validateCollectionScope(scope(date), 2026)));
}
test('accept valid date and legacy absence', () => {
  validateCollectionScope(scope('2026-09-11'), 2026);
  validateCollectionScope(undefined, 2026);
});
test('reject unsupported protocol and mode', () => {
  assert.throws(() => validateCollectionScope({ ...scope('2026-09-11'), version: 2 }, 2026));
  assert.throws(() => validateCollectionScope({ ...scope('2026-09-11'), mode: 'ALL' }, 2026));
});
test('reject date without offset or invalid instant', () => {
  assert.throws(() => includesGameDate('2026-09-11T00:00:00', '2026-09-11'));
  assert.throws(() => includesGameDate('badZ', '2026-09-11'));
});

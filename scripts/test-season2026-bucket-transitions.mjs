import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bucketTransitions } from '../src/features/front/components/season2026/bucketTransitions.ts';
const row = (rank, buckets, extra = {}) => ({ teamId: rank, teamName: `T${rank}`, rank, qualification: 'out', projection: { possibleBuckets: buckets, exhausted: false }, ...extra });
test('within-bucket rank changes are excluded', () => {
  assert.deepEqual(bucketTransitions([row(1, ['eutteum'])])[0].destinations, []);
});
test('duplicate paths collapse to distinct boundary movements', () => {
  const item = bucketTransitions([row(3, ['beogeum', 'eutteum', 'out', 'out'])])[0];
  assert.equal(item.from, 'beogeum');
  assert.deepEqual(item.destinations, ['eutteum', 'out']);
});
test('partial and missing calculations cannot establish unchanged qualification', () => {
  assert.equal(bucketTransitions([row(5, ['out'], { projection: { possibleBuckets: ['out'], exhausted: true } })])[0].incomplete, true);
  assert.equal(bucketTransitions([row(5, [], { projection: undefined })])[0].incomplete, true);
});
test('current boundary tie is not assigned an arbitrary starting bucket', () => {
  const items = bucketTransitions([row(2, ['eutteum', 'beogeum']), row(2, ['eutteum', 'beogeum'], { teamId: 3 })]);
  assert.ok(items.every(i => i.currentUnresolved && i.destinations.length === 0));
});
test('tie entirely inside same current bucket still allows a transition', () => {
  const items = bucketTransitions([row(1, ['eutteum', 'beogeum']), row(1, ['eutteum'], { teamId: 2 })]);
  assert.equal(items[0].currentUnresolved, false);
  assert.deepEqual(items[0].destinations, ['beogeum']);
});

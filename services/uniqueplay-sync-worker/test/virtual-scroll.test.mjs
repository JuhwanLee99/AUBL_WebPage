import test from 'node:test';
import assert from 'node:assert/strict';
import { collectUntilStable } from '../src/adapter.mjs';

test('virtual table collection keeps scrolling until three unchanged samples', async () => {
  const pages = [
    [{ fixed: ['1', 'A'], values: ['1'] }, { fixed: ['2', 'B'], values: ['2'] }],
    [{ fixed: ['2', 'B'], values: ['2'] }, { fixed: ['3', 'C'], values: ['3'] }],
    [{ fixed: ['3', 'C'], values: ['3'] }, { fixed: ['4', 'D'], values: ['4'] }],
    [{ fixed: ['4', 'D'], values: ['4'] }],
    [{ fixed: ['4', 'D'], values: ['4'] }],
    [{ fixed: ['4', 'D'], values: ['4'] }],
  ];
  let index = 0;
  const result = await collectUntilStable({
    read: async () => ({ rows: pages[Math.min(index, pages.length - 1)], reason: null }),
    advance: async () => {
      index += 1;
      return index < pages.length - 1;
    },
  });

  assert.deepEqual(result.map((row) => row.fixed[1]), ['A', 'B', 'C', 'D']);
  assert.ok(index >= 4);
});

test('virtual table collection fails closed when the provider headers change', async () => {
  await assert.rejects(
    collectUntilStable({
      read: async () => ({ rows: [], reason: 'headers:changed' }),
      advance: async () => false,
    }),
    /table changed/,
  );
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { collectLazyList, collectUntilStable, statusFromKorean } from '../src/adapter.mjs';

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

test('virtual table does not treat repeated rows as complete while its scroll surface can advance', async () => {
  const pages = [
    [{ fixed: ['1', 'A'], values: ['1'] }],
    [{ fixed: ['1', 'A'], values: ['1'] }],
    [{ fixed: ['1', 'A'], values: ['1'] }],
    [{ fixed: ['1', 'A'], values: ['1'] }],
    [{ fixed: ['1', 'A'], values: ['1'] }, { fixed: ['2', 'B'], values: ['2'] }],
    [{ fixed: ['2', 'B'], values: ['2'] }],
    [{ fixed: ['2', 'B'], values: ['2'] }],
    [{ fixed: ['2', 'B'], values: ['2'] }],
  ];
  let index = 0;
  const result = await collectUntilStable({
    read: async () => ({ rows: pages[Math.min(index, pages.length - 1)], reason: null }),
    advance: async () => {
      index += 1;
      return index < pages.length - 3;
    },
  });

  assert.deepEqual(result.map((row) => row.fixed[1]), ['A', 'B']);
  assert.ok(index >= pages.length - 1);
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

test('lazy game list does not stop while the scroll container can still advance', async () => {
  const pages = [
    ['A'],
    ['A'],
    ['A'],
    ['A'],
    ['A', 'B'],
    ['A', 'B'],
    ['A', 'B'],
    ['A', 'B'],
  ];
  let index = 0;
  const result = await collectLazyList({
    read: async () => pages[Math.min(index, pages.length - 1)],
    advance: async () => {
      index += 1;
      return index < pages.length - 3;
    },
    identify: (row) => row,
  });

  assert.deepEqual(result, ['A', 'B']);
  assert.ok(index >= pages.length - 1);
});

test('virtualized collectors fail closed if max passes end before stable-end proof', async () => {
  await assert.rejects(
    collectUntilStable({
      read: async () => ({ rows: [{ fixed: ['1', 'A'], values: ['1'] }], reason: null }),
      advance: async () => true,
      maxPasses: 4,
    }),
    { code: 'COLLECTION_INCOMPLETE' },
  );
  await assert.rejects(
    collectLazyList({
      read: async () => ['A'],
      advance: async () => true,
      identify: (row) => row,
      maxPasses: 4,
    }),
    { code: 'COLLECTION_INCOMPLETE' },
  );
});

test('normalizes UniquePlay mercy-rule and forfeited results as completed', () => {
  assert.equal(statusFromKorean('콜드승'), 'COMPLETED');
  assert.equal(statusFromKorean('몰수게임'), 'COMPLETED');
  assert.equal(statusFromKorean('경기전'), 'SCHEDULED');
});

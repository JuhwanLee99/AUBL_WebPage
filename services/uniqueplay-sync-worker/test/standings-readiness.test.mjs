import assert from 'node:assert/strict';
import test from 'node:test';
import { collectReadyStandings } from '../src/standings-readiness.mjs';
import { standingFromRow } from '../src/adapter.mjs';

const rows = [
  { fixed: ['1', 'Private team A'], values: ['8', '0.83', '5', '1', '2', '17', '0.00'] },
  { fixed: ['1', 'Private team B'], values: ['7', '0.83', '5', '1', '1', '16', '0.00'] },
  { fixed: ['3', 'Private team C'], values: ['6', '0.60', '3', '2', '1', '10', '1.50'] },
  { fixed: ['4', 'Private team D'], values: ['6', '0.17', '1', '5', '0', '3', '4.00'] },
  { fixed: ['5', 'Private team E'], values: ['7', '0.14', '1', '6', '0', '3', '4.50'] },
];
const allFirst = () => rows.map(row => ({ ...row, fixed: ['1', row.fixed[1]] }));

function setup(snapshots, overrides = {}) {
  let reads = 0;
  const observations = [];
  const waits = [];
  return {
    observations,
    waits,
    get reads() { return reads; },
    run: () => collectReadyStandings({
      groupCode: 'A',
      convert: standingFromRow,
      read: async () => snapshots[Math.min(reads++, snapshots.length - 1)],
      wait: async milliseconds => { waits.push(milliseconds); },
      onObservation: observation => { observations.push(observation); },
      ...overrides,
    }),
  };
}

test('valid source ranks return immediately without waiting or rewriting', async () => {
  const harness = setup([rows]);
  assert.deepEqual((await harness.run()).map(row => row.rank), ['1', '1', '3', '4', '5']);
  assert.equal(harness.reads, 1);
  assert.deepEqual(harness.waits, []);
  assert.deepEqual(harness.observations, []);
});

test('an initial all-first snapshot recovers after the source ranks settle', async () => {
  const harness = setup([allFirst(), rows]);
  assert.deepEqual((await harness.run()).map(row => row.rank), ['1', '1', '3', '4', '5']);
  assert.equal(harness.reads, 2);
  assert.deepEqual(harness.waits, [500]);
  assert.deepEqual(harness.observations.map(item => item.status), ['waiting', 'recovered']);
  assert.deepEqual(harness.observations[0].rawRanks, [1, 1, 1, 1, 1]);
  assert.deepEqual(harness.observations[1].convertedRanks, [1, 1, 3, 4, 5]);
});

for (const [name, modify] of [
  ['inverted ranks', source => { source[2].fixed[0] = '6'; }],
  ['missing rank', source => { source[2].fixed[0] = ''; }],
  ['invalid record count', source => { source[2].values[2] = 'not-a-count'; }],
]) {
  test(`${name} are re-read rather than guessed`, async () => {
    const invalid = structuredClone(rows);
    modify(invalid);
    const harness = setup([invalid, rows]);
    assert.deepEqual((await harness.run()).map(row => row.rank), ['1', '1', '3', '4', '5']);
    assert.equal(harness.reads, 2);
  });
}

test('a permanently inconsistent table is rejected after exactly four attempts', async () => {
  const harness = setup([allFirst()]);
  await assert.rejects(harness.run(), error => {
    assert.equal(error.code, 'STANDINGS_RANK_CONFLICT');
    assert.equal(error.standingsDiagnostic.groupCode, 'A');
    return true;
  });
  assert.equal(harness.reads, 4);
  assert.deepEqual(harness.waits, [500, 500, 500]);
  assert.deepEqual(harness.observations.map(item => item.status), ['waiting', 'waiting', 'waiting', 'rejected']);
});

test('recovery on the final permitted attempt is accepted', async () => {
  const harness = setup([allFirst(), allFirst(), allFirst(), rows]);
  assert.deepEqual((await harness.run()).map(row => row.rank), ['1', '1', '3', '4', '5']);
  assert.equal(harness.reads, 4);
  assert.equal(harness.observations.at(-1).status, 'recovered');
});

test('diagnostics distinguish raw ranks from a faulty conversion', async () => {
  const harness = setup([rows], {
    maxAttempts: 1,
    convert: row => ({ ...standingFromRow(row), rank: '1' }),
  });
  await assert.rejects(harness.run(), { code: 'STANDINGS_RANK_CONFLICT' });
  assert.deepEqual(harness.observations[0].rawRanks, [1, 1, 3, 4, 5]);
  assert.deepEqual(harness.observations[0].convertedRanks, [1, 1, 1, 1, 1]);
  assert.equal(JSON.stringify(harness.observations).includes('Private team'), false);
});

test('diagnostics exclude arbitrary rank strings and are bounded to forty rows', async () => {
  const many = Array.from({ length: 45 }, (_, i) => ({
    fixed: ['secret-token-value', `Private team ${i}`], values: rows[0].values,
  }));
  const harness = setup([many], { maxAttempts: 1 });
  await assert.rejects(harness.run(), { code: 'STANDINGS_RANK_CONFLICT' });
  assert.equal(harness.observations[0].rawRanks.length, 40);
  assert.equal(harness.observations[0].convertedRanks.length, 40);
  assert.equal(harness.observations[0].truncated, true);
  assert.equal(JSON.stringify(harness.observations).includes('secret-token-value'), false);
});

for (const code of ['REAUTH_REQUIRED', 'SYNC_STORAGE_UNAVAILABLE', 'SOURCE_UI_TIMEOUT', 'COLLECTION_INCOMPLETE']) {
  test(`${code} propagates immediately without readiness retries`, async () => {
    const failure = Object.assign(new Error(code), { code });
    let reads = 0;
    const harness = setup([], { read: async () => { reads += 1; throw failure; } });
    await assert.rejects(harness.run(), error => error === failure);
    assert.equal(reads, 1);
    assert.deepEqual(harness.waits, []);
    assert.deepEqual(harness.observations, []);
  });
}

test('conversion errors are not retried or replaced with a rank conflict', async () => {
  const failure = new TypeError('converter failed');
  const harness = setup([rows], { convert: () => { throw failure; } });
  await assert.rejects(harness.run(), error => error === failure);
  assert.equal(harness.reads, 1);
});

test('a closed page during the retry wait propagates immediately', async () => {
  const failure = new Error('page closed');
  const harness = setup([allFirst()], { wait: async () => { throw failure; } });
  await assert.rejects(harness.run(), error => error === failure);
  assert.equal(harness.reads, 1);
});

for (const snapshot of [[], null, {}]) {
  test(`incomplete snapshot ${JSON.stringify(snapshot)} is rejected, not accepted as empty success`, async () => {
    const harness = setup([snapshot]);
    await assert.rejects(harness.run(), { code: 'STANDINGS_TABLE_INCOMPLETE' });
    assert.equal(harness.reads, 1);
  });
}

for (const maxAttempts of [0, 7, 1.5, NaN]) {
  test(`invalid attempt limit ${maxAttempts} is rejected before reading`, async () => {
    const harness = setup([rows], { maxAttempts });
    await assert.rejects(harness.run(), RangeError);
    assert.equal(harness.reads, 0);
  });
}

test('equal ranks with no decisions are not treated as a false conflict', async () => {
  const zero = rows.map(row => ({ fixed: ['1', row.fixed[1]], values: ['0', '0', '0', '0', '0', '0', '0'] }));
  const harness = setup([zero]);
  assert.deepEqual((await harness.run()).map(row => row.rank), ['1', '1', '1', '1', '1']);
  assert.equal(harness.reads, 1);
});

test('readiness does not mutate frozen extracted rows', async () => {
  const source = structuredClone(rows);
  source.forEach(row => { Object.freeze(row.fixed); Object.freeze(row.values); Object.freeze(row); });
  await setup([source]).run();
  assert.deepEqual(source, rows);
});

test('group codes cannot inject arbitrary text into diagnostics', async () => {
  const harness = setup([allFirst()], { groupCode: 'A secret-token' });
  await assert.rejects(harness.run(), TypeError);
  assert.equal(harness.reads, 0);
});

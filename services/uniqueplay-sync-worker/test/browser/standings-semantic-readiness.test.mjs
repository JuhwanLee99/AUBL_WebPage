import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';
import { collectVirtualTable, standingFromRow } from '../../src/adapter.mjs';
import { collectReadyStandings } from '../../src/standings-readiness.mjs';

const headers = ['게임수', '승률', '승', '패', '무', '승점', '게임차'];
const ranks = ['1', '1', '3', '4', '5'];
const values = [
  ['8', '0.83', '5', '1', '2', '17', '0.00'],
  ['7', '0.83', '5', '1', '1', '16', '0.00'],
  ['6', '0.60', '3', '2', '1', '10', '1.50'],
  ['6', '0.17', '1', '5', '0', '3', '4.00'],
  ['7', '0.14', '1', '6', '0', '3', '4.50'],
];

async function fixture(t, settleAfterWaits, initiallyReady = false) {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route('**/*', route => route.abort());
  const fixed = ranks.map((rank, i) => `<div><div data-rank>${initiallyReady ? rank : '1'}</div><div></div><div><div>Team ${i + 1}</div></div></div>`).join('');
  const header = `<div>${headers.map(h => `<div><div>${h} ▼</div></div>`).join('')}</div>`;
  const body = values.map(row => `<div>${row.map(value => `<div>${value}</div>`).join('')}</div>`).join('');
  await page.setContent(`<div><div><div><div>규정: 승률제</div></div>${fixed}</div><div><div><div>${header}${body}</div></div></div></div>`);
  let waits = 0;
  const wait = async () => {
    waits += 1;
    if (waits === settleAfterWaits) {
      await page.locator('[data-rank]').evaluateAll((elements, next) => {
        elements.forEach((element, i) => { element.textContent = next[i]; });
      }, ranks);
    }
  };
  const instrumented = new Proxy(page, {
    get(target, key) {
      if (key === 'waitForTimeout') return wait;
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  let reads = 0;
  const observations = [];
  return {
    observations,
    get reads() { return reads; },
    run: () => collectReadyStandings({
      groupCode: 'A',
      convert: standingFromRow,
      read: () => {
        reads += 1;
        return collectVirtualTable(instrumented, '게임수', headers, { groupCode: 'A', table: 'STANDINGS' });
      },
      wait,
      onObservation: observation => observations.push(observation),
    }),
  };
}

test('a ready source-shaped DOM keeps tied ranks without another table collection', async t => {
  const harness = await fixture(t, Infinity, true);
  assert.deepEqual((await harness.run()).map(row => row.rank), ranks);
  assert.equal(harness.reads, 1);
});

test('rank rendering during initial structural collection is accepted normally', async t => {
  const harness = await fixture(t, 2);
  assert.deepEqual((await harness.run()).map(row => row.rank), ranks);
  assert.equal(harness.reads, 1);
});

test('rank rendering after structural collection is recovered by semantic re-reading', async t => {
  const harness = await fixture(t, 6);
  assert.deepEqual((await harness.run()).map(row => row.rank), ranks);
  assert.equal(harness.reads, 2);
  assert.deepEqual(harness.observations.map(item => item.status), ['waiting', 'recovered']);
  assert.deepEqual(harness.observations[0].rawRanks, [1, 1, 1, 1, 1]);
  assert.deepEqual(harness.observations[1].rawRanks, [1, 1, 3, 4, 5]);
});

test('a permanently invalid DOM is rejected without infinite collection or invented ranks', async t => {
  const harness = await fixture(t, Infinity);
  await assert.rejects(harness.run(), { code: 'STANDINGS_RANK_CONFLICT' });
  assert.equal(harness.reads, 4);
  assert.equal(harness.observations.at(-1).status, 'rejected');
  assert.deepEqual(harness.observations.at(-1).convertedRanks, [1, 1, 1, 1, 1]);
});

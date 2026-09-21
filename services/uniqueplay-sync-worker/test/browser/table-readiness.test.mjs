import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { collectVirtualTable, readVisibleTable } from '../../src/adapter.mjs';
import { readReadyTable } from '../../src/collection-diagnostics.mjs';

const headers = ['게임수', '승률', '승', '패', '무', '승점', '게임차'];
const context = { groupCode: 'E', table: 'STANDINGS' };
const fixture = `<!doctype html><style>body{margin:0}#scroll{height:240px;overflow:auto}.row{height:28px}</style>
  <div id="table"><div id="fixed"></div><div id="scroll"><div><div id="values"><div id="headers"></div></div></div></div></div>`;

async function fillTable(page, count = 5) {
  await page.evaluate(({ headers, count }) => {
    const makeRow = values => {
      const row = document.createElement('div'); row.className = 'row';
      for (const value of values) { const cell = document.createElement('span'); cell.textContent = String(value); row.append(cell); }
      return row;
    };
    document.querySelector('#headers').replaceChildren(...headers.map(value => { const span = document.createElement('span'); span.textContent = value; return span; }));
    for (let i = 0; i < count; i++) {
      document.querySelector('#fixed').append(makeRow([i + 1, `Team ${i + 1}`]));
      document.querySelector('#values').append(makeRow([6, '0.50', 3, 3, 0, 9, '0.00']));
    }
  }, { headers, count });
}

test('actual adapter waits for delayed headers then collects a complete Chromium table', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage(); await page.route('**/*', route => route.abort());
    await page.setContent(fixture);
    let waits = 0;
    const snapshot = await readReadyTable({ context, read: () => readVisibleTable(page, '게임수', headers),
      wait: async () => { if (++waits === 2) await fillTable(page); } });
    assert.equal(waits, 2); assert.equal(snapshot.rows.length, 5);
    const result = await collectVirtualTable(page, '게임수', headers, context);
    assert.equal(result.length, 5); assert.deepEqual(result.map(row => row.fixed[0]), ['1', '2', '3', '4', '5']);
  } finally { await browser.close(); }
});
test('actual adapter rejects persistent fixed/value row mismatch with bounded safe diagnostics', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage(); await page.route('**/*', route => route.abort());
    await page.setContent(fixture); await fillTable(page);
    await page.locator('#values').evaluate(values => values.lastElementChild.remove());
    await assert.rejects(readReadyTable({ context, maxAttempts: 2, read: () => readVisibleTable(page, '게임수', headers) }), error => {
      assert.equal(error.code, 'SOURCE_TABLE_ROW_MISMATCH');
      assert.equal(error.collectionDiagnostic.fixedRowCount, 5); assert.equal(error.collectionDiagnostic.valueRowCount, 4);
      assert.ok(!JSON.stringify(error).includes('Team')); return true;
    });
  } finally { await browser.close(); }
});
test('transient header order change recovers only after the expected real DOM schema is restored', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage(); await page.route('**/*', route => route.abort());
    await page.setContent(fixture); await fillTable(page);
    await page.locator('#headers').evaluate(header => { header.children[1].textContent = '승'; header.children[2].textContent = '승률'; });
    let waits = 0;
    const result = await readReadyTable({ context, read: () => readVisibleTable(page, '게임수', headers), wait: async () => {
      waits++; await page.locator('#headers').evaluate(header => { header.children[1].textContent = '승률'; header.children[2].textContent = '승'; });
    } });
    assert.equal(waits, 1); assert.equal(result.rows.length, 5);
  } finally { await browser.close(); }
});

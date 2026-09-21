import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readVisibleTable } from '../src/adapter.mjs';
import { sanitizeCandidate } from '../src/normalization.mjs';

function node(text = '', children = []) {
  const element = { children, parentElement: null,
    get textContent() { return text + this.children.map(child => child.textContent).join(''); },
    querySelectorAll() { return this.children.flatMap(child => [child, ...child.querySelectorAll('*')]); },
  };
  children.forEach(child => { child.parentElement = element; });
  return element;
}
const batterHeaders = ['타율', '팀게임', '선수게임', '타석', '타수', '총안타', '1루타', '2루타', '3루타', '홈런', '타점', '득점', '도루', '볼넷', '삼진', '출루율', '장타율', 'OPS'];
const pitcherHeaders = ['ERA', '팀게임', '선수게임', '이닝', '승', '패', '세이브', '홀드', '삼진', '피안타', '피홈런', '실점', '볼넷', '사구', '승률', 'WHIP'];
const batter = ['0.625', '7', '5', '18', '16', '10', '5', '4', '0', '1', '9', '6', '4', '1', '0', '0.667', '1.063', '1.730'];
const pitcher = ['5.25', '6', '4', '13.1', '2', '0', '0', '0', '23', '12', '0', '12', '13', '2', '1.00', '1.88'];
function fixture(headers, values, { wrapped = true, fixedCount = 1, duplicate = false } = {}) {
  const row = node('', values.map(value => node(value)));
  const valueRow = wrapped ? node('', [node('', [row, duplicate ? node('', values.map(value => node(value))) : node()])]) : row;
  const fixed = node('', Array.from({ length: fixedCount }, (_, i) => node('', [node(String(i + 1)), node('합성선수'), node('합성팀')])));
  const root = node('', [fixed, node('', [node('', [node('', [node('', headers.map(header => node(header))), valueRow])])])]);
  return { querySelectorAll: () => [root, ...root.querySelectorAll('*')] };
}
async function read(headers, values, options) {
  const document = fixture(headers, values, options);
  return readVisibleTable({ evaluate: async (fn, args) => JSON.parse(JSON.stringify(vm.runInNewContext(`(${fn.toString()})(args)`, { document, args }))) }, headers[0], headers);
}
for (const [kind, headers, values] of [['batter', batterHeaders, batter], ['pitcher', pitcherHeaders, pitcher]]) {
  for (const wrapped of [false, true]) test(`${kind}: ${wrapped ? 'nested provider' : 'legacy direct'} cells preserve every value`, async () => {
    const result = await read(headers, values, { wrapped });
    assert.equal(result.reason, null);
    assert.deepEqual(result.rows[0].values, values);
    const stats = Object.fromEntries(headers.map((header, i) => [header, result.rows[0].values[i]]));
    const candidate = sanitizeCandidate({ groups: { A: { [kind === 'batter' ? 'batters' : 'pitchers']: { IN: [{ playerName: '합성선수', teamName: '합성팀', stats }] } } } }, { leagueId: 57, seasonYear: 2026, adapterVersion: 'test' });
    const actual = candidate.groups.A[kind === 'batter' ? 'batters' : 'pitchers'].IN[0].stats;
    assert.deepEqual(Object.values(actual), values.map(Number));
  });
  for (const [name, mutate] of [
    ['missing cell', values => values.slice(0, -1)],
    ['extra cell', values => [...values, '9']],
    ['blank record', values => values.map(() => '')],
    ['non-numeric cell', values => values.map((v, i) => i ? v : 'unexpected')],
  ]) test(`${kind}: rejects ${name}`, async () => {
    const result = await read(headers, mutate(values));
    assert.equal(result.reason, 'table-structure'); assert.deepEqual(result.rows, []);
  });
  test(`${kind}: never silently truncates unmatched rows`, async () => {
    const result = await read(headers, values, { fixedCount: 2 });
    assert.equal(result.reason, 'standings-row-count-mismatch');
    assert.equal(result.fixedRowCount, 2); assert.equal(result.valueRowCount, 1);
  });
  test(`${kind}: rejects ambiguous duplicate numeric rows`, async () => {
    assert.equal((await read(headers, values, { duplicate: true })).reason, 'table-structure');
  });
  test(`${kind}: zero statistics remain valid values`, async () => {
    assert.equal((await read(headers, values.map(() => '0'))).reason, null);
  });
}

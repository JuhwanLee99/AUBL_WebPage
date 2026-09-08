import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { batterRateView } from '../src/shared/lib/batterRates.ts';
import { formatCompositeFeed } from '../src/shared/lib/compositePlayDisplay.ts';
import { resolveCompositePlay, normalizeCompositePlay } from '../src/shared/lib/compositePlayEngine.ts';
import { scenarios, guardScenarios } from './e2e/scoring/scenarios.mjs';

for (const ab of [0, 1, 4, 8]) for (const h of [...new Set([0, ab])]) for (const bb of [0, 1]) for (const hbp of [0, 1]) for (const sh of [0, 1]) for (const sf of [0, 1]) {
  test(`RATE ab=${ab} h=${h} bb=${bb} hbp=${hbp} sh=${sh} sf=${sf}`, () => {
    const row = { ab, h, bb, hbp, sh, sf, sac: sh + sf, ci: 9 };
    const result = batterRateView(row), denominator = ab + bb + hbp + sf;
    assert.equal(result.obp, denominator ? (h + bb + hbp) / denominator : null);
    assert.equal(result.sh, sh); assert.equal(result.sf, sf);
  });
}
for (const row of [{ sac: 1 }, { sac: 2, sf: 1 }, { sac: 2, sh: 1 }, { sac: 0, sf: 1 }]) test(`RATE incomplete sacrifice ${JSON.stringify(row)}`, () => {
  const result = batterRateView({ ab: 4, h: 2, bb: 1, hbp: 0, ...row });
  assert.equal(result.obp, null); assert.equal(result.status, '희생 구분 미확정');
});
for (const field of ['ab', 'h', 'bb', 'hbp', 'sac', 'sh', 'sf']) for (const invalid of [-1, 0.5, NaN, Infinity]) test(`RATE invalid ${field}=${invalid}`, () => {
  assert.equal(batterRateView({ ab: 4, h: 2, bb: 1, hbp: 0, sac: 0, [field]: invalid }).status, '기록 오류');
});
test('RATE hits cannot exceed at bats', () => assert.equal(batterRateView({ ab: 1, h: 2, bb: 0, hbp: 0, sac: 0 }).status, '기록 오류'));

const context = extra => ({ inning: 1, half: 'top', outs: 0, bases: [null, null, null], score: { home: 0, away: 0 }, activeMatchId: 'LOCAL_TEST_HARDENING',
  pitchCount: 0, balls: 0, strikes: 0, batterIndex: { home: 0, away: 0 }, runnerResponsiblePitcher: { 0: 'P0', 1: 'P0', 2: 'P0' }, batterId: 'B', pitcherId: 'P', revision: 'fixture', rosterKey: 'fixture', ...extra });
const toInput = scenario => ({ id: scenario.id, expected: context(scenario.context), plate: scenario.plate, pitch: scenario.pitch, misc: scenario.misc ?? 'none', reviewed: true, groundedIntoDoublePlay: false, note: 'LOCAL_TEST_ONLY',
  errors: (scenario.errors ?? []).map((error, index) => ({ id: `error-${index}`, ...error })),
  steps: scenario.moves.map((move, index) => ({ id: `step-${index}`, runnerId: move.runner, from: move.from, to: move.to, cause: move.cause,
    errorId: move.error === undefined ? undefined : `error-${move.error}`, outKind: move.outKind, putout: move.putout, assists: move.assists?.split(',') ?? [], rbi: !!move.rbi, advantageousAppeal: !!move.advantageousAppeal })),
  ruling: { kind: 'none', status: 'confirmed', rule: '', choice: 'play', ...scenario.ruling, note: '독립 기대값 기록원 확정 근거' },
  responsibility: scenario.responsibility ? [{ runnerId: 'B', pitcherId: scenario.responsibility.pitcher, reason: scenario.responsibility.reason }] : [],
});
for (const scenario of scenarios) test(`PLAY ${scenario.id} ${scenario.title}`, () => {
  const input = toInput(scenario), result = resolveCompositePlay(input.expected, input);
  assert.equal(result.ok, true, JSON.stringify(result));
  const record = result.record;
  assert.equal(record.runs, scenario.expected.runs); assert.equal(record.outsAdded, scenario.expected.outs);
  assert.deepEqual(record.after.bases, scenario.expected.bases);
  for (const [id, fields] of Object.entries(scenario.expected.batters)) for (const [key, value] of Object.entries(fields)) assert.equal(record.batters[id]?.[key] ?? 0, value, `${id}.${key}`);
  for (const [id, fields] of Object.entries(scenario.expected.pitchers)) for (const [key, value] of Object.entries(fields)) assert.equal(record.pitchers[id]?.[key] ?? 0, value, `${id}.${key}`);
  const serialized = JSON.stringify(record);
  assert.deepEqual(normalizeCompositePlay(JSON.parse(serialized)), JSON.parse(serialized));
  const display = formatCompositeFeed(record).join(' | ');
  for (const error of record.input.errors) assert.ok(!display.includes(`[${error.id}]`));
  assert.equal(JSON.stringify(record), serialized, 'Presentation must not mutate canonical audit data');
});
for (const guard of guardScenarios) test(`GUARD ${guard.id} ${guard.title}`, () => {
  const scenario = structuredClone(scenarios.find(item => item.id === guard.base));
  guard.mutate?.(scenario);
  const input = toInput(scenario);
  if (guard.clearEvidence) input.ruling.note = '';
  assert.equal(resolveCompositePlay(input.expected, input).ok, false);
});
for (let seed = 1; seed <= 32; seed++) test(`SEQUENCE deterministic seed ${seed}: 40 legal plays and inning transitions`, () => {
  let random = seed, state = context(), runs = 0, outs = 0;
  for (let index = 0; index < 40; index++) {
    random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
    const homer = (random >>> 16) % 4 === 0;
    const scenario = structuredClone(scenarios.find(s => s.id === (homer ? 'R15' : 'R22')));
    const input = toInput(scenario);
    input.expected = { ...state, strikes: homer ? 0 : 2, batterId: 'B', revision: `${seed}-${index}` };
    const result = resolveCompositePlay(input.expected, input);
    assert.equal(result.ok, true, JSON.stringify(result));
    runs += homer ? 1 : 0; outs += homer ? 0 : 1;
    state = { ...input.expected, ...result.record.after };
    assert.equal(state.score.home + state.score.away, runs);
    assert.equal(state.outs, outs % 3);
    assert.equal(state.inning, 1 + Math.floor(outs / 6));
    assert.deepEqual(state.bases, [null, null, null]);
    const persisted = JSON.parse(JSON.stringify(result.record));
    assert.deepEqual(normalizeCompositePlay(persisted), persisted);
  }
});

// Run the actual narrow post-game normalizer without importing Firebase or the Provider.
const normalizeSource = fs.readFileSync(new URL('../src/shared/state/demoStore.normalize.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('normalize.ts', normalizeSource, ts.ScriptTarget.Latest, true);
const pieces = ast.statements.filter(node => (ts.isFunctionDeclaration(node) && node.name?.text === 'normalizeBatterLine')
  || (ts.isVariableStatement(node) && node.declarationList.declarations.some(d => d.name.getText(ast) === 'asNumber'))).map(node => node.getText(ast));
const sandbox = {}; vm.createContext(sandbox);
vm.runInContext(ts.transpileModule(pieces.join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText, sandbox);
for (const field of ['ci', 'sh', 'sf', 'sb', 'cs', 'gdp']) for (const value of [0, 1, 3]) test(`POSTGAME normalize ${field}=${value} after JSON reload`, () => {
  const row = sandbox.normalizeBatterLine(JSON.parse(JSON.stringify({ name: 'LOCAL TEST', [field]: value })));
  assert.equal(row[field], value);
});
test('POSTGAME legacy missing sacrifice split remains missing', () => {
  const row = sandbox.normalizeBatterLine({ name: 'LOCAL TEST', sac: 2 });
  assert.equal(row.sh, undefined); assert.equal(row.sf, undefined);
});

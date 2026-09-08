import test from 'node:test';
import assert from 'node:assert/strict';
import { readinessScenarios, readinessInput } from './e2e/scoring/readiness-scenarios.mjs';
import { resolveCompositePlay, normalizeCompositePlay } from '../src/shared/lib/compositePlayEngine.ts';
import * as legacy from '../src/shared/lib/compositePlayEngine.v1.ts';
for (const scenario of readinessScenarios) test('KBO-' + scenario.id + ': ' + scenario.title, () => {
  const input = readinessInput(scenario), before = structuredClone(input), r = resolveCompositePlay(input.expected, input);
  assert.deepEqual(input, before, 'Never mutate submitted timeline');
  if (scenario.expected.reject) { assert.equal(r.ok, false); return; }
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.record.version, 2);
  assert.equal(r.record.runs, scenario.expected.runs); assert.equal(r.record.outsAdded, scenario.expected.outs);
  for (const map of ['batters', 'pitchers', 'fielding']) for (const [id, fields] of Object.entries(scenario.expected[map] ?? {}))
    for (const [key, value] of Object.entries(fields)) assert.equal(r.record[map][id]?.[key] ?? 0, value, map + '.' + id + '.' + key);
  assert.deepEqual(r.record.input.steps, input.steps, 'Original input chronology');
  assert.deepEqual(r.record.steps.map(s => s.id), input.steps.map(s => s.id), 'Resolved chronology');
  const persisted = JSON.parse(JSON.stringify(r.record));
  assert.deepEqual(normalizeCompositePlay(persisted), persisted, 'Deterministic persisted replay');
  assert.equal(normalizeCompositePlay({ ...persisted, runs: 99 }), undefined);
});
for (let mask = 0; mask < 8; mask++) for (let outs = 0; outs < 3; outs++) for (const plate of ['hbp', 'ibb'])
  test('KBO-award-matrix-' + plate + '-' + mask + '-' + outs, () => {
    const i = readinessInput(readinessScenarios.find(s => s.id === 'Q13'));
    i.expected.bases = ['A', 'D', 'C'].map((name, b) => mask & (1 << b) ? name : null); i.expected.outs = outs;
    i.plate = plate; i.pitch = plate === 'hbp' ? 'hbp' : 'none';
    const step = (runnerId, from, to) => ({ id: runnerId, runnerId, from, to, cause: 'award', rbi: to === 'home', assists: [], advantageousAppeal: false });
    const steps = [];
    for (let n = 0; n < 3 && i.expected.bases[n]; n++) steps.push(step(i.expected.bases[n], n, n === 2 ? 'home' : n + 1));
    i.steps = [...steps.reverse(), step('B', 'batter', 0)];
    const r = resolveCompositePlay(i.expected, i);
    assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.record.runs, mask === 7 ? 1 : 0); assert.equal(r.record.outsAdded, 0);
  });
for (const id of ['Q01', 'Q06', 'Q11', 'Q13', 'Q15', 'Q16']) test('KBO-legacy-preserve-' + id, () => {
  const i = readinessInput(readinessScenarios.find(s => s.id === id)), r = legacy.resolveCompositePlay(i.expected, i);
  assert.equal(r.ok, true); const persisted = JSON.parse(JSON.stringify(r.record));
  assert.deepEqual(normalizeCompositePlay(persisted), persisted);
});
for (const id of ['Q02', 'Q03', 'Q04', 'Q05', 'Q08', 'Q09', 'Q10', 'Q12']) test('KBO-legacy-quarantine-' + id, () => {
  const i = readinessInput(readinessScenarios.find(s => s.id === id)), r = legacy.resolveCompositePlay(i.expected, i);
  assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(normalizeCompositePlay(JSON.parse(JSON.stringify(r.record))), undefined);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Run the actual gateway declaration without importing the production Provider.
const source = fs.readFileSync(new URL('../src/shared/state/demoStore.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('demoStore.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declaration = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'applyScoringEvent');
assert.ok(declaration, 'Actual scoring gateway must exist');
const code = ts.transpileModule(declaration.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
function gateway(enabled = true, valid = true) {
  const calls = { validation: 0, metadata: 0, rejection: 0 };
  const sandbox = {
    isScoringEngineEnabled: () => enabled,
    validateStateInvariant: () => { calls.validation++; return valid ? { ok: true } : { ok: false, reason: 'fixture invariant' }; },
    attachScoringEventMeta: next => { calls.metadata++; return { ...next, metadataAttached: true }; },
    withRejectedTransition: state => { calls.rejection++; return { ...state, rejected: true }; },
  };
  vm.createContext(sandbox); vm.runInContext(code, sandbox);
  return { run: sandbox.applyScoringEvent, calls };
}
for (const enabled of [true, false]) for (const history of ['empty', 'past', 'future']) test(`GATEWAY no-op keeps identity: feature=${enabled}, history=${history}`, () => {
  const state = { events: [{ eventId: 'same-event' }], feed: [{ eventId: 'same-event' }], history: history === 'past' ? [{}] : [], futureHistory: history === 'future' ? [{}] : [] };
  const { run, calls } = gateway(enabled);
  const result = run(state, () => state, { eventTypeHint: 'composite' });
  assert.equal(result, state); assert.equal(result.history, state.history); assert.equal(result.futureHistory, state.futureHistory);
  assert.deepEqual(calls, { validation: 0, metadata: 0, rejection: 0 });
});
test('GATEWAY genuine changes still validate and attach metadata', () => {
  const original = { outs: 0 }, next = { outs: 1 }, { run, calls } = gateway();
  const result = run(original, () => next, {});
  assert.equal(result.outs, 1); assert.equal(result.metadataAttached, true); assert.equal(original.outs, 0);
  assert.deepEqual(calls, { validation: 1, metadata: 1, rejection: 0 });
});
test('GATEWAY invalid changes are still rejected', () => {
  const { run, calls } = gateway(true, false), original = { outs: 0 };
  const result = run(original, () => ({ outs: 4 }), {});
  assert.equal(result.outs, 0); assert.equal(result.rejected, true);
  assert.deepEqual(calls, { validation: 1, metadata: 0, rejection: 1 });
});

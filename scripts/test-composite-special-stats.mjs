import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applySpecialScoringStats, caughtSafe, missedOutStepIds,
  specialScoringInputIssue, specialScoringRecordIssue,
} from '../src/shared/lib/compositePlaySpecialStats.ts';

const context = { batterId: 'B', bases: ['A', null, null] };
const input = (overrides = {}) => ({
  expected: context,
  plate: 'single', pitch: 'in_play', misc: 'none', steps: [], errors: [],
  ruling: { type: 'none', note: 'The runner would have been out on an accurate throw.' },
  groundedIntoDoublePlay: false, ...overrides,
});
const multi = (overrides = {}) => ({
  kind: 'dp', clean: true, stepIds: ['O1', 'O2'], note: 'One uninterrupted clean play.', ...overrides,
});
const error = (overrides = {}) => ({
  id: 'E1', fielder: '6', kind: 'catching', note: 'Accurate throw dropped at the base.', ...overrides,
});
const safe = (overrides = {}) => ({
  id: 'S1', runnerId: 'A', from: 0, to: 1, cause: 'caught',
  assists: ['2'], errorId: 'E1', rbi: false, ...overrides,
});
const out = (overrides = {}) => ({
  id: 'O1', runnerId: 'A', from: 1, to: 'out', cause: 'caught',
  outKind: 'tag', putout: '6', assists: ['2'], countedOut: true, ...overrides,
});
function record(source, steps = source.steps) {
  return {
    input: source, steps: structuredClone(steps), outsAdded: steps.filter(s => s.countedOut).length,
    batters: { A: { cs: 0, sb: 0 }, B: { gdp: 0 }, C: { cs: 0, sb: 0 } },
    fielding: {}, feed: [],
  };
}
const issue = source => specialScoringInputIssue(context, source);

test('ordinary input has no special-stat requirement', () => assert.ok(!issue(input())));
for (const [name, value] of [
  ['null', null], ['array', []], ['missing fields', {}],
  ['unknown kind', multi({ kind: 'quadruple' })],
  ['unconfirmed clean play', multi({ clean: false })],
  ['empty explanation', multi({ note: ' ' })],
  ['overlong explanation', multi({ note: 'x'.repeat(301) })],
  ['duplicate out IDs', multi({ stepIds: ['O1', 'O1'] })],
  ['too few out IDs', multi({ stepIds: ['O1'] })],
  ['nonstring out ID', multi({ stepIds: ['O1', 2] })],
  ['TP with only two out IDs', multi({ kind: 'tp' })],
]) test(`reject DP/TP metadata: ${name}`, () => assert.ok(issue(input({ multiOut: value }))));

for (const misc of ['wp', 'pb', 'balk']) {
  test(`do not credit a clean DP across ${misc}`, () => assert.ok(issue(input({ multiOut: multi(), misc }))));
}
test('do not credit a clean DP with an error', () => assert.ok(issue(input({ multiOut: multi(), errors: [error()] }))));
test('safe-on-error is not a counted out', () => {
  assert.equal(caughtSafe(safe()), true);
  assert.equal(caughtSafe(out()), false);
  assert.equal(caughtSafe(safe({ cause: 'error' })), false);
});
test('recognize the precise safe-on-error step', () => {
  assert.deepEqual([...missedOutStepIds(input({ steps: [safe(), out()] }))], ['S1']);
});
test('recognize an incomplete-GDP missed-out step separately', () => {
  const source = input({ steps: [safe(), safe({ id: 'S2', cause: 'error' })], incompleteDoublePlay: { errorStepId: 'S2', note: 'Dropped second-out throw.' } });
  assert.deepEqual([...missedOutStepIds(source)].sort(), ['S1', 'S2']);
});
for (const [name, change] of [
  ['no receiving error', { errors: [] }],
  ['throwing rather than receiving error', { errors: [error({ kind: 'throwing' })] }],
  ['no assist', { steps: [safe({ assists: [] })] }],
  ['thrower equals receiving-error fielder', { steps: [safe({ assists: ['6'] })] }],
  ['putout on a safe step', { steps: [safe({ putout: '6' })] }],
  ['out kind on a safe step', { steps: [safe({ outKind: 'tag' })] }],
  ['RBI on caught stealing', { steps: [safe({ rbi: true })] }],
  ['skip the attempted base', { steps: [safe({ to: 2 })] }],
  ['batter cannot be the caught-stealing runner', { steps: [safe({ from: 'batter' })] }],
  ['no judgment explanation', { ruling: { type: 'none', note: '' } }],
]) test(`reject safe-on-error: ${name}`, () => assert.ok(issue(input({ steps: [safe()], errors: [error()], ...change }))));

test('one receiving error cannot prove two missed outs', () => {
  assert.ok(issue(input({ steps: [safe(), safe({ id: 'S2', runnerId: 'C', from: 2, to: 'home' })], errors: [error()] })));
});
test('safe CS credits no putout and deduplicates rundown assists', () => {
  const source = input({ steps: [safe({ assists: ['2', '4', '2'] })], errors: [error()] });
  const untouched = structuredClone(source);
  const result = record(source);
  applySpecialScoringStats(result);
  assert.equal(result.batters.A.cs, 1);
  assert.equal(result.batters.A.sb, 0);
  assert.equal(result.outsAdded, 0);
  assert.equal(result.fielding['2'].assists, 1);
  assert.equal(result.fielding['4'].assists, 1);
  assert.equal(result.fielding['2'].putouts, 0);
  assert.deepEqual(source, untouched);
});
for (const [name, safeGroup, outGroup, expectedCs, expectedAssists] of [
  ['implicit same attempt', undefined, undefined, 1, 1],
  ['explicit same attempt', '1', '1', 1, 1],
  ['default and explicit first attempt', undefined, '1', 1, 1],
  ['separate attempts', '1', '2', 2, 2],
]) test(`safe then out: ${name}`, () => {
  const s = safe({ stealGroup: safeGroup });
  const o = out({ stealGroup: outGroup });
  const result = record(input({ steps: [s, o] }));
  result.batters.A.cs = 1;
  result.fielding['2'] = { errors: 0, putouts: 0, assists: 1 };
  applySpecialScoringStats(result);
  assert.equal(result.batters.A.cs, expectedCs);
  assert.equal(result.fielding['2'].assists, expectedAssists);
  assert.equal(result.outsAdded, 1);
});
test('retain a distinct assist before the final out of the same attempt', () => {
  const result = record(input({ steps: [safe({ assists: ['2', '4'] }), out()] }));
  result.batters.A.cs = 1;
  result.fielding['2'] = { errors: 0, putouts: 0, assists: 1 };
  applySpecialScoringStats(result);
  assert.equal(result.batters.A.cs, 1);
  assert.equal(result.fielding['2'].assists, 1);
  assert.equal(result.fielding['4'].assists, 1);
});
test('do not merge different runners sharing an attempt group', () => {
  const result = record(input({ steps: [safe(), safe({ id: 'S2', runnerId: 'C', from: 2, to: 'home' })] }));
  applySpecialScoringStats(result);
  assert.equal(result.batters.A.cs, 1);
  assert.equal(result.batters.C.cs, 1);
  assert.equal(result.fielding['2'].assists, 2);
});
test('multiple safe steps in one attempt credit CS and each assist once', () => {
  const result = record(input({ steps: [safe(), safe({ id: 'S2', from: 1, to: 2, errorId: 'E2', assists: ['2', '4'] })] }));
  applySpecialScoringStats(result);
  assert.equal(result.batters.A.cs, 1);
  assert.equal(result.fielding['2'].assists, 1);
  assert.equal(result.fielding['4'].assists, 1);
});
test('a fielder with both PO and A receives DP only once', () => {
  const steps = [out({ putout: '3', assists: [], outKind: 'batter_before_first', runnerId: 'B' }), out({ id: 'O2', putout: '6', assists: ['3'] })];
  const result = record(input({ steps, multiOut: multi() }));
  applySpecialScoringStats(result);
  assert.equal(result.fielding['3'].dp, 1);
  assert.equal(result.fielding['6'].dp, 1);
  assert.equal(result.batters.B.gdp, 0);
  assert.match(result.feed.join(' '), /DP/);
});
test('TP participants are unique across all three outs', () => {
  const steps = [out({ putout: '6', assists: [] }), out({ id: 'O2', putout: '4', assists: ['6'] }), out({ id: 'O3', putout: '3', assists: ['4'] })];
  const result = record(input({ steps, multiOut: multi({ kind: 'tp', stepIds: ['O1', 'O2', 'O3'] }) }));
  applySpecialScoringStats(result);
  for (const position of ['3', '4', '6']) assert.equal(result.fielding[position].tp, 1);
  assert.equal(result.fielding['3'].dp, undefined);
});
test('old records without explicit DP metadata do not gain DP', () => {
  const result = record(input({ steps: [out({ cause: 'out' }), out({ id: 'O2', cause: 'out' })] }));
  result.fielding['6'] = { errors: 0, putouts: 2, assists: 0 };
  const snapshot = structuredClone(result);
  applySpecialScoringStats(result);
  assert.deepEqual(result, snapshot);
});
test('DP selection must match actual counted outs', () => {
  const steps = [out(), out({ id: 'O2' })];
  assert.ok(specialScoringRecordIssue(record(input({ steps, multiOut: multi({ stepIds: ['O1', 'UNKNOWN'] }) }))));
});
test('DP cannot be assigned using an apparent but uncounted out', () => {
  const steps = [out(), out({ id: 'O2', countedOut: false })];
  assert.ok(specialScoringRecordIssue(record(input({ steps, multiOut: multi() }))));
});

for (const stats of [undefined, {}, { r: 1 }]) {
  test(`initialize a missing CS counter: ${JSON.stringify(stats)}`, () => {
    const result = record(input({ steps: [safe()] }));
    if (stats === undefined) delete result.batters.A;
    else result.batters.A = { ...stats };
    applySpecialScoringStats(result);
    assert.equal(result.batters.A.cs, 1);
    if (stats?.r) assert.equal(result.batters.A.r, stats.r);
  });
}
test('incomplete GDP uses the batter from the captured input context', () => {
  const step = safe({ runnerId: 'B', from: 'batter', to: 0, cause: 'error', assists: ['4'] });
  const result = record(input({ steps: [step], incompleteDoublePlay: { errorStepId: step.id, note: 'Dropped second-out throw.' } }));
  delete result.batters.B;
  applySpecialScoringStats(result);
  assert.equal(result.batters.B.gdp, 1);
  assert.equal(result.fielding['4'].assists, 1);
  assert.equal(result.fielding['4'].dp, undefined);
});

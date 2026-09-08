import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as engine from '../src/shared/lib/compositePlayEngine.ts';
import { formatCompositeFeed } from '../src/shared/lib/compositePlayDisplay.ts';
import * as facts from '../src/shared/lib/scoringEventFacts.ts';
import { createStructuredRunnerIndex } from '../src/shared/lib/structuredRunnerStats.ts';

// Local synthetic fixtures only. Never load the React store, Firebase or credentials.
let nextId = 0;
const context = (extra = {}) => ({ inning: 1, half: 'top', outs: 0, bases: [null, null, null],
  score: { home: 0, away: 0 }, activeMatchId: 'LOCAL_TEST_COMPOSITE_DO_NOT_PUBLISH', pitchCount: 0,
  balls: 0, strikes: 0, batterIndex: { home: 0, away: 0 }, runnerResponsiblePitcher: { 0: 'P0', 1: 'P0', 2: 'P0' },
  batterId: 'B', pitcherId: 'P', revision: 'fixture', rosterKey: 'isolated', ...extra });
const input = (expected, extra = {}) => ({ id: `fixture-${++nextId}`, expected, plate: 'none', pitch: 'none', misc: 'none',
  steps: [], errors: [], responsibility: [], ruling: { kind: 'none', status: 'confirmed', rule: '', note: '독립 기대값과 기록원 판단 근거', choice: 'play' },
  groundedIntoDoublePlay: false, reviewed: true, note: 'LOCAL_TEST_ONLY', ...extra });
const step = (runnerId, from, to, cause = 'advance', extra = {}) => ({ id: `step-${++nextId}`, runnerId, from, to, cause,
  rbi: false, assists: [], advantageousAppeal: false, ...extra });
const error = (id = 'E1', fielder = '6') => ({ id, fielder, kind: 'throwing', note: '별개의 송구 행위' });
const resolve = i => { const result = engine.resolveCompositePlay(i.expected, i); assert.equal(result.ok, true, JSON.stringify(result)); return result.record; };
const reject = i => assert.equal(engine.resolveCompositePlay(i.expected, i).ok, false);
const hitError = () => input(context(), { plate: 'single', pitch: 'in_play', errors: [error()], steps: [
  step('B', 'batter', 0, 'hit'), step('B', 0, 1, 'error', { errorId: 'E1' }),
  step('B', 1, 'out', 'out', { outKind: 'tag', putout: '5', assists: ['6', '5', '6'] }),
] });

const droppedOut = (outKind = 'tag', extraContext = {}, extraInput = {}) => input(context({ strikes: 2, ...extraContext }), {
  plate: 'so_out', pitch: 'strike', steps: [step('B', 'batter', 'out', 'out', {
    outKind, putout: outKind === 'tag' ? '2' : '3', assists: outKind === 'tag' ? [] : ['2'],
  })], ...extraInput,
});
for (const outKind of ['tag', 'batter_before_first']) for (let outs = 0; outs < 3; outs++) for (let mask = 0; mask < 8; mask++) {
  test(`F21: dropped-third failure ${outKind}, outs ${outs}, occupancy ${mask}`, () => {
    const bases = [0, 1, 2].map(i => mask & (1 << i) ? `R${i}` : null);
    const i = droppedOut(outKind, { outs, bases });
    if (outs < 2 && (mask & 1)) { reject(i); return; }
    const r = resolve(i);
    assert.equal(r.batters.B.pa, 1); assert.equal(r.batters.B.ab, 1); assert.equal(r.batters.B.so, 1);
    assert.equal(r.batters.B.h ?? 0, 0); assert.equal(r.batters.B.rbi ?? 0, 0);
    assert.equal(r.pitchers.P.bf, 1); assert.equal(r.pitchers.P.so, 1); assert.equal(r.pitchers.P.outs, 1); assert.equal(r.pitchers.P.pitches, 1);
    assert.equal(r.feed[0], '낫아웃 실패'); assert.equal(r.endedHalf, outs === 2);
    assert.deepEqual(r.after.bases, outs === 2 ? [null, null, null] : bases);
    assert.equal(r.fielding[outKind === 'tag' ? '2' : '3'].putouts, 1);
    if (outKind !== 'tag') assert.equal(r.fielding['2'].assists, 1);
    assert.deepEqual(engine.normalizeCompositePlay(JSON.parse(JSON.stringify(r))), r);
  });
}
for (const outKind of ['tag', 'batter_before_first']) test(`F22: third out before first cancels an earlier run, including ${outKind}`, () => {
  const i = droppedOut(outKind, { outs: 2, bases: [null, null, 'C'] });
  i.steps.unshift(step('C', 2, 'home'));
  const r = resolve(i); assert.equal(r.runs, 0); assert.equal(r.steps[0].runDecision, 'third_force_or_batter');
});
for (const misc of ['wp', 'pb']) test(`F23: retiring dropped-third batter does not credit ${misc} for other runner advancement`, () => {
  const i = droppedOut('tag', { bases: [null, null, 'C'] }, { misc });
  i.steps.unshift(step('C', 2, 'home', misc)); reject(i);
  const accepted = { ...i, misc: 'none', steps: i.steps.map(s => s.runnerId === 'C' ? { ...s, cause: 'advance' } : s) };
  const r = resolve(accepted); assert.equal(r.runs, 1); assert.equal(r.pitchers.P.wp ?? 0, 0); assert.equal(r.batters.B.rbi ?? 0, 0);
});
test('F24: failure and genuine reach followed by another out cannot be confused', () => {
  reject({ ...droppedOut(), plate: 'so_reach' });
  const i = droppedOut('tag', { outs: 2, bases: [null, null, 'C'] }, { steps: [
    step('B', 'batter', 0, 'advance'), step('C', 2, 'home'), step('B', 0, 'out', 'out', { outKind: 'tag' }),
  ] });
  reject(i);
  const r = resolve({ ...i, plate: 'so_reach' }); assert.equal(r.runs, 1); assert.equal(r.batters.B.so, 1); assert.equal(r.pitchers.P.outs, 1);
});
test('F25: failure rejects automatic strikes, bunt fouls, false out kinds and RBI', () => {
  for (const pitch of ['automatic_strike', 'foul_bunt', 'none']) reject({ ...droppedOut(), pitch });
  for (const kind of ['force', 'caught_ball', 'strikeout']) reject(droppedOut(kind));
  const i = droppedOut('tag', { bases: [null, null, 'C'] });
  i.steps.unshift(step('C', 2, 'home', 'advance', { rbi: true })); reject(i);
});
test('F26: occupied first with fewer than two outs remains automatic K and permits genuine WP', () => {
  const r = resolve(input(context({ strikes: 2, bases: ['A', null, null] }), { plate: 'so', pitch: 'strike', misc: 'wp', steps: [
    step('B', 'batter', 'out', 'out', { outKind: 'strikeout', putout: '2' }), step('A', 0, 1, 'wp'),
  ] })); assert.equal(r.outsAdded, 1); assert.equal(r.pitchers.P.so, 1); assert.equal(r.pitchers.P.wp, 1);
});

test('F01: single, extra base on E6, batter tagged out remains one hit and one out', () => {
  const r = resolve(hitError()); assert.equal(r.batters.B.h, 1); assert.equal(r.batters.B.ab, 1);
  assert.equal(r.outsAdded, 1); assert.deepEqual(r.after.bases, [null, null, null]);
  assert.deepEqual(r.fielding['6'], { errors: 1, putouts: 0, assists: 1 });
  assert.equal(r.fielding['5'].putouts, 1); assert.equal(r.pitchers.P.pitches, 1);
});
test('F02: two separate errors following one single do not become extra hits', () => {
  const r = resolve(input(context(), { plate: 'single', pitch: 'in_play', errors: [error(), error('E2', '3')], steps: [
    step('B', 'batter', 0, 'hit'), step('B', 0, 1, 'error', { errorId: 'E1' }), step('B', 1, 'home', 'error', { errorId: 'E2' }),
  ] }));
  assert.equal(r.runs, 1); assert.equal(r.batters.B.h, 1); assert.equal(r.input.errors.length, 2); assert.equal(r.batters.B.rbi ?? 0, 0);
});
test('F03: FC plus E keeps explicit predecessor pitcher responsibility', () => {
  const r = resolve(input(context({ bases: ['A', null, null] }), { plate: 'fc', pitch: 'in_play', errors: [error()],
    responsibility: [{ runnerId: 'B', pitcherId: 'P0', reason: '9.16 선행주자 대체 책임 판단' }], steps: [
      step('A', 0, 'out', 'fc', { outKind: 'force' }), step('B', 'batter', 0, 'fc'), step('B', 0, 1, 'error', { errorId: 'E1' }),
    ] }));
  assert.equal(r.batters.B.fc, 1); assert.equal(r.batters.B.h ?? 0, 0); assert.equal(r.after.runnerResponsiblePitcher[1], 'P0');
});
test('F04: stolen base followed by throwing error retains SB and one E', () => {
  const r = resolve(input(context({ bases: ['A', null, null] }), { errors: [error('E1', '2')], steps: [
    step('A', 0, 1, 'steal'), step('A', 1, 'home', 'error', { errorId: 'E1' }),
  ] }));
  assert.equal(r.batters.A.sb, 1); assert.equal(r.batters.A.r, 1); assert.equal(r.pitchers.P0.r, 1); assert.equal(r.plateCompleted, false);
});
for (const misc of ['wp', 'pb']) test(`F05-${misc}: dropped third strike plus ${misc} plus a separate error`, () => {
  const r = resolve(input(context({ strikes: 2 }), { plate: 'so_reach', pitch: 'strike', misc, errors: [error('E1', '2')], steps: [
    step('B', 'batter', 0, misc), step('B', 0, 1, 'error', { errorId: 'E1' }),
  ] }));
  assert.equal(r.batters.B.so, 1); assert.equal(r.outsAdded, 0); assert.equal(r.pitchers.P.so, 1);
  assert.equal(r.pitchers.P.wp ?? 0, misc === 'wp' ? 1 : 0); assert.equal(r.input.errors.length, 1);
});
for (const kind of ['tag', 'force']) test('F06-' + kind + ': genuine force and time play have distinct run treatment', () => {
  const i = input(context({ outs: 2, bases: ['A', null, 'C'] }), { plate: 'fc', pitch: 'in_play',
    responsibility: [{ runnerId: 'B', pitcherId: 'P0', reason: '선행주자 대체' }],
    steps: [step('B', 'batter', 0, 'fc'), ...(kind === 'tag' ? [step('A', 0, 1)] : []), step('C', 2, 'home'), step('A', kind === 'tag' ? 1 : 0, 'out', 'out', { outKind: kind })] });
  const r = resolve(i); assert.equal(r.runs, kind === 'force' ? 0 : 1);
});
test('F07: batter before first as third out cancels an earlier home crossing', () => {
  const r = resolve(input(context({ outs: 2, bases: [null, null, 'C'] }), { plate: 'out', pitch: 'in_play', steps: [
    step('C', 2, 'home'), step('B', 'batter', 'out', 'out', { outKind: 'batter_before_first' }),
  ] })); assert.equal(r.runs, 0);
});
test('F08: home crossing after third tag out is retained but not scored', () => {
  const r = resolve(input(context({ outs: 2, bases: ['A', null, 'C'] }), { steps: [
    step('A', 0, 'out', 'out', { outKind: 'tag' }), step('C', 2, 'home'),
  ] })); assert.equal(r.runs, 0); assert.equal(r.steps[1].runDecision, 'after_third_out');
});
test('F09: actual double play credits two outs without manufacturing RBI', () => {
  const r = resolve(input(context({ outs: 1, bases: ['A', null, 'C'] }), { plate: 'out', pitch: 'in_play', groundedIntoDoublePlay: true, steps: [
    step('C', 2, 'home'), step('A', 0, 'out', 'fc', { outKind: 'force' }), step('B', 'batter', 'out', 'out', { outKind: 'batter_before_first' }),
  ] })); assert.equal(r.runs, 0); assert.equal(r.pitchers.P.outs, 2); assert.equal(r.batters.B.gdp, 1);
});
test('F10: triple play consumes exactly three outs', () => {
  const r = resolve(input(context({ bases: ['A', 'C', null] }), { plate: 'out', pitch: 'in_play', steps: [
    step('C', 1, 'out', 'fc', { outKind: 'force' }), step('A', 0, 'out', 'fc', { outKind: 'force' }),
    step('B', 'batter', 'out', 'out', { outKind: 'batter_before_first' }),
  ] })); assert.equal(r.outsAdded, 3); assert.equal(r.pitchers.P.outs, 3);
});
test('F11: third-out appeal cancels the appealed runner and following runner', () => {
  const r = resolve(input(context({ outs: 2, bases: ['A', null, 'C'] }), { steps: [
    step('C', 2, 'home'), step('A', 0, 'home'), step('C', 'home', 'out', 'appeal', { outKind: 'appeal_time' }),
  ] })); assert.equal(r.runs, 0);
});
test('F12: advantageous fourth-out appeal changes scoring, never adds a fourth pitching out', () => {
  const r = resolve(input(context({ outs: 2, bases: ['A', null, 'C'] }), {
    ruling: { kind: 'appeal', status: 'confirmed', rule: '5.08 심판 확인', note: '선행주자 재터치 어필', choice: 'award' }, steps: [
      step('C', 2, 'home'), step('A', 0, 'out', 'out', { outKind: 'tag', putout: '4' }),
      step('C', 'home', 'out', 'appeal', { outKind: 'appeal_time', advantageousAppeal: true, putout: '5' }),
    ] }));
  assert.equal(r.runs, 0); assert.equal(r.pitchers.P.outs, 1); assert.equal(r.steps[1].countedOut, false); assert.equal(r.fielding['5'].putouts, 1);
});
for (let outs = 0; outs < 3; outs++) for (let mask = 0; mask < 8; mask++) test(`F13: forced walk occupancy ${mask}, outs ${outs}`, () => {
  const bases = [0, 1, 2].map(i => mask & (1 << i) ? `R${i}` : null);
  const steps = [];
  for (let i = 2; i >= 0; i--) if (bases[i] && bases.slice(0, i + 1).every(Boolean)) steps.push(step(bases[i], i, i === 2 ? 'home' : i + 1, 'award', { rbi: i === 2 }));
  steps.push(step('B', 'batter', 0, 'award'));
  const r = resolve(input(context({ outs, balls: 3, bases }), { plate: 'bb', pitch: 'ball', steps }));
  assert.equal(r.runs, mask === 7 ? 1 : 0); assert.equal(r.batters.B.bb, 1); assert.equal(r.batters.B.ab ?? 0, 0); assert.equal(r.outsAdded, 0);
});
test('F14: fourth-ball WP has a walk and an independent unforced runner advance', () => {
  const r = resolve(input(context({ balls: 3, bases: [null, null, 'C'] }), { plate: 'bb', pitch: 'ball', misc: 'wp', steps: [
    step('C', 2, 'home', 'wp'), step('B', 'batter', 0, 'award'),
  ] })); assert.equal(r.runs, 1); assert.equal(r.pitchers.P.bb, 1); assert.equal(r.pitchers.P.wp, 1); assert.equal(r.batters.B.rbi ?? 0, 0);
});
for (const plate of ['sh', 'sf']) test(`F15-${plate}: sacrifice judgment may coexist with a separate error`, () => {
  const r = resolve(input(context({ bases: [null, null, 'C'] }), { plate, pitch: 'in_play', errors: [error()], steps: [
    step('C', 2, 'home', 'advance', { rbi: true }), step('B', 'batter', 0, 'error', { errorId: 'E1' }),
  ] })); assert.equal(r.batters.B[plate], 1); assert.equal(r.batters.B.ab ?? 0, 0); assert.equal(r.batters.B.rbi, 1);
});
test('F16: dropped foul error keeps plate open and two strikes', () => {
  const r = resolve(input(context({ strikes: 2 }), { pitch: 'foul', errors: [{ ...error(), kind: 'foul_drop' }] }));
  assert.equal(r.after.strikes, 2); assert.equal(r.plateCompleted, false); assert.equal(r.input.errors.length, 1);
});
test('F17: automatic ball changes count without adding a pitch', () => {
  const r = resolve(input(context(), { pitch: 'automatic_ball' })); assert.equal(r.after.balls, 1); assert.equal(r.after.pitchCount, 0); assert.deepEqual(r.pitchers, {});
});
test('F18: automatic third strike adds K and out without a pitch', () => {
  const r = resolve(input(context({ strikes: 2 }), { plate: 'so', pitch: 'automatic_strike', steps: [step('B', 'batter', 'out', 'out', { outKind: 'strikeout' })] }));
  assert.equal(r.pitchers.P.so, 1); assert.equal(r.pitchers.P.pitches ?? 0, 0); assert.equal(r.outsAdded, 1);
});
test('F19: balk advances a runner without ending the plate', () => {
  const r = resolve(input(context({ bases: [null, null, 'C'] }), { misc: 'balk', steps: [step('C', 2, 'home', 'award')] }));
  assert.equal(r.pitchers.P.bk, 1); assert.equal(r.plateCompleted, false); assert.equal(r.runs, 1);
});
test('F20: unknown responsible pitcher never falls back to current pitcher', () => {
  const r = resolve(input(context({ bases: [null, null, 'C'], runnerResponsiblePitcher: { 0: null, 1: null, 2: null } }), { steps: [step('C', 2, 'home')] }));
  assert.equal(r.unassignedRuns, 1); assert.equal(r.pitchers.P?.r ?? 0, 0);
});
test('V01: stale counts, revision and roster invalidate the draft', () => {
  const i = hitError(); for (const patch of [{ revision: 'changed' }, { rosterKey: 'changed' }, { balls: 1 }, { batterId: 'OTHER' }, { pitcherId: 'OTHER' }]) {
    assert.equal(engine.resolveCompositePlay({ ...i.expected, ...patch }, i).ok, false);
  }
});
test('V02: duplicate final base occupants are rejected', () => reject(input(context({ bases: ['A', 'C', null] }), { steps: [step('A', 0, 1)] })));
test('V03: a runner segment must start where the preceding segment ended', () => reject(input(context(), { plate: 'single', pitch: 'in_play', steps: [step('B', 'batter', 0, 'hit'), step('B', 2, 'home')] })));
test('V04: missing out kind and invalid error references are rejected', () => {
  reject(input(context({ bases: ['A', null, null] }), { steps: [step('A', 0, 'out')] }));
  reject(input(context({ bases: ['A', null, null] }), { steps: [step('A', 0, 1, 'error', { errorId: 'missing' })] }));
});
test('V05: unresolved ruling and missing review cannot be committed', () => {
  const i = hitError(); reject({ ...i, reviewed: false }); reject({ ...i, ruling: { ...i.ruling, status: 'pending' } });
});
test('V06: FC with runner out requires explicit responsibility judgment', () => reject(input(context({ bases: ['A', null, null] }), { plate: 'fc', pitch: 'in_play', steps: [step('A', 0, 'out', 'fc', { outKind: 'force' }), step('B', 'batter', 0, 'fc')] })));
test('V07: fourth-ball forced advancement alone does not earn WP', () => reject(input(context({ balls: 3, bases: ['A', null, null] }), { plate: 'bb', pitch: 'ball', misc: 'wp', steps: [step('A', 0, 1, 'wp'), step('B', 'batter', 0, 'award')] })));
test('V08: a canceled run cannot carry RBI', () => reject(input(context({ outs: 2, bases: ['A', null, 'C'] }), { steps: [step('C', 2, 'home', 'advance', { rbi: true }), step('A', 0, 'out', 'out', { outKind: 'force' })] })));
test('V09: malformed external payloads fail safely', () => {
  for (const value of [null, {}, [], { id: 'x', expected: null }, { ...hitError(), steps: [null] }, { ...hitError(), errors: [null] }]) assert.equal(engine.resolveCompositePlay(context(), value).ok, false);
});
test('V10: JSON round trip validates all derived data and rejects tampering', () => {
  const r = resolve(hitError()); assert.deepEqual(engine.normalizeCompositePlay(JSON.parse(JSON.stringify(r))), r);
  for (const key of ['runs', 'outsAdded', 'after', 'batters', 'feed']) assert.equal(engine.normalizeCompositePlay({ ...r, [key]: null }), undefined);
});
test('V11: resolving never mutates the submitted draft or expected state', () => {
  const i = hitError(), before = structuredClone(i); resolve(i); assert.deepEqual(i, before);
});
test('V12: structured team totals ignore duplicate descriptions and events', () => {
  const r = resolve(hitError()), event = { inning: 1, half: 'top', eventId: r.input.id, order: 1, batter: 'B', pitch: 1, type: 'composite', runners: [], compositePlay: r };
  const row = { ...event, result: '홈런 실책 실책' };
  assert.deepEqual(facts.scoringTeamTotals([event, event], [row, row]), { hits: { home: 0, away: 1 }, errors: { home: 1, away: 0 } });
  assert.equal(facts.classifyRecordedPlateAppearance(row.result, event), null);
});
test('V13: composite projections preserve unknown earned-run status', () => {
  const r = resolve(input(context({ bases: [null, null, 'C'] }), { steps: [step('C', 2, 'home')] }));
  const b = {}, p = {}; engine.applyCompositeProjection(r, { batter: id => b[id] ??= {}, pitcher: id => p[id] ??= { er: 0 } });
  assert.equal(p.P0.r, 1); assert.equal(p.P0.er, 0); assert.equal(p.P0.earnedRunsStatus, 'unconfirmed');
});

// Extract declarations, not module imports: production effects cannot run in this VM.
const extracted = (path, names, globals) => {
  const source = fs.readFileSync(new URL(path, import.meta.url), 'utf8');
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const pieces = ast.statements.flatMap(node => {
    if (ts.isFunctionDeclaration(node) && node.name && names.includes(node.name.text)) return [node.getText(ast).replace(/^export\s+/, '')];
    if (ts.isVariableStatement(node) && node.declarationList.declarations.some(d => ts.isIdentifier(d.name) && names.includes(d.name.text))) return [node.getText(ast)];
    return [];
  });
  const js = ts.transpileModule(pieces.join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  const sandbox = { ...globals, structuredClone, JSON, Map, Set, Date, Math };
  vm.createContext(sandbox); vm.runInContext(js, sandbox); return sandbox;
};
const store = extracted('../src/shared/state/demoStore.tsx', ['compositeContextForState', 'applyCompositeScoringPlay'], {
  ...engine, formatCompositeFeed, currentBatterInfo: () => ({ batter: 'B', order: 1 }), formatUniqueName: name => name,
  withRejectedTransition: (state, reason) => ({ ...state, rejected: reason }),
  createPlayEvent: (state, detail, pitch) => ({ ...detail, inning: state.inning, half: state.half, order: 1, batter: 'B', pitch }),
  nextBatter: state => ({ batterIndex: { ...state.batterIndex, away: state.batterIndex.away + 1 } }),
  hittingSide: state => state.half === 'top' ? 'away' : 'home',
  addRunsToLineScore: (line, side, inning, runs) => ({ ...line, [side]: [runs] }),
  pushEvent: (events, event) => [event, ...events], pushPlayFeed: (state, row) => [...state.feed, row],
  createLogEntry: (state, result, pitch, eventId) => ({ inning: state.inning, half: state.half, order: 1, batter: 'B', result, pitch, eventId }),
  changeHalf: state => ({ ...state, inning: state.half === 'bottom' ? state.inning + 1 : state.inning, half: state.half === 'top' ? 'bottom' : 'top', outs: 0 }),
});
test('I01: store application is one event, one feed row, one batter advance; retry is idempotent', () => {
  const s = { ...context(), lineups: { home: [{ name: 'P', pos: 'P', number: '' }], away: [{ name: 'B', pos: 'SS', number: '' }] }, events: [], feed: [], lineScore: { home: [], away: [] } };
  const i = { ...hitError(), expected: store.compositeContextForState(s) };
  const next = store.applyCompositeScoringPlay(s, i);
  assert.equal(next.events.length, 1); assert.equal(next.feed.length, 1); assert.equal(next.batterIndex.away, 1);
  assert.equal(store.applyCompositeScoringPlay(next, i), next); assert.equal(s.events.length, 0);
  assert.ok(store.applyCompositeScoringPlay(next, { ...i, note: 'conflict' }).rejected);
});
test('I02: stale store input preserves gameplay and event history', () => {
  const s = { ...context(), lineups: { home: [{ name: 'P', pos: 'P' }], away: [] }, events: [], feed: [] };
  const next = store.applyCompositeScoringPlay(s, hitError()); assert.ok(next.rejected); assert.equal(next.events, s.events); assert.equal(next.bases, s.bases);
});

const statGlobals = { ...engine, ...facts, createStructuredRunnerIndex, canPitcherBat: () => true };
for (const page of ['scorekeeper/pages/ScorekeeperPage.tsx', 'scoreboard/pages/ScoreboardTextPage.tsx']) {
  const stats = extracted(`../src/features/${page}`, ['buildPlayerStats', 'ensurePlayerStat', 'ensurePitcherStat', 'getUniqueName', 'classifyPitch'], statGlobals);
  test(`I03: ${page} consumes canonical deltas once despite duplicate feed`, () => {
    const r = resolve(hitError());
    const player = (name, pos) => ({ name, pos, number: '', throws: 'R', bats: 'R' });
    const event = { inning: 1, half: 'top', eventId: r.input.id, order: 1, batter: 'B', pitch: 1, type: 'composite', runners: [], compositePlay: r };
    const feed = { ...event, result: r.feed.join(' | ') };
    const result = stats.buildPlayerStats({ lineups: { home: [player('P', 'P')], away: [player('B', 'SS')] }, benches: { home: [], away: [] }, removed: { home: [], away: [] }, feed: [feed, feed], events: [event] });
    const b = result.hitters.away.find(row => row.name === 'B'), p = result.pitchers.home.find(row => row.name === 'P');
    assert.equal(b.h, 1); assert.equal(b.pa, 1); assert.equal(b.ab, 1); assert.equal(p.outs, 1); assert.equal(p.pitches, 1);
  });
  test(`I05: ${page} classifies dropped-third failure numerically once`, () => {
    const r = resolve(droppedOut('batter_before_first'));
    const player = (name, pos) => ({ name, pos, number: '', throws: 'R', bats: 'R' });
    const event = { inning: 1, half: 'top', eventId: r.input.id, order: 1, batter: 'B', pitch: 1, type: 'composite', runners: [], compositePlay: r };
    const row = { ...event, result: r.feed.join(' | ') };
    const result = stats.buildPlayerStats({ lineups: { home: [player('P', 'P')], away: [player('B', 'SS')] }, benches: { home: [], away: [] }, removed: { home: [], away: [] }, feed: [row, row], events: [event] });
    const b = result.hitters.away.find(item => item.name === 'B'), p = result.pitchers.home.find(item => item.name === 'P');
    assert.equal(b.pa, 1); assert.equal(b.ab, 1); assert.equal(b.so, 1); assert.equal(b.h, 0);
    assert.equal(p.bf, 1); assert.equal(p.so, 1); assert.equal(p.outs, 1); assert.equal(p.pitches, 1);
  });
}
const statRecord = extracted('../src/shared/state/demoStore.record.ts', ['calculateGameStats'], statGlobals);
test('I04: post-game batter aggregation uses the same structured hit once', () => {
  const r = resolve(hitError()), event = { inning: 1, half: 'top', eventId: r.input.id, order: 1, batter: 'B', pitch: 1, type: 'composite', runners: [], compositePlay: r };
  const result = statRecord.calculateGameStats({ lineups: { home: [], away: [{ name: 'B' }] }, benches: { home: [], away: [] }, removed: { home: [], away: [] }, events: [event, event], feed: [{ ...event, result: r.feed.join(' | ') }] });
  assert.equal(result.away.get('B').h, 1); assert.equal(result.away.get('B').pa, 1);
});
test('I06: dropped-third failure survives store application, team totals and post-game aggregation', () => {
  const s = { ...context({ strikes: 2 }), lineups: { home: [{ name: 'P', pos: 'P', number: '' }], away: [{ name: 'B', pos: 'SS', number: '' }] }, events: [], feed: [], lineScore: { home: [], away: [] }, benches: { home: [], away: [] }, removed: { home: [], away: [] } };
  const i = { ...droppedOut('batter_before_first'), expected: store.compositeContextForState(s) };
  const next = store.applyCompositeScoringPlay(s, i);
  assert.equal(next.outs, 1); assert.equal(next.batterIndex.away, 1); assert.equal(next.balls, 0); assert.equal(next.strikes, 0);
  assert.equal(next.feed.length, 1); assert.match(next.feed[0].result, /낫아웃 실패/); assert.doesNotMatch(next.feed[0].result, /낫아웃 출루/);
  assert.equal(store.applyCompositeScoringPlay(next, i), next);
  assert.deepEqual(facts.scoringTeamTotals(next.events, next.feed), { hits: { home: 0, away: 0 }, errors: { home: 0, away: 0 } });
  const b = statRecord.calculateGameStats(next).away.get('B'); assert.equal(b.pa, 1); assert.equal(b.ab, 1); assert.equal(b.so, 1); assert.equal(b.h, 0);
});

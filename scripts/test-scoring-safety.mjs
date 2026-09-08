import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as safety from '../src/shared/lib/scoringInputSafety.ts';
import { classifyRecordedPlateAppearance as classify, scoringTeamTotals, recordedMiscPitch } from '../src/shared/lib/scoringEventFacts.ts';
import { resolveAdvanceOutcome } from '../src/shared/state/demoStore.baseRunning.ts';

const context = (extra = {}) => ({ inning: 1, half: 'top', outs: 0, balls: 0, strikes: 0,
  pitchCount: 2, bases: [null, null, 'R3'], score: { home: 0, away: 0 }, lineScore: { home: [], away: [] },
  batterIndex: { home: 0, away: 0 }, feed: [], events: [], ...extra });
const details = (extra = {}) => ({ errorType: 'WP(폭투)', fielderPos: 'P', context: '', pitchResult: 'ball',
  advanceResults: { batter: 'hold', runners: { 2: 'score' } }, ...extra });
const event = (extra = {}) => ({ inning: 1, half: 'top', order: 1, pitch: 3, batter: 'H', eventId: 'play-1', type: 'error', runners: [], ...extra });
const feed = (result, extra = {}) => ({ inning: 1, half: 'top', order: 1, pitch: 3, batter: 'H', eventId: 'play-1', result, ...extra });

test('a single error with several feed rows counts once', () => {
  const totals = scoringTeamTotals([event({ error: details({ errorType: '송구' }) })],
    [feed('실책'), feed('실책 · 3루 주자 득점', { order: 0, batter: '' }), feed('실책 · 1루 주자 진루', { order: 0, batter: '' })]);
  assert.equal(totals.errors.home, 1);
});
test('legacy feed rows with the same event ID count one error', () => {
  assert.equal(scoringTeamTotals([], [feed('실책'), feed('실책 · 주자 진루')]).errors.home, 1);
});
test('distinct errors count separately and repeated events do not', () => {
  const a = event(), b = event({ eventId: 'play-2' });
  assert.equal(scoringTeamTotals([a, a, b], []).errors.home, 2);
});
test('manual reclassification takes priority over live event and feed wording', () => {
  const corrected = event({ type: 'hit', source: { kind: 'manual' } });
  assert.deepEqual(scoringTeamTotals([event(), corrected], [feed('실책')]), { hits: { home: 0, away: 1 }, errors: { home: 0, away: 0 } });
});
for (const kind of ['wp', 'pb', 'balk']) {
  test(`${kind} does not count as a fielding error or pending plate appearance`, () => {
    const e = event({ type: kind, outcome: 'plate_pending', error: details() });
    assert.equal(scoringTeamTotals([e], [feed('실책 · WP(폭투)')]).errors.home, 0);
    assert.equal(classify('실책 · WP(폭투)', e), null);
  });
}
test('pending review and rejected annotations never manufacture totals', () => {
  assert.equal(scoringTeamTotals([event({ manualResolve: { required: true } })], [feed('실책')]).errors.home, 0);
  assert.equal(scoringTeamTotals([], [feed('기록 반려: 실책'), feed('*기록원* - 홈런 정정 검토')]).hits.away, 0);
});
test('structured pending batter stays at the plate despite error wording', () => {
  assert.equal(classify('실책 · 송구', event({ error: details({ errorType: '송구' }) })), null);
});
test('fourth-ball wild pitch has one walk, not an error plate appearance', () => {
  assert.equal(classify('볼넷 · 폭투', event({ type: 'wp', outcome: 'plate_walk', error: details() })), 'bb');
});
for (const text of ['삼진 낫아웃 실패(포수 태그)', '삼진 낫아웃 실패(1루 포스/루킹)']) {
  test(`${text} is a strikeout out`, () => assert.equal(classify(text), 'so'));
}
test('successful dropped third strike remains strikeout reach', () => assert.equal(classify('삼진 낫아웃'), 'so_reach'));
test('misc pitch classification is independent of batted-ball words in notes', () => {
  assert.deepEqual(recordedMiscPitch(event({ type: 'wp', error: details() })), { pitch: true, ball: true, strike: false });
  assert.deepEqual(recordedMiscPitch(event({ type: 'balk', error: details() })), { pitch: false, ball: false, strike: false });
});
test('sacrifices require eligible outs and runners', () => {
  assert.ok(safety.sacrificeInputIssue(context({ outs: 2 }), 'fly'));
  assert.ok(safety.sacrificeInputIssue(context({ bases: [null, null, null] }), 'bunt'));
  assert.equal(safety.sacrificeInputIssue(context(), 'fly'), null);
});
test('dropped third strike eligibility changes at two outs', () => {
  assert.ok(safety.droppedThirdStrikeInputIssue(context({ bases: ['R1', null, null], outs: 1 })));
  assert.equal(safety.droppedThirdStrikeInputIssue(context({ bases: ['R1', null, null], outs: 2 })), null);
});
test('multiple outs require runners, available outs, and distinct selected bases', () => {
  assert.ok(safety.multipleOutInputIssue(context({ bases: [null, null, null] }), 2));
  assert.ok(safety.multipleOutInputIssue(context({ outs: 2 }), 2));
  assert.ok(safety.multipleOutInputIssue(context({ bases: ['A', 'B', null] }), 3, [0, 0]));
  assert.equal(safety.multipleOutInputIssue(context({ bases: ['A', 'B', null] }), 3, [0, 1]), null);
});
test('unknown third-out timing is held rather than silently scored', () => {
  assert.ok(safety.legacyThirdOutIssue(3, 1));
  assert.ok(safety.legacyThirdOutIssue(4, 0));
  assert.equal(safety.legacyThirdOutIssue(3, 0), null);
  assert.equal(safety.legacyThirdOutIssue(2, 1), null);
});
test('unsupported terminal strike and illegal batter destinations are rejected', () => {
  assert.ok(safety.miscPlayInputIssue(context({ strikes: 2 }), details({ pitchResult: 'strike' })));
  assert.ok(safety.miscPlayInputIssue(context(), details({ advanceResults: { batter: 1, runners: { 2: 'score' } } })));
});
test('fourth ball needs actual advancement beyond the walk award', () => {
  assert.ok(safety.miscPlayInputIssue(context({ balls: 3, bases: ['R1', null, null] }), details({ advanceResults: { batter: 1, runners: { 0: 2 } } })));
  assert.equal(safety.miscPlayInputIssue(context({ balls: 3 }), details({ advanceResults: { batter: 1, runners: { 2: 'score' } } })), null);
});
test('fourth ball cannot leave a forced runner on the original base', () => {
  assert.ok(safety.miscPlayInputIssue(context({ balls: 3, bases: ['R1', null, 'R3'] }), details({ advanceResults: { batter: 1, runners: { 0: 'hold', 2: 'score' } } })));
});
test('basic balk keeps the batter and moves every runner one base', () => {
  const d = details({ errorType: 'BK(보크)', pitchResult: undefined });
  assert.equal(safety.miscPlayInputIssue(context(), d), null);
  assert.ok(safety.miscPlayInputIssue(context({ bases: [null, null, null] }), d));
  assert.ok(safety.miscPlayInputIssue(context(), { ...d, advanceResults: { batter: 1, runners: { 2: 'score' } } }));
});

// Extract only named transition functions. Never import the React store or Firebase.
// The VM has no network, process, authentication or production persistence bindings.
const source = fs.readFileSync(new URL('../src/shared/state/demoStore.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('store.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = new Set(['applySacrifice', 'applyDroppedThirdStrike', 'applyFielderChoice', 'applyDoublePlay', 'applyError',
  'applyRunnerAdvancements', 'placeRunnerOnBases', 'placeRunnerOnExactBase']);
const bodies = ast.statements.filter(n => ts.isFunctionDeclaration(n) && n.name && names.has(n.name.text)).map(n => n.getText(ast));
assert.equal(bodies.length, names.size, 'isolated transition harness must extract every required function');
const createEvent = (state, detail, pitch) => event({ inning: state.inning, half: state.half, pitch, ...detail });
const log = (state, result, pitch, eventId) => feed(result, { inning: state.inning, half: state.half, pitch, eventId });
const sandbox = vm.createContext({ ...safety, resolveAdvanceOutcome,
  withRejectedTransition: (state, reason) => ({ ...state, rejected: reason }),
  currentBatterInfo: () => ({ batter: 'H', order: 1 }),
  nextBatter: state => ({ batterName: 'H', batterIndex: { ...state.batterIndex, away: 1 } }),
  hittingSide: state => state.half === 'top' ? 'away' : 'home',
  formatRunnerMove: ({ runner, message, outcome }) => ({ feedText: `${message} · 주자 ${outcome} · ${runner}`, runnerSummary: `${message} · ${runner}`, lastPlay: message }),
  createPlayEvent: createEvent, createPlayEventWithBatter: createEvent,
  createLogEntry: log, createLogEntryWithBatter: (s, _b, _o, text, p, id) => log(s, text, p, id),
  createLogEntryForBaserunning: (s, text, p, id) => ({ ...log(s, text, p, id), order: 0, batter: '' }),
  pushFeed: (rows, row) => [row, ...rows], pushEvent: (rows, row) => [row, ...rows],
  pushPlayFeed: (s, row, rows = s.feed) => [row, ...rows],
  addRunsToLineScore: (score, side, inning, runs) => ({ ...score, [side]: Array.from({ length: inning }, (_, i) => (score[side][i] ?? 0) + (i === inning - 1 ? runs : 0)) }),
  changeHalf: () => { throw new Error('rejected third-out play must not change halves'); },
});
vm.runInContext(ts.transpileModule(bodies.join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText, sandbox);
const transition = (name, ...args) => sandbox[name](...args);
const rejectUnchanged = (before, after) => {
  assert.ok(after.rejected);
  for (const key of ['score', 'bases', 'outs', 'events', 'feed', 'batterIndex']) assert.deepEqual(after[key], before[key]);
};
test('actual legacy sacrifice transition rejects two-out scoring before mutation', () => {
  const s = context({ outs: 2 }); rejectUnchanged(s, transition('applySacrifice', s, 3, null, 'fly'));
});
test('actual legacy dropped-third-strike transition rejects occupied first with one out', () => {
  const s = context({ outs: 1, bases: ['R1', null, null] }); rejectUnchanged(s, transition('applyDroppedThirdStrike', s));
});
test('actual legacy fielder choice does not keep a run with an unspecified third out', () => {
  const s = context({ outs: 2, bases: ['R1', null, 'R3'] });
  rejectUnchanged(s, transition('applyFielderChoice', s, 3, { 0: 'out', 2: 'score' }));
});
test('actual legacy double play rejects insufficient runners', () => {
  const s = context({ bases: [null, null, null] }); rejectUnchanged(s, transition('applyDoublePlay', s, 2, '병살'));
});
test('actual legacy double play rejects runs at the third out before inning switch', () => {
  const s = context({ outs: 1, bases: ['R1', null, 'R3'] });
  rejectUnchanged(s, transition('applyDoublePlay', s, 2, '병살', null, [0], undefined, { 2: 3 }));
});
test('actual legacy error rejects third-out scoring', () => {
  const s = context({ outs: 2, bases: ['R1', null, 'R3'] });
  rejectUnchanged(s, transition('applyError', s, details({ errorType: '송구', advanceResults: { batter: 1, runners: { 0: 'out', 2: 'score' } } })));
});
test('actual legacy runner advancement rejects unknown third-out timing', () => {
  const s = context({ outs: 2, bases: ['R1', null, 'R3'] });
  rejectUnchanged(s, transition('applyRunnerAdvancements', s, { 0: 'out', 2: 'score' }, '진루'));
});
test('actual wild-pitch transition preserves plate appearance and publishes non-error facts', () => {
  const s = context(), after = transition('applyError', s, details());
  assert.equal(after.rejected, undefined);
  assert.equal(after.balls, 1); assert.equal(after.pitchCount, 3);
  assert.deepEqual(after.batterIndex, s.batterIndex);
  assert.equal(after.score.away, 1);
  assert.equal(after.events[0].type, 'wp'); assert.equal(after.events[0].outcome, 'plate_pending');
  assert.equal(after.feed.some(row => row.result.includes('실책')), false);
  assert.equal(classify(after.feed[0].result, after.events[0]), null);
  assert.equal(scoringTeamTotals(after.events, after.feed).errors.home, 0);
});
test('actual fourth-ball wild pitch produces a walk and no RBI for a non-forced scoring runner', () => {
  const after = transition('applyError', context({ balls: 3 }), details({ advanceResults: { batter: 1, runners: { 2: 'score' } } }));
  assert.equal(after.rejected, undefined);
  assert.equal(after.bases[0], 'H'); assert.equal(after.balls, 0);
  assert.equal(classify(after.feed[0].result, after.events[0]), 'bb');
  assert.equal(after.events[0].rbi, undefined);
});

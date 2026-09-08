import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  rebuildEventsFromFeedWithAlternatives as rebuild,
  rebuildEventsFromFeed,
  selectRebuildEvents,
  mergeRebuiltEventsForReplay as merge,
  rebuildReviewRows,
  scoringReplayAuditRows,
  REJECT_REBUILD_SELECTION,
  classifyKboResultCode,
} from '../src/shared/lib/playFeedParser.ts';
import {
  scoringStateIssues, scoringTransitionIssues, replayScoringEvents, attachScoringTransition,
  normalizeScoringTransition, normalizeScoringRejections,
} from '../src/shared/lib/scoringReplay.ts';
import { normalizeEvents } from '../src/shared/state/demoStore.normalize.ts';

const frame = (overrides = {}) => ({ inning: 1, half: 'top', outs: 0, bases: [null, null, null], score: { home: 0, away: 0 }, ...overrides });
const feed = (result, overrides = {}) => ({ inning: 1, half: 'top', order: 1, pitch: 1, batter: '김선수(7)', result, eventId: 'p1', createdAt: 1, ...overrides });
const event = (overrides = {}) => ({ inning: 1, half: 'top', order: 1, pitch: 1, batter: '김선수(7)', type: 'walk', notes: '볼넷', runners: [], eventId: 'p1', createdAt: 1, ...overrides });
const transitionEvent = (id, before, after, overrides = {}) => event({ eventId: id, stateTransition: { version: 1, before, after }, ...overrides });
const confirm = (result) => Object.fromEntries(result.groups.map((group) => [group.groupId, group.selectedEventId]));

test('normal rule rationale is evidence, not a validation failure', () => {
  const result = rebuild([feed('볼넷')]);
  assert.equal(result.needsReview, false);
  assert.equal(result.groups[0].requiresManualResolve, false);
  assert.equal(selectRebuildEvents(result.groups).length, 1);
  assert.equal(result.events[0].evidence.includes('타임라인 정합성 경고'), false);
  assert.equal(result.events[0].corrections, undefined);
});

test('custom confidence threshold controls the flag and reason together', () => {
  const result = rebuild([feed('볼넷')], { manualResolveThreshold: 0.96 });
  assert.equal(result.needsReview, true);
  assert.ok(result.events[0].manualResolve.reasons.includes('신뢰도 부족'));
  assert.deepEqual(selectRebuildEvents(result.groups), []);
});

test('unknown text stays pending, including compatibility rebuild API', () => {
  const input = [feed('이해할 수 없는 기록')];
  assert.equal(rebuild(input).needsReview, true);
  assert.deepEqual(rebuildEventsFromFeed(input), []);
});

test('a single low-confidence candidate needs explicit confirmation and can roll back', () => {
  const result = rebuild([feed('알 수 없는 판정')]);
  const selections = confirm(result);
  const resolved = selectRebuildEvents(result.groups, selections);
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].source.kind, 'manual');
  assert.equal(resolved[0].manualResolve.required, false);
  assert.notEqual(resolved[0].outcome, 'manual_review');
  assert.equal(resolved[0].corrections.length, 1);
  assert.equal(result.events[0].manualResolve.required, true);
  assert.deepEqual(selectRebuildEvents(result.groups, {}), []);
});

test('invalid/stale candidate selections never fall back to an implicit confirmation', () => {
  const result = rebuild([feed('볼넷')]);
  assert.deepEqual(selectRebuildEvents(result.groups, { p1: 'old-candidate' }), []);
});

test('excluded candidates remain in audit but cannot enter detail events', () => {
  const result = rebuild([feed('볼넷')]);
  const decisions = { p1: REJECT_REBUILD_SELECTION };
  assert.deepEqual(selectRebuildEvents(result.groups, decisions), []);
  assert.equal(rebuildReviewRows(result.groups, decisions)[0][3], '제외');
});

test('batting order wraps for both nine-player and practice lineups', () => {
  for (const last of [9, 12, 15]) {
    const result = rebuild([feed('볼넷', { order: last }), feed('사구', { eventId: 'p2', order: 1, pitch: 2, createdAt: 2 })]);
    assert.equal(result.needsReview, false);
    assert.equal(selectRebuildEvents(result.groups).length, 2);
  }
});

test('timestamp order detects half reversal before inning sorting', () => {
  const result = rebuild([feed('볼넷', { half: 'top', createdAt: 20 }), feed('사구', { half: 'bottom', eventId: 'p0', createdAt: 10 })]);
  assert.ok(result.groups.find((group) => group.groupId === 'p1').rebuildIssues.includes('동일 이닝에서 말→초로 역전됨'));
});

test('legacy records receive IDs before chronology validation', () => {
  const result = rebuild([feed('볼넷', { inning: 0, eventId: undefined })]);
  assert.equal(result.groups[0].requiresManualResolve, true);
  assert.ok(result.groups[0].rebuildIssues.includes('이닝 정보 누락/비정상'));
});

test('same pitch can contain multiple different legal entries', () => {
  const result = rebuild([feed('볼넷'), feed('투수교체', { eventId: 'p2' })]);
  assert.equal(result.groups.some((group) => group.rebuildIssues?.some((issue) => issue.includes('중복'))), false);
});

test('missing timestamps preserve source batting order instead of sorting 1 before 9', () => {
  const result = rebuild([feed('볼넷', { order: 9, createdAt: undefined }), feed('사구', { eventId: 'p2', order: 1, createdAt: undefined })]);
  assert.deepEqual(result.groups.map((group) => group.groupId), ['p1', 'p2']);
});

test('bunt hit is classified as a single, not a sacrifice', () => {
  const selected = rebuildEventsFromFeed([feed('번트 안타')]);
  assert.equal(selected[0].type, 'single');
  assert.equal(classifyKboResultCode(selected[0]), '1B');
});

test('steal error and interference are not silently classified as caught stealing', () => {
  for (const text of ['도루 중 송구 실책', '도루 중 주루 방해']) {
    assert.equal(rebuild([feed(text)]).events.some((item) => item.type === 'steal_fail'), false);
  }
});

test('mentions of a ruling never confer official correction authority', () => {
  for (const text of ['심판 판정 볼넷', '공식 기록 보정 폭투', '수정 사구']) {
    assert.ok(rebuild([feed(text)]).events.every((item) => item.officialAdjust === false));
  }
});

test('intermediate pitches are recognized without inventing a final batting outcome', () => {
  for (const text of ['볼', '파울', '헛스윙 스트라이크']) {
    const result = rebuild([feed(text)]);
    assert.equal(result.events[0].type, 'pitch');
    assert.equal(result.needsReview, false);
    assert.deepEqual(selectRebuildEvents(result.groups), []);
  }
});

test('compound runner summaries are attached once and fragments need joint confirmation', () => {
  const result = rebuild([feed('볼넷, 폭투'), feed('1루 주자 2루 진루 · 김선수(7)', { order: 0, batter: '' })]);
  assert.equal(result.groups.length, 2);
  assert.deepEqual(selectRebuildEvents(result.groups), []);
  const partial = { [result.groups[0].groupId]: result.groups[0].selectedEventId };
  assert.equal(merge({ existingEvents: [], rebuiltEvents: selectRebuildEvents(result.groups, partial) }).length, 0);
  const all = selectRebuildEvents(result.groups, confirm(result));
  assert.equal(all.flatMap((item) => item.runners).length, 1);
  assert.equal(merge({ existingEvents: [event()], rebuiltEvents: all }).length, 2);
});

test('automatic feed candidates cannot overwrite live or manually recorded events', () => {
  const candidate = rebuildEventsFromFeed([feed('볼넷')])[0];
  for (const source of [undefined, { kind: 'live' }, { kind: 'manual' }]) {
    const original = event({ source, confidence: 0.01, rbi: 1 });
    assert.deepEqual(merge({ existingEvents: [original], rebuiltEvents: [candidate] }), [original]);
  }
});

test('confirmed classification replaces the same source event without a duplicate', () => {
  const result = rebuild([feed('볼넷')]);
  const original = event({ type: 'error', source: { kind: 'live' } });
  const merged = merge({ existingEvents: [original], rebuiltEvents: selectRebuildEvents(result.groups, confirm(result)) });
  assert.equal(merged.length, 1);
  assert.equal(merged[0].type, 'walk');
});

test('a classification correction cannot inherit a stale state transition', () => {
  const result = rebuild([feed('볼넷')]);
  const original = transitionEvent('p1', frame(), frame({ outs: 1 }), { type: 'out' });
  const merged = merge({ existingEvents: [original], rebuiltEvents: selectRebuildEvents(result.groups, confirm(result)) });
  assert.equal(merged[0].stateTransition, undefined);
});

test('repeated merge is idempotent and preserves original input', () => {
  const original = event();
  const rebuiltEvents = rebuildEventsFromFeed([feed('볼넷')]);
  const first = merge({ existingEvents: [original], rebuiltEvents });
  assert.deepEqual(merge({ existingEvents: first, rebuiltEvents }), first);
  assert.equal(original.source, undefined);
});

test('exact no-ID legacy match is not duplicated by a generated feed ID', () => {
  const original = event({ eventId: undefined });
  const rebuiltEvents = rebuildEventsFromFeed([feed('볼넷', { eventId: undefined })]);
  assert.deepEqual(merge({ existingEvents: [original], rebuiltEvents }), [original]);
});

test('same-name different-number players and long notes are not conflated', () => {
  const originals = [
    event({ eventId: undefined, batter: '김선수(7)', notes: 'a'.repeat(40) + 'first' }),
    event({ eventId: undefined, batter: '김선수(8)', notes: 'a'.repeat(40) + 'first' }),
    event({ eventId: undefined, batter: '김선수(7)', notes: 'a'.repeat(40) + 'second' }),
  ];
  assert.equal(merge({ existingEvents: originals, rebuiltEvents: [] }).length, 3);
});

test('state invariants reject nonfinite, fractional, duplicate and malformed values', () => {
  const invalid = [
    frame({ inning: NaN }), frame({ inning: 1.5 }), frame({ half: 'other' }),
    frame({ outs: Infinity }), frame({ outs: 4 }), frame({ outs: -1 }), frame({ outs: 1.5 }),
    frame({ bases: [null, null] }), frame({ bases: ['A', 'A', null] }),
    frame({ bases: [undefined, null, null] }), frame({ bases: [' ', null, null] }),
    frame({ score: { home: 0, away: NaN } }), frame({ score: { home: -1, away: 0 } }),
  ];
  for (const input of invalid) assert.ok(scoringStateIssues(input).length > 0);
  assert.deepEqual(scoringStateIssues(frame()), []);
});

test('new prepended event alone gets metadata and a copied transition', () => {
  const old = event({ eventId: 'old' }), fresh = event({ eventId: 'new' });
  const before = frame(), after = frame({ bases: ['A', null, null] });
  const result = attachScoringTransition([old], [fresh, old], before, after, (item) => ({ ...item, confidence: 1 }));
  assert.equal(result[1], old);
  assert.equal(old.stateTransition, undefined);
  assert.equal(result[0].confidence, 1);
  after.bases[0] = 'changed';
  assert.equal(result[0].stateTransition.after.bases[0], 'A');
});

test('multi-event reducer actions do not repeat one transition on every event', () => {
  const result = attachScoringTransition([], [event(), event({ eventId: 'p2' })], frame(), frame({ outs: 2 }), (item) => item);
  assert.ok(result.every((item) => item.stateTransition === undefined));
});

test('replay applies explicit runner movements atomically and can reproduce a rollback prefix', () => {
  const empty = frame(), loaded = frame({ bases: ['A', 'B', null] });
  const advanced = frame({ bases: [null, 'A', 'B'] });
  const events = [transitionEvent('a', empty, loaded), transitionEvent('b', loaded, advanced)];
  assert.deepEqual(replayScoringEvents(events).state, advanced);
  assert.deepEqual(replayScoringEvents(events.slice(0, 1)).state, loaded);
  assert.equal(replayScoringEvents(events).complete, true);
});

test('a rejected transition leaves outs, bases and score unchanged', () => {
  const before = frame();
  const result = replayScoringEvents([transitionEvent('bad', before, frame({ bases: ['A', 'A', null], score: { home: 0, away: 2 } }))], before);
  assert.equal(result.entries[0].status, 'rejected');
  assert.deepEqual(result.state, before);
});

test('consecutive state mismatch is rejected without applying later runs', () => {
  const first = transitionEvent('a', frame(), frame({ outs: 1 }));
  const second = transitionEvent('b', frame({ outs: 2 }), frame({ outs: 2, score: { home: 0, away: 1 } }));
  const result = replayScoringEvents([first, second]);
  assert.equal(result.entries[1].status, 'rejected');
  assert.deepEqual(result.state, first.stateTransition.after);
});

test('duplicate replay cannot count runs twice and conflicting IDs are rejected', () => {
  const scored = transitionEvent('run', frame(), frame({ score: { home: 0, away: 1 } }));
  const different = transitionEvent('run', frame(), frame({ score: { home: 0, away: 2 } }));
  const result = replayScoringEvents([scored, structuredClone(scored), different]);
  assert.deepEqual(result.entries.map((entry) => entry.status), ['applied', 'duplicate', 'rejected']);
  assert.equal(result.state.score.away, 1);
});

test('legacy gaps are pending and never claim a fully verified game', () => {
  const result = replayScoringEvents([event(), transitionEvent('b', frame({ outs: 1 }), frame({ outs: 2 }))]);
  assert.deepEqual(result.entries.map((entry) => entry.status), ['pending', 'applied']);
  assert.equal(result.complete, false);
  assert.equal(result.hasGaps, true);
  assert.equal(scoringReplayAuditRows([event()])[0][1], '상태 검증 보류');
});

test('half transition requires empty bases and zero outs and cannot skip an inning', () => {
  for (const after of [frame({ inning: 2 }), frame({ half: 'bottom', outs: 1 }), frame({ half: 'bottom', bases: ['A', null, null] })]) {
    assert.ok(scoringTransitionIssues({ version: 1, before: frame({ outs: 2 }), after }).length);
  }
  assert.deepEqual(scoringTransitionIssues({ version: 1, before: frame({ outs: 2 }), after: frame({ half: 'bottom' }) }), []);
});

test('defensive team score changes and score reductions require explicit manual official correction', () => {
  const before = frame({ score: { home: 1, away: 1 } });
  const after = frame({ score: { home: 0, away: 1 } });
  for (const source of [{ kind: 'live' }, { kind: 'text_feed_rebuild' }]) {
    assert.equal(replayScoringEvents([transitionEvent('a', before, after, { source, officialAdjust: true })], before).entries[0].status, 'rejected');
  }
  assert.equal(replayScoringEvents([transitionEvent('a', before, after, { source: { kind: 'manual' }, officialAdjust: true })], before).entries[0].status, 'applied');
});

test('same-timestamp prepended outs are ordered using explicit state continuity', () => {
  const first = transitionEvent('a', frame(), frame({ outs: 1 }));
  const second = transitionEvent('b', frame({ outs: 1 }), frame({ outs: 2 }));
  const merged = merge({ existingEvents: [second, first], rebuiltEvents: [] });
  assert.deepEqual(merged.map((item) => item.eventId), ['a', 'b']);
});

test('transition and origin survive normalization; corrupted transition demands review', () => {
  const original = transitionEvent('a', frame(), frame({ outs: 1 }), { rebuildOrigin: { eventId: 'source', fragmentIndex: 0, fragmentCount: 1 } });
  const normalized = normalizeEvents([original], { inning: 1, half: 'top' })[0];
  assert.deepEqual(normalized.stateTransition, original.stateTransition);
  assert.deepEqual(normalized.rebuildOrigin, original.rebuildOrigin);
  const broken = { ...original, stateTransition: { version: 1, before: frame(), after: frame({ outs: 20 }) } };
  assert.equal(normalizeEvents([broken], { inning: 1, half: 'top' })[0].manualResolve.required, true);
  assert.equal(normalizeScoringTransition(broken.stateTransition), undefined);
});

test('rejection audit normalization preserves valid attempts and drops malformed values', () => {
  const attempt = { id: 'r1', matchId: 'm1', createdAt: 1, eventType: 'out', reason: 'invalid state' };
  assert.deepEqual(normalizeScoringRejections([attempt, null, { ...attempt, createdAt: NaN }]), [attempt]);
});

test('500 synthetic feed variations retain recognized outcomes without mandatory review', () => {
  const patterns = [['볼넷', 'walk'], ['몸에 맞는 공', 'hbp'], ['번트 안타', 'single'], ['2루타', 'double'], ['폭투', 'wp']];
  for (let i = 0; i < 500; i++) {
    const [text, expected] = patterns[i % patterns.length];
    const padded = `${' '.repeat(i % 5)}${text.replaceAll(' ', i % 2 ? '  ' : '\n')}${' '.repeat(i % 3)}`;
    const result = rebuild([feed(padded, { eventId: `sample-${i}` })]);
    assert.equal(result.needsReview, false, padded);
    assert.equal(selectRebuildEvents(result.groups)[0].type, expected);
  }
});

test('deterministic random state sequence replays without drift over 200 events', () => {
  let state = frame(), seed = 7;
  const events = [];
  for (let i = 0; i < 200; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const next = structuredClone(state);
    if (seed % 3 === 0) {
      if (state.outs === 2) {
        next.half = state.half === 'top' ? 'bottom' : 'top';
        next.inning += state.half === 'bottom' ? 1 : 0;
        next.outs = 0;
        next.bases = [null, null, null];
      } else next.outs++;
    } else if (state.bases[0] === null) next.bases[0] = `runner-${i}`;
    else {
      next.bases[0] = null;
      next.score[state.half === 'top' ? 'away' : 'home']++;
    }
    events.push(transitionEvent(`sequence-${i}`, state, next));
    state = next;
  }
  const result = replayScoringEvents(events);
  assert.equal(result.complete, true);
  assert.deepEqual(result.state, state);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectScoringIntegrity } from '../src/shared/lib/scoringIntegrity.ts';
import { compositePlayAuditRows, compositePlayValidationIssues } from '../src/shared/lib/compositePlayEngine.ts';
import { scoringTeamTotals } from '../src/shared/lib/scoringEventFacts.ts';
import { integrityFixtures, integrityEvents } from './e2e/scoring/integrity-fixtures.mjs';
import { readinessScenarios, readinessInput } from './e2e/scoring/readiness-scenarios.mjs';
import { resolveCompositePlay } from '../src/shared/lib/compositePlayEngine.ts';
for (const fixture of integrityFixtures) test('INTEGRITY-' + fixture.id, () => {
  const events = integrityEvents(fixture.id), before = structuredClone(events);
  const result = inspectScoringIntegrity(events);
  assert.equal(result.status, fixture.review ? 'review_required' : 'validated');
  assert.equal(result.issues.length, fixture.review ? 1 : 0);
  assert.deepEqual(events, before, 'Audit must preserve original records');
  assert.deepEqual(inspectScoringIntegrity(JSON.parse(JSON.stringify(events))), JSON.parse(JSON.stringify(result)));
});
for (const raw of [null, undefined, {}, 4, 'bad']) test('INTEGRITY malformed collection ' + String(raw), () => assert.equal(inspectScoringIntegrity(raw).status, 'review_required'));
test('INTEGRITY malformed entry is reported without hiding valid entries', () => assert.equal(inspectScoringIntegrity([null, ...integrityEvents('valid')]).issues.length, 1));
test('INTEGRITY equal duplicate event does not create another review', () => {
  const [e] = integrityEvents('legacy-force'); assert.equal(inspectScoringIntegrity([e, structuredClone(e)]).issues.length, 1);
});
test('INTEGRITY different halves with the same event ID remain distinct', () => {
  const [e] = integrityEvents('tampered'); assert.equal(inspectScoringIntegrity([e, { ...e, half: 'bottom' }]).issues.length, 2);
});
test('INTEGRITY highest priority pending manual decision still requires review', () => {
  const [e] = integrityEvents('pending'); assert.equal(inspectScoringIntegrity([...integrityEvents('valid'), { ...e, source: { kind: 'manual' } }]).status, 'review_required');
});
test('INTEGRITY audit export contains reason and untouched original', () => {
  const [e] = integrityEvents('legacy-force'), rows = compositePlayAuditRows([e]);
  assert.match(rows[0][0], /재심/); assert.match(rows[0][2], /포스/);
  assert.equal(rows.at(-1)[2], JSON.stringify(e.compositePlay));
});
test('INTEGRITY valid audit export keeps existing row shape', () => assert.equal(compositePlayAuditRows(integrityEvents('valid')).length, 1));
test('INTEGRITY malformed record diagnostic is safe', () => {
  for (const x of [undefined, [], {}, { version: 99, input: {} }]) assert.ok(compositePlayValidationIssues(x).length);
});
for (const id of ['Q36', 'Q41', 'Q42', 'Q43']) test('INTEGRITY team errors once ' + id, () => {
  const scenario = readinessScenarios.find(s => s.id === id), input = readinessInput(scenario), r = resolveCompositePlay(input.expected, input);
  assert.equal(r.ok, true, JSON.stringify(r));
  const event = { eventId: id, inning: 1, half: 'top', order: 1, batter: 'B', pitch: 1, type: 'composite', runners: [], compositePlay: r.record };
  const totals = scoringTeamTotals([event, event], [{ ...event, result: '실책 실책 타격방해' }]);
  assert.equal(totals.errors.home, scenario.expected.errors);
  assert.equal(totals.hits.away, id === 'Q42' ? 1 : 0);
});

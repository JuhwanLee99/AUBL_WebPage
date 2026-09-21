import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { canUsePublishedOfficialDetail } from '../src/features/scoreboard/model/officialDetailRoute.ts';

// Exercise the actual page guard expressions, not a second implementation.
// This isolates render decisions; it does not mount Provider, network or effects.
const source = fs.readFileSync(new URL('../src/features/scoreboard/pages/ScoreboardTextPage.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('ScoreboardTextPage.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const page = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'ScoreboardTextPage');
assert.ok(page?.body);
const guards = page.body.statements.filter(node => ts.isIfStatement(node) && node.expression.getText(ast).includes('recordSource.status'));
assert.equal(guards.length, 2, 'The blocked and loading page guards must both be covered');
const decisions = guards.map(node => new Function('context', 'canUsePublishedOfficialDetail', `
  const { routeMatch, recordSource, officialDetail, useFirestoreLiveForOfficial,
    routeSelectionPending, officialDetailState, routeMatchMissing, routeIsOfficial } = context;
  return Boolean(${node.expression.getText(ast)});
`));
const match = { id: 'match-a', sourceGameId: 'up-a', sourceProvider: 'UNIQUE_PLAY', seasonId: 12 };
const detail = { provider: 'UNIQUE_PLAY', sourceGameId: 'up-a', seasonId: 12, syncRevision: 'revision', status: 'AVAILABLE' };
const context = {
  routeMatch: match, recordSource: { status: 'blocked' }, officialDetail: detail,
  useFirestoreLiveForOfficial: false, routeSelectionPending: false,
  officialDetailState: 'ready', routeMatchMissing: false, routeIsOfficial: true,
};
const evaluate = value => decisions.map(decision => decision(value, canUsePublishedOfficialDetail));

for (const status of ['blocked', 'loading']) {
  test(`actual page does not hide a valid official detail when metadata is ${status}`, () => {
    assert.deepEqual(evaluate({ ...context, recordSource: { status } }), [false, false]);
  });
}
test('actual page still blocks unknown live visibility when the official API failed', () => {
  assert.equal(evaluate({ ...context, officialDetail: null, officialDetailState: 'error' })[0], true);
});
test('actual page does not expose live fallback under blocked metadata', () => {
  assert.equal(evaluate({ ...context, useFirestoreLiveForOfficial: true })[0], true);
});
test('actual page retains loading while a new route is being selected', () => {
  assert.equal(evaluate({ ...context, routeSelectionPending: true })[1], true);
});
test('actual page cannot display a previous route response while metadata is blocked', () => {
  assert.equal(evaluate({ ...context, officialDetail: { ...detail, sourceGameId: 'up-old' } })[0], true);
});
test('actual page keeps the manual route publication guard', () => {
  assert.equal(evaluate({ ...context, routeMatch: { id: 'match-a' }, routeIsOfficial: false })[0], true);
});

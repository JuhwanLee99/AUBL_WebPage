import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { canUsePublishedOfficialDetail } from '../src/features/scoreboard/model/officialDetailRoute.ts';

const path = new URL('../src/features/scoreboard/pages/ScoreboardTextPage.tsx', import.meta.url);
const source = ts.createSourceFile(path.pathname, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const page = source.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === 'ScoreboardTextPage');
assert.ok(page?.body);
const guards = page.body.statements.filter(statement => ts.isIfStatement(statement) && statement.expression.getText(source).includes('recordSource.status'));
assert.equal(guards.length, 2);
const evaluate = guards.map(statement => new Function('context', 'canUsePublishedOfficialDetail', `
  const { routeMatch, recordSource, officialDetail, useFirestoreLiveForOfficial,
    routeSelectionPending, officialDetailState, routeMatchMissing, routeIsOfficial } = context;
  return Boolean(${statement.expression.getText(source)});
`));
const match = { id: 'up-loading-test', sourceGameId: 'up-loading-test', sourceProvider: 'UNIQUE_PLAY', seasonId: 12 };
const detail = { provider: 'UNIQUE_PLAY', sourceGameId: match.id, seasonId: 12, syncRevision: 'published', status: 'AVAILABLE' };
const pending = {
  routeMatch: match, recordSource: { status: 'blocked' }, officialDetail: null,
  useFirestoreLiveForOfficial: false, routeSelectionPending: false,
  officialDetailState: 'loading', routeMatchMissing: false, routeIsOfficial: true,
};
const visibility = context => evaluate.map(guard => guard(context, canUsePublishedOfficialDetail));

test('pending official request shows loading instead of publication failure', () => {
  assert.deepEqual(visibility(pending), [false, true]);
});
test('published response clears loading and publication failure', () => {
  assert.deepEqual(visibility({ ...pending, officialDetailState: 'loaded', officialDetail: detail }), [false, false]);
});
test('failed official request keeps publication failure without live fallback', () => {
  assert.deepEqual(visibility({ ...pending, officialDetailState: 'error' }), [true, false]);
});
test('pending official request does not authorize private live fallback', () => {
  assert.equal(visibility({ ...pending, useFirestoreLiveForOfficial: true })[0], true);
});
test('non-official route retains publication guard while a request is pending', () => {
  assert.equal(visibility({ ...pending, routeIsOfficial: false })[0], true);
});
test('null publication revision is denied without throwing', () => {
  assert.equal(canUsePublishedOfficialDetail(match, { ...detail, syncRevision: null }, false), false);
});
test('empty publication revision is denied', () => {
  assert.equal(canUsePublishedOfficialDetail(match, { ...detail, syncRevision: '' }, false), false);
});

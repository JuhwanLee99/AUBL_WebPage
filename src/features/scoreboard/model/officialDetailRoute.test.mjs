import assert from 'node:assert/strict';
import test from 'node:test';
import {
  currentResourceForKey,
  canUsePublishedOfficialDetail,
  findDetailRouteMatch,
  hasMatchingAublLiveRecord,
  isUniquePlayProvider,
  resolveOfficialRequestSource,
  shouldKeepFirestoreLive,
} from './officialDetailRoute.ts';

const uniquePlayMatch = {
  id: 'firestore-document-id',
  sourceGameId: 'up-2026-1001',
  sourceProvider: 'UNIQUE_PLAY',
  status: 'completed',
};

const publishedDetail = {
  provider: 'UNIQUE_PLAY', sourceGameId: uniquePlayMatch.sourceGameId,
  seasonId: 12, syncRevision: 'published-revision', status: 'AVAILABLE',
};

for (const status of ['AVAILABLE', 'NOT_PUBLISHED', 'NOT_COLLECTED', 'REVIEW_REQUIRED']) {
  test(`published backend ${status} can render independently without opening live data`, () => {
    assert.equal(canUsePublishedOfficialDetail(uniquePlayMatch, { ...publishedDetail, status }, false), true);
  });
}

for (const [name, match, detail, keepLive] of [
  ['missing schedule', null, publishedDetail, false],
  ['missing response', uniquePlayMatch, null, false],
  ['manual schedule', { id: uniquePlayMatch.id }, publishedDetail, false],
  ['other schedule provider', { ...uniquePlayMatch, sourceProvider: 'OTHER' }, publishedDetail, false],
  ['other response provider', uniquePlayMatch, { ...publishedDetail, provider: 'OTHER' }, false],
  ['response from another route', uniquePlayMatch, { ...publishedDetail, sourceGameId: 'up-other' }, false],
  ['missing published revision', uniquePlayMatch, { ...publishedDetail, syncRevision: ' ' }, false],
  ['another season', { ...uniquePlayMatch, seasonId: 13 }, publishedDetail, false],
  ['invalid season', uniquePlayMatch, { ...publishedDetail, seasonId: 0 }, false],
  ['unsupported status', uniquePlayMatch, { ...publishedDetail, status: 'DRAFT' }, false],
  ['live fallback requested', uniquePlayMatch, { ...publishedDetail, status: 'NOT_COLLECTED' }, true],
]) {
  test(`${name} cannot bypass the live publication guard`, () => {
    assert.equal(canUsePublishedOfficialDetail(match, detail, keepLive), false);
  });
}

test('an explicit source route without a separate source ID still requires exact identity', () => {
  const match = { id: publishedDetail.sourceGameId, sourceProvider: 'UNIQUE_PLAY', seasonId: 12 };
  assert.equal(canUsePublishedOfficialDetail(match, publishedDetail, false), true);
  assert.equal(canUsePublishedOfficialDetail({ ...match, id: 'different' }, publishedDetail, false), false);
});

test('resolves a UniquePlay projection by either document ID or source ID', () => {
  assert.equal(findDetailRouteMatch([uniquePlayMatch], 'firestore-document-id'), uniquePlayMatch);
  assert.equal(findDetailRouteMatch([uniquePlayMatch], 'up-2026-1001'), uniquePlayMatch);
  assert.equal(resolveOfficialRequestSource('firestore-document-id', uniquePlayMatch), 'up-2026-1001');
});

test('does not classify another source provider as UniquePlay', () => {
  const otherProvider = { ...uniquePlayMatch, sourceProvider: 'OTHER_PROVIDER' };
  assert.equal(isUniquePlayProvider('UNIQUE_PLAY'), true);
  assert.equal(isUniquePlayProvider('UNIQUEPLAY'), false);
  assert.equal(isUniquePlayProvider(otherProvider.sourceProvider), false);
  assert.equal(resolveOfficialRequestSource(otherProvider.id, otherProvider), otherProvider.id);
});

test('document identity wins collisions and unrelated provider source IDs are not claimed', () => {
  const manual = { id: uniquePlayMatch.sourceGameId, status: 'completed' };
  assert.equal(findDetailRouteMatch([uniquePlayMatch, manual], manual.id), manual);
  assert.equal(findDetailRouteMatch([{ ...uniquePlayMatch, sourceProvider: 'OTHER_PROVIDER' }], uniquePlayMatch.sourceGameId), null);
});

test('an unmatched source route remains unmatched instead of selecting another active game', () => {
  assert.equal(findDetailRouteMatch([uniquePlayMatch], 'up-missing'), null);
  assert.equal(resolveOfficialRequestSource('up-missing', null), 'up-missing');
});

test('a response from route A cannot be selected for route B', () => {
  const routeAResource = { requestKey: 'up-a\u00002026\u00000', payload: { sourceGameId: 'up-a' } };
  assert.equal(currentResourceForKey(routeAResource, routeAResource.requestKey), routeAResource);
  assert.equal(currentResourceForKey(routeAResource, 'up-b\u00002026\u00000'), null);
});

test('only a matching in-progress game with an explicit not-collected response keeps live Firestore UI', () => {
  assert.equal(shouldKeepFirestoreLive('inProgress', 'NOT_COLLECTED', 'IN_PROGRESS', true), true);
  assert.equal(shouldKeepFirestoreLive('inProgress', 'NOT_COLLECTED', 'SCHEDULED', true), true);
  assert.equal(shouldKeepFirestoreLive('completed', 'NOT_COLLECTED', 'IN_PROGRESS', true), false);
  assert.equal(shouldKeepFirestoreLive('inProgress', 'NOT_COLLECTED', 'COMPLETED', true), false);
  assert.equal(shouldKeepFirestoreLive('inProgress', 'NOT_COLLECTED', null, true), false);
  assert.equal(shouldKeepFirestoreLive('inProgress', 'NOT_PUBLISHED', 'IN_PROGRESS', true), false);
  assert.equal(shouldKeepFirestoreLive('inProgress', 'REVIEW_REQUIRED', 'IN_PROGRESS', true), false);
  assert.equal(shouldKeepFirestoreLive('inProgress', 'AVAILABLE', 'IN_PROGRESS', true), false);
  assert.equal(shouldKeepFirestoreLive('inProgress', 'NOT_COLLECTED', 'IN_PROGRESS', false), false);
  assert.equal(shouldKeepFirestoreLive('inProgress', 'NOT_COLLECTED', 'IN_PROGRESS'), false);
});

test('AUBL live default requires actual recording in the selected game, not a status or another game', () => {
  const state = { activeMatchId: uniquePlayMatch.id, gameStarted: false, eventCount: 0 };
  assert.equal(hasMatchingAublLiveRecord(uniquePlayMatch, state), false);
  assert.equal(hasMatchingAublLiveRecord(uniquePlayMatch, { ...state, gameStarted: true }), true);
  assert.equal(hasMatchingAublLiveRecord(uniquePlayMatch, { ...state, eventCount: 1 }), true);
  assert.equal(hasMatchingAublLiveRecord(uniquePlayMatch, { ...state, activeMatchId: 'other-game', gameStarted: true }), false);
  assert.equal(hasMatchingAublLiveRecord({ ...uniquePlayMatch, scoreInputMode: 'manual' }, { ...state, gameStarted: true, eventCount: 20 }), false);
  assert.equal(hasMatchingAublLiveRecord(null, { ...state, gameStarted: true }), false);
});

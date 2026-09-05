import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGameRecordReview } from './gameRecordReview.ts';

function reviewTeam(overrides = {}) {
  return {
    teamName: '테스트 팀',
    totals: { runs: 3, hits: 4 },
    innings: [
      { inning: 1, runs: 1, notPlayed: false },
      { inning: 2, runs: 0, notPlayed: false },
      { inning: 3, runs: 2, notPlayed: false },
    ],
    batters: [
      { playerName: '타자 1', stats: { runs: 1, hits: 1 } },
      { playerName: '타자 2', stats: { runs: 2, hits: 3 } },
    ],
    ...overrides,
  };
}

function build(team, providerGameId = '12345') {
  return buildGameRecordReview([
    { field: 'providerGameId', sourceValue: providerGameId },
    { field: 'status', sourceValue: 'AVAILABLE' },
    { field: 'teams', sourceValue: [team, reviewTeam({ teamName: '상대 팀' })] },
  ]);
}

test('accepts exact batter R/H sums and an exact numeric inning sum', () => {
  const review = build(reviewTeam());

  assert.equal(review.providerGameId, '12345');
  assert.equal(review.providerUrl, 'https://unique-play.com/game/12345/boxscore');
  assert.equal(review.status, 'AVAILABLE');
  assert.equal(review.comparisonAvailable, true);
  assert.equal(review.structureUnavailable, false);
  assert.equal(review.mismatchCount, 0);
  assert.deepEqual(review.teams[0], {
    teamName: '테스트 팀',
    teamRuns: 3,
    teamHits: 4,
    batterRuns: 3,
    batterHits: 4,
    inningRuns: 3,
    inningCount: 3,
    unknownInningCount: 0,
    notPlayedInningCount: 0,
    mismatches: [],
  });
});

test('reports R, H, and known-inning totals independently', () => {
  const review = build(reviewTeam({
    totals: { runs: 5, hits: 6 },
  }));
  const team = review.teams[0];

  assert.equal(team.batterRuns, 3);
  assert.equal(team.batterHits, 4);
  assert.equal(team.inningRuns, 3);
  assert.deepEqual(
    team.mismatches.map(({ code, metric }) => [code, metric]),
    [
      ['DETAIL_LINE_SCORE', 'RUNS'],
      ['DETAIL_BATTER_TOTAL', 'RUNS'],
      ['DETAIL_BATTER_TOTAL', 'HITS'],
    ],
  );
  assert.equal(review.mismatchCount, 3);
});

test('identifies a source batter-run discrepancy even when the inning line is exact', () => {
  const batterRuns = [0, 0, 2, 2, 1, 0, 1, 0, 0, 0];
  const review = build(reviewTeam({
    totals: { runs: 12, hits: 0 },
    innings: [
      { inning: 1, runs: 3, notPlayed: false },
      { inning: 2, runs: 0, notPlayed: false },
      { inning: 3, runs: 4, notPlayed: false },
      { inning: 4, runs: 5, notPlayed: false },
    ],
    batters: batterRuns.map((runs) => ({ stats: { runs, hits: 0 } })),
  }), '56262');
  const team = review.teams[0];

  assert.equal(team.inningRuns, 12);
  assert.equal(team.batterRuns, 6);
  assert.deepEqual(
    team.mismatches.map(({ code, metric }) => [code, metric]),
    [['DETAIL_BATTER_TOTAL', 'RUNS']],
  );
});

test('keeps a null played inning unknown and defers line-score equality', () => {
  const review = build(reviewTeam({
    totals: { runs: 9, hits: 4 },
    batters: [{ stats: { runs: 9, hits: 4 } }],
    innings: [
      { inning: 1, runs: 1, notPlayed: false },
      { inning: 2, runs: null, notPlayed: false },
      { inning: 3, runs: 2, notPlayed: false },
    ],
  }));
  const team = review.teams[0];

  assert.equal(team.inningRuns, 3);
  assert.equal(team.unknownInningCount, 1);
  assert.equal(team.notPlayedInningCount, 0);
  assert.equal(team.mismatches.some(({ code }) => code === 'DETAIL_LINE_SCORE'), false);
  assert.equal(review.mismatchCount, 0);
});

test('does not invent zero when any individual stat is null', () => {
  const review = build(reviewTeam({
    batters: [{ stats: { runs: null, hits: 4 } }],
  }));
  assert.equal(review.teams[0].batterRuns, null);
  assert.equal(review.teams[0].batterHits, 4);
  assert.equal(review.teams[0].mismatches.length, 0);
});

test('reports an entirely blank line score even for a zero-run team', () => {
  const review = build(reviewTeam({
    totals: { runs: 0, hits: 0 },
    batters: [{ stats: { runs: 0, hits: 0 } }],
    innings: Array.from({ length: 7 }, (_, i) => ({ inning: i + 1, runs: null, notPlayed: false })),
  }));
  assert.equal(review.teams[0].unknownInningCount, 7);
  assert.equal(review.teams[0].mismatches[0].code, 'DETAIL_LINE_SCORE');
  assert.equal(review.mismatchCount, 1);
});

test('counts an X as not played without treating it as an unknown inning', () => {
  const review = build(reviewTeam({
    totals: { runs: 2, hits: 4 },
    batters: [{ stats: { runs: 2, hits: 4 } }],
    innings: [
      { inning: 1, runs: 1, notPlayed: false },
      { inning: 2, runs: null, notPlayed: true },
    ],
  }));
  const team = review.teams[0];

  assert.equal(team.inningRuns, 1);
  assert.equal(team.unknownInningCount, 0);
  assert.equal(team.notPlayedInningCount, 1);
  assert.deepEqual(
    team.mismatches.map(({ code, metric }) => [code, metric]),
    [['DETAIL_LINE_SCORE', 'RUNS']],
  );
});

test('rejects an all-X line score even when the team total is zero', () => {
  const review = build(reviewTeam({
    totals: { runs: 0, hits: 0 },
    batters: [{ stats: { runs: 0, hits: 0 } }],
    innings: [
      { inning: 1, runs: null, notPlayed: true },
      { inning: 2, runs: null, notPlayed: true },
    ],
  }));
  const team = review.teams[0];

  assert.equal(team.inningRuns, 0);
  assert.equal(team.unknownInningCount, 0);
  assert.equal(team.notPlayedInningCount, 2);
  assert.deepEqual(
    team.mismatches.map(({ code, metric }) => [code, metric]),
    [['DETAIL_LINE_SCORE', 'RUNS']],
  );
  assert.match(team.mismatches[0].message, /숫자로 확인된 이닝 득점이 없습니다/u);
});

test('fails closed for unsafe public fields and provider identifiers', () => {
  const secret = 'do-not-publish';
  const unsafeNames = [
    '',
    '<script>alert(1)</script>',
    'owner@example.invalid',
    '010-1234-5678',
    `제어\u0000문자`,
    '가'.repeat(161),
  ];

  for (const teamName of unsafeNames) {
    const review = build({
      ...reviewTeam({ teamName }),
      privateNote: secret,
      contactEmail: 'owner@example.invalid',
    }, `12345/boxscore?token=${secret}`);

    assert.equal(review.providerGameId, null);
    assert.equal(review.providerUrl, null);
    assert.equal(review.teams[0].teamName, '팀명 확인 필요');
    assert.equal(JSON.stringify(review).includes(secret), false);
    assert.equal(JSON.stringify(review).includes('owner@example.invalid'), false);
    assert.deepEqual(Object.keys(review.teams[0]).sort(), [
      'batterHits',
      'batterRuns',
      'inningCount',
      'inningRuns',
      'mismatches',
      'notPlayedInningCount',
      'teamHits',
      'teamName',
      'teamRuns',
      'unknownInningCount',
    ]);
  }
});

test('treats a declared not-published empty detail as intentionally skipped', () => {
  const review = buildGameRecordReview([
    { field: 'providerGameId', sourceValue: '56262' },
    { field: 'status', sourceValue: 'NOT_PUBLISHED' },
    { field: 'teams', sourceValue: [] },
  ]);

  assert.equal(review.status, 'NOT_PUBLISHED');
  assert.equal(review.comparisonAvailable, true);
  assert.equal(review.structureUnavailable, false);
  assert.equal(review.mismatchCount, 0);
  assert.deepEqual(review.teams, []);
});

test('requires exactly two public teams for an available detail', () => {
  const review = buildGameRecordReview([
    { field: 'providerGameId', sourceValue: '56262' },
    { field: 'status', sourceValue: 'AVAILABLE' },
    { field: 'teams', sourceValue: [reviewTeam()] },
  ]);

  assert.equal(review.structureUnavailable, true);
});

test('does not label an unchanged omitted teams field as malformed source data', () => {
  const review = buildGameRecordReview([]);

  assert.equal(review.comparisonAvailable, false);
  assert.equal(review.structureUnavailable, false);
  assert.equal(review.mismatchCount, 0);
});

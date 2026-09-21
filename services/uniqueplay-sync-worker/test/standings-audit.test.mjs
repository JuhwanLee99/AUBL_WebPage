import assert from 'node:assert/strict';
import { test } from 'node:test';
import { auditStandings } from '../src/standings-audit.mjs';

// Observed public overview: revision 291109ef, 2026-09-13 KST. Not a newly collected candidate.
const published = [
  { teamName: '고려대학교 백구회', rank: 1, wins: 5, losses: 1, draws: 1 },
  { teamName: '동국대학교 LAE', rank: 1, wins: 4, losses: 1, draws: 2 },
  { teamName: '한양대ERICA HIBA', rank: 1, wins: 3, losses: 1, draws: 1 },
  { teamName: '경희대학교(서울) BRAVES', rank: 1, wins: 1, losses: 5, draws: 0 },
  { teamName: '서경대학교 적시타', rank: 1, wins: 1, losses: 6, draws: 0 },
];
test('observed A-group publication has ten unequal-win-rate tied pairs', () => {
  const before = structuredClone(published);
  assert.equal(auditStandings(published).filter(x => x.code === 'RANK_TIE_WITH_DIFFERENT_WIN_RATE').length, 10);
  assert.deepEqual(published, before, 'diagnostic cannot rewrite official standings');
});
test('observed current source permits only the top two equal-rate teams to share rank one', () => {
  const source = [
    { teamName: '동국대학교 L.A.E', rank: 1, wins: 5, losses: 1, draws: 2 },
    { teamName: '고려대학교 백구회', rank: 1, wins: 5, losses: 1, draws: 1 },
    { teamName: '한양대학교 에리카 HIBA', rank: 3, wins: 3, losses: 2, draws: 1 },
    { ...published[3], rank: 4 }, { ...published[4], rank: 5 },
  ];
  assert.deepEqual(auditStandings(source), []);
});
test('equal rounded percentages are not proof of an exact tie', () => {
  assert.equal(auditStandings([{ rank: 1, wins: 83, losses: 17 }, { rank: 1, wins: 5, losses: 1 }]).length, 1);
});
test('draw count does not split a true win-percentage tie', () => {
  assert.deepEqual(auditStandings([{ rank: 1, wins: 2, losses: 1, draws: 0 }, { rank: 1, wins: 4, losses: 2, draws: 3 }]), []);
});
test('inverted rank is reported without automatically applying a tiebreak', () => {
  assert.equal(auditStandings([{ rank: 2, wins: 3, losses: 0 }, { rank: 1, wins: 1, losses: 2 }])[0].code, 'RANK_WIN_RATE_ORDER_CONFLICT');
});
test('invalid ranks are reported', () => assert.equal(auditStandings([{ rank: 0, wins: 1, losses: 0 }])[0].code, 'INVALID_RANK'));

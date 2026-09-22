import assert from 'node:assert/strict';
import test from 'node:test';
import { createTournament, validateTournament, entrants, entrantLabel, updateMatch, swapSeed, scheduleLabel, DIVISIONS, ROUNDS } from '../src/features/tournament/model.ts';

const expected = {
  eutteum: ['D2', 'G1', 'H2', 'F1', 'E2', 'H1', 'F2', 'B1', 'G2', 'E1', 'A2', 'C1', 'C2', 'D1', 'B2', 'A1'],
  beogeum: ['D4', 'B3', 'E4', 'H3', 'C4', 'D3', 'G4', 'F3', 'F4', 'A3', 'A4', 'E3', 'B4', 'C3', 'H4', 'G3'],
};
function finish(division, id, side = 0) {
  const match = division.matches.find(item => item.id === id);
  const pair = entrants(division, match);
  return updateMatch(division, id, { status: 'completed', scores: side ? [1, 3] : [3, 1], winner: pair[side] });
}

test('default is an unpublished-safe preview using groups as home default', () => {
  const config = createTournament(); validateTournament(config);
  assert.equal(config.phase, 'preview'); assert.equal(config.homeDefault, 'groups');
});
for (const key of DIVISIONS) {
  test(`${key}: all 16 image slots match independent expected order`, () => {
    const division = createTournament().divisions[key];
    assert.deepEqual(division.seeds, expected[key]); assert.equal(new Set(division.seeds).size, 16);
    assert.deepEqual(ROUNDS.map(round => division.matches.filter(match => match.round === round).length), [8, 4, 2, 1]);
  });
  for (let index = 0; index < 8; index++) test(`${key}: round of 16 pair ${index + 1}`, () => {
    const division = createTournament().divisions[key];
    assert.deepEqual(entrants(division, division.matches[index]), expected[key].slice(index * 2, index * 2 + 2));
  });
  test(`${key}: full bracket advances independently to the correct final`, () => {
    const config = createTournament(); let division = config.divisions[key];
    for (const round of ROUNDS) for (const match of division.matches.filter(item => item.round === round)) {
      division = finish(division, match.id);
      config.divisions[key] = division; validateTournament(config);
    }
    const final = division.matches.find(match => match.round === 'final');
    assert.deepEqual(entrants(division, final), [expected[key][0], expected[key][8]]);
    assert.equal(final.winner, expected[key][0]);
  });
  test(`${key}: corrections reset only affected descendants and retain schedules`, () => {
    let division = createTournament().divisions[key];
    division.matches.forEach(match => { match.startTime = '2026-10-10T14:00:00+09:00'; match.venue = '테스트 구장'; });
    for (const match of division.matches) division = finish(division, match.id);
    const before = structuredClone(division);
    const changed = finish(division, `${key}-r16-1`, 1);
    assert.deepEqual(division, before);
    for (const id of [`${key}-qf-1`, `${key}-sf-1`, `${key}-final-1`]) {
      const match = changed.matches.find(item => item.id === id);
      assert.equal(match.winner, ''); assert.deepEqual(match.scores, [null, null]); assert.equal(match.status, 'scheduled');
      assert.equal(match.startTime, '2026-10-10T14:00:00+09:00'); assert.equal(match.venue, '테스트 구장');
    }
    assert.equal(changed.matches.find(item => item.id === `${key}-sf-2`).winner, expected[key][8]);
  });
  test(`${key}: same winner score correction preserves later rounds`, () => {
    let division = createTournament().divisions[key];
    for (const match of division.matches) division = finish(division, match.id);
    const changed = updateMatch(division, `${key}-r16-1`, { scores: [9, 1] });
    assert.equal(changed.matches.at(-1).winner, division.matches.at(-1).winner);
  });
  test(`${key}: seed swap is immutable, preserves uniqueness, clears results`, () => {
    const division = finish(createTournament().divisions[key], `${key}-r16-1`);
    division.matches[0].venue = '유지할 구장';
    const changed = swapSeed(division, 0, division.seeds[9]);
    assert.equal(changed.seeds[0], expected[key][9]); assert.equal(changed.seeds[9], expected[key][0]);
    assert.equal(new Set(changed.seeds).size, 16); assert.equal(division.seeds[0], expected[key][0]);
    assert.ok(changed.matches.every(match => !match.winner && match.scores.every(score => score === null)));
    assert.equal(changed.matches[0].venue, '유지할 구장');
  });
}
const invalid = [
  ['wrong season', c => c.season = 2025], ['unknown version', c => c.schemaVersion = 2],
  ['wrong phase', c => c.phase = 'public'], ['wrong home default', c => c.homeDefault = 'other'],
  ['oversized note', c => c.note = 'x'.repeat(1001)], ['duplicate seed', c => c.divisions.eutteum.seeds[1] = 'D2'],
  ['wrong bucket seed', c => c.divisions.eutteum.seeds[0] = 'D4'], ['missing seed', c => c.divisions.beogeum.seeds.pop()],
  ['unknown team key', c => c.divisions.eutteum.teamNames.X1 = '팀'],
  ['duplicate normalized team', c => { c.divisions.eutteum.teamNames.D2 = '테스트 팀'; c.divisions.beogeum.teamNames.D4 = '테스트팀'; }],
  ['oversized team name', c => c.divisions.eutteum.teamNames.D2 = 'x'.repeat(101)],
  ['missing game', c => c.divisions.eutteum.matches.pop()],
  ['duplicate game index', c => c.divisions.eutteum.matches[1] = structuredClone(c.divisions.eutteum.matches[0])],
  ['wrong game id', c => c.divisions.eutteum.matches[0].id = 'other'],
  ['wrong status', c => c.divisions.eutteum.matches[0].status = 'unknown'],
  ['negative score', c => c.divisions.eutteum.matches[0].scores = [-1, 0]],
  ['fraction score', c => c.divisions.eutteum.matches[0].scores = [1.5, 0]],
  ['oversized score', c => c.divisions.eutteum.matches[0].scores = [1000, 0]],
  ['NaN score', c => c.divisions.eutteum.matches[0].scores = [NaN, 0]],
  ['invalid score tuple', c => c.divisions.eutteum.matches[0].scores = [1]],
  ['non-completed winner', c => c.divisions.eutteum.matches[0].winner = 'D2'],
  ['missing completed scores', c => { c.divisions.eutteum.matches[0].status = 'completed'; c.divisions.eutteum.matches[0].winner = 'D2'; }],
  ['tied completed game', c => { Object.assign(c.divisions.eutteum.matches[0], { status: 'completed', scores: [1, 1], winner: 'D2' }); }],
  ['incorrect winner', c => { Object.assign(c.divisions.eutteum.matches[0], { status: 'completed', scores: [1, 3], winner: 'D2' }); }],
  ['unresolved future score', c => c.divisions.eutteum.matches[8].scores = [1, null]],
  ['unresolved live game', c => c.divisions.eutteum.matches[8].status = 'live'],
  ['invalid timestamp', c => c.divisions.eutteum.matches[0].startTime = 'not-a-date'],
  ['wrong timezone', c => c.divisions.eutteum.matches[0].startTime = '2026-10-10T12:00:00Z'],
  ['wrong schedule year', c => c.divisions.eutteum.matches[0].startTime = '2027-01-01T12:00:00+09:00'],
  ['impossible calendar day', c => c.divisions.eutteum.matches[0].startTime = '2026-02-30T12:00:00+09:00'],
  ...[
    '2026-02-29T12:00:00+09:00',
    '2026-04-31T12:00:00+09:00',
    '2026-06-31T12:00:00+09:00',
    '2026-00-10T12:00:00+09:00',
    '2026-13-10T12:00:00+09:00',
    '2026-01-00T12:00:00+09:00',
    '2026-01-32T12:00:00+09:00',
    '2026-10-10T24:00:00+09:00',
    '2026-12-31T24:00:00+09:00',
    '2026-10-10T12:60:00+09:00',
    '2024-02-29T12:00:00+09:00',
  ].map(value => [`invalid KST calendar ${value}`, c => c.divisions.eutteum.matches[0].startTime = value]),
];
for (const [name, mutate] of invalid) test(`reject ${name}`, () => {
  const config = createTournament(); mutate(config); assert.throws(() => validateTournament(config));
});
test('unknown final entrants are not guessed from standings', () => {
  const division = createTournament().divisions.eutteum;
  assert.deepEqual(entrants(division, division.matches.at(-1)), [null, null]);
  assert.equal(entrantLabel(division, 'D2'), 'D조 2위'); assert.equal(entrantLabel(division, null), '이전 경기 승자');
});
test('new drafts do not share arrays or mutable match data', () => {
  const a = createTournament(); a.divisions.eutteum.seeds[0] = 'changed'; a.divisions.beogeum.matches[0].scores[0] = 4;
  const b = createTournament(); assert.equal(b.divisions.eutteum.seeds[0], 'D2'); assert.equal(b.divisions.beogeum.matches[0].scores[0], null);
});
test('KST schedule display and empty schedule', () => {
  assert.equal(scheduleLabel(''), '일정 미정'); assert.match(scheduleLabel('2026-10-10T14:00:00+09:00'), /14:00/);
});
for (const value of [
  '',
  '2026-01-01T00:00:00+09:00',
  '2026-02-28T00:00:00+09:00',
  '2026-02-28T23:59:00+09:00',
  '2026-03-01T00:00:00+09:00',
  '2026-04-30T23:59:00+09:00',
  '2026-10-10T14:00:00+09:00',
  '2026-12-31T23:59:00+09:00',
]) test(`accept valid KST calendar ${value || '(unscheduled)'}`, () => {
  const config = createTournament(); config.divisions.eutteum.matches[0].startTime = value;
  assert.doesNotThrow(() => validateTournament(config));
});

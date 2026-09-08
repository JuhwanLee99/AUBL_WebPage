// Independent expected outcomes. These fixtures never call the scoring engine.
import { extendedScenarios } from './extended-scenarios.mjs';
export { guardScenarios } from './extended-scenarios.mjs';
const move = (runner, from, to, cause, extra = {}) => ({ runner, from, to, cause, ...extra });
const err = (fielder, kind = 'throwing') => ({ fielder, kind, note: 'E2E 독립 수비 행위' });
export const scenarios = [
  {
    id: 'R01', title: '단타 뒤 연속 두 실책으로 타자주자 홈 도달', plate: 'single', pitch: 'in_play',
    errors: [err('6'), err('3')], moves: [move('B', 'batter', 0, 'hit'), move('B', 0, 1, 'error', { error: 0 }), move('B', 1, 'home', 'error', { error: 1 })],
    expected: { runs: 1, outs: 0, hits: 1, errors: 2, bases: [null, null, null], announce: '1루타', batters: { B: { pa: 1, ab: 1, h: 1, r: 1, rbi: 0 } }, pitchers: { P: { bf: 1, h: 1, r: 1, outs: 0 } } },
  },
  {
    id: 'R02', title: 'FC 선행주자 아웃 뒤 실책 진루와 승계 책임투수', context: { bases: ['A', null, null] }, plate: 'fc', pitch: 'in_play',
    errors: [err('6')], responsibility: { pitcher: 'P0', reason: '선행주자를 대체한 주자의 책임을 기록원 확정' },
    moves: [move('A', 0, 'out', 'fc', { outKind: 'force', putout: '4', assists: '6' }), move('B', 'batter', 0, 'fc'), move('B', 0, 1, 'error', { error: 0 })],
    expected: { runs: 0, outs: 1, hits: 0, errors: 1, bases: [null, 'B', null], owner: { base: 1, pitcher: 'P0' }, announce: '야수선택', batters: { B: { pa: 1, ab: 1, fc: 1, h: 0 } }, pitchers: { P: { bf: 1, outs: 1 } } },
  },
  {
    id: 'R03', title: '낫아웃 포일 출루 뒤 포수 악송구로 추가 진루', context: { strikes: 2 }, plate: 'so_reach', pitch: 'strike', misc: 'pb',
    errors: [err('2')], moves: [move('B', 'batter', 0, 'pb'), move('B', 0, 1, 'error', { error: 0 })],
    expected: { runs: 0, outs: 0, hits: 0, errors: 1, bases: [null, 'B', null], announce: '낫아웃 출루', batters: { B: { pa: 1, ab: 1, so: 1 } }, pitchers: { P: { bf: 1, so: 1, outs: 0, wp: 0 } } },
  },
  {
    id: 'R04', title: '세 주체가 서로 다른 경로로 아웃되는 트리플플레이', context: { bases: ['A', 'C', null] }, plate: 'out', pitch: 'in_play',
    moves: [move('C', 1, 'out', 'fc', { outKind: 'force', putout: '5', assists: '6' }), move('A', 0, 'out', 'fc', { outKind: 'force', putout: '4', assists: '5' }), move('B', 'batter', 'out', 'out', { outKind: 'batter_before_first', putout: '3', assists: '4' })],
    expected: { runs: 0, outs: 3, hits: 0, errors: 0, bases: [null, null, null], announce: '타자 아웃', batters: { B: { pa: 1, ab: 1 } }, pitchers: { P: { bf: 1, outs: 3 } }, fielding: { '5': { putouts: 1, assists: 1 }, '4': { putouts: 1, assists: 1 }, '3': { putouts: 1 } } },
  },
  {
    id: 'R05', title: '선행주자 홈 도달 후 유리한 제4아웃 어필로 득점 취소', context: { outs: 2, bases: ['A', null, 'C'] }, plate: 'none', pitch: 'none', ruling: { kind: 'appeal', rule: '5.08(a), 5.09(c) 심판 확정', choice: 'award' },
    moves: [move('C', 2, 'home', 'advance'), move('A', 0, 'out', 'out', { outKind: 'tag', putout: '4' }), move('C', 'home', 'out', 'appeal', { outKind: 'appeal_time', putout: '5', advantageousAppeal: true })],
    expected: { runs: 0, outs: 1, hits: 0, errors: 0, bases: [null, null, null], announce: '타석 계속', batters: { B: { pa: 0 }, C: { r: 0 } }, pitchers: { P: { bf: 0, outs: 1 } }, fielding: { '5': { putouts: 1 } } },
  },
  {
    id: 'R06', title: '득점 직후 낫아웃 타자주자 1루 도달 전 태그 제3아웃', context: { outs: 2, strikes: 2, bases: [null, null, 'C'] }, plate: 'so_out', pitch: 'strike',
    moves: [move('C', 2, 'home', 'advance'), move('B', 'batter', 'out', 'out', { outKind: 'tag', putout: '2' })],
    expected: { runs: 0, outs: 1, hits: 0, errors: 0, bases: [null, null, null], announce: '낫아웃 실패', batters: { B: { pa: 1, ab: 1, so: 1 }, C: { r: 0 } }, pitchers: { P: { bf: 1, so: 1, outs: 1 } } },
  },
  {
    id: 'R07', title: '잡았어도 득점했을 희생플라이와 낙구 실책의 병존', context: { bases: [null, null, 'C'] }, plate: 'sf', pitch: 'in_play',
    errors: [err('7', 'fielding')], moves: [move('C', 2, 'home', 'advance', { rbi: true }), move('B', 'batter', 0, 'error', { error: 0 })],
    expected: { runs: 1, outs: 0, hits: 0, errors: 1, bases: ['B', null, null], announce: '희생플라이', batters: { B: { pa: 1, ab: 0, sf: 1, sac: 1, rbi: 1 }, C: { r: 1 } }, pitchers: { P: { bf: 1, sf: 1 }, P0: { r: 1 } } },
  },
  {
    id: 'R08', title: '한 번의 실책에 연결된 두 주자의 서로 다른 추가 진루', context: { bases: ['A', null, null] }, plate: 'single', pitch: 'in_play',
    errors: [err('8')], moves: [move('A', 0, 1, 'hit'), move('B', 'batter', 0, 'hit'), move('A', 1, 'home', 'error', { error: 0 }), move('B', 0, 1, 'error', { error: 0 })],
    expected: { runs: 1, outs: 0, hits: 1, errors: 1, bases: [null, 'B', null], announce: '1루타', batters: { B: { pa: 1, h: 1, rbi: 0 }, A: { r: 1 } }, pitchers: { P: { bf: 1, h: 1 }, P0: { r: 1 } } },
  },
  {
    id: 'R09', title: '낫아웃 출루 후 추가 진루 태그 제3아웃과 선행 득점', context: { outs: 2, strikes: 2, bases: [null, null, 'C'] }, plate: 'so_reach', pitch: 'strike',
    moves: [move('B', 'batter', 0, 'advance'), move('C', 2, 'home', 'advance'), move('B', 0, 'out', 'out', { outKind: 'tag', putout: '4', assists: '3' })],
    expected: { runs: 1, outs: 1, hits: 0, errors: 0, bases: [null, null, null], announce: '낫아웃 출루', batters: { B: { pa: 1, ab: 1, so: 1, rbi: 0 }, C: { r: 1 } }, pitchers: { P: { bf: 1, so: 1, outs: 1 }, P0: { r: 1 } } },
  },
  {
    id: 'R10', title: '홈스틸 포함 더블스틸 뒤 포수 송구 실책', context: { bases: ['A', null, 'C'] }, plate: 'none', pitch: 'none',
    errors: [err('2')], moves: [move('C', 2, 'home', 'steal'), move('A', 0, 1, 'steal'), move('A', 1, 2, 'error', { error: 0 })],
    expected: { runs: 1, outs: 0, hits: 0, errors: 1, bases: [null, null, 'A'], announce: '타석 계속', batters: { B: { pa: 0 }, A: { sb: 1 }, C: { sb: 1, r: 1 } }, pitchers: { P0: { r: 1 } } },
  },
  {
    id: 'R11', title: '견제 런다운 중 진루와 귀루 후 아웃 및 중복 보살 경로', context: { bases: ['A', null, null] }, plate: 'none', pitch: 'none',
    moves: [move('A', 0, 1, 'advance'), move('A', 1, 0, 'return'), move('A', 0, 'out', 'pickoff', { outKind: 'tag', putout: '3', assists: '1,6,3,6' })],
    expected: { runs: 0, outs: 1, hits: 0, errors: 0, bases: [null, null, null], announce: '타석 계속', batters: { B: { pa: 0 } }, pitchers: { P: { bf: 0, outs: 1, pitches: 0 } }, fielding: { '3': { putouts: 1, assists: 1 }, '6': { assists: 1 } } },
  },
  {
    id: 'R12', title: '선언 고의4구 만루 밀어내기와 실제 투구수 0', context: { bases: ['A', 'D', 'C'] }, plate: 'ibb', pitch: 'none',
    moves: [move('C', 2, 'home', 'award', { rbi: true }), move('D', 1, 2, 'award'), move('A', 0, 1, 'award'), move('B', 'batter', 0, 'award')],
    expected: { runs: 1, outs: 0, hits: 0, errors: 0, bases: ['B', 'A', 'D'], announce: '고의4구', batters: { B: { pa: 1, bb: 1, ab: 0, rbi: 1 }, C: { r: 1 } }, pitchers: { P: { bf: 1, bb: 1, pitches: 0 }, P0: { r: 1 } } },
  },
];

scenarios.push(...extendedScenarios);

export function makeFixture(initialState, scenario) {
  const player = (name, pos) => ({ name, pos, number: '', throws: 'R', bats: 'R' });
  const positions = ['CF', 'SS', 'LF', '1B', 'C', '2B', '3B', 'RF', 'DH'];
  const lineup = names => names.map((name, i) => player(name, positions[i]));
  const matchId = `LOCAL_E2E_ONLY_${scenario.id}`;
  return { ...initialState, ...scenario.context, gameStarted: true, gameOver: false, activeMatchId: matchId,
    scorerUid: 'LOCAL_E2E_SCORER', scorerLockedAt: Date.now(), scorerPaused: false,
    lineups: { away: [...lineup(['B', 'A', 'C', 'D', 'E', 'F', 'G', 'H', 'I']), player('AP', 'P')], home: [...lineup(['HB', 'HA', 'HC', 'HD', 'HE', 'HF', 'HG', 'HH', 'HI']), player('P', 'P')] },
    benches: { home: [], away: [] }, removed: { home: [player('P0', 'P')], away: [] },
    runnerResponsiblePitcher: { 0: 'P0', 1: 'P0', 2: 'P0' },
    feed: [], events: [], history: [], futureHistory: [], scoringRejections: [],
    matches: [{ id: matchId, homeTeamName: 'LOCAL TEST HOME', awayTeamName: 'LOCAL TEST AWAY', status: 'inProgress', recordMode: 'official', startTime: '2026-09-08T00:00:00Z', venue: 'OFFLINE E2E', homeScore: 0, awayScore: 0 }],
  };
}

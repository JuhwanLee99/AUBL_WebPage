import { kboAuditScenarios } from './kbo-audit-scenarios.mjs';
// Independent rule expectations, not values derived from the scoring engine.
const move = (runner, from, to, cause = 'advance', extra = {}) => ({ runner, from, to, cause, ...extra });
const out = (runner, from, outKind, putout = '3') => move(runner, from, 'out', 'out', { outKind, putout });
const ruling = (kind, rule) => ({ kind, rule, choice: 'play' });
const forceReleaseMoves = [out('B', 'batter', 'batter_before_first'), move('C', 2, 'home'), out('A', 0, 'tag', '4')];
const walkMoves = [move('D', 1, 2, 'award'), move('A', 0, 1, 'award'), move('B', 'batter', 0, 'award'),
  out('D', 2, 'tag', '2'), move('C', 2, 'home', 'award', { rbi: true })];
export const readinessScenarios = [
  { id: 'Q01', title: '타자주자 아웃으로 포스 해제 후 태그 제3아웃: 선행 득점 유효',
    rule: '5.09(b)(6), 5.08(a)', context: { outs: 1, bases: ['A', null, 'C'] }, plate: 'out', pitch: 'in_play',
    moves: forceReleaseMoves, expected: { runs: 1, outs: 2, batters: { C: { r: 1 } } } },
  { id: 'Q02', title: '포스가 해제된 뒤 포스 아웃으로 잘못 선택한 입력 차단',
    rule: '5.09(b)(6)', context: { outs: 1, bases: ['A', null, 'C'] }, plate: 'out', pitch: 'in_play',
    moves: [...forceReleaseMoves.slice(0, 2), out('A', 0, 'force', '4')], expected: { reject: true } },
  { id: 'Q03', title: '2루를 이미 밟은 주자의 오버런을 포스 아웃으로 잘못 선택한 입력 차단',
    rule: '5.09(b)(6)', context: { outs: 2, bases: ['A', null, 'C'] }, plate: 'fc', pitch: 'in_play',
    moves: [move('A', 0, 1), move('B', 'batter', 0, 'fc'), move('C', 2, 'home'), out('A', 1, 'force', '4')],
    responsibility: { pitcher: 'P0', reason: '테스트 선행주자 대체 책임 확정' }, expected: { reject: true } },
  { id: 'Q04', title: '2아웃에서 인필드플라이 판정 입력 차단', rule: 'Definition 40, 5.09(a)(5)',
    context: { outs: 2, bases: ['A', 'D', null] }, plate: 'out', pitch: 'in_play',
    ruling: ruling('infield_fly', '인필드플라이 요건 확인: Definition 40'),
    moves: [out('B', 'batter', 'caught_ball', '6')], expected: { reject: true } },
  { id: 'Q05', title: '주자 없는 인필드플라이 판정 입력 차단', rule: 'Definition 40, 5.09(a)(5)',
    context: {}, plate: 'out', pitch: 'in_play', ruling: ruling('infield_fly', 'Definition 40'),
    moves: [out('B', 'batter', 'caught_ball', '6')], expected: { reject: true } },
  { id: 'Q06', title: '무사 1·2루의 정상 인필드플라이 포구 사례', rule: 'Definition 40, 5.09(a)(5)',
    context: { bases: ['A', 'D', null] }, plate: 'out', pitch: 'in_play',
    ruling: ruling('infield_fly', '평범한 내야 플라이, 번트·직선타구 아님: Definition 40'),
    moves: [out('B', 'batter', 'caught_ball', '6')], expected: { runs: 0, outs: 1 } },
  { id: 'Q07', title: '2사 만루 볼넷 후 2루주자가 3루를 돌아 태그 아웃되어도 늦게 홈에 닿은 3루주자 득점',
    rule: '5.06(b)(3)(B) comment and note', context: { outs: 2, balls: 3, bases: ['A', 'D', 'C'] },
    plate: 'bb', pitch: 'ball', moves: walkMoves,
    expected: { runs: 1, outs: 1, batters: { B: { bb: 1, rbi: 1 }, C: { r: 1 } } } },
  { id: 'Q08', title: '홈스틸 포함 더블스틸에서 다른 주자가 목표 베이스 도달 전 아웃: 도루는 모두 불인정',
    rule: '9.07(d)', context: { bases: ['A', null, 'C'] }, plate: 'none', pitch: 'none',
    moves: [move('C', 2, 'home', 'steal'), move('A', 0, 'out', 'caught', { outKind: 'tag', putout: '4' })],
    expected: { runs: 1, outs: 1, batters: { C: { r: 1, sb: 0 }, A: { cs: 1, sb: 0 } } } },
  { id: 'Q09', title: '잡히지 않은 일반 파울에 주자 득점을 입력하면 차단', rule: '5.06(c)(5)',
    context: { bases: [null, null, 'C'] }, plate: 'none', pitch: 'foul',
    moves: [move('C', 2, 'home')], expected: { reject: true } },
  { id: 'Q10', title: '3루에만 주자가 있을 때 사구의 안전진루권으로 득점을 부여하면 차단', rule: '5.06(b)(3)(B), 5.06(c)(1)',
    context: { bases: [null, null, 'C'] }, plate: 'hbp', pitch: 'hbp',
    moves: [move('C', 2, 'home', 'award'), move('B', 'batter', 0, 'award')], expected: { reject: true } },
  { id: 'Q11', title: '2사 만루 볼넷의 선행 홈 도달 후 추가 주루 태그 아웃: 정상 대조군',
    rule: '5.06(b)(3)(B)', context: { outs: 2, balls: 3, bases: ['A', 'D', 'C'] }, plate: 'bb', pitch: 'ball',
    moves: [walkMoves[4], ...walkMoves.slice(0, 4)],
    expected: { runs: 1, outs: 1, batters: { B: { bb: 1, rbi: 1 }, C: { r: 1 } } } },
  { id: 'Q12', title: '1루 주자가 없는 2·3루에서 인필드플라이 판정 입력 차단', rule: 'Definition 40',
    context: { bases: [null, 'D', 'C'] }, plate: 'out', pitch: 'in_play', ruling: ruling('infield_fly', 'Definition 40'),
    moves: [out('B', 'batter', 'caught_ball', '6')], expected: { reject: true } },
  ...kboAuditScenarios,
];

export function readinessInput(scenario) {
  const expected = { inning: 1, half: 'top', outs: 0, bases: [null, null, null], score: { home: 0, away: 0 },
    activeMatchId: `LOCAL_TEST_MODAL_${scenario.id}`, pitchCount: 0, balls: 0, strikes: 0,
    batterIndex: { home: 0, away: 0 }, runnerResponsiblePitcher: { 0: 'P0', 1: 'P0', 2: 'P0' },
    batterId: 'B', pitcherId: 'P', revision: 'LOCAL_RULE_REVIEW', rosterKey: 'LOCAL_RULE_ROSTER', ...scenario.context };
  return { id: scenario.id, expected, plate: scenario.plate, pitch: scenario.pitch, misc: scenario.misc ?? 'none', errors: scenario.errors ?? [],
    reviewed: true, groundedIntoDoublePlay: Boolean(scenario.gdp), note: scenario.title,
    ...(scenario.multiOut ? { multiOut: { kind: scenario.multiOut.kind, clean: scenario.multiOut.clean, note: scenario.multiOut.note, stepIds: scenario.multiOut.steps.map(n => 'step-' + n) } } : {}),
    ...(scenario.incompleteDoublePlay ? { incompleteDoublePlay: { errorStepId: 'step-' + scenario.incompleteDoublePlay.step, note: scenario.incompleteDoublePlay.note } } : {}),
    steps: scenario.moves.map((move, index) => ({ id: `step-${index}`, runnerId: move.runner, from: move.from, to: move.to,
      cause: move.cause, stealGroup: move.stealGroup, errorId: move.errorIndex === undefined ? undefined : scenario.errors[move.errorIndex].id, outKind: move.outKind, putout: move.putout, assists: move.assists ?? [], rbi: Boolean(move.rbi), advantageousAppeal: false })),
    ruling: { kind: 'none', status: 'confirmed', rule: scenario.rule, note: scenario.title, choice: 'play', ...scenario.ruling },
    responsibility: scenario.responsibility ? [{ runnerId: 'B', ...scenario.responsibility, pitcherId: scenario.responsibility.pitcher }] : [] };
}

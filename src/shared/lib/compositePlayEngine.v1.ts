// Frozen v1 validation and transition kernel. Keep for persisted-record compatibility.
import { captureRunnerPlayContext } from './runnerPlayEngine.ts';
import type { BaseIndex, RunnerPlayContext } from './runnerPlayEngine.ts';
import { scoringStateIssues } from './scoringReplay.ts';

export const PLATE_DECISIONS = {
  none: '타석 계속', single: '1루타', double: '2루타', triple: '3루타', hr: '홈런',
  bb: '볼넷', ibb: '고의4구', hbp: '몸에 맞는 공', so: '삼진 아웃', so_reach: '낫아웃 출루', so_out: '낫아웃 실패',
  out: '타자 아웃', fc: '야수선택', error: '실책 출루', sh: '희생번트', sf: '희생플라이', ci: '타격방해',
} as const;
export const COMPOSITE_CAUSES = {
  hit: '안타', advance: '진루', fc: '야수선택', error: '실책', steal: '도루', caught: '도루자',
  pickoff: '견제', wp: '폭투', pb: '포일', award: '안전진루권', return: '귀루', tag_up: '태그업',
  interference: '방해', appeal: '어필', out: '아웃',
} as const;
export const COMPOSITE_OUTS = {
  tag: '태그 아웃', force: '포스 아웃', batter_before_first: '타자주자 1루 도달 전 아웃',
  caught_ball: '포구 아웃', strikeout: '삼진 아웃', appeal_force: '포스 성격 어필',
  appeal_time: '비포스 어필', interference: '방해 아웃',
} as const;
export const COMPOSITE_PITCHES = {
  none: '투구 없음', ball: '볼', strike: '스트라이크 / 헛스윙', foul: '파울', foul_bunt: '번트 파울',
  in_play: '인플레이 타구', hbp: '사구', automatic_ball: '자동 볼 (투구수 제외)',
  automatic_strike: '자동 스트라이크 (투구수 제외)',
} as const;
export const COMPOSITE_RULINGS = {
  none: '추가 판정 없음', obstruction: '주루방해', interference: '수비 / 타격방해',
  infield_fly: '인필드플라이', dead_ball: '볼 데드 / 안전진루권', appeal: '어필', balk: '보크 판정 선택', other: '기타 심판 판정',
} as const;
export type CompositeContext = RunnerPlayContext & {
  batterId: string; pitcherId: string; revision: string; rosterKey: string;
};
export type CompositeStep = {
  id: string; runnerId: string; from: BaseIndex | 'batter' | 'home'; to: BaseIndex | 'home' | 'out';
  cause: keyof typeof COMPOSITE_CAUSES; errorId?: string; outKind?: keyof typeof COMPOSITE_OUTS;
  rbi: boolean; putout?: string; assists: string[]; advantageousAppeal: boolean;
};
export type CompositeInput = {
  id: string; expected: CompositeContext; plate: keyof typeof PLATE_DECISIONS;
  pitch: keyof typeof COMPOSITE_PITCHES; misc: 'none' | 'wp' | 'pb' | 'balk';
  steps: CompositeStep[];
  errors: { id: string; fielder: string; kind: 'fielding' | 'throwing' | 'catching' | 'foul_drop'; note: string }[];
  ruling: { kind: keyof typeof COMPOSITE_RULINGS; status: 'pending' | 'confirmed'; rule: string; note: string; choice: 'play' | 'award' };
  responsibility: { runnerId: string; pitcherId: string | null; reason: string }[];
  groundedIntoDoublePlay: boolean; reviewed: boolean; note: string;
};
export type CompositeResolvedStep = CompositeStep & {
  runCounted: boolean; countedOut: boolean; runDecision: string; responsiblePitcherId: string | null;
};
export type CompositeRecord = {
  version: 1; input: CompositeInput; after: RunnerPlayContext; steps: CompositeResolvedStep[];
  plateCompleted: boolean; endedHalf: boolean; runs: number; outsAdded: number; unassignedRuns: number;
  batters: Record<string, Record<string, number>>; pitchers: Record<string, Record<string, number>>;
  fielding: Record<string, { errors: number; putouts: number; assists: number }>;
  feed: string[];
};

const object = (x: unknown): x is Record<string, unknown> => Boolean(x) && typeof x === 'object' && !Array.isArray(x);
const text = (x: unknown): x is string => typeof x === 'string' && Boolean(x.trim());
const base = (x: unknown): x is BaseIndex => x === 0 || x === 1 || x === 2;
const position = (x: unknown) => base(x) || x === 'batter' || x === 'home';
const member = (x: unknown, values: object) => typeof x === 'string' && Object.hasOwn(values, x);
const fielder = (x: unknown): x is string => typeof x === 'string' && /^[1-9]$/.test(x);
const whole = (x: unknown) => typeof x === 'number' && Number.isSafeInteger(x) && x >= 0;
const appeal = (x: CompositeStep) => x.outKind === 'appeal_force' || x.outKind === 'appeal_time';
// A batter-runner retired before first also cancels runs at the third out, even on a tag.
const force = (x: CompositeStep) => x.outKind === 'force' || x.outKind === 'appeal_force' || x.outKind === 'batter_before_first' ||
  (x.from === 'batter' && x.to === 'out');
const location = (x: CompositeStep['from'] | 'out') => typeof x === 'number' ? `${x + 1}루` : x === 'batter' ? '타석' : x === 'home' ? '홈' : '아웃';

export function captureCompositeContext(state: CompositeContext): CompositeContext {
  return { ...captureRunnerPlayContext(state), batterId: state.batterId, pitcherId: state.pitcherId,
    revision: state.revision, rosterKey: state.rosterKey };
}

export function validContext(x: unknown): x is CompositeContext {
  if (!object(x) || scoringStateIssues(x).length || !text(x.activeMatchId) || !text(x.batterId) || !text(x.pitcherId) ||
    typeof x.revision !== 'string' || typeof x.rosterKey !== 'string' || !whole(x.pitchCount) || !whole(x.balls) ||
    !whole(x.strikes) || Number(x.balls) > 3 || Number(x.strikes) > 2 || !object(x.batterIndex) ||
    !whole(x.batterIndex.home) || !whole(x.batterIndex.away) || !object(x.runnerResponsiblePitcher)) return false;
  const owners = x.runnerResponsiblePitcher;
  return [0, 1, 2].every(i => owners[i] === null || text(owners[i]));
}

export function validInput(x: unknown): x is CompositeInput {
  if (!object(x) || !text(x.id) || !validContext(x.expected) || !member(x.plate, PLATE_DECISIONS) ||
    !member(x.pitch, COMPOSITE_PITCHES) || !['none', 'wp', 'pb', 'balk'].includes(String(x.misc)) ||
    typeof x.reviewed !== 'boolean' || typeof x.groundedIntoDoublePlay !== 'boolean' ||
    typeof x.note !== 'string' || x.note.length > 1000 || !Array.isArray(x.steps) || x.steps.length > 64 ||
    !Array.isArray(x.errors) || x.errors.length > 32 || !Array.isArray(x.responsibility) || x.responsibility.length > 4 ||
    !object(x.ruling) || !member(x.ruling.kind, COMPOSITE_RULINGS) ||
    !['pending', 'confirmed'].includes(String(x.ruling.status)) || !['play', 'award'].includes(String(x.ruling.choice)) ||
    typeof x.ruling.note !== 'string' || typeof x.ruling.rule !== 'string') return false;
  return x.steps.every(s => object(s) && text(s.id) && text(s.runnerId) && position(s.from) &&
    (base(s.to) || s.to === 'home' || s.to === 'out') && member(s.cause, COMPOSITE_CAUSES) &&
    typeof s.rbi === 'boolean' && typeof s.advantageousAppeal === 'boolean' &&
    (s.outKind === undefined || member(s.outKind, COMPOSITE_OUTS)) && (s.putout === undefined || fielder(s.putout)) &&
    Array.isArray(s.assists) && s.assists.every(fielder) && (s.errorId === undefined || text(s.errorId))) &&
    x.errors.every(e => object(e) && text(e.id) && fielder(e.fielder) &&
      ['fielding', 'throwing', 'catching', 'foul_drop'].includes(String(e.kind)) && typeof e.note === 'string') &&
    x.responsibility.every(r => object(r) && text(r.runnerId) && (r.pitcherId === null || text(r.pitcherId)) && text(r.reason));
}

export function resolveCompositePlay(context: CompositeContext, raw: unknown):
  { ok: true; record: CompositeRecord } | { ok: false; issues: string[] } {
  const fail = (...issues: string[]) => ({ ok: false as const, issues });
  if (!validContext(context) || context.outs >= 3 || !validInput(raw)) return fail('경기 상태 또는 복합 플레이 입력 형식을 확인하세요.');
  if (JSON.stringify(captureCompositeContext(context)) !== JSON.stringify(captureCompositeContext(raw.expected))) {
    return fail('입력 중 경기 상태 또는 출전 선수가 바뀌었습니다. 새 상황으로 다시 시작하세요.');
  }
  const input = structuredClone(raw), { plate, pitch, misc, ruling } = input;
  if (!input.reviewed || ruling.status !== 'confirmed') return fail('기록원 최종 확인과 판정 확정이 필요합니다.');
  if ((ruling.kind !== 'none' || ['fc', 'error', 'sh', 'sf', 'ci'].includes(plate)) && !ruling.note.trim()) {
    return fail('선택한 기록 판정의 근거를 입력하세요.');
  }
  if (ruling.kind !== 'none' && !ruling.rule.trim()) return fail('특수 판정의 규칙 조항 또는 심판 확인 근거를 입력하세요.');
  const plateCompleted = plate !== 'none';
  const participants = new Map<string, CompositeStep['from']>();
  const owners = new Map<string, string | null>(), rank = new Map<string, number>();
  context.bases.forEach((runner, i) => {
    if (!runner) return;
    participants.set(runner, i as BaseIndex); owners.set(runner, context.runnerResponsiblePitcher[i as BaseIndex]); rank.set(runner, i + 1);
  });
  if (participants.has(context.batterId)) return fail('현재 타자와 기존 주자의 식별자가 중복되었습니다.');
  if (plateCompleted) { participants.set(context.batterId, 'batter'); owners.set(context.batterId, context.pitcherId); rank.set(context.batterId, 0); }
  const adjusted = new Set<string>();
  for (const decision of input.responsibility) {
    if (!participants.has(decision.runnerId) || adjusted.has(decision.runnerId)) return fail('책임투수 조정 대상이 없거나 중복되었습니다.');
    adjusted.add(decision.runnerId); owners.set(decision.runnerId, decision.pitcherId);
  }
  const errorIds = new Set(input.errors.map(e => e.id));
  if (errorIds.size !== input.errors.length || new Set(input.steps.map(s => s.id)).size !== input.steps.length) return fail('사건 ID가 중복되었습니다.');
  if (plate === 'error' && !input.errors.length) return fail('실책 출루에는 실책 행위가 필요합니다.');
  if (['so_reach', 'so_out'].includes(plate) && context.outs < 2 && context.bases[0]) return fail('2아웃 전 1루 점유 시 타자는 자동 삼진 아웃입니다. 낫아웃 주루 대신 삼진 아웃을 선택하세요.');
  if ((plate === 'sh' || plate === 'sf') && (context.outs >= 2 || !context.bases.some(Boolean))) return fail('희생타는 2아웃 전 주자가 있을 때 판정하세요.');

  let balls = context.balls, strikes = context.strikes;
  if (pitch === 'ball' || pitch === 'automatic_ball') balls++;
  if (pitch === 'strike' || pitch === 'automatic_strike' || pitch === 'foul_bunt') strikes++;
  if (pitch === 'foul') strikes = Math.min(2, strikes + 1);
  if (plate === 'bb' && (balls !== 4 || !['ball', 'automatic_ball'].includes(pitch))) return fail('볼넷은 네 번째 볼 판정과 함께 기록하세요.');
  if (plate === 'ibb' && pitch !== 'none') return fail('선언 고의4구는 투구 없음으로 기록하세요.');
  if (plate === 'hbp' && pitch !== 'hbp') return fail('사구의 투구 결과를 확인하세요.');
  if (['so', 'so_reach', 'so_out'].includes(plate) && (strikes !== 3 || !['strike', 'automatic_strike', 'foul_bunt'].includes(pitch))) return fail('삼진은 세 번째 스트라이크 판정과 함께 기록하세요.');
  if (['so_reach', 'so_out'].includes(plate) && pitch !== 'strike') return fail('자동 스트라이크와 번트 파울에는 낫아웃 주루를 기록할 수 없습니다.');
  if (['single', 'double', 'triple', 'hr', 'fc', 'error', 'sh', 'sf', 'out'].includes(plate) && pitch !== 'in_play') return fail('타구 결과에는 인플레이 타구를 선택하세요.');
  if (plate === 'none' && (balls > 3 || strikes > 2 || ['in_play', 'hbp'].includes(pitch))) return fail('타석이 끝나는 투구입니다. 타격 판정을 선택하세요.');
  if (plate === 'none' && pitch === 'none' && !input.steps.length && !input.errors.length && ruling.kind === 'none') return fail('기록할 사건이 없습니다.');
  if (plate === 'ci' && !['in_play', 'none'].includes(pitch)) return fail('타격방해의 투구 여부를 확인하세요.');

  const steps: CompositeResolvedStep[] = [];
  const attained = new Map<string, number>();
  for (const [runner, pos] of participants) attained.set(runner, typeof pos === 'number' ? pos + 1 : 0);
  let outsAdded = 0, third: CompositeResolvedStep | undefined, advantageousUsed = false;
  for (const step of input.steps) {
    if (!participants.has(step.runnerId) || participants.get(step.runnerId) !== step.from) return fail(`${step.runnerId}: 직전 위치와 출발 위치가 다릅니다.`);
    if (step.to === step.from) return fail('정지 주자는 이동 행을 추가하지 마세요.');
    if (step.cause === 'error' && (!step.errorId || !errorIds.has(step.errorId))) return fail('실책 진루에는 해당 실책 행위를 연결하세요.');
    if (step.errorId && !errorIds.has(step.errorId)) return fail('존재하지 않는 실책 참조입니다.');
    if (step.from === 'home' && !(step.to === 'out' && appeal(step))) return fail('홈 도달 이후에는 어필 아웃만 추가할 수 있습니다.');
    if (step.to === 'out' && !step.outKind) return fail('아웃 성격을 선택하세요.');
    if (step.to !== 'out' && (step.outKind || step.putout || step.assists.length || step.advantageousAppeal)) return fail('아웃이 아닌 이동에 아웃 기록이 연결되었습니다.');
    if (step.outKind === 'batter_before_first' && (step.runnerId !== context.batterId || step.from !== 'batter')) return fail('타자주자 1루 도달 전 아웃의 대상을 확인하세요.');
    if (['caught_ball', 'strikeout'].includes(step.outKind ?? '') && step.from !== 'batter') return fail('포구/삼진 아웃은 타자에게 기록하세요.');
    if (base(step.to) && base(step.from) && step.to < step.from && step.cause !== 'return') return fail('역방향 이동은 귀루로 명시하세요.');
    if (step.rbi && step.to !== 'home') return fail('홈 도달 행에만 타점을 선택하세요.');
    if (third && step.to !== 'out' && step.to !== 'home') return fail('제3아웃 이후 일반 진루는 기록할 수 없습니다.');
    const resolved: CompositeResolvedStep = { ...step, runCounted: false, countedOut: false,
      runDecision: 'not_home', responsiblePitcherId: owners.get(step.runnerId) ?? null };
    if (step.to === 'out') {
      if (context.outs + outsAdded >= 3) {
        if (!appeal(step) || !step.advantageousAppeal || advantageousUsed || ruling.kind !== 'appeal') return fail('추가 아웃은 확정된 유리한 제4아웃 어필만 허용합니다.');
        advantageousUsed = true;
        if (third) third.countedOut = false;
        resolved.countedOut = true;
        // The apparent third out remains the timing cutoff; the appeal changes run eligibility.
      } else {
        if (step.advantageousAppeal) return fail('유리한 제4아웃은 제3아웃 이후에만 선택하세요.');
        outsAdded++; resolved.countedOut = true;
        if (context.outs + outsAdded === 3) third = resolved;
      }
      participants.delete(step.runnerId);
    } else {
      participants.set(step.runnerId, step.to);
      attained.set(step.runnerId, Math.max(attained.get(step.runnerId) ?? 0, step.to === 'home' ? 4 : step.to + 1));
    }
    steps.push(resolved);
  }
  if (plateCompleted && participants.get(context.batterId) === 'batter') return fail('타자주자의 출루 또는 아웃을 입력하세요.');
  const batterSteps = steps.filter(s => s.runnerId === context.batterId);
  if (['out', 'so'].includes(plate) && (!batterSteps.length || batterSteps[0].to !== 'out')) return fail('타자 아웃 판정과 타자주자 결과가 다릅니다.');
  if (plate === 'so' && batterSteps[0]?.outKind !== 'strikeout') return fail('삼진 아웃 성격을 선택하세요. 낫아웃 후 아웃은 별도 판정이 필요합니다.');
  if (plate === 'so_out' && (batterSteps.length !== 1 || batterSteps[0].from !== 'batter' || batterSteps[0].to !== 'out' ||
    !['tag', 'batter_before_first'].includes(batterSteps[0].outKind ?? ''))) return fail('낫아웃 실패는 1루 도달 전 태그 또는 1루 송구 아웃으로 입력하세요. 출루 뒤 추가 주루 아웃은 낫아웃 출루와 별도 아웃 행을 사용하세요.');
  if (plate === 'so_reach' && (batterSteps[0]?.to === 'out' || (attained.get(context.batterId) ?? 0) < 1)) return fail('낫아웃 출루에는 실제 1루 이상 도달이 필요합니다. 도달 전 아웃은 낫아웃 실패를 선택하세요.');
  if (plate === 'so_out' && (misc === 'wp' || misc === 'pb')) return fail('낫아웃 타자주자를 태그/1루 송구로 아웃시키는 동안의 진루는 WP/PB가 아닌 진루 또는 야수선택으로 기록하세요.');
  const hitBases = ({ single: 1, double: 2, triple: 3, hr: 4 } as Record<string, number>)[plate] ?? 0;
  if (hitBases) {
    const reached = steps.findIndex(s => s.runnerId === context.batterId && s.to !== 'out' && (s.to === 'home' ? 4 : s.to + 1) >= hitBases);
    if (reached < 0 || (third && reached > steps.indexOf(third)) || steps.some(s => s.runnerId !== context.batterId && force(s))) return fail('안타 인정 루수, 도달 시점, 선행주자 포스 아웃을 확인하세요.');
    if (plate === 'hr' && (outsAdded || input.errors.length || [...rank.keys()].some(id => participants.get(id) !== 'home'))) return fail('홈런은 모든 주자의 홈 도달을 확인하세요. 실책 추가 진루와 분리해야 합니다.');
  }
  const forcedAward = ['bb', 'ibb', 'hbp', 'ci'].includes(plate);
  if (forcedAward) {
    if ((attained.get(context.batterId) ?? 0) < 1) return fail('타자의 1루 안전진루권을 반영하세요.');
    let forcedRunner = true;
    for (let i = 0; i < 3; i++) {
      forcedRunner = forcedRunner && Boolean(context.bases[i]);
      if (forcedRunner && (attained.get(context.bases[i]!) ?? 0) < i + 2) return fail('볼넷/사구/타격방해의 밀어내기 진루가 누락되었습니다.');
    }
  }
  if (plate === 'fc' && steps.some(s => s.to === 'out' && s.runnerId !== context.batterId) && !adjusted.has(context.batterId)) return fail('야수선택으로 주자가 아웃되면 타자주자의 책임투수를 근거와 함께 확정하세요.');
  if (input.groundedIntoDoublePlay && (outsAdded < 2 || !['out', 'fc'].includes(plate))) return fail('병살타 판정에는 타구에 의한 2개 이상의 아웃이 필요합니다.');
  if (misc === 'wp' || misc === 'pb') {
    if (!['ball', 'strike'].includes(pitch)) return fail('폭투/포일에는 실제 볼 또는 스트라이크 투구가 필요합니다.');
    const extra = steps.some(s => {
      if (s.cause !== misc || s.to === 'out') return false;
      const to = s.to === 'home' ? 4 : s.to + 1;
      let award = s.from === 'batter' ? 0 : typeof s.from === 'number' ? s.from + 1 : 4;
      if (forcedAward) {
        if (s.runnerId === context.batterId) award = 1;
        else { const i = context.bases.indexOf(s.runnerId); if (i >= 0 && context.bases.slice(0, i + 1).every(Boolean)) award = i + 2; }
      }
      return to > award;
    });
    if (!extra) return fail('폭투/포일에 의한 실제 추가 진루를 입력하세요. 안전진루권만으로는 기록하지 않습니다.');
  }
  if (steps.some(s => (s.cause === 'wp' || s.cause === 'pb') && s.cause !== misc)) return fail('주루 원인과 폭투/포일 판정이 다릅니다.');
  if (misc === 'balk' && (plateCompleted || pitch !== 'none' || !context.bases.some(Boolean) ||
    steps.some(s => s.to === 'out') || context.bases.some((id, i) => id && participants.get(id) !== (i === 2 ? 'home' : i + 1)))) return fail('보크 적용은 투구 없이 모든 주자 1개 루 진루로 기록하세요. 플레이 채택은 별도 판정으로 남기세요.');

  const thirdIndex = third ? steps.indexOf(third) : Infinity;
  const effectiveThird = steps.find(s => s.advantageousAppeal) ?? third;
  const runs = steps.filter(s => s.to === 'home');
  for (const run of runs) {
    run.runDecision = 'counted';
    if (effectiveThird && force(effectiveThird)) run.runDecision = 'third_force_or_batter';
    else if (steps.indexOf(run) > thirdIndex) run.runDecision = 'after_third_out';
    else if (steps.some(s => s.to === 'out' && appeal(s) && (s.runnerId === run.runnerId ||
      ((s === third || s.advantageousAppeal) && (rank.get(s.runnerId) ?? 0) >= (rank.get(run.runnerId) ?? 0))))) run.runDecision = 'appeal';
    run.runCounted = run.runDecision === 'counted';
    if (run.rbi && (!run.runCounted || !plateCompleted || input.groundedIntoDoublePlay || ['so', 'so_reach', 'so_out'].includes(plate) ||
      ['steal', 'caught', 'pickoff', 'wp', 'pb', 'return'].includes(run.cause))) return fail('무효 득점, 주루 단독 사건, 삼진, 병살타에는 해당 타점을 부여할 수 없습니다.');
    if (run.rbi && run.cause === 'error' && !ruling.note.trim()) return fail('실책 관련 타점은 실책 없이도 득점했을 근거를 입력하세요.');
  }
  if (plate === 'sf' && !runs.some(r => r.runCounted)) return fail('희생플라이는 인정 득점이 필요합니다.');
  if (plate === 'sh' && !steps.some(s => s.runnerId !== context.batterId && s.to !== 'out' && s.cause !== 'return')) return fail('희생번트의 주자 진루를 입력하세요.');
  const finalBases: (string | null)[] = [null, null, null];
  const responsibility: Record<BaseIndex, string | null> = { 0: null, 1: null, 2: null };
  for (const [id, pos] of participants) {
    if (!base(pos)) continue;
    if (finalBases[pos]) return fail(`${pos + 1}루에 주자가 중복되었습니다.`);
    finalBases[pos] = id; responsibility[pos] = owners.get(id) ?? null;
  }
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
    if (finalBases[i] && finalBases[j] && rank.get(finalBases[i]!)! > rank.get(finalBases[j]!)!) return fail('선행주자를 추월한 배치입니다. 추월 아웃 또는 귀루 판정을 입력하세요.');
  }
  for (const earlier of runs) for (const later of runs) {
    if (earlier.runCounted && later.runCounted && rank.get(earlier.runnerId)! < rank.get(later.runnerId)! && steps.indexOf(earlier) < steps.indexOf(later)) return fail('후행주자가 먼저 득점한 순서입니다. 선행주자 추월 여부를 확인하세요.');
  }
  const endedHalf = context.outs + outsAdded === 3;
  const runCount = runs.filter(r => r.runCounted).length;
  const offense = context.half === 'top' ? 'away' : 'home';
  const actualPitch = !['none', 'automatic_ball', 'automatic_strike'].includes(pitch);
  const after: RunnerPlayContext = {
    ...captureRunnerPlayContext(context), bases: endedHalf ? [null, null, null] : finalBases,
    runnerResponsiblePitcher: endedHalf ? { 0: null, 1: null, 2: null } : responsibility,
    score: { ...context.score, [offense]: context.score[offense] + runCount },
    outs: endedHalf ? 0 : context.outs + outsAdded,
    half: endedHalf ? context.half === 'top' ? 'bottom' : 'top' : context.half,
    inning: endedHalf && context.half === 'bottom' ? context.inning + 1 : context.inning,
    balls: plateCompleted || endedHalf ? 0 : balls, strikes: plateCompleted || endedHalf ? 0 : strikes,
    pitchCount: plateCompleted || endedHalf ? 0 : context.pitchCount + Number(actualPitch),
  };
  const batters: CompositeRecord['batters'] = {}, pitchers: CompositeRecord['pitchers'] = {}, fielding: CompositeRecord['fielding'] = {};
  const bump = (map: CompositeRecord['batters'], name: string | null, key: string, n = 1) => {
    if (!name || !n) return; const row = map[name] ??= {}; row[key] = (row[key] ?? 0) + n;
  };
  const field = (pos: string) => fielding[pos] ??= { errors: 0, putouts: 0, assists: 0 };
  if (plateCompleted) {
    bump(batters, context.batterId, 'pa'); bump(pitchers, context.pitcherId, 'bf');
    if (!['bb', 'ibb', 'hbp', 'ci', 'sh', 'sf'].includes(plate)) bump(batters, context.batterId, 'ab');
    const kind = ({ single: 'singles', double: 'doubles', triple: 'triples', hr: 'hr', bb: 'bb', ibb: 'bb', hbp: 'hbp', so: 'so', so_reach: 'so', so_out: 'so', fc: 'fc', ci: 'ci', sh: 'sh', sf: 'sf' } as Record<string, string>)[plate];
    if (kind) bump(batters, context.batterId, kind);
    if (plate === 'sh' || plate === 'sf') bump(batters, context.batterId, 'sac');
    if (hitBases) { bump(batters, context.batterId, 'h'); bump(pitchers, context.pitcherId, 'h'); }
    if (kind && ['hr', 'bb', 'hbp', 'so', 'sh', 'sf'].includes(kind)) bump(pitchers, context.pitcherId, kind);
    if (input.groundedIntoDoublePlay) bump(batters, context.batterId, 'gdp');
  }
  bump(pitchers, context.pitcherId, 'outs', outsAdded);
  if (actualPitch) { bump(pitchers, context.pitcherId, 'pitches'); bump(pitchers, context.pitcherId, ['ball', 'hbp'].includes(pitch) ? 'balls' : 'strikes'); }
  if (misc === 'wp') bump(pitchers, context.pitcherId, 'wp');
  if (misc === 'balk') bump(pitchers, context.pitcherId, 'bk');
  for (const run of runs) if (run.runCounted) {
    bump(batters, run.runnerId, 'r'); bump(pitchers, run.responsiblePitcherId, 'r');
    if (run.rbi) bump(batters, context.batterId, 'rbi');
  }
  for (const step of steps) {
    if (step.cause === 'steal' && step.to !== 'out' && (step.to !== 'home' || step.runCounted)) bump(batters, step.runnerId, 'sb');
    if (step.cause === 'caught' && step.countedOut) bump(batters, step.runnerId, 'cs');
    if (step.countedOut) {
      if (step.putout) field(step.putout).putouts++;
      for (const pos of new Set(step.assists)) field(pos).assists++;
    }
  }
  for (const e of input.errors) field(e.fielder).errors++;
  const feed = [PLATE_DECISIONS[plate], ...steps.map((s, i) => `${i + 1}. ${s.runnerId} ${location(s.from)}→${location(s.to)} (${COMPOSITE_CAUSES[s.cause]}${s.outKind ? `, ${COMPOSITE_OUTS[s.outKind]}` : ''}${s.to === 'home' ? s.runCounted ? ', 득점 인정' : ', 득점 불인정' : ''}${s.rbi ? ', 타점' : ''})`),
    ...input.errors.map(e => `E${e.fielder} ${e.kind} [${e.id}]`),
    ...(misc !== 'none' ? [misc === 'wp' ? '폭투 1' : misc === 'pb' ? '포일 1' : '보크 1'] : []),
    ...(ruling.kind !== 'none' ? [`${COMPOSITE_RULINGS[ruling.kind]}: ${ruling.choice === 'play' ? '플레이 채택' : '판정 적용'}`] : [])];
  return { ok: true, record: { version: 1, input, after, steps, plateCompleted, endedHalf, runs: runCount, outsAdded,
    unassignedRuns: runs.filter(r => r.runCounted && !r.responsiblePitcherId).length, batters, pitchers, fielding, feed } };
}

export function normalizeCompositePlay(raw: unknown): CompositeRecord | undefined {
  if (!object(raw) || raw.version !== 1 || !validInput(raw.input)) return undefined;
  const result = resolveCompositePlay(raw.input.expected, raw.input);
  if (!result.ok) return undefined;
  // Never trust persisted derived totals, even when the input still parses.
  for (const key of ['after', 'steps', 'plateCompleted', 'endedHalf', 'runs', 'outsAdded', 'unassignedRuns', 'batters', 'pitchers', 'fielding', 'feed'] as const) {
    if (JSON.stringify(raw[key]) !== JSON.stringify(result.record[key])) return undefined;
  }
  return result.record;
}

export function applyCompositeProjection(record: CompositeRecord, targets: { batter: (id: string) => object; pitcher?: (id: string) => object }) {
  const add = (target: object, values: Record<string, number>) => {
    const row = target as Record<string, unknown>;
    for (const [key, value] of Object.entries(values)) row[key] = (typeof row[key] === 'number' ? row[key] : 0) + value;
  };
  for (const [id, delta] of Object.entries(record.batters)) add(targets.batter(id), delta);
  if (targets.pitcher) for (const [id, delta] of Object.entries(record.pitchers)) {
    const target = targets.pitcher(id); add(target, delta);
    if (delta.r) (target as Record<string, unknown>).earnedRunsStatus = 'unconfirmed';
  }
}

export function compositePlayAuditRows(events: { eventId?: string; compositePlay?: CompositeRecord }[]): string[][] {
  return events.flatMap(e => e.compositePlay ? [['복합 플레이 원본 v1', e.eventId ?? '', JSON.stringify(e.compositePlay)]] : []);
}

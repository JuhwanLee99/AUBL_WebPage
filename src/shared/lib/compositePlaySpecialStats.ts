import type { CompositeContext, CompositeInput, CompositeRecord, CompositeStep } from './compositePlayEngine.ts';

const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim()) && value.length <= 300;
const destination = (step: CompositeStep) => typeof step.to === 'number' ? step.to + 1 : step.to === 'home' ? 4 : 0;
export const caughtSafe = (step: CompositeStep) => step.cause === 'caught' && step.to !== 'out';

/** Validate adjudications before adapting them to the frozen transition kernel. */
export function specialScoringInputIssue(context: CompositeContext, input: CompositeInput): string | undefined {
  const multi = input.multiOut;
  if (multi !== undefined && (!object(multi) || !['dp', 'tp'].includes(multi.kind) || multi.clean !== true || !text(multi.note) ||
    !Array.isArray(multi.stepIds) || multi.stepIds.length !== (multi.kind === 'dp' ? 2 : 3) ||
    multi.stepIds.some(id => typeof id !== 'string' || !id) || new Set(multi.stepIds).size !== multi.stepIds.length))
    return '수비 DP/TP: 실책·미스플레이 없는 연속 수비임을 확인하고, 해당 아웃 행과 판정 근거를 입력하세요.';
  if (multi && (input.errors.length || input.misc !== 'none')) return '이번 플레이에 실책이 있습니다. 이 모달의 수비 DP/TP 자동 집계는 실책 없는 연속 플레이에만 적용합니다.';

  const incomplete = input.incompleteDoublePlay;
  if (incomplete !== undefined && (!object(incomplete) || !text(incomplete.errorStepId) || !text(incomplete.note)))
    return '미완성 병살타: 제2아웃 송구 포구 실책 행과 기록원 판정 근거가 필요합니다.';
  if (incomplete && (!input.groundedIntoDoublePlay || !['fc', 'error', 'out'].includes(input.plate) || input.pitch !== 'in_play'))
    return '미완성 병살타는 땅볼 병살타 판정과 실제 인플레이 타구에만 적용합니다.';
  if (incomplete && multi) return '미완성 병살타에는 수비 DP/TP를 부여하지 않습니다.';
  if (input.groundedIntoDoublePlay) {
    if (input.steps.some(s => ['caught_ball', 'infield_fly', 'strikeout', 'interference'].includes(s.outKind ?? '')))
      return '포구·삼진·인필드플라이 또는 주자 방해로 인한 병살에는 땅볼 병살타를 부여하지 않습니다.';
    if (input.steps.some(s => s.rbi)) return '병살타 판정에는 타점을 기록하지 않습니다.';
  }

  const missed = input.steps.filter(s => caughtSafe(s) || s.id === incomplete?.errorStepId);
  if (incomplete && !missed.some(s => s.id === incomplete.errorStepId)) return '미완성 병살타의 실책 행이 존재하지 않습니다.';
  const usedErrors = new Set<string>();
  for (const step of missed) {
    const error = input.errors.find(e => e.id === step.errorId);
    if (step.to === 'out' || !error || error.kind !== 'catching' || !text(error.note) || !step.assists.length || step.assists.at(-1) === error.fielder ||
      step.putout || step.outKind || step.advantageousAppeal || step.rbi)
      return '실책 세이프의 도루자/미완성 병살타는 정확한 송구를 놓친 포구 실책, 송구 보살 경로, 세이프 결과를 연결하세요. 자살·아웃·타점은 기록하지 않습니다.';
    if (usedErrors.has(error.id)) return '한 포구 실책으로 동일한 아웃 기회를 여러 번 집계할 수 없습니다. 다른 주자는 일반 실책 진루로 연결하세요.';
    usedErrors.add(error.id);
    if (caughtSafe(step)) {
      if (typeof step.from !== 'number' || destination(step) !== step.from + 2 || !text(input.ruling.note))
        return '실책 세이프 도루자는 도루 목표인 다음 한 베이스와 기록원 판정 근거가 필요합니다.';
      if (['hbp', 'ibb', 'ci'].includes(input.plate) || ['foul', 'foul_bunt', 'automatic_strike'].includes(input.pitch) || input.misc === 'balk')
        return '볼 데드·안전진루 판정에 실책 세이프 도루자를 혼합하지 마세요.';
      if (['bb', 'so_reach', 'so_out'].includes(input.plate)) {
        const start = context.bases.indexOf(step.runnerId);
        if (start >= 0 && context.bases.slice(0, start + 1).every(Boolean)) return '타자 출루로 강제 진루하는 베이스는 도루 시도 실패로 기록하지 않습니다.';
      }
    } else if (step.cause !== 'error') return '미완성 병살타의 제2아웃 실패 행은 실책 진루 원인으로 입력하세요.';
  }
}

export function missedOutStepIds(input: CompositeInput) {
  return new Set(input.steps.filter(s => caughtSafe(s) || s.id === input.incompleteDoublePlay?.errorStepId).map(s => s.id));
}

/** Counted outs, not apparent fourth outs, determine participation and GDP eligibility. */
export function specialScoringRecordIssue(record: CompositeRecord): string | undefined {
  const { input } = record;
  const outs = record.steps.filter(s => s.countedOut);
  if (input.incompleteDoublePlay) {
    const missed = record.steps.find(s => s.id === input.incompleteDoublePlay!.errorStepId)!;
    const first = outs[0];
    if (outs.length !== 1 || !first || !['force', 'batter_before_first'].includes(first.outKind ?? '') ||
      record.steps.indexOf(first) >= record.steps.indexOf(missed))
      return '미완성 병살타는 첫 아웃이 성립한 뒤 제2아웃 송구를 놓친 경우입니다. 실제 아웃과 실책 순서를 확인하세요.';
    const origin = missed.runnerId === input.expected.batterId ? 0 : input.expected.bases.indexOf(missed.runnerId) + 1;
    if (origin < 0 || destination(missed) !== origin + 1) return '제2아웃 실책 행에는 해당 주자의 다음 베이스 세이프를 입력하세요.';
  }
  if (input.multiOut) {
    const { stepIds, kind } = input.multiOut;
    if (outs.length !== (kind === 'dp' ? 2 : 3) || outs.some(s => !stepIds.includes(s.id)) || outs.some(s => !s.putout))
      return '수비 DP/TP는 실제로 인정된 모든 아웃과 각 자살 야수를 지정해야 합니다. 취소된 아웃은 포함하지 마세요.';
  }
}

/** Adds only explicitly adjudicated statistics, keeping previous v2 records unchanged. */
export function applySpecialScoringStats(record: CompositeRecord): void {
  const input = record.input;
  const missedIds = missedOutStepIds(input);
  type Position = CompositeStep['assists'][number];
  const fielder = (position: Position) => record.fielding[position] ??= { errors: 0, putouts: 0, assists: 0 };
  const attemptKey = (step: CompositeStep) => JSON.stringify([step.runnerId, step.stealGroup ?? '1']);
  const attempts = new Map<string, { cs: boolean; assists: Set<Position> }>();
  const attempt = (step: CompositeStep) => {
    const key = attemptKey(step);
    let value = attempts.get(key);
    if (!value) {
      value = { cs: false, assists: new Set<Position>() };
      attempts.set(key, value);
    }
    return value;
  };

  // Actual outs already receive CS and assists from the core engine. A safe-on-error
  // step in that same attempt must not add the same credit a second time.
  for (const step of record.steps) {
    if (!step.countedOut || step.cause !== 'caught') continue;
    const existing = attempt(step);
    existing.cs = true;
    step.assists.forEach(position => existing.assists.add(position));
  }
  for (const step of input.steps) {
    if (!missedIds.has(step.id)) continue;
    const existing = caughtSafe(step) ? attempt(step) : undefined;
    for (const position of new Set(step.assists)) {
      if (existing?.assists.has(position)) continue;
      fielder(position).assists += 1;
      existing?.assists.add(position);
    }
    if (existing && !existing.cs) {
      const runner = record.batters[step.runnerId] ??= {};
      runner.cs = (runner.cs ?? 0) + 1;
      existing.cs = true;
    }
  }
  if (input.incompleteDoublePlay) {
    const batter = record.batters[input.expected.batterId] ??= {};
    batter.gdp = (batter.gdp ?? 0) + 1;
    record.feed.push('미완성 병살타 GDP 1 / 송구 포구 실책 / 실제 아웃 ' + record.outsAdded + ' / 수비 DP 불인정');
  }
  if (input.multiOut) {
    const participants = new Set<Position>();
    for (const step of record.steps) {
      if (!step.countedOut) continue;
      if (step.putout) participants.add(step.putout);
      step.assists.forEach(position => participants.add(position));
    }
    for (const position of participants) fielder(position)[input.multiOut.kind] = 1;
    record.feed.push((input.multiOut.kind === 'dp' ? '수비 병살 DP' : '수비 삼중살 TP')
      + ' 참여: ' + [...participants].sort().join(', ') + ' (야수별 1회)');
  }
}

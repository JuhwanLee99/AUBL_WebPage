import * as v1 from './compositePlayEngine.v1.ts';
import { applySpecialScoringStats, caughtSafe, missedOutStepIds, specialScoringInputIssue, specialScoringRecordIssue } from './compositePlaySpecialStats.ts';
export { PLATE_DECISIONS, COMPOSITE_CAUSES, COMPOSITE_RULINGS, captureCompositeContext } from './compositePlayEngine.v1.ts';
export type { CompositeContext } from './compositePlayEngine.v1.ts';
export const COMPOSITE_PITCHES = { ...v1.COMPOSITE_PITCHES, foul_caught: '파울 플라이 포구' } as const;
export const COMPOSITE_OUTS = { ...v1.COMPOSITE_OUTS, infield_fly: '인필드플라이 선언 아웃 (미포구)' } as const;
export type CompositeStep = Omit<v1.CompositeStep, 'outKind'> & {
  outKind?: keyof typeof COMPOSITE_OUTS;
  /** Equal groups identify one simultaneous steal attempt, not the entire plate appearance. */
  stealGroup?: string;
};
export type CompositeInput = Omit<v1.CompositeInput, 'pitch' | 'steps'> & {
  pitch: keyof typeof COMPOSITE_PITCHES; steps: CompositeStep[];
  multiOut?: { kind: 'dp' | 'tp'; clean: boolean; stepIds: string[]; note: string };
  incompleteDoublePlay?: { errorStepId: string; note: string };
};
export type CompositeResolvedStep = CompositeStep & Pick<v1.CompositeResolvedStep, 'runCounted' | 'countedOut' | 'runDecision' | 'responsiblePitcherId'>;
export type CompositeRecord = Omit<v1.CompositeRecord, 'version' | 'input' | 'steps' | 'fielding'> & {
  version: 1 | 2; input: CompositeInput; steps: CompositeResolvedStep[];
  fielding: Record<string, { errors: number; putouts: number; assists: number; pb?: number; dp?: number; tp?: number }>;
};
const object = (x: unknown): x is Record<string, unknown> => Boolean(x) && typeof x === 'object' && !Array.isArray(x);
const rank = (x: CompositeStep['from'] | 'out') => typeof x === 'number' ? x + 1 : x === 'home' ? 4 : 0;
const group = (s: CompositeStep) => s.stealGroup ?? '1';
const failed = (issue: string): { ok: false; issues: string[] } => ({ ok: false, issues: [issue] });

/** Translate only new vocabulary; the submitted timeline is never reordered. */
function kernelInput(raw: unknown): v1.CompositeInput | undefined {
  if (!object(raw) || !Array.isArray(raw.steps) || !(typeof raw.pitch === 'string' && Object.hasOwn(COMPOSITE_PITCHES, raw.pitch))) return;
  for (const s of raw.steps) {
    if (!object(s) || (s.stealGroup !== undefined && (typeof s.stealGroup !== 'string' || !/^[1-9][0-9]?$/.test(s.stealGroup)))) return;
    if (s.outKind !== undefined && !(typeof s.outKind === 'string' && Object.hasOwn(COMPOSITE_OUTS, s.outKind))) return;
  }
  const input = { ...raw, pitch: raw.pitch === 'foul_caught' ? 'in_play' : raw.pitch,
    steps: raw.steps.map(s => s.outKind === 'infield_fly' ? { ...s, outKind: 'caught_ball' } : { ...s }) };
  return v1.validInput(input) ? input : undefined;
}

function ruleIssue(c: v1.CompositeContext, i: CompositeInput): string | undefined {
  const specialIssue = specialScoringInputIssue(c, i);
  if (specialIssue) return specialIssue;
  const batter = c.batterId;
  const award = ['bb', 'ibb', 'hbp', 'ci'].includes(i.plate);
  const forced = new Map<string, number>();
  if (i.plate !== 'none' && !['so', 'out', 'sf'].includes(i.plate)) {
    for (let n = 0; n < 3 && c.bases[n]; n++) forced.set(c.bases[n]!, n + 2);
  } else if (['out', 'sf'].includes(i.plate) && !i.steps.some(s => s.runnerId === batter && ['caught_ball', 'infield_fly'].includes(s.outKind ?? ''))) {
    for (let n = 0; n < 3 && c.bases[n]; n++) forced.set(c.bases[n]!, n + 2);
  }
  const mandatory = new Map<string, number>(award ? forced : []);
  if (award) mandatory.set(batter, 1);
  const alive = new Set([...c.bases.filter((x): x is string => Boolean(x)), ...(i.plate === 'none' ? [] : [batter])]);
  const positions = new Map<string, number>(c.bases.flatMap((id, n) => id ? [[id, n + 1] as const] : []));
  positions.set(batter, 0);
  const caught = i.steps.find(s => s.runnerId === batter && s.to === 'out' && s.outKind === 'caught_ball');
  if (i.plate === 'ci') {
    const reach = i.steps.find(s => s.runnerId === batter && s.from === 'batter');
    const error = i.errors.find(e => e.id === reach?.errorId);
    if (i.ruling.kind !== 'interference' || i.ruling.choice !== 'award')
      return '타격방해 출루는 방해 벌칙 채택으로 확정하세요. 실제 플레이를 채택했다면 그 타격 결과를 선택하세요.';
    if (!reach || reach.to !== 0 || reach.cause !== 'interference' || !error || error.kind !== 'fielding' || !error.note.trim())
      return '타격방해: 타자 타석 → 1루 행의 원인을 방해로 지정하고, 방해 야수의 포구/처리 실책 1개와 행위 설명을 연결하세요. (9.12(a)(1)(F))';
  }
  if (i.ruling.kind === 'infield_fly' && (c.outs >= 2 || !c.bases[0] || !c.bases[1] || i.plate !== 'out' || i.pitch !== 'in_play' ||
      !i.steps.some(s => s.runnerId === batter && ['caught_ball', 'infield_fly'].includes(s.outKind ?? ''))))
    return '인필드플라이: 2아웃 미만, 1·2루 또는 만루의 페어 플라이와 타자 선언 아웃이 필요합니다. 번트·직선타구는 제외합니다.';
  if (i.steps.some(s => s.outKind === 'infield_fly') && i.ruling.kind !== 'infield_fly') return '미포구 인필드플라이 아웃에는 심판의 인필드플라이 확정이 필요합니다.';
  if (i.pitch === 'foul_caught' && (!['out', 'sf'].includes(i.plate) || !caught)) return '파울 플라이 포구는 타자 포구 아웃 또는 희생플라이와 함께 기록하세요.';
  if (['foul', 'foul_bunt'].includes(i.pitch)) {
    if (i.steps.some(s => s.runnerId !== batter || !(i.pitch === 'foul_bunt' && s.to === 'out' && s.outKind === 'strikeout')))
      return '잡히지 않은 파울은 볼 데드입니다. 주자 진루·득점은 기록할 수 없습니다. 별도 방해 판정은 분리해 정정하세요.';
    if (i.errors.some(e => e.kind !== 'foul_drop')) return '파울 볼 데드에는 파울 낙구 실책만 기록할 수 있습니다.';
  }
  if (i.pitch === 'automatic_strike' && ['so_reach', 'so_out'].includes(i.plate)) return '자동 스트라이크에는 실제 투구가 없으므로 낫아웃을 기록할 수 없습니다.';
  if (i.pitch === 'automatic_strike' && i.steps.some(s => s.runnerId !== batter)) return '자동 스트라이크 판정 중 주루는 별도 플레이로 기록하세요.';
  const deadAward = i.plate === 'hbp' || i.plate === 'ibb';
  for (const s of i.steps) {
    if (deadAward && (s.to === 'out' || !mandatory.has(s.runnerId) || rank(s.to) !== mandatory.get(s.runnerId) || s.cause !== 'award'))
      return '사구·선언 고의4구의 볼 데드에서는 강제 주자만 정확히 한 베이스 안전진루합니다.';
    if (s.cause === 'award' && award && (rank(s.to) !== mandatory.get(s.runnerId) || s.to === 'out')) return '안전진루권의 대상과 도달 베이스가 맞지 않습니다. 추가 진루 원인을 별도로 입력하세요.';
    if (s.cause === 'return' && (typeof s.from !== 'number' || typeof s.to !== 'number' || s.to >= s.from)) return '귀루는 기존 베이스 방향으로 돌아가는 이동에만 사용하세요.';
    if (s.cause === 'steal') {
      if (typeof s.from !== 'number' || s.to === 'out' || rank(s.to) !== rank(s.from) + 1) return '도루는 주자의 다음 한 베이스 도달마다 기록하세요. 타자 출루·귀루·아웃은 도루가 아닙니다.';
      if (award && (mandatory.get(s.runnerId) ?? 0) >= rank(s.to)) return '강제 진루로 얻은 베이스에는 도루를 기록하지 않습니다.';
    }
    if (s.cause === 'caught' && typeof s.from !== 'number') return '도루자는 베이스에 있던 주자의 도루 시도에 사용하세요.';
    if (s.outKind === 'strikeout' && !['so', 'so_reach', 'so_out'].includes(i.plate)) return '삼진 아웃 성격은 삼진 타격 판정에만 사용할 수 있습니다.';
    if (['tag', 'force', 'appeal_force'].includes(s.outKind ?? '')) {
      const target = forced.get(s.runnerId);
      const origin = c.bases.indexOf(s.runnerId);
      const followingAlive = alive.has(batter) && c.bases.slice(0, origin).every(id => Boolean(id && alive.has(id)));
      const forceActive = Boolean(target && followingAlive && (positions.get(s.runnerId) ?? 4) < target);
      if (s.outKind === 'tag' && forceActive)
        return '포스 상태의 주자를 다음 베이스 도달 전에 태그한 아웃도 기록상 포스 아웃입니다. 아웃 성격을 포스로 변경하세요. (5.09(b)(6))';
      if (s.outKind !== 'tag' && !forceActive)
        return '포스가 성립하지 않습니다. 타자·후위 주자 아웃 또는 진루 베이스 도달 후에는 태그/비포스 어필을 사용하세요. 원래 베이스 귀루 시 포스는 다시 성립할 수 있습니다.';
    }
    if (s.to === 'out') alive.delete(s.runnerId); else positions.set(s.runnerId, rank(s.to));
  }
  const hit = ({ single: 1, double: 2, triple: 3, hr: 4 } as Record<string, number>)[i.plate];
  if (hit) {
    const hitSegments = i.steps.filter(s => s.runnerId === batter && s.cause === 'hit' && s.to !== 'out');
    if (!hitSegments.length || Math.max(...hitSegments.map(s => rank(s.to))) !== hit || hitSegments[0].from !== 'batter')
      return '안타 종류는 타구로 얻은 베이스와 일치해야 합니다. 실책·야수선택에 의한 추가 베이스를 장타에 포함하지 마세요.';
  }
  if (i.plate === 'sf' && !caught && !i.steps.some(s => s.runnerId === batter && s.cause === 'error' && s.from === 'batter' && s.to !== 'out'))
    return '희생플라이는 포구 아웃 또는 포구했어도 득점 가능한 낙구 실책 출루가 필요합니다.';
  if (i.plate === 'sh') {
    for (const s of i.steps) if (s.runnerId !== batter && s.to === 'out') {
      const origin = c.bases.indexOf(s.runnerId);
      const before = i.steps.slice(0, i.steps.indexOf(s));
      if (!before.some(p => p.runnerId === s.runnerId && p.to !== 'out' && rank(p.to) >= origin + 2))
        return '번트로 진루하던 주자가 다음 베이스 도달 전에 아웃되면 희생번트가 아닙니다.';
    }
    if (!i.steps.some(s => s.runnerId === batter && (s.to === 'out' || ['fc', 'error'].includes(s.cause))))
      return '희생번트의 타자 결과는 아웃, 야수선택 또는 실책 출루로 구분하세요.';
  }
}

export function resolveCompositePlay(context: v1.CompositeContext, raw: unknown): { ok: true; record: CompositeRecord } | { ok: false; issues: string[] } {
  const kernel = kernelInput(raw);
  if (!v1.validContext(context) || !kernel) return failed('플레이 입력 형식 또는 경기 상태가 올바르지 않습니다.');
  const input = structuredClone(raw as CompositeInput);
  const issue = ruleIssue(context, input);
  if (issue) return failed(issue);
  const missedIds = missedOutStepIds(input);
  kernel.steps = kernel.steps.map(s => missedIds.has(s.id) ? { ...s, cause: 'error', assists: [] } : s);
  if (input.incompleteDoublePlay) kernel.groundedIntoDoublePlay = false;
  // 5.06(b)(3)(B): a loaded walk's mandatory run survives a later-base tag third out.
  // Suppress only the kernel's invalid-RBI guard, then settle this entitlement at its ORIGINAL timeline index.
  let lateWalk: CompositeStep | undefined;
  if (['bb', 'ibb'].includes(input.plate) && context.bases.every(Boolean)) {
    let outs = context.outs;
    const thirdIndex = input.steps.findIndex(s => s.to === 'out' && ++outs === 3);
    const third = input.steps[thirdIndex];
    if (thirdIndex >= 0 && third?.outKind === 'tag' && !input.steps.some(s => s.outKind?.startsWith('appeal') || s.advantageousAppeal)) {
      const mandatoryDone = [context.batterId, context.bases[0], context.bases[1]].every((id, n) =>
        input.steps.slice(0, thirdIndex).some(s => s.runnerId === id && s.to !== 'out' && rank(s.to) >= n + 1));
      const candidate = input.steps.find((s, n) => n > thirdIndex && s.runnerId === context.bases[2] && s.from === 2 && s.to === 'home' && s.cause === 'award');
      if (mandatoryDone && candidate) lateWalk = candidate;
    }
  }
  if (lateWalk) kernel.steps = kernel.steps.map(s => s.id === lateWalk!.id ? { ...s, rbi: false } : s);
  const result = v1.resolveCompositePlay(context, kernel);
  if (!result.ok) return result;
  const record: CompositeRecord = { ...result.record, version: 2, input,
    steps: result.record.steps.map((s, n) => ({ ...s, ...input.steps[n] })) };
  const recordIssue = specialScoringRecordIssue(record);
  if (recordIssue) return failed(recordIssue);
  const bump = (map: CompositeRecord['batters'], id: string, key: string, n = 1) => { const row = map[id] ??= {}; row[key] = (row[key] ?? 0) + n; };
  if (lateWalk) {
    const step = record.steps.find(s => s.id === lateWalk!.id)!;
    if (!step.runCounted) {
      step.runCounted = true; step.runDecision = '만루 볼넷 안전진루 득점 예외 5.06(b)(3)(B)';
      record.runs++; record.after.score[context.half === 'top' ? 'away' : 'home']++;
      bump(record.batters, step.runnerId, 'r');
      if (step.responsiblePitcherId) bump(record.pitchers, step.responsiblePitcherId, 'r'); else record.unassignedRuns++;
      if (step.rbi) bump(record.batters, context.batterId, 'rbi');
    }
  }
  const failedGroups = new Set(input.steps.filter(s => s.cause === 'caught').map(group));
  for (const s of record.steps) if (s.cause === 'steal' && failedGroups.has(group(s)) && (s.to !== 'home' || s.runCounted))
    bump(record.batters, s.runnerId, 'sb', -1);
  if (input.plate === 'ibb') { bump(record.batters, context.batterId, 'ibb'); bump(record.pitchers, context.pitcherId, 'ibb'); }
  if (record.batters[context.batterId]?.ab) bump(record.pitchers, context.pitcherId, 'ab');
  const hitBases = ({ single: 1, double: 2, triple: 3, hr: 4 } as Record<string, number>)[input.plate];
  if (hitBases) bump(record.batters, context.batterId, 'tb', hitBases);
  if (input.misc === 'pb') (record.fielding['2'] ??= { errors: 0, putouts: 0, assists: 0 }).pb = 1;
  const loc = (p: CompositeStep['from'] | 'out') => typeof p === 'number' ? (p + 1) + '루' : p === 'batter' ? '타석' : p === 'home' ? '홈' : '아웃';
  record.feed = [v1.PLATE_DECISIONS[input.plate], ...record.steps.map((s, n) =>
    (n + 1) + '. ' + s.runnerId + ': ' + loc(s.from) + ' → ' + loc(s.to) + ' (' +
    (caughtSafe(s) ? '도루자 / 송구 포구 실책으로 세이프' : s.cause === 'steal' && failedGroups.has(group(s)) ? '진루 / 동시 도루 실패로 도루 불인정' : v1.COMPOSITE_CAUSES[s.cause]) +
    (s.outKind ? ', ' + COMPOSITE_OUTS[s.outKind] : '') + ')' +
    (s.to === 'home' ? (s.runCounted ? ' 득점 인정' : ' 득점 불인정') + (s.rbi ? ' 타점 인정' : '') : '') +
    (s.id === lateWalk?.id ? ' / ' + s.runDecision : '')),
    ...input.errors.map(e => 'E' + e.fielder + ' ' + e.kind + ' [' + e.id + ']'),
    ...(input.misc === 'none' ? [] : [input.misc === 'wp' ? '폭투 1' : input.misc === 'pb' ? '포일 1' : '보크 1']),
    ...(input.ruling.kind === 'none' ? [] : [v1.COMPOSITE_RULINGS[input.ruling.kind] + ': ' + input.ruling.rule + ' / ' + input.ruling.note])];
  applySpecialScoringStats(record);
  return { ok: true, record };
}

const derived = ['after', 'steps', 'plateCompleted', 'endedHalf', 'runs', 'outsAdded', 'unassignedRuns', 'batters', 'pitchers', 'fielding', 'feed'] as const;
export function normalizeCompositePlay(raw: unknown): CompositeRecord | undefined {
  if (!object(raw) || !object(raw.input)) return;
  if (raw.version === 1) {
    const legacy = v1.normalizeCompositePlay(raw);
    if (!legacy) return;
    const checked = resolveCompositePlay(legacy.input.expected, legacy.input);
    if (!checked.ok) return;
    // Preserve valid v1 bytes/metrics; never retrofit newly introduced optional statistics.
    for (const key of ['after', 'runs', 'outsAdded', 'unassignedRuns'] as const)
      if (JSON.stringify(legacy[key]) !== JSON.stringify(checked.record[key])) return;
    for (const map of ['batters', 'pitchers'] as const) for (const [id, values] of Object.entries(legacy[map]))
      for (const [key, value] of Object.entries(values)) if (value !== (checked.record[map][id]?.[key] ?? 0)) return;
    return legacy;
  }
  if (raw.version !== 2) return;
  const checked = resolveCompositePlay(raw.input.expected as v1.CompositeContext, raw.input);
  if (!checked.ok || derived.some(key => JSON.stringify(raw[key]) !== JSON.stringify(checked.record[key]))) return;
  return checked.record;
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
  return events.flatMap(e => {
    if (!e.compositePlay) return [];
    const issues = compositePlayValidationIssues(e.compositePlay);
    return [
      ...(issues.length ? [['복합 플레이 재심 필요', e.eventId ?? '', issues.join(' / ')]] : []),
      ['복합 플레이 원본 v' + e.compositePlay.version, e.eventId ?? '', JSON.stringify(e.compositePlay)],
    ];
  });
}

/** Read-only diagnosis. Never overwrite a historical decision to make it pass. */
export function compositePlayValidationIssues(raw: unknown): string[] {
  try {
    if (!object(raw) || !object(raw.input)) return ['구조화된 플레이 원본이 없거나 손상되었습니다.'];
    if (raw.version !== 1 && raw.version !== 2) return ['지원하지 않는 기록 버전입니다.'];
    if (normalizeCompositePlay(raw)) return [];
    const checked = resolveCompositePlay(raw.input.expected as v1.CompositeContext, raw.input);
    return checked.ok ? ['저장된 점수·아웃·통계·중계가 원본 입력의 재계산 결과와 일치하지 않습니다.'] : checked.issues;
  } catch {
    return ['기록 원본을 안전하게 해석하지 못했습니다. 원본을 보존한 상태로 재심이 필요합니다.'];
  }
}

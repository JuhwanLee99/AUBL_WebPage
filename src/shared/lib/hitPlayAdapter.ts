import { resolveAdvanceOutcome } from '../state/demoStore.baseRunning.ts';
import type { RunnerAdvanceSelections } from '../state/demoStore';
import { captureRunnerPlayContext, resolveRunnerPlay } from './runnerPlayEngine.ts';
import type { BaseIndex, RunnerMovement, RunnerPlayContext, RunnerPlayInput } from './runnerPlayEngine.ts';

export type HitRunnerReview = {
  expected: RunnerPlayContext;
  batterId: string;
  pitcherId: string | null;
  sequences: Partial<Record<BaseIndex, number>>;
  outKinds: Partial<Record<BaseIndex, RunnerMovement['outKind']>>;
  batterSequence: number;
  rbi?: number;
  hitConfirmed?: boolean;
};

export function resolveHitPlay(state: RunnerPlayContext, options: {
  id: string; batterId: string; pitcherId: string | null; bases: 1 | 2 | 3 | 4;
  advances?: RunnerAdvanceSelections; review?: HitRunnerReview;
}) {
  const { bases, review } = options;
  for (const [index, outcome] of Object.entries(options.advances ?? {})) {
    if (!['0', '1', '2'].includes(index) || !state.bases[Number(index)] || !['hold', 'advance', 'out', 'score', 1, 2, 3, 4].includes(outcome)) {
      return { ok: false as const, issues: ['안타의 주자 선택 정보가 잘못되었습니다.'] };
    }
  }
  if (review && (review.batterId !== options.batterId || review.pitcherId !== options.pitcherId)) {
    return { ok: false as const, issues: ['입력 중 타자 또는 투수가 변경되었습니다. 안타 패널을 다시 열어 주세요.'] };
  }
  const movements: RunnerMovement[] = [];
  for (let index = 2; index >= 0; index--) {
    const runnerId = state.bases[index];
    if (!runnerId) continue;
    const from = index as BaseIndex;
    const outcome = resolveAdvanceOutcome(options.advances?.[from], from, bases);
    if (outcome.type === 'out' && (!review?.outKinds[from] || review.sequences[from] === undefined || !review.hitConfirmed)) {
      return { ok: false as const, issues: ['안타 후 주자 아웃의 종류·발생 순서와 안타 인정 여부를 확인하세요.'] };
    }
    movements.push({ runnerId, from, to: outcome.type === 'out' ? 'out' : outcome.type === 'score' ? 'home' : outcome.targetBaseIndex as BaseIndex,
      cause: 'advance', sequence: review?.sequences[from] ?? (bases === 4 ? 3 - index : 4 - index),
      ...(outcome.type === 'out' ? { outKind: review!.outKinds[from] } : {}),
    });
  }
  const input: RunnerPlayInput = {
    id: options.id, expected: review?.expected ?? captureRunnerPlayContext(state), movements, note: '', rbi: 0,
    batterHit: { runnerId: options.batterId, bases, sequence: review?.batterSequence ?? (bases === 4 ? 4 : 1), responsiblePitcherId: options.pitcherId, hitConfirmed: review?.hitConfirmed },
  };
  const preview = resolveRunnerPlay(state, input);
  if (!preview.ok) return preview;
  return resolveRunnerPlay(state, { ...input, rbi: review?.rbi ?? preview.record.runs });
}

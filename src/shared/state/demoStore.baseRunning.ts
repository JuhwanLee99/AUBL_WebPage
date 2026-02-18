import type { RunnerAdvanceOutcome } from './demoStore';

type Bases = (string | null)[];

export function resolveAdvanceOutcome(
  outcome: RunnerAdvanceOutcome | undefined,
  fromBase: number,
  defaultSteps: number,
): { type: 'hold' | 'advance' | 'score' | 'out'; targetBaseIndex: number } {
  if (outcome === 'out') return { type: 'out', targetBaseIndex: fromBase };
  if (outcome === 'score') return { type: 'score', targetBaseIndex: 3 };
  if (outcome === 'hold') return { type: 'hold', targetBaseIndex: fromBase };
  if (typeof outcome === 'number') {
    if (outcome >= 4) return { type: 'score', targetBaseIndex: 3 };
    const targetBaseIndex = Math.max(0, outcome - 1);
    if (targetBaseIndex <= fromBase) {
      return { type: 'hold', targetBaseIndex: fromBase };
    }
    return { type: 'advance', targetBaseIndex };
  }
  const targetBaseIndex = fromBase + defaultSteps;
  if (targetBaseIndex >= 3) {
    return { type: 'score', targetBaseIndex: 3 };
  }
  return { type: 'advance', targetBaseIndex };
}

export function advanceBasesOnWalk(currentBases: Bases, batterName: string) {
  const bases = [...currentBases] as Bases;
  let runs = 0;

  if (bases[0]) {
    if (bases[1] && bases[2]) {
      runs += 1;
      bases[2] = null;
    }
    if (bases[1]) {
      bases[2] = bases[1];
      bases[1] = null;
    }
    bases[1] = bases[0];
    bases[0] = null;
  }

  bases[0] = batterName;

  return { bases, runs };
}

// Structural replay validation. Scoring judgments (earned runs, appeals, etc.)
// require explicit scorer decisions and are not inferred from these snapshots.
export type ScoringFrame = {
  inning: number;
  half: 'top' | 'bottom';
  outs: number;
  bases: (string | null)[];
  score: { home: number; away: number };
};

export type ScoringTransition = { version: 1; before: ScoringFrame; after: ScoringFrame };
export type ScoringRejection = {
  id: string;
  matchId: string | null;
  createdAt: number;
  eventType: string;
  reason: string;
};

type ReplayEvent = {
  eventId?: string;
  type: string;
  stateTransition?: ScoringTransition;
  manualResolve?: { required: boolean; reasons?: string[] };
  source?: { kind: string };
  officialAdjust?: boolean;
};

export type ReplayAuditEntry = {
  eventId: string;
  status: 'applied' | 'pending' | 'rejected' | 'duplicate';
  reasons: string[];
  before: ScoringFrame | null;
  after: ScoringFrame | null;
};

const objectValue = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
const whole = (value: unknown, min: number, max = Number.MAX_SAFE_INTEGER) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;

export function scoringStateIssues(value: unknown): string[] {
  const state = objectValue(value);
  if (!state) return ['상태 정보가 없습니다.'];
  const issues: string[] = [];
  if (!whole(state.inning, 1)) issues.push('이닝은 1 이상의 정수여야 합니다.');
  if (state.half !== 'top' && state.half !== 'bottom') issues.push('공수 구분이 잘못되었습니다.');
  if (!whole(state.outs, 0, 3)) issues.push('아웃은 0~3의 정수여야 합니다.');
  if (!Array.isArray(state.bases) || state.bases.length !== 3) {
    issues.push('주자 배치는 세 개의 베이스가 필요합니다.');
  } else {
    const occupied = state.bases.filter((runner) => runner !== null);
    if (occupied.some((runner) => typeof runner !== 'string' || !runner.trim())) {
      issues.push('주자 식별자가 잘못되었습니다.');
    }
    if (new Set(occupied).size !== occupied.length) issues.push('동일 주자가 여러 베이스에 있습니다.');
  }
  const score = objectValue(state.score);
  if (!score || !whole(score.home, 0) || !whole(score.away, 0)) {
    issues.push('점수는 0 이상의 정수여야 합니다.');
  }
  return issues;
}

export const captureScoringFrame = (state: ScoringFrame): ScoringFrame => ({
  inning: state.inning, half: state.half, outs: state.outs,
  bases: [...state.bases], score: { ...state.score },
});

export function normalizeScoringTransition(value: unknown): ScoringTransition | undefined {
  const transition = objectValue(value);
  if (!transition || transition.version !== 1 || scoringStateIssues(transition.before).length || scoringStateIssues(transition.after).length) return undefined;
  return {
    version: 1,
    before: captureScoringFrame(transition.before as ScoringFrame),
    after: captureScoringFrame(transition.after as ScoringFrame),
  };
}

export function normalizeScoringRejections(value: unknown): ScoringRejection[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const item = objectValue(entry);
    if (!item || typeof item.id !== 'string' || typeof item.reason !== 'string' ||
      typeof item.eventType !== 'string' || !whole(item.createdAt, 0)) return [];
    return [{ id: item.id, reason: item.reason, eventType: item.eventType,
      createdAt: item.createdAt as number, matchId: typeof item.matchId === 'string' ? item.matchId : null }];
  });
}

export function scoringTransitionIssues(transition: ScoringTransition, allowScoreCorrection = false): string[] {
  const issues = [...scoringStateIssues(transition.before), ...scoringStateIssues(transition.after)];
  if (issues.length) return issues;
  const { before, after } = transition;
  const beforeHalf = (before.inning - 1) * 2 + (before.half === 'bottom' ? 1 : 0);
  const afterHalf = (after.inning - 1) * 2 + (after.half === 'bottom' ? 1 : 0);
  if (afterHalf < beforeHalf || afterHalf > beforeHalf + 1) issues.push('이닝 전이가 순서에 맞지 않습니다.');
  if (afterHalf === beforeHalf && after.outs < before.outs) issues.push('같은 공수에서 아웃이 감소했습니다.');
  if (afterHalf === beforeHalf + 1 && (after.outs !== 0 || after.bases.some((runner) => runner !== null))) {
    issues.push('공수 교대 후 아웃과 주자 배치가 초기화되지 않았습니다.');
  }
  if (!allowScoreCorrection) {
    if (after.score.home < before.score.home || after.score.away < before.score.away) issues.push('득점이 감소했습니다.');
    const defense = before.half === 'top' ? 'home' : 'away';
    if (after.score[defense] !== before.score[defense]) issues.push('수비 팀의 점수가 변경되었습니다.');
  }
  return issues;
}

const sameFrame = (a: ScoringFrame, b: ScoringFrame) =>
  a.inning === b.inning && a.half === b.half && a.outs === b.outs &&
  a.score.home === b.score.home && a.score.away === b.score.away &&
  a.bases.every((runner, index) => runner === b.bases[index]);
const openingFrame = (): ScoringFrame => ({ inning: 1, half: 'top', outs: 0, bases: [null, null, null], score: { home: 0, away: 0 } });

/** Input must already be in event order. Missing legacy state starts a new segment. */
export function replayScoringEvents(events: ReplayEvent[], initial?: ScoringFrame) {
  let state = initial ? captureScoringFrame(initial) : null;
  let anchored = Boolean(initial);
  let hasGaps = false;
  const entries: ReplayAuditEntry[] = [];
  const appliedIds = new Map<string, string>();
  for (const [index, event] of events.entries()) {
    const eventId = event.eventId ?? `legacy-replay-${index}`;
    const before = state ? captureScoringFrame(state) : null;
    const add = (status: ReplayAuditEntry['status'], reasons: string[]) => {
      entries.push({ eventId, status, reasons, before, after: state ? captureScoringFrame(state) : null });
    };
    if (event.manualResolve?.required || !event.stateTransition) {
      add('pending', event.manualResolve?.required
        ? event.manualResolve.reasons ?? ['기록원 확정이 필요합니다.']
        : ['이전 기록에 구조화된 상태 정보가 없습니다.']);
      anchored = false;
      hasGaps = true;
      continue;
    }
    const transition = normalizeScoringTransition(event.stateTransition);
    if (!transition) {
      add('rejected', ['상태 스키마 또는 값이 잘못되었습니다.']);
      continue;
    }
    const signature = JSON.stringify([event.type, transition]);
    const seen = event.eventId ? appliedIds.get(event.eventId) : undefined;
    if (seen) {
      add(seen === signature ? 'duplicate' : 'rejected', [seen === signature ? '이미 적용된 사건입니다.' : '동일 사건 ID의 내용이 충돌합니다.']);
      continue;
    }
    const issues = scoringTransitionIssues(transition, event.source?.kind === 'manual' && event.officialAdjust === true);
    if (anchored && state && !sameFrame(state, transition.before)) issues.push('직전 사건의 결과와 다음 사건의 시작 상태가 다릅니다.');
    if (issues.length) {
      add('rejected', issues);
      continue;
    }
    if (!anchored && !sameFrame(transition.before, openingFrame())) hasGaps = true;
    state = captureScoringFrame(transition.after);
    anchored = true;
    if (event.eventId) appliedIds.set(event.eventId, signature);
    add('applied', []);
  }
  return { state, entries, hasGaps, complete: events.length > 0 && !hasGaps && entries.every((entry) => entry.status === 'applied' || entry.status === 'duplicate') };
}

/** The legacy reducer prepends events; identify additions by object identity. */
export function attachScoringTransition<T extends { stateTransition?: ScoringTransition }>(
  previous: T[], next: T[], before: ScoringFrame, after: ScoringFrame,
  decorate: (event: T) => T,
): T[] {
  const known = new Set(previous);
  const additions = next.filter((event) => !known.has(event));
  return next.map((event) => known.has(event) ? event : {
    ...decorate(event),
    ...(additions.length === 1 ? { stateTransition: { version: 1 as const, before: captureScoringFrame(before), after: captureScoringFrame(after) } } : {}),
  });
}

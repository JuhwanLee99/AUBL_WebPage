import { captureScoringFrame, scoringStateIssues } from './scoringReplay.ts';
import type { ScoringFrame } from './scoringReplay.ts';

export type BaseIndex = 0 | 1 | 2;
export type RunnerCause = 'advance' | 'steal' | 'caught' | 'pickoff' | 'wp' | 'pb' | 'other';
export const RUNNER_CAUSE_LABELS: Record<RunnerCause, string> = {
  advance: '진루', steal: '도루 성공', caught: '도루자', pickoff: '견제사',
  wp: '폭투', pb: '포일', other: '기타 주루',
};
export type RunnerMovement = {
  runnerId: string;
  from: BaseIndex;
  to: BaseIndex | 'home' | 'out';
  sequence: number;
  cause: RunnerCause;
  outKind?: 'tag' | 'force' | 'appeal';
};
export type RunnerPlayContext = ScoringFrame & {
  activeMatchId: string | null;
  pitchCount: number;
  balls: number;
  strikes: number;
  batterIndex: { home: number; away: number };
  runnerResponsiblePitcher: Record<BaseIndex, string | null>;
};
export type RunnerPlayInput = {
  id: string;
  expected: RunnerPlayContext;
  movements: RunnerMovement[];
  batterOut?: { sequence: number };
  batterHit?: { runnerId: string; bases: 1 | 2 | 3 | 4; sequence: number; responsiblePitcherId: string | null; hitConfirmed?: boolean };
  note: string;
  rbi: number;
};
export type ResolvedRunnerMovement = RunnerMovement & {
  responsiblePitcherId: string | null;
  runCounted: boolean;
  runDecision: 'not_home' | 'counted' | 'third_out' | 'preceding_appeal' | 'after_third_out';
};
export type RunnerPlayRecord = {
  version: 1;
  input: RunnerPlayInput;
  movements: ResolvedRunnerMovement[];
  runs: number;
  outsAdded: number;
  endedHalf: boolean;
  runsAllowedBy: Record<string, number>;
  unassignedRuns: number;
};

export function captureRunnerPlayContext(state: RunnerPlayContext): RunnerPlayContext {
  return {
    ...captureScoringFrame(state), activeMatchId: state.activeMatchId,
    pitchCount: state.pitchCount, balls: state.balls, strikes: state.strikes,
    batterIndex: { home: state.batterIndex.home, away: state.batterIndex.away },
    runnerResponsiblePitcher: {
      0: state.runnerResponsiblePitcher[0] ?? null,
      1: state.runnerResponsiblePitcher[1] ?? null,
      2: state.runnerResponsiblePitcher[2] ?? null,
    },
  };
}

const base = (value: unknown): value is BaseIndex => value === 0 || value === 1 || value === 2;
const sequence = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= 4;
const whole = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function validContext(value: unknown): value is RunnerPlayContext {
  if (!object(value) || scoringStateIssues(value).length) return false;
  if (!(typeof value.activeMatchId === 'string' || value.activeMatchId === null) ||
    !whole(value.pitchCount) || !whole(value.balls) || !whole(value.strikes)) return false;
  if (!object(value.batterIndex) || !whole(value.batterIndex.home) || !whole(value.batterIndex.away)) return false;
  const pitchers = value.runnerResponsiblePitcher;
  return object(pitchers) && [0, 1, 2].every((index) => pitchers[index] === null ||
    (typeof pitchers[index] === 'string' && Boolean(pitchers[index].trim())));
}

export function resolveRunnerPlay(context: RunnerPlayContext, raw: unknown):
  | { ok: false; issues: string[] }
  | { ok: true; record: RunnerPlayRecord; after: ScoringFrame; responsibility: Record<BaseIndex, string | null> } {
  const fail = (...issues: string[]) => ({ ok: false as const, issues });
  if (!validContext(context) || context.outs >= 3) return fail('현재 경기 상태를 확인하세요.');
  if (!object(raw) || !validContext(raw.expected) || typeof raw.id !== 'string' || !raw.id.trim() ||
    typeof raw.note !== 'string' || raw.note.length > 500 || !whole(raw.rbi) || !Array.isArray(raw.movements)) return fail('주루 사건 형식이 잘못되었습니다.');
  if (JSON.stringify(captureRunnerPlayContext(context)) !== JSON.stringify(captureRunnerPlayContext(raw.expected))) {
    return fail('입력 중 경기 상태가 변경되었습니다. 패널을 다시 열어 주세요.');
  }
  const occupied = context.bases.filter((runner) => runner !== null).length;
  if (raw.movements.length !== occupied) return fail('모든 주자의 결과를 입력하세요.');
  const movements: RunnerMovement[] = [];
  const seenBases = new Set<number>();
  for (const item of raw.movements) {
    if (!object(item) || !base(item.from) || typeof item.runnerId !== 'string' || context.bases[item.from] !== item.runnerId ||
      seenBases.has(item.from) || !sequence(item.sequence) ||
      !(base(item.to) || item.to === 'home' || item.to === 'out') ||
      typeof item.cause !== 'string' || !Object.hasOwn(RUNNER_CAUSE_LABELS, item.cause)) return fail('주자, 출발 루, 결과 또는 순서를 확인하세요.');
    if (typeof item.to === 'number' && item.to < item.from) return fail('역방향 귀루는 이 패널에서 처리하지 않습니다.');
    if (item.to === 'out' && !['tag', 'force', 'appeal'].includes(String(item.outKind))) return fail('아웃 종류를 선택하세요.');
    if (['caught', 'pickoff'].includes(item.cause) && item.to !== 'out') return fail('도루자와 견제사는 아웃 결과가 필요합니다.');
    if (item.cause === 'steal' && (item.to === 'out' || item.to === item.from)) return fail('도루 성공은 진루 또는 홈 도달이 필요합니다.');
    seenBases.add(item.from);
    movements.push({ runnerId: item.runnerId, from: item.from, to: item.to, sequence: item.sequence as number,
      cause: item.cause as RunnerCause, ...(item.to === 'out' ? { outKind: item.outKind as RunnerMovement['outKind'] } : {}) });
  }
  let batterOut: RunnerPlayInput['batterOut'];
  if (raw.batterOut !== undefined) {
    if (!object(raw.batterOut) || !sequence(raw.batterOut.sequence)) return fail('타자 아웃 발생 순서를 입력하세요.');
    batterOut = { sequence: raw.batterOut.sequence as number };
  }
  let batterHit: RunnerPlayInput['batterHit'];
  if (raw.batterHit !== undefined) {
    const hit = raw.batterHit;
    if (!object(hit) || typeof hit.runnerId !== 'string' || !hit.runnerId.trim() || context.bases.includes(hit.runnerId) ||
      ![1, 2, 3, 4].includes(Number(hit.bases)) || typeof hit.bases !== 'number' || !sequence(hit.sequence) ||
      !(hit.responsiblePitcherId === null || (typeof hit.responsiblePitcherId === 'string' && hit.responsiblePitcherId.trim())) || batterOut) return fail('안타 타자 또는 책임 투수 정보가 잘못되었습니다.');
    if (movements.some((move) => move.to === 'out') && hit.hitConfirmed !== true) return fail('후속 아웃이 있는 안타의 판정을 확인해야 합니다.');
    batterHit = { runnerId: hit.runnerId, bases: hit.bases as 1 | 2 | 3 | 4, sequence: hit.sequence as number, responsiblePitcherId: hit.responsiblePitcherId as string | null, ...(hit.hitConfirmed === true ? { hitConfirmed: true } : {}) };
    if (movements.some((move) => move.to === 'out' && move.outKind === 'force')) return fail('포스 아웃이 포함된 타구는 안타 판정을 다시 확인하고 야수선택 입력을 사용하세요.');
    if (batterHit.bases === 4 && movements.some((move) => move.to !== 'home' || move.sequence >= batterHit!.sequence)) return fail('홈런은 모든 선행 주자의 홈 도달이 타자보다 먼저 기록되어야 합니다.');
  }
  const active = movements.filter((move) => move.to !== move.from);
  if (!active.length && !batterOut && !batterHit) return fail('진루, 홈 도달 또는 아웃을 하나 이상 입력하세요.');
  const orders = [...active.map((move) => move.sequence), ...(batterOut ? [batterOut.sequence] : []), ...(batterHit ? [batterHit.sequence] : [])];
  if (new Set(orders).size !== orders.length) return fail('발생 순서는 중복 없이 입력하세요.');
  const outs = [
    ...movements.filter((move) => move.to === 'out').map((move) => ({ sequence: move.sequence, kind: move.outKind!, from: move.from })),
    ...(batterOut ? [{ sequence: batterOut.sequence, kind: 'batter' as const, from: -1 }] : []),
  ].sort((a, b) => a.sequence - b.sequence);
  if (context.outs + outs.length > 3) return fail('남은 아웃 수보다 많은 아웃을 기록할 수 없습니다. 추가 어필은 별도 판정이 필요합니다.');
  const third = context.outs + outs.length === 3 ? outs[outs.length - 1] : undefined;
  if (third && batterHit && batterHit.sequence > third.sequence) return fail('제3아웃보다 늦은 타자 도달은 안타 성립 여부를 별도로 확인해야 합니다.');
  const finalBases: (string | null)[] = [null, null, null];
  const responsibility: Record<BaseIndex, string | null> = { 0: null, 1: null, 2: null };
  for (const move of movements) {
    if (typeof move.to !== 'number') continue;
    if (finalBases[move.to] !== null) return fail(`${move.to + 1}루에 여러 주자가 배치되었습니다.`);
    finalBases[move.to] = move.runnerId;
    responsibility[move.to] = context.runnerResponsiblePitcher[move.from];
  }
  if (batterHit && batterHit.bases < 4) {
    const destination = (batterHit.bases - 1) as BaseIndex;
    if (finalBases.slice(0, destination + 1).some((runner) => runner !== null)) return fail('안타 타자의 도착 루와 선행 주자의 배치가 충돌합니다.');
    finalBases[destination] = batterHit.runnerId;
    responsibility[destination] = batterHit.responsiblePitcherId;
  }
  // Final positions must preserve runner order; home crossings also have order.
  for (const trailing of movements) for (const leading of movements) {
    if (trailing.from >= leading.from || trailing.to === 'out') continue;
    if (typeof trailing.to === 'number' && typeof leading.to === 'number' && trailing.to > leading.to) return fail('후위 주자가 선행 주자를 추월한 배치입니다. 주자 아웃 판정을 확인하세요.');
    if (trailing.to === 'home' && (!third || trailing.sequence < third.sequence) &&
      (typeof leading.to === 'number' || (leading.to === 'home' && trailing.sequence < leading.sequence) ||
        (leading.to === 'out' && leading.outKind !== 'appeal' && trailing.sequence < leading.sequence))) return fail('홈 도달 순서와 선행 주자의 결과를 확인하세요.');
  }
  const resolved: ResolvedRunnerMovement[] = movements.map((move) => {
    let runDecision: ResolvedRunnerMovement['runDecision'] = move.to === 'home' ? 'counted' : 'not_home';
    if (move.to === 'home' && third) {
      if (third.kind === 'force' || third.kind === 'batter') runDecision = 'third_out';
      else if (third.kind === 'appeal' && third.from > move.from) runDecision = 'preceding_appeal';
      else if (move.sequence > third.sequence) runDecision = 'after_third_out';
    }
    return { ...move, responsiblePitcherId: context.runnerResponsiblePitcher[move.from], runDecision, runCounted: runDecision === 'counted' };
  });
  const runsAllowedBy: Record<string, number> = {};
  let runs = 0, unassignedRuns = 0;
  for (const move of resolved) {
    if (!move.runCounted) continue;
    runs++;
    if (move.responsiblePitcherId) {
      Object.defineProperty(runsAllowedBy, move.responsiblePitcherId, { value: (Object.hasOwn(runsAllowedBy, move.responsiblePitcherId) ? runsAllowedBy[move.responsiblePitcherId] : 0) + 1, enumerable: true, configurable: true });
    } else unassignedRuns++;
  }
  if (batterHit?.bases === 4) {
    runs++;
    const pitcher = batterHit.responsiblePitcherId;
    if (pitcher) Object.defineProperty(runsAllowedBy, pitcher, { value: (Object.hasOwn(runsAllowedBy, pitcher) ? runsAllowedBy[pitcher] : 0) + 1, enumerable: true, configurable: true });
    else unassignedRuns++;
  }
  if ((raw.rbi as number) > runs || (!batterOut && !batterHit && raw.rbi !== 0)) return fail('타점은 타자 결과가 있을 때 인정된 득점 수 이내로 입력하세요.');
  const after = captureScoringFrame(context);
  after.outs += outs.length;
  after.bases = finalBases;
  after.score[context.half === 'top' ? 'away' : 'home'] += runs;
  if (third) {
    after.half = context.half === 'top' ? 'bottom' : 'top';
    after.inning += context.half === 'bottom' ? 1 : 0;
    after.outs = 0;
    after.bases = [null, null, null];
    responsibility[0] = responsibility[1] = responsibility[2] = null;
  }
  const input: RunnerPlayInput = { id: raw.id, expected: captureRunnerPlayContext(context), movements, note: raw.note, rbi: raw.rbi as number, ...(batterOut ? { batterOut } : {}), ...(batterHit ? { batterHit } : {}) };
  return { ok: true, after, responsibility, record: { version: 1, input, movements: resolved, runs, outsAdded: outs.length, endedHalf: Boolean(third), runsAllowedBy, unassignedRuns } };
}

export function normalizeRunnerPlay(value: unknown): RunnerPlayRecord | undefined {
  if (!object(value) || value.version !== 1 || !object(value.input) || !validContext(value.input.expected)) return undefined;
  const result = resolveRunnerPlay(value.input.expected, value.input);
  return result.ok ? result.record : undefined;
}

export function runnerMovementSummary(move: ResolvedRunnerMovement): string {
  // Keep legacy run parsing compatible: only an allowed run contains 득점.
  const label = move.to === 'home' ? (move.runCounted ? `${move.from + 1}루→홈 득점` : '홈 도달 무효') :
    move.to === 'out' ? `${move.outKind === 'force' ? '포스' : move.outKind === 'appeal' ? '어필' : '태그'} 아웃` :
      move.to === move.from ? '정지' : `${move.from + 1}루→${move.to + 1}루 진루`;
  return `${RUNNER_CAUSE_LABELS[move.cause]} · ${move.from + 1}루 주자 ${label} · ${move.runnerId}`;
}

export function runnerPlayAuditRows(events: { eventId?: string; runnerPlay?: RunnerPlayRecord }[]): string[][] {
  return events.flatMap((event) => {
    if (!event.runnerPlay) return [];
    const record = event.runnerPlay;
    const rows = record.movements.map((move) => [event.eventId ?? record.input.id, record.input.id, move.runnerId,
      String(move.from + 1), typeof move.to === 'number' ? String(move.to + 1) : move.to === 'home' ? '홈' : '아웃',
      String(move.sequence), RUNNER_CAUSE_LABELS[move.cause], move.outKind ?? '-',
      move.responsiblePitcherId ?? '미확인', move.to !== 'home' ? '-' : move.runCounted ? '인정' : `무효: ${move.runDecision}`,
      record.input.batterOut ? `타자 아웃 ${record.input.batterOut.sequence}번째` : '-', String(record.input.rbi), record.input.note]);
    const hit = record.input.batterHit;
    if (hit) rows.push([event.eventId ?? record.input.id, record.input.id, hit.runnerId, '타석', hit.bases === 4 ? '홈' : String(hit.bases),
      String(hit.sequence), hit.bases === 4 ? '홈런' : `${hit.bases}루타`, '-', hit.responsiblePitcherId ?? '미확인', hit.bases === 4 ? '인정' : '-',
      '안타', String(record.input.rbi), record.input.note]);
    return rows;
  });
}

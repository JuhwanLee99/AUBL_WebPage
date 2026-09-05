import type { OfficialBatterGameRow, OfficialGameDetailTeam } from '@core/api/backendClient';

// Closed vocabulary from the collected score sheets. Unknown notation must not
// silently advance the lineup. These categories are NOT a statistics calculator.
const plateResults = new Set(['볼넷', '고의사구', '사구', '삼진', '낫아웃+', '낫아웃-', '타격방해', '1루타', '2루타', '3루타', '홈런']);
const fieldResult = /^(?:[123투포유]|좌|중|우|좌중|우중|인좌|인우)(?:월|전)?(?:안|번안|2|3|홈|땅R?|플|파플|인플|직|실|병|직병|야선|희플출?|희번출?)$/;
const contextResults = new Set(['도루', '도루자', '폭투', '포일', '송구실책', '포구실책', '견제사', '주자아웃', '런다운', '보크', '주루방해', '대타', '대주자', '대수비']);

export interface SourceBattingEntry {
  row: OfficialBatterGameRow;
  entryIndex: number;
  result: string | null;
}
export interface OrderedPlateAppearance extends SourceBattingEntry {
  result: string;
  partIndex: number;
  context: string[];
}
export interface OfficialBattingInning {
  inning: number;
  mode: 'reconstructed' | 'source';
  reason: string | null;
  startOrder: number | null;
  nextOrder: number | null;
  appearances: OrderedPlateAppearance[];
  sourceEntries: SourceBattingEntry[];
  contextEntries: SourceBattingEntry[];
}

function splitEntry(entry: SourceBattingEntry): OrderedPlateAppearance[] | null {
  const tokens = entry.result?.split(',').map(token => token.normalize('NFKC').trim());
  if (!tokens?.length || tokens.some(token => !token)) return null;
  const appearances: OrderedPlateAppearance[] = [];
  const leadingContext: string[] = [];
  for (const token of tokens) {
    if (plateResults.has(token) || fieldResult.test(token)) {
      appearances.push({ ...entry, result: token, partIndex: appearances.length, context: appearances.length ? [] : [...leadingContext] });
    } else if (contextResults.has(token)) {
      // Keep runner/substitution notation as source context, never as another PA
      // or as a time-ordered event relative to another player's plate appearance.
      const previous = appearances.at(-1);
      (previous ? previous.context : leadingContext).push(token);
    } else {
      return null;
    }
  }
  return appearances;
}

/** Read-only replay projection. Carries the next lineup slot between innings,
 * consumes repeated visits cyclically, and refuses incomplete/ambiguous order.
 * No outs, runs, RBI, base occupancy or official aggregate stats are inferred. */
export function buildOfficialBattingFlow(team: OfficialGameDetailTeam): OfficialBattingInning[] {
  const innings = [...new Set(team.batters.flatMap(row => row.plateAppearances.map(entry => entry.inning ?? 0)))].sort((a, b) => a - b);
  let nextOrder: number | null = 1;
  let previousInning = 0;
  return innings.map((inning): OfficialBattingInning => {
    const sourceEntries = team.batters.flatMap(row => row.plateAppearances.flatMap((entry, entryIndex) =>
      (entry.inning ?? 0) === inning ? [{ row, entryIndex, result: entry.result }] : []));
    const fallback = (reason: string): OfficialBattingInning => {
      nextOrder = null;
      previousInning = inning;
      return { inning, mode: 'source', reason, startOrder: null, nextOrder: null, appearances: [], sourceEntries, contextEntries: [] };
    };
    if (!Number.isInteger(inning) || inning < 1) return fallback('이닝 정보가 없어 타석 순서를 확인할 수 없습니다.');
    if (inning !== previousInning + 1 || nextOrder == null) return fallback('앞 이닝의 타순을 확인할 수 없어 원본 표기로 표시합니다.');
    const queues = new Map<number, OrderedPlateAppearance[]>();
    const contextEntries: SourceBattingEntry[] = [];
    for (const entry of sourceEntries) {
      const parts = splitEntry(entry);
      if (parts == null) return fallback('분류되지 않은 결과 표기가 있어 원본 확인이 필요합니다.');
      if (!parts.length) { contextEntries.push(entry); continue; }
      const order = entry.row.battingOrder;
      if (order == null || !Number.isInteger(order) || order < 1 || order > 9) return fallback('타순 정보가 없거나 범위를 벗어났습니다.');
      const queue = queues.get(order) ?? [];
      if (queue.some(part => part.row !== entry.row)) return fallback('같은 타순의 여러 선수 기록이 있어 교체 순서 확인이 필요합니다.');
      queues.set(order, [...queue, ...parts]);
    }
    if (!queues.size) return fallback('타석 종료 결과가 없어 다음 타순을 확인할 수 없습니다.');
    const startOrder = nextOrder;
    const count = [...queues.values()].reduce((sum, queue) => sum + queue.length, 0);
    const appearances: OrderedPlateAppearance[] = [];
    for (let index = 0; index < count; index += 1) {
      const part = queues.get(nextOrder)?.shift();
      if (!part) return fallback(`${nextOrder}번 타자의 기록 연결이 끊겨 타석 순서 확인이 필요합니다.`);
      appearances.push(part);
      nextOrder = nextOrder % 9 + 1;
    }
    previousInning = inning;
    return { inning, mode: 'reconstructed', reason: null, startOrder, nextOrder, appearances, sourceEntries, contextEntries };
  });
}

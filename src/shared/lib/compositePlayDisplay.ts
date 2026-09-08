import type { CompositeRecord } from './compositePlayEngine.ts';

const FIELDERS: Record<string, string> = {
  '1': '투수', '2': '포수', '3': '1루수', '4': '2루수', '5': '3루수',
  '6': '유격수', '7': '좌익수', '8': '중견수', '9': '우익수',
};
const ERROR_KINDS = {
  fielding: '포구 실책', throwing: '송구 실책', catching: '송구 포구 실책', foul_drop: '파울 낙구 실책',
};

// Presentation only. Keep version-1 canonical feed and audit IDs unchanged:
// normalizeCompositePlay compares them against a replay of the original input.
export function formatCompositeFeed(record: CompositeRecord): string[] {
  return record.feed.map(original => {
    let line = original;
    record.input.errors.forEach((error, index) => {
      const reference = `실책 ${index + 1}`;
      line = line.replace(
        `E${error.fielder} ${error.kind} [${error.id}]`,
        `${reference}: ${FIELDERS[error.fielder] ?? error.fielder} ${ERROR_KINDS[error.kind]} (E${error.fielder})`,
      );
      line = line.replaceAll(`[${error.id}]`, `[${reference}]`);
    });
    return line;
  });
}

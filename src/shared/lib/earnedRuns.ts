export type EarnedRunsStatus = 'estimated' | 'unconfirmed' | 'confirmed';

const validRuns = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

// Numeric legacy data alone is not evidence of a scorer's confirmation.
export function normalizeEarnedRunsStatus(status: unknown, er: unknown): EarnedRunsStatus {
  if (!validRuns(er)) return 'unconfirmed';
  return status === 'estimated' || status === 'confirmed' ? status : 'unconfirmed';
}

export function serializeEarnedRuns(er: unknown, outs: unknown, status: unknown) {
  const earnedRunsStatus = normalizeEarnedRunsStatus(status, er);
  const canCalculate = earnedRunsStatus !== 'unconfirmed' && validRuns(er)
    && typeof outs === 'number' && Number.isSafeInteger(outs) && outs > 0;
  return {
    earnedRunsStatus,
    ...(validRuns(er) ? { er } : {}),
    ...(canCalculate ? { era: Number(((er * 27) / outs).toFixed(2)) } : {}),
  };
}

export function earnedRunsView(er: unknown, outs: unknown, status: unknown) {
  const value = serializeEarnedRuns(er, outs, status);
  const label = value.earnedRunsStatus === 'confirmed' ? '기록원 확인'
    : value.earnedRunsStatus === 'estimated' ? '추정' : '미확정';
  return {
    status: value.earnedRunsStatus,
    label,
    er: value.earnedRunsStatus === 'unconfirmed' ? '미확정'
      : `${value.er}${value.earnedRunsStatus === 'estimated' ? ' (추정)' : ''}`,
    era: value.era === undefined ? '-'
      : `${value.era.toFixed(2)}${value.earnedRunsStatus === 'estimated' ? ' (추정)' : ''}`,
  };
}

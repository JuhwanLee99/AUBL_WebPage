import type { HomeStandingRow, PlayoffProjectionBucket } from './types';

const buckets: PlayoffProjectionBucket[] = ['eutteum', 'beogeum', 'out'];
const whole = (value: string) => /^(0|[1-9]\d*)$/.test(value);

// Round intervals outwards. An exact displayed 100% must really be 100%,
// never a rounding artifact from a small but nonzero chance of another bucket.
export function formatCaseShare(lower: bigint, upper: bigint, total: bigint) {
  if (total <= 0n || lower < 0n || upper < lower || upper > total) return '-';
  const percent = (tenths: bigint) => `${Number(tenths) / 10}%`;
  if (lower !== upper) {
    return `${Number(lower * 1000n / total) / 10}~${Number((upper * 1000n + total - 1n) / total) / 10}%`;
  }
  if (lower === 0n) return '0%';
  if (lower === total) return '100%';
  if (lower * 1000n < total) return '<0.1%';
  if (lower * 1000n > 999n * total) return '>99.9%';
  return percent((lower * 1000n * 2n + total) / (total * 2n));
}

export function qualificationOdds(row: HomeStandingRow) {
  const official: PlayoffProjectionBucket | null = row.qualification === 'confirmed-eutteum' ? 'eutteum'
    : row.qualification === 'confirmed-beogeum' ? 'beogeum'
      : row.qualification === 'confirmed-out' ? 'out' : null;
  const p = row.projection, d = p?.distribution;
  const missing = { official, available: false as const, reason: p?.exhausted ? '계산 완료 후 비율을 안내합니다.' : '경기 기록 확인 후 비율을 안내합니다.' };
  // Never treat a DFS prefix as a representative sample or renormalize it.
  if (!p || p.exhausted || !d || ![d.totalCases, d.countedCases, d.unresolvedCases].every(whole)) return missing;
  const total = BigInt(d.totalCases), unresolved = BigInt(d.unresolvedCases);
  if (d.countedCases !== p.scenarioCount || (p.expectedScenarios && d.totalCases !== p.expectedScenarios)) return missing;
  if (total <= 0n || BigInt(d.countedCases) !== total || unresolved > total || d.buckets.length !== 3) return missing;
  const rows = buckets.map(bucket => {
    const value = d.buckets.find(item => item.bucket === bucket);
    if (!value || !whole(value.guaranteedCases) || !whole(value.possibleCases)) return null;
    const lower = BigInt(value.guaranteedCases), upper = BigInt(value.possibleCases);
    if (lower > upper || upper > total || upper - lower > unresolved) return null;
    return { bucket, lower, upper, label: formatCaseShare(lower, upper, total), confirmed: lower === total };
  });
  if (rows.some(item => !item)) return missing;
  const values = rows.filter(item => item != null);
  if (values.reduce((sum, item) => sum + item.lower, 0n) + unresolved !== total) return missing;
  // Official decisions are authoritative; do not put contradictory calculations
  // next to an official confirmation badge.
  if (official && values.find(item => item.bucket === official)?.lower !== total) return { ...missing, reason: '공식 확정 결과를 우선 표시합니다.' };
  return {
    official, available: true as const, values,
    confirmed: values.find(item => item.confirmed)?.bucket ?? null,
    hasUnresolved: unresolved > 0n,
    unresolvedLabel: formatCaseShare(unresolved, unresolved, total),
    assumption: d.model === 'equal-win-loss-draw' ? '남은 경기마다 승·패·무가 각각 1/3이라고 가정' : '남은 경기마다 승·패가 각각 1/2이라고 가정',
  };
}

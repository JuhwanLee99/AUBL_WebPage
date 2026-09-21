import type { HomeStandingRow, PlayoffProjectionBucket } from './types';
import type { RankCase } from './qualificationScenarios';

export const projectionBucketLabel = (bucket: PlayoffProjectionBucket) => bucket === 'eutteum' ? '으뜸권' : bucket === 'beogeum' ? '버금권' : '탈락권';

export function rankCaseExplanation(example: Pick<RankCase, 'conditional' | 'reasons'>) {
  if (!example.conditional) return { label: '예시', detail: '' };
  if (example.reasons.some(reason => reason.includes('득실점'))) return {
    label: '득실점에 따라 결정',
    detail: '아래 승패무 결과에서는 승률과 승자승이 같아집니다. 남은 경기의 득실점을 비교해야 이 순위가 될지 알 수 있습니다.',
  };
  if (example.reasons.some(reason => reason.includes('결정경기'))) return {
    label: '결정경기 필요',
    detail: '아래 결과에서는 승률·승자승·맞대결 득실차까지 같습니다. 별도 결정경기의 승패로 순위를 정해야 합니다.',
  };
  return {
    label: '동률 규정 확인 필요',
    detail: example.reasons.some(reason => reason.includes('4팀'))
      ? '아래 결과에서는 4팀 이상이 같은 승률입니다. 적용할 동률 해소 절차를 운영진이 확인해야 합니다.'
      : '회칙의 동률 기준을 적용해도 순위가 갈리지 않습니다. 운영진의 확인이 필요합니다.',
  };
}

export function projectionStatus(row: HomeStandingRow) {
  const official = row.qualification === 'confirmed-eutteum' ? '으뜸권'
    : row.qualification === 'confirmed-beogeum' ? '버금권' : row.qualification === 'confirmed-out' ? '예선 탈락' : null;
  if (official) return { kind: 'bucket-fixed', label: `${official} 확정`, detail: '운영진 공식 확정' };
  const p = row.projection;
  if (!p || !p.possibleBuckets.length || p.minPossibleRank < 1) return { kind: 'unavailable', label: '기록 확인 중', detail: '경기 기록 확인 후 안내' };
  if (p.exhausted) return { kind: 'partial', label: '계산 미완료', detail: '아직 순위를 확정할 수 없습니다' };
  if (p.minPossibleRank === p.maxPossibleRank) return { kind: 'rank-fixed', label: `${p.minPossibleRank}위 고정`, detail: `${projectionBucketLabel(p.possibleBuckets[0]!)} · 계산상 확정` };
  if (p.possibleBuckets.length === 1) return { kind: 'bucket-fixed', label: `${projectionBucketLabel(p.possibleBuckets[0]!)} 유지`, detail: `${p.minPossibleRank}~${p.maxPossibleRank}위 · 순위 미확정` };
  const unresolved = p.rankCases?.filter(item => item.conditional) ?? [];
  if (unresolved.length) {
    const explanations = [...new Set(unresolved.map(item => rankCaseExplanation(item).label))];
    return { kind: 'conditional', label: '동률에 따라 순위 변동', detail: explanations.join(' / ') };
  }
  return { kind: 'open', label: '구간 이동 가능', detail: p.possibleBuckets.map(projectionBucketLabel).join(' / ') };
}

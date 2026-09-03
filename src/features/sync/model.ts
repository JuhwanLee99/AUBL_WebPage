import type {
  UniquePlaySessionStatus,
  UniquePlaySyncDiffAction,
  UniquePlaySyncEntityType,
  UniquePlaySyncRunStatus,
  UniquePlayValidationStatus,
} from '@core/contracts/uniquePlaySync';

const POLLING_STATUSES = new Set<UniquePlaySyncRunStatus>([
  'QUEUED',
  'RUNNING',
  'VALIDATING',
  'PUBLISHING',
  'ACTIVATING',
]);

const DIFF_STATUSES = new Set<UniquePlaySyncRunStatus>([
  'REVIEW_REQUIRED',
  'VALIDATING',
  'VALIDATION_FAILED',
  'READY_TO_PUBLISH',
  'PUBLISHING',
  'PUBLISHED',
  'ACTIVATING',
  'ACTIVE',
  'REPAIR_REQUIRED',
]);

export const SYNC_ACTIONS = ['CREATE', 'UPDATE', 'DELETE', 'CONFLICT', 'UNCHANGED'] as const;

export const SYNC_ENTITIES = [
  'SEASON',
  'GROUP',
  'TEAM',
  'PLAYER',
  'GAME',
  'GAME_RECORD',
  'BATTER_STAT',
  'PITCHER_STAT',
] as const;

export function isUniquePlayRunPolling(status: UniquePlaySyncRunStatus): boolean {
  return POLLING_STATUSES.has(status);
}

export function isUniquePlayDiffAvailable(status: UniquePlaySyncRunStatus): boolean {
  return DIFF_STATUSES.has(status);
}

export function syncRunStatusLabel(status: UniquePlaySyncRunStatus, rawStatus?: string): string {
  const labels: Record<UniquePlaySyncRunStatus, string> = {
    QUEUED: '대기 중',
    RUNNING: '자료 수집 중',
    REVIEW_REQUIRED: '변경 검토 필요',
    VALIDATING: '검증 중',
    VALIDATION_FAILED: '검증 실패',
    READY_TO_PUBLISH: '게시 준비 완료',
    PUBLISHING: '리비전 생성 중',
    PUBLISHED: '리비전 생성 완료',
    ACTIVATING: '활성화 중',
    ACTIVE: '활성화 완료',
    REPAIR_REQUIRED: '교차 저장소 복구 필요',
    FAILED: '실행 실패',
    CANCELED: '실행 취소',
    REAUTH_REQUIRED: '재인증 필요',
    UNKNOWN: rawStatus ? `확인 필요 (${rawStatus})` : '상태 확인 필요',
  };
  return labels[status];
}

export function syncSessionStatusLabel(status: UniquePlaySessionStatus): string {
  const labels: Record<UniquePlaySessionStatus, string> = {
    READY: '연결됨',
    CONNECTING: '연결 확인 중',
    REAUTH_REQUIRED: '재인증 필요',
    UNAVAILABLE: '사용 불가',
    UNKNOWN: '상태 확인 필요',
  };
  return labels[status];
}

export function syncValidationStatusLabel(status: UniquePlayValidationStatus): string {
  const labels: Record<UniquePlayValidationStatus, string> = {
    NOT_RUN: '검증 전',
    RUNNING: '검증 중',
    PASSED: '검증 통과',
    FAILED: '검증 실패',
    UNKNOWN: '상태 확인 필요',
  };
  return labels[status];
}

export function syncEntityLabel(entity: UniquePlaySyncEntityType): string {
  const labels: Record<UniquePlaySyncEntityType, string> = {
    SEASON: '시즌',
    GROUP: '조',
    TEAM: '팀',
    PLAYER: '선수',
    GAME: '경기',
    GAME_RECORD: '경기 기록',
    BATTER_STAT: '타자 기록',
    PITCHER_STAT: '투수 기록',
    UNKNOWN: '기타',
  };
  return labels[entity];
}

export function syncActionLabel(action: UniquePlaySyncDiffAction): string {
  const labels: Record<UniquePlaySyncDiffAction, string> = {
    CREATE: '추가',
    UPDATE: '변경',
    DELETE: '삭제 후보',
    UNCHANGED: '변경 없음',
    CONFLICT: '충돌',
    UNKNOWN: '확인 필요',
  };
  return labels[action];
}

export function formatSyncDateTime(value: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

const SENSITIVE_FIELD_PATTERN = /(password|passwd|token|secret|email|e-mail|phone|cell|mobile|uid|credential)/i;

export function formatSyncDiffValue(value: unknown, field: string): string {
  if (SENSITIVE_FIELD_PATTERN.test(field)) return '보호된 값';
  if (value == null || value === '') return '—';
  if (typeof value === 'boolean') return value ? '예' : '아니요';
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  if (typeof value === 'string') return value.length > 180 ? `${value.slice(0, 177)}…` : value;
  if (Array.isArray(value)) return `항목 ${value.length}개`;
  return '구조화된 데이터';
}

export function safeSyncReauthUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, window.location.origin);
    const allowedHost = url.origin === window.location.origin
      || url.hostname === 'aubl.club'
      || url.hostname.endsWith('.aubl.club')
      || url.hostname === 'unique-play.com'
      || url.hostname.endsWith('.unique-play.com');
    const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !localHttp) || !allowedHost && !localHttp) return null;
    return url.toString();
  } catch {
    return null;
  }
}

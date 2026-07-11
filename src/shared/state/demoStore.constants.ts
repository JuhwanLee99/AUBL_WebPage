export const TRASH_RETENTION_MS = 1000 * 60 * 60 * 24 * 30; // 30일 보관

export const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAILS ?? '')
  .split(',')
  .map((email: string) => email.trim().toLowerCase())
  .filter(Boolean);

export const FEED_LIMIT = 50; // 관중 뷰 기본 구독 크기 (최신 50개)
export const SCORER_FEED_LIMIT = 200; // 기록원 재접속 시 충분한 버퍼
export const SPECTATOR_EXPANDED_FEED_LIMIT = 1000; // 더보기 클릭 시 확장 구독 크기

export const WRITE_DEBOUNCE_MS = 1_000; // 기록원 상태 동기화 디바운스 (쓰기 폭주 방지)

export const SCORER_LOCK_TTL_MS = 300_000; // 5분 후 락 만료 (이닝 교대 대비 여유)
export const SCORER_LOCK_HEARTBEAT_MS = 60_000; // 60초마다 하트비트 갱신

export const PRESENCE_TTL_MS = 300_000; // 5분 후 동접자 만료
export const PRESENCE_HEARTBEAT_MS = 120_000; // 120초마다 동접자 하트비트 갱신
export const PRESENCE_POLL_INTERVAL_MS = 12_000; // 접속자 집계 폴링 주기

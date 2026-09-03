import type { AllStarEventConfig, AllStarPosition, AllStarTeam } from '../types';

export const ALL_STAR_POSITIONS: readonly AllStarPosition[] = [
  'P',
  'C',
  '1B',
  '2B',
  '3B',
  'SS',
  'OF',
];

export const POSITION_LABELS: Record<AllStarPosition, string> = {
  P: '투수',
  C: '포수',
  '1B': '1루수',
  '2B': '2루수',
  '3B': '3루수',
  SS: '유격수',
  OF: '외야수',
};

export const TEAM_META: Record<AllStarTeam, { label: string; groups: string; tone: 'coral' | 'blue' }> = {
  TEAM_1: { label: '1팀', groups: 'A · C · E · G조', tone: 'blue' },
  TEAM_2: { label: '2팀', groups: 'B · D · F · H조', tone: 'coral' },
};

// 로컬 UI 검수용 기본값입니다. 운영 상태·일정·정책은 callable이 반환하는
// Firestore 이벤트 설정이 기준이며, 이 객체를 수정해 투표를 열지 않습니다.
export const ALL_STAR_EVENT_CONFIG: AllStarEventConfig = {
  eventId: 'aubl-2026-allstar',
  candidateVersion: 'draft-2026-07-11',
  seasonLabel: '2026 AUBL',
  status: 'DRAFT',
  votePolicy: 'ONCE_PER_EVENT',
  maxSelectionsByPosition: {
    P: 1,
    C: 1,
    '1B': 1,
    '2B': 1,
    '3B': 1,
    SS: 1,
    OF: 6,
  },
  opensAt: null,
  closesAt: null,
  gameStartsAt: null,
  venue: null,
};

// `src/shared/types/index.ts`

export type LeagueDivision = 'EUTTEUM' | 'BEOGEUM'; // 으뜸/버금

export interface Team {
  id: string;
  name: string;
  university: string;
  division: LeagueDivision;
  logoColor: string; // 로고 이미지 대신 색상으로 대체 (프로토타입용)
  founded: number;
}

export interface MatchResult {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  isFinished: boolean;
}

export interface TeamRanking {
  teamId: string;
  teamName: string;
  wins: number;
  losses: number;
  draws: number;
  eloRating: number;
  btIndex: number; // Bradley-Terry Index
}

export interface PlayerSeasonStat {
  id: string;
  teamId: string;
  name: string;
  position: string;
  year: number;
  war: number;
  era?: number;
  ops?: number;
  avg?: number;
  obp?: number;
  slug?: number;
  stolenBases?: number;
  note?: string;
}

export interface TeamSeasonRecord {
  teamId: string;
  year: number;
  wins: number;
  losses: number;
  draws: number;
  era: number;
  ops: number;
  stolenBases: number;
  keyMoment: string;
  captains: string[];
  players: PlayerSeasonStat[];
}

export type NoticeCategory = '일반' | '징계' | '경기공지' | '긴급' | '심판/기록원 모집';

export interface Notice {
  id: string;
  title: string;
  category: NoticeCategory;
  content: string; // 간단한 텍스트 또는 HTML
  author: string;
  createdAt: number;
  isImportant?: boolean; // 긴급/중요 상단 고정용
  allowComments?: boolean; // 댓글 허용 여부 (없으면 true로 취급)
}

export type TeamMemberRole = 'player' | 'staff' | 'coach';

export interface TeamMember {
  uid: string;
  name: string;
  role: TeamMemberRole;
  number?: string;
  position?: string;
  bats?: string;
  throws?: string;
  profileImageUrl?: string;
  profileBio?: string;
  joinedAt?: number;
  status?: 'active' | 'inactive';
}

export type TeamNoticeCategory = '일반' | '훈련' | '경기' | '긴급';

export interface TeamNotice {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  createdByUid?: string | null;
  createdByName?: string | null;
  category?: TeamNoticeCategory;
  pinned?: boolean;
}

export interface TeamNoticeComment {
  id: string;
  noticeId: string;
  uid: string;
  author: string;
  content: string;
  createdAt: number;
  parentId?: string | null;
  likedBy?: string[];
  likeCount?: number;
}

export type InquiryPlatform = 'app' | 'web';
export type InquiryCategory = '기능 개선' | '버그 신고' | '사용 문의' | '경기/기록 오류' | '기타';
export type InquiryStatus = '미처리' | '처리 중' | '처리 완료';

export interface InquiryPost {
  id: string;
  title: string;
  content: string;
  author: string;
  uid: string;
  platform: InquiryPlatform;
  category: InquiryCategory;
  isPrivate: boolean;
  status: InquiryStatus;
  createdAt: number;
  updatedAt?: number;
}

export interface InquiryComment {
  id: string;
  content: string;
  author: string;
  uid: string;
  createdAt: number;
}

export type PlayerRegistrationCategory = '선수 등록' | '유니폼 등록';

export interface PlayerRegistrationPost {
  id: string;
  title: string;
  content: string;
  author: string;
  uid: string;
  category: PlayerRegistrationCategory;
  createdAt: number;
  updatedAt?: number;
}

export interface UserProfile {
  uid: string;
  email?: string | null;
  emailLower?: string | null;
  displayName?: string | null;
  createdAt?: string | null;
  lastSignInAt?: string | null;
  updatedAt?: number | null;
}

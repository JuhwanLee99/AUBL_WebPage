import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import gsap from 'gsap';

/* ─── 타입 ─── */

type ManualSection = {
  id: string;
  title: string;
  icon: string;
  accent: string;
  items: ManualItem[];
};

type ManualItem = {
  heading: string;
  bullets: string[];
  screenshot?: string; // 이미지 경로 (없으면 placeholder)
};

/* ─── 플랫폼 / 역할 타입 ─── */

const PLATFORM_TABS = ['웹', '앱'] as const;
type PlatformTab = (typeof PLATFORM_TABS)[number];

const ROLE_TABS = ['방문자', '일반 회원', '관리자/기록원'] as const;
type RoleTab = (typeof ROLE_TABS)[number];

/* ══════════════════════════════════════════
   웹 콘텐츠
   ══════════════════════════════════════════ */

const WEB_GUEST_SECTIONS: ManualSection[] = [
  {
    id: 'web-guest-main',
    title: '메인 및 리그 정보',
    icon: '🏠',
    accent: '#60A5FA',
    items: [
      {
        heading: '랜딩 페이지 (/)',
        bullets: [
          '상단 LIVE INFO(티커)에서 긴급 공지/실시간 경기 상태를 확인하세요.',
          '주요 시즌 하이라이트와 주요 링크가 카드 형태로 표시됩니다.',
        ],
      },
      {
        heading: '리그 소개 (/intro)',
        bullets: [
          '리그 역사, 조직 구조, 운영 정보를 한눈에 확인할 수 있습니다.',
          '회장단 인사말, 역사와 유산, 참가 팀 정보가 포함됩니다.',
        ],
      },
      {
        heading: '회칙 (/rules)',
        bullets: [
          '챕터/조항 단위 아코디언으로 회칙 내용을 열람합니다.',
          '주최 순서와 부칙 정보도 함께 확인 가능합니다.',
        ],
      },
      {
        heading: '참가팀 · 조편성 (/intro/teams)',
        bullets: ['조별(A~H) 참가팀 목록을 확인합니다.'],
      },
      {
        heading: '팀 허브 (/teams)',
        bullets: ['전체 팀 검색 및 팀 상세 페이지로 진입합니다.'],
      },
    ],
  },
  {
    id: 'web-guest-schedule',
    title: '경기 일정 및 결과',
    icon: '📅',
    accent: '#22C55E',
    items: [
      { heading: '경기 일정 (/schedule)', bullets: ['전체 일정을 리스트/캘린더 기반으로 탐색합니다.'] },
      { heading: '라이브 일정 (/schedule/live)', bullets: ['현재 진행 중인 경기만 모아서 확인합니다.'] },
      { heading: '경기 결과 (/schedule/results)', bullets: ['종료된 경기의 스코어와 기록 요약을 확인합니다.'] },
      { heading: '조별 일정 (/schedule/groups)', bullets: ['조(A~H) 기반 필터로 해당 조 경기만 조회합니다.'] },
      { heading: '연습경기 (/schedule/practice)', bullets: ['연습경기 전용 일정을 별도로 조회합니다.'] },
    ],
  },
  {
    id: 'web-guest-records',
    title: '순위 및 기록실',
    icon: '📊',
    accent: '#F97316',
    items: [
      {
        heading: '기록 허브 (/records)',
        bullets: [
          '개요(overview), 팀 순위(standings), 투수 기록(pitchers), 타자 기록(batters), 파워랭킹(power) 탭을 전환하며 조회합니다.',
          '시즌 선택, 정렬 기준 변경, 검색/필터 기능을 활용하세요.',
        ],
      },
      {
        heading: '선수 상세 (/records/player)',
        bullets: ['선수 단위 시즌/게임 로그를 조회합니다.', '이름 검색, 팀 필터 등으로 원하는 선수를 탐색합니다.'],
      },
    ],
  },
  {
    id: 'web-guest-live',
    title: '경기 중계 시청',
    icon: '📺',
    accent: '#A855F7',
    items: [
      { heading: '스코어보드 (/scoreboard)', bullets: ['라이브 점수, 이닝, BSO(볼-스트라이크-아웃), 라인스코어를 실시간으로 확인합니다.'] },
      { heading: '문자 중계 (/scoreboard-text)', bullets: ['텍스트 기반으로 실시간 경기 상황을 확인합니다.'] },
      { heading: '라이브 오버레이 (/live-overlay)', bullets: ['방송 송출용 오버레이 화면을 확인합니다.'] },
    ],
  },
];

const WEB_MEMBER_SECTIONS: ManualSection[] = [
  {
    id: 'web-member-auth',
    title: '로그인 및 계정 관리',
    icon: '🔐',
    accent: '#60A5FA',
    items: [
      {
        heading: '로그인/회원가입 (/login)',
        bullets: ['이메일 또는 소셜(구글) 계정으로 로그인/회원가입합니다.', 'Apple 로그인은 iOS 앱에서 지원합니다.'],
      },
      {
        heading: '계정 페이지 (/account)',
        bullets: [
          '계정 기본 정보(UID, 이메일, 역할)를 확인합니다.',
          '역할/권한 확인, 로그아웃, 회원 탈퇴(재인증 후 처리)가 가능합니다.',
          '계정 삭제 안내 페이지(/account-deletion)에서 웹/앱 삭제 절차를 확인할 수 있습니다.',
        ],
      },
    ],
  },
  {
    id: 'web-member-community',
    title: '커뮤니티 이용',
    icon: '💬',
    accent: '#22C55E',
    items: [
      { heading: '커뮤니티 메인 (/community)', bullets: ['갤러리, 공지, 건의/문의 최근 글을 한눈에 확인합니다.'] },
      { heading: '공지 목록 (/community/notices)', bullets: ['카테고리(일반/경기공지/징계/긴급) 기반으로 공지를 확인합니다.'] },
      { heading: '공지 상세', bullets: ['상세 내용을 열람하고, 설정된 공지에 대해 댓글을 사용할 수 있습니다.'] },
      {
        heading: '건의/문의 게시판 (/community/inquiry)',
        bullets: [
          '플랫폼(앱/웹), 말머리(5종), 처리상태 필터 및 제목/작성자 검색',
          '말머리: 기능 개선 / 버그 신고 / 사용 문의 / 경기·기록 오류 / 기타',
          '비밀글은 목록에 표시되지만 작성자 및 관리자만 열람 가능',
          '로그인한 사용자가 글쓰기 가능, 본인 및 관리자는 수정/삭제 가능',
          '각 글에 댓글 작성(로그인 필요) 및 본인 댓글 삭제 기능 제공',
        ],
      },
      {
        heading: '건의/문의 작성 (/community/inquiry/new)',
        bullets: [
          '플랫폼(앱/웹) 선택 — 웹에서 작성 시 웹이 기본 선택됨',
          '말머리(카테고리) 선택 후 제목/내용 작성',
          '비밀글 설정 가능',
        ],
      },
    ],
  },
  {
    id: 'web-member-team',
    title: '팀 상세 및 팀 공지',
    icon: '⚾',
    accent: '#F97316',
    items: [
      { heading: '팀 상세 (/teams/:teamId)', bullets: ['팀 소개, 로스터, 팀 공지를 확인합니다.'] },
      {
        heading: '팀 공지 게시판',
        bullets: [
          '카테고리(일반/훈련/경기/긴급) 필터, 고정 공지 우선 노출',
          '제목/내용/작성자 검색 및 결과 개수 확인',
          '댓글/답글 작성, 좋아요, 본인 댓글 삭제',
        ],
      },
    ],
  },
  {
    id: 'web-member-coach',
    title: '감독(Coach) 팀 홈 관리',
    icon: '👨‍💼',
    accent: '#A855F7',
    items: [
      { heading: '팀 브랜딩/소개 관리', bullets: ['엠블럼(로고) URL 변경, 짧은 소개/상세 소개/연혁 수정'] },
      { heading: '팀 일정 운영 관리', bullets: ['팀 홈에서 예정/진행 경기 및 최근 결과 빠르게 확인', '전체 일정(/schedule)·결과(/schedule/results) 화면에서 관리'] },
      { heading: '선수 로스터 관리', bullets: ['선수/스태프 등록 및 제거', '등번호, 포지션, 투/타, 프로필 이미지/소개 수정'] },
      {
        heading: '팀 공지사항 운영',
        bullets: ['공지 작성: 제목/본문/카테고리 지정 후 등록', '공지 고정/해제: 중요 공지 상단 유지', '공지 삭제: 운영 정책에 맞는 공지 정리'],
      },
    ],
  },
];

const WEB_ADMIN_SECTIONS: ManualSection[] = [
  {
    id: 'web-admin-panel',
    title: '관리자 패널 (/admin)',
    icon: '🛡️',
    accent: '#EF4444',
    items: [
      { heading: '랜딩 관리 (/admin/landing)', bullets: ['LIVE INFO 티커, 메인 히어로 문구, 스냅샷 카드 등을 편집합니다.'] },
      { heading: '리그 소개 관리 (/admin/intro)', bullets: ['소개/히스토리/구조/포스트시즌 등 소개 콘텐츠를 편집합니다.'] },
      { heading: '회칙 관리 (/admin/rules)', bullets: ['회칙 헤더/챕터 JSON 구조를 편집합니다.'] },
      { heading: '팀 소개 관리 (/admin/teams)', bullets: ['참가팀/조편성 및 관련 문구를 편집합니다.'] },
      { heading: '권한 관리 (/admin/roles)', bullets: ['감독 권한 부여/해제를 관리합니다.'] },
      { heading: '서비스 점검 (/admin/maintenance)', bullets: ['점검 모드 ON/OFF 토글 — 관리자 외 모든 접근 차단', '서비스 재개 예정일 및 점검 메시지 설정', '저장 즉시 실시간 반영 (재배포 불필요)'] },
    ],
  },
  {
    id: 'web-admin-community',
    title: '공지 및 건의/문의 관리',
    icon: '💬',
    accent: '#22C55E',
    items: [
      {
        heading: '공지사항 작성 (/community/notices/new)',
        bullets: [
          '관리자 전용 공지 작성 — 카테고리: 일반/경기공지/징계/긴급',
          '등록 후 목록/상세에 즉시 반영',
        ],
      },
      {
        heading: '건의/문의 처리 상태 관리',
        bullets: [
          '건의/문의 상세 페이지에서 처리 상태를 드롭다운으로 즉시 변경',
          '상태: 미처리(빨강) / 처리 중(노랑) / 처리 완료(초록)',
          '비밀글 포함 모든 글 열람 가능',
          '모든 글·댓글 수정 및 삭제 가능',
        ],
      },
    ],
  },
  {
    id: 'web-admin-schedule',
    title: '경기 일정 관리',
    icon: '📋',
    accent: '#F97316',
    items: [
      {
        heading: '일정 관리 (/schedule/manage)',
        bullets: ['경기 생성/수정/삭제(휴지통 이동)', '경기 상태 전환: 예정/진행 중/종료/취소', '으뜸/버금 구분 조정', '연습경기 포함 일정 운영'],
      },
    ],
  },
  {
    id: 'web-admin-scorekeeper',
    title: '전자 기록지 작성',
    icon: '📝',
    accent: '#22C55E',
    items: [
      {
        heading: '기록지 (/scorekeeper) — PC/태블릿 가로 모드 권장',
        bullets: [
          '경기 선택 및 라인업 입력',
          '플레이 기록: 볼/스트라이크/아웃, 타격 결과, 수비 결과, 주자 진루',
          '기록원 Lock: 동시 접속 충돌 방지',
          '편의 기능: 단축키 ON/OFF, 경기 타이머, 문자 중계 입력',
          '저장/종료: 경기 종료 처리, CSV 기록지 다운로드',
        ],
      },
    ],
  },
  {
    id: 'web-admin-live',
    title: '라이브 방송 제어',
    icon: '🎬',
    accent: '#A855F7',
    items: [
      {
        heading: '스코어보드 / 문자중계 / 오버레이',
        bullets: [
          '스코어보드(/scoreboard), 문자중계(/scoreboard-text) 상태 모니터링',
          '라이브 오버레이(/live-overlay) 송출 화면 점검',
          '기록원 입력 데이터가 중계 화면에 실시간 반영',
        ],
      },
    ],
  },
];

const WEB_TROUBLESHOOTING = [
  {
    title: '로그인/권한 문제가 있을 때',
    steps: ['로그아웃 후 재로그인', '관리자 계정 여부 확인 (/account)', '관리자 기능 미노출 시 권한(admin claim, roles) 재확인'],
  },
  {
    title: '중계/기록 반영이 지연될 때',
    steps: ['페이지 새로고침', '활성 경기(match) 선택 상태 확인', '기록원 Lock 점유 상태 확인'],
  },
];

/* ══════════════════════════════════════════
   앱 콘텐츠
   ══════════════════════════════════════════ */

const APP_GUEST_SECTIONS: ManualSection[] = [
  {
    id: 'app-guest-main',
    title: '메인 및 리그 정보',
    icon: '🏠',
    accent: '#60A5FA',
    items: [
      {
        heading: '홈 탭',
        bullets: [
          '라이브 경기, 오늘 일정, 내일 일정, 최근 결과를 확인합니다.',
          '당겨서 새로고침으로 최신 데이터를 반영합니다.',
        ],
      },
      {
        heading: '팀 탭',
        bullets: [
          '팀명 검색, 조(A~H) 필터, 조별/이름순 정렬',
          '팀 카드를 탭하여 팀 상세로 진입합니다.',
        ],
      },
      {
        heading: '더보기 > 리그 정보',
        bullets: ['리그 소개, 회칙, 개인정보 처리방침, 이용약관을 확인합니다.'],
      },
    ],
  },
  {
    id: 'app-guest-schedule',
    title: '경기 일정 및 결과',
    icon: '📅',
    accent: '#22C55E',
    items: [
      {
        heading: '일정 탭',
        bullets: [
          '전체: 전체 경기 일정 확인',
          '라이브: 진행 중 경기만 조회',
          '결과: 종료 경기 조회',
          '조별: 조별 경기 필터 조회',
          '연습경기: 연습경기만 별도 조회',
        ],
      },
      {
        heading: '경기 카드 탭',
        bullets: ['경기 카드를 누르면 문자중계/결과 화면으로 이동합니다.'],
      },
    ],
  },
  {
    id: 'app-guest-records',
    title: '순위 및 기록실',
    icon: '📊',
    accent: '#F97316',
    items: [
      {
        heading: '기록 탭',
        bullets: [
          '개요, 팀순위, 투수기록, 타자기록, 파워랭킹, 선수상세 탭 전환',
          '시즌 선택, 검색/필터, 정렬 기준 변경',
          '선수 상세에서 시즌/게임 로그 조회',
        ],
      },
    ],
  },
  {
    id: 'app-guest-live',
    title: '경기 중계 시청',
    icon: '📺',
    accent: '#A855F7',
    items: [
      {
        heading: '문자중계',
        bullets: [
          '일정/홈에서 경기 선택 시 문자중계 화면으로 이동합니다.',
          '스코어보드/라이브 오버레이는 관리자 WebView에서 사용합니다.',
        ],
      },
    ],
  },
];

const APP_MEMBER_SECTIONS: ManualSection[] = [
  {
    id: 'app-member-auth',
    title: '로그인 및 계정 관리',
    icon: '🔐',
    accent: '#60A5FA',
    items: [
      {
        heading: '첫 실행 온보딩',
        bullets: ['"로그인 / 회원가입" 또는 "그냥 사용하기" 선택'],
      },
      {
        heading: '로그인 방식',
        bullets: ['WebView 로그인, 네이티브 Google 로그인, 네이티브 Apple 로그인(iOS)'],
      },
      {
        heading: '계정 화면',
        bullets: [
          'UID, 이메일, 로그인 제공자, 역할 확인',
          '계정 생성일, 최근 로그인 시각 표시',
          '로그아웃: Firebase 세션 및 WebView 쿠키 정리',
          '회원 탈퇴: 더보기 → 계정 → 회원 탈퇴 (재인증 후 처리)',
          '외부 삭제 안내: https://aubl.club/account-deletion',
        ],
      },
    ],
  },
  {
    id: 'app-member-community',
    title: '커뮤니티 이용',
    icon: '💬',
    accent: '#22C55E',
    items: [
      {
        heading: '공지사항',
        bullets: [
          '카테고리 필터: 전체, 긴급, 경기공지, 징계, 일반',
          '제목/내용/작성자 기준 검색',
          '공지 상세에서 댓글 작성/조회/삭제(본인 댓글)',
          '갤러리 배너로 외부 커뮤니티 이동',
        ],
      },
      {
        heading: '건의/문의 게시판',
        bullets: [
          '커뮤니티 탭에서 건의/문의 게시판 배너로 진입',
          '플랫폼(앱/웹), 말머리(5종), 처리상태 필터',
          '말머리: 기능 개선 / 버그 신고 / 사용 문의 / 경기·기록 오류 / 기타',
          '비밀글은 목록에 표시되지만 작성자만 열람 가능',
          '로그인 후 글쓰기 가능 / 본인 글 수정·삭제 / 댓글 작성·삭제',
        ],
      },
    ],
  },
  {
    id: 'app-member-team',
    title: '팀 상세 및 팀 공지',
    icon: '⚾',
    accent: '#F97316',
    items: [
      {
        heading: '팀 상세',
        bullets: ['팀 소개, 로스터, 팀 공지, 예정/최근 경기 확인'],
      },
      {
        heading: '팀 공지 게시판',
        bullets: [
          '카테고리 필터(전체/일반/훈련/경기/긴급)',
          '공지 검색, 고정 공지 우선 정렬',
          '댓글/답글 작성, 좋아요, 본인 댓글 삭제',
        ],
      },
    ],
  },
  {
    id: 'app-member-notification',
    title: '알림 설정',
    icon: '🔔',
    accent: '#FBBF24',
    items: [
      {
        heading: '더보기 > 알림 설정',
        bullets: [
          '전체 알림 ON/OFF (OFF 시 긴급 공지 포함 모든 알림 중단)',
          '커뮤니티 공지 알림 ON/OFF',
          '홈팀 공지 알림 ON/OFF',
          '건의/문의 알림 ON/OFF — 내 글의 처리 상태 변경 및 새 댓글 알림 (로그인 시 동작)',
          '경기 알림: 전체 경기 / 소속팀 경기 / 받지 않음',
        ],
      },
    ],
  },
  {
    id: 'app-member-coach',
    title: '감독(Coach) 팀 홈 관리',
    icon: '👨‍💼',
    accent: '#A855F7',
    items: [
      { heading: '팀 브랜딩/소개', bullets: ['웹 팀 홈에서 로고 변경, 팀 설명 추가/수정'] },
      { heading: '팀 일정 운영', bullets: ['앱에서 예정/진행/최근 경기 확인', '웹 일정 화면으로 이동해 일정 운영'] },
      { heading: '선수 로스터', bullets: ['웹 팀 홈에서 선수 추가/수정/정리', '등번호/포지션/투타/프로필 관리'] },
      { heading: '팀 공지 운영', bullets: ['앱에서 공지 작성(제목/내용/카테고리 + 고정 옵션)', '공지 고정/해제, 삭제 수행'] },
    ],
  },
];

const APP_ADMIN_SECTIONS: ManualSection[] = [
  {
    id: 'app-admin-menu',
    title: '관리자 메뉴',
    icon: '🛡️',
    accent: '#EF4444',
    items: [
      {
        heading: '더보기 > 관리자 섹션',
        bullets: ['관리자 권한 계정에만 관리자 메뉴가 노출됩니다.', '권한이 없으면 관리자 메뉴가 보이지 않습니다.'],
      },
    ],
  },
  {
    id: 'app-admin-community',
    title: '건의/문의 처리 상태 관리',
    icon: '💬',
    accent: '#22C55E',
    items: [
      {
        heading: '건의/문의 상세 화면 (관리자)',
        bullets: [
          '처리 상태를 바텀시트 선택으로 즉시 변경 — 미처리 / 처리 중 / 처리 완료',
          '비밀글 포함 모든 글 열람 가능',
          '모든 글·댓글 수정 및 삭제 가능',
        ],
      },
    ],
  },
  {
    id: 'app-admin-schedule',
    title: '경기 일정 관리',
    icon: '📋',
    accent: '#F97316',
    items: [
      {
        heading: '더보기 > 일정 관리',
        bullets: ['WebView로 /schedule/manage 진입', '일정 생성/수정, 상태 변경(예정/진행 중/종료/취소)', '연습경기 운영'],
      },
    ],
  },
  {
    id: 'app-admin-panel',
    title: '관리자 패널',
    icon: '⚙️',
    accent: '#60A5FA',
    items: [
      {
        heading: '더보기 > 관리자 패널',
        bullets: ['WebView로 /admin 진입', '랜딩 문구/티커, 리그 소개, 회칙, 팀/조 편성, 감독 권한 관리', '서비스 점검 모드 ON/OFF — /admin/maintenance에서 점검 메시지·재개일 설정'],
      },
    ],
  },
  {
    id: 'app-admin-scorekeeper',
    title: '전자 기록지 작성',
    icon: '📝',
    accent: '#22C55E',
    items: [
      {
        heading: '더보기 > 기록원',
        bullets: [
          'WebView 전체화면으로 /scorekeeper 진입',
          '경기 선택 및 라인업 입력',
          '타석/주루/수비 이벤트 기록',
          'Lock 점유/해제, 단축키 모드',
          '문자 중계 입력, 경기 종료 및 CSV 저장/다운로드',
        ],
      },
    ],
  },
  {
    id: 'app-admin-live',
    title: '라이브 방송 제어',
    icon: '🎬',
    accent: '#A855F7',
    items: [
      {
        heading: '더보기 > 스코어보드',
        bullets: ['WebView로 /scoreboard 진입', '기록원 데이터가 문자중계/오버레이에 반영되는 상태 점검'],
      },
    ],
  },
];

const APP_TROUBLESHOOTING = [
  {
    title: '로그인이 안 될 때',
    steps: [
      '앱 완전 종료 후 재실행',
      '로그아웃 후 재로그인',
      'Google 로그인 문제 시 기기 Google 계정 상태 확인',
      'iOS Apple 로그인 문제 시 Apple ID 로그인 상태 및 Face ID/Touch ID 설정 확인',
    ],
  },
  {
    title: '데이터가 오래된 것 같을 때',
    steps: ['화면 당겨서 새로고침', '앱 재실행', '네트워크 상태 확인'],
  },
  {
    title: '관리자 메뉴가 보이지 않을 때',
    steps: ['계정 역할 재확인', '관리자 권한 반영 후 재로그인', '여전히 미노출 시 권한 매핑(admin claim, roles) 점검'],
  },
];

/* ─── 통합 맵 ─── */

type TroubleshootItem = { title: string; steps: string[] };

const SECTIONS_MAP: Record<PlatformTab, Record<RoleTab, ManualSection[]>> = {
  '웹': { '방문자': WEB_GUEST_SECTIONS, '일반 회원': WEB_MEMBER_SECTIONS, '관리자/기록원': WEB_ADMIN_SECTIONS },
  '앱': { '방문자': APP_GUEST_SECTIONS, '일반 회원': APP_MEMBER_SECTIONS, '관리자/기록원': APP_ADMIN_SECTIONS },
};

const TROUBLESHOOTING_MAP: Record<PlatformTab, TroubleshootItem[]> = {
  '웹': WEB_TROUBLESHOOTING,
  '앱': APP_TROUBLESHOOTING,
};

const PLATFORM_META: Record<PlatformTab, { badge: string; title: string; description: string; note: string; gradient: string }> = {
  '웹': {
    badge: 'AUBL · WEB MANUAL',
    title: 'AUBL 웹 플랫폼 사용 설명서',
    description: '방문자, 일반 회원, 관리자/기록원별로 웹에서 사용 가능한 기능을 안내합니다.',
    note: '브라우저 권장: 최신 Chrome, Safari, Edge',
    gradient: 'radial-gradient(circle at 10% 20%, rgba(96,165,250,0.14), transparent 30%), radial-gradient(circle at 88% 5%, rgba(34,197,94,0.12), transparent 24%), linear-gradient(140deg, #0a1a3f 0%, #0f2f8f 100%)',
  },
  '앱': {
    badge: 'AUBL · APP MANUAL',
    title: 'AUBL 앱 사용 설명서',
    description: '방문자, 일반 회원, 관리자/기록원별로 앱에서 사용 가능한 기능을 안내합니다.',
    note: '하단 탭: 홈 · 팀 · 일정 · 기록 · 커뮤니티 · 더보기 | 일부 관리 기능은 WebView로 연결',
    gradient: 'radial-gradient(circle at 10% 20%, rgba(34,197,94,0.14), transparent 30%), radial-gradient(circle at 88% 5%, rgba(168,85,247,0.12), transparent 24%), linear-gradient(140deg, #0a1a3f 0%, #1e3a5f 100%)',
  },
};

/* ─── 스크린샷 Placeholder ─── */

function ScreenshotSlot({ label }: { label: string }) {
  return (
    <div
      style={{
        width: '100%',
        aspectRatio: '16/9',
        borderRadius: '12px',
        border: '2px dashed rgba(148,163,184,0.3)',
        background: 'rgba(255,255,255,0.02)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        color: '#64748B',
        fontSize: '13px',
        marginTop: '12px',
      }}
    >
      <span style={{ fontSize: '28px', opacity: 0.5 }}>🖼️</span>
      <span>스크린샷: {label}</span>
    </div>
  );
}

/* ─── 아코디언 섹션 ─── */

function SectionAccordion({ section }: { section: ManualSection }) {
  const [open, setOpen] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!bodyRef.current) return;
    if (open) {
      gsap.fromTo(bodyRef.current, { height: 0, opacity: 0 }, { height: 'auto', opacity: 1, duration: 0.35, ease: 'power2.out' });
    } else {
      gsap.to(bodyRef.current, { height: 0, opacity: 0, duration: 0.25, ease: 'power2.in' });
    }
  }, [open]);

  return (
    <div
      style={{
        borderRadius: '16px',
        border: `1px solid ${open ? section.accent + '55' : 'rgba(148,163,184,0.2)'}`,
        background: open ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.01)',
        transition: 'border-color 0.3s, background 0.3s',
        overflow: 'hidden',
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          padding: '18px 20px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: '#e2e8f0',
          textAlign: 'left',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '18px' }}>{section.icon}</span>
          <span style={{ fontWeight: 800, fontSize: 'clamp(15px, 4vw, 17px)' }}>{section.title}</span>
        </span>
        <span
          style={{
            fontSize: '18px',
            fontWeight: 700,
            color: '#94a3b8',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.3s',
            flexShrink: 0,
          }}
        >
          ▾
        </span>
      </button>

      <div ref={bodyRef} style={{ height: 0, opacity: 0, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gap: '20px', padding: '0 20px 20px' }}>
          {section.items.map((item) => (
            <div key={item.heading}>
              <p style={{ margin: 0, fontWeight: 800, fontSize: '15px', color: section.accent, marginBottom: '8px' }}>
                {item.heading}
              </p>
              <div style={{ display: 'grid', gap: '4px' }}>
                {item.bullets.map((bullet, i) => (
                  <p
                    key={i}
                    style={{
                      margin: 0,
                      color: '#cbd5e1',
                      lineHeight: 1.7,
                      fontSize: 'clamp(13px, 3.4vw, 14px)',
                      paddingLeft: '12px',
                      position: 'relative',
                    }}
                  >
                    <span style={{ position: 'absolute', left: 0, color: section.accent }}>•</span>
                    {bullet}
                  </p>
                ))}
              </div>
              {item.screenshot ? (
                <img
                  src={item.screenshot}
                  alt={item.heading}
                  style={{ width: '100%', borderRadius: '12px', marginTop: '12px', border: '1px solid rgba(148,163,184,0.2)' }}
                />
              ) : (
                <ScreenshotSlot label={item.heading} />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── 메인 페이지 ─── */

export default function UserManualPage() {
  const [platform, setPlatform] = useState<PlatformTab>('웹');
  const [activeTab, setActiveTab] = useState<RoleTab>('방문자');
  const pageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const blocks = pageRef.current?.querySelectorAll('.manual-chunk');
      if (blocks) {
        gsap.fromTo(blocks, { y: 26, opacity: 0 }, { y: 0, opacity: 1, duration: 0.9, stagger: 0.08, ease: 'power2.out' });
      }
    });
    return () => ctx.revert();
  }, []);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const sections = pageRef.current?.querySelectorAll('.manual-section');
      if (sections) {
        gsap.fromTo(sections, { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, stagger: 0.06, ease: 'power2.out' });
      }
    });
    return () => ctx.revert();
  }, [platform, activeTab]);

  const meta = PLATFORM_META[platform];
  const sections = SECTIONS_MAP[platform][activeTab];
  const troubleshooting = TROUBLESHOOTING_MAP[platform];

  return (
    <div style={{ display: 'grid', gap: '28px' }} ref={pageRef}>
      {/* ── 헤더 ── */}
      <section
        className="manual-chunk"
        style={{
          display: 'grid',
          gap: '14px',
          padding: 'clamp(24px, 6vw, 34px)',
          borderRadius: 'var(--surface-radius-lg, 24px)',
          background: meta.gradient,
          border: '1px solid rgba(148,163,184,0.25)',
          boxShadow: '0 24px 60px rgba(0,0,0,0.35)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <span
            style={{
              padding: '8px 12px',
              borderRadius: '999px',
              fontWeight: 800,
              letterSpacing: '0.05em',
              background: 'rgba(96,165,250,0.16)',
              color: '#bfdbfe',
              border: '1px solid rgba(96,165,250,0.35)',
              fontSize: 'clamp(11px, 2.8vw, 12px)',
            }}
          >
            {meta.badge}
          </span>
        </div>
        <h2 style={{ margin: 0, fontSize: 'clamp(22px, 5.5vw, 32px)', lineHeight: 1.25, fontWeight: 900 }}>
          {meta.title}
        </h2>
        <p style={{ margin: 0, color: '#cbd5e1', lineHeight: 1.7, maxWidth: '800px', fontSize: 'clamp(14px, 3.6vw, 15px)' }}>
          {meta.description}
        </p>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <span style={{ color: '#94a3b8', fontSize: '12px' }}>{meta.note}</span>
        </div>
        <Link
          to="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            color: '#93c5fd',
            fontWeight: 700,
            fontSize: 'clamp(13px, 3.4vw, 14px)',
          }}
        >
          ← 메인으로 돌아가기
        </Link>
      </section>

      {/* ── 플랫폼 전환 탭 ── */}
      <section className="manual-chunk">
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          {PLATFORM_TABS.map((tab) => {
            const isActive = platform === tab;
            const icon = tab === '웹' ? '🌐' : '📱';
            const color = tab === '웹' ? '#60A5FA' : '#22C55E';
            return (
              <button
                key={tab}
                onClick={() => { setPlatform(tab); setActiveTab('방문자'); }}
                style={{
                  padding: '12px 24px',
                  borderRadius: '14px',
                  border: `2px solid ${isActive ? color : 'rgba(148,163,184,0.2)'}`,
                  background: isActive ? color + '18' : 'rgba(255,255,255,0.02)',
                  color: isActive ? color : '#94a3b8',
                  fontWeight: 800,
                  fontSize: '16px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: isActive ? `0 0 20px ${color}20` : 'none',
                }}
              >
                <span style={{ fontSize: '20px' }}>{icon}</span>
                {tab === '웹' ? '웹 플랫폼' : '앱 (Android / iOS)'}
              </button>
            );
          })}
        </div>

        {/* ── 역할 탭 ── */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {ROLE_TABS.map((tab) => {
            const isActive = activeTab === tab;
            const colors: Record<RoleTab, string> = { '방문자': '#60A5FA', '일반 회원': '#22C55E', '관리자/기록원': '#EF4444' };
            const icons: Record<RoleTab, string> = { '방문자': '👥', '일반 회원': '👤', '관리자/기록원': '🛡️' };
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: '10px 18px',
                  borderRadius: '12px',
                  border: `1px solid ${isActive ? colors[tab] + '88' : 'rgba(148,163,184,0.2)'}`,
                  background: isActive ? colors[tab] + '18' : 'rgba(255,255,255,0.02)',
                  color: isActive ? colors[tab] : '#94a3b8',
                  fontWeight: isActive ? 800 : 600,
                  fontSize: '14px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span>{icons[tab]}</span>
                {tab}
              </button>
            );
          })}
        </div>
      </section>

      {/* ── 본문 섹션 ── */}
      <section className="manual-chunk" style={{ display: 'grid', gap: '12px' }}>
        {sections.map((section) => (
          <div key={section.id} className="manual-section">
            <SectionAccordion section={section} />
          </div>
        ))}
      </section>

      {/* ── 문제 해결 ── */}
      <section
        className="manual-chunk"
        style={{
          display: 'grid',
          gap: '14px',
          padding: '24px',
          borderRadius: '18px',
          border: '1px solid rgba(148,163,184,0.2)',
          background: 'rgba(255,255,255,0.02)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#cbd5e1' }}>
          <span style={{ fontSize: '18px' }}>🔧</span>
          <p style={{ margin: 0, fontWeight: 800, fontSize: '17px' }}>문제 해결</p>
        </div>
        {troubleshooting.map((item) => (
          <div
            key={item.title}
            style={{ padding: '16px', borderRadius: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(148,163,184,0.15)' }}
          >
            <p style={{ margin: '0 0 8px', fontWeight: 700, color: '#e2e8f0', fontSize: '14px' }}>{item.title}</p>
            {item.steps.map((step, i) => (
              <p
                key={i}
                style={{ margin: '0 0 4px', color: '#94a3b8', fontSize: '13px', paddingLeft: '18px', position: 'relative', lineHeight: 1.6 }}
              >
                <span style={{ position: 'absolute', left: 0, fontWeight: 700, color: '#60A5FA' }}>{i + 1}.</span>
                {step}
              </p>
            ))}
          </div>
        ))}
      </section>

      {/* ── 푸터 ── */}
      <section
        className="manual-chunk"
        style={{
          padding: '20px 24px',
          borderRadius: '14px',
          border: '1px solid rgba(148,163,184,0.15)',
          background: 'rgba(255,255,255,0.02)',
          color: '#64748B',
          fontSize: 'clamp(12px, 3vw, 13px)',
          lineHeight: 1.7,
          textAlign: 'center',
        }}
      >
        <p style={{ margin: 0 }}>
          문서 버전: 2026-02-18 ·{platform === '웹' ? '일부 관리 기능은 데스크톱 또는 태블릿 가로 모드를 권장합니다.' : '일부 관리 기능은 앱 내 WebView로 웹 관리 화면에 연결됩니다.'}
        </p>
      </section>
    </div>
  );
}

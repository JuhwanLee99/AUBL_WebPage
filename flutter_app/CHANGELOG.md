# Changelog

## 1.1.0+16 — 2026-09-04

### 디자인과 탐색

- 웹의 2026 화이트·네이비·코발트 토큰을 Material 3 라이트·다크 테마로 이식했다.
- `시스템·라이트·다크` 테마 선택과 영구 저장을 추가했다.
- `홈·팀·경기·기록·커뮤니티·더보기` 6개 목적지를 휴대폰 플로팅 바와 태블릿 가로형 플로팅 레일로 구성했다.
- Pretendard, Barlow Condensed와 배경 없는 AUBL 로고를 번들링했다.
- 공개·사용자 화면의 기존 다색 칩, 글로우, 과도한 그라데이션을 공통 카드·표·상태 배지로 교체했다.

### 시즌 정보와 경기

- 홈에 관리자 중요공지, 2026 캠페인 히어로, 데이터 최신성, 일정·결과 목록/달력, A~H 조별 현황, 기록 리더, 공지·파트너를 연결했다.
- 히어로 표기는 `46TH AUBL · 2026 연합회교 중앙대학교(서울)`로 통일했다.
- UniquePlay, 골드볼파크(공인구), 메이저(배트), Instagram 링크를 추가했다.
- 경기 탭을 `일정·결과 / 조별 / 라이브 / 연습경기`로 정리하고 모든 공식 경기 카드에서 상세 화면을 열 수 있게 했다.
- 홈과 일정 달력은 셀 안에 팀명을 축소하지 않고 경기 수·상태와 선택 날짜의 14sp 이상 일정 목록을 분리했다.

### 데이터 정확성과 오프라인

- Spring/MariaDB의 `/api/seasons`, `/overview`, `/api/games`를 공식 2026 시즌 원천으로 사용한다.
- 공식 UniquePlay 경기와 Firestore projection을 합산하지 않고, Firestore는 라이브 상태와 연습경기를 담당한다.
- `sourceActive=false` 또는 `deleted=true` 경기는 저장 상태를 유지하면서 공개 화면에서 제외한다.
- `provider + sourceGameId`, `groupCode`, `syncRevision`, 진출 상태를 앱 모델에 보존한다.
- null 기록을 0으로 만들지 않으며 필수 기록이 전부 비어 있는 랭킹 행은 제외한다.
- 공식 API 캐시를 시즌·조회 범위·게시 revision별로 분리하고 같은 revision만 오프라인 복구한다.
- API 시각과 날짜 경계를 기기 시간대와 무관하게 KST로 정규화한다.

### WebView와 운영

- 관리자, UniquePlay, 기록원, 경기 편집, 전광판·라이브 오버레이는 검증된 웹 구현을 유지한다.
- 네이티브 테마를 최초 URL과 `aubl-native-theme` 이벤트로 WebView에 전달한다.
- Firebase 토큰 교환과 Google·Apple 로그인 메시지 계약은 변경하지 않았다.
- UniquePlay 수집 스케줄러나 백그라운드 자동 실행은 추가하지 않았다. 관리자의 명시적인 웹 버튼 동작만 허용한다.
- FCM/APNs 토큰과 Apple nonce 원문 로그를 제거했다.

### 출시 기반

- Flutter 3.41.6, Dart 3.11.4, Java 17, iOS 13, Android minSdk 24를 고정했다.
- 공개 환경별 `dart-define` 프로필에 `AUBL_BACKEND_API_URL=https://api.aubl.club`을 명시했다.
- Android/iOS 버전 원천을 `pubspec.yaml`의 `1.1.0+16`으로 통일했다.
- Flutter 3.41.6의 iOS UIScene lifecycle과 implicit engine 플러그인 등록 방식을 적용했다.

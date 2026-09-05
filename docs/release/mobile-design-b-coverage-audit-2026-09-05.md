# B안 확정 및 Flutter 디자인·글꼴 적용 범위 감사

## 결정과 조사 범위

- 결정일: 2026-09-05. 사용자 선택에 따라 **B안을 모바일 디자인 기준으로 확정**한다.
- 기준 소스: `codex/mobile-design-b-native-layout`, `7ff6762`, 앱 `1.1.0+16`.
- A안은 `codex/mobile-design-a-showcase` / `d3625ef`에 비교용으로 보존한다. [보존·빌드 기록](mobile-design-variants-2026-09-05.md) 참조.
- B안 기준은 **기존 앱형 탐색·정보 밀도 + 2026 색상·글꼴·브랜드**다. 웹의 큰 히어로와 카드 배열을 모든 앱 화면에 다시 복제하지 않는다.
- `flutter_app/lib`의 Dart 110개를 전역 탐색하고, 실제 진입 경로를 따라 화면·공통 UI의 스타일을 확인했다. 폰트 선언·실물, Android/iOS 시작 화면, WebView 외곽도 포함했다. 모델·저장소·서비스는 화면 노출 여부 확인용이며 별도 디자인 화면으로 세지 않았다.
- 이번 작업은 **조사 및 결정 문서화만** 수행했다. 앱 코드·기능·데이터·권한·의존성·스토어 제출 상태는 변경하지 않았다.

### 증거 수준과 한계

전체 범위의 **소스 기반 감사**이며, 모든 계정·실제 경기·원격 게시글을 Android/iOS 실기기에서 순회한 결과는 아니다. 기존 B안 홈 라이트·다크 golden 2장을 시각 확인하고 기존 자동 테스트를 재실행했다. 글꼴·신고 팝업 문제 2건은 별도 임시 위젯 fixture로 재현했다.

WebView는 Flutter 외곽·테마 전달·목적지 코드를 조사했다. 배포된 웹의 모든 하위 DOM, OAuth 제공자 화면, 원격 콘텐츠의 개별 서식까지 정상이라고 판정하지 않았다. 운영 API 쓰기, UniquePlay 수집·게시, 신고 등록, 실제 계정 변경은 하지 않았다.

## 요약 판정

핵심 6탭은 B안 구조와 2026 테마가 적용되어 있다. 남은 작업의 중심은 앱 전체 재설계가 아니라 **본문 글꼴 상속, 일부 한글의 영문 폰트 지정, 보조 화면·팝업의 테마, 상세 화면의 카드 밀도**다.

아래에서 ‘누락’은 실제 테마·글꼴 적용이 끊긴 경우, ‘형상 마감’은 새 색상·폰트는 적용됐지만 B안의 간결한 화면 구조와 차이가 있는 경우다. 화면 수와 공통 컴포넌트 수를 섞어 누락 건수를 부풀리지 않는다.

## 1. 실제 글꼴 누락

경로는 별도 표기가 없으면 `flutter_app/lib/` 기준이며 줄 번호는 감사 기준 커밋의 위치다.

| ID | 화면·상태 | 확인 근거 | 후속 처리 방향 |
|---|---|---|---|
| F01 | 공지·문의·선수 등록·팀 공지·댓글의 리치 텍스트 본문 및 작성기 | `core/widgets/editor/rich_text_viewer.dart:96`, `rich_text_editor.dart:349`에서 문단/placeholder를 새 `TextStyle`로 교체한다. Quill의 `DefaultStyles.merge`는 문단 스타일을 필드째 교체하고 내부 `RichText`로 렌더링하므로 전역 Pretendard가 보충되지 않는다. 서식 없는 Delta 본문 fixture에서 최종 `RichText.text.style.fontFamily == null`, 앱 테마는 Pretendard임을 재현했다. 일반 plain-text 분기는 정상이다. | **우선 수정.** 앱의 본문 스타일을 기반으로 문단·placeholder를 구성한다. 저장된 Delta나 사용자 서식은 임의로 삭제하지 않는다. |
| F02 | 회칙의 본문·검색 강조·연합회교 순서 | `features/intro/rules_screen.dart:182`, `:456`의 직접 `RichText`에 글꼴 없는 `TextStyle`/`TextSpan`이 전달된다. 일반 `Text`와 달리 Pretendard 상속 경로가 없다. | **우선 수정.** 본문 스타일을 명시적으로 연결하고 검색 강조를 유지한다. 글자 확대 전달도 함께 점검한다. |
| F03 | 한글을 포함한 라벨·단위·이니셜 | 아래 상세 표. 영문용 Barlow를 전체 문자열에 지정하고 한글 fallback을 지정하지 않은 경우다. 번들 Barlow 600/900에 `팀(U+D300)` 글리프가 없고 Pretendard에는 있음을 cmap으로 확인했다. | 숫자·영문은 Barlow를 유지하고 한글은 Pretendard로 분리하거나 명시적 fallback을 지정한다. 정확한 OS별 대체 글꼴 이름은 이번 조사에서 측정하지 않았다. |

### F03 적용 위치

| 표시 내용 | 위치 |
|---|---|
| 홈 `중요 공지` | `features/home/home_screen.dart:433` |
| 홈 `N경기` | `features/home/home_screen.dart:1128` |
| 달력·경기 월 이동 `2026년 9월` | `features/schedule/widgets/schedule_controls.dart:35` — 숫자뿐 아니라 `년/월`도 같은 스타일 |
| 최신성 상세 `게시 버전 …` | `core/widgets/season_components.dart:491` — 홈·경기 최신성 상세 시트에서 재사용 |
| 기록 개요 `N 팀` | `features/records/records_screen.dart:935`, 값 구성 `records_screen_sections.dart:699` |
| 팀 로고 없음/실패 시 한글 첫 글자 | `features/teams/widgets/team_card.dart:130` |
| 선수 사진 없음 시 한글 첫 글자 | `features/teams/widgets/member_card.dart:58` |
| 계정 프로필의 한글 이니셜 | `features/account/account_screen.dart:377` |

일반 `TextStyle`에 `fontFamily`가 없다는 이유만으로 누락으로 세지 않았다. `app/app.dart:45`, `core/theme/app_theme.dart:185`에서 라이트·다크 모두 Pretendard가 설정되어 있다. 일반 `Text`, `Text.rich`, 테마 기반 제목·입력·표는 상속한다. 숫자 점수·순위·영문 캠페인의 Barlow는 의도된 디자인이다.

## 2. 색상·테마·공통 UI 누락

| ID | 우선순위 | 대상 | 확인 근거와 영향 | 후속 처리 방향 |
|---|---|---|---|---|
| D01 | 먼저 수정 | 신고·차단 사유 대화상자 | `core/widgets/moderation/moderation_dialogs.dart:48,62,73,95`가 고정 다크 배경·흰 글자다. 라이트 테마의 입력 배경은 흰색이므로 입력 글자도 흰색이 되는 조합을 fixture로 재현했다. 공지·문의·선수 등록·팀 공지 상세에서 실제 호출된다. | 대화상자·드롭다운·입력·액션 모두 의미 색상으로 통일. 신고/차단 저장 계약은 유지. |
| D02 | 다음 마감 | 앱 시작 화면 | Android `android/app/src/main/res/values/styles.xml:3`, `values-night/styles.xml:3` 모두 이전 `#0F172A`. iOS `ios/Runner/Base.lproj/LaunchScreen.storyboard:22`, `Main.storyboard:19`도 같은 고정색. Flutter 진입 뒤 `app/maintenance_guard.dart:117,120`은 고정 다크·주황 로딩이다. | 시스템 시작 화면과 Flutter 첫 로딩의 라이트·다크 연결을 정리. 앱 저장 테마가 OS 시작 화면에도 그대로 적용된다고 가정하지 않고 별도 확인. |
| D03 | 다음 마감 | 로그인·일반 WebView·임베디드 오류 배너 | `features/auth/login_webview_screen.dart:436`, `core/webview/app_webview_screen.dart:465`, `app/embedded_webview_panel.dart:514`에 원색 빨강·12dp 둥근 배너가 중복된다. 공통 `ErrorBanner`는 의미 색상·4dp·좌측 상태선으로 이미 변경되어 있다. | 인증 흐름을 공통화하지 않고 오류 표시 UI만 맞춘다. 기존 닫기/재시도 가능 여부 유지. |
| D04 | 먼저 대비 수정 / 터치 영역 후속 | 문자중계의 네이티브 라이브 버튼·전체화면 뒤로가기 | `app/embedded_webview_panel.dart:565`에서 다크의 `danger=#FF899B` 배경 위 흰 글자·아이콘을 사용해 대비가 약 2.26:1이다. `:539` 뒤로가기 원은 36×36dp다. | 상태 글자색과 버튼 채움색을 분리하고 터치 영역을 확장. 오버레이 동작·전체화면 전환 계약은 유지. |

`ScorekeeperWebViewScreen`에도 같은 오류 배너가 있지만 현재 직접 진입은 공통 WebView를 사용하므로 활성 화면 1건으로 추가 집계하지 않았다. `AppWebViewScreen.minimalHeader`의 흰 뒤로가기 역시 현재 `true` 호출처가 없어 예비 경로로 구분한다.

## 3. 새 색상은 적용됐지만 B안 형상 마감이 남은 곳

### 화면 헤더·필터·설명 영역

| 대상 | 남은 형식과 근거 | 권장 정리 |
|---|---|---|
| 계정 | `features/account/account_screen.dart:266`의 큰 `AUBL ACCOUNT` 히어로 뒤에 로그인/프로필. `:328` 이후 `ACCOUNT DATA / SIGN IN / MEMBERSHIP / SECURITY / COMMUNITY SAFETY` 패널 반복. | 우선 마감. 프로필·로그인·계정 동작부터 보이는 네이티브 설정 행으로 정리. UID 등 정보의 삭제·숨김은 별도 확인. |
| 팀 상세 | `features/teams/team_detail_screen.dart:264`의 130dp 로고 영역, 큰 팀명, `2026 TEAM PROFILE`, 승무패·경기 수가 휴대폰에서 세로로 쌓임. | 독립 로고 영역은 유지하되 상세 요약 높이를 줄여 공지·경기·로스터를 빨리 볼 수 있게 정리. |
| 회칙 | `features/intro/rules_screen.dart:353`의 큰 `AUBL DOCUMENTS` 히어로가 검색·본문 앞에 있음. | 앱바·짧은 문서 정보·검색·본문 중심. F02 글꼴도 함께 마감. |
| 도움말 | `features/help/user_manual_screen.dart:504`의 수동 뒤로가기와 큰 `AUBL USER MANUAL` 히어로. `:704`에서 모든 설명 항목에 실제 이미지가 아닌 스크린샷 placeholder를 삽입. | 역할·항목 탐색을 앞당기고 placeholder를 실제 B안 캡처로 대체. 이미지 영역 제거 여부는 사용자 확인. |
| 약관·개인정보 | `features/legal/terms_screen.dart:83`, `privacy_screen.dart:88`의 220dp 이상 공통 히어로. 제목이 앱바와 본문에 반복됨. | 낮은 우선순위의 문서형 헤더 축약. 본문·법적 내용은 변경하지 않음. 글꼴과 테마는 이미 적용. |
| 리그 소개 | `features/intro/intro_screen.dart:153`의 긴 소개·지표 스택. 서사형 페이지라 캠페인 표현 자체는 허용 가능한 예외. | 메인 업무 화면보다 낮은 우선순위. B안에서 소개만 큰 표현을 유지할지 정한 뒤 조정. 별도 콘텐츠 문제는 6절 참조. |
| 건의·문의 목록/상세 | `features/community/inquiry_board_screen.dart:82,162,250`, `inquiry_detail_screen.dart:56,390`: 앱/웹·분류·처리 상태를 모두 배지로 표시하며 목록 상단에는 필터 레일 3개가 쌓임. | 색상 값 자체는 새 토큰이다. 무지개 구팔레트가 아니라 **상태 외 분류에까지 색상을 반복하는 표현**이 잔존. 분류는 중립 메타정보, 처리 상태만 의미색으로 정리하는 후보. 필터 통합·이동은 UX 변경 전 확인. |
| 팀 디렉터리·달력의 보조 라벨 | `features/teams/widgets/team_card.dart:83`의 `A GROUP`, `features/schedule/schedule_screen.dart:1104`의 `SELECTED DATE`. | 기능 없는 장식 영문을 한국어·간결한 정보로 정리. 숫자·영문용 Barlow 자체가 잘못된 것은 아님. |
| 더보기 알림 설정 | `app/more_screen.dart:140,255`의 `off`, `ON/OFF` 혼용. | `꺼짐/켜짐` 등 앱 안내 문구로 통일하는 낮은 우선순위 마감. 설정 동작 유지. |

### 팀 순위

`features/records/records_screen_sections.dart:1685`의 실제 팀 순위는 휴대폰에서도 8열 가로 표다. 타자·투수에 적용한 B안 간결한 행과 달리 팀명·승무패·승률 비교에 좌우 이동이 필요하다. `app/more_screen.dart:495`의 순위 메뉴도 이 화면으로 연결되므로 미사용 과거 화면이 아니다.

현재 표의 글꼴·색상은 정상이고 가로 스크롤로 레이아웃 넘침을 방지하고 있다. 모바일 요약 행과 전체 표를 분리하는 것은 B안의 **형식·탐색 마감 후보**이며, 표시 열·정렬 동작을 임의로 줄이지 않는다.

### 선수 상세

- `features/records/player_detail_screen.dart:1370,1392`: 바깥 카드 안에 다시 패널과 88dp 통계 셀을 중첩한다. B안 기록 행보다 여백·테두리 단계가 많다. 셀의 고정 폭은 큰 글자에서 줄바꿈 위험이 있으나 이번에 실기기 재현한 오류는 아니다.
- `:1135,1189`: 경기 로그 `DataTable`은 열 간격을 지정하지 않아 기본 간격을 사용한다. 메인 기록표의 16dp 간격(`records_screen_sections.dart:1508`)과 다르고 10열에서 가로 이동량이 크다. 가로 스크롤 자체나 표 글꼴은 정상이다.
- `:1332,1338,1344`: 16dp 여백·17sp 제목·2dp 네이비 구분선이 메인 기록 카드의 12dp·15sp·1dp 중립 구분선과 다르다.
- 처리 단위는 ‘선수 상세의 표·카드 밀도 정리’ 하나로 묶는다. 기록 필드·검색·정렬·시즌 선택은 변경하지 않는다.

### 아이콘 동작의 접근성 마감

새 아이콘·색상이더라도 동작 이름이 없는 곳이 남아 있다. 공통 입력 툴바의 이미지/영상/표(`core/widgets/editor/rich_text_editor.dart:298`), 커뮤니티 공지 작성 FAB(`features/community/community_screen.dart:207`), 팀 공지 추가·검색 지우기(`features/teams/team_detail_screen.dart:223,525`), 상세의 편집·삭제·댓글 전송(`inquiry_detail_screen.dart:252,667`, `notice_detail_screen.dart:433,783`, `player_registration_detail_screen.dart:194`, `features/teams/team_notice_detail_screen.dart:435`)가 대상이다.

tooltip 또는 Semantics 이름을 기존 동작에 연결하는 마감 대상이며, 아이콘을 바꾸거나 기능을 재구성할 필요는 없다. 실제 스크린리더로 각 권한별 노출도 재확인해야 한다. WebView 외곽의 작은 닫기/뒤로가기 조작은 D03/D04에 묶었다.

## 4. 화면별 적용 현황

다음 표는 화면 진입점 기준이다. 공통 F/D 항목의 영향을 받는다고 해서 해당 화면 전체가 구디자인이라는 뜻은 아니다.

| 화면 / 주요 파일 | 현재 판정 |
|---|---|
| 앱 셸 `app/main_shell.dart`, `core/navigation/native_destination_bar.dart` | B안 고정 6탭 적용. 기존 플로팅 바·레일을 현재 셸에서 사용하지 않음. |
| 홈 `features/home/home_screen.dart`, `widgets/native_home_widgets.dart` | B안 축약 캠페인·목록/달력·조별·리더·파트너 적용. F03 라벨만 별도 마감. |
| 팀 목록 `features/teams/team_hub_screen.dart`, `widgets/team_card.dart` | B안 검색·A~H 선택·독립 로고 카드 적용. 한글 이니셜 F03 및 GROUP 라벨 마감. |
| 팀 상세 `features/teams/team_detail_screen.dart`, `widgets/member_card.dart`, `notice_card.dart` | 새 테마·로고 영역·로스터 적용. 큰 상세 헤더·F03·아이콘 이름 마감. 미확정 점수 문제는 6절. |
| 팀 공지 상세 `features/teams/team_notice_detail_screen.dart` | 표면·제목·댓글 배치 적용. 공통 F01/D01 및 일부 아이콘 이름 마감. |
| 경기 `features/schedule/schedule_screen.dart`, `widgets/schedule_controls.dart`, `schedule_day_grouping.dart` | 일정·결과/조별/라이브/연습경기 4탭, 날짜별 간결한 카드·달력·공식 조별 상태 적용. F03 월 단위·달력 장식 라벨 마감, 오류/초기 조회 문제는 6절. |
| 기록 `features/records/records_screen.dart`, `records_screen_sections.dart` | 개요·팀 순위·투수·타자·파워랭킹·선수 6탭 적용. F03 팀 수 단위 및 선수 상세 마감. |
| 선수 상세 `features/records/player_detail_screen.dart` | 선택 선수 우선 구조와 테마 적용. 중첩 통계 셀·표·제목 밀도는 3절 대상. |
| 커뮤니티 `features/community/community_screen.dart` | B안 게시판 바로가기·목록 적용. 작성 팝업은 F01, 작성 FAB는 아이콘 이름 마감. |
| 공지 상세 `features/community/notice_detail_screen.dart` | 상세·편집·댓글의 새 표면 적용. F01/D01·아이콘 이름 마감. |
| 문의 목록 `features/community/inquiry_board_screen.dart` | 새 토큰은 적용. 다중 배지·3단 필터 레일은 3절 마감 후보. |
| 문의 상세 `features/community/inquiry_detail_screen.dart` | 새 표면 적용. 배지 형식, F01/D01·아이콘 이름 마감. 비밀 문의의 권한 구조는 별도 백엔드 범위로 유지. |
| 문의 작성/편집 `features/community/inquiry_write_screen.dart` | 입력·선택·스크롤 표면 적용. 공통 작성기 F01. |
| 선수 등록 목록 `features/community/player_registration_board_screen.dart` | 목록·검색·분류의 새 토큰 적용. 추가 구팔레트 발견 없음. |
| 선수 등록 상세 `features/community/player_registration_detail_screen.dart` | 상세 표면 적용. F01/D01·아이콘 이름 마감. |
| 선수 등록 작성/편집 `features/community/player_registration_write_screen.dart` | 폼·선택·작성 표면 적용. 공통 작성기 F01. |
| 더보기 `app/more_screen.dart` | B안 계정·설정·권한별 메뉴 적용. 알림 문구만 낮은 우선순위 마감. |
| 계정 `features/account/account_screen.dart` | 색상·폰트 기본 적용. 큰 히어로/반복 패널·F03 이니셜 마감. |
| 온보딩 `features/onboarding/onboarding_screen.dart` | B안 로고·간결한 안내·로그인/둘러보기 우선 구조 적용. 다크 로고 틴트 정상. |
| 리그 소개 `features/intro/intro_screen.dart` | 새 테마 적용. 큰 소개는 축약 검토 대상, 별도 정보 정확성 이슈 있음. |
| 회칙 `features/intro/rules_screen.dart` | 표면·검색 강조 색상 적용. 직접 RichText F02 및 큰 문서 히어로 마감. |
| 도움말 `features/help/user_manual_screen.dart` | 새 테마·큰 글자 탭 적용. 큰 히어로·스크린샷 placeholder·안내 내용 갱신 필요. |
| 개인정보 `features/legal/privacy_screen.dart` | 테마·본문 Pretendard 적용. 큰 문서 히어로는 낮은 우선순위 축약 후보. |
| 이용약관 `features/legal/terms_screen.dart` | 테마·본문 Pretendard 적용. 큰 문서 히어로는 낮은 우선순위 축약 후보. |
| 시작/점검 `app/maintenance_guard.dart`, `features/auth/maintenance_screen.dart` | 시작 로딩 D02. 점검 본 화면은 새 테마가 적용된 전용 전체화면 상태. |
| 로그인 `features/auth/login_webview_screen.dart` | 웹 로그인 유지, 테마 브리지 적용. 네이티브 오류 배너 D03. |
| 일반 웹 `core/webview/app_webview_screen.dart` | 관리자·경기 편집·전광판 등 공통 외곽 테마 적용. D03, 미사용 minimalHeader 예외. |
| 임베디드 웹 `app/embedded_webview_panel.dart` | 기록원·문자중계 등의 외곽 테마 적용. 오류 배너 D03, 라이브/뒤로가기 D04. |

### 공통 컴포넌트 조사

| 파일·계층 | 판정 |
|---|---|
| `core/theme/app_theme.dart`, `theme_controller.dart`, `app/app.dart` | 라이트·다크·시스템 저장 및 Pretendard 기반 설정 적용. F01/F02는 이를 우회하는 렌더링 경로. |
| `core/widgets/season_components.dart` | 버튼·상태·빈/오류·최신성 표면 적용. 최신성 F03, 큰 PageHero/SectionPanel은 사용 맥락별 분류. |
| `core/widgets/season_campaign_hero.dart` | 캠페인 별도 소개 시트의 의도된 큰 표현. 한글 fallback도 명시됨. |
| `core/widgets/error_banner.dart`, `match_status_badge.dart` | 새 의미 색상·형상 적용. 일부 WebView만 공통 오류 UI 미사용(D03). |
| `core/widgets/section_header.dart` | Pretendard·시즌 색상 적용. 큰 글자·긴 제목/동작 조합의 후속 검증 대상. |
| `core/widgets/editor/rich_text_editor.dart`, `rich_text_viewer.dart` | 외곽·툴바·이미지 모서리는 적용. 문단 글꼴 F01 및 커스텀 아이콘 이름 마감. |
| `core/widgets/editor/table_embed.dart` | 4dp 표면·의미 색상·가로 탐색·표 편집 스크롤 적용. 일반 Text는 Pretendard 상속. |
| `core/widgets/moderation/moderation_dialogs.dart` | D01의 고정 다크 대화상자. |
| `core/widgets/moderation/e911_emergency_icon.dart` | 실제 호출부에서 테마 색상을 전달. 기본 회색 상수만 보고 누락으로 세지 않음. |
| `core/webview/webview_theme_bridge.dart`, `core/contracts/web_contracts.dart` | 초기 theme/embedded 파라미터 및 변경 이벤트 계약 적용. 웹 본문 글꼴은 웹이 담당. |

## 5. 의도적인 예외·미사용 코드

| 대상 | 판정 |
|---|---|
| 홈 배너에서 여는 `SeasonCampaignHero` | 긴 캠페인을 별도 소개 시트에 남기기로 한 B안 결정이다. 큰 히어로라는 이유로 미적용으로 세지 않는다. |
| `core/navigation/app_destination_navigation.dart`의 플로팅 바·레일 | A안 비교용 구현이 남아 있으나 B안 셸은 `NativeDestinationBar`를 사용한다. 같은 파일의 아이콘 매핑은 여전히 사용하므로 파일 전체를 삭제 대상으로 보지 않는다. |
| `core/widgets/background_logo.dart` | 현재 호출처 없음. 이전 대형 배경 워터마크가 앱에 실제 노출된다는 근거로 쓰지 않는다. |
| `features/standings/standings_screen.dart`, `power_ranking_screen.dart` | 현재 호출처 없는 기록 허브 호환 래퍼. 별도의 옛 순위 UI나 데모 Elo가 노출되는 것은 아니다. |
| `features/prediction/prediction_screen.dart` | 준비 화면 코드가 있으나 더보기 메뉴 진입이 주석 처리되어 있음. 재활성화는 디자인 작업이 아니라 기능 결정이다. |
| `features/scorekeeper/scorekeeper_webview_screen.dart` | 직접 호출처 없음. 실제 더보기 기록원 경로는 임베디드/범용 WebView. |
| `features/schedule/schedule_view_model.dart`, `data/schedule_repository.dart` | 현재 프로덕션 화면의 참조 없이 테스트에서 사용. 남은 정적 조 추론을 실제 공식 경기 화면의 디자인·정보 문제와 혼동하지 않음. |
| `core/widgets/season_components.dart`의 `PublicMatchCard` | 현재 프로덕션 생성 없이 반응형 테스트에서 사용. 실제 홈·일정은 B안 전용 간결한 카드. |
| `AppTheme`의 `slate*`, `purple*` 등 호환 상수 | 이름이 남아 있다는 이유로 모두 구색상으로 집계하지 않음. 실제 사용처 중 문제는 D01/D02 등으로 분리. |
| 리그 소개의 `amber400`·조별 색 배열 | `_mutedAccent`가 인자를 쓰지 않고 현재 cobalt를 반환하므로 실제 화면에 무지개색으로 노출되는 것은 아님. |
| OS 키보드·Google/Apple 인증·권한 팝업 | 플랫폼/제공자 UI. 앱의 Pretendard·카드 모양을 강제로 입히는 대상이 아님. |
| 사용자 업로드 로고·이미지·영상·게시글의 지정 서식 | 콘텐츠 자산과 앱 UI를 구분. 앱 테마를 맞추기 위해 원본·Delta·로고를 임의로 변경하지 않음. |

관리자·UniquePlay·기록원·경기 기록 편집·전광판은 웹 구현을 계속 사용한다. 앱의 관리자 메뉴에서 웹 관리자 패널로 들어가 UniquePlay 하위 메뉴를 여는 구조이며, 별도 자동 수집은 추가하지 않는다. 앱에 새 직접 진입 메뉴를 넣거나 운영 화면을 네이티브로 재구축하는 것은 이번 디자인 감사의 수정 범위가 아니다.

## 6. 디자인 조사 중 발견한 별도 기능·정보 확인 사항

**아래 항목은 디자인 수정에 섞어 자동 처리하지 않는다.** 데이터 의미·조회 동작·운영 안내가 바뀌므로 사용자 확인 후 별도 작업으로 진행한다. 운영 상태를 직접 재현한 것이 아니라 아래 코드 경로로 확인한 문제/위험이다.

| ID | 항목 | 근거와 필요한 결정 |
|---|---|---|
| C01 | 리그 소개의 과거 예정 경기·규정 요약 | `features/intro/intro_screen.dart:52,669`에서 2026-01-24/25를 ‘예정’으로 표시하는 고정 4강 대진이 항상 포함된다. `:612`는 ‘조당 4~5팀’, ‘하위권은 버금’으로 현재 확정 전제(각 조 5팀, 3·4위 버금, 5위 탈락)와 다르다. **게시 데이터 연결 / 과거 자료로 명시 / 제거 중 방향 확인이 우선**이다. 회칙 판정 규칙을 임의로 다시 만들지 않는다. |
| C02 | 도움말이 현재 메뉴·공식 기록 원천과 불일치 | `features/help/user_manual_screen.dart:63`의 옛 일정 5분류, `:114`의 ‘그냥 사용하기’, `:285,354`의 수동 경기 재임포트 안내, `:486`의 2026-03-04 문서 버전·‘일정’ 탭 표기가 남음. B안 4개 경기 하위 탭과 UniquePlay 공개 원장 정책에 맞는 설명을 검수 후 교체해야 한다. |
| C03 | 라이브/연습경기 조회 실패가 빈 상태로 보임 | `features/schedule/schedule_screen.dart:516`은 스트림의 오류·초기 대기를 구분하지 않는다. 공식 API 라이브 결과도 없을 때 ‘현재 진행 중인 경기 없음’으로 표시할 수 있다. `:111`의 연습경기 조회 예외도 빈 목록으로 바꾼다. 오류·대기·빈 상태와 재시도 정책을 정해야 한다. |
| C04 | 초기 로딩 중 조별 탭 진입 경합 | `features/schedule/schedule_screen.dart:87,184`에서 시즌 ID 준비 전 조별 요청은 반환하고, `:99`의 초기 로딩 완료 뒤 재요청하지 않는다. 순위는 보여도 조별 경기만 빈 상태가 될 수 있는 경로다. 느린 응답 fixture로 재현한 뒤 수정 여부 확인. |
| C05 | 팀 상세의 미확정 점수 | `features/teams/team_detail_screen.dart:702`는 종료/라이브 경기의 null 점수를 0으로 표시한다. 일정 카드의 ‘-’와 달라 같은 경기 해석이 달라질 수 있다. 0과 미확정을 분리하는 표시 정책 확인. |
| C06 | 목록·달력 날짜의 우선순위 | `features/schedule/schedule_screen.dart:1087`은 `gameDate ?? startTime`, `schedule_day_grouping.dart:13` 및 `widgets/schedule_controls.dart:250`은 반대 순서다. 두 필드의 KST 날짜가 다를 경우 표시가 달라질 수 있다. 정상 동일 날짜 데이터에서 확인된 오류는 아니며 fixture 보강 대상이다. |

추가 실기기 확인 후보: 기록 TOP 5의 고정 144dp 정렬 선택(`features/records/records_screen.dart:1410`), 리그 소개의 비유연 팀명 칩(`features/intro/intro_screen.dart:750`)을 360dp·200% 글자로 확인한다. 정적 위험만으로 재현된 오버플로우나 앱 충돌이라고 단정하지 않는다.

## 7. 권장 후속 순서

1. F01/F02/F03 글꼴과 D01 신고 팝업·D04 라이브 버튼 대비부터 수정한다. 기능·저장 형식을 바꾸지 않는 마감이다.
2. 계정·팀 상세·선수 상세의 B안 밀도를 맞추고 팀 순위·문의 필터의 표시 방식은 사용자 확인 후 적용한다.
3. 회칙·도움말·약관 헤더, 장식 라벨, 아이콘 동작 이름, 오류 배너·시작 화면을 정리한다.
4. C01~C06은 별도 기능·콘텐츠 작업으로 검수한다. 특히 과거 고정 대진과 현재 운영 안내의 충돌은 출시 전 확인을 권한다.
5. 권한별 실제 화면과 원격 콘텐츠, 라이트·다크·큰 글자·오프라인·WebView 경계를 실기기에서 확인한 뒤 배포 판단을 한다.

## 8. 검증 결과와 후속 검증

- 이번 감사에서 `flutter analyze --no-pub`: **No issues found**.
- `flutter test --no-pub --reporter expanded`: **기존 124개 전체 통과**.
- 별도 임시 위젯 fixture 2개: 서식 없는 Delta의 글꼴 상속 누락, 라이트 신고 팝업의 흰 글자/흰 입력면 조합 확인. 정상 동작을 검증한 회귀 테스트가 아니라 현재 결함을 재현하는 진단이다. 앱 테스트 목록·소스에는 추가하지 않았다.
- 홈 B안 390dp 라이트·다크 golden 시각 확인. 이 이미지는 fixture 경기이며 전체 실데이터 화면의 증거가 아니다.
- 폰트 번들 `pubspec.yaml:49`의 Pretendard 및 Barlow 600/900, 라이선스 자산 확인. 웹 `src/index.css:4,12,20,34`와 글꼴 계열, 주요 라이트·다크 색상 토큰이 대응한다.
- 활성 Dart UI에 과도한 그라데이션 선언은 발견하지 않았다. 남은 `BoxShadow`는 현재 사용하지 않는 A안 탐색 컴포넌트다. 상태 목적의 경고·오류·성공색은 무지개 장식으로 집계하지 않았다.
- 앱 코드가 바뀌지 않아 새 릴리스 빌드는 생성하지 않았다. 기존 A/B 빌드 및 스토어 미제출 상태를 유지한다.

후속 수정 때에는 리치 텍스트 plain/Delta/검색 강조/한글 이니셜의 실제 글꼴, 신고 대화상자 라이트·다크, 첫 실행 테마 전환, 로그인 실패·문자중계 오버레이, 큰 글자 상세 표를 우선 회귀 검사한다. 기존 124개 통과만으로 이러한 시각적 마감이 완료됐다고 판단하지 않는다.

# App Refactor Backlog (Flutter)

Updated: 2026-02-18

## 1) Scope

- Target: `/Users/juhwan/Documents/Dev/AUBL/main/flutter_app/lib`
- Goal: web과 동일한 계약 중심 구조로 앱 리팩토링을 단계 진행
- Constraint: 웹-앱 계약(URL/브리지 메시지)은 고정 유지

## 2) Guardrails

- Route contracts:
  - `/login`, `/scorekeeper`, `/scoreboard`, `/scoreboard-text/:matchId`, `/live-overlay/:matchId`, `/admin`, `/schedule/manage`
- Query contracts:
  - `embedded=flutter`, `nativeGoogle=1`, `next`
- Bridge contracts:
  - `LOGIN_SUCCESS`, `TOKEN_REFRESH`, `LOGOUT`, `REQUEST_NATIVE_GOOGLE`
  - `__flutterAuthInject`, `__flutterGetIdToken`
- Quality gates:
  - `dart analyze`
  - `flutter test`

## 3) P0 (Now)

1. WebView 인증 동기화 안정화 완료
- done: 공통 계약 상수/스크립트/상태 캐시 도입
- files:
  - `flutter_app/lib/core/contracts/web_contracts.dart`
  - `flutter_app/lib/core/contracts/flutter_bridge_contract.dart`
  - `flutter_app/lib/core/webview/webview_auth_scripts.dart`
  - `flutter_app/lib/core/webview/webview_auth_sync_state.dart`

2. WebView 화면 공통 Auth Sync Controller 추출
- done: `app_webview_screen.dart` / `embedded_webview_panel.dart` 인증 처리 흐름을 단일 컨트롤러로 통합
- files:
  - `flutter_app/lib/core/webview/webview_auth_sync_controller.dart`
  - `flutter_app/lib/core/webview/app_webview_screen.dart`
  - `flutter_app/lib/app/embedded_webview_panel.dart`
  - `flutter_app/lib/features/auth/login_webview_screen.dart`
  - `flutter_app/lib/features/scorekeeper/scorekeeper_webview_screen.dart`
- 기대효과: 화면별 분기 차이 최소화, 주입/로그인 회귀 감소

3. 인증 회귀 테스트 보강
- done (unit baseline):
  - bridge duplicate token 메시지 무시 테스트
  - logout 이후 동일 UID 재로그인 주입 상태 테스트
  - login redirect(`next`) query contract 테스트
- files:
  - `flutter_app/test/core/webview/webview_auth_sync_state_test.dart`
  - `flutter_app/test/core/webview/webview_auth_sync_controller_test.dart`
  - `flutter_app/test/core/contracts/web_contracts_test.dart`

## 4) P1 (Architecture)

1. 레이어 의존 규칙 정적 체크 도입
- done (phase 2):
  - `core -> features` 금지 검사 추가
  - `app -> features`는 `features/feature_entries.dart` 경유만 허용
  - 파일:
    - `flutter_app/tool/layer_dependency_checker.dart`
    - `flutter_app/test/core/architecture/layer_dependency_checker_test.dart`
    - `flutter_app/lib/features/feature_entries.dart`
- next:
  - `app -> feature entry facade`를 feature 단위 facade로 세분화
- 방법 후보:
  - custom analyzer plugin 또는 CI grep rule

2. WebView feature 묶음 재구성
- done (phase 1):
  - `core/webview` 하위에 `navigation`, `auth_sync`, `bridge` 책임 분리
  - `AppWebViewScreen`/`EmbeddedWebViewPanel` 공통 navigation/auth sync 유틸 사용
- files:
  - `flutter_app/lib/core/webview/navigation/webview_navigation_guard.dart`
  - `flutter_app/lib/core/webview/auth_sync/webview_auth_sync_controller.dart`
  - `flutter_app/lib/core/webview/auth_sync/webview_auth_sync_state.dart`
  - `flutter_app/lib/core/webview/auth_sync/webview_auth_scripts.dart`
  - `flutter_app/lib/core/webview/bridge/flutter_bridge_message.dart`
  - `flutter_app/test/core/webview/webview_navigation_guard_test.dart`

3. 계약 사용 일관성 100% 달성
- done (phase 1):
  - 경로/브리지/query 계약 하드코딩 전수 스캔 및 코드/테스트 상수 치환
  - `flutter_app/lib` + `flutter_app/test` 대상 스캔 기준 잔여 하드코딩 0건
- files:
  - `flutter_app/test/core/webview/webview_auth_sync_controller_test.dart`
  - `flutter_app/test/core/webview/webview_navigation_guard_test.dart`
  - `flutter_app/lib/core/webview/app_webview_screen.dart`

## 5) P2 (Domain/State)

1. Feature state 관리 정리
- in progress:
  - done (phase 1, schedule):
    - `ScheduleScreen`의 cache/firestore 로딩 로직을 view-model/data layer로 분리
    - 파일:
      - `flutter_app/lib/features/schedule/data/schedule_repository.dart`
      - `flutter_app/lib/features/schedule/schedule_view_model.dart`
      - `flutter_app/lib/features/schedule/schedule_screen.dart`
      - `flutter_app/test/features/schedule/schedule_view_model_test.dart`
  - done (phase 2, teams hub):
    - `TeamHubScreen`의 Firestore 직접 접근/필터·정렬 로직을 feature view-model/data layer로 분리
    - 파일:
      - `flutter_app/lib/features/teams/data/team_hub_repository.dart`
      - `flutter_app/lib/features/teams/team_hub_view_model.dart`
      - `flutter_app/lib/features/teams/team_hub_screen.dart`
      - `flutter_app/test/features/teams/team_hub_view_model_test.dart`
  - done (phase 3, team detail):
    - `TeamDetailScreen`의 역할 확인/공지 처리 로직을 feature view-model/data layer로 분리
    - 파일:
      - `flutter_app/lib/features/teams/data/team_detail_repository.dart`
      - `flutter_app/lib/features/teams/team_detail_view_model.dart`
      - `flutter_app/lib/features/teams/team_detail_screen.dart`
      - `flutter_app/test/features/teams/team_detail_view_model_test.dart`
  - done (phase 4, records):
    - `RecordsScreen`의 대형 로딩/필터링 로직을 `RecordsViewModel`로 분리
    - 파일:
      - `flutter_app/lib/features/records/records_view_model.dart`
      - `flutter_app/lib/features/records/records_screen.dart`
      - `flutter_app/test/features/records/records_view_model_test.dart`
  - done (phase 5, records ui state):
    - `RecordsScreen` 필터/정렬/검색/power 상태를 `RecordsFilterState`로 통합
    - 파일:
      - `flutter_app/lib/features/records/records_filter_state.dart`
      - `flutter_app/lib/features/records/records_screen.dart`
  - done (phase 6, records sections):
    - `RecordsScreen`의 탭/필터 섹션 메서드를 파트 파일로 분리
    - 파일:
      - `flutter_app/lib/features/records/records_screen.dart`
      - `flutter_app/lib/features/records/records_screen_sections.dart`
  - done (phase 7, records widget decomposition):
    - `Overview/Standings/Power` 탭 섹션을 독립 `StatelessWidget`으로 분리하고, `State`에는 콜백/상태 주입만 유지
    - 파일:
      - `flutter_app/lib/features/records/records_screen_sections.dart`
  - done (phase 8, records widget decomposition):
    - `Batters/Pitchers` 탭 섹션을 독립 `StatelessWidget`으로 분리하고, `State`에는 콜백/상태 주입만 유지
    - 파일:
      - `flutter_app/lib/features/records/records_screen_sections.dart`
  - done (phase 9, records table builders):
    - `Batters/Pitchers` 공통 컬럼/행(DataCell) 및 `DataTable` 스캐폴드를 재사용 빌더로 통합
    - 파일:
      - `flutter_app/lib/features/records/records_screen_sections.dart`
  - done (phase 10, records table builders):
    - `Standings/Power` 테이블에도 공통 가로 `DataTable` 빌더 적용
    - 파일:
      - `flutter_app/lib/features/records/records_screen_sections.dart`
  - next:
    - Records table 렌더링 snapshot/widget 테스트 보강
    - 테이블 헤더/셀 스타일 상수를 records table schema 단위로 분리

2. 모델/DTO 정규화
- todo:
  - backend snake/camel 혼합 응답의 정규화 로직 공통 모듈화
  - records/schedule/team 모델 정합성 검사 추가

## 6) P3 (UX/Performance)

1. WebView 성능/복구 개선
- todo:
  - err_failed/aborted 재시도 정책 공통화
  - loading/error 배너 공통 컴포넌트화

2. 번들/초기화 최적화
- todo:
  - 첫 진입 탭의 데이터 prefetch 전략 정리
  - 이미지/cache 정책 통일

## 7) Recommended Execution Order

1. P0-2 (Auth Sync Controller 추출)
2. P0-3 (인증 회귀 테스트)
3. P1-1 (레이어 규칙 정적 체크)
4. P1-2 (webview 모듈 재구성)
5. P1-3 (계약 문자열 통일)
6. P2 (도메인/상태 분리)

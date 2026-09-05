# AUBL 모바일 1.1.0+16 릴리스 기록

작성일: 2026-09-04  
앱 ID: `com.aubl.app`  
대상: Android minSdk 24 / iOS 13 이상

## 결론

웹 2026 시즌 개편의 디자인, 공식 데이터 구조, 일정·조별·기록 흐름을 Flutter 공개 화면에 이식했다. 관리자·UniquePlay·기록원·전광판은 기존 웹 구현과 인증 계약을 유지한다. UniquePlay 자동 수집은 구현하지 않았으며 모바일에서도 관리자가 WebView의 버튼을 직접 누른 경우에만 실행된다.

2026-09-05 후속 작업은 [시각 정합성 마감 기록](mobile-visual-parity-2026-09-05.md)과 [모바일 오류·사용성 점검 기록](mobile-ux-polish-2026-09-05.md)에 이어서 기록했다. 아래 자동 검사·빌드 증적은 최초 2026-09-04 기준이며, 최신 테스트 수(108개)와 생성물 체크섬은 후속 점검 기록을 따른다.

## 단계별 변경과 평가용 커밋 원장

| 커밋 | 단계 | 핵심 변경 | 회귀 영향 |
|---|---|---|---|
| `71c7e2a` | 출시 기준선 | 1.1.0+16, Flutter 3.41.6 기준, 민감 로그 제거 | 버전·빌드 설정 |
| `a653f50` | 데이터 안전성 | 비활성 source 공개 제외, 최신 API 모델, null 기록 보호 | 공식 경기·기록 노출 |
| `f02d52c` | 디자인 셸 | 라이트/다크 토큰, 테마 저장, 6탭 플로팅 탐색, 폰트 | 앱 전체 탐색·테마 |
| `a4da3d5` | 홈·경기 | 2026 overview, 공지, 달력, 조별, 리더, 파트너, 경기 상세 | 홈·일정 핵심 흐름 |
| `21cd33f` | 팀 | 서버 시즌 조 우선, 테마 대응 독립 로고 영역 | 팀 디렉터리 |
| `13b6282` | 기록 | 공통 카드·표, 선수 상세, 반응형 레이아웃 | 기록 탐색 |
| `5fa6739` | 공개 화면 | 커뮤니티·계정·온보딩·도움말·회칙·승부예측 디자인 통합, 데모 Elo 제거 | 공개/사용자 화면 |
| `399c574` | WebView | 테마 query/event와 시스템 바 동기화, 인증 계약 유지 | 운영 WebView |
| `b2c9a0a` | 오프라인·KST | revision별 캐시, 오프라인 표시, KST 자정 경계 | 공식 데이터 복구 |
| `d7e5f4a` | 빌드 환경 | 공개 env 프로필 추적, API URL 필수화, 플랫폼 최소 버전 | 재현 가능한 빌드 |
| `55acd30` | 반응형 검사 | 360/390/768px, 200% 글자, 1024px 레일·터치 테스트 | 접근성·레이아웃 |
| `1415f8f` | iOS 호환 | UIScene lifecycle, implicit engine 플러그인 등록 | iOS 앱 수명주기 |
| `eecf0fa` | 모바일 후속 보정 | 큰 글자·키보드·가로 화면, 달력 터치, 경기·검색·댓글 표시 상태 | 모바일 조작·가독성 |
| `d6d0349` | 시작 안정화 | 첫 프레임 우선 표시, 초기 알림 이동, 지연 구독의 OFF·로그아웃 경합 수정 | 시작·푸시 설정 정합성 |

## 데이터 계약 확인

2026-09-04 운영 API에 변경 없는 GET만 실행했다. UniquePlay 수집·검증·게시 API는 호출하지 않았다.

- `/api/seasons`: 2026 시즌 ID `12` 확인
- `/api/seasons/12/overview`: provider `UNIQUE_PLAY`, syncMode `MANUAL`, 활성 revision `ca075759-16ef-48c6-913f-a55453bda54f` 확인
- 조별 현황: A~H 8개 조, 각 5팀 확인
- `/api/games?seasonId=12&dateFrom=2026-09-01&dateTo=2026-09-30`: 8개 예정 경기, `sourceGameId`, `syncRevision`, 진출 상태 확인
- 운영 overview의 타자·투수 리더는 확인 시점에 빈 배열이었다. 앱은 가짜 0 기록 대신 빈/검증 중 상태를 표시한다.

## 자동 검증 결과

- `flutter analyze`: 오류 0
- `flutter test`: 기존 테스트와 신규 KST·revision 캐시·WebView 테마·반응형 테스트 64개 전체 통과
- 화면 폭: 360, 390, 768px
- 글자 배율: 100%, 130%, 200%
- 탐색: 360px 6탭, 1024px 플로팅 레일, 44dp 이상 주요 버튼
- `npm run typecheck`: WebView 테마 수신 변경 포함 통과

## 빌드 증적

- Android release AAB: `flutter_app/build/app/outputs/bundle/release/app-release.aab`
  - prod 환경 프로필, 서명 검증 `jar verified`
  - 크기 56.4MB
  - SHA-256 `b637300c03bfacff59afa40859dd496d8998049f96fa63ef64486e91bf340686`
- iOS no-codesign release: `flutter_app/build/ios/iphoneos/Runner.app`
  - `com.aubl.app`, `1.1.0 (16)`, MinimumOSVersion `13.0`
  - Xcode device release 빌드 성공

빌드 산출물과 서명·Firebase 설정 파일은 Git에 포함하지 않는다.

## 출시 상태와 다음 게이트

코드, 자동 검사, 운영 GET 스모크, 로컬 release 빌드는 완료했다. Play Console 업로드와 App Store Connect/TestFlight 제출은 외부 콘솔 작업이며 아직 실행하지 않았다.

1. Play Internal 및 TestFlight에서 로그인·계정 삭제·푸시·WebView 인증·공지 숨김·달력·상세 이동을 실기기 검증한다.
2. 내부 테스트를 최소 24시간 유지한다.
3. Android Closed → 10% → 50% → 100%, iOS 단계적 출시 순서로 진행한다.
4. 10%와 50%는 각각 최소 48시간 관찰한다.
5. 로그인/계정 삭제 실패, 비활성 경기 노출, 가짜 0 기록, P0 충돌, 유의미한 crash/ANR 증가 시 즉시 확대를 중단한다.

# AUBL Flutter App

전국대학아마추어야구연합회(AUBL) 공식 모바일 앱입니다.
Flutter 네이티브 UI와 WebView를 결합한 하이브리드 아키텍처로 구성되어 있으며,
실시간 경기 정보, 팀 관리, 커뮤니티, 푸시 알림 등 리그 운영에 필요한 핵심 기능을 제공합니다.

**버전:** 1.0.0
**플랫폼:** Android / iOS
**Flutter SDK:** 3.4.0+

---

## 아키텍처

### 하이브리드 접근

핵심 사용자 화면은 **Flutter 네이티브**로 구현하고, 기록원·스코어보드·관리자 패널 등
복잡한 웹 기능은 **WebView 오버레이**로 연동합니다.

```
┌─────────────────────────────────┐
│        Flutter Native UI        │
│  (홈, 팀, 일정, 기록, 순위 등)    │
├─────────────────────────────────┤
│     WebView Overlay Layer       │
│  (기록원, 스코어보드, 관리자)      │
├─────────────────────────────────┤
│      Firebase Services          │
│  (Auth, Firestore, FCM)         │
└─────────────────────────────────┘
```

### 상태 관리

별도의 상태 관리 라이브러리 없이 Flutter 기본 패턴을 사용합니다.

- **StreamBuilder** — Firestore 실시간 구독
- **StatefulWidget** — 컴포넌트 단위 UI 상태
- **FirebaseAuth.authStateChanges()** — 인증 상태 감지
- **SharedPreferences** — 로컬 환경 설정 저장
- **ShellController (InheritedWidget)** — 네비게이션 컨텍스트 공유

---

## 주요 기능

### 1. 홈 대시보드
- 실시간 경기 캐러셀 (BSO, 주자, 현재 투수/타자)
- 소속팀 공지 캐러셀 (로그인 시)
- 오늘/내일 일정 가로 스크롤
- 최근 경기 결과 (최근 5경기)
- 시즌 요약 통계 및 빠른 네비게이션

### 2. 팀 허브
- 41개+ 대학 팀 그리드 디렉토리
- 팀명 검색 및 조(A-H) 필터/정렬
- 팀 상세: 소개, 연혁, 엠블럼, 로스터, 공지
- 팀 공지 상세 및 댓글

### 3. 일정 & 경기
- 탭 구성: 전체 / 라이브 / 결과 / 조별 / 순위 / 연습경기
- 실시간 경기 상태 표시 (BSO, 주자, 이닝)
- 조별(A-H) 필터링

### 4. 기록실
- 시즌별 타자 스탯 (AVG, OBP, SLG, OPS, HR, RBI, SB, WAR)
- 시즌별 투수 스탯 (ERA, IP, WHIP, SO, BB, SV, WAR)
- 리그 평균 요약 및 선수/팀 검색

### 5. 순위
- Elo 기반 팀 파워랭킹
- 1위 팀 히어로 카드
- 승-패-무 전적 및 Elo 점수 테이블
- 상세 파워랭킹 (승률 비교 분석)

### 6. 커뮤니티
- 전체 공지 목록 (긴급, 경기공지, 징계, 일반)
- 카테고리 필터
- 공지 상세 및 댓글

### 7. 푸시 알림 (FCM)
- 경기 알림: 전체 / 소속팀만 / 끄기
- 커뮤니티 공지 알림 (긴급 공지는 항상 수신)
- 소속팀 공지 알림
- FCM 토픽 기반 구독 관리

### 8. 계정 & 설정
- 사용자 프로필 (이메일, 닉네임, 가입일)
- 역할 표시 (관리자, 감독, 스태프, 선수, 일반)
- 소속팀 표시
- 알림 설정, 리그 소개, 회칙 열람
- 개인정보처리방침, 이용약관

### 9. 관리자 기능 (권한 필요)
- 기록원 (Scorekeeper) — 실시간 경기 기록 WebView
- 스코어보드 — 중계용 스코어 표시
- 관리자 패널 — AUBL 관리 도구
- 일정 관리 — 경기 일정 편집

### 10. 온보딩 & 인증
- 첫 실행 환영 화면 및 로그인 유도
- WebView 기반 로그인 (이메일/비밀번호)
- 네이티브 Google Sign-In
- 네이티브 Apple Sign-In (iOS)
- 토큰 브리지를 통한 웹 ↔ 네이티브 인증 동기화

---

## 인증 플로우

### 웹 로그인 경로
```
WebView(/login?embedded=flutter)
  → 이메일/비밀번호 또는 Google 로그인
  → 웹이 LOGIN_SUCCESS + idToken 전송
  → Flutter가 Cloud Function으로 토큰 교환
  → customToken으로 FirebaseAuth.signInWithCustomToken()
```

### 네이티브 Google 로그인
```
WebView에서 Google OAuth 트리거 감지
  → Flutter가 GoogleSignIn.signIn() 호출
  → Firebase credential 생성
  → 인증 후 WebView에 토큰 주입
```

### 네이티브 Apple 로그인 (iOS)
```
Flutter 화면에서 Apple Sign-In 버튼 선택
  → SignInWithApple.getAppleIDCredential() 호출
  → Firebase OAuthProvider('apple.com') credential 생성
  → Firebase 인증 완료
```

### 브리지 메시지 계약

웹 → Flutter (`FlutterBridge.postMessage(JSON.stringify(payload))`)

| 타입 | 페이로드 | 설명 |
|------|----------|------|
| `LOGIN_SUCCESS` | `{ type, idToken, uid, email }` | 로그인 성공 |
| `TOKEN_REFRESH` | `{ type, idToken }` | 토큰 갱신 |
| `LOGOUT` | `{ type }` | 로그아웃 |
| `REQUEST_NATIVE_GOOGLE` | `{ type }` | 네이티브 Google 로그인 요청 |

---

## 디렉토리 구조

```
flutter_app/lib/
├── main.dart                        # 앱 진입점, Firebase 초기화, 알림 설정
├── app/
│   ├── app.dart                     # MaterialApp 루트, 온보딩 게이트
│   ├── main_shell.dart              # 하단 탭 네비게이션 쉘
│   ├── shell_controller.dart        # WebView 명령 컨텍스트 공유
│   ├── embedded_webview_panel.dart   # 오버레이 WebView 패널
│   └── more_screen.dart             # 설정, 로그인, 알림, 관리자 메뉴
├── core/
│   ├── config/
│   │   └── app_config.dart          # dart-define 기반 환경 설정
│   ├── models/
│   │   ├── user_profile.dart        # 사용자 프로필
│   │   ├── team.dart                # 팀 정보 (이름, 조, 색상, 연혁)
│   │   ├── match.dart               # 경기 구조 (팀, 점수, 상태)
│   │   ├── match_state.dart         # 실시간 경기 상태 (BSO, 주자, 이닝)
│   │   ├── notice.dart              # 전체 공지
│   │   ├── notice_comment.dart      # 공지 댓글
│   │   ├── team_notice.dart         # 팀 공지
│   │   └── team_member.dart         # 팀 로스터 멤버
│   ├── services/
│   │   ├── firestore_service.dart   # Firestore CRUD 및 실시간 스트림
│   │   ├── notification_service.dart # FCM 구독 관리
│   │   └── auth_bridge_service.dart  # 웹 idToken → customToken 교환
│   ├── webview/
│   │   ├── app_webview_screen.dart   # 범용 WebView 래퍼
│   │   └── flutter_bridge_message.dart # Flutter ↔ WebView 메시지 프로토콜
│   ├── theme/
│   │   └── app_theme.dart           # Material3 다크 테마, 색상 팔레트
│   ├── widgets/                     # 공용 위젯 (배경 로고, 에러 배너, 상태 뱃지 등)
│   └── data/
│       ├── team_groups.dart         # 정적 팀 목록, 8개 조(A-H)
│       └── default_rules.dart       # 리그 회칙 데이터
└── features/
    ├── home/                        # 홈 대시보드 및 위젯
    ├── teams/                       # 팀 허브, 팀 상세, 공지
    ├── schedule/                    # 일정 탭 뷰, 경기 목록
    ├── records/                     # 타자/투수 시즌 기록 테이블
    ├── standings/                   # Elo 순위, 파워랭킹
    ├── community/                   # 전체 공지, 댓글
    ├── auth/                        # 로그인 WebView, Google/Apple 로그인 버튼
    ├── account/                     # 사용자 프로필, 역할 표시
    ├── intro/                       # 리그 소개, 회칙
    ├── onboarding/                  # 첫 실행 환영 화면
    ├── prediction/                  # 승부예측 (예정)
    └── scorekeeper/                 # 기록원 WebView (관리자 전용)
```

---

## Firestore 컬렉션

| 컬렉션 경로 | 용도 |
|-------------|------|
| `users/{uid}` | 사용자 프로필 (이메일, 닉네임, 생성일) |
| `roles/{uid}` | 역할 매핑 (admin, coach, teamId) |
| `teams/{teamId}` | 팀 정보 (이름, 대학, 조, 색상, 연혁, 엠블럼) |
| `teams/{teamId}/members/{uid}` | 팀 로스터 (역할, 등번호, 포지션) |
| `teams/{teamId}/notices/{noticeId}` | 팀 공지 |
| `teams/{teamId}/notices/.../comments/{commentId}` | 팀 공지 댓글 |
| `matches/{matchId}` | 경기 정보 (팀, 점수, 시간, 상태, 구장) |
| `matchStates/{matchId}` | 실시간 경기 상태 (이닝, BSO, 주자) |
| `notices/{noticeId}` | 전체 공지 |
| `notices/{noticeId}/comments/{commentId}` | 전체 공지 댓글 |
| `settings/staticContent` | 리그 소개, 회칙 |
| `settings/liveInfo` | 실시간 중계 정보 |

---

## FCM 알림 토픽

| 토픽 | 설명 | 구독 방식 |
|------|------|-----------|
| `community_urgent` | 긴급 공지 | 항상 구독 |
| `community_notices` | 커뮤니티 공지 | 사용자 토글 |
| `team_{teamId}_notices` | 소속팀 공지 | 사용자 토글 |
| `team_{teamId}_matches` | 소속팀 경기 알림 | 사용자 설정 |
| `matches_all` | 전체 경기 알림 | 사용자 설정 |

알림 설정은 `SharedPreferences`에 저장되며, 앱 시작 시 및 설정 변경 시 토픽 구독이 동기화됩니다.

---

## 주요 의존성

| 패키지 | 버전 | 용도 |
|--------|------|------|
| `firebase_core` | 3.13.0 | Firebase 초기화 |
| `firebase_auth` | 5.5.0 | 인증 |
| `cloud_firestore` | 5.6.0 | 실시간 데이터베이스 |
| `firebase_messaging` | 15.1.0 | 푸시 알림 |
| `google_sign_in` | 6.2.2 | Google OAuth |
| `sign_in_with_apple` | 6.1.4 | iOS Apple 로그인 |
| `webview_flutter` | 4.8.0 | WebView 컨테이너 |
| `shared_preferences` | 2.3.0 | 로컬 설정 저장 |
| `cached_network_image` | 3.4.1 | 이미지 캐싱 |
| `flutter_local_notifications` | 17.1.2 | 로컬 알림 표시 |
| `crypto` | 3.0.6 | Apple 로그인 nonce 해시 |
| `intl` | 0.20.2 | 한국어 날짜/시간 포맷 |
| `timeago` | 3.7.1 | 상대 시간 표시 |
| `url_launcher` | 6.3.2 | 외부 URL 열기 |

---

## 환경 설정

### dart-define 키

| 키 | 설명 | 예시 |
|----|------|------|
| `AUBL_ENV` | 실행 환경 | `dev`, `stage`, `prod` |
| `AUBL_WEB_BASE_URL` | 웹 서비스 베이스 URL | `https://aubl.club` |
| `AUBL_AUTH_BRIDGE_URL` | 토큰 교환 Cloud Function URL | `https://...cloudfunctions.net/exchange_web_id_token` |
| `AUBL_ACCOUNT_DELETION_URL` | 외부 계정 삭제 안내 URL | `https://aubl.club/account-deletion` |

### 실행 방법

```bash
# 의존성 설치
cd flutter_app
flutter pub get

# 환경 파일 방식 (권장)
flutter run --dart-define-from-file=env/dev.json
flutter run --dart-define-from-file=env/stage.json
flutter run --dart-define-from-file=env/prod.json

# 개별 dart-define 방식
flutter run \
  --dart-define=AUBL_ENV=dev \
  --dart-define=AUBL_WEB_BASE_URL=https://aubl.club \
  --dart-define=AUBL_AUTH_BRIDGE_URL=https://...cloudfunctions.net/exchange_web_id_token \
  --dart-define=AUBL_ACCOUNT_DELETION_URL=https://aubl.club/account-deletion
```

### 품질 체크

```bash
cd flutter_app
dart analyze
flutter test
dart run tool/layer_dependency_checker.dart
```

### Firebase 모바일 설정

다음 파일을 프로젝트에 배치해야 합니다.

- **Android:** `android/app/google-services.json`
- **iOS:** `ios/Runner/GoogleService-Info.plist`

### 네이티브 Google 로그인 체크포인트

- **Android:** Firebase Console에 앱 `com.aubl.app` 등록 + 디버그/릴리즈 SHA-1 등록
- **iOS:** `GoogleService-Info.plist` 포함 + `Info.plist` URL Scheme(`REVERSED_CLIENT_ID`) 등록

### Apple 로그인 체크포인트 (iOS)

- Apple Developer > Identifiers에서 `Sign In with Apple` capability 활성화
- Runner target에 `Runner.entitlements` 포함 여부 확인
- Firebase Auth 콘솔에서 Apple provider 활성화
- Apple 로그인 실패 시 App Store Review Notes에 테스트 계정/재현 방법 명시

### 릴리즈 서명 체크포인트

- Android release 빌드는 `android/key.properties`가 없으면 실패하도록 구성
- `android/key.properties.example`을 복사해 실제 값 주입 후 `flutter build appbundle --release --dart-define-from-file=env/prod.json`
- iOS는 Xcode에서 Runner Signing(Team/Bundle ID) 설정 후 Archive → TestFlight 업로드

---

## 개발 이력

| 커밋 | 내용 |
|------|------|
| `3bfc6c2` | 플러터 초기 골격 구축 |
| `90c6815` | 네이티브 전환 Phase 1 |
| `4706960` | 추가 기능 구현 |
| `ac2dcf1` | WebView 로그인 상태 동기화 및 비로그인 뱃지 |
| `2f6ed65` | 기록원 페이지 최적화 |
| `d3f5f0a` | 선수 등록 뱃지 및 기능 수정 |
| `fa29e7b` | 소속팀 관련 기능 수정 |
| `4184850` | 앱 알림 기능 추가 |
| `7aacba6` | 알림 설정 상세화 및 홈 공지 스크롤 |
| `4ee61ea` | 앱 출시를 위한 코드 보완 |

---

## 향후 계획

- **승부예측 (Prediction Lab)** — AI/ML 기반 경기 예측 기능
- **iOS 알림 고도화** — iOS 환경 푸시 알림 지원 확대
- **오프라인 모드** — 네트워크 미연결 시 캐시 기반 열람
- **기록 데이터 연동** — Firestore 기반 실시간 선수 기록 표시 (목업 데이터 대체)

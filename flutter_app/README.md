# AUBL Flutter App (`flutter_app`)

Flutter 기반 하이브리드 앱(네이티브 + WebView) 1차 구현입니다.

## 현재 범위
- WebView 로그인: `/login?embedded=flutter`
- 로그인 성공 토큰 브리지 수신 후 네이티브 Firebase 로그인 동기화
- 관리자 권한 확인 후 "기록실 입장" 버튼 노출
- 기록실 WebView: `/scorekeeper` (세션 미동기화 시 `/login?embedded=flutter&next=/scorekeeper` 폴백)

## 사전 준비
1. Flutter SDK 설치
2. Firebase 프로젝트에 Android/iOS 앱 추가
3. 다음 파일 배치
   - `flutter_app/android/app/google-services.json`
   - `flutter_app/ios/Runner/GoogleService-Info.plist`

## 의존성 설치
프로젝트 골격(Android/iOS 포함)은 생성되어 있습니다.

```bash
cd flutter_app
flutter pub get
```

플랫폼 파일이 누락된 환경이라면 아래 명령으로 복원할 수 있습니다.

```bash
flutter create . --platforms=android,ios
```

## 실행 예시
```bash
cd flutter_app
flutter run \
  --dart-define=AUBL_ENV=dev \
  --dart-define=AUBL_WEB_BASE_URL=https://aubl-backup.web.app \
  --dart-define=AUBL_AUTH_BRIDGE_URL=https://asia-northeast3-aubl-backup.cloudfunctions.net/exchange_web_id_token
```

환경 파일 방식(권장):

```bash
cd flutter_app
flutter run --dart-define-from-file=env/dev.json
flutter run --dart-define-from-file=env/stage.json
flutter run --dart-define-from-file=env/prod.json
```

## `dart-define` 키
- `AUBL_ENV`: 실행 환경명 (`dev`, `stage`, `prod` 등)
- `AUBL_WEB_BASE_URL`: WebView가 열 웹 서비스 베이스 URL
- `AUBL_AUTH_BRIDGE_URL`: 웹 ID 토큰을 커스텀 토큰으로 교환하는 Cloud Function URL

## 브리지 메시지 계약
웹 → Flutter (`FlutterBridge.postMessage(JSON.stringify(payload))`)

- `LOGIN_SUCCESS`: `{ "type": "LOGIN_SUCCESS", "idToken": "...", "uid": "...", "email": "..." }`
- `TOKEN_REFRESH`: `{ "type": "TOKEN_REFRESH", "idToken": "..." }`
- `LOGOUT`: `{ "type": "LOGOUT" }`

## 오류 처리
- 토큰 교환 실패 시 WebView 하단 오류 배너 표시
- 권한 미확인 시 기록실 버튼 비노출
- 기록실 접근 중 로그인 페이지로 이동되면 자동 폴백 URL로 재진입

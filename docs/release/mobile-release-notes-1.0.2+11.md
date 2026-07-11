# AUBL 모바일 릴리즈 노트 (1.0.2+11)

문서 일자: 2026-03-01  
대상 앱: `flutter_app`  
패키지 ID: `com.aubl.app`

## 빌드 정보

- 버전명(`versionName`): `1.0.2`
- 버전코드(`versionCode`): `11`
- Android 산출물(AAB): `flutter_app/build/app/outputs/bundle/release/app-release.aab`
- AAB 파일 크기: `52.3MB`
- AAB SHA-256:
  `caab2e80853b97388e1c845f96675478c22633f94fdc2bd2ebbab2a410aacdc6`
- iOS 산출물(서명 미적용): `flutter_app/build/ios/iphoneos/Runner.app`
- iOS 파일 크기: `64.1MB`
- 빌드 명령:
  - `flutter build appbundle --release`
  - `flutter build ios --release --no-codesign`

## 주요 변경 사항

1. 기록원 권한 반영 (앱)
- 더보기 화면에서 `관리자/기록원` 권한을 구분하여 운영 메뉴 노출
- 기록원 계정은 `기록원`, `경기 기록 수정(/admin/games)` 메뉴에 접근 가능
- 관리자 전용 메뉴(관리자 패널/일정 관리/스코어보드)는 기존처럼 관리자만 노출

2. 계정 화면 역할 표시 개선
- `roles/{uid}.role == scorer`인 계정에 `기록원 (기록/중계)` 역할 배지 표시
- 역할 색상/스타일을 기록원 계정에 맞게 분리

3. 웹 라우트 계약 추가
- 앱 내 WebView 경로 상수에 `'/admin/games'` 추가
- 경기 기록 수정 진입을 명시적 경로로 통일

4. 사용자 설명서 동기화
- 앱 매뉴얼 문구를 관리자/기록원 권한 체계에 맞게 업데이트
- 기록 수정 진입 동선 설명을 `더보기 > 경기 기록 수정` 기준으로 정리

## iOS/Android 버전 동기화 메모

- Flutter 버전 소스(`pubspec.yaml`)를 `1.0.2+11`로 상향
- Android `versionCode/versionName`, iOS `CFBundleVersion/CFBundleShortVersionString`는 Flutter 빌드 값으로 동기화

## 배포 메모

- 권장 트랙: `Internal test -> Closed test -> Production staged rollout`
- 배포 전 테스트 기준: `docs/release/mobile-test-guide-1.0.2+11.md`

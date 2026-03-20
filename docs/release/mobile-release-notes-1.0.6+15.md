# AUBL 모바일 릴리즈 노트 (1.0.6+15)

문서 일자: 2026-03-21  
대상 앱: `flutter_app`  
패키지 ID: `com.aubl.app`

## 빌드 정보

- 버전명(`versionName`): `1.0.6`
- 버전코드(`versionCode`): `15`
- Android 산출물(AAB): `flutter_app/build/app/outputs/bundle/release/app-release.aab`
- AAB 파일 크기: `52,601,165 bytes` (약 `52.6MB`)
- AAB SHA-256:
  `ccec130fb20c24a58d1af734f78c50ce9612ba38af456218b99ade1e6ab60ddc`
- 빌드 명령:
  - `flutter build appbundle --release --dart-define-from-file=env/prod.json`

## 주요 변경 사항

1. 경기 일정 시간대 표시 보정
- 웹에서 등록된 경기 시간(UTC 저장값)을 Flutter 앱에서 로컬 시간으로 변환해 표시하도록 수정
- 기존 오차 사례(`09:00 -> 00:00`, `12:00 -> 03:00`)가 발생하지 않도록 보정

2. 일정 날짜 분류 로직 보정
- 홈 화면 `오늘/내일` 분류 기준을 `startTime` 문자열 substring 비교에서 로컬 날짜 키 기반으로 변경
- 일정 탭 날짜 그룹핑 및 팀 상세 예정 경기 날짜 표시도 동일 기준으로 통일

3. iOS 버전 표기 동기화 강화
- `Info.plist` 버전 키를 `MARKETING_VERSION`/`CURRENT_PROJECT_VERSION`로 전환
- `Runner.xcodeproj`의 Runner(Debug/Release/Profile) 버전을 `1.0.6 (15)`로 명시
- Flutter 빌드/수동 Xcode 아카이브 경로 모두에서 버전 표기 불일치 가능성 축소

## iOS/Android 버전 동기화 메모

- Flutter 단일 소스(`flutter_app/pubspec.yaml`)를 `1.0.6+15`로 상향
- Android: `versionName/versionCode`가 Flutter 값으로 반영
- iOS: Xcode 빌드 설정(`MARKETING_VERSION`, `CURRENT_PROJECT_VERSION`)을 `1.0.6`, `15`로 명시 반영

## 배포 메모

- 권장 트랙: `Internal test -> Closed test -> Production staged rollout`
- 배포 전 테스트 기준: `docs/release/mobile-test-guide-1.0.6+15.md`

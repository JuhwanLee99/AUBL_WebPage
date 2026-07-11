# AUBL 모바일 릴리즈 노트 (1.0.5+14)

문서 일자: 2026-03-16  
대상 앱: `flutter_app`  
패키지 ID: `com.aubl.app`

## 빌드 정보

- 버전명(`versionName`): `1.0.5`
- 버전코드(`versionCode`): `14`
- Android 산출물(AAB): `flutter_app/build/app/outputs/bundle/release/app-release.aab`
- AAB 파일 크기: `52,601,259 bytes` (약 `52.6MB`)
- AAB SHA-256:
  `04b13034171f07f71f53da8289100a98fc20f42410841404ea23ea6508da29a5`
- 빌드 명령:
  - `flutter build appbundle --release --dart-define-from-file=env/prod.json`

## 주요 변경 사항

1. 회칙 페이지 키워드 검색 기능 추가
- 회칙 화면 상단에 검색창 추가
- 키워드 입력 시 회칙 장/조문/본문/주최 순서/부칙 항목 필터링
- 공백으로 분리된 다중 키워드(AND) 검색 지원
- 검색어 일치 텍스트 하이라이트 표시

2. 검색 결과 순회 기능 추가
- 검색창 우측에 상/하 버튼 배치
- 검색 결과가 여러 개인 경우 이전/다음 결과로 순차 이동
- 이동 시 해당 결과 위치로 자동 스크롤
- 현재 순회 위치(`현재/전체`) 표시

## iOS/Android 버전 동기화 메모

- Flutter 단일 소스(`pubspec.yaml`)를 `1.0.5+14`로 상향
- Android: `versionName/versionCode`가 Flutter 값으로 자동 반영
- iOS: `CFBundleShortVersionString/CFBundleVersion`가 Flutter 값으로 자동 반영

## 배포 메모

- 권장 트랙: `Internal test -> Closed test -> Production staged rollout`
- 배포 전 테스트 기준: `docs/release/mobile-test-guide-1.0.5+14.md`

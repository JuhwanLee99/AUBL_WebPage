# AUBL 모바일 릴리즈 노트 (1.0.3+12)

문서 일자: 2026-03-02  
대상 앱: `flutter_app`  
패키지 ID: `com.aubl.app`

## 빌드 정보

- 버전명(`versionName`): `1.0.3`
- 버전코드(`versionCode`): `12`
- Android 산출물(AAB): `flutter_app/build/app/outputs/bundle/release/app-release.aab`
- AAB 파일 크기: `52,412,782 bytes` (약 `52.4MB`)
- AAB SHA-256:
  `505e5b88a11c8a0ce6252c6b3f63672873e06cf783a0861e50176526cbd7af1a`
- iOS 산출물(서명 미적용): `flutter_app/build/ios/iphoneos/Runner.app`
- iOS 파일 크기: `63,324 KB` (약 `61.8MB`)
- iOS 번들 버전 확인:
  - `CFBundleShortVersionString`: `1.0.3`
  - `CFBundleVersion`: `12`
- 빌드 명령:
  - `flutter build appbundle --release`
  - `flutter build ios --release --no-codesign`

## 주요 변경 사항

1. 커뮤니티 선수 등록 게시판 권한 체계 확장
- 선수 등록 게시판 열람 권한을 `선수 이상` + `기록원`까지 확장
- 분류별 작성 권한 유지:
  - `선수 등록`: 관리자
  - `유니폼 등록`: 감독/관리자
- Firestore Rules에서 해당 권한 사용자만 쿼리/읽기 가능하도록 반영

2. 커뮤니티 화면 배치 개선 (웹)
- 커뮤니티 카드 레이아웃을 2x2 고정 구조로 정리
  - 좌상: 공지사항
  - 우상: 건의/문의
  - 좌하: 선수 등록
  - 우하: 갤러리
- 브라우저가 넓어져도 한 줄 3개 이상 배치되지 않도록 고정

3. 랜딩/홈 하단 배너 확장
- 인스타그램 배너 상단에 `유니크 플레이` 이동 배너 추가
- 파트너 링크 명칭을 `unique-play`로 정리

4. 리치 텍스트 표 기능 고도화 (웹/앱)
- 웹/앱 모두 실제 표 렌더링 지원
- 셀 단위 편집 가능한 테이블 에디터 방식으로 확장
- 웹에서 붙여넣은 Quill table 포맷을 앱에서도 표로 보이도록 변환 로직 추가
- 앱 표 렌더링 시 행 데이터가 잘리지 않도록 최대 행/열 상한 확장

5. 작성 UX 개선
- 선수 등록 게시판 작성 시 기본 분류를 `선수 등록`으로 조정
  - 단, 권한상 불가능한 계정은 허용 가능한 분류로 자동 보정

6. 사용자 설명서 업데이트 (웹/앱)
- 기록원 권한 및 선수 등록 게시판 권한/분류 정책 반영
- 표 작성/표시 관련 최신 동작 반영

## iOS/Android 버전 동기화 메모

- Flutter 단일 소스(`pubspec.yaml`)를 `1.0.3+12`로 상향
- iOS 빌드 산출물에서 `CFBundleShortVersionString=1.0.3`, `CFBundleVersion=12` 확인
- `ios/Flutter/flutter_export_environment.sh`에서
  - `FLUTTER_BUILD_NAME=1.0.3`
  - `FLUTTER_BUILD_NUMBER=12`
  확인

## 배포 메모

- 권장 트랙: `Internal test -> Closed test -> Production staged rollout`
- 배포 전 테스트 기준: `docs/release/mobile-test-guide-1.0.3+12.md`

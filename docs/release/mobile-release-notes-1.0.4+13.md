# AUBL 모바일 릴리즈 노트 (1.0.4+13)

문서 일자: 2026-03-04  
대상 앱: `flutter_app`  
패키지 ID: `com.aubl.app`

## 빌드 정보

- 버전명(`versionName`): `1.0.4`
- 버전코드(`versionCode`): `13`
- Android 산출물(AAB): `flutter_app/build/app/outputs/bundle/release/app-release.aab`
- AAB 파일 크기: `52,535,068 bytes` (약 `52.5MB`)
- AAB SHA-256:
  `cd4971eb613aafee0df4f367bb2b1abf7b390526503cf3677761bad7b75454e9`
- iOS 산출물(서명 미적용): `flutter_app/build/ios/iphoneos/Runner.app`
- iOS 파일 크기: `63,440 KB` (약 `61.9MB`)
- iOS 번들 버전 확인:
  - `CFBundleShortVersionString`: `1.0.4`
  - `CFBundleVersion`: `13`
- 빌드 명령:
  - `flutter build appbundle --release --dart-define-from-file=env/prod.json`
  - `flutter build ios --release --no-codesign --dart-define-from-file=env/prod.json`

## 주요 변경 사항

1. UGC 안전 기능(Apple Guideline 1.2 대응)
- 커뮤니티 사용자 생성 콘텐츠에서 신고 기능 추가
  - 대상: 건의/문의 게시글/댓글, 선수 등록 게시글, 팀 공지 댓글, 공지 댓글
  - 공지 본문은 신고 메뉴 노출(작성자 차단은 작성자 UID가 있을 때만 노출)
- 사용자 차단 기능 추가
  - 차단 시 차단 대상 사용자의 게시글/댓글이 내 피드에서 즉시 숨김 처리
  - 차단 동작과 동시에 운영팀 신고 큐(`contentReports`) 생성
- 계정 화면에 차단 관리 UI 추가
  - 차단 사용자 목록 확인 및 차단 해제 지원

2. 신고/차단 UX 개선
- 신고/차단 액션 버튼을 경광등 아이콘으로 통일
- 주어진 아이콘 사양(SVG path) 기반 커스텀 아이콘 적용

3. 선수 등록 게시판 권한 인식 개선
- 로그인/로그아웃 직후 권한 즉시 재평가
- 커뮤니티 화면에서 선수 등록 배너 진입 시 최신 권한 재조회
- 앱 재개/새로고침 시 권한 반영 신뢰성 강화

4. 커뮤니티 외부 링크 업데이트
- 갤러리 이동 링크를 모바일 경로로 변경:
  - `https://m.dcinside.com/board/aubl`

5. Firestore Rules 확장 (UGC 모더레이션)
- `contentReports` 컬렉션 규칙 추가 (신고 접수/운영자 처리)
- `userModeration/{uid}/blockedUsers` 규칙 추가 (개인 차단 목록)

## iOS/Android 버전 동기화 메모

- Flutter 단일 소스(`pubspec.yaml`)를 `1.0.4+13`으로 상향
- Android: `versionName/versionCode`가 Flutter 값으로 자동 반영
- iOS: `CFBundleShortVersionString/CFBundleVersion`가 Flutter 값으로 자동 반영

## 배포 메모

- 권장 트랙: `Internal test -> Closed test -> Production staged rollout`
- 배포 전 테스트 기준: `docs/release/mobile-test-guide-1.0.4+13.md`

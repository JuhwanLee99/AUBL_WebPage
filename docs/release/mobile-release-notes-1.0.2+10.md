# AUBL 모바일 릴리즈 노트 (1.0.2+10)

문서 일자: 2026-03-01  
대상 앱: `flutter_app`  
패키지 ID: `com.aubl.app`

## 빌드 정보

- 버전명(`versionName`): `1.0.2`
- 버전코드(`versionCode`): `10`
- 산출물: `flutter_app/build/app/outputs/bundle/release/app-release.aab`
- 파일 크기: `52.3MB`
- SHA-256:
  `0d0dc0b85711bc210f858079c1b9022fa66f9661048c001a0bdd22e82a22739e`
- 빌드 명령:
  `flutter build appbundle --release --dart-define-from-file=env/prod.json`

## 주요 변경 사항

1. 커뮤니티 공지 UX 개선
- 댓글 영역은 비로그인 상태에서도 입력 영역 형태를 유지
- 비로그인 시 입력 영역에 `로그인이 필요합니다.` 안내 표시

2. 로그인/로그아웃 반영 속도 개선
- 로그아웃 시 UI 상태 반영 지연 완화
- 더보기 화면에서 인증 상태 반영 속도 개선

3. 소셜 로그인 동의 플로우 정리
- Apple 계정 로그인에도 Google과 동일한 동의 팝업 흐름 적용

4. 공지 카테고리 확장
- 웹/앱 커뮤니티 공지 필터에 `심판/기록원 모집` 카테고리 추가

5. 네이티브/의존성 정합성 반영
- iOS Google Sign-In 식별자/URL Scheme 정리
- Android/iOS 빌드 의존성 잠금 파일 갱신
- 릴리즈 빌드 설정 동기화

6. Android 15 edge-to-edge 대응
- `MainActivity`를 `FlutterFragmentActivity` 기반으로 전환하고 `enableEdgeToEdge()` 적용
- Flutter 시스템 UI 모드를 `SystemUiMode.edgeToEdge`로 통일
- Android 테마/Flutter 오버레이에서 상태바/내비게이션바 색상 직접 지정 제거

## 배포 메모

- 권장 트랙: `Internal test -> Closed test -> Production staged rollout`
- 배포 전 테스트 기준: `docs/release/mobile-test-guide-1.0.2+10.md`

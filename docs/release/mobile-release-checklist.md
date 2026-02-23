# AUBL 모바일 릴리즈 체크리스트

문서 버전: 2026-02-19
대상: `flutter_app` (Android / iOS)

## 1) 사전 게이트

- [ ] `dart analyze` 통과
- [ ] `flutter test` 통과
- [ ] `dart run tool/layer_dependency_checker.dart` 통과
- [ ] `flutter_app/pubspec.yaml` 버전(`version`) 상향 반영

## 2) 정책 게이트

- [ ] 앱 내 계정 삭제 동작 검증 (`더보기 → 계정 → 회원 탈퇴`)
- [ ] 외부 삭제 안내 URL 검증 (`https://aubl.club/account-deletion`)
- [ ] 개인정보처리방침/이용약관 문구와 실제 동작 일치 확인
- [ ] App Store App Privacy와 Play Data safety 입력값 최신화
- [ ] App Store App Privacy에서 `User Content`/`Identifiers` 항목 포함 여부 최종 검증

## 3) Android 빌드/배포

- [ ] `flutter_app/android/key.properties` 준비
- [ ] Play App Signing 상태 확인
- [ ] AAB 빌드

```bash
cd flutter_app
flutter build appbundle --release --dart-define-from-file=env/prod.json
```

- [ ] Internal test 업로드
- [ ] Closed test 업로드
- [ ] Production staged rollout (10% → 50% → 100%)

## 4) iOS 빌드/배포

- [ ] Runner Signing (Team, Bundle ID, Provisioning) 확인
- [ ] Sign in with Apple capability 확인 (`Runner.entitlements`)
- [ ] Archive 생성
- [ ] TestFlight 내부 테스터 배포
- [ ] 필요 시 외부 테스터 배포 후 Production 릴리즈

## 5) 회귀 테스트

- [ ] 이메일 로그인
- [ ] Google 로그인
- [ ] Apple 로그인(WebView: iOS/Android)
- [ ] 로그아웃
- [ ] 회원 탈퇴
- [ ] WebView 관리자 페이지 진입/권한 제어
- [ ] 알림 권한 거부 상태에서 핵심 기능 동작

## 6) 롤아웃 이후 모니터링

- [ ] Crash/ANR 지표 확인
- [ ] 로그인 실패율/삭제 실패율 확인
- [ ] 긴급 롤백 기준 사전 합의(치명 버그, 인증 불가 등)

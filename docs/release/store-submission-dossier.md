# AUBL 스토어 제출 서류 패키지

문서 버전: 2026-02-25  
대상 릴리즈: `flutter_app` `1.0.1+2`  
패키지/번들 ID: `com.aubl.app` (Android/iOS 공통)

## 1) 공통 제출 정보 (확정본)

### 서비스/연락처
- 앱 이름: `AUBL`
- 기본 언어: `ko-KR`
- 고객지원 이메일: `aublcau@gmail.com`
- 웹사이트: `https://aubl.club`

### 정책 문서 URL
- 개인정보처리방침: `https://aubl.club/privacy`
- 이용약관: `https://aubl.club/terms`
- 계정 삭제 안내: `https://aubl.club/account-deletion`

### 계정 삭제 정책 증빙
- 인앱 경로: `더보기 -> 계정 -> 회원 탈퇴`
- 외부 삭제 URL 제공: `https://aubl.club/account-deletion`
- 문구 반영 위치:
  - `flutter_app/lib/features/legal/privacy_screen.dart`
  - `flutter_app/lib/features/legal/terms_screen.dart`
  - `src/features/front/pages/PrivacyPage.tsx`
  - `src/features/front/pages/TermsPage.tsx`

## 2) Google Play Console 제출 시트

## 2.1 앱 정보
- 앱 이름: `AUBL`
- 짧은 설명: `AUBL 공식 앱: 일정·기록·순위·커뮤니티`
- 전체 설명: `docs/release/mobile-store-metadata.md` 문안 사용
- 카테고리: `스포츠`
- 고객지원 이메일/웹사이트/개인정보처리방침 URL: 공통 제출 정보 사용

## 2.2 앱 콘텐츠/정책
- 데이터 보안(Data safety): `docs/release/mobile-data-disclosure-mapping.md` 기준 입력
- 계정 삭제 정책:
  - 인앱 삭제 가능: 예
  - 외부 삭제 URL 등록: `https://aubl.club/account-deletion`
- 광고: 실제 운영값 기준 선택 (광고 SDK 미탑재면 `아니오`)
- 콘텐츠 등급: 설문 기반 입력
- 타깃 연령층/가족 정책: 실제 서비스 대상 기준 입력

## 2.3 릴리즈 제출
- 아티팩트: `app-release.aab`
- 릴리즈명 템플릿: `1.0.1 (2)`
- 릴리즈 노트 템플릿:
  - 계정 삭제 정책(인앱/웹) 정합성 강화
  - Apple 로그인/웹뷰 로그인 흐름 정리
  - 안정성 개선 및 스토어 출시 준비 반영
- 권장 롤아웃:
  - Internal test -> Closed test -> Production (10% -> 50% -> 100%)

## 2.4 Play 제출 전 체크
- `android/key.properties` 및 keystore 주입 확인
- Play App Signing 설정 확인
- 신규 개인 계정 테스트 요건(해당 시) 충족 확인

## 3) App Store Connect 제출 시트

## 3.1 App Information
- Name: `AUBL`
- Subtitle: `대학 아마추어야구 공식 앱` (초안)
- Category: `Sports`
- Support URL: `https://aubl.club`
- Privacy Policy URL: `https://aubl.club/privacy`

## 3.2 App Privacy (Nutrition Label)
- 입력 기준 문서: `docs/release/mobile-data-disclosure-mapping.md`
- 포함 검토 항목:
  - `Contact Info` (Email Address)
  - `Identifiers` (User ID, push token 성격 데이터)
  - `User Content` (문의/건의 게시글 및 댓글)
- Tracking: `No` (추적 SDK 미사용 전제)

## 3.3 Export Compliance (암호화)
- `Info.plist` 키 반영:
  - `ITSAppUsesNonExemptEncryption = NO`
  - 파일: `flutter_app/ios/Runner/Info.plist`
- 프랑스 배포: 미대상(별도 프랑스 문서 제외)

## 3.4 App Review Information (템플릿)
- Sign-in required: `Yes`
- 테스트 계정:
  - 이메일: `[입력 필요]`
  - 비밀번호: `[입력 필요]`
- 검증 경로:
  - 로그인(이메일/Google/Apple)
  - 계정 삭제(더보기 -> 계정 -> 회원 탈퇴)
  - 외부 삭제 페이지(`https://aubl.club/account-deletion`)
- 추가 노트:
  - iOS/Android 모두 웹뷰 내 Apple 로그인 버튼 사용
  - 첨부파일 업로드 기능 미제공, 문의/건의 첨부는 `aublcau@gmail.com` 안내

## 3.5 TestFlight / 배포
- Archive 생성 -> Validate -> Upload to TestFlight
- 내부 테스터 검증 후 외부/프로덕션 릴리즈
- Phased Release 사용 여부 결정

## 4) 제출 증빙(첨부/캡처) 목록

- 앱 내 `회원 탈퇴` 버튼/확인 다이얼로그 화면
- 웹 `https://aubl.club/account-deletion` 화면
- 앱 내 개인정보처리방침/이용약관 화면
- 로그인 화면(이메일/Google/Apple 진입)
- 주요 기능 화면(일정/기록/커뮤니티)
- 스토어 규격 스크린샷/아이콘/피처그래픽

## 5) 외부 시스템 수동 작업 (최종 확인용)

- Apple Developer / Firebase Console
  - Apple 로그인 Provider 및 식별자 설정 확인
- 배포 서명
  - Android: `key.properties` + keystore 비밀값 주입
  - iOS: 배포 인증서/프로비저닝 프로파일 확인
- 스토어 폼 입력
  - App Store Connect App Privacy
  - Google Play Data safety
- 베타/롤아웃
  - TestFlight 내부/외부 테스트
  - Play Internal/Closed/Production staged rollout

## 6) 제출 로그 기록 템플릿

- 제출 일시:
- 제출자:
- 대상 스토어: `Play / App Store`
- 제출 빌드: `1.0.1+2`
- 상태: `검토 중 / 반려 / 승인`
- 반려 사유(있다면):
- 후속 조치:


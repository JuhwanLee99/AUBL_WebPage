# 스토어 개인정보/데이터 안전성 매핑

문서 버전: 2026-02-19
참조 코드:
- Flutter 개인정보 문서: `flutter_app/lib/features/legal/privacy_screen.dart`
- iOS Privacy Manifest: `flutter_app/ios/Runner/PrivacyInfo.xcprivacy`

## 수집 데이터(현재 코드 기준)

1. 계정 식별 정보
- 항목: 이메일, 이름(소셜 로그인 시), UID
- 용도: 계정 인증 및 서비스 기능 제공
- 수집 위치: Firebase Auth 로그인 플로우

2. 앱/기기 정보
- 항목: 앱 버전, OS 버전, 기기 식별성 정보(토큰 포함)
- 용도: 알림 제공, 서비스 안정성
- 수집 위치: Firebase Messaging, 앱 초기화

3. 커뮤니티 생성 데이터
- 항목: 게시글/댓글 본문, 작성 시각, 작성자 UID/표시명
- 용도: 커뮤니티 기능 제공
- 수집 위치: Firestore `notices`, `inquiries`, 댓글 컬렉션

## 데이터 삭제/보존

- 인앱 삭제: `더보기 → 계정 → 회원 탈퇴`
- 외부 안내 URL: `https://aubl.club/account-deletion`
- 기본 원칙: 인증 계정 및 기본 프로필 데이터 삭제
- 예외: 커뮤니티 게시물은 운영 정책에 따라 일부 유지 가능

## App Store App Privacy 입력 가이드

- Data linked to user:
  - Email Address
  - Name
  - User ID
  - User Content (건의/문의 게시글, 댓글)
  - Identifiers (푸시 토큰 등)
- Data use purpose:
  - App Functionality
- Tracking:
  - No
- 제출 전 재검증:
  - App Store Connect에서 `User Content`, `Identifiers` 항목이 실제 수집/처리와 일치하는지 최종 확인

## Google Play Data safety 입력 가이드

- 수집 데이터:
  - 개인 정보(이메일, 사용자 ID)
  - 앱 활동(사용자 생성 콘텐츠: 게시글/댓글)
  - 기기/기타 식별자(푸시 토큰 등)
- 목적:
  - 앱 기능 제공, 계정 관리, 알림 전송
- 데이터 삭제 요청:
  - 인앱 삭제 + 외부 URL 제공

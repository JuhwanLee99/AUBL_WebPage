# Commit Plan - 2026-03-21

## Scope
- Save the already-agreed records plan (P0-P2).
- Add commit plans for all other current workspace changes.
- Keep commits small enough to cherry-pick/revert safely.

## A. Saved Plan (Records P0-P2)

### A1) P0 record accuracy hotfix
- Commit message:
  - `feat(records): playoff filter and event classification accuracy hotfix`
- Files:
  - `src/shared/lib/recordFilters.ts`
  - `src/shared/state/demoStore.record.ts`
  - `src/features/scorekeeper/pages/ScorekeeperPage.tsx`
  - `src/features/scoreboard/pages/ScoreboardTextPage.tsx`

### A2) P1 manual score input mode end-to-end
- Commit message:
  - `feat(scorekeeper): add manual score input mode end-to-end`
- Files:
  - `firestore.rules`
  - `src/shared/state/demoStore.tsx`
  - `src/shared/state/demoStore.schedule.ts`
  - `src/shared/state/demoStore.effects.ts`
  - `src/shared/state/demoStore.gameActions.ts`
  - `src/shared/state/demoStore.normalize.ts`
  - `src/app/pages/MatchSchedulePage.tsx`
  - `src/app/pages/ScheduleManagePage.tsx`
  - `src/features/scorekeeper/components/ManualRecordEntryPanel.tsx`
  - `src/features/scorekeeper/pages/ScorekeeperPage.tsx`
  - `src/features/scoreboard/components/ScoreboardPanel.tsx`
  - `src/features/scoreboard/pages/ScoreboardTextPage.tsx`

### A3) P2 deferred backlog docs only
- Commit message:
  - `docs(records): add p2 materialized-view backlog`
- Files:
  - `docs/records-p2-backlog.md`

## B. Additional Plan (Other Current Changes)

### B1) Web moderation feature (admin + user block/report)
- Commit message:
  - `feat(web-moderation): add report/block flow and admin moderation page`
- Files:
  - `src/app/pages/admin/AdminModerationPage.tsx`
  - `src/app/routes/adminRoutes.tsx`
  - `src/app/pages/admin/AdminLayoutPage.tsx`
  - `src/shared/moderation/moderationService.ts`
  - `src/shared/moderation/useBlockedUsers.ts`
  - `src/app/pages/AccountPage.tsx`
  - `src/app/pages/NoticeDetailPage.tsx`
  - `src/app/pages/InquiryDetailPage.tsx`
  - `src/app/pages/PlayerRegistrationDetailPage.tsx`
  - `src/features/front/pages/TeamNoticeDetailPage.tsx`
  - `src/app/pages/NoticeWritePage.tsx`
  - `src/app/pages/CommunityNoticesPage.tsx`
  - `src/app/pages/InquiryBoardPage.tsx`
  - `src/app/pages/PlayerRegistrationBoardPage.tsx`

### B2) Flutter moderation feature parity
- Commit message:
  - `feat(app-moderation): add report/block UI and blocked-user management`
- Files:
  - `flutter_app/lib/core/services/moderation_service.dart`
  - `flutter_app/lib/core/widgets/moderation/moderation_dialogs.dart`
  - `flutter_app/lib/core/widgets/moderation/e911_emergency_icon.dart`
  - `flutter_app/lib/features/account/account_screen.dart`
  - `flutter_app/lib/features/community/community_screen.dart`
  - `flutter_app/lib/features/community/inquiry_board_screen.dart`
  - `flutter_app/lib/features/community/inquiry_detail_screen.dart`
  - `flutter_app/lib/features/community/notice_detail_screen.dart`
  - `flutter_app/lib/features/community/player_registration_board_screen.dart`
  - `flutter_app/lib/features/community/player_registration_detail_screen.dart`
  - `flutter_app/lib/features/teams/team_notice_detail_screen.dart`
  - `flutter_app/pubspec.yaml`

### B3) Backend API contract hardening + admin integration
- Commit message:
  - `feat(api-client): extend record/admin contracts and response parsing`
- Files:
  - `src/core/api/backendClient.ts`
  - `src/app/pages/admin/AdminGameEditPage.tsx`
  - `src/app/pages/admin/AdminGamesPage.tsx`
  - `src/app/pages/admin/AdminPowerRankingPage.tsx`
  - `src/app/pages/admin/AdminTeamsPage.tsx`
  - `src/app/pages/admin/AdminRulesPage.tsx`
  - `src/shared/types/index.ts`
  - `src/shared/state/contentProvider.tsx`
  - `src/app/pages/RecordPage.tsx`
  - `src/app/pages/PlayerDetailPage.tsx`

### B4) Flutter API client and records/rules screens sync
- Commit message:
  - `feat(app-backend-sync): align flutter client and records/rules UI with backend`
- Files:
  - `flutter_app/lib/core/services/backend_api_service.dart`
  - `flutter_app/lib/core/contracts/web_contracts.dart`
  - `flutter_app/test/core/services/backend_api_service_test.dart`
  - `flutter_app/lib/features/records/records_screen.dart`
  - `flutter_app/lib/features/records/records_screen_sections.dart`
  - `flutter_app/lib/features/records/player_detail_screen.dart`
  - `flutter_app/lib/features/intro/rules_screen.dart`
  - `flutter_app/lib/core/data/default_rules.dart`

### B5) Web legal/help text sync
- Commit message:
  - `docs(web): refresh legal/help/community copy`
- Files:
  - `src/features/front/pages/PrivacyPage.tsx`
  - `src/features/front/pages/TermsPage.tsx`
  - `src/features/front/pages/RulePage.tsx`
  - `docs/app-user-manual.md`

### B6) Flutter legal/help text sync
- Commit message:
  - `docs(app): refresh legal/help screens and user manual links`
- Files:
  - `flutter_app/lib/features/help/user_manual_screen.dart`
  - `flutter_app/lib/features/legal/privacy_screen.dart`
  - `flutter_app/lib/features/legal/terms_screen.dart`
  - `flutter_app/lib/app/more_screen.dart`

### B7) Web SEO/OG + hosting cache header + static OG build script
- Commit message:
  - `feat(web-seo): add og metadata and static og route generation`
- Files:
  - `index.html`
  - `public/index.html`
  - `scripts/generate-og-pages.mjs`
  - `package.json`
  - `firebase.json`

### B8) Release operations docs + prebuild scripts
- Commit message:
  - `docs(release): add mobile release dossiers, checklists, and rules source artifacts`
- Files:
  - `docs/release/mobile-store-metadata.md`
  - `docs/release/store-submission-dossier.md`
  - `docs/release/apple-resubmission-note-1.0.4+13.md`
  - `docs/release/backend-prebuild-checklist.md`
  - `docs/release/mobile-release-notes-1.0.3+12.md`
  - `docs/release/mobile-release-notes-1.0.4+13.md`
  - `docs/release/mobile-release-notes-1.0.5+14.md`
  - `docs/release/mobile-test-guide-1.0.3+12.md`
  - `docs/release/mobile-test-guide-1.0.4+13.md`
  - `docs/release/mobile-test-guide-1.0.5+14.md`
  - `docs/release/rules-admin-paste-2026-1.json`
  - `docs/release/rules-chapters-2026-1-draft.json`
  - `docs/release/rules-chapters-2026-1-structured-verbatim-v2.json`
  - `docs/release/rules-chapters-2026-1-structured-verbatim.json`
  - `docs/release/rules-chapters-2026-1-verbatim.json`
  - `docs/release/rules-host-order-2026-1-verbatim.txt`
  - `docs/release/rules-host-order-2026-1.txt`
  - `docs/release/rules-pdf-grouped-lines-2026-1.txt`
  - `docs/release/rules-pdf-raw-2026-1.txt`
  - `scripts/backend_api_smoke.sh`
  - `scripts/backend_prebuild_preflight.sh`
  - `scripts/prepare_backend_release.sh`

### B9) iOS localization and project settings
- Commit message:
  - `chore(ios): add ko localization resources and update project settings`
- Files:
  - `flutter_app/ios/Runner.xcodeproj/project.pbxproj`
  - `flutter_app/ios/Runner/Info.plist`
  - `flutter_app/ios/Runner/ko.lproj/LaunchScreen.strings`
  - `flutter_app/ios/Runner/ko.lproj/Main.strings`

### B10) Asset handling
- Commit message:
  - `chore(assets): add release reference image`
- Files:
  - `page_01.png`

## Recommended Commit Order
1. A1 -> A2 -> A3
2. B1 -> B2
3. B3 -> B4
4. B5 -> B6
5. B7
6. B8
7. B9
8. B10

## Notes
- `ScorekeeperPage.tsx` and `ScoreboardTextPage.tsx` are touched by both A1 and A2. Stage hunks carefully when splitting A1/A2.
- Deploy for records changes already executed (`hosting + firestore.rules`). Keep this commit sequence to preserve rollback clarity.

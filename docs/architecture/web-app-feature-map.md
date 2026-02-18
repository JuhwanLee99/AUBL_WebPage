# Web ↔ App Feature Mapping

This document maps web feature modules to Flutter feature modules for the next app refactor phase.

## 1) Feature Map

- `src/features/front` -> `flutter_app/lib/features/home`, `flutter_app/lib/features/intro`, `flutter_app/lib/features/legal`, `flutter_app/lib/features/help`, `flutter_app/lib/features/teams`
- `src/features/scoreboard` -> `flutter_app/lib/core/webview`, `flutter_app/lib/app/embedded_webview_panel.dart`, `flutter_app/lib/features/schedule`
- `src/features/scorekeeper` -> `flutter_app/lib/features/scorekeeper`, `flutter_app/lib/app/embedded_webview_panel.dart`
- `src/app/pages/*schedule*` -> `flutter_app/lib/features/schedule`
- `src/app/pages/RecordPage.tsx` + `src/features/records` -> `flutter_app/lib/features/records`
- `src/app/pages/admin/*` -> `flutter_app/lib/app/more_screen.dart` (admin menu entry)
- `src/app/pages/LoginPage.tsx` + `src/shared/auth/AuthProvider.tsx` -> `flutter_app/lib/features/auth`, `flutter_app/lib/core/services/auth_bridge_service.dart`

## 2) Shared Contract Index

Use these files as source-of-truth contracts before app-side refactor starts.

- `src/core/contracts/routes.ts`
- `src/core/contracts/flutterBridge.ts`
- `src/core/contracts/backend.ts`
- `src/core/contracts/index.ts`

## 3) Packageization Candidates (next phase)

- `contracts` package:
  - route constants
  - flutter bridge message schema
  - backend DTO interfaces
- `domain-types` package:
  - teams/matches/records shared domain models
- `api-normalizer` package:
  - backend response normalization and fallback parsers

## 4) App Adoption Status (2026-02-18)

Flutter app now references frozen web-mobile contracts via:

- `flutter_app/lib/core/contracts/web_contracts.dart`
- `flutter_app/lib/core/contracts/flutter_bridge_contract.dart`

Adopted screens/modules:

- `flutter_app/lib/core/webview/app_webview_screen.dart`
- `flutter_app/lib/app/embedded_webview_panel.dart`
- `flutter_app/lib/features/auth/login_webview_screen.dart`
- `flutter_app/lib/features/scorekeeper/scorekeeper_webview_screen.dart`
- `flutter_app/lib/app/more_screen.dart`
- `flutter_app/lib/features/home/home_screen.dart`
- `flutter_app/lib/features/schedule/schedule_screen.dart`
- `flutter_app/lib/features/teams/team_detail_screen.dart`

## 5) Constraints

- Do not change the route and bridge contracts described in `docs/architecture/web-mobile-contracts.md`.
- Backend API path/schema changes remain out-of-scope for this phase.
- App-side follow-up refactor backlog is tracked in `docs/architecture/app-refactor-backlog.md`.

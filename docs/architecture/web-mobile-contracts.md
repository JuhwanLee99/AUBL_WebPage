# Web-Mobile Contracts (AUBL)

This document freezes compatibility contracts between the web app and the Flutter app during refactoring.

## 1) Route Compatibility (must not break)

The following web routes are consumed by Flutter WebView flows and must remain stable:

- `/login`
- `/scorekeeper`
- `/scoreboard`
- `/scoreboard-text/:matchId`
- `/live-overlay/:matchId`
- `/admin`
- `/schedule/manage`

Required query params for embedded login flow:

- `embedded=flutter`
- `nativeGoogle=1`
- optional `next=/path`

## 2) Flutter Bridge Message Compatibility (must not break)

Web -> Flutter message types:

- `LOGIN_SUCCESS`
- `TOKEN_REFRESH`
- `LOGOUT`
- `REQUEST_NATIVE_GOOGLE`

Required global functions injected/used by Flutter bridge:

- `window.__flutterAuthInject(customToken: string)`
- `window.__flutterGetIdToken()`

## 3) Refactor Safety Checklist

Before merging any refactor PR touching `src`:

1. `npm run lint`
2. `npm run build`
3. Verify Flutter login deep link:
   - `/login?embedded=flutter&nativeGoogle=1&next=/scorekeeper`
4. Verify admin-protected routes:
   - `/scorekeeper`, `/admin`, `/schedule/manage`
5. Verify scoreboard deep links:
   - `/scoreboard-text/:matchId`, `/live-overlay/:matchId`

## 4) Invariants

- Public URLs above are stable.
- Bridge message names and payload keys are stable.
- Backend API path/schema changes are out of scope for this refactor phase.

## 5) Auth Sync Guardrails (WebView)

- Flutter `authStateChanges`에서 `user == null`이 오면 주입 캐시를 초기화해야 한다.
  - 같은 UID 재로그인 시 주입 누락 방지
- WebView 브리지의 동일 `idToken` 반복 메시지는 앱에서 중복 처리하지 않는다.
  - 불필요한 token-exchange/signIn 루프 방지
- WebView로의 custom token 주입은 공통 스크립트 유틸을 통해 수행한다.
  - 화면별 스크립트 불일치로 인한 인증 불안정 방지

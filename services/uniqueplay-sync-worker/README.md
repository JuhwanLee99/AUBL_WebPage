# AUBL UniquePlay manual sync worker

관리자가 동기화를 시작했을 때만 UniquePlay의 공개 경기·순위·시즌 기록을 수집하는 격리 워커다. 원본 HTML, 계정 정보, 연락처, UniquePlay 사용자 식별자는 결과나 로그에 저장하지 않는다.

## Runtime contract

- `POST /collect` with `Authorization: Bearer $SYNC_SERVICE_TOKEN`
- body: `{ "runId": "...", "leagueId": "57", "seasonYear": 2026 }`
- immediately returns `202`; progress and the sanitized candidate are delivered to the configured backend callback.
- only one execution per `runId` is accepted.

Required environment:

- `SYNC_SERVICE_TOKEN`
- `SYNC_BACKEND_CALLBACK_URL`
- `UNIQUEPLAY_SESSION_KEY_B64` (32 random bytes encoded as base64)
- either `UNIQUEPLAY_SESSION_B64` or `UNIQUEPLAY_SESSION_PATH`
- optional `UNIQUEPLAY_LEAGUE_ID=57`, `UNIQUEPLAY_SEASON_YEAR=2026`

Run `npm run session:bootstrap` from a controlled operator machine to create an encrypted Playwright storage-state payload. Never commit the resulting `.enc` file. When the session expires the worker reports `REAUTH_REQUIRED`; it never stores the personal account password.

To perform the one-time login in locally installed Chrome, set `UNIQUEPLAY_BROWSER_CHANNEL=chrome`. This opens an isolated Chrome window for the operator login; after the encrypted session is installed, collection is triggered only by an explicit administrator request to `POST /collect`. The worker contains no scheduler or periodic collection loop.

If Google blocks automated-browser login, use a dedicated normal Chrome profile without automation, finish the login, close it, and relaunch that same dedicated profile with a loopback-only remote-debugging port. Then run `npm run session:capture-cdp` to capture only UniquePlay-domain cookies and the allowlisted UniquePlay authentication entries from that dedicated profile. Google account cookies and unrelated browser storage are discarded before encryption. Do not attach the operator's everyday Chrome profile.

The adapter intentionally anchors on Korean navigation labels and table headers because UniquePlay currently renders React-Native-Web class names that are not stable identifiers. A header/schema change fails closed instead of silently publishing shifted columns.

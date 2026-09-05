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

## Completed-game details (adapter `2026.09.05.6`)

An administrator-requested run now collects the boxscore for every collected completed game in addition to the existing schedules, standings and season totals. There is no separate automatic task or timer. Schedule/result pages explicitly select the expected `2026년` season; the records tab separately checks `2026시즌`.

- Existing `sourceGameId` hashes are unchanged. The public `/game/{id}/boxscore` route supplies a separate numeric-string `providerGameId`; query parameters and URLs are not stored.
- `candidate.gameDetails` is optional for old snapshots. If present, every completed game must have exactly one detail, with no duplicate provider game IDs. A failure to navigate, select the correct team, parse a header or match scores fails closed.
- Version-1 details contain two named teams, inning runs, R/H/E/B totals, batter rows, pitcher rows and per-inning plate-appearance text. Rows are keyed by team, role, original row index, jersey and player name so substitutions and same-name rows remain separate.
- Missing numbers stay `null`; a played zero stays `0`; an unplayed `X` inning is `{ runs: null, notPlayed: true }`. Pitcher innings retain baseball notation (`1.2`) and a separate integer `outs` (`5`). The combined source `4사구` remains `walksAndHitByPitch` rather than an invented walks/hit-by-pitch split.
- Plate-appearance cells such as `사구,송구실책,사구` are preserved as text, not split into derived events or cumulative statistics. Source aggregate rows are excluded: the observed provider can publish incorrect aggregate R/RBI while the player rows and line score are correct.
- Names, baseball labels and numerical fields are immediately allowlisted. HTML, account data, credentials, browser storage and source page state are not retained. Free-text values resembling email, telephone, URL or markup are rejected.
- `NOT_PUBLISHED` uses `teams: []` and currently has one verified narrow case: the source result card explicitly says forfeit/default (`몰수`/`기권`/`부전승`) and both selected teams have the exact batter/pitcher headers with only a single aggregate row. Source status is internal evidence and is not added to the public game fields. Normally completed games with empty records, one-sided empty tables, missing rows, changed headers and generic error pages still block the run; they are never silently called unpublished. No zero-valued player rows are fabricated for forfeits.
- These detail rows do not add to or recalculate the independently collected season cumulative records. Backend review, checksum validation, publish/activate and manual-record preservation remain required.

Run `npm test` for local-only synthetic parser/DOM/validation fixtures. Tests do not contact UniquePlay, launch a browser, read an operator session, collect a season or publish data. The DOM fixture models the public column layout and team-selection state without storing a captured HTML page.

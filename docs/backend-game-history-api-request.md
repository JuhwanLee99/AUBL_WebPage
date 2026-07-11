# 백엔드 추가 요청서: 과거 경기 정보 API 명세

## 1) 배경
현재 프론트는 선수 단위 경기로그(`GET /api/players/{playerId}/game-logs`)는 조회 가능하지만,
리그/팀 기준의 **과거 경기 결과 목록**과 **경기 상세**를 구성할 수 있는 API가 없습니다.

필요 기능:
- 시즌/리그/조/플레이오프 필터로 경기 결과 리스트 조회
- 경기 상세(스코어, 상태, 메타, 라인업/기록 링크) 조회
- 팀별 경기 결과 조회

---

## 2) 신규 API 제안

### 2.1 GET /api/games
과거 경기 목록(리그/팀/필터 기반)

Query:
- `seasonId` (required, int)
- `scope` (optional): `ALL | LEAGUE | PLAYOFF` (default `ALL`)
- `group` (optional): `ALL | A | B | C | D | E | F | G | H` (default `ALL`)
- `partCode` (optional alias): `"1".."8"`
- `playoffDivision` (optional): `ALL | EUTTEUM | BEOGEUM` (default `ALL`)
- `teamId` (optional)
- `fromDate` (optional, `YYYY-MM-DD`)
- `toDate` (optional, `YYYY-MM-DD`)
- `status` (optional): `SCHEDULED | FINAL | CANCELED | POSTPONED`
- `page` (optional, default 0)
- `size` (optional, default 50, max 200)
- `sort` (optional): `gameDate | createdAt`
- `sortOrder` (optional): `asc | desc`

Response:
```json
{
  "items": [
    {
      "gameId": 1234,
      "seasonId": 11,
      "seasonYear": 2025,
      "gameDate": "2025-11-02",
      "status": "FINAL",
      "homeTeamId": 36,
      "homeTeamName": "중앙대학교 랑데뷰",
      "awayTeamId": 47,
      "awayTeamName": "가천 WIND",
      "homeScore": 4,
      "awayScore": 3,
      "partCode": "8",
      "group": "H",
      "scope": "LEAGUE",
      "seasonType": null,
      "playoffRound": null,
      "venue": "..."
    }
  ],
  "page": 0,
  "size": 50,
  "totalElements": 1721,
  "totalPages": 35,
  "hasNext": true
}
```

---

### 2.2 GET /api/games/{gameId}
단일 경기 상세

Path:
- `gameId` (required)

Response:
```json
{
  "gameId": 1234,
  "seasonId": 11,
  "seasonYear": 2025,
  "gameDate": "2025-11-02",
  "status": "FINAL",
  "homeTeam": { "teamId": 36, "teamName": "중앙대학교 랑데뷰", "score": 4 },
  "awayTeam": { "teamId": 47, "teamName": "가천 WIND", "score": 3 },
  "partCode": "8",
  "group": "H",
  "scope": "LEAGUE",
  "seasonType": null,
  "playoffRound": null,
  "venue": "...",
  "startedAt": "2025-11-02T13:00:00+09:00",
  "endedAt": "2025-11-02T15:10:00+09:00"
}
```

---

### 2.3 GET /api/teams/{teamId}/games (권장)
팀별 경기 목록 단축 API

Query:
- `seasonId` (required)
- 나머지 필터는 `/api/games`와 동일

Response:
- `/api/games`의 `items`와 동일 스키마

---

## 3) 메타데이터/정합성 규칙

1. 조 매핑은 추론 금지, DB `partCode` 원본 기반
2. `group`는 `partCode` 고정 매핑만 허용
   - 1:A, 2:B, 3:C, 4:D, 5:E, 6:F, 7:G, 8:H
3. 응답 row에 아래 필드 필수 포함
   - `partCode`, `group`, `scope`, `seasonType`
4. 조 정렬은 A->H(`partCode ASC`) 우선

---

## 4) 에러 규약

- 400: 파라미터/enum/sort 오류
- 404: `gameId`, `teamId`, `seasonId` 미존재
- 결과 없음: 200 + 빈 배열(`items: []`)

---

## 5) 수용 기준(AC)

1. `seasonId + scope + group + playoffDivision` 조합으로 경기 목록이 정확히 필터링된다.
2. 2025 시즌 중앙대학교 랑데뷰의 조 조회 시 `group=H`, `partCode=8`로 일치한다.
3. 경기 단건 상세에서 홈/원정/스코어/상태가 일관되게 내려온다.
4. `status=FINAL` 필터 시 종료 경기만 반환된다.
5. 페이지네이션(`page/size/totalElements`)이 정확히 동작한다.

---

## 6) 프론트 즉시 활용 계획

이 명세가 제공되면 아래 기능을 즉시 붙일 수 있습니다.
- 기록 허브 내 "과거 경기 결과" 탭
- 팀 상세 내 시즌 경기 결과 타임라인
- 플레이오프 라운드별 결과 브라우징

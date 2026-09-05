# UniquePlay 경기별 상세 기록 연동

2026-09-05 구현. 운영 수집·게시·NAS 배포와 구분하여 기록한다.

## 범위와 보존 원칙

- 관리자가 기존 `수집 시작`을 누르면 일정·결과·시즌 누적 기록에 더해 종료 경기의 박스스코어를 수집한다. 예약 실행이나 앱 백그라운드 수집은 추가하지 않는다.
- 양 팀의 이닝별 점수, R/H/E/B, 교체 선수를 포함한 타자 기록, 투수 기록, 원천에서 공개한 이닝별 타격 결과 문자열을 가져온다.
- 타격 결과 문자열은 유니크플레이 표의 이닝 단위 표현이다. 여러 타석과 주루 결과가 한 셀에 합쳐져 있을 수 있으므로 투구 단위 중계나 정확한 타석 타임라인으로 해석하지 않는다.
- 원본 HTML, 계정 정보, 이메일·전화번호, 인증 상태는 기록 후보에 넣지 않는다. 허용 목록의 공개 경기·팀·선수·기록 값만 보관한다.
- 새 상세는 승인된 `SyncRevision.candidateJson.gameDetails`에 보관한다. 기존 MariaDB `BatterGameLog`/`PitcherGameLog`, Firestore 수동 `postGame`, 라인업·실시간 기록은 수정하거나 삭제하지 않는다.
- 시즌 누적 공식 기록은 기존 시즌 스냅샷을 사용한다. 이번 경기별 기록으로 누적 기록을 다시 합산하지 않는다.

## 식별자와 후보 구조

기존 링크·팀 연결을 보존하기 위해 현재 `up-…` 형식의 `sourceGameId`는 유지한다. 박스스코어 URL에서 확인한 유니크플레이 실제 경기 번호는 별도 `providerGameId`로 저장한다. 기존 일정 기반 ID를 일괄 변경하지 않는다. 같은 일시·조·양팀의 모호한 카드가 둘 이상이면 추정하지 않고 수집을 중단한다.

```text
candidate.gameDetails[]
  schemaVersion: 1
  sourceGameId: 기존 AUBL 외부 경기 참조
  providerGameId: 공개 박스스코어의 실제 경기 번호
  status: AVAILABLE | NOT_PUBLISHED
  teams[]
    teamName
    innings[]: inning, runs, notPlayed
    totals: runs, hits, errors, walks
    batters[]
      rowKey, playerName, jerseyNumber, battingOrder, position
      stats: atBats, hits, rbi, stolenBases, runs,
             battingAverage, seasonBattingAverage
      plateAppearances[]: inning, result
    pitchers[]
      rowKey, playerName, jerseyNumber, decision
      stats: outs, inningsPitched, hitsAllowed, runsAllowed,
             earnedRuns, walksAndHitByPitch, strikeouts, era
```

`null`, 0, 미진행 이닝 `X`를 구분한다. 투수 `1.2`는 1.2이닝이라는 소수가 아닌 5아웃이다. ERA와 타율은 원천 값을 표시하며 9이닝 기준 재계산이나 미제공 볼넷·삼진의 추정은 하지 않는다. `4사구`는 볼넷과 사구의 합으로 표시한다.

타자 표의 합계 행은 선수로 저장하지 않는다. 실제 확인한 원천 표에서 합계 행과 개별 행의 합이 다른 사례가 있어, 개별 행과 라인스코어를 대조한다.

## 몰수·미제공·실패 구분

- 명시적 몰수/기권/부전승 카드이고 양 팀 모두 정확한 타자·투수 헤더와 합계 행만 있을 때, 카드의 팀·점수까지 대조한 뒤 `NOT_PUBLISHED`, `teams: []`로 기록한다.
- 일반 종료 경기의 빈 표, 한쪽 팀만 추출된 표, 헤더 변경, 모호한 카드, 세션 만료는 정상 빈 기록으로 취급하지 않는다. 수집 실패 또는 검증 차단으로 현재 공개 버전을 유지한다.
- 새 워커의 후보에는 모든 종료 경기에 `AVAILABLE` 또는 검증된 `NOT_PUBLISHED` 결과가 하나씩 있어야 한다.
- 예전 게시본처럼 `gameDetails` 자체가 없으면 공개 API는 `NOT_COLLECTED`를 반환한다. 오래된 리비전으로 복구하는 기능은 유지한다.
- 이미 상세가 게시된 시즌에 구 워커가 상세 필드 없이 새 후보를 보내면 `DETAIL_SCHEMA_DOWNGRADE`로 검증·게시를 차단한다. 기존 상세가 조용히 사라지지 않도록 새 워커로 다시 수집해야 한다.

## 관리자 검수

`GAME_RECORD` 항목에서 신규·변경·동일·누락·충돌을 확인한다. 타자·투수 시즌 누적 기록과 경기별 기록은 별도 항목이다.

- `원본 반영`: 이번에 수집한 공식 상세를 게시 후보로 사용한다.
- `이전 공식 상세 유지`: 기존에 게시된 해당 경기 상세를 유지한다. AUBL 수기 기록으로 바꾸는 기능이 아니다. 이전 상세가 없는 신규 항목에는 적용할 수 없다.
- 이전 상세를 유지해도 새 경기 점수와 맞지 않으면 검증이 차단된다.
- 경기 자체의 수동 점수·상태 오버라이드가 공식 상세와 다르면 `DETAIL_GAME_OVERRIDE`로 검수·게시를 차단한다. 활성화 이후 값이 달라진 경우에도 공개 상세를 `REVIEW_REQUIRED`로 숨긴다. 운영 메모·라이브 URL·구장·일시 변경만으로 상세 기록을 차단하지 않는다.
- 원본 미리보기 체크섬을 확인한 후 검수 결정을 반영한 별도 불변 스냅샷·체크섬을 생성한다. 활성화는 기존 리비전 절차를 따른다.

## 공개 API

### v25 상세 품질과 관리자 정정

2026-09-05 v25는 기존 `AVAILABLE` 같은 상세 상태와 별도로 `quality`, `issues`, `resolutionSource`, `resolvedAt`을 제공한다. 공개 API에는 관리자 메모·행위자·원본/정정 감사 이력을 포함하지 않는다.

- `CLEAN`: 현재 적용된 산술 검사에서 경고 없음. 실제 경기 전체에 대한 공식 정상 판정은 아니다.
- `CORRECTION_PENDING`: 공개 가능하나 수정 확인이 필요한 상세 경고. 경기/선수 화면에 `오류 수정 중` 표시.
- `RESOLVED`: 이전 문제 해결. `MANUAL` 또는 `SOURCE`로 수동 정정과 원천 수정의 출처 구분.
- 구 리비전의 품질 필드 부재는 정상/해결로 추정하지 않는다.

타자 득점·타점 합계, 안타/타수, 투수 피안타·실점·자책점 등 산술 경고는 관리자 확인 후 게시할 수 있다. 식별·구조·개인정보·누락·부모 경기 점수 오류는 계속 차단한다. 0과 null은 그대로 보존하며 타점=득점, 빈 이닝=0처럼 추정하지 않는다.

| 관리자 API | 기능 |
| --- | --- |
| `GET /runs/{runId}/game-records` | 전체 상세 원본/유효 기록, 품질, 정정 이력과 검수 체크섬 |
| `PATCH /runs/{runId}/game-records/{sourceGameId}/corrections` | 필드별 예상값/정정값, 사유, 검수 체크섬과 기준 리비전으로 정정 |
| `PATCH /runs/{runId}/game-records/{sourceGameId}/corrections/{correctionId}` | `USE_SOURCE` 또는 `KEEP_AUBL` 충돌 결정 |
| `POST /revisions/{revisionId}/correction-runs` | 게시본을 새 수정 후보로 복제. 재수집·재게시 없음 |

접두사는 `/api/admin/sync/unique-play`다. 원본 후보는 수정하지 않으며 `GAME_CORRECTION` 항목이 필드별 변경과 감사 이력을 보존한다. 원천이 정정값을 따라잡으면 원천 해결 알림을 반환한다. 원천이 다르게 변경되거나 경기/선수 행이 사라지면 해결로 처리하지 않고 충돌을 남긴다. 행이 모호할 때 이름만으로 다른 선수에게 정정을 옮기지 않는다.

상세가 있는 후보의 게시 요청은 기존 원본 `checksum` 외에 `reviewChecksum`과 경고 확인 `acknowledgeDetailWarnings`를 포함해야 한다. 기준 활성 리비전이 달라지거나 예상값/체크섬이 맞지 않으면 409로 중단한다. 새 후보/정정/알림 조회가 자동 수집 또는 공개 활성화를 실행하지 않는다.

관리자 검수 다운로드는 공개 경기·선수·기록과 품질 필드만 포함한다. 이 데이터로 만든 [전체 검수 보고서](reports/AUBL_2026_경기기록_전수검수_보고서_2026-09-05.docx)는 수집 후보 117경기를 포함하며 원본 추가 대조 7경기와 그 외 산술 검사를 구분한다.

| 경로 | 의미 |
| --- | --- |
| `GET /api/games/source/{sourceGameId}/details?seasonId=` | 활성 게시본의 경기 메타·양 팀 상세·최신성 |
| `GET /api/players/{playerId}/official-game-logs?seasonId=` | 활성 게시본에서 안전하게 연결된 선수의 경기별 타자·투수 기록 |

경기 응답은 `sourceGameId`, `backendGameId`, `seasonId`, `provider`, `syncRevision`, `capturedAt`, `publishedAt`, `status`, `game`, `detail`을 포함한다. 상세 상태는 `AVAILABLE`, `NOT_PUBLISHED`, `NOT_COLLECTED`, `REVIEW_REQUIRED`이며 비활성 리비전의 경기 참조에는 404를 반환한다. `game.status`는 일정·진행·종료 등 경기 상태다.

선수 응답은 위 최신성 메타와 `games[]`를 포함한다. 각 경기는 경기 일시·양 팀·점수·참조 ID와 해당 선수의 `batters[]`/`pitchers[]`를 담는다. 시즌 생략 시 최신 시즌이다.

- `AVAILABLE`: 활성 공식 스냅샷에서 조회한 결과. 기록이 없는 선수는 빈 배열이다.
- `NOT_COLLECTED`: 활성 게시본에 경기 상세 수집이 아직 없다.
- `IDENTITY_UNRESOLVED`: 시즌 소속·팀 별칭·동명이인 연결이 불명확하다. 임의 합산하지 않는다.
- `REVIEW_REQUIRED`: 경기 점수·상태와 공식 상세가 달라 관리자 대조가 필요하다. 상세와 해당 선수 경기 로그를 빈 상태로 반환한다.
- `NO_ACTIVE_REVISION`: 공식 활성 게시본이 없다. 이 상태에서만 기존 수동 기록 조회를 허용한다. 네트워크 오류·404·미수집·연결 미확인으로 수기 기록을 대신 보여주지 않는다.

공식 상세는 기존 `/scoreboard-text/{sourceGameId}` 경로에서 읽기 전용으로 표시한다. Firestore 문서 ID와 외부 경기 ID가 달라도 연결되며, 조회 결과를 실시간 기록원 상태에 주입하지 않는다. Flutter 경기 상세는 동일 웹 화면을 사용하고, 선수 상세는 네이티브 경기별 카드로 표시한다.

실시간 경기는 동일한 Firestore 경기의 진행 상태를 유지한다. 공식 상세가 미수집이고 DB 경기 상태도 예정·진행 중인 경우에만 실시간 경로를 사용하며, 종료·취소·검수 필요 상태나 다른 경기의 활성 상태로 자동 대체하지 않는다.

## 출시 전 순서

1. 백엔드 변경 소스·테스트 및 워커 fixture 검증.
2. NAS 아키텍처 `linux/amd64`로 백엔드·워커 이미지를 빌드하고 별도 버전으로 배포. 백엔드를 먼저 교체한다.
3. 공개 GET API와 관리자 세션 조회 확인. 웹·앱은 신규 API 지원 백엔드와 함께 배포한다.
4. 관리자가 수집 버튼을 눌러 미리보기만 실행한다. 정상·교체·콜드·몰수 경기를 원천 표와 대조한다.
5. 종료 경기 상세 커버리지, 양 팀 점수, 개인 행 합계, 매핑·동명이인, 개인정보 부재를 검증한다.
6. 검수 후 리비전 생성·활성화. 같은 후보 반복 게시 no-op, 점수 수정, 이전 공식 상세 유지와 리비전 복구를 확인한다.

자동화 테스트 통과는 실제 전체 시즌 수집 성공이나 운영 배포 완료를 의미하지 않는다. 원천 DOM 변경 및 개별 경기의 미등록 데이터는 수동 미리보기에서 최종 확인한다.

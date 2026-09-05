# UniquePlay 누적 기록 검수 후속 확인 — 2026-09-05

## 결론과 확인 범위

백엔드 v24·워커 v9의 수동 수집 후 검수에서 보고된 `DELETE` 419건을 조사하며, **비교 식별자 불일치 2종과 누적 표의 조기 종료 가능성**을 소스에서 확인했다. 이 문서는 읽기 전용 코드 검토와 로컬 합성 fixture 재현을 기록한다. 코드·운영 환경·검수 결정·게시 상태는 이 검토에서 변경하지 않았다.

**419건 전부의 원인이 확인된 것은 아니다.** 팀 별칭과 규정 IN/OUT 이동에 의한 잘못된 비교 분류, 실제 수집 누락, 원천에서 실제로 사라진 기록을 분리해야 한다. 비교 로직·완전성 문제를 보완하고 후보를 재대조하기 전에는 419건을 일괄 삭제 승인하거나 정상 변경으로 확정하지 않는다.

조사 당시 실행은 `f994f85b-b6dc-4845-8b47-dd62eb63f352`이며, 전체 수집 후 `VALIDATION_FAILED` 상태였다. 경기 상세 합계 오류와 이 문서의 누적 기록 `DELETE` 분석은 서로 다른 확인 항목이다.

## 1. 팀 별칭이 비교 키에 반영되지 않음

### 소스 근거

| 위치 | 확인 내용 |
| --- | --- |
| [UniquePlaySyncService.java:852](/Users/juhwan/Documents/Dev/AUBL/AUBL_WebPage_BE-test/src/main/java/com/aubl/webpage/service/UniquePlaySyncService.java:852) | `addStatDiff`가 기존 DB 누적 기록과 수집 후보를 비교한다. |
| [UniquePlaySyncService.java:859](/Users/juhwan/Documents/Dev/AUBL/AUBL_WebPage_BE-test/src/main/java/com/aubl/webpage/service/UniquePlaySyncService.java:859) | 타자 기존 키에 `TeamPlayer.team.teamName`, 즉 DB 팀명을 사용한다. 투수도 864행에서 동일하다. |
| [UniquePlaySyncService.java:872](/Users/juhwan/Documents/Dev/AUBL/AUBL_WebPage_BE-test/src/main/java/com/aubl/webpage/service/UniquePlaySyncService.java:872) | 후보 키에는 원천 `row.teamName`을 사용한다. 이 비교 전에 저장된 TEAM 별칭 매핑을 적용하지 않는다. |
| [UniquePlaySyncService.java:895](/Users/juhwan/Documents/Dev/AUBL/AUBL_WebPage_BE-test/src/main/java/com/aubl/webpage/service/UniquePlaySyncService.java:895) | 기존 키가 후보의 `seen`에 없고 기존 공개 리비전 소속이면 `DELETE` 항목을 만든다. |
| [UniquePlayPublisher.java:156](/Users/juhwan/Documents/Dev/AUBL/AUBL_WebPage_BE-test/src/main/java/com/aubl/webpage/service/UniquePlayPublisher.java:156) | 게시기의 `resolveTeam`은 `EXTERNAL_ENTITY_MAPPING`의 TEAM 연결을 사용한다. |
| [UniquePlayPublisher.java:213](/Users/juhwan/Documents/Dev/AUBL/AUBL_WebPage_BE-test/src/main/java/com/aubl/webpage/service/UniquePlayPublisher.java:213) | 게시기는 연결된 `TeamPlayer`·시즌·제공자로 기존 타자 기록을 조회해 upsert한다. 투수도 256행에서 동일하다. |

### 재현 가능한 식별자 예

아래 팀명·선수명은 설명용 합성 값이다. 원천의 `홈대 야구부`가 DB의 `홈대학교`에 이미 연결되어 있어도 현재 비교 키는 다르다.

```text
기존 DB 키: A|BATTER|IN|홈대학교|테스트선수
수집 후보 키: A|BATTER|IN|홈대야구부|테스트선수
```

따라서 같은 논리적 선수 기록에 대해 후보는 `CREATE`, 기존 기록은 `DELETE`로 표시될 수 있다. 반면 게시 단계는 저장된 팀 매핑을 통해 같은 DB 기록을 갱신할 수 있다. **비교와 실제 게시가 서로 다른 식별 기준을 사용한다는 점은 코드로 확인됐다.** 실제 419건 중 해당 사례 수는 원천 팀명·DB 팀명·저장된 매핑·선수 정보를 함께 대조해야 확정할 수 있다.

## 2. 규정 IN/OUT을 식별자에 포함함

[UniquePlaySyncService.java:1601](/Users/juhwan/Documents/Dev/AUBL/AUBL_WebPage_BE-test/src/main/java/com/aubl/webpage/service/UniquePlaySyncService.java:1601)의 `statKey`는 다음 값을 결합한다. [UniquePlayPublisher.java:632](/Users/juhwan/Documents/Dev/AUBL/AUBL_WebPage_BE-test/src/main/java/com/aubl/webpage/service/UniquePlayPublisher.java:632)도 동일한 외부 키 형식을 사용한다.

```text
groupCode | kind | regulation | normalizedTeamName | normalizedPlayerName
```

그러나 게시기의 실제 DB 조회 식별자는 `teamPlayerId + seasonId + seasonType IS NULL + sourceProvider`이며 `regulation`을 포함하지 않는다. 규정은 기존 기록의 변경 가능한 속성으로 다시 저장된다.

```text
기존: A|BATTER|OUT|홈대학교|테스트선수
변경: A|BATTER|IN|홈대학교|테스트선수
```

동일 선수가 규정 OUT에서 IN으로 이동하면 비교 화면에는 `DELETE + CREATE`가 생길 수 있지만, 게시기는 같은 누적 기록의 규정 속성을 변경한다. 이 이동을 실제 선수 기록 소멸로 해석하면 안 된다.

후속 보완에서는 비교 식별자를 게시기와 같은 논리적 선수·시즌·제공자 기준으로 맞추고 규정 변경을 속성 변경으로 다룰 필요가 있다. 기존 `OVERRIDE_BATTER_STAT`·`OVERRIDE_PITCHER_STAT` 외부 키와의 호환성도 검토해야 하며, 저장된 운영 판단을 새 키로 임의 이동하거나 지우지 않는다.

## 3. 누적 선수 표의 스크롤 조기 종료 재현

### 소스 근거

- [adapter.mjs:116](/Users/juhwan/Documents/Dev/AUBL/main/services/uniqueplay-sync-worker/src/adapter.mjs:116)의 `collectVirtualTable`은 `collectUntilStable`을 사용한다. 타자·투수 누적 표도 각각 196·200행에서 이 경로로 수집된다.
- [adapter.mjs:124](/Users/juhwan/Documents/Dev/AUBL/main/services/uniqueplay-sync-worker/src/adapter.mjs:124)의 `collectUntilStable`은 행 집합이 같으면 `unchangedSamples`를 증가시킨다. `advance()`가 계속 `true`여도 이를 초기화하지 않아 같은 행을 세 번 읽으면 종료할 수 있다.
- [adapter.mjs:143](/Users/juhwan/Documents/Dev/AUBL/main/services/uniqueplay-sync-worker/src/adapter.mjs:143)의 경기 목록용 `collectLazyList`는 새 행이 없고 더 이상 스크롤할 수도 없을 때만 종료 안정화 횟수를 증가시킨다. 두 수집기의 종료 기준이 다르다.
- `collectUntilStable`은 최대 반복 수에 도달해도 완료 증거를 검사하거나 오류를 던지지 않고 현재까지의 행을 반환한다. 이 경로도 부분 수집을 완료로 간주하지 않도록 검토해야 한다.

### 실제 실행한 읽기 전용 합성 fixture

프로젝트 루트에서 Node ES module로 실행했다. 브라우저를 열거나 네트워크를 호출하지 않고, 메모리의 합성 행과 이동 콜백만 사용했다. 파일을 생성·수정하지 않았다.

```javascript
import { collectUntilStable, collectLazyList }
  from './services/uniqueplay-sync-worker/src/adapter.mjs';

const pages = [
  ['A'], ['A'], ['A'], ['A'],
  ['A', 'B'], ['A', 'B'], ['A', 'B'], ['A', 'B'],
];
let tableIndex = 0;
const table = await collectUntilStable({
  read: async () => ({
    rows: pages[Math.min(tableIndex, pages.length - 1)]
      .map(x => ({ fixed: [x], values: ['1'] })),
    reason: null,
  }),
  advance: async () => {
    tableIndex += 1;
    return tableIndex < pages.length - 3;
  },
});
let gameIndex = 0;
const list = await collectLazyList({
  read: async () => pages[Math.min(gameIndex, pages.length - 1)],
  advance: async () => {
    gameIndex += 1;
    return gameIndex < pages.length - 3;
  },
  identify: row => row,
});
console.log(JSON.stringify({
  tableRows: table.map(row => row.fixed[0]), tableIndex,
  listRows: list, gameIndex,
}));
```

실제 출력:

```json
{"tableRows":["A"],"tableIndex":4,"listRows":["A","B"],"gameIndex":8}
```

누적 표 수집기는 다음 위치의 B를 읽기 전에 종료했고, 경기 목록 수집기는 A와 B를 모두 읽었다. **조기 종료 가능성은 재현됐지만, 실제 419건 중 이 원인으로 빠진 기록 수는 확인되지 않았다.** 실제 누적 표의 조·타자/투수·규정별 행 집합과 후보를 대조해야 한다.

## 4. `DELETE` 표시와 물리 삭제의 차이

현재 검수 화면의 `DELETE`는 `addStatDiff`가 만든 비교 분류다. 그 항목 수가 곧 DB에서 지울 행 수를 뜻하지 않는다.

- 게시기는 존재하는 후보 기록을 DB 식별자로 upsert한다. 팀 별칭이나 규정 키 변경으로 `CREATE + DELETE`가 표시돼도 동일 DB 행이 갱신될 수 있다.
- 실제 후보에서 빠진 기존 기록은 보통 이전 `sourceRevision`에 남는다. [RecordService.java:247](/Users/juhwan/Documents/Dev/AUBL/AUBL_WebPage_BE-test/src/main/java/com/aubl/webpage/service/RecordService.java:247)과 [RecordService.java:256](/Users/juhwan/Documents/Dev/AUBL/AUBL_WebPage_BE-test/src/main/java/com/aubl/webpage/service/RecordService.java:256)은 활성 공식 리비전 소속 누적 기록을 공개하므로, 새 리비전으로 이어지지 않은 행은 공개 집계에서 제외된다.
- [UniquePlayPublisher.java:590](/Users/juhwan/Documents/Dev/AUBL/AUBL_WebPage_BE-test/src/main/java/com/aubl/webpage/service/UniquePlayPublisher.java:590)의 별도 유지 처리는 저장된 오버라이드에 따라 누락 기록을 새 리비전으로 이어갈 수 있다. 이 경로 역시 원천 팀명과 DB 팀명의 키 차이를 검토해야 한다.
- 현재 누적 게시 경로에 `DELETE` 비교 항목마다 `BatterStats`·`PitcherStats`를 물리 삭제하는 처리는 없다. 그렇다고 수집 누락을 승인해도 안전하다는 뜻은 아니다. **물리 기록이 남더라도 공개에서 사라질 수 있다.**

## 5. 상세 합계 오류와 분리할 사항

같은 실행에 보고된 `DETAIL_BATTER_TOTAL` 9건과 `DETAIL_LINE_SCORE` 1건은 경기별 상세 검증 결과다. 코드상 워커·백엔드는 개별 타자의 R/H 합과 이닝 점수 합을 유사하게 검사한다.

- 빈 숫자·`-`는 `null`로 보존하며, 개별 열에 `null`이 있으면 해당 합계 비교를 생략한다.
- `X`는 `runs: null`, `notPlayed: true`다. 검증된 `NOT_PUBLISHED` 몰수 기록은 선수 합계 검사를 건너뛴다.
- 교체 행은 별도 행으로 보존한다. 이 코드 검토만으로 현재 오류가 교체 선수 중복 합산이나 원천 오류 때문이라고 확정할 수 없다.
- 백엔드 오류 경로가 경기 인덱스까지만 제공하므로, 9개 합계 오류가 반드시 9경기를 뜻하지 않는다. 팀·R/H 구분·관측 합·기대 합을 함께 확인할 수 있도록 진단을 보완할 필요가 있다.

상세 합계 오류의 원천 대조와 누적 기록 `DELETE` 재분류는 모두 게시 전에 확인해야 한다. 한쪽을 해결했다고 다른 쪽을 자동 승인하지 않는다.

## 6. 게시 전 후속 확인 목록

- [ ] 팀 별칭을 적용한 동일 식별 기준으로 기존·후보 누적 기록을 다시 비교한다.
- [ ] 규정 IN/OUT 이동을 분리하고, 실제 누락과 속성 변경의 건수를 구분한다.
- [ ] 기존 유지 오버라이드의 키 호환성을 검토하고 운영 판단이 유실되지 않는지 확인한다.
- [ ] 누적 표의 조기 종료와 최대 반복 한계 처리에 회귀 테스트를 추가하고 완전성 기준을 보완한다.
- [ ] 보완 후 관리자가 명시적으로 다시 수집해 조·팀·타자/투수·규정별 원천 행 집합과 대조한다.
- [ ] 419건을 별칭 재분류·규정 이동·실제 원천 누락·수집 누락·미확인으로 나누어 수치를 기록한다. 확인 전에는 어느 원인도 419건 전체로 단정하지 않는다.
- [ ] 경기별 상세 합계 오류도 원천과 대조한 뒤 별도로 해결한다. 승인 전 공개 리비전을 유지한다.

이 문서의 소스 경로·라인은 2026-09-05 검토 시점 기준이다. 후속 수정 시 실제 커밋과 변경된 테스트·대조 결과를 추가 기록한다.

# 관리자 보관 기록 재심 흐름 구현 및 검증

작성일: 2026-09-08

## 결론과 적용 범위

공식·잠정 기록 비교표의 차이와 보관 사건의 무결성·수비 귀속 문제를 기존 관리자 검수 이슈 폼에 연결했다. 별도 이슈 큐나 서버 스키마를 만들지 않고, 기존 `recordArchives/{matchId}/issues`의 추가 전용 이력을 사용한다.

이번 범위의 타입·단위·브라우저·에뮬레이터 검증은 통과했다. 이는 모든 KBO 상황이나 운영 준비 완료를 인증하는 결과가 아니다. 로그인·운영 백엔드 진입 게이트는 `BLOCKED_BEFORE_LOGIN_BACKEND`를 유지한다. 운영 로그인, 운영 자료 저장·삭제, 배포, 기능 플래그 활성화는 수행하지 않았다.

## 사용자 흐름

1. 관리자가 공식 전환된 경기의 비교 화면에서 고정된 공식 리비전과 해시를 확인한다.
2. 비교표의 불일치·누락·매핑 불가 항목에서 `비교 이슈 초안`을 선택한다.
3. 사건 단위 검토가 필요하면 보관 사건을 100건씩 조회하고, 사건 무결성 또는 수비 귀속 진단의 `이슈 초안 보기`를 선택한다.
4. 하위 사건 컬렉션과 구형 루트 사건 배열은 선택을 바꿔 별도로 검토한다. 두 원본을 합산하거나 어느 쪽이 완전한 경기 기록이라고 가정하지 않는다.
5. 초안 미리보기에서 경기·리비전·해시, 관찰 내용과 근거를 확인한다. 이 단계에서는 폼 내용과 Firestore 이력이 바뀌지 않는다.
6. `초안을 이슈 폼에 적용`을 명시적으로 선택하면 작성 중인 분류·상태·근거·내용을 초안으로 교체한다. 취소하면 작성 중인 폼은 보존한다.
7. 관리자가 분류와 내용을 검토한 뒤 `검수 이력 추가`로 저장한다. 후속 조사·수정·검증도 기존 이력을 덮어쓰지 않고 추가 이력으로 남긴다.

초안 적용은 저장이 아니다. 문제 발견은 원인 확정이나 기록 자동 수정이 아니다. 보관된 원본 문자중계·사건·수비 스냅샷은 이 흐름으로 수정하지 않는다.

## 구현 내용

| 구성 | 변경 내용 |
| --- | --- |
| [archivedScoringReview.ts](/Users/juhwan/Documents/Dev/AUBL/main/src/features/sync/archivedScoringReview.ts) | 조회 범위별 원본 진단, 비교·진단 이슈 초안 생성, 경기·리비전·해시 결합, 근거 길이 제한 |
| [ArchivedScoringReviewPanel.tsx](/Users/juhwan/Documents/Dev/AUBL/main/src/features/sync/components/ArchivedScoringReviewPanel.tsx) | 관리자용 진단 목록, 원본 선택, 부분 조회 경고, 조회분의 선수별 수비 귀속 요약, 초안 선택 |
| [AdminRecordComparisonPage.tsx](/Users/juhwan/Documents/Dev/AUBL/main/src/app/pages/admin/AdminRecordComparisonPage.tsx) | 비교표·보관 사건에서 기존 폼으로 연결, 미리보기·적용·취소, 오래된 초안 차단 |
| [AdminRecordComparisonPage.css](/Users/juhwan/Documents/Dev/AUBL/main/src/app/pages/admin/AdminRecordComparisonPage.css) | 기존 화면 스타일을 유지한 진단·초안 표시 |
| [test-archive-scoring-review.mjs](/Users/juhwan/Documents/Dev/AUBL/main/scripts/test-archive-scoring-review.mjs) | 신규 단위 테스트 54건, 기존 `test:scoring` 실행 목록에 포함 |
| [archive-review-fixtures.mjs](/Users/juhwan/Documents/Dev/AUBL/main/scripts/e2e/record-sources/archive-review-fixtures.mjs) | 실제 복합 플레이 해석·수비 스냅샷 캡처를 이용한 로컬 fixture |
| [test-record-source-e2e.mjs](/Users/juhwan/Documents/Dev/AUBL/main/scripts/test-record-source-e2e.mjs) | 관리자 재심 및 비관리자 차단 9개 시나리오 추가, 데스크톱·모바일 검증 |
| [test-defensive-fielding-e2e.mjs](/Users/juhwan/Documents/Dev/AUBL/main/scripts/test-defensive-fielding-e2e.mjs) | Vite 탐색 진입점·사전 번들 의존성 한정, 실행별 캐시 격리 |

## 진단·근거 보존 설계

- 원본을 정규화하거나 복구해서 이상을 숨기지 않고, 읽어온 자료를 그대로 무결성 검사에 전달한다. 원본 배열·객체를 변경하지 않는다.
- 다른 경기의 복합 플레이·수비 스냅샷은 범위 문제로 표시하고 해당 경기 수비 집계에서 제외한다.
- 기존 무결성 검사와 수비 원장의 사건 우선순위 규칙을 재사용한다. 상위 우선순위 미확정·무효 사건을 하위 기록으로 조용히 대체하지 않는다.
- 동일한 무결성 문제를 수비 진단에서 다시 제시하는 중복은 줄이되, 실제 수비 귀속 누락은 별도 문제로 남긴다.
- 비교값의 `0`, 누락, `X`를 서로 같은 값으로 처리하지 않는다. 일치하는 비교 항목에는 초안을 만들지 않는다.
- 초안 상태는 `OPEN`으로 시작한다. 관찰·재현·수정·검증 내용을 작성할 틀을 제공하되, 원인이나 수정 완료를 자동 확정하지 않는다. 관리자가 기본 분류를 변경할 수 있다.
- 근거의 `schema`는 `aubl-archive-review-v1`이다. 경기·공식 리비전·해시와 함께 비교 키 또는 진단 종류·조회 범위·사건 참조·실제 문서 ID를 담는다.
- 하위 컬렉션의 `_documentId`만 물리 문서 ID로 취급한다. 구형 루트 배열에 같은 이름의 필드가 있어도 실제 하위 문서의 식별자로 사용하지 않는다.
- 실제 사건 ID가 없는 구형 자료는 진단용 참조로 표시한다. 생성된 참조를 실제 사건 ID로 기록하지 않는다.
- 충돌 원본의 문서 ID는 최대 8개를 보존하고 추가 건수를 별도로 남긴다. 2,000자 제한을 넘는 근거는 식별자를 임의로 잘라 저장하지 않고 초안 생성을 거부한다.

## 조회 범위와 권한 경계

- 추가 조회가 남은 경우 `partial-page`로 표시한다. 조회한 100건이 유효하다는 이유로 전체 경기 검증 완료를 표시하지 않는다.
- 마지막 페이지까지 조회한 경우에도 `loaded-collection`, 즉 이번에 조회된 컬렉션 자료의 검토 결과다. 과거 누락 사건이나 다른 원본의 완전성까지 보장하지 않는다.
- 구형 배열은 `legacy-array-only`로 표시하고 컬렉션과 합치지 않는다. 근거에 조회 건수와 선택 원본을 보존한다.
- 수비 요약은 선택한 조회분에 대한 귀속 결과다. 시즌 기록, 전체 경기 수비 이닝, 공식 수비율로 제시하지 않는다.
- 패널은 기본 비허용이며, 관리자 페이지의 권한 조건 아래에서만 활성화한다. 기록원 권한만으로는 이 관리자 재심 화면과 공식 전환 후 비공개 보관 원본에 접근할 수 없다.
- 경기·공식 리비전·해시·재조회 키가 바뀌면 이전 원본 조회 컴포넌트를 새로 마운트하고 폼·초안을 초기화한다. 적용·저장 시에도 초안의 경기·리비전·해시가 현재 값과 같은지 검사한다.
- 공개 기록의 소스 선택, Firestore Rules, 공식 전환 서버 스키마는 이번 작업에서 변경하지 않았다.

## 검증 결과

각 행은 별도 실행 결과이며 중복 없는 전체 테스트 개수로 합산하지 않는다.

| 검증 | 결과 | 비고 |
| --- | --- | --- |
| 제품 타입 검사 | 통과 | `npm run typecheck` |
| 기록 단위 테스트 | 922/922 통과 | 기존 868건에 재심 단위 54건 추가 |
| 기록 소스 정책 | 37/37 통과 | 비교·정책 경계 별도 실행 |
| 수비 기록 E2E | 36/36 통과 | 실행별 새 Vite 캐시 사용 |
| Firestore 소스 권한 규칙 | 83/83 통과 | 로컬 에뮬레이터에서 재실행 |
| 관리자·소스 E2E 최초 실행 | 32/34 통과 | 메모 재조회 선택자에서 데스크톱·모바일 각 1건 실패 |
| 관리자·소스 E2E 승인 후 재실행 | 34/34 통과 | 테스트 선택자 한 곳만 수정, 제품 코드 변경 없음 |

신규 단위 테스트는 초안 식별·무효화, 불일치 값 구분, 원본 불변성, 잘못된 행·컬렉션, 타 경기 자료 제외, 원본 우선순위·충돌, 물리 문서 식별, 조회 범위와 근거 길이 경계를 포함한다.

### 추가한 브라우저 시나리오

각 시나리오를 데스크톱 1440×1000과 모바일 390×844에서 실행했다. 기존 8개와 신규 9개를 합쳐 17개 시나리오, 34회 실행이다.

| 신규 시나리오 | 확인 내용 |
| --- | --- |
| `administrator-review-comparison-draft` | 비교 차이 초안의 공식 식별자 유지, 확인 전 무저장, 실제 이슈 저장·재조회 |
| `administrator-review-integrity-draft` | 잘못된 복합 사건의 무결성 진단과 실제 문서 ID 근거 보존 |
| `administrator-review-fielding-draft` | 수비 선수 식별 누락의 포지션·문서 근거와 매핑 분류 저장 |
| `administrator-review-legacy-separate` | 구형 배열만 별도 검토, 컬렉션 사건 비혼합, 가짜 물리 문서 ID 배제 |
| `administrator-review-draft-replacement` | 작성 중 메모·근거 보존, 초안 취소, 명시적 적용 후 저장 |
| `administrator-review-stale-draft` | 공식 해시 변경 시 미리보기·작성 내용 초기화, 이전 초안 저장 차단 |
| `administrator-review-partial-page` | 100건 부분 조회와 후속 1건 조회 구분, 새 초안의 조회 범위 갱신 |
| `scorer-admin-review-denied` | 기록원에게 관리자 진단·저장 UI 비노출, 비공개 원본 직접 읽기 거부 |
| `anonymous-admin-review-denied` | 비로그인 사용자에게 동일 UI 비노출, 비공개 원본 직접 읽기 거부 |

재심 시나리오에서는 보관 코어가 변경되지 않았는지와 의도적으로 만든 잘못된 사건·수비 스냅샷이 원본 그대로 남았는지도 검사했다. 자동 수정으로 진단 원인을 지우지 않는 경계를 검증한 것이다.

### 최초 실패와 승인 후 수정

최초 실행의 `administrator-review-draft-replacement` 2건은 메모 입력 후 `getByLabel(..., { exact: true })`로 같은 입력란을 다시 찾는 `inputValue()` 단계에서 시간 초과됐다. 해당 결과의 브라우저 오류 목록은 비어 있었다. 이 시점에는 메모 보존 시나리오를 통과로 처리하지 않았다.

사용자 승인 후 테스트의 메모 선택자 한 곳을 라벨 접두부에 고정된 정규식으로 바꿨다. 제품 코드와 메모·근거 보존, 저장 전후 이슈 건수, 원본 불변성 assertion은 유지했다. 전체 관리자·소스 E2E 34건과 소스 Rules 83건을 재실행해 모두 통과했다. 최초 실패 산출물도 삭제하지 않았다.

### 하네스 격리 완료

이전 수비 귀속 문서에 남아 있던 Vite 탐색 범위·캐시 분리 과제를 완료했다. `configFile: false`, `envFile: false`, 실행별 `cacheDir`, 지정한 `optimizeDeps.entries`, `noDiscovery: true`와 React 관련 의존성 명시로 실행 경계를 한정했다. 감시·HMR·WebSocket도 비활성화했다. 새 캐시에서 수비 E2E 36건이 통과했다. 과거 문서의 당시 미완료 기록은 감사 이력으로 유지한다.

## 테스트 안전성과 실제 검증 경계

- Firestore는 `demo-aubl-scoring`, `127.0.0.1:8088` 에뮬레이터만 사용했다.
- 브라우저는 로컬 테스트 서버와 에뮬레이터 외 요청을 차단한다. 최종 결과는 `productionAccess: false`, 차단 요청 목록은 빈 배열이다.
- `LOCAL_TEST_SOURCE_` 접두부 fixture만 생성했다. 기존 `finally` 정리 경로에서 에뮬레이터 자료를 제거하고 실행 후 에뮬레이터를 종료했다. 운영 경기 생성·수정·삭제는 없었다.
- 제품 소스 훅·공개 게이트·관리자 비교 화면, Firestore SDK/Rules, Python 공식 전환 트랜잭션을 사용했다.
- 인증, NAS API 응답, callable 전송부는 fixture다. 실제 로그인, 운영 HTTP callable, 전체 운영 Store Provider를 마운트한 통합 검증은 아니다.
- 이번 실행은 전체 복합 모달 회귀나 과거 20경기·문자중계 500건의 완전 재검증을 대신하지 않는다. 이전 실행 수치를 이번 실행 수치로 재사용하지 않았다.

## 실행 명령과 근거

```sh
npm run typecheck
npm run test:scoring
npm run test:scoring:fielding-e2e
node --experimental-strip-types --test scripts/test-record-source-policy.mjs
FIREBASE_CLI_DISABLE_UPDATE_CHECK=1 firebase emulators:exec \
  --config firebase.scoring-test.json --only firestore --project demo-aubl-scoring \
  "node scripts/test-record-source-emulator.mjs --only=record-source-rules,record-source-browser"
```

- [통합 실행 요약](/Users/juhwan/Documents/Dev/AUBL/main/outputs/admin-review-workflow-2026-09-08/summary.json)
- [단위 테스트 로그](/Users/juhwan/Documents/Dev/AUBL/main/outputs/admin-review-workflow-2026-09-08/unit.log)
- [수비 E2E 결과](/Users/juhwan/Documents/Dev/AUBL/main/outputs/defensive-fielding/2026-09-08T10-44-03-822Z/summary.json)
- [관리자 E2E 최초 결과](/Users/juhwan/Documents/Dev/AUBL/main/outputs/record-source-e2e/2026-09-08T10-47-40-824Z/results.json)
- [관리자 E2E 최종 결과](/Users/juhwan/Documents/Dev/AUBL/main/outputs/record-source-e2e/2026-09-08T10-49-54-335Z/results.json)
- [최종 Firestore Rules 로그](/Users/juhwan/Documents/Dev/AUBL/main/outputs/record-source-validation/2026-09-08T10-49-52-098Z/record-source-rules.log)

## 다음 단계와 제한

1. 이슈를 실제 수정으로 연결할 때 원본 사건, 고정 공식 리비전, 재현 입력, 회귀 테스트를 함께 남긴다. 이 화면은 자동 재연산·원본 덮어쓰기·공식 기록 수정 기능이 아니다.
2. 보관 자료의 완전성 판단에는 남은 페이지, 별도 원본, 실제 누락 여부를 추가 확인해야 한다. 부분 조회 진단만으로 경기 전체의 정합성을 승인하지 않는다.
3. 로그인·실제 백엔드 연동은 별도 승인을 받은 격리 테스트 경기, 인증·권한 행렬, 실제 callable/NAS 경계, 정리 절차를 갖춘 다음 단계로 진행한다. 이번 통과만으로 운영 접근이나 기능 플래그를 자동 활성화하지 않는다.


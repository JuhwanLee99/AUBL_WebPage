# 기록 모달: 미적용 기록의 전송 차단과 명시적 복구

작성일: 2026-09-22

후속 점검 및 1단계 보강: [기록 상태·권한·표시 정보 분리](records-scorekeeper-review-hardening-2026-09-22.md). 아래 1,021건은 이전 검증 결과로 보존한다.

## 현재 판정

`BLOCKED_BEFORE_LOGIN_BACKEND` 유지. 선택형 영속 접수 경로에 적용 확인 상태와 복구 패널을 추가했다. 운영 Provider·실제 인증·서버 transport에는 연결하지 않았다. 운영 데이터 변경·배포·커밋은 없다.

최신 보강에서 **새로고침 후 최신 미전송 체크포인트를 복구하기 전의 신규 입력 차단**까지 구현했다. 최종 타입 검사와 1,021건이 통과했다. 앞선 1,013건 결과는 이전 단계 증거로 보존하며, 이번 결과만으로 운영 가능하다고 판단하지 않는다.

## 해결한 문제와 선택한 방식

이전 단계는 디스크 저장과 화면 적용 사이에 상태 변경·권한 회수가 발생하면 원본을 보존했지만, 그 입력을 나중에 커밋하는 것까지 막지는 않았다. 실패 후 차단 플래그를 추가하는 방식은 저장 직후 탭이 종료되면 플래그 기록 자체를 놓칠 수 있다.

따라서 입력을 처음 저장할 때부터 `localApplication: pending`으로 저장한다. 화면 적용 확인까지 성공한 경우에만 별도 엄격한 IndexedDB 트랜잭션으로 `applied`로 전환한다. 두 저장 사이에 종료·권한 변경·확인 저장 오류가 발생하면 전송 불가 상태가 기본값으로 남는다.

이 상태는 서버 ACK가 아니다. `applied`는 해당 원본이 기기에 적용됐다는 확인이며, 서버 확정은 기존 요청별 ACK 계약으로만 판단한다.

## 계약과 상태 흐름

`초안 → 입력·체크포인트·pending 영수증 원자 저장 → 현재 상태·권한 재확인 → 화면 적용 → applied 확인 원자 저장 → 요청 고정 → 전송 직전 재확인 → 서버 ACK`

| 상태 | 허용 | 차단 |
|---|---|---|
| `pending` | 같은 입력·payload 재시도, 원본 조회, 명시적 복구 | 해당 입력을 포함한 요청 고정·전송·ACK 반영, 후속 새 입력 |
| `applied` | 요청 고정·전송, 원본 복구·적용 확인 | 다른 payload로 같은 ID 재사용 |
| 서버 충돌 등 `blockedReason` 존재 | 원본 조회·증거 보존 | 기존 차단 정책에 따른 저장·전송·확인 |

앞쪽 입력이 모두 적용 확인됐고 뒤쪽에 미적용 입력이 있으면, 확인된 앞쪽 구간의 ACK는 허용한다. 미적용 뒤쪽 입력까지 함께 승인하지 않는다.

### 파일별 변경

| 파일 | 변경 |
|---|---|
| `durableScoringQueue.ts` | 입력별 적용 확인 상태, 구형 입력 보수적 이관, 범위별 전송·ACK 차단, 적용 확인 저장 |
| `durableScoringWriter.ts` | `stage`, `confirmApplied`, `review`를 작성권 수명 안에서 실행 |
| `durableScoringCommitAdapter.ts` | 고정 요청 해석 후 transport 호출 직전 `assertSendable` 실행 |
| `durableCompositeIntake.ts` | 저장 후 확인, 확인 저장 실패 재시도, 원본 조회·검증·실제 reducer 기반 명시적 복구 |
| `DurableScoringRecoveryPanel.tsx` | 기기 기록 목록, 차단 상태, 복구·적용 확인 버튼, 오류·서버 미확정 안내 |

제품 파일의 기준 디렉터리는 `src/shared/lib`이며 패널은 `src/features/scorekeeper/components`에 있다.

## 구형 데이터와 호환성

- 새 `stage` 입력은 처음부터 `pending`이다.
- `enqueue`를 직접 호출해도 `kind: composite-play` payload는 자동으로 `pending`으로 분류한다.
- 기존 영수증에 적용 확인 상태가 없으면, 남아 있는 복합 기록은 자동 승인하지 않고 `pending`으로 보완한다.
- 기존에 이미 고정한 요청도 예외가 아니다. 전송 직전 다시 적용 확인 상태를 검사한다.
- 원본 해시와 영수증이 다르거나 구형 ID가 중복되면 보완을 거부하고 데이터를 유지한다.
- 기존 일반 문자열 큐 시험 및 비복합 입력 계약은 유지한다. 모든 구형 운영 액션이 새 접수 계약으로 바뀐 것은 아니다.
- 이미 ACK되어 원본이 삭제된 과거 기록은 기기 체크포인트로 복원하지 않는다. 이후 실제 서버 확정본 조회와 연결해야 한다.

## 명시적 복구 절차

복구 패널은 새 시험 경로에서만 사용한다. 운영 기록원 화면에는 아직 장착하지 않는다.

1. 전체 scope, 입력 ID, 체크포인트 형식을 확인한다.
2. 더 앞선 미적용 입력이 있으면 순서를 건너뛴 복구를 거부한다.
3. 현재 경기와 권한을 다시 확인한다.
4. 현재 상태가 저장된 적용 후 상태와 같으면 화면을 중복 변경하지 않고 적용 확인 저장만 재시도한다.
5. 현재 상태가 저장된 적용 전 상태와 같으면 실제 reducer로 입력을 재생한다. 재생 결과가 저장된 적용 후 상태와 일치해야 한다.
6. 전후 어느 상태와도 같지 않으면 `recovery-state-conflict`로 거부한다. 강제 덮어쓰기·원본 삭제·다른 경기로 이동하지 않는다.
7. 성공 시 원본 payload와 시간값은 보존하고 실제 reducer가 만든 undo/redo 이력을 사용한다. 적용 확인 후에도 서버 미확정임을 안내한다.

재생 비교는 객체 키 순서와 JSON에서 생략되는 `undefined` 속성을 정규화한다. 새로 생성되는 사건·중계 행의 최상위 `createdAt`만 비교에서 제외하며, 점수·주루·사건 내용·판정·중계 내용은 비교한다. 예측하지 못한 다른 차이는 자동 허용하지 않는다. 저장된 원본의 생성 시각은 실제 복구 결과에 유지한다.

### 적용 확인 저장 실패

화면에는 이미 사건이 적용됐지만 `applied` 저장에 실패할 수 있다. 이 경우 원본과 `pending`은 남는다. 복구 버튼은 현재 상태가 원본의 적용 후 상태인지 확인한 뒤 영수증만 확정하므로 사건과 undo 이력을 두 번 추가하지 않는다.

### 복구 전 신규 입력 차단: 후속 보강 완료

`applied` 영수증이 남아 있어도 새로고침한 화면이 그 사건을 복원했다는 뜻은 아니다. 신규 접수 전에 마지막 미전송 입력의 적용 후 체크포인트와 현재 화면을 비교한다.

- 미전송 입력이 있고 현재 화면이 최신 적용 후 상태와 다르면 `recovery-required-before-input`으로 차단한다. 새 순번·사건을 저장하지 않는다.
- 일부 앞선 기록만 복구한 상태도 차단한다. 마지막 미전송 기록까지 복구해야 새 플레이를 받는다.
- 마지막 입력이 아직 `pending`이면 기존 `local-application-review-required` 차단을 유지한다.
- 같은 컨트롤러에서 이미 만들어 둔 동일 입력·payload의 실패 재시도는 보존한다. 다른 플레이가 뒤에 저장된 경우에는 캐시된 시도라도 최신 체크포인트 검사를 우회하지 못한다.
- 새로고침으로 기존 시도의 메모리 투영이 없으면 같은 ID를 재생성하지 않는다. 명시적 복구 경로로 처리한다.
- 큐 조회는 비동기이므로 조회 후 현재 상태와 권한을 다시 확인한 뒤 투영한다.
- 큐가 비어 있는 경우 서버의 최종 확정 revision과 화면을 맞추는 책임은 후속 Provider·인증 서버 연결에 남아 있다. 이번 로컬 검사를 서버 확정본 복구로 대체하지 않는다.

## 검증 결과

| 검증 | 결과 |
|---|---|
| 제품 TypeScript | 통과 |
| 기존 야구 기록 단위·회귀 | 922/922 |
| 영속 큐·전송 차단 브라우저 | 27/27 |
| 커밋 어댑터 회귀 | 15/15 |
| 로컬 작성권 회귀 | 15/15 |
| 선택형 영속 모달·복구 패널, desktop/mobile | 40/40 |
| 기존 복합 모달 R01, desktop/mobile | 2/2 |

최종 합계 1,021건 통과, 실행한 범위에서 실패·제외 0건. 신규 입력 재개 경계 4개 흐름을 desktop/mobile에서 각각 실행한 8건이 추가됐다.

### 주요 신규 검증

- 미적용 복합 기록의 요청 고정·후속 입력 거부.
- 정확한 payload 확인 후에만 전송 가능, 확인 저장 quota 실패 시 차단 유지.
- 구형 복합 기록 자동 승인 금지, 구형 고정 요청의 실제 transport 호출 0회와 ACK 반영 거부.
- 적용된 앞쪽 구간 ACK와 미적용 뒤쪽 원본 보존.
- 새 큐 인스턴스·새로고침 이후 차단 상태 보존.
- 명시적 복구 후 사건 1건·undo 이력 1건, 같은 원본을 그대로 사용.
- 화면 적용 후 확인 저장만 실패한 경우 중복 적용 없이 복구.
- 복구 시 상태 충돌·권한 회수 재확인과 원본 유지.
- 이전에 적용 확인된 미전송 체크포인트의 새로고침 후 명시적 화면 복원.
- 새로고침 직후 신규 입력 차단, 최신 기록 복구 후 이전 사건을 보존한 연속 입력 재개.
- 새로고침 없이 정상 연속 입력 시 순번 1·2와 사건 연결 유지.
- 두 기록 중 첫 기록만 복구하면 신규 입력 차단, 둘째 기록까지 복구한 뒤 셋째 플레이 접수.
- quota 실패로 메모리에 남은 투영이 있어도 다른 최신 기록을 건너뛴 재시도 차단.

### 후속 검증 과정에서 보완한 항목

1. 연속 단타 하네스의 기존 주자 진루가 빠진 것을 실행 전에 발견했다. 승인 후 선행 주자를 먼저 한 베이스씩 진루시킨 다음 타자주자를 1루로 보내도록 보완했다. 복수 이동 행의 원인 선택자도 타자주자 행으로 한정했다.
2. 제품 타입 검사에서 신규 큐 변수 `latest`와 기존 경기 상태 변수의 이름 충돌이 발견됐다. 승인 후 신규 변수만 `latestInput`으로 변경했다.
3. 수정 후 타입 검사, 기존 기록 회귀, 큐·어댑터·작성권, 영속 모달 전체, 기존 모달 R01을 재실행했다. 최종 실패·제외는 0건이다.

### 최종 실행 증거

- `outputs/durable-scoring-queue-browser/2026-09-22T07-19-53.938Z/summary.json`
- `outputs/durable-commit-adapter-browser/2026-09-22T07-19-54.828Z/summary.json`
- `outputs/durable-scoring-writer-browser/2026-09-22T07-19-55.746Z/summary.json`
- `outputs/durable-composite-modal-browser/2026-09-22T07-19-56.476Z/summary.json`
- `outputs/durable-composite-modal-browser/2026-09-22T07-19-56.476Z/scoring-regression.log`
- `outputs/scoring-e2e/2026-09-22T07-20-21-059Z/report.md`

### 이전 단계 실행 증거

- `outputs/durable-scoring-queue-browser/2026-09-22T07-10-49.232Z/summary.json`
- `outputs/durable-commit-adapter-browser/2026-09-22T07-10-50.046Z/summary.json`
- `outputs/durable-scoring-writer-browser/2026-09-22T07-10-50.822Z/summary.json`
- `outputs/durable-composite-modal-browser/2026-09-22T07-10-51.474Z/summary.json`
- `outputs/scoring-e2e/2026-09-22T07-11-09-113Z/report.md`
- `outputs/durable-composite-modal-browser/2026-09-22T07-10-51.474Z/scoring-regression.log`

```sh
npm run typecheck
npm run test:scoring
node scripts/test-durable-scoring-queue-browser.mjs
node scripts/test-durable-commit-adapter-browser.mjs
node scripts/test-durable-scoring-writer-browser.mjs
node scripts/test-durable-composite-modal-browser.mjs
AUBL_PLAYWRIGHT_MODULE="$PWD/services/uniqueplay-sync-worker/node_modules/playwright/index.mjs" node scripts/test-scoring-e2e.mjs --scenario=R01
```

## 미완료·다음 순서

1. 교체·이닝 전환·과거 정정 등 복잡한 복구 회귀 확대. 현재 복구 패널 시험은 단타 및 연속 단타를 중심으로 한다.
2. 인증 서버 세션·epoch, 실제 블록 업로드·ACK 및 전송 중 권한 회수 연결.
3. 서버 확정 revision을 기반으로 실제 Provider를 복구·신규 writer와 단일 경로 연결. 운영 writer 자동 복귀·이중 쓰기 금지.
4. 접수 전 초안 자체의 영속 보관, 모든 기록 액션 통합, 동일 revision 관전자 조회, 최종 ACK·봉인 후 공식 전환.

## 검증 한계

실제 IndexedDB·Web Locks·Chrome을 사용했지만 인증은 격리 하네스의 가짜 계정이며 transport는 스텁이다. 외부 요청을 차단했고 운영 데이터는 쓰지 않았다. CSS를 제외한 DOM 흐름 검증이므로 반응형 디자인·실제 모바일 기기·물리 디스크 장애 시험은 아니다. 로컬 차단은 이미 시작한 서버 커밋을 취소하는 기능이 아니며 서버 측 세션·epoch·revision 검증을 대신하지 않는다.

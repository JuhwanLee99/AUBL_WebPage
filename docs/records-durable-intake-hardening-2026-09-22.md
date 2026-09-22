# 기록 모달: 입력 ID 멱등성과 영속 접수 보강

작성일: 2026-09-22

후속 단계: [미적용 기록의 전송 차단과 명시적 복구](records-durable-recovery-hardening-2026-09-22.md). 이 문서의 992건 결과는 이전 단계의 실행 증거로 보존한다.

## 판정과 범위

`BLOCKED_BEFORE_LOGIN_BACKEND` 유지. 큐의 중복 접수 방지와 실제 복합 모달의 선택형 영속 접수 인터페이스를 구현했다. 운영 Provider는 이 인터페이스를 아직 사용하지 않는다. 운영 저장 경로 전환, 인증 서버 연결, 배포 및 운영 데이터 변경은 수행하지 않았다.

이 문서는 [로컬 작성권 보강](records-durable-writer-hardening-2026-09-22.md)의 다음 단계다. 기존의 배열 길이 기반 변경 감지, ACK 이후 최신 길이 반영, core/feed/events 분리 저장 문제를 이번 작업으로 해결했다고 판정하지 않는다.

## 구현 파일과 역할

| 파일 | 변경 |
|---|---|
| `src/shared/lib/durableScoringQueue.ts` | 입력 ID별 원래 순번·SHA-256 영수증, ACK 이후 재접수 방지, 구형 대기 입력의 영수증 보완 |
| `src/shared/lib/durableScoringWriter.ts` | 접수 컨트롤러가 전체 scope 일치를 확인할 수 있는 `assertScope` |
| `src/shared/lib/durableCompositeIntake.ts` | 실제 reducer 투영 결과를 먼저 영속 저장한 뒤 상태 비교·권한 확인·화면 적용 |
| `src/features/scorekeeper/components/CompositePlayButton.tsx` | 선택형 `onDurableApply`, 저장 중 편집·닫기 차단, 실패 시 초안 유지 |
| `scripts/test-durable-scoring-queue-browser.mjs` | 중복 ID·구형 큐·ACK·교차 탭 재시도 회귀 확장 |
| `scripts/e2e/scoring/durable-store.jsx`, `durable-app.jsx` | 운영 Provider 대신 실제 reducer를 연결하는 격리 하네스 |
| `scripts/test-durable-composite-modal-browser.mjs` | 실제 Chrome/IndexedDB/Web Locks를 사용하는 모달 접수 시험 |

## 입력 ID 계약

1. 같은 scope, 같은 input ID, 같은 직렬화 payload는 처음 접수한 순번을 반환한다.
2. 같은 ID의 다른 payload는 `input-id-conflict`로 거부한다. 원본을 덮어쓰지 않는다.
3. ACK로 원본 전송 payload를 제거해도 ID·순번·해시 영수증은 남긴다. ACK 이후 재시도가 새 사건이 되지 않는다.
4. 입력 행과 영수증은 하나의 엄격한 IndexedDB 트랜잭션에서 저장한다. 저장 실패 시 순번과 영수증도 롤백한다.
5. 입력 해시는 트랜잭션 밖에서 계산한다. 트랜잭션 도중 비동기 해시 계산으로 DB 트랜잭션이 종료되는 구조를 피한다.
6. `__proto__` 같은 이름도 일반 입력 ID로 취급하고 객체 프로토타입과 충돌하지 않게 처리한다.

ACK 영수증만으로 입력 중복을 막는 방안은 미전송·전송 대기 구간의 중복을 막지 못한다. 메모리 캐시만 사용하는 방안은 탭 종료 후 증거가 사라진다. 따라서 접수 단계에서 영속 영수증을 만들고 ACK 이후에도 유지하는 방식을 선택했다.

### 구형 큐 호환성

- 남아 있는 구형 입력은 payload를 해시해 영수증을 보완한다. 해시 계산 중 순번·ACK 위치가 달라지면 다시 캡처한다.
- 구형 큐에 같은 ID가 여러 번 들어 있으면 임의로 합치지 않는다. `legacy-input-id-conflict`로 거부하고 원본을 모두 보존한다.
- 구형 큐의 ACK도 영수증 보완 후 payload를 삭제한다.
- 이번 변경 이전에 이미 ACK되어 삭제된 입력의 ID는 복원할 수 없다. 존재하지 않는 과거 영수증을 만들어 중복 방지를 보장하지 않는다.
- 영수증은 현재 경기 scope 메타데이터에 누적된다. 긴 경기의 성능·보존 기간·보관 처리 정책은 후속 검증 대상이다.

## 모달 접수 흐름

`초안 검토 → 현재 권한·경기 확인 → 실제 reducer 투영 → 입력·전후 체크포인트 영속 저장 → 최신 상태·권한 재확인 → 동기적 비교·적용 → 모달 닫기`

`DurableCompositeIntake`는 실제 reducer를 `project`로 주입받는다. 야구 규칙을 별도로 구현하지 않는다. 투영 결과에 해당 복합 사건이 정확히 한 건 있어야 저장을 진행한다. 저장 payload에는 입력, 전체 scope, 상태·사건·문자중계가 포함된 전후 체크포인트를 함께 넣는다. 중첩 증가하는 undo/redo 이력은 체크포인트에서 제외한다.

같은 접수 시도를 재실행할 때는 처음 만든 투영과 직렬화 payload를 재사용한다. reducer가 재실행될 때 생성하는 시간·보조 식별자 차이로 동일 입력이 다른 payload가 되는 것을 방지한다.

저장 중에는 동기 ref와 UI busy 상태로 중복 클릭을 차단한다. 모달의 8초 화면 적용 타이머는 영속 저장 대기 자체를 접수 실패로 오인해 편집을 다시 열지 않는다. 저장 완료와 서버 ACK를 같은 상태로 표시하지 않는다.

### 실패 처리

| 실패 시점 | 처리 |
|---|---|
| 권한·경기 확인 또는 reducer 투영 실패 | 저장하지 않고 초안 유지 |
| IndexedDB 접수 실패 | 화면에 적용하지 않고 초안 유지, 같은 ID·payload 재시도 |
| 저장 중 경기 상태 변경 | 저장된 입력 보존, 최신 화면에 과거 투영을 덮어쓰지 않음 |
| 저장 중 권한 회수 | 저장된 입력 보존, 화면 적용 거부 |
| 저장 후 화면 적용 실패 | 원본 payload 유지, 상태가 같은 경우 같은 접수의 재시도 가능 |
| 새로고침 | IndexedDB 입력·체크포인트 보존, 자동 화면 복원은 아직 연결하지 않음 |

접수 전 초안 자체를 새로고침 이후 복원하는 기능은 아직 없다. 실패한 초안을 React 상태에 유지하는 것과 초안을 디스크에 영속 저장하는 것을 구분한다.

## 현재 검증 결과

| 검증 | 결과 |
|---|---|
| 제품 TypeScript 검사 | 통과 |
| 영속 큐 브라우저 회귀 | 20/20 통과 |
| 커밋 어댑터 브라우저 회귀 | 15/15 통과 |
| 로컬 작성권 브라우저 회귀 | 15/15 통과 |
| 기존 야구 기록 단위·회귀 | 922/922 통과 |
| 기존 복합 모달 R01, desktop/mobile | 2/2 통과 |
| 신규 영속 모달 시험, desktop/mobile | 18/18 통과 |

이번 범위의 최종 실행 결과는 992건 통과, 실패·제외 0건이다. 이는 전체 시스템의 운영 진입 조건 충족을 뜻하지 않는다. 제품 타입 검사 통과를 브라우저·서버 통합 검증 통과로 대신하지 않는다.

### 검증 중 발생한 하네스 문제

1. 샌드박스의 localhost listen 차단으로 첫 브라우저 실행이 중단됐다. 승인된 로컬 서버/Chrome 실행으로 큐·어댑터·작성권 시험을 재실행했다.
2. 신규 모달 하네스의 IIFE 번들에 `import.meta.env`가 없어 초기화에 실패했다. 승인 후 빈 로컬 환경값을 주입했다. 운영 환경 파일은 읽지 않았다.
3. 이후 화면은 초기화됐으나 `타격 판정` 라벨의 완전 일치 선택자가 실패했다. 반복 실패 실행을 중단했고, 승인 후 `타격 판정`·`원인` 선택자를 역할·이름 접두사 기준으로 수정했다.
4. 재실행은 16/18 통과였다. 나머지 2건은 메모리 객체의 `undefined` 속성과 JSON 저장 시 생략된 속성을 다른 데이터로 비교한 테스트 오류였다. 승인 후 기대 객체에도 JSON 직렬화 정규화를 적용했으며, 마지막 전체 실행은 18/18 통과했다. 값·사건 ID·문자중계 연결 검증은 그대로 유지했다.

초기화·선택자 오류로 중단한 실행은 완료 실행이나 제외 없는 성공 실행으로 계산하지 않는다. 최종 결과는 아래 마지막 실행 증거를 기준으로 한다.

### 신규 모달 통과 항목

- 영속 저장 후 단일 화면 적용, 사건·타자 안타·주루·연결 중계와 저장 체크포인트 일치.
- 동일 입력 재호출 시 한 번만 적용, 구형 `recordCompositePlay` 중복 호출 0회.
- IndexedDB quota 실패 시 사건 미적용·검토 완료 초안 유지, 같은 ID로 재접수.
- 저장 대기 중 중복 제출·닫기·Escape 차단.
- 저장 대기 중 점수 변경 시 새 화면을 덮어쓰지 않고 디스크 입력 보존.
- 저장 대기 중 권한 회수 시 디스크 입력 보존·화면 적용 거부.
- 디스크 저장 후 적용 실패 시 같은 payload·순번으로 재시도.
- 새로고침 후 미전송 체크포인트 일치. 자동 화면 복원까지 검증한 것은 아님.
- 접수 전 권한 거부 시 큐 미접수, 다른 scope·같은 ID의 변경 내용 거부.

각 9개 흐름을 desktop/mobile viewport에서 실행했다. 실제 CSS 레이아웃과 물리 모바일 기기 검증은 아니다.

### 증거

- `outputs/durable-scoring-queue-browser/2026-09-22T06-56-47.332Z/summary.json`
- `outputs/durable-commit-adapter-browser/2026-09-22T06-56-48.265Z/summary.json`
- `outputs/durable-scoring-writer-browser/2026-09-22T06-56-49.488Z/summary.json`
- `outputs/durable-composite-modal-browser/2026-09-22T07-01-36.864Z/scoring-regression.log`
- `outputs/scoring-e2e/2026-09-22T06-58-31-836Z/report.md`
- 신규 모달 최종 결과: `outputs/durable-composite-modal-browser/2026-09-22T07-01-36.864Z/summary.json`
- JSON 비교 보완 전 16/18 결과: `outputs/durable-composite-modal-browser/2026-09-22T07-00-29.016Z/summary.json`

```sh
npm run typecheck
npm run test:scoring
node scripts/test-durable-scoring-queue-browser.mjs
node scripts/test-durable-commit-adapter-browser.mjs
node scripts/test-durable-scoring-writer-browser.mjs
node scripts/test-durable-composite-modal-browser.mjs
AUBL_PLAYWRIGHT_MODULE="$PWD/services/uniqueplay-sync-worker/node_modules/playwright/index.mjs" node scripts/test-scoring-e2e.mjs --scenario=R01
```

## 아직 남은 운영 연결 조건

1. 새로고침 후 미적용 체크포인트의 검토·복구 UI 및 접수 전 초안 보관 정책.
2. 저장됐지만 상태 충돌·권한 변경으로 화면에 적용되지 않은 입력의 서버 전송 차단·재조정 정책. 이 실험 경로에는 자동 전송이 없으며 무조건 flush와 연결하면 안 된다.
3. 실제 인증·서버 세션·epoch·블록 업로드·ACK와 연결. 테스트 하네스의 가짜 권한 확인을 실제 인증으로 오인하지 않는다.
4. 실제 Provider에서 신규 writer를 선택한 경기만 단일 경로 사용. 구형 writer와 이중 쓰기하거나 실패 시 자동 복귀하지 않는다.
5. 주루 매트릭스·교체·정정·undo/redo 등 다른 기록 액션도 동일한 영속 접수 계약으로 통합.
6. 동일 revision 관전자 조회, 긴 경기 성능, 최종 ACK·봉인 후 공식 전환, 실제 모바일 기기 검증.

신규 하네스는 실제 모달 컴포넌트와 추출한 제품 reducer를 사용하지만 실제 앱 라우트·Provider를 실행하지 않는다. CSS를 제외하므로 모바일 viewport 시험도 반응형 디자인이나 실기기 검증을 대체하지 않는다. 운영 사용 가능 판정은 계속 보류한다.

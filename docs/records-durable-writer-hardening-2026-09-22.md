# 기록 모달 재개: 범위 바인딩과 로컬 작성권 보강

작성일: 2026-09-22

후속 작업: [영속 접수·입력 ID 멱등성 보강](records-durable-intake-hardening-2026-09-22.md). 아래 40건 결과는 첫 단계의 증거로 보존하며, 후속 구현·검증 상태는 별도 문서에서 관리한다.

## 현재 판정

`BLOCKED_BEFORE_LOGIN_BACKEND` 유지. 권장 보강 순서 중 첫 단계인 큐·어댑터 범위 일치와 동일 브라우저의 탭 작성권을 구현·검증했다. 실제 Provider, 모달, 인증 transport, 관전자 조회를 연결한 결과가 아니다.

운영 데이터 쓰기, 운영 로그인, 기능 활성화, 배포, 커밋은 수행하지 않았다. 기존 운영 writer와 기존 기록 함수는 변경·제거하지 않았다.

## 확인한 실제 경로와 우선순위

복합 모달은 `recordCompositePlay` dispatch와 로컬 사건 확인 후 닫힌다. Provider는 `syncGameStateWrite`의 기존 core/feed/events 분리 저장을 사용한다. 배열 길이 기반 변경 판단과 ACK 이후 최신 길이 갱신 문제는 아직 이 실제 경로에 남아 있다.

이 경로를 단순 부분 패치하거나 신규 큐와 이중 쓰기로 전환하지 않는다. 다음 순서로 대체한다.

1. 큐·어댑터 범위 바인딩 및 로컬 작성권: 이번 구현 범위.
2. 입력 ID 멱등성, 구조화된 사건·복구 스냅샷의 영속 접수 및 모달 피드백 통일.
3. 인증된 서버 세션·블록 전송·요청별 ACK·동일 revision 조회 연결.
4. 실제 Provider의 구형 저장 경로 교체와 장애·정정·연속 입력 통합 검증.
5. 최종 ACK와 서버 봉인 후 공식 전환, 남은 규칙·정정·교체 책임 구현.

## 구현

### 범위 계약

`src/shared/lib/scoringScope.ts`에 환경·프로젝트·UID·경기·테스트 실행·작성 세션·epoch를 포함하는 공통 범위 키를 정의했다. 큐는 생성 시 계산한 키를 보관하고 `assertScope`로 비교한다.

`DurableScoringCommitAdapter` 생성자는 큐의 전체 범위가 일치하지 않으면 요청 고정·전송·ACK 적용 전에 거부한다. scope 객체를 나중에 변경해도 이미 생성한 큐·어댑터의 범위는 바뀌지 않는다.

### 로컬 작성 컨트롤러

`src/shared/lib/durableScoringWriter.ts`의 `DurableScoringWriter.acquire`는 Web Locks를 사용한다.

- 잠금 키: 환경·프로젝트·경기·테스트 실행. UID·세션·epoch를 바꾸어 같은 경기 잠금을 우회할 수 없다.
- 이미 사용 중이면 대기하거나 강제로 빼앗지 않고 `null`을 반환한다. 후속 UI는 이를 읽기 전용으로 표시해야 한다.
- 잠금 획득 후 큐를 열고 복구를 확인하며, 범위가 일치하는 어댑터만 생성한다.
- 지원하지 않는 브라우저는 `writer-lock-api-unavailable`로 거부한다. 메모리 저장 또는 구형 writer로 자동 복귀하지 않는다.
- `enqueue`, `prepare`, `flush`, `recover`를 컨트롤러를 통해 실행한다.
- `close` 시작 후 새 작업은 거부하고, 이미 접수한 저장·전송·ACK 작업이 끝난 뒤 DB 연결과 잠금을 해제한다.
- 탭 종료 시 브라우저가 잠금을 해제하되 IndexedDB 입력은 삭제하지 않는다.
- 새 epoch의 큐는 기존 세션 입력을 자동 소비하지 않는다. 기존 큐는 검토·복구 대상으로 보존한다.

### 보장하지 않는 것

Web Locks는 같은 origin·같은 브라우저 프로필에서만 유효하다. 다른 기기·다른 프로필의 작성권은 서버 `writerSessionId/lockEpoch` 검증이 담당해야 한다. 이 클래스는 서버 세션 발급이나 인계 권한을 부여하지 않는다.

현재 컨트롤러는 `TEST_RUN_` 범위를 요구하는 신규 시험 경로다. 기존 저수준 큐·어댑터 및 운영 Provider를 모두 이 잠금으로 강제한 것은 아니다. 실제 앱 연결 시 저수준 직접 쓰기를 우회 경로로 남기지 않아야 한다.

무응답 전송을 임의 취소하거나 잠금을 강제로 빼앗지 않는다. 실제 transport 연결 때에는 타임아웃·불명 결과 재조회·서버 인계 계약을 함께 구현해야 한다. 입력 ID 중복 접수 방지와 모달 초안의 영속 저장도 아직 미완료다.

## 이번 검증 결과

| 검증 | 결과 |
|---|---|
| 제품 TypeScript 검사 | 통과 |
| IndexedDB 큐 기존 회귀 | 10/10 통과 |
| 커밋 어댑터 회귀·범위 보강 | 15/15 통과 |
| 신규 작성권 브라우저 시험 | 15/15 통과 |

총 40건 통과, 실패·제외 0건. 실제 Chrome headless, 일회성 browser context, 실제 IndexedDB·Web Locks·Web Crypto를 사용했다. transport는 스텁이며 외부 네트워크 요청을 차단했다. 서버·규칙 에뮬레이터 및 전체 야구 기록 회귀를 이번에 재실행한 것은 아니다.

### 핵심 통과 항목

- ACK 대기 중 추가 입력과 같은 길이 정정 보존, 잘못된 ACK 거부.
- 저장 공간 오류·ACK 저장 오류에서 부분 성공 없이 큐 보존.
- 응답 유실 후 같은 요청 재전송, 새 어댑터의 고정 요청 복원.
- 환경·프로젝트·UID·경기·테스트 실행·세션·epoch 7개 범위의 교차 연결 거부.
- 같은 세션, 다른 세션, 다른 UID, 다른 epoch의 두 번째 탭 거부.
- 다른 경기·다른 테스트 실행은 독립 접수 허용.
- 명시적 해제·탭 종료 후 복구, 종료된 컨트롤러의 추가 입력 거부.
- 초기화 실패 후 잠금 정리, 잠금 API 미지원 시 접수 거부.
- ACK 처리 중 다른 탭 인계 거부, ACK 완료 뒤 재획득.
- 새 epoch로 전환한 뒤 이전 세션의 미전송 입력 보존.

기존 큐의 `two_tabs_atomic_sequence_allocation` 시험은 저수준 IndexedDB 순번 원자성을 확인한다. 실제 작성 경로의 복수 탭 허용 정책을 뜻하지 않는다. 신규 컨트롤러 시험은 그 위에서 단일 탭 작성을 강제한다.

### 실행 명령과 증거

```sh
npm run typecheck
node scripts/test-durable-scoring-queue-browser.mjs
node scripts/test-durable-commit-adapter-browser.mjs
node scripts/test-durable-scoring-writer-browser.mjs
```

- `outputs/durable-scoring-queue-browser/2026-09-22T06-42-25.909Z/summary.json`
- `outputs/durable-commit-adapter-browser/2026-09-22T06-42-26.861Z/summary.json`
- `outputs/durable-scoring-writer-browser/2026-09-22T06-42-27.820Z/summary.json`

## 다음 단계의 완료 기준

같은 input ID 재시도는 기존 접수 순번을 반환하고, 같은 ID의 다른 내용은 거부해야 한다. 모달의 사건·상태·중계·재생 정보를 함께 영속 저장한 뒤에만 접수 완료로 표시한다. 거절·저장 실패 시 초안은 유지한다. 해당 흐름을 실제 모달 하네스와 새 컨트롤러로 검증한 다음 인증 서버 연결로 넘어간다.

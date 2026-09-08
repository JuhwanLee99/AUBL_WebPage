# 실제 Store Provider 기록 원천 전환 검증

## 목적과 안전 범위

자체 기록은 실시간 참고용이고, 유니크플레이 공식 전환 후에는 관리자 비교 화면에서만 조회한다. 이번 검증은 실제 `DemoStoreProvider`, reducer, 액션, 구독, 정규화와 Firestore SDK·Rules를 실행한다. 인증 전송과 공식 전환 경계 생성은 테스트 대역이며, 실제 로그인·배포 callable·NAS 연결 검증을 대체하지 않는다.

- 운영 DB 접근 및 배포 없음.
- `demo-aubl-scoring`의 로컬 Firestore 에뮬레이터만 허용.
- 모든 경기 데이터는 `LOCAL_TEST_STORE_*`이며 종료 시 하위 기록까지 삭제.
- 외부 브라우저 요청 차단, 실행별 JSON·화면·Playwright trace 보관.
- 읽기·쓰기 ACK 지연은 실제 SDK 응답의 전달 시점만 조절하고 응답 내용은 대체하지 않음.

## 수정 전 결과와 원인

수정 전 PC·모바일 28건 중 10건 통과, 18건 실패. 이 중 익명 사용자에게 점수 수정·되돌리기 이력 생성을 요구한 2건은 테스트 사전조건 오류다. 원본 결과는 `outputs/record-source-store-e2e/2026-09-08T07-25-33-204Z/`에 보존했다.

| 문제 | 재현 | 수정 내용 |
| --- | --- | --- |
| 지연된 경기 선택 응답 | A 응답을 보류하고 B 선택 후 A 응답 전달 | 요청 번호·활성 경기·공개 세션을 비동기 단계마다 확인 |
| 공식 전환 후 기록 복원 | core/feed 응답 보류, 공식 전환 후 전달 | 공식/미확인 세션에서는 초기 직접 조회 금지, 지연 응답 폐기 |
| 관리자의 공유 Store 우회 조회 | 이미 공식 전환된 경기를 직접 선택 | 관리자도 공유 Store에서 자체 기록을 읽지 않음 |
| 기록원 소유권 복원 | 소유권 저장 성공 ACK 보류 후 공식 전환 | 소유권 요청 취소 함수와 세션 확인, 지연 ACK 폐기 |
| 라인업 잔존 | 원천 상태와 일정 snapshot의 도착 순서 차이, 재접속 | 렌더 단계의 공개 Store 값에서 기록·라인업·이력을 제거 |
| 일정의 오래된 응답 | 공식 snapshot 이후 전환 전 일정 조회 완료 | 이미 확인한 공식 원천을 과거 일정으로 되돌리지 않음 |
| 익명 테스트 사전조건 | 익명 사용자에게 기록 수정 이력 생성 요구 | 되돌리기/다시하기 검증은 관리자에서만 수행 |

## 설계 결정

1. 경기 ID와 공개 허용 상태가 달라질 때 접근 세션 객체를 교체한다. 따라서 A → B → A 또는 live → blocked → live에서도 과거 요청은 새 세션을 획득하지 못한다.
2. 처음 선택한 경기의 원천이 아직 확인되지 않았다면 직접 읽지 않고, 원천 확인 후 기존 구독 경로로 로드한다. 같은 경기 새로고침은 요청 번호와 접근 세션을 유지하는 동안만 반영한다.
3. 공식/미확인 상태에서는 Context 공개값을 렌더 단계에서 비운다. 내부 정규화가 일정에서 라인업을 복원하더라도 화면에 노출하지 않는다. 관리자 라인업 자동 복원도 같은 공개 조건을 따른다.
4. 공유 Store가 차단될 때 core·feed·events·라인업·벤치·제외 선수·undo/redo 이력과 활성 경기 일정의 자체 기록을 공개값에서 제거한다. 관리자 원본 비교는 별도 보관소 조회 경로를 사용한다.
5. Firestore Rules의 쓰기 차단은 계속 최종 방어선이다. 클라이언트 취소가 이미 서버에 전달된 쓰기를 되돌리지는 않는다. Atomic ACK 전체 통합 검증은 별도 과제다.
6. 기존 함수는 삭제하지 않는다. 기존 액션 API와 정상적인 실시간 기록 경로를 유지하면서 접근 확인과 취소 처리를 보강한다.

## 검증 목록

- 단위 테스트 11건: 정상/미확인/다른 경기/빈 경기 접근, 경기 이동·왕복·공식 전환·재접속 시 토큰 만료, 동일 세션 유지, 공개 상태 초기화, 일정의 자체 기록 제거.
- 실제 Provider E2E 14종 × PC·모바일 = 28건.
- E2E 항목: 실시간 로드, 익명/관리자 공식 전환, 관리자 공식 경기 직접 선택, core/feed 지연 응답의 경기 전환 및 공식 전환, 소유권 ACK 지연, 예약 저장 취소, 소유권 heartbeat 취소, 오프라인 신규 경기, 재접속 중 공식 전환, 화면 종료 후 구독 취소.
- 별도 실행: TypeScript 타입 검사, 기존 기록 단위 테스트, 원천 정책 단위 테스트.
- 아래 실행 이력은 E2E 러너가 실제 결과로 추가한다. 실행 전에는 통과로 간주하지 않는다.

## 실행 명령

```sh
npm run typecheck
node --experimental-strip-types --test scripts/test-record-source-live-access.mjs scripts/test-record-source-policy.mjs
npm run test:scoring
npm run test:record-sources:store
```

## 남은 검증 경계

실제 Firebase 로그인/토큰 교체, 배포된 HTTPS callable, NAS 동기화, 전체 Atomic 저장 ACK 경합, 기존 HTTP/1 장애 프록시의 HTTP/2 대응은 이번 결과에 포함하지 않는다. 공식 전환과 서버 저장 사이의 배포 환경 동작은 별도 검증 후 운영 승인해야 한다.

## Static and unit run

- Typecheck exit: 0
- Source/access unit exit: 0
- Existing scoring unit exit: 0
- Logs: `/tmp/aubl-store-typecheck.log`, `/tmp/aubl-store-units.log`, `/tmp/aubl-store-scoring-regression.log`

## E2E run: 2026-09-08T08:53:40.092Z

- Passed: 28/28
- Failed: 0
- Unexpected external requests: 0
- Production access: false
- Artifacts: [report](../outputs/record-source-store-e2e/2026-09-08T08-53-00-950Z/report.md), [details](../outputs/record-source-store-e2e/2026-09-08T08-53-00-950Z/results.json)
- Only LOCAL_TEST_STORE fixtures, local role and owned local current pointer deleted; no production data or deployment.

## E2E run: 2026-09-08T10:57:02.726Z

- Passed: 28/28
- Failed: 0
- Unexpected external requests: 0
- Production access: false
- Artifacts: [report](../outputs/record-source-store-e2e/2026-09-08T10-56-24-509Z/report.md), [details](../outputs/record-source-store-e2e/2026-09-08T10-56-24-509Z/results.json)
- Only LOCAL_TEST_STORE fixtures, local role and owned local current pointer deleted; no production data or deployment.

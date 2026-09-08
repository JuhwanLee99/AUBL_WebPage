# 로그인·백엔드 연동 전 최종 점검

점검일: 2026-09-08

## 판정

**운영 로그인·백엔드 연결 승인 보류. `BLOCKED_BEFORE_LOGIN_BACKEND` 유지.**

이번에 실행한 회귀 대상은 통과했다. 그러나 운영 저장 경로는 검증된 신규 원자적 저장 어댑터와 아직 다르며, 실제 통신 장애 2건은 제외 상태다. 기존 자동 테스트의 성공을 운영 저장·실제 인증·전체 야구 규칙의 보증으로 확대할 수 없다.

이번 작업은 코드 점검, 로컬·에뮬레이터 검증과 문서화다. 제품 코드나 운영 데이터는 수정하지 않았다. 로그인, 배포, 운영 환경변수 조회·변경, 공식 전환 플래그 활성화도 하지 않았다.

## 연동 전 차단 항목

### PRE-01 · P1 · Firestore만 전환되는 테스트 환경

공용 초기화는 환경변수의 프로젝트로 Firebase 앱을 만들고 `getAuth(app)`를 호출한다. `VITE_USE_FIRESTORE_EMULATOR`는 Firestore에만 적용된다. `src` 검색에서 `connectAuthEmulator`와 `connectFunctionsEmulator` 연결은 확인되지 않았다. 따라서 운영 프로젝트 설정에서 Firestore 옵션만 켜고 실제 로그인 화면을 실행하면 인증까지 격리된다고 보장할 수 없다.

근거: [Firebase 프로젝트·인증 초기화](/Users/juhwan/Documents/Dev/AUBL/main/src/core/firebase/client.ts:16), [Firestore 전용 전환](/Users/juhwan/Documents/Dev/AUBL/main/src/core/firebase/client.ts:44).

완료 조건: Auth·Firestore·Functions·외부 API 각각의 테스트 대상을 명시하고, 테스트 모드에서는 운영 프로젝트 ID·도메인을 거부한다. 에뮬레이터 연결 실패를 무시한 채 계속 실행하지 않는다. 그다음 실제 앱 라우트를 격리 환경에서 검증한다. 이번 E2E는 공용 초기화를 대역으로 대체하므로 안전하지만, 실제 로그인 경로의 격리를 입증한 것은 아니다.

### PRE-02 · P1 · 실제 저장은 분리 저장·길이 기반 동기화

실제 effect는 `matchStates` 코어를 `setDoc`으로 먼저 저장하고, 이후 feed/events를 별도 batch로 저장한다. 사건과 중계의 변경 여부는 배열 길이 차이로 판단한다. 길이가 같은 정정은 별도 저장을 건너뛸 수 있고, 코어만 성공한 상태에서 후속 쓰기가 실패하면 세 원본이 서로 달라질 수 있다.

근거: [코어 저장](/Users/juhwan/Documents/Dev/AUBL/main/src/shared/state/demoStore.effects.ts:637), [길이 비교와 조기 반환](/Users/juhwan/Documents/Dev/AUBL/main/src/shared/state/demoStore.effects.ts:643), [별도 batch 저장](/Users/juhwan/Documents/Dev/AUBL/main/src/shared/state/demoStore.effects.ts:713).

신규 `atomicScoringFirestore`와 `AtomicScoringStatus`는 존재하지만, 현재 이 운영 writer를 대체하지 않는다. 기존 E2E의 `SAVE-same-length`, `SAVE-response-lost` 통과는 격리된 outbox·전송 대역 경로의 결과이며 운영 writer의 문제 해결 증거가 아니다.

완료 조건: 실제 Provider와 관전자 조회까지 동일 revision의 상태·사건·중계를 연결하고, 사건 ID 기반 멱등 처리·영속 outbox·서버 ACK·충돌 표시를 적용한다. 임의로 기존 운영 경기를 신규 스트림으로 이관하지 않는다.

### PRE-03 · P1 · 저장 대기 중 다음 입력의 완료 기준 혼동

batch를 만든 시점의 입력과 완료 시점의 입력이 같다는 보장이 없다. `await batch.commit()` 이후 저장 완료 길이를 해당 batch의 스냅샷이 아니라 최신 `stateRef.current`에서 가져온다. 커밋 대기 중 다음 사건이 들어오면, 실제 전송하지 않은 사건까지 완료 길이에 포함하여 다음 동기화에서 누락시키는 실행 순서가 가능하다.

근거: [batch 완료 후 최신 상태를 기준으로 길이 갱신](/Users/juhwan/Documents/Dev/AUBL/main/src/shared/state/demoStore.effects.ts:713).

이 항목은 **이번 코드 점검에서 확인한 정적 경합 위험**이다. 이번 실행에서 이 순서의 새 재현 테스트를 추가하거나 운영 유실을 관측한 것은 아니다. 기존 Store E2E의 소유권 ACK 지연·전환 후 타이머 취소와도 다른 경계다.

완료 조건: 커밋한 요청의 불변 스냅샷·사건 ID·revision만 ACK 처리하고 뒤에 들어온 입력은 다음 큐에 유지한다. 실제 Provider에서 커밋 응답 보류 → 다음 플레이 입력 → 첫 ACK 전달 → 후속 저장·재조회 순서를 검증한다. 요청 전송 후 실패·재시도·undo도 같은 기준을 사용한다.

### PRE-04 · P1 · 공식 전환의 15초 대기는 최종 저장 증명이 아님

공식 전환 함수는 경기 종료와 코어 `updatedAt` 기준 15초 경과를 확인한다. 그러나 자체 기록의 마지막 사건·중계까지 확정된 revision 또는 receipt를 요구하지 않는다. PRE-02처럼 코어가 먼저 저장되고 feed/events가 지연·실패하면 시간이 지났다는 이유만으로 불완전한 원본이 보관·잠금될 수 있다.

근거: [promote_record_source의 전환 전제 검사](/Users/juhwan/Documents/Dev/AUBL/main/functions/record_sources.py), [공식 전환 후 원본 쓰기 차단](/Users/juhwan/Documents/Dev/AUBL/main/firestore.rules:326).

완료 조건: 마지막 자체 커밋 영수증과 종료 revision을 서버에서 결합해 확인하고, 미확정 입력·충돌·재시도 필요 상태에서는 전환하지 않는다. 현재 읽기 전용 보관 정책을 약화해 나중에 원본을 덮어쓰는 방식으로 해결하지 않는다.

### PRE-05 · P1 · 실제 장애 복구 및 외부 연계 검증 공백

에뮬레이터 러너는 `actual all RPC outage`, `actual commit RPC outage`를 필터로 제외한다. 기존 HTTP/1 장애 프록시가 실제 Node gRPC 전송을 관측하지 못한 문제가 해결된 것은 아니다. 이번 결과의 기존 Rules 23건 통과에 이 두 사례를 포함하지 않는다. TAP에는 제외된 항목이 `skipped`로 집계되지 않으므로 별도 제외 목록도 함께 봐야 한다.

근거: [선택 실행·제외 설정](/Users/juhwan/Documents/Dev/AUBL/main/scripts/test-record-source-emulator.mjs), [실제 RPC 장애 테스트 정의](/Users/juhwan/Documents/Dev/AUBL/main/scripts/test-scoring-firestore.mjs:126), [기존 실패 근거](/Users/juhwan/Documents/Dev/AUBL/main/docs/records-atomic-revalidation-2026-09-08.md).

실제 Firebase 인증·토큰 교체, 배포 HTTP callable, NAS Admin SDK 프로젝션과 공식 통계 원천 분리도 이번 검증에 포함되지 않는다. Firestore Rules 통과만으로 Admin SDK를 사용하는 별도 서버의 공개 필드 정책을 보장하지 않는다.

완료 조건: 실제 전송을 관측·차단하는 하네스로 큐 유지, 서버 불변, 같은 요청 ID의 단일 복구 커밋을 확인한다. 이후 격리된 전체 라우트에서 인증·권한 회수·저장·재접속·공식 전환 및 NAS 공개 원천을 검증한다.

## 이번 최종 재실행 결과

| 계층 | 결과 | 범위 |
| --- | --- | --- |
| 제품 타입 검사 | 통과 | TypeScript |
| 기록 단위 | 922/922 | 엔진·집계·계약·원장·재심 |
| 원천·접근 단위 | 48/48 | 출처 정책 37 + 접근 세션 11 |
| 규칙 준비도 | 220/220 | 엔진 74 + 실제 모달 146 |
| 기본 모달 E2E | 164/164 | PC·모바일, 저장 대역 포함 |
| 수비 귀속 E2E | 36/36 | 캡처·집계·재조회·권한 |
| 무결성 UI E2E | 32/32 | 원본 유지·진단·상세 권한 |
| 관리자·원천 E2E | 34/34 | 비교·이슈 저장·공식 경계 |
| 실제 Store Provider E2E | 28/28 | 전환·지연 응답·소유권·재접속 |
| 기존 저장·권한 Rules | 23/23 | 실제 RPC 장애 2건 별도 제외 |
| 원천·보관 Rules | 83/83 | 공개·비공개·변경 불가 이력 |
| Python 정책·트랜잭션 | 12/12 | 순수 정책 3 + 에뮬레이터 트랜잭션 9 |
| 공식 화면·변환 회귀 | 15/15 | Node 테스트, 실제 브라우저 실행 아님 |

실제 브라우저 실행은 **440회**다: 기본 모달 164 + 준비도 146 + 수비 36 + 무결성 32 + 원천 34 + Store 28. 220건 준비도에서 엔진 74건을 다시 브라우저 수에 더하지 않는다. 공식 화면 Node 15건도 브라우저 수에 포함하지 않는다. 반복 viewport와 입력 조합을 서로 다른 야구 규칙 수로 해석하지 않는다.

이번 실행에서 새로운 제품 테스트 실패는 없었다. 통과와 별개로 위 차단 항목은 유지된다. 결과를 취합하는 보조 스크립트에서는 `E2E` 산출물 경로의 숫자를 인식하지 못하는 정규식 오류가 발생했다. 이는 완료된 제품 테스트의 실패가 아니며, 수정 승인과 산출물 생성은 별도로 처리한다.

## 야구 규칙 지원 범위의 해석

포스·타임 플레이, 인필드플라이, 복수 주루·실책, 낫아웃·WP/PB, 도루자·CS/E/A, DP/TP, 미완성 GDP, 수비 귀속, 재심 초안의 선택된 사례는 기존 기대값을 유지하며 통과했다. 관리자 재심 연결과 수비 하네스 캐시 분리는 더 이상 미완료 과제로 취급하지 않는다.

다음은 완전 지원 또는 전수 검증을 승인한 범위가 아니다.

- 과거 어필·기록 정정 이후 후속 사건 전체 재생·승인·롤백.
- 타순 착오, 타석 중 투타 교체 책임, DH·출전 구간의 통합 의미론.
- 끝내기·중단·서스펜디드·몰수·승부치기 및 대회별 규칙 프로필.
- 무실책 가상 이닝을 이용한 자책 확정과 투수 교체 책임 재구성.
- 실제 과거 20경기와 문자중계 500건 전체 회귀, 실제 모바일 기기·실제 인증 환경.

자체 기록이 실시간 참고용이고 UniquePlay가 최종 공식 원천이라는 정책은 유지한다. 이 정책은 잘못된 확정값이나 자체 원본 유실을 허용한다는 뜻은 아니다. 판단 의존·미검증 상황은 미확정 상태와 관리자 근거를 보존해야 한다. 이번 점검에서는 KBO 최신 전체 규칙집을 다시 전수 대조하지 않았다.

## 안전 경계와 다음 순서

- Firestore는 loopback의 `demo-aubl-scoring` 에뮬레이터만 사용했다. 테스트 fixture 정리와 에뮬레이터 종료를 마쳤다. 운영 자료 삭제는 하지 않았다.
- 인증·공식 API·callable 전송은 테스트 대역이다. 실제 Store 테스트의 전환 경계 생성과 실제 Python 전환 트랜잭션 테스트도 서로 다른 검증 층이다.
- 코드에서 공식 전환과 자동 전환 플래그의 기본 비활성을 확인했다. 실제 배포 환경의 설정값은 조회하지 않았으므로 현재 운영 설정이 비활성이라고 단정하지 않는다.
- 전체 운영 빌드·배포, 실제 로그인, 운영 저장 실험은 이번 작업에 포함하지 않았다.

1. Auth·Firestore·Functions·API의 실패 시 차단되는 격리 환경부터 마련한다.
2. 실제 Provider·관전자 경로를 원자적 계약·outbox·ACK에 연결하고 PRE-02/PRE-03을 재현·회귀 검증한다.
3. 실제 RPC 장애 2건과 마지막 ACK·공식 전환 경합을 검증한다.
4. 그 후 격리된 실제 라우트에서 로그인·토큰 갱신·권한 회수·저장·재조회·NAS 연계를 검증한다.
5. 운영 접근은 별도 승인한다. 필요할 경우 전용 테스트 경기 표시, 생성 ID 추적, 정리와 공개 노출 차단 계획을 먼저 확정한다.

## 실행 근거

- [최종 에뮬레이터 작업 요약](/Users/juhwan/Documents/Dev/AUBL/main/outputs/record-source-validation/2026-09-08T10-55-19-343Z/summary.json)
- [기본 모달 E2E](/Users/juhwan/Documents/Dev/AUBL/main/outputs/scoring-e2e/2026-09-08T10-57-03-163Z/report.md)
- [규칙 준비도](/Users/juhwan/Documents/Dev/AUBL/main/outputs/modal-readiness/2026-09-08T10-55-50-996Z/results.json)
- [수비 귀속](/Users/juhwan/Documents/Dev/AUBL/main/outputs/defensive-fielding/2026-09-08T10-58-03-290Z/summary.json)
- [관리자·원천 E2E](/Users/juhwan/Documents/Dev/AUBL/main/outputs/record-source-e2e/2026-09-08T10-55-22-955Z/results.json)
- [실제 Store E2E](/Users/juhwan/Documents/Dev/AUBL/main/outputs/record-source-store-e2e/2026-09-08T10-56-24-509Z/results.json)
- [타입 검사 로그](/tmp/aubl-preintegration-typecheck.log)
- [기록 단위 로그](/tmp/aubl-preintegration-unit.log)
- [원천·접근 단위 로그](/tmp/aubl-preintegration-source-policy.log)


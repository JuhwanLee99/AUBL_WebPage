# 야구 기록 시스템 후속 작업 인수인계

작성일: 2026-09-12  
기준: 이 작업 대화에서 확인한 2026-09-08 구현·검증·커밋 결과  
작업 경로: `/Users/juhwan/Documents/Dev/AUBL/main`

## 1. 먼저 알아야 할 현재 상태

2026-09-22 후속 업데이트: 큐·어댑터 범위 일치 검사와 Web Locks 기반 신규 로컬 작성 컨트롤러를 추가했다. 타입 검사와 브라우저 시험 40건이 통과했다. 아래 9월 12일 목록 중 이 두 기반 항목의 최신 상태는 [후속 보강 기록](records-durable-writer-hardening-2026-09-22.md)을 따른다. 실제 모달·Provider·인증 서버 연결과 운영 진입은 여전히 미완료다.

**운영 테스트 진입 불가: `BLOCKED_BEFORE_LOGIN_BACKEND`.**

기록 엔진·모달의 기존 보강에 더해, 통제된 운영 테스트를 위한 서버 저장 기반과 브라우저 영속 큐를 구현했다. 각 구성요소의 로컬 검증은 진행했지만 실제 모달 → 큐 → 인증 API → 서버 확정본 → 관전자 화면의 전체 경로는 연결되지 않았다.

이 문서는 대화에서 확인된 사실을 정리한 인수인계 자료다. 작성일에 소스·Git 상태를 재점검하거나 테스트를 다시 실행하지 않았다. 이후 다른 작업에서 변경된 내용이 있다면 아래 결과를 최신 상태의 통과 증거로 사용하지 않는다.

- 이 작업에서 운영 로그인·운영 데이터 쓰기·배포·원격 push는 수행하지 않았다.
- 서버 모듈 대부분은 내부 서비스이며 외부 callable·HTTP endpoint가 아니다.
- 테스트 실행 활성화, 일반 운영 writer 교체, 공식 전환 활성화는 하지 않았다.
- 저장 계층 테스트의 합성 바이트는 야구 경기 의미 검증 자료가 아니다.
- 완료된 저장 체크포인트 봉인은 경기 종료 판정이나 공식 기록 승인과 다르다.

## 2. 확정된 제품·운영 정책

1. 자체 모달 기록·문자중계는 실시간 참고 서비스다. 검증된 UniquePlay 자료가 동기화되면 해당 원천을 공식 기록으로 사용한다.
2. 공식 전환 후 자체 원본은 관리자만 비교·개선 목적으로 조회한다. 일반 기록원에게 원본 접근을 자동 허용하지 않는다.
3. 별도 스테이징 없이 로컬·에뮬레이터 검증 후 운영 내 별도 테스트 namespace로 진행한다.
4. 최초 운영 테스트는 최대 3경기·24시간 이하, 지정 관리자·기록원·관전자만 접근한다. 일반 일정·검색·공식 누적에 포함하지 않는다.
5. KBO 2026 1군을 대상으로 정규시즌·포스트시즌 프로파일을 고정한다. AUBL·구장 로컬룰은 별도 후속 범위다.
6. 필수 미구현 규칙을 먼저 구현한다. 미구현을 단순 미확정 판정으로 우회한 것을 완료로 계산하지 않는다.
7. 입력은 로컬 영속 저장 성공 후 접수한다. ACK 대기 중 다음 입력은 계속 보관하되 서버 확정 순서를 유지한다.
8. 관전자에게는 같은 revision의 확정 상태·중계·사건만 제공한다. 오류 시 서로 다른 revision을 섞지 않는다.
9. 큐 비움 → 최종 ACK → 서버 봉인 → 공식 전환 순서를 사용한다. 단순 15초 대기는 승인 증거가 아니다.
10. 신규 writer의 이중 쓰기·구형 writer 자동 복귀·기존 경기 자동 이관은 금지한다. 대체 검증을 마친 미사용 함수는 요청대로 주석 보존한다.

상세 결정 근거와 대안 비교: [아키텍처 결정 문서](records-controlled-production-architecture-decisions.md).

## 3. 생성한 단계별 커밋

아래 커밋은 대화 중 실제 생성되었다. 현재 HEAD와 원격 포함 여부를 다시 조회한 것은 아니다.

| 커밋 | 내용 |
|---|---|
| `87e9d91` | KBO 사건 엔진·모달 컴포넌트·DOCX 보고서 |
| `8bacc98` | 기록 화면·공식 원천·관리자 비교 워크플로우 |
| `aa0397d` | 로컬 테스트 환경·검증 자료·아키텍처 문서 |
| `978b716` | 서버 실행 경계·세션·업로드·커밋·조회·봉인 |
| `29b4ae4` | IndexedDB 큐·커밋 어댑터·브라우저 테스트 |

커밋에는 관련 테스트·문서가 포함되며 원본 실행 로그가 위치한 `outputs/`는 별도 로컬 산출물이다. 다른 환경에서 로그가 없으면 성공 증거를 복원한 것으로 간주하지 말고 필요한 검증을 다시 수행한다. 본 인수인계 문서는 위 커밋 이후 작성되었다.

## 4. 구현 지도와 남은 연결

| 영역 | 주요 파일 | 현재 구현 | 남은 부분 |
|---|---|---|---|
| 로컬 환경 | `src/core/firebase/scoringEnvironment.ts`, `client.ts`, `vite.config.ts` | 설정 사전 검사, 로컬 연결, 잘못된 대상 거부 | 실제 Auth·Functions 통합, 서버 내부 호출 전체 격리 |
| 실행 범위 | `src/shared/lib/scoringTestScope.ts`, `functions/scoring_test_boundary.py` | 명세·참여자·기간·경기·요청 예산, 비활성 등록·중단 | 승인된 활성화 API, endpoint 연결, 인프라 호출 제한 |
| 인증·승인 | `functions/scoring_test_application.py` | Firebase runtime 형태의 인증 어댑터, 전용 운영자 claim, 승인 사본·해시 | 실제 인증 채널·claim 발급/회수, 운영 승인 UI |
| 자원·외부 I/O | `scoring_test_resources.py`, `scoring_test_io.py` | 고정 구간 rate 카운터, 업로드 예약 예산, 제한 HTTP 및 스트림 검증 | 실제 endpoint deadline·동시성, 기존 NAS 우회 경로 제거 |
| 전송·블록 | `scoring_test_transfer.py` | 승인·권한 재검사, 실제 크기 예약, 비공개 불변 블록 | 앱 payload 연결, 고아 블록 정리·보존 정책 |
| 작성 세션 | `scoring_test_sessions.py` | 단일 작성 세션, 명시적 인계, epoch, 업로드 검사 | 실제 탭 소유권·로그인·모달 작성권 표시 |
| 커밋 | `scoring_test_commits.py` | manifest·영수증·head 원자적 저장, 순번·revision·세션 검사 | 사건 의미 검증, 최초 규칙 프로파일 고정, 실제 writer 연결 |
| 재조회 | `scoring_test_readback.py` | 한 revision의 바이트 재구성 및 무결성 검사 | DTO 디코딩, 관전자 구독·캐시·이전 정상 화면 유지 |
| 봉인 | `scoring_test_seals.py` | 최종 커밋·영수증 대조, head·세션 동시 봉인 | 종료 사건, 실제 큐 비움, 공식 전환·재개 계약 |
| 잠금 재시도 | `scoring_test_transactions.py` | Aborted만 최대 5회 새 트랜잭션·무작위 지연 | 운영 부하·장기 반복 안정성 검증 |
| 영속 입력 | `src/shared/lib/durableScoringQueue.ts` | 입력 순번, pending 고정, 요청 범위 ACK, 복구·충돌 보존 | 실제 사건/상태 스냅샷, 입력 중복 식별, 탭·프로세스 복구 |
| 큐 전송 | `durableScoringCommitAdapter.ts` | Python 호환 manifest 해시, 요청 재검증, ACK 범위·UID·세션 대조 | 실제 인증 transport, 모달 연결, 권한 오류 분류·재시도 일정 |

`functions/` 접두사가 없는 Python 파일명도 모두 해당 디렉터리에 있다.

## 5. 검증 결과: 범위를 구분해서 사용할 것

아래는 서로 다른 시점의 마지막 확인 결과다. 숫자를 모두 더해 전체 서비스가 검증되었다고 보고하지 않는다.

| 검증 | 마지막 확인 결과 | 한계 |
|---|---|---|
| 제품 타입 검사 | 통과 | 마지막 어댑터 추가 후 실행. 작성일 재실행 아님 |
| 서버 단위 | 140건 통과 | manifest 추가 시점의 결과. 이후 봉인·조회는 에뮬레이터로 검증 |
| 서버 에뮬레이터 | 68건 통과 | 봉인까지 기존 회귀 포함. 실제 로그인·모달 연결 아님 |
| 실제 Chrome IndexedDB | 10건 통과 | 새로고침·탭 종료/재열기·동시 순번·주입 오류. 프로세스 강제 종료 아님 |
| 실제 Chrome 큐 어댑터 | 7건 통과 | 실제 IndexedDB·Web Crypto·Python 해시, 전송은 스텁 |
| 이전 야구 기록 회귀 | 922건 통과 | 해당 과거 변경 범위의 기준선. 이후 전체 앱 회귀로 재실행한 것은 아님 |

서버 장애 주입은 실제 에뮬레이터 커밋 전 실패와 커밋 성공 후 SDK 호출 경계의 응답 유실을 포함했다. 같은 요청의 재시도로 중복 없이 복구됨을 확인했다. 브라우저 네트워크 단절·callable 장애·IDB 큐 복구의 통합 시험과는 다르다. 과거에 제외된 전체 RPC 장애 2건을 자동 해소 처리하지 않는다.

테스트는 로컬 `demo-aubl-scoring` 에뮬레이터에만 데이터를 생성했다. 각 테스트의 실행·예약·블록·세션·인계·manifest·영수증·head·봉인 문서는 삭제 및 재조회로 정리를 확인했다. 브라우저 검증은 외부 요청을 차단한 일회성 context를 사용했다.

### 주요 로그 위치

- `outputs/server-private-seals-2026-09-08/`: 마지막 에뮬레이터 68건.
- `outputs/server-commit-faults-2026-09-08/`: SDK RPC 장애 주입 증거.
- `outputs/server-resource-boundary-2026-09-08/`: 최초 잠금 경합 실패 2건.
- `outputs/server-resource-boundary-retry-2026-09-08/`: 경합 보완 후 재검증.
- `outputs/durable-scoring-queue-validation-2026-09-08/`: 큐 타입·브라우저 로그.
- `outputs/durable-commit-adapter-validation-2026-09-08/`: 어댑터 타입·브라우저 로그.
- `outputs/preintegration-baseline-recovered-2026-09-08/`: 과거 기준선 복구.

## 6. 전체 계획 기준으로 남은 작업

### 0단계: 규칙·증거 확정

- KBO 2026 전체 규칙집·개정·정정 원문을 확보하고 출처·버전·해시를 고정한다.
- 조항별 구현 위치·독립 기대값·정상/경계/모순 테스트 대응표를 완성한다.
- 실패·제외·정적 위험·미구현을 별도로 집계한다.

공식 2026 변경 안내는 확인했지만 전체 규칙집 확정이 완료된 것은 아니다. 2025 자료를 2026 인증 근거로 자동 승격하지 않는다.

### 1단계: 테스트 실행 경계 완성

- 실제 Auth·Functions·API의 로컬 조합과 인증된 진입점을 연결한다.
- 전용 운영자 claim 프로비저닝·회수·토큰 반영과 역할 접근 행렬을 검증한다.
- 서버 실행 승인·활성화는 완전한 명세와 승인 해시 일치를 요구한다. 현재 활성화 API는 없다.
- 읽기·커밋·봉인·세션 작업의 호출 제한과 앞단 인프라 제한을 완성한다.
- NAS 등 기존 외부 호출이 제한 transport를 우회하지 못하도록 통합한다.

### 2·3단계: 사건 계약과 야구 규칙

- 불변 선수 ID·출전 구간·타석 중 투타 교체·승계 주자 책임·DH/투타 겸임을 완성한다.
- 타순 착오, 과거 어필·정정·후속 재생과 승인/롤백을 연결한다.
- 안전진루권·볼 데드 시점·방해 유형/선택권·재촉루·추월·역주행·제3아웃 이후 어필을 조항별 검증한다.
- 끝내기·강우·서스펜디드·재개·몰수·무승부·연장 차이를 고정 프로파일로 처리한다.
- 무실책 가상 이닝, 자책·책임 투수, 승·패·세이브 등 결정 기록을 재구성한다.
- 심판 판정·기록원 판단·미구현 기능을 UI와 사건 상태에서 구분한다.

기존 모달·엔진의 어느 항목이 실제로 미완료인지는 대응표로 다시 연결해야 한다. 위 목록을 전부 미구현 또는 전부 구현 완료라고 일괄 단정하지 않는다.

### 4단계: 실제 입력·저장·조회 경로 교체

- 큐와 어댑터의 scope가 반드시 일치하도록 조립을 강제한다.
- 탭별 소유권과 동일 계정의 다른 탭·기기, 세션 복구·인계 UI를 연결한다.
- 모달 입력에서 사건과 복구 상태를 한 번에 직렬화하고 로컬 영속 성공 후 접수 표시한다.
- 중복 클릭·접수 결과 불명 시 `inputId` 재시도 계약을 정한다. 현재 큐는 같은 input ID를 자동 중복 제거하지 않는다.
- 구조화된 사건·상태·중계·통계로 블록과 manifest를 생성한다. 현재는 바이트 구조만 검증한다.
- 인증 transport를 큐 어댑터와 서버 서비스에 연결하고 요청·ACK 필드 변환을 검증한다.
- 길이 기반·분리 저장을 실제 Provider 경로에서 제거 또는 검증된 대체 후 비실행 주석으로 보존한다.
- 관전자에게 같은 revision만 노출하고 실패 시 이전 정상 화면을 유지한다.
- 긴 경기·대량 정정, 영수증 보존, 고아 블록·입력 정리, 용량·비용 한도를 확정한다.

### 5단계: 종료·공식 전환·NAS

- 실제 큐 비움·마지막 ACK·적법한 종료 사건을 저장 체크포인트 봉인과 연결한다.
- `functions/record_sources.py`의 기존 15초 대기 조건을 검증된 최종 커밋·봉인 조건으로 대체한다.
- 새 저장 원본을 관리자 비교에 연결하고 공식 전환 이후 비관리자 원본·캐시 접근을 차단한다.
- NAS 직접 임포트에서도 자체·테스트 기록을 공식 시즌 누적에 넣지 못하도록 서버 방어를 적용한다.
- 봉인 이후 정당한 경기 재개·관리자 정정은 별도 승인 계약으로 다룬다.

### 6·7단계: 종합 검증과 통제된 운영 진입

- 실제 앱 라우트·인증·서버·큐를 잇는 E2E 및 기존 전체 RPC 제외 2건을 해결한다.
- 실제 경기 20개·실제 중계 500문장의 출처와 기대값을 확보한다. 합성 사례와 분리한다.
- 브라우저 강제 종료, 실제 모바일, 느린 연결·로그아웃·권한 회수·다른 경기 이동을 검증한다.
- 최대 3경기·24시간 실행 명세, 프로젝트·API·UID·경기·호출 한도·배포 버전·중단 책임자를 확정한다.
- 기본 비활성 배포 후 사용자 승인된 실행만 개방한다. 운영 실행은 별도 승인이 필요하다.

## 7. 다음 세션의 권장 시작 순서

1. 이 문서와 아래 설계 문서를 기준으로 시작한다. 현재 코드가 기준 커밋 이후 변경되었다면 작업 범위를 먼저 구분하고 기존 변경을 덮어쓰지 않는다.
2. 다음 코드 작업은 **큐·어댑터 scope 일치와 탭 소유권**을 우선 보강한다. 실제 API를 열기 전에 다른 큐/세션의 ACK가 잘못 적용될 가능성을 구조적으로 차단한다.
3. 실제 모달 사건·상태 계약과 manifest 생성의 연결 설계를 구체화한다. 규칙 원문·조항 대응표 작업도 이 시점에 다시 진행한다. 저장 기반만 확장하며 규칙 과제를 계속 뒤로 미루지 않는다.
4. 운영 접근이 불가능한 로컬 통합 하네스에서 브라우저 큐 → 인증 경계 → 블록·커밋·재조회·봉인을 연결한다.
5. 실제 Provider writer 교체와 운영 로그인 연결은 규칙·의미 검증과 안전 경계가 충족된 뒤 진행한다.

다음 작업 완료 기준 예시:

- 다른 scope의 큐를 어댑터에 주입하면 요청 고정·전송·ACK 전에 거부된다.
- 동일 계정 두 탭에서 하나만 접수하고 다른 탭은 읽기 전용이며 명시적 인계가 가능하다.
- 인계 후 이전 세션 큐를 삭제하지 않고 검토 대상으로 보존한다.
- 예외·재시도·새로고침에서 입력과 고정 요청이 그대로 복구된다.

## 8. 기존 코드의 알려진 잔여 위험

- `src/shared/state/demoStore.effects.ts`: 기존 core와 중계·사건의 분리 저장, 길이 기반 변경 감지, ACK 이후 최신 배열 길이를 저장 완료 기준으로 사용하는 정적 위험. 새 독립 서버 서비스 구현만으로 해소되지 않았다.
- `src/shared/lib/atomicScoring.ts`, `atomicScoringFirestore.ts`: 기존 별도 단일 pending/전체 payload 경로. 신규 IndexedDB 큐·블록 manifest 경로와 혼동하지 않는다.
- `functions/record_sources.py`: 공식 전환의 최종 커밋 봉인 조건은 아직 실제 경로에 연결되지 않았다.
- `scoring_test_commits.py`: 최초 프로파일 값과 실제 사건 입력 목록의 의미 검증이 없다. 네 종류의 블록 존재만 확인하는 상태다.
- `durableScoringQueue.ts`: 같은 input ID 자동 중복 제거, 손상된 저장소의 종합 복구, 자동 unblock은 없다.
- `durableScoringCommitAdapter.ts`: 큐 scope 조립, 실제 인증 transport, 오류 분류·재시도 일정·다중 탭 소유권이 남아 있다.

이 목록은 현재 대화의 분석 결과이며 2026-09-12에 코드를 재검수한 발견 목록이 아니다.

## 9. 검증 명령과 실행 안전 조건

아래는 재개 시 사용할 명령 예시이며 문서 작성 과정에서 실행하지 않았다. 테스트 실행은 사용자 요청·승인 범위에서 한다.

```sh
# 제품 타입 검사
npm run typecheck

# 서버 단위 테스트
PYTHONPATH=functions:functions/tests functions/venv/bin/python \
  -m unittest discover -s functions/tests -p 'test_scoring_test_*.py' -v

# 최신 에뮬레이터 회귀: 상속된 이전 테스트를 포함함
FIREBASE_CLI_DISABLE_UPDATE_CHECK=1 firebase emulators:exec \
  --config firebase.scoring-test.json --only firestore --project demo-aubl-scoring \
  'PYTHONPATH=functions:functions/tests functions/venv/bin/python -m unittest discover -s functions/tests -p test_scoring_seals_emulator.py -v'

# 실제 Chrome IndexedDB 및 전송 어댑터 스텁 검증
node scripts/test-durable-scoring-queue-browser.mjs
node scripts/test-durable-commit-adapter-browser.mjs

# 기존 야구 기록 회귀
npm run test:scoring
```

- Python 테스트는 `functions/venv` 의존성이 필요하다.
- 브라우저 하네스는 현재 로컬 Chrome 경로 및 `services/uniqueplay-sync-worker/node_modules/playwright`를 사용한다. 다른 환경에서는 하네스 런타임 경로를 조정한다.
- 서버 에뮬레이터 테스트는 `GCLOUD_PROJECT=demo-aubl-scoring`, `FIRESTORE_EMULATOR_HOST=127.0.0.1:8088`을 요구한다. 운영 프로젝트로 바꿔 실행하지 않는다.
- 포트 권한 제한이 발생하면 로컬 에뮬레이터 실행 권한만 승인받는다. 운영 연결로 우회하지 않는다.
- 상속 구조 때문에 모든 emulator 파일을 무작정 discover하면 기존 테스트가 반복 실행된다. 마지막 누적 모듈을 선택한다.
- 새 테스트 컬렉션을 추가하면 정리·부재 확인도 추가한다. 부모 문서 삭제가 하위 문서 삭제를 대신한다고 가정하지 않는다.

## 10. 다음 작업에 반드시 유지할 제한

- 실제 운영 쓰기·배포·push·플래그 활성화는 별도 요청 없이 하지 않는다.
- 다음 환경 변수는 기본 비활성 상태를 유지한다: `SCORING_TEST_SERVER_ENABLED`, `SCORING_TEST_OUTBOUND_ENABLED`, `SCORING_TEST_COMMIT_ENABLED`, `SCORING_TEST_READBACK_ENABLED`, `SCORING_TEST_SEAL_ENABLED`.
- 브라우저 `production-test` 실행 차단과 Firestore 테스트 namespace 클라이언트 전면 차단을 임시 편의로 해제하지 않는다.
- 운영 테스트는 일반 경기 컬렉션에 배지만 붙이는 방식이 아니라 별도 namespace를 사용한다.
- 실패한 테스트는 제외하거나 기대값을 제품 출력에 맞추는 방식으로 숨기지 않는다.
- 현재 성공 결과를 실제 로그인·전체 야구 규칙·운영 부하의 통과로 확대하지 않는다.

**최종 진입 조건:** 필수 검증 실패·제외 0건, 알려진 필수 규칙 미구현 0건, 저장 유실·중복·원본 노출·공식 통계 혼입 결함 0건. 이후에도 실제 AUBL 경기 적용 승인은 별도다.

## 11. 상세 문서 바로가기

- [설계·대안 비교·주요 인터페이스](records-controlled-production-architecture-decisions.md)
- [기준선·환경 경계](records-controlled-production-stage01-2026-09-08.md)
- [서버 인증·승인](records-server-approval-adapter.md)
- [자원 제한·잠금 경합 수정 이력](records-server-resource-boundary.md)
- [외부 I/O 제한](records-server-io-boundary.md)
- [블록 전송 통합](records-server-transfer-integration.md)
- [세션·인계·업로드 검사](records-server-writer-sessions.md)
- [원자적 커밋·RPC 장애 주입](records-server-private-commits.md)
- [동일 revision 재조회](records-server-consistent-readback.md)
- [비공개 봉인](records-server-private-seals.md)
- [영속 큐](records-durable-input-queue.md)
- [큐 커밋 어댑터](records-durable-commit-adapter.md)

## 12. 다음 세션에 전달할 작업 요청 예시

> `docs/records-handoff-2026-09-12.md`를 기준으로 야구 기록 시스템 작업을 이어가자. 현재 상태는 운영 진입 차단이다. 먼저 영속 큐·어댑터의 scope 일치와 탭 소유권을 보강하고, 실제 모달 사건 계약과 manifest 구성 연결을 진행하자. KBO 원문·조항 대응표의 미완료도 함께 추적하고, 테스트는 로컬·demo 에뮬레이터에서만 수행하자. 운영 접근·배포·writer 교체·공식 전환 활성화는 별도 승인 전 금지한다.

# UniquePlay 날짜 범위 동기화

## 구현 범위와 상태

2026-09-12: 관리자 화면, 요청 계약, NAS 수집 워커, 별도 백엔드 소스에 날짜 범위 수집 및 서버 병합 경로를 추가했다. 이번 작업에서는 테스트·타입 검사·실제 동기화·배포·DB 마이그레이션을 실행하지 않았다. 운영 사용 전 아래 검증이 필요하다.

백엔드 저장소: `/Users/juhwan/Documents/Dev/AUBL/AUBL_WebPage_BE-test`.

## 사용 방법

1. 관리자 UniquePlay 동기화 화면에서 시즌을 선택한다.
2. 기본값인 **마지막 공식 반영 이후** 또는 **지정 날짜부터 다시 수집**을 선택한다.
3. 수집 결과를 비교하고 기존 검증·게시·활성화 절차로 반영한다. 수집 자체는 공식본을 바꾸지 않는다.

날짜는 한국 시간이며 당일 포함이다. 최초 공식본이 없는 시즌은 자동 모드로 전체 수집한다. 지정 날짜 모드는 기존 활성 공식본이 있어야 한다. 날짜는 해당 시즌의 오늘 또는 과거 날짜여야 한다.

## 기준과 보존 정책

- 기준은 현재 활성 공식 리비전의 `capturedAt`이다. 단순 버튼 클릭, 실패한 실행, 미승인 후보, 로컬 브라우저 시간을 기준으로 삼지 않는다.
- 새 수집의 `capturedAt`은 수집 시작 시각으로 기록한다. 수집 도중 자정을 넘는 경우 마지막 날의 기록을 건너뛰지 않도록 당일을 재수집한다.
- 기존 구버전 스냅샷은 당시 저장된 시각을 사용한다. 과거 누락 의심 시 지정일 재수집이 필요하다.
- 실행 생성 시 `baseRevision`, `syncMode`, `syncFromDate`를 서버에 고정한다. 활성화 경합 검사는 기존 revision 계약을 유지한다.
- 선택일 이전 경기 및 상세는 기준 공식본에서 보존한다. 선택일 이후는 ID 기반으로 갱신하며, 응답에 없다는 이유만으로 기존 경기·상세를 삭제하지 않는다.
- 기존 경기 ID는 날짜·팀·구장 등에 영향을 받는다. 원천 일정 변경으로 ID가 바뀌면 별개 경기처럼 보일 수 있다. 이 경우 자동 삭제하지 않고 완성본 검증과 관리자 검토로 처리해야 한다.
- 과거 경기의 늦은 기록 공개, 지연 종료, 점수 정정은 해당 경기 날짜부터 수동 재수집한다. 자동 모드가 임의로 과거 전체 상세를 다시 읽지는 않는다.
- 시즌 순위와 선수 누적은 부분 증가분으로 계산할 수 없으므로 전체 최신 값을 수집한다. 경기 목록도 범위 판정·전체 경기 수 검증을 위해 조회하며, 고비용 경기 상세 페이지 방문만 날짜로 제한한다.

## 계약과 안전 경계

새 화면은 `POST /api/admin/sync/unique-play/runs/scoped`로 `{seasonYear, syncMode, fromDate?}`를 전송한다. 구형 서버의 옵션 무시를 방지하기 위해 구형 `/runs`로 자동 재시도하지 않는다. 기존 API 호출자는 종전 동작을 유지한다.

서버는 `{version: 1, mode, fromDate}` 범위를 워커에 전달하고, 콜백이 동일 범위를 반환하는지 확인한다. 구형 워커가 범위를 무시하면 후보 접수를 거부한다. 범위는 후보 checksum 바깥의 전송 메타데이터이며 실행 계약과 정확히 비교한다.

워커는 수집한 데이터의 checksum을 제출한다. 서버는 원본 checksum 확인 후 기준 스냅샷과 병합하고 완성본 checksum을 다시 계산한다. 이후 기존 전체 후보 검증·상세 품질 저하 차단·차이 검토·공식 활성화 경로를 사용한다. 범위 안 종료 경기 상세 누락, 중복 ID, 범위 밖 상세는 거부한다. 원천 데이터 불일치를 숨기기 위해 검증을 우회하지 않는다.

## 배포 순서

1. 백엔드 `V7__uniqueplay_incremental_scope.sql`의 대상 DB와 마이그레이션 정책을 확인한다.
2. 로컬 검증 후 마이그레이션·백엔드·범위 지원 워커를 함께 준비한다.
3. 마지막으로 새 관리자 화면을 배포한다. 구성 요소 버전이 맞지 않으면 실패를 유지하고 구형 전체 수집으로 자동 복귀하지 않는다.

## 실행 전 필수 검증 (미실행)

| 시나리오 | 기대 결과 |
| --- | --- |
| 최초 자동 수집 / 최초 지정일 수집 | 시즌 전체 수집 / 요청 거부 |
| 기준일 전·당일·다음날 종료 경기 | 이전 원본 보존 / 당일과 다음날 상세 재수집 |
| 과거 날짜 수동 지정 | 해당 날짜부터 갱신하고 이전 경기 보존 |
| 수집 실패·검증 실패·게시만 완료 | 활성 공식본 기준일 유지 |
| UTC 자정·KST 자정 및 수집 중 날짜 변경 | 한국 시간 당일 포함, 다음 수집 누락 없음 |
| 중복 ID·상세 누락·체크섬 오류·다른 범위 콜백 | 접수 거부, 기존 공식본 유지 |
| 원천 상세가 AVAILABLE에서 NOT_PUBLISHED로 변경 | 기존 품질 저하 검증과 충돌 검토 적용 |
| 범위 내 원천 경기 누락·일정 ID 변경 | 이전 데이터 자동 삭제 없음, 불일치 검증 |
| 기존 상세 없는 레거시 공식본 | 전체 완성본 검증 확인, 필요 시 시즌 시작일로 재수집 |
| 다른 실행이 먼저 활성화 | 기존 revision 충돌 처리, 덮어쓰기 없음 |
| 구형 서버·구형 워커 | 명시적 실패, 전체 수집으로 자동 폴백 없음 |
| 동일 날짜 재실행 | ID 기반 갱신, 선수 시즌 누적 이중 합산 없음 |

실제 운영 계정으로 수집하거나 공식본을 활성화하는 행위는 별도 승인 후 수행한다.

## 2026-09-12 로컬 검증 결과

- 프런트엔드 `npm run typecheck`: 타입 오류 보고 없음.
- 기존 워커 회귀 테스트: 64건 통과, 실패·제외 0건.
- 신규 `collection-scope.test.mjs`: 12건 통과, 실패·제외 0건. KST 기준일 직전·정각·다음날, 잘못된 날짜, 프로토콜·모드, 시간대 누락을 확인했다.
- 백엔드 `UniquePlayIncrementalScopeTest` 8개 테스트를 추가했다. 이전 기록 보존, 당일 갱신, 원천에서 빠진 경기 유지, 범위 밖 상세·중복·누락 거부, 자동 기준일, 최초 수집, 기준 리비전 소실을 대상으로 한다.
- 신규 백엔드 테스트와 기존 `UniquePlaySyncRevisionFreshnessTest` 실행을 시도했으나 Java 21 toolchain 부재로 컴파일·테스트 시작 전에 중단됐다. 로컬에 등록된 JDK는 Java 25뿐이다. 백엔드 테스트는 통과로 계산하지 않는다.
- 실행 명령: `bash gradlew --offline test --tests '*UniquePlayIncrementalScopeTest' --tests '*UniquePlaySyncRevisionFreshnessTest' --console=plain`. 래퍼 실행 권한이 없어 bash로 실행했으며 파일 권한은 바꾸지 않았다.
- 운영 API·DB 접속, 실제 동기화, 배포, 마이그레이션은 실행하지 않았다.

### 다음 단계

1. Java 21 JDK를 준비하고 위 백엔드 테스트를 재실행한다. Java 버전 기준을 낮추거나 올려 통과를 대체하지 않는다.
2. 백엔드 통과 후 범위 콜백·전체 후보 검증·게시·활성화까지 통합 검증한다. 이번 테스트는 모의 저장소 기반 병합 단위 검증이며 실제 저장 보존을 입증한 것은 아니다.
3. 구형 서버/워커 거부 및 관리자 날짜 선택 UI를 E2E로 검증한 뒤 배포 여부를 판단한다.

## 2026-09-12 Docker 검증 및 운영 버전 확인

- 사용자 제공 Portainer(`https://portainer.aubl.club/#!/home`)의 운영 환경 컨테이너 목록에서 읽기 전용으로 확인했다.
- 운영 백엔드: `ix-aubl-backend-aubl-backend-1`, 이미지 `synapse9983/aubl-backend:v25`, `running`. 컨테이너 ID: `39150562813c94bfbe04c5d1b8c7000536330b59cd51a99eb1656e1bb6d6c9f7`.
- 운영 워커: `aubl-uniqueplay-sync-worker`, 이미지 `synapse9983/aubl-uniqueplay-sync-worker:v13`, `running`.
- 로컬 v25 이미지 식별자: `sha256:e10d8890bcd42258dfbab18892cbc0204203275f1208822f5bd50fefc0731cb4`, `linux/amd64`. 이 digest는 로컬 이미지에서 확인한 값이며 운영 이미지 digest를 직접 확인한 값으로 혼동하지 않는다.
- 기존 Dockerfile의 Java 21 빌더 및 Java 21 JRE 구조를 사용해 `linux/amd64` 후보 빌드를 시도했다. 로컬 JDK 설치 없이 제품·테스트 컴파일과 bootJar 단계가 완료됐다.
- 테스트 결과: 10건 중 9건 통과, 1건 실패. `UniquePlayIncrementalScopeTest.preservesOldAndMissingRecordsWhileUpdatingSelectedDay`의 51번째 줄에서 배열 위치를 기준으로 경기 점수를 검증하다 실패했다. 현재 인덱스 구현은 HashMap이므로 입력 순서를 보장하지 않는다. 테스트를 경기 ID 기준으로 수정한 뒤 재실행해야 한다. 뒤쪽 보존·반복 실행 assertion은 첫 실패 때문에 실행 여부를 보장하지 않는다.
- 최종 후보 이미지 `aubl-backend:incremental-20260912-candidate`는 테스트 실패로 생성되지 않았다. 테스트를 생략해 이미지를 생성하거나 운영 컨테이너를 교체하지 않았다.
- 빌드 문맥: `/tmp/aubl-backend-incremental.IJ50uA`. 로그: `/tmp/aubl-backend-incremental-docker-build.log`. 문맥에는 소스·Gradle 파일만 복사했으며 운영 환경 파일·인증 파일은 복사하지 않았다.
- 다음 조치: 테스트의 배열 순서 가정을 ID 기반 검증으로 수정 승인 후 동일 Docker 검증 및 후보 빌드 재실행. 운영 업로드·V7 마이그레이션·컨테이너 교체는 별도 단계로 유지한다.

## 2026-09-12 Docker 재검증 완료

- 사용자 승인에 따라 보존 테스트의 세 assertion을 배열 인덱스가 아닌 `sourceGameId` 기준으로 변경했다. 제품 코드는 변경하지 않았다.
- Java 21, `linux/amd64` Docker 환경에서 `UniquePlayIncrementalScopeTest` 8건과 `UniquePlaySyncRevisionFreshnessTest` 2건을 재실행하여 통과했다. 이전에 첫 assertion 실패로 도달하지 못한 기존 상세 보존·누락 경기 유지·반복 병합 동일성 검증도 포함된다.
- 제품·테스트 컴파일, 선택 테스트, bootJar 및 최종 이미지 생성 완료: `BUILD SUCCESSFUL`. 기존 deprecated API·unchecked operation 경고는 남아 있다.
- 로컬 후보 이미지: `aubl-backend:incremental-20260912-candidate`.
- OCI manifest digest: `sha256:ea0b89d7740e3a3f1a2592eecfb360e3d49314a0ed6e1381b3c58f96b959b62d`.
- Image config digest: `sha256:6c9e58bae79cc069fd8c6501c54877eb153ce95ffb73a156610354a2d16e66c5`.
- 재빌드 로그: `/tmp/aubl-backend-incremental-docker-rebuild.log`.
- 이 결과는 선택한 모의 저장소 기반 단위 테스트와 이미지 빌드 성공이다. 전체 백엔드 회귀, 실제 DB 저장·재조회, V7 마이그레이션, 새 워커와의 통합·관리자 E2E·운영 기동을 검증한 것은 아니다.
- Docker Hub 업로드, 운영 컨테이너 교체·재시작, 실제 동기화 및 DB 변경은 수행하지 않았다. 앞서 확인한 운영 백엔드 v25와 워커 v13은 이번 작업의 변경 대상이 아니다.
- 다음 단계는 후보 이미지와 범위 지원 워커의 통합 검증 및 V7 마이그레이션 검증이다. 운영 배포는 해당 결과와 별도 승인을 기준으로 진행한다.

## 2026-09-12 워커 JSON 계약 및 V7 격리 검증 완료

### 워커와 백엔드 경계

- `services/uniqueplay-sync-worker/test/scoped-callback-fixture.mjs`를 추가했다. 제품의 정규화·체크섬·날짜 필터·후보 검증 함수를 사용하여 A~H 40팀, 기준일 이전/당일 종료 경기 2개, 범위 내 상세 1개인 부분 후보를 만든다.
- 최초 실행에서는 테스트 자료의 providerGameId가 중복되어 기존 검증이 정상 차단했다. 사용자 승인 후 각 경기의 원천 상세 ID를 다르게 설정하여 재실행했고 제품 코드는 변경하지 않았다.
- 완성본은 워커 전체 검증을 통과하고, 부분 후보는 범위 내 상세 검증을 통과하되 전체 스냅샷 검증에는 실패하는 것을 확인했다. 이는 부분 후보를 그대로 공식본으로 사용하면 안 된다는 경계를 검증한다.
- 워커가 생성한 JSON을 백엔드 `src/test/resources/uniqueplay/scoped-callback.json`으로 전달하고 `UniquePlayScopedCallbackTest` 6건을 추가했다.
- 백엔드 서비스의 실제 `candidate` 진입점에서 원본 JS checksum 수용, 기존 상세 병합, 전체 후보 검증 오류 0건, DELETE 차이 없음, 후보 저장 및 동일 실행의 재접수 차단을 확인했다.
- 범위 누락·날짜 변경·프로토콜 변경·checksum 손상·기준 리비전 소실은 거부되고 후보가 저장되지 않는 것을 확인했다.
- Java 21·linux/amd64 Docker에서 기존 범위 8건 + freshness 2건 + 콜백 6건, 총 16건 통과. 워커 회귀 76건도 실패·제외 없이 통과했다.
- 저장소는 모의 객체다. 실제 HTTP 콜백·인증, Playwright 원천 페이지 탐색, JPA 저장·재조회와 공식 게시/활성화까지 연결한 E2E는 이번 통과 범위가 아니다.

### MariaDB V7 검증

- 재현 스크립트: `bash scripts/test-uniqueplay-v7-docker.sh`.
- Docker Desktop 전용 context, `--network none`, 포트 미공개, 데이터 디렉터리 tmpfs의 일회성 `mariadb:11.8.5` 컨테이너를 사용했다. 운영 주소·환경변수·인증 파일을 전달하지 않았다.
- 실제 V2 SQL에서 `UNIQUEPLAY_SYNC_RUN` 정의를 가져와 기존 행을 넣고, 원본 컬럼 전체를 별도 테이블에 보관한 뒤 실제 V7 SQL을 적용했다.
- 통과: 기존 컬럼 전체 값 보존, 구형 행의 새 범위 컬럼 NULL 유지, 신규 FROM_DATE/2026-09-11 저장·재조회, 원시 V7 DDL 중복 적용의 명시적 실패, 중복 시도 이후 기존/신규 행 2개 유지.
- V7은 Flyway가 한 번 적용하는 migration이며 SQL 자체의 멱등 재실행을 지원한다는 뜻이 아니다. 이번 검증은 MariaDB DDL 호환성·데이터 보존 검증이고, Flyway V1~V7 전체 이력 업그레이드·운영 백업 복구 검증은 아니다.
- 테스트 컨테이너 제거와 재조회 시 부재를 확인했다. 테스트 DB는 tmpfs라 컨테이너 종료와 함께 폐기됐다. SQL 증거는 `/tmp/aubl-v7-check.W7fQWT`, 로그는 `/tmp/aubl-v7-docker-validation.log`에 남겼다.

### 산출물과 배포 경계

- 새 로컬 태그: `aubl-backend:incremental-20260912-integration`.
- manifest: `sha256:ea0b89d7740e3a3f1a2592eecfb360e3d49314a0ed6e1381b3c58f96b959b62d`.
- config: `sha256:6c9e58bae79cc069fd8c6501c54877eb153ce95ffb73a156610354a2d16e66c5`.
- 제품 코드가 바뀌지 않아 앞서 생성한 후보와 최종 런타임 이미지 digest가 같다.
- Docker 로그: `/tmp/aubl-scoped-callback-docker.log`. 워커 회귀 로그: `/tmp/aubl-scoped-worker-regression.log`.
- 운영 DB 변경, Docker Hub 업로드, 운영 백엔드 v25/워커 v13 교체·재시작, 실제 시즌 동기화는 수행하지 않았다.
- 남은 검증: 실제 HTTP 인증·콜백 전송과 관리자 날짜 선택 E2E, 전체 Flyway 이력 업그레이드, 실제 저장·공식 전환 경합. 이후 배포 범위와 DB 백업·중단·복구 절차를 승인받아 진행한다.

## 2026-09-12 HTTP 보안 경로 검증 / 관리자 E2E 진행 상태

- `UniquePlayScopedHttpTest` 8건을 추가했다. 실제 루프백 HTTP 서버에서 요청을 받아 MockMvc의 제품 보안 필터·컨트롤러로 전달한다. Firebase 토큰 검증은 요청 스레드에서 모의 처리하고, 저장소도 모의 객체다. 운영 Firebase나 DB에는 연결하지 않는다.
- 통과: 익명 관리자 요청 401, 일반 사용자 403, 잘못된 토큰 401, 관리자 scoped 요청의 날짜/UID 전달, 모드 누락 400, 워커 자격 증명 누락·오류 401, 범위 불일치 409, 정상 콜백 204와 상세 병합·재접수 409.
- 관리자 시작 서비스는 외부 수집 실행 방지를 위해 stub 처리했다. 관리자 HTTP 요청의 서비스 전달 계약 검증이며 원천 수집 시작 성공을 검증한 것은 아니다. 콜백에서는 실제 서비스 병합 로직을 실행한다.
- Java 21 linux/amd64 Docker에서 기존 16건과 신규 HTTP 8건, 총 24건 통과했다. 실제 배포 앱의 서블릿 서버·Firebase 인증·NAS 워커까지의 종단간 검증과는 구분한다.
- 로컬 이미지: `aubl-backend:incremental-20260912-http`. 제품 변경이 없어 manifest는 `sha256:ea0b89d7740e3a3f1a2592eecfb360e3d49314a0ed6e1381b3c58f96b959b62d`로 동일하다. 빌드 로그: `/tmp/aubl-scoped-http-docker.log`.
- 화면 하네스 `scripts/test-uniqueplay-scope-ui.mjs`를 추가했다. 실제 관리자 페이지와 API 클라이언트를 사용하고 API 응답은 루프백 서버의 합성 응답으로 대체한다. 외부 브라우저 요청은 차단한다.
- 최초 화면 실행은 하네스의 `react/jsx-dev-runtime` 사전 번들 누락으로 중단됐다. 승인 후 보완하여 제품 페이지의 정상 렌더링과 연결 상태 표시를 확인했다.
- 이후 `수집 범위`의 라벨 완전 일치 선택자에서 멈췄다. 실제 본문에는 선택 항목까지 표시되며, 선택 항목 텍스트가 포함되는 라벨을 매칭하도록 테스트 선택자를 수정해야 한다. 화면 E2E는 아직 통과하지 않았고 제출·오류 표시·PC/모바일 검증 완료로 계산하지 않는다.
- 운영 배포·업로드·DB 변경·실제 동기화는 하지 않았다. 선택자 수정 승인 후 화면 E2E를 재실행한다.

## 2026-09-12 관리자 화면 E2E 후속 진단

- 승인 후 `수집 범위` 선택자를 완전 일치에서 시작 문구 매칭으로 수정했다. 페이지 진입 및 선택자 문제는 해결됐다.
- PC 1280px에서 기본 `SINCE_LAST_SYNC` 전송, FROM_DATE 빈 날짜의 브라우저 필수 입력 차단, 지정 날짜 `2026-09-01` 전송 assertion이 통과했다.
- 진단에서 POST는 `/api/admin/sync/unique-play/runs/scoped` 2건만 확인됐다. 원문 body는 각각 `{seasonYear:2026,syncMode:'SINCE_LAST_SYNC'}`, `{seasonYear:2026,syncMode:'FROM_DATE',fromDate:'2026-09-01'}`이다. 브라우저 예외는 없었다.
- 이후 403 표시 검증에서 하네스가 서버 fixture 원문 `ISOLATED_SCOPE_REJECTION`을 기대해 시간 초과됐다. 실제 제품은 `현재 AUBL 계정에 NAS 관리자 API 권한이 없습니다. Firebase 관리자 권한을 다시 확인하세요.`로 정상 변환해 표시했다.
- 제품 오류로 판단하지 않는다. 테스트 기대 문구를 실제 권한 안내로 수정하는 승인을 받은 뒤 재실행한다. 현재 모바일 390px 및 전체 E2E는 미완료다.
- 제품 코드·운영 환경 변경 없음. 앞선 백엔드 HTTP 포함 24건 및 격리 MariaDB 검증 결과는 유지한다.

## 2026-09-12 관리자 PC·모바일 E2E 완료

- 사용자 승인 후 테스트의 403 기대 문구를 제품에서 표시하는 한국어 관리자 권한 안내로 수정했다. 제품 코드 변경은 없다.
- 실행: `node scripts/test-uniqueplay-scope-ui.mjs`.
- 결과: PC 1280px·모바일 390px에서 총 8개 검증 통과. 각 화면에서 기본 SINCE_LAST_SYNC 요청, FROM_DATE 날짜 미입력 차단, 지정 날짜 보존·전송, 403 권한 안내와 요청 횟수를 확인했다.
- 두 화면 모두 실제 관리자 페이지와 API 클라이언트를 사용했다. 요청은 로컬 합성 API에만 전달됐으며, `/runs` 구형 전체 수집 경로로의 자동 폴백 0건, 브라우저 오류 0건, 외부 요청 0건이었다.
- 모바일 결과는 Chromium 390px viewport 검증이며 실제 휴대폰 검증은 아니다. 합성 404/403 응답에 대한 화면·요청 검증으로, 실제 수집 성공·저장·공식 활성화의 종단간 완료를 입증하지 않는다.
- 기존 워커 회귀 76건, 백엔드 HTTP 포함 24건, 격리 MariaDB V7 검증 결과와 함께 현재까지의 검증 근거로 사용한다. 이번 실행에서 해당 별도 테스트들을 다시 실행하지는 않았다.
- 운영 업로드·배포·재시작·실제 동기화·DB 변경은 수행하지 않았다.

### 배포 전 남은 범위

1. 실제 앱 기동과 전체 Flyway 이력의 V7 업그레이드를 격리 DB에서 검증한다.
2. 범위 지원 워커와 백엔드를 연결하여 성공 수집·실제 저장·재조회·공식 전환까지 검증한다. 현재 HTTP 테스트의 모의 Firebase/저장소 범위와 구분한다.
3. 검증된 워커·백엔드·프런트엔드 배포 버전, DB 백업 및 실패 시 중단·복구 절차를 확정한 뒤 운영 배포 승인을 받는다.

## 2026-09-12 전체 Flyway / 실제 JPA·MariaDB 검증 결과

### 실행과 격리

- `UniquePlayFlywayMariaDbTest`, `UniquePlayMariaDbIntegrationTest`와 `scripts/test-uniqueplay-db-integration.sh`를 추가했다.
- 테스트 전용 Java 21 linux/amd64 이미지 `aubl-backend:isolated-db-test-20260912`를 생성했다. 이 이미지는 Gradle·테스트를 포함하는 검증 전용이며 운영 런타임 이미지가 아니다.
- 내부 전용 Docker 네트워크에 일회성 MariaDB 11.8.5와 테스트 실행기만 연결했다. 운영 DB 주소·계정·Firebase 인증 파일은 전달하지 않았고 외부 포트를 공개하지 않았다.
- XML 보고서로 2개 테스트가 실제 실행됐고 제외 0건임을 확인했다. 결과는 Flyway 테스트 1건 통과, 실제 JPA 테스트 1건 실패다.

### 통과 범위

- 빈 격리 DB에서 실제 Flyway로 V1~V6 6개 migration 적용.
- V6 상태에 기존 후보 JSON·checksum을 넣고 V7 1개만 추가 적용.
- 기존 JSON·checksum·상태 보존과 구형 행의 범위 컬럼 NULL 유지.
- Flyway validate 통과, 다시 migrate할 때 적용 수 0, 성공 이력 7건·실패 이력 0건.

### 발견된 차단 사항

- 실제 Spring JPA 테스트에서는 마이그레이션 이후 첫 run 저장/조회부터 `Table 'scope_jpa.uniqueplay_sync_run' doesn't exist`로 실패했다.
- 마이그레이션의 대문자 테이블명 `UNIQUEPLAY_SYNC_RUN`과 Hibernate가 생성한 소문자 조회 `uniqueplay_sync_run`이 대소문자를 구분하는 기본 Linux MariaDB 환경에서 일치하지 않는다.
- 이번 날짜 범위 컬럼 자체의 SQL 오류로 판단하지 않는다. 운영 MariaDB의 `lower_case_table_names` 및 애플리케이션 naming strategy 설정을 읽기 전용으로 확인하여 환경 차이인지 배포 설정 결함인지 구분해야 한다.
- 테스트에만 임의 naming strategy를 넣거나 대소문자 설정을 바꿔 통과시키지 않았다. 실제 콜백 저장·독립 연결 재조회·오류 요청 롤백 검증은 첫 저장 실패 이후 도달하지 못했으므로 미완료다.
- Gradle 파일 감시 native 경고도 발생했으나 시험 실행은 진행됐다. 실제 실패 원인은 XML의 SQL 예외로 구분했다.

### 증거와 정리

- 보고서: `/tmp/aubl-db-integration.qoa3d9/test-results/`.
- 상세 로그: `/tmp/aubl-db-integration.qoa3d9/gradle.log`.
- 실행 요약: `/tmp/aubl-db-integration-run.log`. 이미지 빌드: `/tmp/aubl-db-test-build.log`.
- 실패 후 테스트 컨테이너 2개와 전용 네트워크를 제거하고 부재를 재조회했다. tmpfs 테스트 DB는 폐기했으며 보고서만 보존했다.
- 제품 코드 수정·운영 배포·운영 DB 변경·실제 수집은 수행하지 않았다. 다음 단계는 운영 DB 대소문자 설정 확인 및 해결 방안 승인 후 재검증이다.

## 2026-09-12 운영 명명 전략 확인 및 실제 DB 재검증 완료

### 운영 읽기 전용 확인

- Portainer에서 실행 중인 백엔드 v25의 환경변수 `SPRING_JPA_HIBERNATE_NAMING_PHYSICAL_STRATEGY=org.hibernate.boot.model.naming.PhysicalNamingStrategyStandardImpl`을 확인했다. 다른 환경변수·비밀값은 결과에 기록하지 않았다.
- 운영 MariaDB 컨테이너에서 `SELECT @@version, @@lower_case_table_names;`만 실행했다. 결과는 `11.8.5-MariaDB-ubu2404`, `0`이었다. 조회 후 콘솔 연결을 종료했다.
- 운영 DB도 테이블명의 대소문자를 구분한다. 이전 테스트 실패 원인은 DB 설정 차이가 아니라 테스트 실행기에 빠진 운영 Hibernate 명명 전략이었다.
- 운영 설정·데이터·컨테이너 상태는 변경하지 않았다. DB의 대소문자 설정을 바꾸거나 기존 migration을 고쳐서 우회하지 않았다.

### 수정 및 검증 결과

- `scripts/test-uniqueplay-db-integration.sh`의 테스트 실행기에 위 명명 전략 환경변수만 추가했다. 제품 코드나 테스트 assertion은 변경하지 않았다.
- 기존 검증 이미지로 격리 DB 두 개를 새로 생성하여 재실행했다. 결과: 2개 통합 테스트 실행, 실패·오류·제외 0건, `BUILD SUCCESSFUL`.
- `UniquePlayFlywayMariaDbTest`: V1~V6 적용 후 기존 데이터 삽입, V7 추가 적용, 기존 JSON·checksum·상태 및 NULL 범위 보존, Flyway validate와 재실행 0건, 성공 이력 7건 확인.
- `UniquePlayMariaDbIntegrationTest`: 빈 DB의 V1~V7 전체 적용, 실제 JPA 저장소와 트랜잭션을 통한 후보 병합·커밋, 별도 JDBC 연결의 게임·상세·checksum·날짜·상태 재조회, 기준 공식 JSON·활성 리비전 보존, DELETE 차이 없음, 재접수 거부와 차이 행 수 보존, 잘못된 범위 요청의 후보·차이 미저장 확인.
- 이전 실패 당시 도달하지 못했던 저장 이후 assertion들도 이번 실행에서 완료했다.
- 증거: `/tmp/aubl-db-integration.vHtu2j/test-results/`, `/tmp/aubl-db-integration.vHtu2j/gradle.log`. 실행 요약: `/tmp/aubl-db-integration-naming-run.log`.
- Gradle native 파일 감시 경고는 남았지만 테스트 XML과 종료 코드로 실제 실행 및 통과를 확인했다.
- 일회성 MariaDB·테스트 실행기와 내부 네트워크를 제거하고 부재를 재조회했다. 테스트 DB는 tmpfs였으며 보고서만 보존했다.

### 배포 조건 및 남은 범위

- 다음 배포에서도 운영의 `PhysicalNamingStrategyStandardImpl` 설정을 반드시 보존해야 한다. 새 환경에서는 이를 누락하면 대문자 SQL 테이블과 소문자 ORM 조회가 불일치한다.
- 이번 결과는 Spring JPA 슬라이스와 실제 MariaDB 검증이다. 전체 서비스 기동·실제 Firebase 인증·NAS 워커 원천 수집·Firestore 공식 게시까지 모두 통과했다는 의미는 아니다. 출판기는 외부 게시 방지를 위해 모의 처리했다.
- 남은 작업은 범위 지원 워커와 전체 앱의 성공 수집·공식 전환 통합 검증, 실제 모바일 기기 확인, 배포 버전 및 백업·중단·복구 절차 확정이다.
- 운영 이미지 업로드·교체·재시작, 운영 V7 적용, 실제 시즌 동기화 및 기록 수정은 수행하지 않았다.

## 2026-09-12 전체 앱·공식 반영 통합 검증 준비

- `UniquePlayFullFlowTest`와 `scripts/test-uniqueplay-full-flow.sh`를 추가했다. 전체 Spring 앱, 실제 MariaDB, Firestore 에뮬레이터를 사용하며 원천 워커 HTTP 응답은 합성 자료로 대체한다. 최초 자동 수집과 지정일 수집의 후보 저장·검증·게시·활성화 및 DB/Firestore 리비전 일치 검증을 구성했다.
- 검증 전용 이미지 `aubl-backend:full-flow-test-20260912` 빌드와 기존 콜백 테스트는 통과했다. 이 이미지는 운영 배포용이 아니다.
- 전체 흐름 실행은 준비 단계에서 중단됐다. 새 스크립트가 `--single_project_mode_error true`만 지정하고 필수 `--single_project_mode true`를 빠뜨려 Firestore 에뮬레이터가 시작하지 못했다. 전체 앱 통합 테스트 본문은 아직 실행되지 않았다.
- 네트워크 없는 일회성 진단 컨테이너에서 `Expected single_project_mode to be set for single_project_mode_error`를 확인했다. 제품 코드 문제가 아닌 실행 하네스 오류다.
- 초기 준비 실패 시 에뮬레이터 로그를 남기지 못하는 점도 보완 대상이다. 사용자 승인 후 옵션과 실패 로그 보존을 수정하여 재실행한다.
- `docs/release/uniqueplay-incremental-release-readiness-2026-09-12.md`에 운영 버전, 필수 환경변수, 미검증 범위, 배포 순서, 백업·중단·복구 및 미확정 승인 항목을 정리했다.
- 운영 접근·업로드·배포·DB 변경·실제 원천 수집은 하지 않았다. 이번 전체 흐름 성공을 아직 주장하지 않는다.

## 2026-09-12 전체 흐름 재실행: 기동 해결, Auth 에뮬레이터 미구성 확인

- 승인 후 `scripts/test-uniqueplay-full-flow.sh`에 `--single_project_mode true`를 추가하고, 준비 단계 실패를 포함한 종료 시 MariaDB·Firestore 로그 보존을 보강했다.
- 재실행에서 Firestore 에뮬레이터와 전체 Spring/Tomcat 앱이 정상 기동했다. 전체 흐름 테스트 1건이 실행됐으나 최초 관리자 scoped 요청이 기대한 202 대신 401 INVALID_FIREBASE_TOKEN으로 실패했다.
- 네트워크 없는 일회성 Java 진단에서 동일 합성 토큰을 Firebase SDK에 직접 전달한 결과는 `Failed to establish a connection`이었다. 단순 JWT 문구·형식 문제로 단정하지 않는다.
- 하네스는 `FIREBASE_AUTH_EMULATOR_HOST=firestore:9099`만 지정하고 실제 Auth 에뮬레이터를 실행하지 않았다. 이 SDK 검증 경로에는 인증 에뮬레이터 서비스가 필요하므로 이를 추가하고 에뮬레이터 계정/토큰을 발급받는 흐름으로 보완해야 한다. 운영 인증 비활성화나 mock으로 전체 인증 성공을 대체하지 않는다.
- 수집 요청 이후 후보 저장·게시·공식 활성화 assertion에는 아직 도달하지 않았다. 전체 흐름 통과로 계산하지 않는다.
- 증거: `/tmp/aubl-full-flow.Sozrl9/test-results/`, `/tmp/aubl-full-flow.Sozrl9/gradle.log`, `/tmp/aubl-full-flow.Sozrl9/firestore.log`, `/tmp/aubl-full-flow.Sozrl9/mariadb.log`. 요약: `/tmp/aubl-full-flow-rerun.log`.
- 테스트 컨테이너와 내부 네트워크 제거·부재 확인이 완료됐고 진단 컨테이너도 자동 제거됐다. 운영 접속·업로드·배포·DB 변경은 수행하지 않았다.
- 다음 조치는 실제 Firebase Auth 에뮬레이터 추가 및 테스트 계정/토큰 발급 후 재검증이며 사용자 승인 후 진행한다.

## 2026-09-12 Auth 에뮬레이터 연결 및 전체 흐름 검증 완료

### 변경 범위와 선택 근거

- `scripts/fixtures/uniqueplay-auth-emulator/Dockerfile`과 `firebase.json`으로 Firebase CLI `15.17.0`의 Auth 전용 에뮬레이터 이미지를 구성했다. 운영 Firebase 계정이나 자격 증명을 사용하지 않는다.
- `scripts/test-uniqueplay-full-flow.sh`의 격리 네트워크에 Auth 컨테이너를 추가하고 `FIREBASE_AUTH_EMULATOR_HOST=auth:9099`로 연결했다. MariaDB, Firestore, Auth의 준비 상태를 확인한 뒤 테스트를 시작한다.
- 백엔드 `UniquePlayFullFlowTest`는 직접 만든 JWT 대신 Auth 에뮬레이터에서 테스트 계정 생성, 관리자 커스텀 클레임 설정, 비밀번호 로그인을 거쳐 발급된 ID 토큰을 사용한다.
- 인증 필터를 우회하거나 Firebase 검증기를 mock으로 대체하지 않았다. 실제 Spring HTTP 진입점, 보안 필터, 서비스, JPA와 Firestore 게시 경로를 함께 통과시키기 위한 선택이다.
- 에뮬레이터 토큰 검증은 운영 Firebase의 서명 키 조회나 실제 운영 계정·권한 설정까지 검증한 것은 아니다. 에뮬레이터 환경 변수는 테스트 컨테이너에만 적용하며 운영 배포 설정에 포함하지 않는다.

### 실행 결과

| 항목 | 결과 |
|---|---|
| Auth 이미지 | `aubl-auth-emulator:15.17.0`, 빌드 성공 |
| 전체 흐름 이미지 | `aubl-backend:full-flow-test-20260912`, 빌드 성공 |
| 실행 명령 | `bash scripts/test-uniqueplay-full-flow.sh` |
| 전체 흐름 테스트 | 1개 테스트 메서드 안의 수집·게시 2회, 실패 0건, 오류 0건, 제외 0건 |
| 첫 번째 수집 | 활성 공식본 없는 자동 수집, 시작일 `2026-01-01` 전달 |
| 두 번째 수집 | `2026-09-11`부터 지정 수집, 범위 밖 기존 상세 보존 및 대상 상세 병합 |
| 인증 경계 | 익명 관리자 API 요청 및 잘못된 워커 토큰 콜백 거부 |
| 서버 저장 | 실제 MariaDB 저장·재조회, 기존 공식 리비전의 원본 보존, 경기 2건 유지 |
| 공식 전환 | 검증 → 검토 체크섬 → 게시 → 활성화 경로 통과 |
| 공개 투영 | Firestore 에뮬레이터의 메타데이터와 경기 2건이 활성 공식 리비전과 일치 |
| 정리 | 임시 컨테이너와 내부 네트워크 제거 확인, 운영 접근 없음 |

JUnit XML 및 컨테이너 로그: `/tmp/aubl-full-flow.fjWMy9`.
실행 요약: `/tmp/aubl-full-flow-auth-run.log`.
빌드 로그: `/tmp/aubl-auth-emulator-build.log`, `/tmp/aubl-full-flow-auth-build.log`.
위 `/tmp` 경로는 이번 로컬 실행의 임시 증거 위치이며 영구 보관 위치가 아니다.

테스트 전용 이미지의 빌드 출력 기준 manifest:

- Auth: `sha256:e2f088ff3c91ee6d7b2fab1ba6b2c7d86e460bb4819af739276be8261b9dba45`
- 전체 흐름: `sha256:b968ae08905e5241cd1fcb65c8e98fa46c0cb69fdd1da94f9d8bb864ebce34d2`

### 검증 범위의 한계와 다음 단계

이번 실행은 실제 백엔드 앱과 실제 DB·Firebase 에뮬레이터를 사용했지만, 수집원은 합성 자료를 반환하는 로컬 워커 대역이다. 실제 UniquePlay 사이트의 로그인, 페이지 수집, 날짜 필터 적용 및 NAS 네트워크는 검증하지 않았다. 테스트 메서드 1개를 독립된 다수의 테스트나 실제 경기 회귀로 계산하지 않는다.

이전 절의 Auth 미구성 문제는 이번 실행으로 해소했다. 단, 다음 항목은 여전히 별도 작업 또는 승인 대상이다.

1. 변경된 워커의 어댑터 버전 상향, 배포 후보 이미지 생성 및 태그·digest 고정.
2. 프런트엔드·백엔드·워커의 배포 조합, 기존 운영 설정과 백업·복구 명세 확정.
3. 승인된 범위에서 실제 NAS 워커와 UniquePlay 원천을 사용하는 제한 검증.
4. 실제 모바일 조작과 운영 인증·권한 설정 검증.
5. 이미지 push, 운영 배포, 실제 동기화·공식 전환은 별도 승인 후 실행.

현재 판정은 **격리 환경의 인증 포함 전체 흐름 통과**이며, 운영 배포 완료 또는 전면 운영 승인으로 해석하지 않는다. 이번 작업에서는 제품 코드나 운영 데이터를 변경하지 않고 테스트 하네스·에뮬레이터 구성과 문서를 보강했다.

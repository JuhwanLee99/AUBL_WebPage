# UniquePlay 증분 동기화 운영 배포 결과

## 최신 판정: 실제 증분 수집 미완료 (2026-09-13)

후속 로컬 구현과 A조 순위 진단 이후 최초 접수 경계를 보완했다. 워커 116건, 실제 MariaDB·HTTP 검증을 포함한 백엔드 69건이 모두 통과했다. 결과와 증거는 `uniqueplay-durable-storage-verification-2026-09-13.md`에 기록했다. 수정 코드는 아직 미배포이며 운영 재수집·복구·공식 전환은 추가로 실행하지 않았다.

`LIVE_SYNC_INCOMPLETE_STATE_DIVERGENCE`

연결 보완 이후 실제 증분 수집을 한 번 실행했다. 실행 `2c0f5b0a-863a-46ea-a091-f1041306f516`은 서버 기준 `SINCE_LAST_SYNC / 2026-09-11` 범위로 시작했으나, DB에 `RUNNING / CONNECTING`으로 남고 후보 데이터가 없는 반면 워커의 활성 실행 수는 0이다. 정상 수집 성공으로 판정하지 않는다.

기존 공식 리비전 `291109ef-b73a-44ad-ab8c-121ac67812ca`와 체크섬은 읽기 전용 DB 조회에서 동일함을 확인했다. 게시, 공식 활성화, 재수집, 재시작 및 DB 상태 수동 변경은 하지 않았다. 실패 콜백 오류를 무시하는 코드와 전달 보장 부재를 확인했지만 최초 실패 원인은 아직 확정하지 못했다.

상세 증거와 승인 후 수행할 복구 과제는 `uniqueplay-incremental-live-collection-2026-09-13.md`에 기록했다. **아래의 연결 준비 완료 및 실제 수집 미실행 표기는 수집 시작 이전의 역사적 상태이며, 현재 판정은 본 절을 우선한다.**

작성일: 2026-09-12, 시간대: Asia/Seoul.

## 0. 최신 상태: 워커 연결 보완 후 (2026-09-13)

`DEPLOYED_CONNECTION_READY_PENDING_LIVE_SYNC`

2026-09-12에 운영 도메인과 로컬 5173의 CORS를 보완했고, 2026-09-13에는 백엔드의 워커 주소 및 기존 서비스 토큰 연결을 추가했다. 관리자 화면에서 `연결됨`, `인증: 확인됨`, 활성 실행 없음과 수집 시작 버튼 활성화를 확인했다. CORS 오류 및 워커 미설정 오류는 모두 해소됐다.

최신 백엔드 컨테이너는 `c96e724ac8f5da71d179ef4c241beafd17c9c3aaec0d80a752be78694dbe8231`이다. 이미지와 DB 연결은 유지했으며 기존 환경변수 19개에 워커 연결 설정 2개를 추가하여 최종 21개다. 워커 인증 조회 3건, 재배포 후 CORS·비인증 접근 확인 4건 및 실제 관리자 화면 연결 확인을 완료했다. 상세 결과는 `uniqueplay-production-worker-connection-2026-09-13.md`에 기록했다.

실제 증분 수집, 게시, 공식 활성화는 아직 실행하지 않았다. 연결 확인을 실제 데이터 동기화 검증 또는 서비스 전면 운영 승인으로 확대 해석하지 않는다. TrueNAS 저장 원본과 Portainer 실행 구성의 차이도 여전히 남아 있다.

아래 1~8절은 최초 배포 직후의 관측 기록이다. CORS 실패 및 승인 대기 문구는 당시 상태이며 최신 결과는 이 절과 후속 문서를 기준으로 읽는다.

## 1. 배포 직후 판정 (CORS 보완 전)

`DEPLOYED_BLOCKED_BY_CORS`

신규 백엔드, 워커, 웹 배포와 DB V7 적용은 완료했다. 그러나 운영 웹에서 관리자 동기화 세션 조회가 `Failed to fetch`로 실패했고, 운영 API에 대한 CORS 사전 요청이 `403 Invalid CORS request`로 거부됐다. 따라서 **증분 동기화의 운영 사용 승인 또는 정상 서비스 완료로 판정하지 않는다.**

백엔드와 워커는 신규 이미지로 실행 중이며 배포 중의 백엔드 중단은 해제됐다. 웹도 신규 릴리스다. 자동 롤백, 실제 수집, 게시, 공식 리비전 활성화는 실행하지 않았다.

이 문서는 이전 실행 명세의 미완료 상태를 덮어쓰지 않고 실제 실행 증거를 추가한다. 이전 문서의 승인 대기, 이미지 미업로드, 백업 미완료 표시는 해당 문서 작성 시점의 상태이며 현재 배포 상태는 이 문서를 기준으로 읽는다.

## 2. 실제 실행 순서

1. 복구된 `v25 + aubl` 연결과 기존 환경변수를 기준선으로 확보했다.
2. 기존 워커의 `/health`에서 HTTP 200, `activeRuns: 0`을 확인했다. DB에도 진행 중인 동기화 실행이 없었다.
3. 백엔드를 중단하여 신규 요청 유입을 막고, 워커와 DB의 유휴 상태를 다시 확인했다.
4. 백엔드 중단을 유지한 채 워커를 신규 이미지로 교체했다. 처음 안내한 백엔드 우선 순서 대신, 새 백엔드가 요청을 받기 전에 호환 워커를 준비하는 순서로 진행했다.
5. 백엔드를 신규 이미지로 교체했다. 기존 운영 DB, 인증 설정, 포트, 마운트와 네트워크를 복제하고 이미지 참조만 변경했다.
6. 백엔드 기동, Flyway V7, 워커 버전, 공식 리비전 보존을 확인했다.
7. 준비된 웹 후보를 `aubl-backup` Hosting에 배포했다. Functions, Firestore 규칙 및 다른 Firebase 프로젝트는 배포하지 않았다.
8. 운영 도메인 번들, 비인증 API 차단, 웹 렌더링과 관리자 동기화 화면을 확인했다. CORS 차단을 발견해 사용 가능 판정을 보류했다.

## 3. 배포 산출물

| 구성요소 | 운영 적용 값 |
|---|---|
| 백엔드 이미지 태그 | `synapse9983/aubl-backend:incremental-20260912-ea0b89d7740e` |
| 백엔드 manifest digest | `sha256:ea0b89d7740e3a3f1a2592eecfb360e3d49314a0ed6e1381b3c58f96b959b62d` |
| 백엔드 실행 image ID | `sha256:6c9e58bae79cc069fd8c6501c54877eb153ce95ffb73a156610354a2d16e66c5` |
| 백엔드 컨테이너 ID | `051178926ccec825d41a65b6b469ee7b54fe5c157812fc73f59a8010236397de` |
| 워커 이미지 태그 | `synapse9983/aubl-uniqueplay-sync-worker:incremental-20260912-101af1ec62df` |
| 워커 manifest digest | `sha256:101af1ec62df94924e91ffd1d91878afec799da4231f1cf3cd3121614f15ed46` |
| 워커 실행 image ID | `sha256:9b8f1864c4604f6c1dd6efe346ad64f79433c0938f88e94c2d43e770c4a9d86f` |
| 워커 컨테이너 ID | `a5c45314afd000bc8f6f5065b303cc3088eaf4d7564f1e7d63bb94fc238cd464` |
| 워커 adapterVersion | `2026.09.12.14` |
| Firebase 프로젝트 / 사이트 | `aubl-backup` / `aubl-backup` |
| Hosting version | `projects/aubl-backup/sites/aubl-backup/versions/f17d235085d12750` |
| Hosting release | `projects/aubl-backup/sites/aubl-backup/channels/live/releases/1789224570008000` |
| Hosting 공개 시각 | `2026-09-12 23:49:30.008 KST` |
| 운영 메인 번들 | `/assets/index-D5En6AtD.js` |

두 컨테이너 모두 태그뿐 아니라 manifest digest를 포함해 지정했다. 실행 image ID도 준비된 후보와 일치했다. 새 이미지를 다시 빌드하지 않았으며 테스트 전용 이미지는 배포하지 않았다.

웹은 `/tmp/aubl-web-candidate.huP5xs/workspace/dist`의 준비된 후보를 사용했다. 배포 설정은 `/tmp/aubl-production-deploy.QNFwzD/firebase.json`에 별도로 작성하여 워크스페이스의 다른 `dist`를 잘못 배포하지 않도록 했다. Firebase CLI가 보고한 실제 Hosting 배포 파일 수는 46개다. 후보 생성 문서의 전체 출력 파일 수와 배포 대상 파일 수를 동일한 수치로 취급하지 않는다.

웹 후보 아카이브 SHA-256: `7f3a405baa62f46c4b2a281645a0d0e97b993aec0a129e31af700bea5bde1810`.

## 4. 설정과 데이터 보존

백엔드 환경변수 18개, 워커 환경변수 12개를 교체 전후 비교하여 모두 동일함을 확인했다. 비교 과정의 비밀 값은 이 문서에 기록하지 않는다.

- DB: `aubl`.
- JDBC: `jdbc:mariadb://172.30.1.33:3306/aubl`.
- 백엔드 기존 호스트 포트: `30080 -> 8080`.
- 기존 네트워크: `ix-aubl-backend_default`.
- 기존 백엔드 마운트: `/mnt/ssd_500_p31/aubl_db -> /app/config`.
- 워커 콜백 대상: `https://api.aubl.club`.
- 기존 워커 인증 및 UniquePlay 세션 환경변수는 그대로 유지했다.
- TrueNAS 원본 앱 설정은 사용자 선택에 따라 수정하지 않았다.

### DB 마이그레이션

백엔드 로그에서 다음 실제 실행을 확인했다.

- `23:47:55.741`: 기존 스키마 버전 6.
- `23:47:55.749`: `7 - uniqueplay incremental scope` 적용 시작.
- `23:47:55.769`: 1개 마이그레이션 성공, 스키마 버전 V7.
- `23:47:59.506`: 애플리케이션 기동 완료.

이후 DB 읽기 전용 트랜잭션으로 Flyway V1~V7의 `success=1`과 실제 컬럼을 확인했다.

| 컬럼 | 타입 | NULL 허용 |
|---|---|---|
| `sync_mode` | `varchar(24)` | YES |
| `sync_from_date` | `date` | YES |

### 기존 공식본

배포 전후 아래 2026 활성 공식본 식별값이 동일했다.

- revision: `291109ef-b73a-44ad-ab8c-121ac67812ca`.
- run: `cf773fa4-b019-4f47-a3c6-81fe11bd0495`.
- checksum: `e16a915598597dd7a76529bff9f5a19aea6d92b7348c7485e471bc127acc0764`.

기존 동기화 실행 18건의 상태 분포도 동일했다: `ACTIVE=4`, `FAILED=8`, `REAUTH_REQUIRED=2`, `REVIEW_REQUIRED=3`, `VALIDATION_FAILED=1`. 이 실패 상태들은 배포 전부터 존재한 실행 이력이며 이번 배포에서 생성한 실패 건수가 아니다.

이 확인은 활성 공식본 식별값과 실행 상태 보존의 증거다. 운영 DB 전체 행이 완전히 동일하다는 전수 검증으로 확대 해석하지 않는다. V7에 의한 스키마 변경은 의도된 차이다.

## 5. 배포 후 확인 결과

| 항목 | 관측 결과 | 판정 |
|---|---|---|
| 신규 백엔드 실행 | Portainer running, 애플리케이션 시작 완료 | 통과 |
| 신규 워커 상태 | `/health` HTTP 200, `ok=true`, `activeRuns=0`, adapter `2026.09.12.14` | 통과 |
| DB V7 | 마이그레이션 성공 및 컬럼 실제 존재 | 통과 |
| 기존 공식본 | revision/run/checksum 동일 | 통과 |
| Hosting 공개 | CLI release complete, live version FINALIZED | 통과 |
| 운영 도메인 번들 | `https://aubl.club/`에서 후보 메인 번들 참조 | 통과 |
| 관리자 API 비인증 요청 | 기존 실행 조회 GET에 HTTP 401 | 확인 범위 내 통과 |
| 홈 렌더링 | 일정, 최근 결과, 조별 순위 표시 | 부분 확인 |
| 홈 시즌 정보 | 시즌 정보를 확인하지 못했다는 경고, 개인 기록 연결 확인 필요 표시 | 미해결 |
| 관리자 화면 접근 | 기존 로그인 세션으로 CMS 및 동기화 화면 접근 | 통과 |
| 증분 범위 입력 | 기본 모드와 지정 날짜부터 다시 수집 옵션 표시 | 표시 확인 |
| 관리자 동기화 세션 조회 | `Failed to fetch`, 수집 시작 비활성 | 실패 |
| 운영 API CORS | `https://aubl.club` 출처의 사전 요청 HTTP 403 | 실패 |

실제 수집, 날짜 범위별 데이터 병합, 검토, 게시, 공식 활성화의 운영 경로는 실행하지 않았다. 단위 테스트나 E2E를 이번 배포에서 새로 실행한 것으로 집계하지 않는다.

## 6. 차단 원인과 다음 작업

### 확인된 CORS 실패

운영 관리자 API에 다음 읽기 전용 진단을 수행했다.

```http
OPTIONS /api/admin/sync/unique-play/runs/cf773fa4-b019-4f47-a3c6-81fe11bd0495
Origin: https://aubl.club
Access-Control-Request-Method: GET
Access-Control-Request-Headers: authorization,content-type
```

`2026-09-12 23:51:34 KST` 응답은 `403 Invalid CORS request`였으며 해당 출처를 허용하는 응답 헤더가 없었다. 비브라우저의 비인증 GET이 401을 반환하는 것만으로 실제 브라우저 통신이 정상이라고 볼 수 없다.

관리자 세션 조회 실패와 함께 운영 웹 출처의 CORS 거부가 확인됐지만, 정확히 어느 설정 또는 필터가 거부하는지, 이번 배포에서 새로 발생한 회귀인지, 홈 경고 전체가 같은 원인인지는 아직 확정하지 않았다. 배포 전 동일 CORS 요청의 대조 결과는 없다.

다음 작업은 사용자 승인 후 진행한다.

1. 백엔드 CORS 설정과 보안 필터 순서를 좁게 확인하여 실제 운영 출처와 사전 요청 처리의 누락을 찾는다.
2. 필요한 기존 운영 출처만 명시적으로 허용한다. 임의의 와일드카드 출처 허용, 인증 해제, 토큰 출력으로 우회하지 않는다.
3. 수정 후보를 검증한 뒤 새 이미지로 배포한다. DB와 현재 공식본은 유지한다.
4. 운영 출처의 사전 요청, 로그인된 관리자 세션 조회, 비인증 거부, 홈 API 조회를 다시 확인한다.
5. 별도 승인된 제한적 실제 증분 수집을 진행한다. 수집과 게시/활성화 승인을 혼동하지 않는다.

### 별도 운영 위험

- TrueNAS 저장 앱 설정에는 이전 `v1 / aubl_db` 구성이 남아 있다. Portainer에서 유지 중인 신규 이미지와 다르므로 TrueNAS 앱 재배포 시 되돌아갈 위험이 남는다. 이를 해결한 것으로 기록하지 않는다.
- 기동 로그에 Flyway가 검증한 MariaDB 상한보다 운영 MariaDB 11.8이 새 버전이라는 경고가 있었다. 이번 V7 실행은 성공했다.
- Spring 기본 생성 보안 비밀번호 경고가 기동 로그에 나타났다. 실제 Firebase 관리자 인증 및 보안 설정의 의도와 맞는지 별도 검토가 필요하다. 비밀번호 값은 기록하지 않는다.
- Portainer 환경변수와 기동 로그 원문에는 인증 정보가 포함될 수 있다. 원문 도구 출력이나 전체 작업 기록을 공개 공유하지 않는다. 별도 자격증명 변경은 이번 배포에서 수행하지 않았다.

## 7. 백업, 복구 기준, 정리

운영 NAS 백업과 격리 복원 검증은 앞 단계에서 완료했으며 이번 배포에서도 유지했다.

- 백업: `/mnt/ssd_500_p31/aubl_db/.aubl-deployment-backups/uniqueplay-20260912T141030Z.OUWUAD/aubl.sql.gz`.
- 크기: 4,756,462 bytes.
- SHA-256: `ff2575c569e5e28f345464db89bfa3ed8633d6d45d24a8ce316ab08a7e97b469`.
- 같은 NAS 데이터셋 내부 백업이므로 오프사이트 재해 복구본은 아니다.
- 앞 단계의 임시 격리 복원 검증 컨테이너는 종료 상태로 증거 보존 중이다. 이번에 삭제하지 않았다.
- 운영 DB와 워커의 조회 콘솔은 종료했고 Connect 화면으로 돌아온 것을 확인했다.

복구 참조는 아래와 같다. 이번 실행에서 롤백은 하지 않았다.

- 백엔드 이전 정상 이미지: `synapse9983/aubl-backend:v25@sha256:e10d8890bcd42258dfbab18892cbc0204203275f1208822f5bd50fefc0731cb4`.
- 백엔드 복구 시 DB는 반드시 `aubl`을 유지한다. `v1 / aubl_db`는 복구 기준이 아니다.
- 이전 웹 버전: `projects/aubl-backup/sites/aubl-backup/versions/ea17cd9e89d1bf2e`.
- 이전 웹 release: `projects/aubl-backup/sites/aubl-backup/channels/live/releases/1788602428335000`.
- V7 컬럼 삭제, Flyway history 수동 변경, 운영 DB 백업 덮어쓰기를 자동 복구 절차로 사용하지 않는다.

## 8. 다음 작업 인계 요약

현재 신규 버전 세 구성요소는 배포됐고 DB는 V7이다. 기존 공식 기록은 보존됐지만, 브라우저 CORS 거부로 관리자 수집을 사용할 수 없다. **가장 먼저 CORS 수정 승인과 원인 확인을 진행한다. 실제 UniquePlay 수집 또는 공식 활성화부터 시작하지 않는다.**

# UniquePlay 수집 중단 기능 운영 배포 결과

## 1. 현재 판정

- 기준일: 2026-09-13, 한국 시간.
- 상태: `DEPLOYED_AND_STUCK_RUN_CANCELED`.
- 백엔드, 수집 워커, Firebase Hosting 배포를 완료했다.
- 오전 00:10부터 `CONNECTING`에 머물던 실행을 관리자 화면에서 중단했다. 실행을 삭제하거나 SQL로 상태를 강제 변경하지 않았다.
- 기존 공식 리비전은 유지했다. 새 수집, 후보 게시, 리비전 활성화는 실행하지 않았다.
- **TrueNAS 원본 앱 설정과 Portainer 실행 설정의 불일치는 남아 있다. 현재 배포 성공과 TrueNAS 앱 재배포 후 설정 보존은 별도 판정이다.**

이 문서는 `uniqueplay-collection-cancellation-2026-09-13.md`의 이전 단계 판정과 DB 검증 대기 상태를 대체한다. 이전 검증 로그는 삭제하지 않는다.

## 2. 승인받아 완료한 수정과 검증

승인된 두 수정은 영수증 접근자의 `getDeliveryId()`를 실제 계약인 `getId()`로 바꾼 것과, Gradle `--tests` 필터를 `test` 태스크에 연결한 것이다. 이후 제품 타입 검사, 실제 MariaDB 통합 테스트와 이미지 빌드를 수행했다.

| 검증 | 결과 | 범위 및 한계 |
| --- | --- | --- |
| 프런트엔드 타입 검사 | 통과 | 현재 제품 코드 |
| 워커 단위/회귀 | 130 통과, 실패·제외 0 | 취소 영속화, 수집/전송 중단, 재시도, 기존 전송 계약 |
| 실제 MariaDB 통합 | 84 통과, 실패·오류·제외 0 | 신규 취소 15건과 기존 DB/HTTP/프로토콜 회귀 |
| 중단 UI | 16 시나리오 통과 | PC/모바일 뷰포트, 모의 인증/API, 외부 수집 없음 |
| 날짜 범위 UI 회귀 | 8개 확인 통과 | 기존 증분/지정일 수집 흐름 |
| 실제 워커 이미지 | 통과 | 격리 네트워크, 인증 차단, 중단 멱등성, 재시작 후 `FENCED` 복구 |
| UID 999 Chromium | 통과 | 네트워크 없는 이미지에서 실제 브라우저 실행·종료 |
| 운영 관리자 흐름 | 통과 | 실제 관리자 로그인, 중단 요청, DB 영수증, 워커 차단, 활성 실행 해제 |

MariaDB 테스트는 별도 임시 DB/네트워크에서 실행하고 정리했다. 운영 경기 데이터를 생성하지 않았다. 모바일 UI 검증은 뷰포트 검증이며 실제 모바일 기기 검증으로 계산하지 않는다. UI 응답 유실 사례는 모의 503/잘못된 ACK이며 실제 운영 통신 장애를 주입하지 않았다.

실제 MariaDB 세부 결과:

| 테스트 클래스 | 통과 |
| --- | ---: |
| QualificationFinalizeServiceTest | 7 |
| UniquePlayCallbackProtocolSwitchTest | 2 |
| UniquePlayCancellationMariaDbTest | 15 |
| UniquePlayDeliveryHttpTest | 2 |
| UniquePlayDeliveryMariaDbTest | 12 |
| UniquePlayDeliveryServiceTest | 29 |
| UniquePlayFlywayMariaDbTest | 2 |
| UniquePlayMariaDbIntegrationTest | 1 |
| UniquePlayScopedCallbackTest | 6 |
| UniquePlayScopedHttpTest | 8 |

## 3. 배포 전 백업

- NAS 경로: `/mnt/ssd_500_p31/aubl_db/.aubl-deployment-backups/cancel-20260913.6FvDBx/aubl.sql.gz`.
- DB 컨테이너 경로: `/var/lib/mysql/.aubl-deployment-backups/cancel-20260913.6FvDBx/aubl.sql.gz`.
- 대상 DB: `aubl`. `--single-transaction --quick --routines --events --triggers --hex-blob`을 사용했다.
- 크기: 4,756,570 bytes.
- SHA-256: `d9c933fc04676368688c0f68545d8f4ab78dfa650f195e52002e5a1ce493639c`.
- 소유자 `999:999`, 파일 권한 `0600`. 같은 폴더에 `SHA256SUMS` 보관.
- `gzip -t` 통과. 이번 새 백업의 전체 복원은 수행하지 않았다. 기존 별도 백업의 복원 검증과 혼동하지 않는다.
- 컨테이너 root의 첫 백업 디렉터리 생성은 ACL에 거부됐고 덤프 시작 전에 종료됐다. ACL을 넓히지 않고 기존 소유자인 mysql로 백업했다.
- 동일 NAS 데이터셋 내 백업이므로 NAS 전체 장애에 대비한 외부 백업은 아니다.

## 4. 실제 배포 산출물과 실행 설정

### 백엔드

- 이미지: `synapse9983/aubl-backend:cancel-20260913-c9fb2b564e4d`.
- Digest: `sha256:26033a12d17a83b839454b0864166868d1bf3728aff3506471139ba8ed7b89a5`.
- 컨테이너: `9e370d795b985246e51aa2456bd7ca23250d4c74843fc65d0ba9633301e6915f`.
- 이름: `ix-aubl-backend-aubl-backend-1`.
- 11:17:30 기동 완료. DB `aubl`의 Flyway 마이그레이션이 `V7`에서 `V8`로 정상 적용됐다.
- 기존 포트 `30080:8080`, 네트워크, DB 및 인증 설정, CORS `https://aubl.club,http://localhost:5173`를 유지했다.
- `UNIQUEPLAY_REQUIRE_DURABLE_CALLBACKS=true`를 추가했다. 구형 워커가 정지한 뒤 적용했다.
- 이미지에는 검증한 JAR와 런타임만 포함하며 로컬 `.env`를 빌드 컨텍스트에 넣지 않았다.

### 워커

- 이미지: `synapse9983/aubl-uniqueplay-sync-worker:cancel-20260913-b265caa77f69`.
- Digest: `sha256:c3058c04790600c0875f6b2b84b6fcc41339dafb06b22756110b58fb8da1ca09`.
- 컨테이너: `88a86c078596c98bc803c59a54e245062c2bc87c86087880bd6b0d0709aeabf6`.
- 이름: `aubl-uniqueplay-sync-worker`. 11:18:24 생성 후 정상 실행.
- 실행 계정: `999:999`. NAS 전용 상태 폴더 소유자와 일치한다.
- 바인드: `/mnt/ssd_500_p31/aubl_db/.aubl-sync-worker-state:/state`.
- `SYNC_STATE_DIR=/state`. 디렉터리 권한 `0700`. DB 전체 폴더를 워커에 노출하지 않는다.
- 기존 서비스 토큰, 원천 세션, 콜백 주소와 네트워크를 보존했다. 호스트 포트를 공개하지 않았다.
- 운영 헬스: HTTP 200, `ok=true`, `protocolVersion=2`, `cancellationProtocolVersion=1`, `adapterVersion=2026.09.13.15`.
- 교체 전 구형 워커의 `activeRuns=0`을 확인한 다음 정지했다. 두 워커를 동시에 실행하지 않았다.

### 프런트엔드

- Firebase 프로젝트/사이트: `aubl-backup`. Hosting만 배포했다. Functions, Firestore 규칙 및 데이터는 배포하지 않았다.
- API 대상: `https://api.aubl.club`.
- 주 번들: `/assets/index-gUm72q18.js`.
- 소스 SHA-256: `0702bd061108c7e6b6fa858afdaa798b86323f988b686051243fcc6f1e873bea`.
- 산출물 SHA-256: `6785783553fb5dfe128ee3f8a73b1c5182e30e239e55cd96e7e81da3345f012f`.
- CLI 업로드 46개 파일, 릴리스 완료. 로컬 산출물 목록과 Hosting ignore 적용 후 업로드 수는 구분한다.
- 실제 `aubl.club/admin/unique-play-sync`에서 새 번들 제공과 중단 패널을 확인했다.
- CLI 성공 출력에 Hosting release ID는 없었다. 확인하지 않은 ID는 문서에 만들지 않았다.

## 5. 정체된 실행의 운영 중단 결과

| 항목 | 확인값 |
| --- | --- |
| 실행 ID | `2c0f5b0a-863a-46ea-a091-f1041306f516` |
| 중단 요청 ID | `1961cb94-cf77-48f7-af91-2314ec01f153` |
| 시작/정체 시점 | 2026-09-13 00:10:49, `RUNNING` / `CONNECTING` |
| 중단 완료 시점 | 2026-09-13 11:20:51 |
| DB 상태/단계 | `CANCELED` / `CANCELED` |
| 진단 코드 | `ADMIN_CANCELLED` |
| 영수증 | `kind=cancel`, 동일 요청 ID, 요청자·사유 보존 |
| 워커 상태 | `FENCED`, `active=false`, `pendingDeliveries=0` |
| 관리자 연결 세션 | 활성 실행 없음 |
| 새 수집 버튼 | 활성화됨. 실제로 누르지 않음 |
| 후보/게시 리비전 | 후보 없음, `published_revision=NULL` |
| 기존 공식 리비전 | `291109ef-b73a-44ad-ab8c-121ac67812ca` 유지 |

요청 사유는 장기 `CONNECTING` 정체 정리와 기존 공식 기록·실행 이력 보존을 명시했다. 실제 관리자 화면의 요청에서 서버 차단, 워커 영속 중단 증명, DB 최종 확정까지 연결됐으며 SQL 쓰기는 수행하지 않았다.

중단 후 공개 시즌 API는 HTTP 200이고 `sourceFreshness.publishedRevision` 및 경기/순위의 `syncRevision`이 기존 공식 리비전이다. 익명 관리자 취소 조회는 HTTP 401로 거부됐다. 운영에서 비관리자 로그인·실제 전송 장애를 추가로 주입한 것은 아니다.

## 6. 검증 중 실패와 판정 범위

- 샌드박스 내 로컬 UI 서버 실행은 바인드 권한 오류로 실패했고, 허용된 실행 환경에서 재실행해 통과했다.
- 감사 조회 첫 SQL은 존재하지 않는 `sequence` 컬럼을 사용해 읽기 오류가 났다. 제품 오류나 DB 변경은 없었다. 실제 `delivery_id, run_id, kind, actor, note` 조회로 영수증을 확인했다.
- 마지막 공개 API 프로브에서 전체 체크섬 문자열을 검색한 결과는 `false`였다. **이 API는 체크섬 필드를 제공하지 않으므로 체크섬 변경을 의미하지 않는다.** 응답 필드 확인 결과 `sourceFreshness.publishedRevision`과 모든 반환 기록의 리비전은 기존 값이다.
- `public-after-cancellation.json`과 `deployment-manifest.json`의 `officialChecksumPreserved=false`는 해당 문자열 검색의 원시 결과이며 체크섬 불일치 판정으로 사용하지 않는다. 원시 실패를 삭제하지 않고 이 문서에서 판정 범위를 정정한다. 전체 체크섬의 운영 DB 재비교를 통과했다고 주장하지 않는다.
- DB/워커/UI 제품 테스트 통과와 위 운영 점검 보조 명령의 실패를 구분한다.
- Spring 시작 로그의 자동 생성 보안 비밀번호 안내와 Flyway의 MariaDB 11.8 지원 범위 경고가 있었다. 실제 관리자 인증과 익명 거부, 마이그레이션은 확인했지만 이 경고의 제거를 이번 배포 완료 항목으로 포함하지 않는다.

## 7. 남은 운영 과제와 중단 기준

1. **TrueNAS 원본 설정 정합화:** 사용자 요청대로 Portainer에서 교체했다. 기존 TrueNAS 외부 관리 앱의 저장 설정은 과거 이미지/DB를 가리키므로 TrueNAS 앱 재배포로 현재 설정이 되돌아갈 수 있다. 정합화 전 TrueNAS 앱의 재배포·업데이트를 실행하지 않는다. NAS 재시작 후 보존까지 검증했다고 주장하지 않는다.
2. **새 수집의 별도 확인:** 이번에는 정체된 실행만 종료했다. 다음 수집은 기존 공식본을 기준으로 수집하고 후보를 검토한 후 별도 승인으로 게시·활성화한다. 이번 배포가 실제 새 원천 수집의 성공을 의미하지 않는다.
3. **A조 순위:** 기존 공개본을 보존했으므로 이전 순위 문제를 운영 데이터에서 정정한 것은 아니다. 새 워커의 모순 순위 차단과 다음 후보 검수로 확인하며, 임의 재순위 산출·공식 활성화를 하지 않는다.
4. **백업/복구:** 새 백업 전체 복원과 외부 사본을 추가 검토한다. DB `V8`을 임의 삭제하거나 구형 워커로 자동 복귀하지 않는다. 장애 시 새 수집을 차단하고 DB·상태 폴더·영수증을 함께 보존한다.
5. **관측 범위:** 실제 모바일 기기, 실제 운영 장애 주입, 새 수집 전체 완료는 이번 검증 범위 밖이다. 로컬 합성 검증과 구분한다.

## 8. 증거 위치

증거 폴더: `docs/release/evidence/uniqueplay-cancellation-2026-09-13/`.

- `deployment-manifest.json`: 이미지, 컨테이너, 백업, 중단 ID 및 운영 관측값.
- `db-verification-summary.json`, `db-junit/`, `db-gradle.log`, `db-cleanup.log`: 실제 DB 84건과 정리 결과.
- `worker.tap`, `typecheck.log`, `cancellation-ui-results.json`, `cancellation-ui.log`, `scope-ui.log`: 단위/UI 검증.
- `backend-image-build.log`, `worker-image-build.log`, `backend-image-push.log`, `worker-image-push.log`: 빌드와 승인된 레지스트리 업로드.
- `web-candidate.json`, `web-build.log`, `hosting-deploy.log`, `public-web-check.json`: 고정 산출물과 Hosting 배포.
- `public-after-cancellation.json`: 중단 후 공개 API 원시 프로브. 체크섬 필드 미제공에 관한 6절의 해석을 함께 적용한다.

비밀번호, 서비스 토큰, 원천 로그인 세션 및 DB 덤프를 저장소 문서에 복사하지 않는다. 운영 UI/콘솔 관측값은 요약으로 남기고 민감정보가 포함될 수 있는 원문 로그 전체는 보존하지 않는다.

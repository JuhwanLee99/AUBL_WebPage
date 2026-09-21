# 순위 안정화 워커 배포 준비

날짜: 2026-09-13 KST

상태: `DEPLOYED_COLLECTION_FAILED_DIAGNOSTICS_PENDING`

## 실제 배포·수집 결과

사용자가 워커 소스 포함 이미지의 목적 저장소 업로드를 명시적으로 승인한 후 push를 완료했다. 반환 digest는 준비된 로컬 digest와 일치했다.

- 업로드/배포 이미지: `synapse9983/aubl-uniqueplay-sync-worker:standings-20260913-8d9a46c475f7`.
- 레지스트리 및 Portainer 지정 digest: `sha256:a1036c127799dec9acd2dbe4b8cbe384e4e6ad079a40fe539657549f2866f79d`.
- 새 컨테이너: `50f660d582dae82e9c445bc58c5b47943ce9f8068f8b807c204d4ed109176c8e`.
- 생성/시작: 2026-09-13 13:30:41 KST.
- 어댑터: `2026.09.13.16`. 기동 후 health는 `ok=true`, 활성/대기/차단 0건, durable protocol 2, cancellation protocol 1.
- 교체 전 환경변수 13개의 키와 값을 기존 컨테이너와 비공개 대조해 모두 일치함을 확인했다. 값은 증거에 출력하지 않았다.
- 실행 UID `999:999`, `node src/server.mjs`, `/app`, 기존 네트워크 `ix-aubl-backend_default`, writable `/state` NAS bind, `Unless stopped`, 호스트 포트 미공개 설정을 유지했다.
- 설정 보존 검증이 부족하다는 보안 검토로 첫 제출이 차단됐다. 값을 대조한 뒤 같은 Portainer 경로로 다시 제출했으며 우회 실행하지 않았다.
- 백엔드 이미지와 Hosting, DB 스키마는 이번 교체에서 변경하지 않았다.

### 신규 수집: 순위 충돌은 재발하지 않았으나 전체 완료는 실패

| 항목 | 결과 |
| --- | --- |
| 실행 ID | `cc336cc0-779c-4264-871d-86e0f39b4986` |
| 범위 | 2026시즌, 마지막 공식 반영 이후(기본) |
| 시작 | 13:33:42 KST |
| 실패 갱신 | 13:34:59 KST |
| 종료 코드 | `COLLECTION_FAILED` |
| 후보/체크섬 | 생성되지 않음 |
| 기준 공식본 | `291109ef-b73a-44ad-ab8c-121ac67812ca` |
| 마지막 진행 전달 ACK | sequence 22, `babedd2d-e1b2-4513-b3e0-01206612e7ab` |
| 실패 전달 ACK | sequence 23, `993871e8-4407-45d5-a002-c3615813091e` |

관리자 화면에서 A조 통과 후 B조, 이후 D조 투수 단계 진행을 확인했다. 워커 로그에는 진행 통지 22개와 실패 통지 1개가 ACK되었다. 현재 코드의 조별 5개 진행 통지 순서에 따르면 E조 타자 규정 IN까지 성공하고, 이후 투수 규정 IN 전환·수집 구간에서 실패한 것으로 추론된다. 정확한 실패 함수·원천 행은 현재 로그만으로 확정하지 않는다.

진행 sequence 19에는 HTTP 502가 한 번 있었으나 동일 전달 ID `12dfbbcd-b3e1-425a-9823-241b4c7079b6`가 이후 ACK됐다. 따라서 이 502 자체를 수집 실패의 확정 원인으로 간주하지 않는다. 오류 분류 로그는 `code=COLLECTION_FAILED causeCode=COLLECTION_FAILED`로만 남았다.

별도로 원천 브라우저를 열어 기록 탭을 확인했을 때 시즌선택/조리그분류가 채워지지 않고 표가 빈 상태였다. 시즌 선택 대화상자에도 선택 항목이 나타나지 않았다. 이는 해당 시점의 브라우저 관측이며 실패 당시 워커 DOM 복원이나 원천 장애 확정 증거는 아니다.

### 공개 서비스·공식 기록 보존

- 교체 후 및 신규 수집 실패 후 공개 검사는 모두 통과했다. 마지막 검사 시각은 `2026-09-13T04:39:27.892Z`다.
- 공개 리비전은 기존 `291109ef-b73a-44ad-ab8c-121ac67812ca`로 유지됐고, 경기 기록의 리비전 49개가 일치했다.
- 홈/관리자 HTML 및 기존 `/assets/index-CWETFur8.js` 번들이 HTTP 200이며 HTML 재검증·정적 자산 immutable 캐시도 유지됐다.
- 공개 API에 내용 체크섬이 없어 전체 내용 무결성은 미검증이다. `officialChecksumPreserved=null`, `checksum_not_exposed`를 유지한다.
- 기존 후보와 실패 실행을 삭제하거나 재생성하지 않았으며 게시·공식 활성화도 하지 않았다.

### 현재 남은 작업

후속 로컬 구현: 일반 수집 단계 진단과 제한된 표 준비 대기를 어댑터 17에 구현했고, 워커 190건 및 Chromium 6건이 모두 통과했다. 아직 운영 배포하지 않았다. 자세한 계약·검증·남은 배포 순서는 `uniqueplay-collection-readiness-diagnostics-2026-09-13.md`를 참조한다.

1. 일반 수집 오류에도 허용된 조/표/단계/오류 종류를 제한적으로 남겨 `COLLECTION_FAILED`로 원인 정보가 사라지는 경계를 보강한다.
2. 원천 화면의 시즌·조·헤더·행 준비 상태와 탭 전환 대기를 검토한다. 로딩 지연과 실제 구조 변경을 구분하고, 검사를 제거하거나 불완전 표를 통과시키지 않는다.
3. 독립 재현·회귀 검증 후 필요한 워커 수정과 배포를 수행한다. 무근거 반복 수집은 하지 않는다.
4. 전체 후보가 생성되어야 팀명 매칭의 추가 466/삭제 438 감소 여부를 비교할 수 있다. 현재 그 운영 효과는 미검증이다.

순위 충돌은 이번 실행의 도달 구간에서는 재발하지 않았지만, 전체 동기화가 정상 운영 가능하다는 승인으로 확대하지 않는다.

증거: `docs/release/evidence/uniqueplay-standings-worker-deployment-2026-09-13/`의 `push.log`, 공개 검사 JSON 두 개, `deployment-result.json`.

아래는 실제 배포 전 준비 이력이다.

## 준비 완료

- 선행 검증: 워커 테스트 163/163, 로컬 Chromium 스크롤 회귀 3/3 통과.
- 어댑터 버전: `2026.09.13.16`.
- 새 이미지: `synapse9983/aubl-uniqueplay-sync-worker:standings-20260913-8d9a46c475f7`.
- 플랫폼: `linux/amd64`.
- 로컬 빌드 manifest-list digest: `sha256:a1036c127799dec9acd2dbe4b8cbe384e4e6ad079a40fe539657549f2866f79d`.
- 이미지 config digest: `sha256:ff2595fdac9b3656a68434015b112416a37b8394cccd32561ab0395ab4b5c428`.
- 빌드 컨텍스트는 Dockerfile, package.json, package-lock.json, src만 포함한다. 환경 파일, 인증정보, 운영 데이터, 세션 파일은 포함하지 않았다.
- 로컬 산출물: `/tmp/aubl-standings-worker-20260913.kCR4bu`.

## 기존 운영 상태 확인

- Portainer 환경 3의 `aubl-uniqueplay-sync-worker`는 기존 `cancel-20260913-b265caa77f69` 이미지로 실행 중이다.
- 컨테이너: `88a86c078596c98bc803c59a54e245062c2bc87c86087880bd6b0d0709aeabf6`.
- 워커 `/health`를 해당 컨테이너 내부에서 읽기 전용 확인했다.
- `ok=true`, `activeRuns=0`, `pendingDeliveries=0`, `blockedRuns=0`.
- 기존 어댑터 `2026.09.13.15`, durable protocol 2, cancellation protocol 1.
- 관리자 화면에서도 활성 수집이 없음을 확인했다.

## NAS 백업

- 디렉터리: `/mnt/ssd_500_p31/aubl_db/.aubl-deployment-backups/standings-20260913.pMr3CC`.
- `aubl.sql.gz`: 5,236,459 bytes, 권한 0600, 소유자 999:999.
- `worker-state.tar.gz`: 626 bytes, 권한 0600, 소유자 999:999.
- DB는 single-transaction dump로 routines/events/triggers를 포함했다.
- 워커 백업 대상은 `/mnt/ssd_500_p31/aubl_db/.aubl-sync-worker-state`다. 실행·대기 전달이 없는 상태에서 백업했다.
- 두 파일 모두 `gzip -t` 성공. SHA-256은 같은 디렉터리의 `SHA256SUMS`에 보존했다.
- 복원 시험은 수행하지 않았으며, 동일 NAS 내부 사본으로 외부 재해 복구 백업을 대체하지 않는다.

## 초기 업로드 차단 사유 (승인 후 해소)

Docker push는 실행 전 보안 검토에서 거절됐다. 워커 이미지에는 서비스 소스 코드가 포함되어 외부 Docker Hub 저장소로 전송되지만, 기존 백엔드 저장소 업로드 승인을 이 워커 저장소의 소스 전송 승인으로 대신할 수 없다는 사유다.

우회 경로로 업로드하지 않았다. 이후 사용자가 이 새 워커 이미지의 `synapse9983/aubl-uniqueplay-sync-worker` 업로드를 명시적으로 승인해 동일 push 명령을 실행했고, 레지스트리 반환 digest를 확인했다.

## 사전 배포 계획 (이력)

1. 해당 이미지와 목적 저장소에 대한 업로드 승인 후 Docker push하고 반환 digest를 기록한다.
2. 교체 직전 워커의 활성 실행·대기 전달이 여전히 없는지 확인한다.
3. Portainer Duplicate/Edit의 고급 이미지 입력을 사용해 태그와 digest를 지정한다. 기존 UID 999:999, 상태 볼륨, 환경변수, 네트워크, 비공개 포트를 유지한다.
4. `/health`에서 신규 버전, 영속 상태 복구, 활성·대기·차단 수를 확인한다.
5. 동일 공식 기준본 이후의 새 후보를 1회 수집한다. 실패 시 새 안전 진단으로 조·행·원인을 추적한다.
6. 후보가 생성되면 팀명 매칭의 추가·삭제 감소와 순위 비교를 검증한다. 기존 후보와 공식본은 보존한다.

준비 단계에서는 운영 컨테이너 교체와 추가 수집을 실행하지 않았으며, 승인 후 실행 결과는 상단에 기록했다. 공식 게시·활성화는 여전히 실행하지 않았고, 전체 운영 실패 해결 판정도 보류한다.

검증 문서: `uniqueplay-standings-stability-implementation-2026-09-13.md`.

# 운영 백엔드의 예상치 못한 TrueNAS 재배포 조사

## 조사 범위와 현재 결론

사용자는 TrueNAS에서 직접 앱 업데이트나 설정 저장을 하지 않았다고 답했다. 이에 운영 컨테이너를 변경하지 않고 Portainer 이벤트, TrueNAS 작업·감사 이력, 새 컨테이너 설정, 기존 DB 기준선을 읽기 전용으로 대조했다.

확인된 직접적인 변경 경로는 TrueNAS의 `app.redeploy`이다. 기존 앱 저장 설정에 있던 `v1` 이미지와 `aubl_db` DB 연결이 재적용됐다. 감사 기록의 계정은 `truenas_admin`이고 요청은 인증·인가에 성공했다. 이것만으로 실제 사람, UI 클릭, 자동화 또는 호출 의도까지 특정할 수는 없다. 사용자의 답변과 구별하여 기록하며, 자동 업데이트·해킹·사용자 실수 중 어느 하나로 단정하지 않는다.

기존 `aubl`에는 InnoDB 테이블 24개가 존재하고, Flyway V1~V6 성공 이력과 2026 활성 공식 리비전 기준값은 배포 전 백업과 일치했다. 전체 행 데이터가 전부 동일하다는 검증은 아니며, 서비스가 현재 올바른 DB를 보고 있다는 뜻도 아니다.

## 1. 시간순 증거

모든 시각은 2026-09-12 KST이다.

| 시각 | 출처 | 관찰 결과 |
|---|---|---|
| 23:17:53 | TrueNAS 작업 목록 | `app.redeploy`, 작업 ID `19174` 시작 |
| 23:17:54 | Portainer Docker 이벤트 | 기존 `ix-aubl-backend-aubl-backend-1`에 종료 요청 |
| 23:17:55 | Docker 이벤트 | 네트워크 연결 해제, 종료 코드 `143`, 기존 컨테이너 삭제 |
| 23:18:07 | Docker 이벤트 | `synapse9983/aubl-backend:v1` pull, 컨테이너 생성·연결·시작 |
| 23:18:07 | TrueNAS 작업 목록 | 작업 `19174` 완료 |
| 23:18:07 | TrueNAS 감사 | `App: Redeploying aubl-backend`, 성공 |

작업 상세의 개별 로그는 UI에서 `이 작업에 대해 사용 가능한 기록이 없습니다`로 표시됐다. 작업 목록과 별도의 감사 기록으로 결과를 교차 확인했다.

감사 항목:

- Audit ID: `b0860d4a-75af-460a-b697-a17a045a67fd`
- Session ID: `05f02c14-d408-40dd-a7f0-8f58dddf3394`
- 계정: `truenas_admin`
- Method: `app.redeploy`
- Params: `aubl-backend`
- Success: `True`
- Authenticated: `True`
- Authorized: `True`

이번 도구 실행 기록에는 해당 시각의 TrueNAS 재배포·업데이트·저장 제출이나 운영 백엔드의 Stop/Recreate 제출이 없다. 조사 중에도 그러한 작업은 실행하지 않았다. 실제 호출 경위는 추가 확인 대상으로 남긴다.

## 2. 새 컨테이너의 연결 대상

| 항목 | 새로 관찰한 값 |
|---|---|
| 컨테이너 | `4ffa6cbfd22286769f2dc53f11037621964b20a1b4c30f9e27253165652b51d3` |
| 이름 | `ix-aubl-backend-aubl-backend-1` |
| 태그 | `synapse9983/aubl-backend:v1` |
| Portainer 표시 image/config ID | `sha256:46f5dd80626d80ac965dfa573c930fa7bbc45646e13177fa6fded859eb26d1da` |
| `DB_HOST` / `DB_PORT` | `172.30.1.33` / `3306` |
| `DB_NAME` | `aubl_db` |
| `SPRING_DATASOURCE_URL` | `jdbc:mariadb://172.30.1.33:3306/aubl_db` |
| Firebase credential 경로 | `/app/config/serviceAccountKey.json` |
| Physical naming strategy | `org.hibernate.boot.model.naming.PhysicalNamingStrategyStandardImpl` |
| Compose 원본 | `/mnt/.ix-apps/app_configs/aubl-backend/versions/1.2.19/templates/rendered/docker-compose.yaml` |
| Compose config hash | `1a5bf78bc17b2b3ec7ab622e6286a679908125e0e3826ead39e29007818a2b2a` |

이는 표시용 `DB_NAME`만 달라진 상황이 아니다. 실제 Spring datasource URL까지 `aubl_db`를 가리킨다. 이전 v25 운영 설정은 `aubl`이었다. 새 컨테이너를 그대로 복제하고 이미지 태그만 바꾸면 잘못된 DB 연결을 그대로 이어받을 수 있다.

컨테이너의 비밀번호·credential 내용은 문서에 기록하지 않았다. Portainer가 표시한 image/config ID를 registry manifest digest로 혼동하지 않는다.

## 3. 기존 DB 읽기 전용 대조

`SET SESSION TRANSACTION READ ONLY`와 SELECT를 사용했다. 데이터 수정, 스키마 변경, Flyway repair, 백업 복구를 실행하지 않았다.

| 확인 항목 | 결과 |
|---|---|
| `aubl` base tables | InnoDB 24개 |
| `aubl_db` base tables | InnoDB 11개 |
| `aubl` Flyway | V1~V6 모두 success=1, V7 없음 |
| `aubl` 동기화 run 분포 | ACTIVE 4, FAILED 8, REAUTH_REQUIRED 2, REVIEW_REQUIRED 3, VALIDATION_FAILED 1 |
| 활성 공식 revision | `291109ef-b73a-44ad-ab8c-121ac67812ca` |
| 활성 revision 원천 run | `cf773fa4-b019-4f47-a3c6-81fe11bd0495` |
| capturedAt | `2026-09-11T09:58:25.697Z` |
| 백업 기준선과 비교 | `AUBL_BASELINE_EQUAL=true` |

기준선 비교는 MariaDB 버전, Flyway version/success, 활성 revision ID·run ID·checksum·capturedAt을 기존 `baseline.tsv`와 `cmp`로 비교한 것이다. `aubl_db`의 11개 테이블이 이번 재배포로 생성됐다고 판정하지 않는다. 그 DB의 이전 상태 및 재배포 이후 입력 유무는 아직 조사하지 않았다.

NAS 백업과 격리 복원 증거는 `uniqueplay-nas-backup-restore-2026-09-12.md`에 있다. 백업 파일은 그대로 유지했다.

## 4. 배포·복구 판단

1. 현재 v1 설정을 검증 없이 새 배포 기준으로 사용하지 않는다.
2. 권장 순서는 정상 운영하던 v25 이미지와 `aubl` 연결의 복구, 실제 설정·서비스 확인, 신규 증분 동기화 배포이다. 복구는 아직 실행하지 않았다.
3. 복구 전에는 환경변수·credential 마운트·네트워크·포트 등도 기존 운영 증거와 대조한다. DB 이름만 고치면 모든 설정이 복구됐다고 주장하지 않는다.
4. 사용자가 선택한 Portainer 배포 방식은 유지한다. TrueNAS 저장 설정은 임의로 수정하지 않는다. 다만 TrueNAS 재배포가 다시 실행되면 같은 설정 되돌림이 반복될 수 있으므로 호출 경위와 관리 절차는 별도 해결 대상이다.
5. 새 이미지 두 개의 registry 업로드는 완료됐지만 운영 적용은 보류 중이다. 실제 수집·공식 게시·웹 배포는 아직 하지 않았다.

추가 보안 관찰: 기존 MariaDB healthcheck 명령에 비밀번호 인수가 포함돼 Docker 이벤트에 표시되고 있었다. 문서에는 해당 값을 남기지 않았으며, healthcheck 구성 및 자격증명 교체 여부는 별도 승인·변경 계획으로 다룬다.

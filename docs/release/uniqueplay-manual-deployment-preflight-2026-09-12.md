# UniquePlay 수동 배포 사전 확인

확인일: 2026-09-12. 상태: **수동 배포 순서 승인 / 백업 보관 위치 미확정으로 운영 교체 대기**.

사용자는 백업 확인 → 백엔드/V7 → 워커 → 웹의 수동 배포 순서를 승인했다. 이는 실제 수집·정정·게시·활성화를 실행하라는 승인이 아니다. 이번 사전 확인에서는 Portainer의 운영 연결 설정과 DB 메타데이터, Firebase Hosting live 릴리스를 읽기 전용으로 조회했다. DB 쓰기, 백업 생성, 이미지 push, 컨테이너 교체, Hosting 배포는 수행하지 않았다.

## 확인 결과

| 항목 | 확인 결과 |
|---|---|
| Portainer | 기존 환경 3 접근 가능 |
| 백엔드 | `ix-aubl-backend-aubl-backend-1`, `synapse9983/aubl-backend:v25`, 실행 중 |
| 백엔드의 실제 DB명 | `aubl` |
| MariaDB 컨테이너 기본 DB 환경값 | `aubl_db`; 실제 백엔드 대상과 다름 |
| DB 마이그레이션 | `aubl.flyway_schema_history`의 V1~V6 모두 성공, V7 미적용 |
| 테이블 엔진 | 기본 테이블 24개 모두 InnoDB |
| 동기화 상태별 건수 | ACTIVE 4, FAILED 8, REAUTH_REQUIRED 2, REVIEW_REQUIRED 3, VALIDATION_FAILED 1 |
| 2026 활성 공식 리비전 | `291109ef-b73a-44ad-ab8c-121ac67812ca` |
| 해당 run | `cf773fa4-b019-4f47-a3c6-81fe11bd0495` |
| 공식 스냅샷 수집 시각 | `2026-09-11T09:58:25.697Z` |
| Hosting 프로젝트·사이트 | `aubl-backup` |
| 현재 live version | `projects/aubl-backup/sites/aubl-backup/versions/ea17cd9e89d1bf2e` |
| 현재 live release | `projects/aubl-backup/sites/aubl-backup/channels/live/releases/1788602428335000` |
| 현재 live 배포 시각 | `2026-09-05T10:00:28.335Z` |
| Hosting 현재 콘텐츠 | FINALIZED, 48개 파일. 후보 47개 파일과 구분 |

초기에는 DB 컨테이너의 기본값 `aubl_db`로 Flyway 이력을 조회했고 테이블 없음 오류가 발생했다. 이후 백엔드의 실제 연결 설정을 대조하여 `aubl`로 정정했다. 처음 오류가 DB 손상이나 Flyway 삭제를 뜻하는 것은 아니며, 잘못된 스키마를 백업 대상으로 채택하지 않았다. 두 조회 모두 읽기 전용 트랜잭션으로 시도했고 SQL로 데이터를 변경하지 않았다.

상태별 조회에는 RUNNING 등의 진행 상태가 없었지만, 이는 조회 시점의 관찰이다. 신규 쓰기 차단이나 이후 작업 유입 방지까지 구현·검증한 것이 아니므로 실행 명세의 drain 완료는 아직 표시하지 않는다. ACTIVE run 4건을 현재 활성 공식 리비전 4개로 해석하지 않는다.

Portainer가 백엔드 이미지 행에 표시한 digest는 `sha256:fa1817247b6138b5ada4621747812c55eb86838a611b768e5fdc253305004470`이다. 로컬 v25 시험 이미지의 manifest digest와 표현 계층이 같다고 가정하지 않는다. registry manifest·config·실행 이미지 관계를 대조하기 전 이를 최종 rollback registry digest로 사용하지 않는다.

## 남은 진입 조건

1. 운영 DB `aubl` 백업을 저장할 NAS 경로 또는 기존 백업 위치를 지정해야 한다. 위치·완료 시각·checksum·복원 증거가 없는 상태에서 새 이미지로 교체하지 않는다.
2. 백업 후 복원 확인, 설정·비밀 참조 보존, 실제 Auth·Firestore 프로젝트 및 복구 범위를 확정해야 한다. 자격 증명 값은 이 문서나 Git에 기록하지 않는다.
3. 신규 쓰기 차단과 진행 작업 종료, 최종 registry 태그·digest 연결, 웹 산출물의 남은 검증 조건을 충족해야 한다.
4. CI는 사용하지 않는 수동 경로로 진행한다. 기존 main push의 다른 프로젝트 배포 위험은 여전히 남으며 Git push로 이번 배포를 대신하지 않는다.

읽기 전용으로 확보한 기준점은 배포 직전 다시 유효성을 확인해야 한다. 현재 live Hosting version을 확보한 것은 웹 복귀 지점을 찾은 것이지 DB·Firestore 백업을 만든 것이 아니다. 운영 데이터를 로컬로 복사하거나 임의의 DB 디렉터리를 백업 보관소로 사용하지 않았다.

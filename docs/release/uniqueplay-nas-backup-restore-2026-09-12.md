# UniquePlay 수동 배포: NAS 백업 및 격리 복원 결과

## 현재 결론

- 사용자 승인에 따라 NAS `aubl_db` 하위에 실제 운영 데이터베이스 `aubl`의 논리 백업을 생성했다.
- 동일 NAS의 별도 컨테이너에서 실제 백업 복원, 24개 테이블 검사, Flyway 및 활성 공식 리비전 대조가 통과했다.
- 운영 백엔드 교체, V7 마이그레이션, 워커 교체, 웹 배포는 아직 실행하지 않았다.
- TrueNAS에 저장된 앱 설정과 실제 운영 컨테이너 설정의 불일치를 발견했다. 원본 설정을 정합화하기 전에는 이미지 태그만 바꾸고 저장하지 않는다.

## 1. 백업

| 항목 | 실제 결과 |
|---|---|
| NAS 호스트 경로 | `/mnt/ssd_500_p31/aubl_db/.aubl-deployment-backups/uniqueplay-20260912T141030Z.OUWUAD/` |
| 운영 DB 컨테이너 내부 경로 | `/var/lib/mysql/.aubl-deployment-backups/uniqueplay-20260912T141030Z.OUWUAD/` |
| 백업 파일 | `aubl.sql.gz` |
| 크기 | 4,756,462 bytes |
| SHA-256 | `ff2575c569e5e28f345464db89bfa3ed8633d6d45d24a8ce316ab08a7e97b469` |
| 파일 권한 / 소유자 | `600` / 컨테이너 `mysql` 사용자 |
| 전용 디렉터리 권한 | `700` |
| DB 범위 | `aubl`만 백업. NAS 전체 DB, 시스템 계정 DB는 포함하지 않음 |
| 방식 | `mariadb-dump --single-transaction --quick --routines --events --triggers --hex-blob --databases aubl` |
| 원본 테이블 엔진 | InnoDB 24개 |
| 원본 부속 객체 | routines 0, events 0, triggers 0 |
| 검증 | dump 및 gzip 파이프라인 성공, `gzip -t` 성공, SHA-256 기록 |

임시 `.partial` 파일은 전체 덤프와 압축 검증이 성공한 뒤 최종 이름으로 변경했다. `started-at.txt`, `completed-at.txt`, `baseline.tsv`, `dump.stderr`, `SHA256SUMS`를 같은 디렉터리에 보관했다. 인증정보는 기존 컨테이너 환경변수로만 사용했으며 문서에 기록하지 않았다.

이 백업은 운영 DB와 같은 NAS 데이터 세트에 있다. 배포 오류 복구에는 활용할 수 있지만 디스크·풀 장애에 대비한 별도 매체 백업은 아니다. 백업 이후 운영 쓰기를 차단한 상태도 아니므로, 전체 DB 복구를 자동 실행하면 이후의 정상 변경을 잃을 수 있다. 복구 시점과 서비스 중단 범위는 별도 판단해야 한다.

## 2. 실제 격리 복원 검증

| 항목 | 실제 결과 |
|---|---|
| Portainer 환경 | `3` / `local` |
| 전용 스택 / 컨테이너 | `aubl-db-restore-check-20260912` |
| 컨테이너 ID | `7c69f00e6600062d8ece3cea4dc38da61687e4b19755f2e4c556185fc2b3a9c2` |
| 이미지 | NAS에 이미 존재하는 `mariadb:11.8.5`, `pull_policy: never` |
| 네트워크 | `none`, 공개 포트 없음, DB `--skip-networking` |
| 백업 접근 | 해당 백업 디렉터리만 `/backup`에 읽기 전용 bind mount |
| 복원 데이터 | `/var/lib/mysql`의 384 MiB tmpfs. 운영 DB 디렉터리를 마운트하지 않음 |
| 자원 제한 | CPU 0.5, 메모리 768 MiB, PID 128 |
| 인증 | 임시 인스턴스 내부 Unix socket 인증. 운영 DB 비밀번호를 복사하지 않음 |
| 시작 / 종료 | 2026-09-12 23:12:34 / 23:13:00 KST |
| 종료 결과 | exit code `0`, 재시작 정책 `no` |

검증 순서:

1. NAS에 저장한 SHA-256과 백업 파일을 대조하고 gzip 무결성을 확인했다.
2. 별도 MariaDB 데이터 디렉터리와 Unix socket을 초기화했다.
3. 실제 `aubl.sql.gz` 전체를 복원했다.
4. 복원본의 MariaDB 버전, Flyway 이력, 2026 활성 공식 리비전 ID·원천 run ID·checksum·capturedAt을 백업 직전 `baseline.tsv`와 `cmp`로 대조했다.
5. `mariadb-check --check --databases aubl`로 24개 테이블 모두 `OK`를 확인했다.
6. 복원된 base table 24개 및 동기화 run 상태 분포를 확인했다.
7. `RESTORE_CHECK_COMPLETE baseline_equal=true network=none backup_mount=read_only` 출력과 종료 코드 0을 확인했다.

복원본 run 상태 분포는 ACTIVE 4, FAILED 8, REAUTH_REQUIRED 2, REVIEW_REQUIRED 3, VALIDATION_FAILED 1이다. 이 분포만으로 배포 시점의 신규 입력 차단이나 worker drain 완료를 판정하지 않는다.

임시 컨테이너는 정상 종료했고 tmpfs 데이터는 종료 시 사라진다. 로그와 설정 증거를 보존하기 위해 종료된 컨테이너 및 스택은 아직 삭제하지 않았다. 백업 파일은 유지한다. 전체 테이블의 논리적 바이트 동등성 또는 실제 애플리케이션을 통한 운영 백업 재생까지 검증했다고 주장하지 않는다.

격리 초기화는 [MariaDB 공식 mariadb-install-db 문서](https://mariadb.com/docs/server/clients-and-utilities/deployment-tools/mariadb-install-db)의 socket 인증 및 별도 datadir 방식을 참고했다.

## 3. 배포 전 발견한 원본 설정 불일치

사용자가 제공한 TrueNAS 관리 주소 `http://172.30.1.33/ui/dashboard`에서 기존 관리자 세션으로 앱 수정 화면까지 접근했다. 설정은 아직 수정하거나 제출하지 않았다.

| 항목 | 실제 실행 중인 백엔드 | TrueNAS 저장 앱 설정 |
|---|---|---|
| 이미지 저장소 | `synapse9983/aubl-backend` | 동일 |
| 이미지 태그 | `v25` | `v1` |
| `DB_NAME` | `aubl` | `aubl_db` |

TrueNAS 앱은 `aubl-backend`이고 Portainer에는 외부 관리 스택 `ix-aubl-backend`로 표시된다. 앱 수정 화면의 태그만 변경하면 다른 오래된 저장 설정까지 다시 적용될 위험이 있다. `SPRING_DATASOURCE_URL` 등 중복·우선 설정까지 비교하기 전에는 `DB_NAME` 차이만으로 최종 연결 DB를 단정하지 않는다. 실제 연결 DB가 `aubl`인 것은 이전 실행 컨테이너 설정 및 DB 조회로 확인했다.

TrueNAS 저장 폼에는 `/mnt/ssd_500_p31/aubl_db`를 `/app/config`로 연결하는 마운트가 있으며, 읽기 전용 선택은 꺼져 있다. 이번 작업에서는 해당 설정도 변경하지 않았다. 실제 실행 컨테이너의 마운트·권한과 함께 대조할 필요가 있다. 이 경로 아래에 백업이 생성됐으므로 백엔드 컨테이너 측 접근 가능 여부도 후속 점검 대상이다.

## 4. 이미지 확인 결과와 남은 단계

- 로컬 배포 후보 ID와 `linux/amd64` 아키텍처는 기존 검증 후보와 일치했다.
- 백엔드 후보: `sha256:ea0b89d7740e3a3f1a2592eecfb360e3d49314a0ed6e1381b3c58f96b959b62d`.
- 워커 후보: `sha256:101af1ec62df94924e91ffd1d91878afec799da4231f1cf3cd3121614f15ed46`.
- Docker Hub의 v25 manifest에서 config digest가 `sha256:fa1817247b6138b5ada4621747812c55eb86838a611b768e5fdc253305004470`임을 확인했다. Portainer가 표시한 값과 일치한다. config digest를 레지스트리 manifest digest로 사용하지 않는다.
- 기존 태그를 덮어쓰지 않기 위한 후보 태그 조회만 수행했다. 레지스트리 push는 실행하지 않았다.

후속 순서:

1. 현재 운영 컨테이너를 기준으로 TrueNAS 저장 설정의 차이를 전부 대조하고, 비밀값을 문서에 노출하지 않은 채 필요한 원본 설정 정합화를 결정한다.
2. 최종 이미지 태그·digest, 기존 worker 및 복구 이미지, 실제 Firebase 대상과 저장 정책을 확정한다.
3. 신규 동기화 쓰기 차단과 진행 중 작업 종료를 확인한다. 단순 RUNNING 건수 조회만으로 대체하지 않는다.
4. 백업 이후 변경분과 복구 시점을 확인한 다음 백엔드/V7, 워커, 웹 순서로 배포한다.
5. 실제 배포 및 인증·호환성 확인 결과를 별도 기록한다. 실제 UniquePlay 수집·공식 게시와 자동 전체 DB 복구는 이번 백업 성공만으로 승인된 것으로 취급하지 않는다.

## 5. 후속 사용자 결정: Portainer 방식 유지

사용자는 TrueNAS 저장 설정을 정합화하는 대신 기존처럼 Portainer로 계속 배포하도록 요청했다. 따라서 위 후속 순서의 TrueNAS 정합화는 이번 배포의 필수 선행 조건에서 제외한다. 현재 실행 중인 컨테이너에서 설정을 복제하고 이미지 참조만 변경하는 방식으로 진행하며, DB 연결·환경변수·마운트·포트·권한을 임의로 TrueNAS의 오래된 값으로 되돌리지 않는다.

TrueNAS 원본 설정은 수정하지 않는다. 이후 TrueNAS에서 앱을 업데이트·재배포하면 오래된 설정이 재적용될 수 있다는 위험은 별도로 남는다. 통상적인 컨테이너 재시작과 TrueNAS가 컨테이너를 다시 생성하는 재배포는 구분한다.

검증 후보를 기존 Docker Hub 저장소의 다음 고유 태그로 업로드하는 명령을 요청했으나, 자동 보안 검토에서 외부 코드·설정 전송에 대한 명시적 사용자 승인 부족으로 실행 자체가 거부됐다.

- `synapse9983/aubl-backend:incremental-20260912-ea0b89d7740e`
- `synapse9983/aubl-uniqueplay-sync-worker:incremental-20260912-101af1ec62df`

두 태그는 사전 조회에서 존재하지 않았다. 거부된 명령의 태그 생성·push는 실행되지 않았고, 운영 컨테이너 교체도 실행하지 않았다. 같은 업로드를 다른 경로나 도구로 우회하지 않는다. 제품 코드가 포함된 두 이미지를 위 저장소에 전송하는 명시적 승인을 받은 뒤에만 다음 단계로 진행한다.

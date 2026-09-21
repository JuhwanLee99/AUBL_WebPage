# 운영 백엔드 v25 및 aubl 연결 복구 결과

## 결론과 승인 범위

사용자가 Portainer에서 정상 운영하던 `v25 + aubl` 연결로 먼저 복구하는 방안에 동의했다. 그 범위에서 현재 컨테이너를 복제하고 이미지와 DB 연결 두 항목을 변경해 교체했다.

실제 새 컨테이너의 환경변수와 기동 로그에서 `v25`, `aubl` 연결, Flyway 현재 버전 6, Spring/Tomcat 정상 기동을 확인했다. 신규 증분 동기화 후보 이미지·V7·워커·웹은 이번 복구에서 적용하지 않았다. TrueNAS 저장 앱 설정도 수정하지 않았다.

## 적용 사항

| 항목 | 복구 전 | 적용 결과 |
|---|---|---|
| 컨테이너 이름 | `ix-aubl-backend-aubl-backend-1` | 동일 |
| 이미지 | `synapse9983/aubl-backend:v1` | `synapse9983/aubl-backend:v25@sha256:e10d8890bcd42258dfbab18892cbc0204203275f1208822f5bd50fefc0731cb4` |
| `DB_NAME` | `aubl_db` | `aubl` |
| `SPRING_DATASOURCE_URL` | `jdbc:mariadb://172.30.1.33:3306/aubl_db` | `jdbc:mariadb://172.30.1.33:3306/aubl` |
| 호스트 포트 / 컨테이너 포트 | `30080` / `8080` | 유지 |
| Docker 네트워크 | `ix-aubl-backend_default` | 유지 |
| 호스트 이름 | `aubl-backend` | 유지 |
| bind mount | `/mnt/ssd_500_p31/aubl_db` -> `/app/config` | 유지 |
| Entrypoint / working directory | `java -jar app.jar` / `/app` | v25 이미지 기본값과 같음을 확인하고 유지 |

현재 v1 컨테이너로부터 복제된 환경변수는 18개였다. 폼 변경 전후 대조에서 바뀐 키가 `DB_NAME`, `SPRING_DATASOURCE_URL` 두 개뿐임을 확인했고 나머지 16개를 보존했다. 이후 실제 생성된 컨테이너의 환경변수도 제출한 18개 값과 모두 일치했다. 값 비교 과정에서 비밀번호나 credential 내용은 출력·문서화하지 않았다.

여기서 환경변수 보존은 이번 v1 컨테이너 복제본과의 비교이다. 이미 삭제된 이전 v25 컨테이너의 모든 런타임 설정을 완전히 재현했다고 주장하지 않는다. 이전에 확인했던 정상 DB 대상 및 검증된 v25 이미지를 복구했고, 후술한 실제 기동 증거를 확인했다.

## 새 컨테이너 및 이미지 증거

- 교체 전 컨테이너: `4ffa6cbfd22286769f2dc53f11037621964b20a1b4c30f9e27253165652b51d3`
- 교체 후 컨테이너: `82f5b697eaeb143fc405f59d8592131b9b509c9f27de46a59f1a0ce0e6efbefd`
- 생성: 2026-09-12 23:34:51 KST
- 시작: 2026-09-12 23:34:52 KST
- 상태: `Running`
- 고정한 registry manifest digest: `sha256:e10d8890bcd42258dfbab18892cbc0204203275f1208822f5bd50fefc0731cb4`
- Portainer에서 확인한 image/config ID: `sha256:fa1817247b6138b5ada4621747812c55eb86838a611b768e5fdc253305004470`

Portainer `Duplicate/Edit`에서 기존 설정을 복제하고, 동일한 이름의 컨테이너를 `Replace`했다. DB 데이터나 bind mount를 삭제하는 작업, SQL 복구, Flyway repair, credential 교체는 실행하지 않았다. 기존 DB와 백업은 그대로 유지했다.

## 실제 기동 로그

모든 시각은 2026-09-12 KST이다.

| 시각 | 확인된 로그 |
|---|---|
| 23:34:54.557 | `HikariPool-1 - Start completed.` |
| 23:34:54.625 | `Successfully validated 7 migrations` |
| 23:34:54.634 | `Current version of schema aubl: 6` |
| 23:34:54.637 | `Schema aubl is up to date. No migration necessary.` |
| 23:34:58.563 | `Tomcat started on port 8080 (http) with context path '/'` |
| 23:34:58.572 | `Started WebpageApplication in 5.725 seconds` |

Flyway의 검증 개수 7과 현재 스키마 버전 6은 로그에 나온 값을 각각 기록한 것이다. 이를 V7 적용으로 해석하지 않는다.

v25 이미지 실행 설정을 읽는 첫 로컬 metadata 조회는 선택 항목 `Cmd` 부재로 출력 형식에서 실패했다. 없는 항목을 null로 처리하는 조회로 재실행해 Entrypoint와 working directory를 확인했으며, 제품 코드나 이미지 변경은 없었다.

## 확인하지 않은 범위와 남은 위험

- 이번 완료 범위는 컨테이너·DB 연결 복구와 실제 기동 확인이다. 공개 API 전체, 실제 로그인, 관리자 동기화, worker callback, 경기별 데이터 및 공식 집계 전량을 검증한 결과는 아니다.
- v1이 잠시 연결했던 `aubl_db`에 그동안 입력된 데이터가 있는지는 아직 확인하지 않았다. 자동 병합·삭제하지 않는다.
- TrueNAS에 저장된 `v1 + aubl_db` 앱 설정은 사용자의 Portainer 유지 결정에 따라 변경하지 않았다. TrueNAS `app.redeploy`가 다시 호출되면 동일한 설정 되돌림이 반복될 수 있다.
- 해당 재배포의 감사 기록은 확보했지만, 실제 호출 주체나 자동화 여부는 확정하지 못했다. `uniqueplay-unexpected-backend-redeploy-2026-09-12.md`를 참고한다.
- 새 후보 이미지 두 개는 Docker Hub 업로드만 완료된 상태다. 신규 백엔드/V7, worker, 웹 배포는 별도 단계로 남겨 둔다.
- NAS 백업과 종료된 격리 복원 검증 컨테이너는 유지했다. 이 복구를 위해 전체 운영 DB를 백업 시점으로 되돌리지 않았다.

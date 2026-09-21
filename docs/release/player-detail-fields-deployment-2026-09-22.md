# 선수 상세 누락 필드 복구 및 운영 배포

## 원인과 수정 범위

선수 상세 API의 `BatterStatSummary`, `PitcherStatSummary`가 DB에 있는 세부 통계를 응답에 포함하지 않았다. 프런트엔드 `getPlayerStats`는 누락된 수치를 기본값 0으로 변환해 기록허브와 다른 값을 표시했다. 캐시 문제로 확정할 근거는 없었으며, 실제 배포 전 공개 API에서도 필드 누락을 확인했다.

- 타자 응답 추가: doubles, triples, runsBattedIn, runsScored, stolenBases, caughtStealing, walks, strikeouts, hitByPitch, sacrificeHits, sacrificeFlies.
- 투수 응답 추가: holds, hitsAllowed, runsAllowed, earnedRuns, homeRunsAllowed, walksAllowed, strikeouts.
- `PlayerRecordService`에서 각 항목을 기존 엔티티 값에 직접 연결했다. DB의 null은 응답에서도 null로 보존한다.
- 운영 SQL, DB 스키마, 저장 기록, 동기화 원천 및 공식 리비전은 변경하지 않았다. 재수집도 실행하지 않았다.
- 백엔드 소스 위치: `/Users/juhwan/Documents/Dev/AUBL/AUBL_WebPage_BE-test`.

## 테스트 환경 보완

최초 실행은 211건 중 177건 통과, 3건 실패, 31건 제외였다. 실패한 3건은 기존 H2 환경이 MariaDB의 V7 `ALTER TABLE ... ADD COLUMN ..., ADD COLUMN ...` 문법을 지원하지 않아 발생했다.

사용자 승인 후 `FlywayMigrationTest`와 `WebpageApplicationTests`의 DB를 로컬 MariaDB 11.8.5로 전환했다. 메타데이터 조회도 MariaDB의 현재 catalog와 컬럼명 대소문자에 맞췄다. 운영 마이그레이션 SQL을 수정하거나 Flyway 검사를 끄지 않았다.

실행 명령:

```bash
bash scripts/test-backend-player-detail-mariadb.sh
```

- 전용 internal Docker network에 `playerdetail-db`를 배치하고 호스트 포트는 게시하지 않는다.
- DB 데이터는 tmpfs에만 기록한다. 이번 실행이 만든 컨테이너와 네트워크는 종료 trap으로 정리한다.
- 빌드 입력만 임시 디렉터리에 복사한다. 운영 환경 파일과 인증정보는 마운트하지 않는다.
- Gradle은 초기 실행에서 준비한 `aubl-gradle-cache`를 사용해 offline 모드로 실행한다. 캐시가 없는 새 환경은 의존성을 먼저 준비해야 한다.
- 마이그레이션 및 전체 컨텍스트 테스트에는 이 하네스의 MariaDB가 필요하다. 일반 호스트에서 DB 없이 실행한 결과를 통과로 간주하지 않는다.

### 재검증 결과

| 항목 | 결과 |
| --- | --- |
| 전체 테스트 | 211건 중 180건 통과, 실패 0건, 제외 31건 |
| 신규 선수 상세 필드 회귀 | 3건 통과: 타자 전체 누락 항목, 투수 전체 누락 항목, null 보존 |
| Flyway 마이그레이션 테스트 | 3건 통과: 빈 DB, 기존 INT 키, 중복 기록 통합/보존/유일성 |
| 전체 Spring 컨텍스트 | 1건 통과 |
| bootJar | 성공 |

31건은 별도 MariaDB 호스트 또는 Auth/Firestore 에뮬레이터 조건을 요구하는 기존 조건부 통합 테스트다. 이번 실행에서 수행하거나 통과한 것으로 계산하지 않는다.

테스트 산출물: `/tmp/aubl-playerdetail-test.xCwtEH/build`.

## 운영 배포

- 신규 이미지: `synapse9983/aubl-backend:playerdetail-20260922-1`.
- manifest digest: `sha256:7f583b665969ed74271727108167419e235ac13c1be941665cf19945da755988`.
- 이전 이미지: `synapse9983/aubl-backend:identity-20260913-cafd257c5f7b`.
- JAR와 런타임 Dockerfile만 별도 컨텍스트에 넣어 `linux/amd64` 이미지로 빌드·업로드했다.
- Portainer에서 기존 컨테이너를 Duplicate/Edit하고 digest를 지정해 교체했다. 환경변수, 포트, 볼륨, 네트워크 설정은 그대로 상속했다.
- 운영 컨테이너: `ix-aubl-backend-aubl-backend-1`, 생성 시각 2026-09-22 00:36:56 KST, running 확인.
- 포트 `30080:8080`, IP `172.16.2.2` 유지. DB와 수집 워커는 교체하지 않았다.
- 롤백은 Portainer에서 위 이전 이미지로 동일한 설정을 유지해 교체한다. 이번 수정에 DB 역마이그레이션은 필요하지 않다.

## 운영 검증

공개 API에서 선수 7027, 7030 각각의 타자 13항목, 투수 9항목을 2026년 순위 API와 대조해 모두 일치했다. 기존 통계 행 ID도 유지됐다.

| 선수 | 구분 | 확인한 대표 값 |
| --- | --- | --- |
| 김민수 7027 | 타자 | RBI 9, SB 4, BB 1, AVG .625, H 10 |
| 김민수 7027 | 투수 | K 2, BB 1, IP 1.0, WHIP 2.00 |
| 이규석 7030 | 타자 | RBI 7, SB 4, BB 4, SO 1 |
| 이규석 7030 | 투수 | K 23, BB 13, IP 13.1, ERA 5.25 |

운영 브라우저의 `/records/player/7027`에서도 위 김민수 수치를 확인했다.

2025년 `regulation=ALL&limit=0` 타자 1,507건, 투수 383건의 공개 순위 API 응답은 배포 전후 JSON 전체가 동일했다. 2025년 및 이전 자료는 UniquePlay가 아닌 기존 DB 자료다. 이번 확인을 모든 과거 시즌의 DB 전체 무결성 검사로 확대 해석하지 않는다.

공개 API 비교 산출물: `/tmp/aubl-playerdetail-evidence-20260922`.

## 남은 범위

- 원천 경기 상세의 기존 경고는 이번 API 필드 연결과 별개이며 해결한 것으로 판정하지 않는다.
- DB에 실제로 null인 `kPer9`, `bbPer9` 등의 미수집 지표는 기존 프런트엔드 기본값 때문에 여전히 0으로 표시된다. 김민수 화면의 K/9, BB/9도 이에 해당한다. 이 작업은 이미 저장된 필드의 응답 누락을 복구한 것이며, 미수집 지표의 계산 또는 미확정 표시 개선까지 완료한 것은 아니다.
- 다음 개선에서는 실제 0과 미수집 null을 구분하고, 파생 지표를 계산한다면 이닝의 아웃 수 변환과 원천별 규칙을 명시적으로 적용해야 한다.

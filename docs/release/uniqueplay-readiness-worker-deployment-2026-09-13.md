# UniquePlay 워커 17 운영 배포 및 증분 수집 결과

## 판정

- 상태: `DEPLOYED_COLLECTION_FAILED_RANK_DIAGNOSTICS_CAPTURED`.
- 2026-09-13 워커 17 배포와 health 확인은 완료했다. 증분 수집 1회는 실패했다.
- 수집 신뢰도 문제가 해결된 것으로 판단하지 않는다. 운영 정상화 승인 근거로 사용할 수 없다.
- 잘못된 후보 생성은 차단됐고 기존 공식 기록의 게시·활성화는 변경하지 않았다.
- 선행 로컬 검증은 워커 단위 테스트 190건, 브라우저 테스트 6건 통과다. 이번 운영 실패는 해당 검증의 보장 범위 밖에 남아 있는 결함이며, 통과 건수로 상쇄하지 않는다.

## 배포 범위와 식별자

| 항목 | 값 |
|---|---|
| 관리 경로 | Portainer 환경 3, 기존 워커 Duplicate/Edit |
| 이미지 | `synapse9983/aubl-uniqueplay-sync-worker:readiness-20260913-cd07db41abcf` |
| manifest digest | `sha256:0ad4078cd214206997dae5ffa42793cbb13e537c87931819dfb08f2458be478a` |
| image config digest | `sha256:3cebd8c51de9d288489208306ad2580e044cfafed06a0da8c5fabe6e42bd1b66` |
| 새 컨테이너 | `12c5c296a93633749f2bd449097e22bcf8a022422611a7db27f318db0e4660ab` |
| 생성·시작 시각 | 2026-09-13 14:01:49 KST |
| 런타임 버전 | `2026.09.13.17` |
| durable / cancellation protocol | `2` / `1` |

사용자가 워커 소스가 포함된 이미지의 기존 Docker Hub 저장소 업로드를 명시적으로 승인한 뒤 업로드했다. 환경 파일과 인증정보는 이미지에 포함하지 않았다. 이미지 digest는 업로드 결과와 Portainer 배포 결과에서 일치했다.

백엔드·DB·프런트엔드는 이번 작업에서 교체하지 않았다. TrueNAS 앱 재배포, 자동 데이터 이관, 공식본 게시·활성화, 실패 실행 삭제는 하지 않았다.

## 교체 전 안전 경계와 백업

- 교체 전 워커 16 health: `ok=true`, `activeRuns=0`, `pendingDeliveries=0`, `blockedRuns=0`.
- 관리자 연결 상태의 활성 실행도 없음을 확인했다.
- NAS 백업 디렉터리: `/mnt/ssd_500_p31/aubl_db/.aubl-deployment-backups/readiness-20260913.hdUY8f`.
- `aubl.sql.gz`: 5,237,593 bytes, mode `600`, owner `999:999`.
- `worker-state.tar.gz`: 727 bytes, mode `600`, owner `999:999`.
- DB dump는 `--single-transaction --quick --routines --events --triggers --hex-blob --databases aubl`로 생성했다.
- 두 파일 모두 `gzip -t`를 통과했다. SHA256SUMS를 같은 NAS 디렉터리에 기록했다. 화면에서 해시를 재전사하지 않고 원본 파일을 기준으로 삼는다.
- 동일 NAS의 백업이며 외부 재해복구 백업은 아니다. 복원 테스트는 실행하지 않았다.

## 설정 보존 확인

배포 전 원본 환경변수와 복제 초안의 13개 키·값을 메모리에서 대조해 모두 일치함을 확인했다. 비밀값을 출력하거나 보고서에 기록하지 않았다.

| 설정 | 유지 값 |
|---|---|
| 환경변수 | 13개 전체 일치 |
| 사용자 | `999:999` |
| 명령 / 작업 디렉터리 | `node src/server.mjs` / `/app` |
| 상태 bind | `/mnt/ssd_500_p31/aubl_db/.aubl-sync-worker-state:/state`, writable |
| 네트워크 | `ix-aubl-backend_default` |
| 재시작 정책 | `Unless stopped` |
| host port 공개 | 없음 |
| Portainer 관리 권한 | administrators |

Advanced mode의 이미지 입력에 tag와 digest를 지정한 뒤 기존 이름의 컨테이너를 교체했다. 데이터 볼륨은 삭제하지 않았다.

## 운영 증분 수집 결과

| 항목 | 값 |
|---|---|
| 실행 ID | `1be683f3-3ee0-431a-b37b-d71347fcf1a5` |
| 시즌 / 범위 | 2026 / `SINCE_LAST_SYNC`, 마지막 공식 반영 이후 |
| 시작 | 2026-09-13 14:03:43 KST |
| 실패 갱신 | 2026-09-13 14:03:48 KST |
| 기준 공식 revision | `291109ef-b73a-44ad-ab8c-121ac67812ca` |
| 오류 | `STANDINGS_RANK_CONFLICT` |
| 위치 | A조 / `STANDINGS` / `AUDIT_STANDINGS` |
| 후보·체크섬 | 생성되지 않음 |
| 실패 ACK | sequence `1`, delivery `1bdeffde-338c-4049-a693-a72f34330f25` |

신규 진단 로그에 아래 수집값이 남았다. 개인 식별정보나 인증정보 없이 행 번호와 순위·승패무만 기록됐다.

| 행 | 워커 수집 순위 | 승 | 패 | 무 | 후속 원본 화면 순위 |
|---|---:|---:|---:|---:|---:|
| 1 | 1 | 5 | 1 | 2 | 1 |
| 2 | 1 | 5 | 1 | 1 | 1 |
| 3 | 1 | 3 | 2 | 1 | 3 |
| 4 | 1 | 1 | 5 | 0 | 4 |
| 5 | 1 | 1 | 6 | 0 | 5 |

검증기는 승률이 서로 다른 팀을 동일 순위로 처리한 9개 쌍을 `RANK_TIE_WITH_DIFFERENT_WIN_RATE`로 거부했다. 워커 로그와 관리자 오류 메시지 모두 조·표·단계를 보존했다. 실패 콜백 ACK 이후 최종 health에서 `activeRuns=0`, `pendingDeliveries=0`, `blockedRuns=0`, 버전 `2026.09.13.17`을 확인했다.

## 원본 대조와 미확정 원인

실패 후 브라우저에서 [UniquePlay AUBL 리그](https://unique-play.com/league/57)의 기록 화면을 열었다. 2026시즌 A조의 화면 순위는 `1, 1, 3, 4, 5`였고 승패무는 위 수집값과 일치했다.

이는 **후속 원본 화면과 워커 수집값의 불일치**를 입증한다. 그러나 실패 순간의 원본 DOM을 저장한 것은 아니므로, 그 순간 원천 응답이 잘못됐는지, 초기 렌더 순위가 지연됐는지, 추출 경로가 다른 노드를 읽었는지는 아직 확정할 수 없다. 고정된 대기 시간만 늘리거나 승률로 순위를 임의 재작성하는 방식으로 해결됐다고 판단하지 않는다.

이번 실행은 A조에서 종료됐다. 이전 워커 16의 일반 `COLLECTION_FAILED` 발생 경계까지 도달하지 못했으므로 해당 문제 해결 여부는 미검증이다. 새 백엔드의 선수 동일성 비교에 따른 추가·삭제 후보 감소, 전체 8개 조, 경기 상세 수집도 이번 실행에서 검증하지 못했다.

## 공개 서비스 영향 확인

읽기 전용 공개 검사를 2026-09-13T05:01:48.261Z와 실패 이후 2026-09-13T05:06:23.826Z에 실행했다.

- 공식 revision `291109ef-b73a-44ad-ab8c-121ac67812ca` 유지.
- 공개 record revision 49개 일관성 유지.
- 홈페이지·관리자 HTML·번들 모두 HTTP 200.
- 번들 `/assets/index-CWETFur8.js` 유지. HTML `no-cache`, 번들 immutable.
- 공개 API에 checksum이 없어 콘텐츠 checksum 동일성은 **검증하지 못했다**. 이 검사는 공개 revision 및 호스팅 범위에 한정된다.

## 다음 보완 순서

1. 실패 시점의 순위 원시 행과 변환 후 행을 같은 표본으로 연결하는 최소 진단을 설계한다. 선수명·토큰·전체 페이지 DOM은 수집하지 않는다.
2. 모든 순위가 1인 초기 표가 기존 안정화 횟수 동안 유지된 뒤 정상화되는 시나리오를 실제 추출·가상 스크롤 경로의 회귀 테스트로 만든다. 숨은 중복 표와 래퍼 구조 차이도 별도 대조한다.
3. 원인이 확인되면 bounded readiness 또는 추출 경로를 수정한다. 검증기 우회, 무한 재시도, 임의 순위 보정은 하지 않는다.
4. 단위·브라우저 회귀를 통과한 버전만 백업·설정 보존 절차로 재배포한다. 증분 수집 1회로 전체 조와 기존 일반 오류 경계 통과를 확인한다.
5. 성공 후보의 동일성 비교, 삭제 후보, A조 공동 순위, 경기 상세 경고를 검토하고 서버 검증한다. 게시·활성화는 별도 승인 전까지 하지 않는다.

## 롤백 및 증거

필요 시 직전 이미지 `synapse9983/aubl-uniqueplay-sync-worker:standings-20260913-8d9a46c475f7@sha256:a1036c127799dec9acd2dbe4b8cbe384e4e6ad079a40fe539657549f2866f79d`로 동일 설정을 유지해 교체할 수 있다. 워커 16에도 알려진 수집 실패가 있으므로 롤백은 문제 해결을 의미하지 않는다. DB 복원이나 실패 실행 삭제는 자동으로 수행하지 않는다.

- 배포 증거: `docs/release/evidence/uniqueplay-readiness-worker-deployment-2026-09-13/`.
- 로컬 빌드 원본: `/tmp/aubl-readiness-worker-20260913.1QdBX8`.
- 선행 구현·시험: `docs/release/uniqueplay-collection-readiness-diagnostics-2026-09-13.md`.
- 이전 워커 16 배포: `docs/release/uniqueplay-standings-worker-deployment-2026-09-13.md`.
- 이전 문서의 pending deployment 표시는 당시 이력이다. 워커 17의 현재 운영 상태는 본 보고서를 따른다.

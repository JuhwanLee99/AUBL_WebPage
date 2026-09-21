# UniquePlay 검증 후보 이미지 업로드 결과

## 승인과 실행 결과

사용자가 `이미지 업로드 진행`으로 기존 Docker Hub 저장소에 검증 후보 두 개를 전송하도록 명시적으로 승인했다. 이전 자동 보안 검토 거부를 우회하지 않았으며, 승인 후 같은 범위의 명령을 다시 요청해 실행했다.

`docker --context desktop-linux push` 두 건 모두 성공했고 전체 명령의 종료 코드는 0이다. 반환된 registry manifest digest는 기존에 검증한 후보와 일치한다.

| 대상 | 업로드한 새 태그 | Registry manifest digest |
|---|---|---|
| 백엔드 | `synapse9983/aubl-backend:incremental-20260912-ea0b89d7740e` | `sha256:ea0b89d7740e3a3f1a2592eecfb360e3d49314a0ed6e1381b3c58f96b959b62d` |
| 워커 | `synapse9983/aubl-uniqueplay-sync-worker:incremental-20260912-101af1ec62df` | `sha256:101af1ec62df94924e91ffd1d91878afec799da4231f1cf3cd3121614f15ed46` |

기존 `v25`, `v13`, `latest` 태그는 변경하지 않았다. 새로 빌드하거나 테스트 전용 이미지를 올리지 않았으며, 앞서 검증한 `linux/amd64` 후보를 그대로 업로드했다. 이 결과는 registry push 성공에 대한 증거이며 NAS의 pull·컨테이너 교체·실제 운영 동작 성공을 의미하지 않는다.

## 운영 교체 중단 사유: 별도 컨테이너 변경 발견

이미지 업로드 중 Portainer 목록에서 이전과 다른 운영 백엔드가 확인됐다.

| 항목 | 앞서 확인한 운영 상태 | 새로 관찰한 상태 |
|---|---|---|
| 이름 | `ix-aubl-backend-aubl-backend-1` | 동일 |
| 이미지 태그 | `synapse9983/aubl-backend:v25` | `synapse9983/aubl-backend:v1` |
| 컨테이너 ID | `39150562813c94bfbe04c5d1b8c7000536330b59cd51a99eb1656e1bb6d6c9f7` | `4ffa6cbfd22286769f2dc53f11037621964b20a1b4c30f9e27253165652b51d3` |
| 새 컨테이너 생성 시각 | 해당 없음 | 2026-09-12 23:18:07 KST |
| 새 컨테이너 표시 상태 | 해당 없음 | running |

이번 작업에서는 TrueNAS의 업데이트·설정 저장이나 운영 컨테이너의 Stop·Recreate·Duplicate/Edit 제출을 실행하지 않았다. 변경 주체와 원인은 아직 확인되지 않았고, TrueNAS의 오래된 설정과 태그가 같다는 이유만으로 원인을 단정하지 않는다. 사용자에게 앱 업데이트 또는 설정 저장을 실행했는지 질문하고 운영 교체를 중단했다.

이 시점의 worker는 기존 `synapse9983/aubl-uniqueplay-sync-worker:v13`, 컨테이너 `bc632ae4d8d98c4e53d2d330f3948c1ad48b5168633f2fa5f6b537ca982a6cc7`로 표시됐다. MariaDB는 기존 컨테이너가 healthy 상태였다. 이 표시만으로 새 v1 백엔드의 실제 연결 DB나 스키마 상태를 확인했다고 취급하지 않는다.

## 후속 작업

1. 사용자에게 확인 중인 운영 컨테이너 변경의 경위를 확인한다.
2. 새 v1 컨테이너의 설정을 검증 없이 배포 기준으로 복제하지 않는다. 앞서 확인한 v25 운영 연결·권한·마운트와 실제 데이터 상태를 대조해 보존할 기준을 다시 정한다.
3. 신규 쓰기 차단, 진행 중 작업 종료, 백업 이후 변경분과 복구 시점을 확인한다.
4. 사용자가 선택한 Portainer 방식으로 승인된 운영 교체를 이어간다. TrueNAS 저장 설정은 임의로 수정하지 않으며, 향후 TrueNAS 재배포 시 오래된 설정이 다시 적용될 수 있음을 유지 보수 주의사항으로 남긴다.
5. 실제 NAS pull 및 백엔드/V7, worker, 웹의 배포 결과는 이 업로드 성공과 별도로 기록한다.

관련 증거는 `uniqueplay-nas-backup-restore-2026-09-12.md`의 실제 NAS 백업 및 격리 복원 결과를 참고한다. 백업 파일과 정상 종료한 복원 검증 컨테이너는 그대로 유지했다.

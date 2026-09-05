# UniquePlay 스크롤 메서드 회귀 수정 — 워커 v13

## 결론과 범위

v9는 117경기와 상세기록 112건을 실제 수집했다. 이후 목록 완전성 보강 과정에서 발생한 스크롤 회귀를 수정한다. v9 전체로 되돌리지 않고, **이동 명령만 `scrollTop` 직접 대입으로 복구**한다. 실제 스크롤 영역 선택, 끝 3회 안정화, 조별 종료 경기 수 하한 검사, 개인정보 정제, 관리자 검수·수정·게시 정책은 유지한다.

Spring v25, Firestore/MariaDB, 웹·Flutter는 이번 변경 대상이 아니다. 자동 수집·스케줄러·자동 재시도·검증 우회를 추가하지 않는다.

## 버전별 경과

| 버전 | 관찰된 결과 | 원인/경계 |
| --- | --- | --- |
| v9 | 실행 `f994f85b-b6dc-4845-8b47-dd62eb63f352`, 13:36:33–13:46:27 KST. 종료 117경기, 상세 AVAILABLE 112 + 명시적 미게시 5 | 수집 성공. 원천 집계 불일치 10경기와 누적 선수 삭제 후보 419건은 별도 검수 이슈이며 v9 전체가 완전했다는 뜻은 아니다. |
| v10 | 실행 `0093edba-f02e-4f64-aee1-bd781d666b95`, 종료 6경기만 수집 | visible-overflow 경기 카드가 실제 스크롤 목록으로 오인됨. 첫 8개 카드 중 올스타 2개를 제외한 6개만 읽음. |
| v11 | 실행 `b1c58e0e-9ca2-479b-b643-f00847d77b39`, 표 수집 중단 | standards 모드 BODY를 실제 스크롤 요소로 오인함. 후보 생성 없이 중단. |
| v12 | 실행 `9c820ce8-b38c-4663-acc4-602fe7ccc1a5`, 16:58:55–16:59:52 KST. A조 BATTER_IN 20행에서 중단 | 실제 DIV는 찾았지만 원천 페이지가 DOM 요소의 `scrollTo`를 자체 메서드로 덮어써 native `{top}` 호출이 작동하지 않음. |
| v13 | 스크롤 직접 대입 복구. 로컬/amd64 테스트 및 NAS 인메모리 실제 표 검증 완료 | Docker Hub 업로드 승인 대기. 전체 시즌 수집 성공을 아직 선언하지 않음. |

v12의 안전 오류 메시지: `group=A; table=BATTER_IN; rows=20; atEnd=false; top=0; height=620; total=1453`. 검증을 약화하여 이 오류를 숨기지 않는다.

## NAS에서 확인한 원인

현재 v12 컨테이너의 Portainer Exec에서 기존 암호화 세션을 컨테이너 내부에서만 사용했다. A조 규정 IN 타자 순위표 한 개에 한정해 읽었으며, 운영 수집 API/서버 콜백을 호출하지 않았다. HTML·선수명·계정 정보·세션 값은 출력하거나 저장하지 않았다.

1. 최초 표: 20행, DIV `height=620`, `total=1453`, `top=0`.
2. NAS Playwright의 실제 평가 영역에서 `scrollTo`는 `native=false`, `ownMethod=true`였다.
3. v12 helper 호출 직후 및 1초 후에도 `top=0`, 20행으로 정지했다.
4. 같은 표에 v9의 직접 대입을 적용하자 `top=496 → 833`으로 이동하고 20 → 40행으로 추가 로딩됐다. 전체 높이는 2353으로 증가했다.
5. 추가 이동으로 `top=1329 → 1733`까지 도달했다.

일반 Chrome DOM 검사에서 메서드가 native로 보였던 결과만으로 NAS의 동작을 단정하지 않았다. 장애가 난 **동일 컨테이너·Playwright 실행 환경**에서 자체 메서드와 정지 현상을 직접 재현했다. 원천 프레임워크의 내부 구현이나 호출 계약은 추정하거나 복사하지 않았다.

첫 진단 명령은 콘솔 인용부호 처리 오류로 Node 파싱에 실패했고, 긴 data URI 입력은 콘솔 연결을 완료하지 못했다. 안전한 단일 인용 인라인 입력으로 바꿨다. 초기 페이지 로딩 대기를 맞춘 뒤 비교가 완료됐다. 실패한 진단도 후보나 공개 데이터에 영향을 주지 않았다.

## 구현

- 어댑터 `2026.09.05.13`.
- `scrollCollectionDom`은 기존 타깃 선택을 유지하고 `target.scrollTop = ...`로 이동한다. 원천 자체 `scrollTo()` 메서드를 호출하지 않는다.
- `inspectOnly`는 계속 읽기 전용이며, `advanced`/`atEnd`는 실제 변경 후 기하 정보에서 판정한다.
- v10의 visible 카드 제외, v11 BODY 회피, fitted 표 종료, lazy batch 추가 대기, 끝 3회 안정화, 불완전 후보 차단은 유지한다.
- 단위 테스트의 가짜 DOM에 실제처럼 범위를 제한하는 `scrollTop` setter를 추가했다. 멈춘 표·비스크롤 카드·문서 스크롤 조건을 무조건 통과시키지 않는다.
- 자체 `scrollTo`가 예외를 던지더라도 경기/표 helper가 해당 메서드를 호출하지 않는 단위 회귀를 추가했다.
- 실제 Chromium fixture에 자체 no-op 메서드와 620/1453 → 2353px 지연 로딩 구조를 추가했다. 20행 정지 재현과 40행 완주를 함께 검사한다. 기존 경기 lazy-list fixture에도 자체 메서드를 적용했다.
- 명시적 운영자 진단 스크립트 `services/uniqueplay-sync-worker/scripts/diagnose-scroll.mjs`를 추가했다. 환경의 시즌·리그 설정을 사용하며, A조 타자 표만 비교하고 실제 끝 3회 안정화를 확인한다. 서버/API에서 실행되지 않고 Docker 이미지에도 포함되지 않는다.

## 검증 결과

- `npm run test:uniqueplay`: 워커 64 + 웹/기록 검수 회귀 71 = **135개 통과**.
- 실제 Chromium CSS 테스트 **3개 통과**. 전체 고유 테스트 **138개**, 실패 0개.
- macOS 샌드박스에서는 Chromium 프로세스 실행 권한 때문에 시작이 차단됐다. 승인된 실행 환경에서 외부 네트워크를 차단한 동일 fixture 3개를 재실행해 통과했다.
- 최종 **linux/amd64 v13 이미지**에서도 `--network none`으로 Chromium fixture 3개 통과.
- 이미지의 네트워크 차단 기동 검사: `/health` HTTP 200, `adapterVersion=2026.09.05.13`, `activeRuns=0`.
- `git diff --check`, 진단 스크립트 Node 구문 검사 통과.

### 실제 NAS 수정 로직 검증 (배포 전)

현재 v12 컨테이너에 파일을 쓰지 않고, 진단 프로세스 메모리에서 설치된 helper의 이동 구문만 v13과 같은 직접 대입으로 교체하여 실행했다. DOM 타깃 선택은 그대로 유지했다. 전체 시즌 수집이 아닌 동일 A조 표 한 개만 검사했다.

```json
{"method":"v13-in-memory","immediate":{"advanced":true,"atEnd":false,"top":496,"height":620,"total":1453,"reason":null}}
{"proof":"FIXED_HELPER_STABLE_END","rows":40,"stableReads":3,"scroll":{"advanced":false,"atEnd":true,"top":1733,"height":620,"total":2353,"reason":null}}
```

출력 `DIAGNOSTIC_COMPLETE_NO_CANDIDATE` 확인. 브라우저는 `finally`에서 종료했다. 이 결과는 수정 로직의 실제 표 통과 증거이며 **NAS에 v13 이미지가 배포됐다는 뜻은 아니다**.

## 이미지와 배포 상태

- 로컬 빌드: `synapse9983/aubl-uniqueplay-sync-worker:v13`, `linux/amd64`.
- Manifest: `sha256:1beaa0c65c6e9ae3e14e80c14f2029b32ace97cadd6e50538412f226a7e37787`.
- Image config: `sha256:9f698b011672e5be003def7773a73d32b7e1780edb483ca90def6b74f6551e65`.
- **Docker Hub push는 실행 승인 단계에서 거절되어 수행되지 않았다.** 기존 저장소로의 새 v13 이미지 외부 전송에 대한 명시적 승인 대기다. 우회 전송이나 NAS 파일 교체를 하지 않았다.
- NAS 운영 컨테이너는 기존 v12 `103e1a321f4251c4f6931d9fa57bdd9d9b73d2f1faaa4b00a7c37b274d9d1a98` 그대로다.
- 관리자 세션 확인: 연결됨, 활성 실행 없음. 수집·검증·게시·활성화를 누르지 않았다.
- 17:16:48 KST 공개 overview GET HTTP 200, `publishedRevision=375df8a9-5f3b-49f6-81a6-cc26906c4465`, `syncMode=MANUAL` 유지.
- Word 전수검수 보고서의 기존 사용자 변경은 건드리거나 커밋하지 않는다.

## 승인 후 남은 작업

1. 기존 Docker Hub 저장소에 v13 업로드 후 digest 확인.
2. 활성 수집이 없는지 재확인하고, 환경변수 12개·암호화 세션·네트워크·재시작 정책·볼륨 설정을 보존하여 워커만 교체.
3. NAS 기동 버전/세션 및 공개 리비전 불변을 확인하고, 설치된 v13 helper로 A조 표 진단 재검증.
4. 관리자가 명시적으로 새 수집을 실행한 후 전체 시즌 결과와 기존 검수 경고를 확인. 실패 실행을 반복 검증하거나 빈/불완전 후보를 게시하지 않음.

기존 원천 기록 오류와 누적 선수 삭제 후보 419건은 이 스크롤 수정만으로 해결됐다고 간주하지 않는다. 첫 실수집에서 누락과 별칭/규정 IN·OUT 이동 영향을 다시 대조해야 한다.

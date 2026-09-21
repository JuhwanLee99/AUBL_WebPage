# 운영 CORS 보완 및 검증 결과

작성일: 2026-09-12, 시간대: Asia/Seoul.

## 0. 후속 상태 (2026-09-13)

아래 본문에서 남은 문제로 기록한 워커 연결 설정을 보완했다. 관리자 화면의 `연결됨`과 `인증: 확인됨`을 확인했으며 기존 두 출처의 CORS 정책도 유지됐다. 현재 상태는 연결 완료, 실제 증분 수집 대기다. 상세 결과는 `uniqueplay-production-worker-connection-2026-09-13.md`를 참고한다. 아래 본문은 CORS 보완 당시의 기록으로 보존한다.

## 1. 결과

CORS 문제는 해결했다. 신규 이미지 빌드나 코드 변경 없이 운영 백엔드의 누락된 환경변수 1개를 추가하여 재배포했다.

```dotenv
APP_CORS_ALLOWED_ORIGINS=https://aubl.club,http://localhost:5173
```

`http://localhost:5173`은 작업 중 사용자의 명시적 추가 요청을 반영했다. 허용 출처의 와일드카드는 사용하지 않았다. `127.0.0.1`, 다른 포트, 다른 스킴, Firebase 기본 도메인 등은 이번 허용 목록에 추가하지 않았다.

최종 상태는 `CORS_RESOLVED / SYNC_BLOCKED_BY_WORKER_CONFIGURATION`이다. 관리자 화면은 이제 실제 API 응답을 수신하지만 `UniquePlay worker is not configured`가 표시되므로, 전체 동기화 정상화 또는 운영 사용 승인을 완료한 것은 아니다.

## 2. 원인과 선택한 해결 방식

백엔드 `src/main/java/com/aubl/webpage/config/SecurityConfig.java`는 `app.cors.allowed-origins`를 읽고, 설정이 없으면 `http://localhost:3000`을 기본값으로 사용한다. 이 목록은 `CorsConfigurationSource`에서 적용하며 Spring Security의 CORS 처리는 이미 활성화돼 있다.

운영 컨테이너에는 CORS 설정 환경변수가 없었다. 따라서 운영 웹 출처에서 발생한 사전 요청이 `403 Invalid CORS request`로 거부됐고, 관리자 화면에는 `Failed to fetch`만 표시됐다. 기존 보안 필터는 OPTIONS를 허용하고 있었으므로 OPTIONS의 인증을 해제하는 식으로 추가 우회할 필요가 없었다.

검토한 방안은 다음과 같다.

| 방안 | 판단 |
|---|---|
| Java 기본값에 운영 도메인 하드코딩 | 환경별 정책을 코드에 결합하고 새 이미지 검증·배포가 필요하여 선택하지 않음 |
| 모든 출처 허용 또는 인증 해제 | 필요 이상 접근을 허용하므로 배제 |
| 기존 설정 인터페이스로 정확한 출처 지정 | 코드와 검증된 이미지를 유지하고 누락된 배포 설정만 바로잡을 수 있어 선택 |

Spring의 환경변수 설정 경로를 통해 `APP_CORS_ALLOWED_ORIGINS`를 지정했다. 기존 `allowCredentials=true`, 허용 HTTP 메서드와 요청 헤더 설정은 변경하지 않았다. 관리자 API의 Firebase 인증과 ADMIN 권한 요구도 변경하지 않았다.

## 3. 적용 범위

- 재배포 전 워커 HTTP 200, `activeRuns=0`, adapter `2026.09.12.14` 확인.
- 기존 백엔드 환경변수 18개를 전후 비교하여 전부 보존.
- 새 환경변수 1개 추가, 최종 19개.
- DB `aubl`, 기존 포트·네트워크·마운트 보존.
- 백엔드 이미지 유지: `synapse9983/aubl-backend:incremental-20260912-ea0b89d7740e`.
- manifest 유지: `sha256:ea0b89d7740e3a3f1a2592eecfb360e3d49314a0ed6e1381b3c58f96b959b62d`.
- 실행 image ID 유지: `sha256:6c9e58bae79cc069fd8c6501c54877eb153ce95ffb73a156610354a2d16e66c5`.
- 교체 전 컨테이너: `051178926ccec825d41a65b6b469ee7b54fe5c157812fc73f59a8010236397de`.
- 교체 후 컨테이너: `6df5ab706a9eb1b1474f6ba545175e67a288c5f246297b2cdb4a83946268c3f7`.
- 워커와 웹은 재배포하지 않음.
- 실제 수집, 게시, 공식 활성화, 기록 수정·삭제는 실행하지 않음.

재기동 로그에서 `23:56:32.176`에 DB 버전 7, `23:56:32.179`에 추가 마이그레이션 불필요, `23:56:36.007`에 애플리케이션 기동 완료를 확인했다. 이번 설정 변경에서는 DB 전체 대조를 다시 수행하지 않았으므로 앞선 공식본 보존 확인과 구분한다.

## 4. 실제 운영 API 검증

대상은 기존 관리자 실행 조회 경로다.

```text
https://api.aubl.club/api/admin/sync/unique-play/runs/cf773fa4-b019-4f47-a3c6-81fe11bd0495
```

사전 요청에는 `Access-Control-Request-Headers: authorization,content-type`을 사용했다. OPTIONS는 실제 수집이나 쓰기를 수행하지 않는다. 실제 GET도 인증 토큰 없이 실행하여 관리자 보호가 유지되는지 확인했다.

| 번호 | 출처 | 요청 | 기대 및 실제 결과 |
|---|---|---|---|
| 1 | `https://aubl.club` | GET 사전 요청 | 200, 정확한 출처 응답, credentials=true |
| 2 | `https://aubl.club` | POST 사전 요청 | 200, 정확한 출처 응답, credentials=true |
| 3 | `http://localhost:5173` | GET 사전 요청 | 200, 정확한 출처 응답, credentials=true |
| 4 | `http://localhost:5173` | POST 사전 요청 | 200, 정확한 출처 응답, credentials=true |
| 5 | `https://untrusted.example` | GET 사전 요청 | 403, Allow-Origin 없음 |
| 6 | `https://aubl.club.untrusted.example` | GET 사전 요청 | 403, Allow-Origin 없음 |
| 7 | `http://localhost:3000` | GET 사전 요청 | 403, Allow-Origin 없음 |
| 8 | `https://aubl.club` | 비인증 관리자 GET | 401, 정확한 출처 응답 |
| 9 | `http://localhost:5173` | 비인증 관리자 GET | 401, 정확한 출처 응답 |

9건 모두 기대값과 일치했고 확인 스크립트는 종료 코드 0을 반환했다. 이는 운영 HTTP 검증이며, 단위 테스트 9개 또는 전체 E2E 통과로 집계하지 않는다. 로컬 개발 서버의 실제 로그인과 전체 동기화는 실행하지 않았다.

## 5. 실제 브라우저 확인

기존 관리자 로그인 세션으로 운영 웹을 조회했다.

- 홈 데이터 현황에서 일정·결과 및 조별·개인 기록 영역의 연결 상태가 `조회 완료`로 표시됨.
- 홈의 시즌 정보 조회 실패 경고가 더 이상 관측되지 않음.
- 타자·투수 리더 영역은 여전히 공개된 기록이 없다는 표시가 남음. 이 데이터 상태는 별도 확인 대상이며 CORS 성공만으로 기록 완전성을 보장하지 않음.
- 관리자 동기화 화면의 `Failed to fetch`가 사라짐.
- 대신 서버가 반환한 `UniquePlay worker is not configured`가 표시됨.
- 세션 상태는 사용 불가, 수집 시작은 비활성 상태를 유지함.

따라서 CORS 및 브라우저에서 관리자 API까지의 통신은 복구됐다. 백엔드에서 워커로 연결하는 설정은 아직 미완료다. 워커 자체의 헬스 성공을 백엔드와 워커 사이의 연결 성공으로 혼동하지 않는다.

## 6. 후속 작업과 운영 주의사항

1. 백엔드의 워커 주소 및 서비스 인증 설정을 확인하고 기존 워커와 일치시키는 작업에 대해 사용자 승인을 받는다.
2. 설정 보완 후 로그인된 관리자 화면에서 수집 세션의 실제 사용 가능 상태를 확인한다.
3. 이후 별도 승인된 제한적 실제 증분 수집을 진행한다. 이번 작업은 실제 수집 승인이 아니다.

TrueNAS의 저장 원본 앱 설정과 Portainer 런타임 구성 차이는 여전히 남아 있다. TrueNAS 앱 재배포로 이전 이미지·DB 설정뿐 아니라 이번 CORS 설정도 사라질 수 있으므로, 후속 설정 보완과 최종 운영 인계에서 반드시 함께 관리해야 한다.

로컬 5173 허용은 해당 출처의 브라우저 요청을 허용하는 것이다. 로컬 앱이 운영 API를 대상으로 설정되면 실제 운영 데이터를 사용할 수 있으므로, 테스트 경기 격리 정책과 관리자 권한을 별도로 준수해야 한다.

소스 코드, 단위 테스트, Docker 이미지, Hosting 릴리스는 변경하지 않았다. 문서에는 설정 키와 비밀이 아닌 출처 값만 기록했으며 토큰·세션 키는 기록하지 않았다.

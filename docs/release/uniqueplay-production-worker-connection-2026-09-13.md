# 운영 백엔드와 UniquePlay 워커 연결 보완

작성일: 2026-09-13, 시간대: Asia/Seoul.

## 1. 결과와 범위

`DEPLOYED_CONNECTION_READY_PENDING_LIVE_SYNC`

누락된 백엔드의 워커 연결 설정을 추가하고 재배포했다. 실제 운영 관리자 화면에서 다음 상태를 확인했다.

- 연결 세션: `연결됨`.
- 인증: `확인됨`.
- 활성 실행: `없음`.
- `2026 시즌 수집 시작` 버튼: 활성화.
- 기존 `UniquePlay worker is not configured` 오류: 해소.

이번 작업은 연결 설정과 읽기 전용 세션 조회의 검증이다. 수집 시작 버튼은 누르지 않았고, 실제 경기 재수집·후보 저장·게시·공식 활성화·기록 수정 및 삭제는 수행하지 않았다. READY 응답만으로 실제 UniquePlay 수집과 결과 병합의 운영 검증을 통과했다고 판정하지 않는다.

## 2. 원인

백엔드 `application.properties`는 다음 환경변수를 서비스 설정에 연결한다.

```properties
uniqueplay.worker.url=${UNIQUEPLAY_WORKER_URL:}
uniqueplay.worker.token=${UNIQUEPLAY_WORKER_TOKEN:}
```

`UniquePlaySyncService.session()`은 둘 중 하나가 비어 있으면 `UNAVAILABLE`과 `UniquePlay worker is not configured`를 반환한다. 실제 컨테이너의 기존 환경변수 19개에는 두 설정이 모두 없었다.

워커는 정상 실행되고 자체 `/health`도 성공했지만 백엔드가 워커를 호출할 주소와 인증 값을 갖고 있지 않았던 것이다. 단독 워커 헬스와 백엔드에서 워커까지의 연결을 별도 검증해야 하는 사례다.

## 3. 적용한 설정

```dotenv
UNIQUEPLAY_WORKER_URL=http://aubl-uniqueplay-sync-worker:8080
```

`UNIQUEPLAY_WORKER_TOKEN`에는 기존 워커의 `SYNC_SERVICE_TOKEN`과 동일한 값을 적용했다. 새 토큰 발급·회전·공개나 인증 해제는 하지 않았고, 이 문서와 설정 예시에는 비밀 값을 기록하지 않는다.

기존 Docker 네트워크 `ix-aubl-backend_default`와 컨테이너 이름 기반 내부 주소를 사용했다. 워커용 외부 도메인이나 호스트 포트를 새로 열지 않았으며, 워커 이미지는 변경하지 않았다.

서비스의 기존 호출 방식은 `Authorization: Bearer <worker token>`을 포함한 `GET /session`이다. 이를 그대로 사용했으며 API 또는 인증 코드 변경은 필요하지 않았다.

## 4. 재배포와 설정 보존

| 항목 | 결과 |
|---|---|
| 교체 전 백엔드 | `6df5ab706a9eb1b1474f6ba545175e67a288c5f246297b2cdb4a83946268c3f7` |
| 교체 후 백엔드 | `c96e724ac8f5da71d179ef4c241beafd17c9c3aaec0d80a752be78694dbe8231` |
| 백엔드 이미지 | `synapse9983/aubl-backend:incremental-20260912-ea0b89d7740e` 유지 |
| manifest digest | `sha256:ea0b89d7740e3a3f1a2592eecfb360e3d49314a0ed6e1381b3c58f96b959b62d` 유지 |
| 실행 image ID | `sha256:6c9e58bae79cc069fd8c6501c54877eb153ce95ffb73a156610354a2d16e66c5` 유지 |
| 기존 환경변수 | 19개 모두 보존 |
| 추가 환경변수 | 워커 주소·토큰 2개 |
| 최종 환경변수 | 21개 |
| 운영 DB | `aubl` 연결 유지 |
| CORS | `https://aubl.club,http://localhost:5173` 유지 |
| 워커 컨테이너 | `a5c45314afd000bc8f6f5065b303cc3088eaf4d7564f1e7d63bb94fc238cd464` 유지 |
| 워커 adapterVersion | `2026.09.12.14` |

재배포 전후 환경변수를 비교해 기존 19개가 그대로이고 새 토큰이 기존 워커 토큰과 동일함을 확인했다. Portainer의 복제·교체 방식으로 기존 이미지, 네트워크, 포트와 마운트를 유지했다. 제품 소스·테스트·Docker 이미지·Hosting 릴리스는 수정하지 않았다.

## 5. 실행한 검증

### 워커 내부 조회

컨테이너 콘솔에서 내부 주소 `http://aubl-uniqueplay-sync-worker:8080`으로 다음 요청을 실행했다. 출력은 HTTP 상태와 필요한 상태 필드로 제한했으며 토큰은 출력하지 않았다.

| 요청 | 실제 결과 |
|---|---|
| 비인증 `GET /health` | HTTP 200, `activeRuns=0`, adapter `2026.09.12.14` |
| 비인증 `GET /session` | HTTP 401 |
| 기존 토큰으로 `GET /session` | HTTP 200, `status=READY`, `connected=true` |

이는 내부 이름 해석과 워커의 인증 처리 확인이다. 이후 실제 관리자 화면의 성공 응답으로 브라우저에서 백엔드를 거쳐 워커로 이어지는 세션 조회도 확인했다. 워커 조회 콘솔은 종료하고 Connect 화면으로 돌아온 것을 확인했다.

### 재배포 후 CORS·인증 유지

기존 관리자 실행 조회 경로에 데이터 쓰기 없는 요청을 수행했다.

| 요청 | 실제 결과 |
|---|---|
| `https://aubl.club` 출처의 GET 사전 요청 | HTTP 200, 정확한 Allow-Origin |
| `http://localhost:5173` 출처의 GET 사전 요청 | HTTP 200, 정확한 Allow-Origin |
| `https://untrusted.example` 출처의 GET 사전 요청 | HTTP 403, Allow-Origin 없음 |
| `https://aubl.club` 출처의 비인증 관리자 GET | HTTP 401 |

확인 스크립트는 4건 모두 통과, 종료 코드 0을 반환했다. 이전 CORS 보완의 9건과 이번 재배포의 4건은 서로 다른 실행이다. 이 결과를 단위 테스트나 전체 수집 E2E 통과 수로 계산하지 않는다.

### 실제 관리자 화면

기존 로그인 세션으로 `/admin/unique-play-sync`를 다시 열어 연결·인증 확인과 수집 버튼 활성화를 확인했다. 기본 수집 범위는 `마지막 공식 반영 이후 (기본)`이며 `지정 날짜부터 다시 수집` 옵션도 유지돼 있다.

화면에 세션 만료 시각은 `-`로 표시됐다. 실제 만료 시각을 확인했거나 장기간 연결이 보장된다고 주장하지 않는다.

## 6. 남은 운영 작업과 제한

1. 실제 증분 수집을 시작하기 전에 시즌, 기준일, 마지막 공식본, 실행 범위를 명시하고 사용자 승인을 받는다.
2. 최초 운영 수집은 결과를 바로 게시하지 않고, 이전 상세 보존·기준일 이후 병합·변경 비교를 먼저 확인한다.
3. 후보 수집과 게시·공식 활성화는 별도 단계로 취급한다. 이번 연결 확인은 그 실행 승인이 아니다.
4. TrueNAS 저장 앱 설정과 Portainer 실행 구성의 차이를 해결하거나 명시적으로 관리한다. TrueNAS 앱 재배포 시 이전 이미지·DB 설정이 다시 적용되고 CORS·워커 연결 설정이 사라질 위험이 여전히 남는다.

운영 DB 전체 내용이나 공식 리비전 체크섬은 이번 연결 보완에서 다시 전수 확인하지 않았다. 앞선 배포의 백업·공식본 보존 증거는 원래 문서에 남겨 두고, 이번 작업에서 확인하지 않은 항목을 새로 검증한 것으로 표시하지 않는다.

로컬 5173의 허용도 유지되므로 로컬 개발 앱이 운영 API를 대상으로 설정되면 운영 접근이 가능하다. 개발·테스트 시 테스트 경기 격리와 권한 정책을 별도로 준수해야 한다.

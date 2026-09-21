# UniquePlay 증분 수집 워커 후보 이미지

## 실행 결과

- 상태: 로컬 배포 후보 이미지 빌드 성공. 실행 검증 및 운영 배포 승인과 구분한다.
- 생성 시각(UTC): 2026-09-12T13:34:42.010Z
- 로컬 태그: `aubl-uniqueplay-sync-worker:incremental-20260912-candidate`
- 어댑터 버전: `2026.09.12.14`
- 대상 플랫폼: `linux/amd64`
- 빌드 메타데이터의 이미지 digest: `sha256:101af1ec62df94924e91ffd1d91878afec799da4231f1cf3cd3121614f15ed46`
- 빌드 메타데이터의 config digest: `빌드 메타데이터에 미제공`
- 빌드 로그: `/tmp/aubl-worker-candidate.anK4OE/build.log`
- 원본 메타데이터: `/tmp/aubl-worker-candidate.anK4OE/build-metadata.json`
- 빌드 입력 스냅샷: `/tmp/aubl-worker-candidate.anK4OE/context`

위 경로는 로컬 임시 증거이며 영구 백업이 아니다. digest는 성공한 buildx 출력에서 가져왔고, registry 업로드 또는 NAS에 설치된 이미지의 digest를 뜻하지 않는다.

## 구성과 변경 범위

- 기존 워커의 증분 수집 구현을 포함하고 어댑터 버전만 이번 후보 버전으로 올렸다. 날짜 범위 요청과 서버 병합 책임을 워커 README에 보강했다.
- 기존 Dockerfile을 사용한다. 베이스 선언은 `mcr.microsoft.com/playwright:v1.62.0-noble`, Node 패키지의 Playwright 버전은 `1.62.0`이다. 런타임은 `pwuser` 사용자로 `node src/server.mjs`를 실행한다.
- 빌드 컨텍스트에는 Dockerfile, package.json, 존재하는 package-lock.json, .dockerignore 및 src만 복사했다. 운영 환경 파일, 로그인 세션, 테스트 자료 및 자격 증명은 복사 대상으로 지정하지 않았다.
- Dockerfile의 기존 의존성 설치 방식은 변경하지 않았다. 베이스는 태그 참조이므로 향후 재빌드가 같은 digest를 만들 것이라고 보장하지 않는다. 배포 시 이번 성공 산출물의 registry digest를 별도로 고정해야 한다.
- Auth·Firestore 에뮬레이터, 테스트용 Spring 앱, 테스트 자료는 이 워커 배포 후보에 추가하지 않았다.

## 재생성 명령

아래 명령의 <BUILD_CONTEXT>는 위 허용 파일만 복사한 컨텍스트이며 <METADATA_JSON>은 빌드 결과 저장 경로다. 임의의 운영 디렉터리 전체를 빌드 컨텍스트로 사용하지 않는다.

```sh
docker --context desktop-linux buildx build \
  --builder aublx \
  --platform linux/amd64 \
  --load \
  --tag aubl-uniqueplay-sync-worker:incremental-20260912-candidate \
  --label org.opencontainers.image.version=2026.09.12.14 \
  --label club.aubl.release.stage=candidate \
  --metadata-file <METADATA_JSON> \
  <BUILD_CONTEXT>
```

## 검증 및 배포 경계

이번 작업은 이미지 생성과 버전·빌드 명세 기록이다. 단위 테스트, 컨테이너 기동, 실제 UniquePlay 수집, 운영 API 요청은 실행하지 않았다. 이전에 통과한 합성 워커 단위 테스트 76건과 에뮬레이터 전체 흐름 결과를 이번 후보 이미지의 실행 검증 결과로 대체하지 않는다.

1. 다음 검증은 후보 컨테이너의 버전·기동·인증 및 날짜 범위 계약을 로컬 격리 환경에서 확인하는 것이다. 별도 승인 후 수행한다.
2. scope 계약을 지원하는 백엔드와 프런트엔드의 최종 배포 조합, 운영 설정·백업·복구·실행 명세를 먼저 확정한다. 오래된 백엔드로 scoped 요청을 보내거나 전체 수집으로 자동 폴백하지 않는다.
3. registry의 최종 태그와 push는 아직 미승인이다. 로컬 후보 태그를 운영 `v13`의 교체 승인으로 해석하지 않는다.
4. 실제 NAS 워커와 원천 사이트 수집, 운영 인증, 모바일 검증 및 제한 운영 실행은 아직 남아 있다.

이번 작업은 이미지 push, 운영 컨테이너 재시작·교체, 실제 동기화·공식 게시 또는 운영 데이터 변경을 수행하지 않았다. **로컬 후보 빌드 완료 / 운영 배포 미승인** 상태다.

## 격리 검증 후속 결과

2026-09-12T13:39:25.225Z: PASSED_ISOLATED_CANDIDATE_CHECKS. 집계: {"tests":121,"pass":121,"fail":0,"cancelled":0,"skipped":0,"todo":0}. 컨테이너 정리: true. 상세는 [후보 이미지 격리 검증](./uniqueplay-worker-candidate-verification-2026-09-12.md)을 참조한다. 빌드 당시 미검증 상태와 구분하며 운영 배포 미승인은 유지한다.

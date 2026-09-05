# 홈 게시 기준 시각 및 일정 조회 상태 보강

## 변경 이유

- 히어로의 `일정 · 결과`는 방문자의 브라우저 조회 종료 시각을 표시하고, `조별 · 개인 기록`은 서버 게시 시각을 표시해 서로 다른 의미의 시간이 함께 노출됐다.
- `loadFullSchedule`이 조회 예외를 내부에서 무시하고 정상 종료하여 홈이 실패도 `조회 완료`로 표시했다.

## 구현

- 두 항목 모두 시즌 overview의 `sourceFreshness.publishedAt`을 `게시 기준 MM. DD. HH:mm` 형식으로 표시한다. 한국시간(KST)이며, 서버의 오프셋 없는 시각도 KST로 해석한다.
- 해당 서버 값은 활성 리비전의 `activatedAt`, 없으면 `createdAt`이다. UniquePlay 수집 시작·종료 시각 또는 방문자의 접속 시각을 의미하지 않는다.
- 브라우저의 `scheduleCheckedAt` 상태·prop·포맷터를 제거했다. 새로고침·재방문만으로 게시 기준 시각이 변경되지 않는다.
- 게시 메타데이터 확인 중, 확인 실패, 누락·잘못된 시각을 구분한다. 현재 시각으로 대체하지 않으며, 서버가 미게시 상태를 명시한 경우에만 `게시 전`으로 표시한다.
- `PENDING_MATERIALIZATION`은 `반영 확인 필요`로 표시한다.
- `loadFullSchedule`의 결과 타입을 `Promise<void>`에서 `Promise<ScheduleLoadResult>`로 바꾸고 `ready / cached / error`를 반환한다. 새 예외 전파를 추가하지 않아 반환값을 무시하는 기존 일정·기록원 호출도 처리되지 않은 Promise 오류가 발생하지 않는다.
- Firestore의 `metadata.fromCache`가 참이면 `저장된 일정 · 최신 여부 확인 필요`, 조회 실패이면 `연결 확인 필요`로 표시한다.
- 실패 시 기존에 불러온 경기는 유지하고 새로고침 안내를 제공한다. 실패·캐시 상태에서 경기 데이터가 없으면 정상적인 `등록된 예정 경기가 없습니다`로 오인하게 하지 않는다.
- 정상 데이터에서 오늘의 종료 경기 유지, 최근 결과, 달력 보기, 경기 상세 이동은 그대로 유지한다.

## 검증

- `npm run test:home-freshness`: 실제 LandingPage, 일정 조회 action, 기록 payload 처리, FreshnessBar를 연결한 격리 테스트 14개 통과.
  - 서버 조회 성공과 실패, 캐시, 기존 경기 유지, 빈 실패 화면, 서버 조회 재시도 회복
  - 재방문 시 게시 기준 시각 불변, 새 게시 시각 반영, UTC→KST 변환
  - API 실패, 누락·잘못된 게시 시각, 미게시, 반영 대기
  - 일반 관람/기록 권한 경로의 명시적 결과 반환 및 쓰기 없음
  - 360·768·1280px 라이트/다크에서 가로 넘침 없음
- 기존 `test:home-hero` 8개와 `test:home-matches` 13개 통과. 총 35개 통과.
- 타입 검사, 변경 TS/TSX의 ESLint, 새 테스트 구문 검사, 프로덕션 빌드 통과. 기존 번들 크기 경고는 남아 있다.
- 생성된 360px 라이트·1280px 다크 히어로 이미지에서 동일한 게시 기준 시각과 레이아웃을 확인했다.
- 테스트는 외부 API·Firebase·로그인·콘텐츠 경계를 fixture로 대체하고 외부 네트워크와 쓰기를 차단했다. 운영 조회 장애를 인위적으로 발생시키지 않았다.

## 범위 및 배포 상태

- 공개 웹과 공통 일정 조회의 결과 전달만 변경한다. 기록원 입력·저장 동작, NAS 백엔드, DB, UniquePlay 수집·검증·게시, Flutter는 변경하지 않는다.
- 구현 커밋 `cce4cf2`에서는 로컬 구현·검증을 완료했고, 이후 사용자 승인에 따라 아래 운영 배포를 수행했다.
- 기존 사용자 보고서 `.docx` 변경은 이번 커밋에서 제외한다.

## 운영 배포 결과

- 사용자 승인: `운영배포`.
- 배포 시각: 2026-09-05 18:48:43 KST (운영 HTML의 Last-Modified 기준).
- 배포 직전 타입 검사와 프로덕션 빌드를 다시 실행해 통과했다.
- `firebase deploy --only hosting --project aubl-backup --non-interactive`로 Firebase Hosting만 배포했다. 46개 파일을 포함한 릴리스가 정상 완료됐다.
- `https://aubl.club/` HTTP 200, 새 JS `index-DRiUz5AA.js`와 CSS `index-JAUQj2N8.css`를 확인했다. 이전 JS는 `index-C17UOkLB.js`였다.
- 운영 JS와 로컬 빌드의 SHA-256이 일치했다: `eeebdd0ccb66263004905f747eb7476aab952dbcfc551f625fec1f03359a8236`.
- 공개 `GET /api/seasons/12/overview` 응답에서 `publishedAt=2026-09-05T18:26:30.765852`, `publishedRevision=0b577671-1938-46b3-97d0-2d158f928c7b`, `status=CURRENT`, `syncMode=MANUAL`을 확인했다. 새 UI의 두 항목은 이 서버 게시 시각을 KST 분 단위로 표시한다.
- 운영 UI 확인은 기존 Chrome 탭을 재사용했다. 확인 중 탭이 로그인 화면으로 이동한 것을 관찰해 추가 조작·강제 복귀를 중단했다. 따라서 운영 화면의 두 문구를 직접 확인했다고 기록하지 않으며, 운영 번들 체크섬·공개 API 응답과 앞서 통과한 35개 fixture 테스트로 배포를 검증했다.
- NAS 백엔드·DB·수집 워커·Firebase 규칙·Functions는 배포하지 않았다. 수집·검증·게시·리비전 활성화를 실행하지 않았다.

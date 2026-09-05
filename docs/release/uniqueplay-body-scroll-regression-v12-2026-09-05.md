# UniquePlay 순위표 수집 회귀 수정 — 워커 v12

## 실제 장애

- 실행: `b1c58e0e-9ca2-479b-b643-f00847d77b39` (v11 배포 이후 관리자 직접 실행).
- 시작: 2026-09-05 16:44:34 KST, 실패: 16:45:28 KST.
- 코드: `COLLECTION_INCOMPLETE`.
- 메시지: `UniquePlay table collection did not reach a stable end`.
- 후보·체크섬 미생성, 비교 항목 0개. 기존 공개 리비전 `375df8a9-5f3b-49f6-81a6-cc26906c4465` 유지.

이 장애는 계정 만료나 오늘 경기 점수의 문제로 확인된 것이 아니다. v11의 스크롤 영역 탐색에 남은 **문서 BODY 오인 회귀**다. v11 fixture는 일반 DIV와 문서 스크롤을 검사했지만, standards 모드에서 BODY의 overflow가 viewport로 전파되는 경우를 빠뜨렸다. 배포·fixture 통과가 실제 시즌 수집 성공을 의미하지 않는다는 이전 운영 경계는 유지한다.

## 확인한 원천 구조와 재현

Chrome의 2026 A조 팀 순위표에서 표 헤더 일치와 조상 요소의 높이/overflow만 읽기 전용으로 확인했다. 원본 HTML·계정 정보를 저장하지 않았다.

- 표는 높이 250px로 모두 들어온다.
- 명시적인 내부 목록은 `overflow-y:auto`, 높이와 내용 높이가 모두 1220px로 추가 스크롤이 필요 없다.
- 바깥 BODY는 `overflow-y:auto`, 높이 1320px, 내용 높이 1396px를 보고한다.
- 실제 `document.scrollingElement`는 BODY가 아닌 HTML이다.

v11은 내부의 맞춤 목록을 기억한 뒤에도 BODY의 76px 높이 차이를 실제 스크롤로 선택했다. standards 모드 BODY는 이 조건에서 `scrollTo()` 후에도 `scrollTop=0`이다. 따라서 끝 아님/이동 없음이 100회 반복되고, 수집기가 약 50초의 표 대기 후 안전 중단했다. 원천 구조를 바탕으로 만든 1280×720 합성 HTML에서도 v11이 `advanced:false, atEnd:false, top:0, height:720, total:796`을 반복하는 것을 재현했다.

## v11 → v12 변경

- 어댑터 `2026.09.05.12`.
- 일반 조상 탐색에서 BODY를 제외하고 viewport는 `document.scrollingElement`로만 취급한다. quirks 모드에서 BODY 자체가 실제 scrollingElement인 경우는 지원한다.
- 내부에 명시적인 목록이 있고 모든 행이 들어오면 해당 목록의 끝을 기준으로 판단한다. 바깥 페이지/푸터의 넘침 때문에 표를 무한히 스크롤하지 않는다.
- 내부 세로 목록이 더 있으면 계속 스크롤한다. v11의 visible 카드 제외·지연 추가 로딩·실제 끝 3회 안정화·불완전 경기 후보 차단은 유지한다.
- 표 수집 실패 메시지에 허용된 조/표 종류, 읽은 행 수, 끝 여부와 스크롤 기하 수치를 추가한다. 임의 문맥·DOM·사용자 정보·원문 예외는 추가하지 않는다.
- 수집 스케줄러, 자동 재시도, 검증 우회, 수집/게시/활성화 실행은 추가하지 않는다.

## 검증

- 워커 단위/합성 DOM 63개와 기존 웹 회귀 71개 통과(합계 134개).
- 실제 Chromium CSS 테스트 2개 통과: 기존 카드/표/문서 지연 로딩, 신규 standards BODY + 맞춤 순위표 + viewport-only 목록.
- 신규 브라우저 검사는 1280×720(NAS 기본 viewport)과 2236×1320(확인한 Chrome viewport)을 모두 실행한다. 5행 순위표가 4회 읽기로 완료되고 BODY를 스크롤하지 않으며, 문서 전용 목록에서는 HTML이 실제 이동하는 것을 검증한다.
- 전체 고유 테스트 **136개**, 실패 0개. 실제 NAS 이미지의 Chromium 재검증 결과는 아래 배포 항목에 별도 기록한다.
- 운영 UniquePlay 시즌 전체를 새로 수집하지 않았다. 확인한 것은 공개 화면 구조와 네트워크 차단 합성 fixture다.

## 배포 결과

- 소스 커밋 `4aaf625` (`getResult`): 회귀 수정·진단 보강·재현 테스트·원인 문서. Git 원격 push는 수행하지 않았다.
- 이미지 `synapse9983/aubl-uniqueplay-sync-worker:v12`, `linux/amd64`, Docker Hub 업로드 및 NAS 교체 완료.
- Manifest digest: `sha256:c1e114d1c00ebb416f7314951498a5453492220f2ba9a2d0eb9c2e2414909ca2`.
- Image config digest(Portainer 표시): `sha256:403b5e5536a3352ea15bb0f641454c56a766fd8a2686a66837354ca983bf4bf6`.
- NAS 생성·시작: **2026-09-05 16:57:00 KST**, `running` 확인.
- NAS 시작 로그 `UniquePlay sync worker listening on 8080 (adapter 2026.09.05.12)` 확인. 확인한 기동 로그에 오류는 없다.
- 새 컨테이너: `103e1a321f4251c4f6931d9fa57bdd9d9b73d2f1faaa4b00a7c37b274d9d1a98`.
- 교체 전·초안·교체 후 환경변수 12개 값 모두 일치. 기존 암호화 세션·서비스 토큰·네트워크 `ix-aubl-backend_default`·`Unless stopped`·볼륨 없음·관리자 권한 제한을 유지했다. 비밀값은 기록하지 않았다.
- 관리자 `세션 다시 확인`: 연결됨, 인증 확인됨, 활성 실행 없음. 새 수집·검증·게시·활성화는 실행하지 않았다.
- 16:58:07 KST 공개 overview GET HTTP 200, `publishedRevision=375df8a9-5f3b-49f6-81a6-cc26906c4465`, `syncMode=MANUAL`로 교체 전과 동일하다.
- 최종 amd64 이미지에서도 Chromium CSS 2개를 재실행해 통과했다. 네트워크 차단 기동 검사 `/health` HTTP 200, `adapterVersion=2026.09.05.12`, `activeRuns=0` 확인. NAS `/health` 직접 호출과는 구분한다.
- Spring v25 컨테이너는 교체하지 않았다. 웹·Flutter·DB 스키마도 이번 변경 대상이 아니다. 사용자 수정 중인 Word 보고서를 커밋에 포함하지 않았다.
- 이전 v11 컨테이너는 Portainer Replace로 제거했으며 이미지·동일 설정으로 재생성할 수 있다. v11에는 이번 회귀가 있으므로 복귀가 데이터 수집 정상화를 의미하지 않는다. DB·볼륨·실행 후보·공개 기록은 삭제하지 않았다.

## 운영 후속

배포 후 관리자가 새 수집을 시작해야 한다. 실패 실행의 검증을 반복하거나 빈 후보를 게시하지 않는다. 실수집 성공 여부는 새 실행에서 별도로 확인하며, 경기 수 대조와 기존 오류 검수 정책을 유지한다. 실행 중인 수집이 있으면 워커 교체를 중단한다. 이전 이미지와 환경 설정은 남기고 DB·볼륨·공개 리비전은 바꾸지 않는다.

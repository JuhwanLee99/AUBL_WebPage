# 순위 수집 안정화·진단 보강 구현 결과

날짜: 2026-09-13 KST

상태: `LOCAL_REGRESSION_PASSED_PENDING_DEPLOYMENT`

## 최종 재검증 결과

- 사용자 승인 후 기존 진단 테스트의 수치 열을 정상 7열로 보완했다. 기대 오류와 개인정보 차단 검증은 변경하지 않았다.
- 전체 워커 테스트: 163건 통과, 실패 0, 제외 0, 취소 0.
- 실제 Chromium 스크롤 회귀: 3건 통과, 실패 0, 제외 0, 취소 0.
- Chromium 최초 실행은 macOS 샌드박스의 Mach 포트 권한 제한으로 브라우저 기동 단계에서 3건 모두 실패했다. 테스트 코드 수정 없이 실행 권한을 부여한 동일 명령으로 재실행하여 통과했다. 최초 실행도 증거로 보존한다.
- Chromium 검증은 외부 요청을 차단한 합성 화면에서 CSS 스크롤, 지연 로딩, 20행 정체에서 40행까지의 수집, BODY/HTML 스크롤 경계를 확인했다. 새 순위 진단과 실제 운영 API까지 연결하는 종단간 검증은 아니다.
- 이번 보완에서 제품 코드 추가 변경은 없었다. 확인된 로컬 테스트 실패는 모두 해소됐다.
- 운영 이미지 배포 및 새 원천 수집은 아직 수행하지 않았으며, 운영 실패 원인 확정과 팀명 매칭 개선 효과 확인은 후속 단계다.

재검증 증거:

- `docs/release/evidence/uniqueplay-standings-stability-2026-09-13/worker-tests-revalidated.tap`
- `docs/release/evidence/uniqueplay-standings-stability-2026-09-13/browser-scroll-revalidated.tap` (권한 제한으로 기동 실패한 최초 실행)
- `docs/release/evidence/uniqueplay-standings-stability-2026-09-13/browser-scroll-permitted.tap` (최종 3건 통과)
- `docs/release/evidence/uniqueplay-standings-stability-2026-09-13/revalidation-summary.json`

## 구현 범위

- 워커 어댑터 버전을 `2026.09.13.16`으로 변경했다. 운영 배포는 하지 않았다.
- 팀순위에 한해 팀명을 행 식별자로 사용한다. 순위 변경은 같은 팀의 값 갱신으로 처리한다. 이름은 NFKC·공백 정규화만 하며 유사 이름 추정 병합은 하지 않는다.
- 같은 표본에서 동일한 팀 식별자가 중복되면 `STANDINGS_ROW_CONFLICT`로 차단한다. 개인순위의 기존 식별 방식은 변경하지 않는다.
- 행 내용이 변경되면 안정화 카운터를 초기화한다. 스크롤 끝에 도달하고 변경 없는 관측이 3회 연속 확보되어야 완료한다.
- 빈 순위 표, 팀 식별 누락, 7개 수치 열 미충족, 고정열/수치열 행 수 불일치는 통과시키지 않는다.
- 승패 수의 빈 값·음수·소수·비숫자 등을 유효한 0으로 간주하지 않는다. 승률 비교에는 BigInt 교차곱을 사용해 큰 정수의 정밀도 손실을 피한다. 순위를 자동 변경하거나 동률을 임의 해소하지 않는다.
- 순위 충돌 진단은 조 코드, 행 번호, 순위·승패무의 제한된 정수, 허용된 검사 코드만 포함한다. 팀명·선수명·임의 메시지·DOM·인증정보는 복사하지 않는다.
- 진단은 워커 로그와 영속 실행 레코드에 남긴다. 실패 callback에는 기존 `code/message` 계약을 유지하면서 안전한 조·검사 코드 요약만 추가한다. ACK로 pending 전달이 제거되어도 실행 레코드의 진단은 보존된다.

## 최초 검증 결과 (이력 보존)

명령: `node --test services/uniqueplay-sync-worker/test/*.test.mjs`

- 총 163건: 통과 162, 실패 1, 제외 0, 취소 0.
- 신규 회귀 테스트 33건은 모두 통과했다.
- 순위가 모두 1인 초기 표본 다음에 정상 순위 1·1·3·4·5가 나타나는 합성 시퀀스는 5팀으로 수집되고 순위 검사도 통과했다. 변경 전/후 행이 8행으로 누적되는 경계를 보완했다.
- 같은 길이 수치 정정, 계속 변하는 값, 재사용 객체의 변이, 가상 스크롤의 겹치는 표본, 실제 중복 팀, 불완전 표, 실제 승률 충돌, 개인정보 제외, 진단 크기 제한, ACK 성공/실패 뒤 증거 보존을 검증했다.
- 이번 실행은 로컬 단위·모의 전달 회귀 검증이다. 운영 수집 성공이나 실제 브라우저/서버 종단간 검증으로 계산하지 않는다.

## 최초 실패 1건과 조치 (해소 완료)

`test/collection-scroll.test.mjs`의 `incomplete table diagnostics include only safe stage and geometry, never arbitrary source values` 테스트는 스크롤 정체 오류와 개인정보 제외를 확인하기 위한 입력에 수치 열을 1개만 제공한다.

새 표 형식 검사 때문에 기대했던 `COLLECTION_INCOMPLETE`보다 먼저 `STANDINGS_TABLE_INCOMPLETE`가 발생했다. 이후 사용자 승인으로 입력을 정상 7열로 보완했고, 원래의 스크롤 정체·안전한 진단 검증을 유지한 채 전체 163건이 통과했다.

## 운영 상태와 남은 확인

- 운영 워커는 기존 `2026.09.13.15` 상태로 유지된다. Docker 이미지 생성·업로드·교체, 추가 수집, 공식 게시·활성화는 이번 작업에서 실행하지 않았다.
- 실패 실행 `b73b01e3-414a-48c4-873a-7dc3bc62aaab`의 정확한 입력은 확보하지 못했다. 합성 재현의 해결을 실제 운영 실패 원인 확정으로 간주하지 않는다.
- 로컬 회귀를 모두 통과한 뒤 새 워커 배포와 수집을 수행하고, 새 진단 및 후보 결과로 운영 원인을 확인해야 한다.
- 기존 공식 리비전과 후보를 덮어쓰거나 삭제하지 않는다.

증거: `docs/release/evidence/uniqueplay-standings-stability-2026-09-13/worker-tests.tap`

선행 분석: `uniqueplay-standings-conflict-investigation-2026-09-13.md`

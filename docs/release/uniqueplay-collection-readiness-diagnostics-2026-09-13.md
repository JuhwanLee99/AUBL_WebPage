# 일반 수집 오류 진단·표 준비 대기 보강

날짜: 2026-09-13 KST

상태: `LOCAL_VERIFIED_PENDING_DEPLOYMENT`

## 배경과 판단

운영 워커 16의 실행 `cc336cc0-779c-4264-871d-86e0f39b4986`은 진행 통지 22개 이후 `COLLECTION_FAILED`로 종료됐다. 코드의 통지 순서상 E조 투수 규정 IN 전환·수집 구간이 의심되지만, 정확한 실패 함수와 원천 DOM은 확보하지 못했다. 회복된 callback 502를 원인으로 단정하지 않는다.

이번 변경은 이 일반 오류의 정보를 안전하게 남기고, 탭 전환 직후의 일시적 표 준비 지연을 제한적으로 기다리기 위한 것이다. 합성 테스트 통과를 실제 운영 실패 원인 확정으로 해석하지 않는다.

## 구현

- 로컬 어댑터 버전: `2026.09.13.17`.
- 초기 기록 탭 진입과 조 변경에 오류 문맥을 부여했다. 예상 시즌 표시는 즉시 가시성 검사 대신 최대 10초의 표시 대기를 사용한다. 다른 시즌을 임의로 선택하지 않는다.
- 조별 수집은 `SELECT_CATEGORY`, `SELECT_REGULATION`, `SELECT_TABLE`, `READ_TABLE`, `AUDIT_STANDINGS`, `REPORT_PROGRESS`를 구분한다.
- 원천 표의 헤더 없음, 헤더 순서 불일치, 구조 미준비, 고정열/수치열 행 수 불일치는 읽기만 재시도한다. 최대 12회, 읽기 사이 250ms 대기이며 기본 대기 합계는 최대 2.75초다. 개별 브라우저 호출에 걸리는 시간은 별도다.
- 이 대기는 클릭 반복, 전체 실행 재수집, 원천 순위 수정이 아니다. 한도를 넘으면 해당 종류의 오류로 차단한다.
- 헤더가 정상인 빈 개인순위 표는 기존 동작대로 허용한다. 이 사실만으로 서버가 모든 데이터를 전달했음을 증명하지는 않는다. 빈 팀순위와 불완전 팀순위 행은 기존 검사가 계속 차단한다.
- 준비가 완료된 표 이후에도 기존 스크롤 끝 도달·내용 안정화 검사가 적용된다.
- 실제 어댑터의 `readVisibleTable`과 `collectVirtualTable`을 테스트에서 직접 사용하도록 export했다. 제품 수집 경로와 테스트용 추출 코드를 분리 복제하지 않았다.

## 오류 및 안전 진단 계약

새 분류:

- `SOURCE_UI_TIMEOUT`: UI 조작·관측의 TimeoutError.
- `SOURCE_ADAPTER_ERROR`: 어댑터 TypeError.
- `SOURCE_COLLECTION_ERROR`: 알려진 분류에 속하지 않는 오류.
- `SOURCE_TABLE_NOT_READY`: 대기 한도 이후에도 헤더 미확인.
- `SOURCE_TABLE_SCHEMA_MISMATCH`: 대기 한도 이후 헤더·표 구조 불일치.
- `SOURCE_TABLE_ROW_MISMATCH`: 대기 한도 이후 고정열·수치열 행 수 불일치.

기존 인증, 시즌 불일치, 저장 장애, 종료 상태, 수집 미완료, 순위 검증 코드는 유지한다. 예외의 원본 메시지나 임의 code를 그대로 진단으로 전송하지 않는다.

`collectionDiagnostic`은 다음 허용 필드만 보존한다.

| 필드 | 범위 |
| --- | --- |
| version | 1 |
| groupCode | A~H 또는 null |
| table | STANDINGS, BATTER_IN/OUT, PITCHER_IN/OUT 또는 null |
| stage | 정해진 UI·수집 단계 enum |
| reason | 헤더 없음/불일치, 구조, 행 수, 알 수 없는 표 사유 enum 또는 null |
| attempts | 0~40 정수 또는 null |
| fixedRowCount / valueRowCount | 0~10000 정수 또는 null |

팀명·선수명·계정·토큰·DOM·원본 헤더 문자열·스택은 복사하지 않는다. 안쪽에서 확인한 문맥은 바깥 래퍼가 덮어쓰지 않으며, 순위 진단이 함께 있으면 보존한다. 로그·실패 저장 경계에서도 허용 필드를 다시 추출한다.

실패 callback은 기존 `code/message` 구조를 유지한다. message에 안전한 조/표/단계/사유 요약을 넣고, 상세 진단은 워커 로그와 영속 실행 레코드에 남긴다. callback ACK로 pending 항목이 제거되어도 영속 진단은 유지된다. 백엔드의 새 API나 스키마 migration은 추가하지 않았다.

## 검증 결과

| 실행 | 결과 |
| --- | --- |
| 워커 전체 단위·모의 전달 회귀 | 190/190 통과 |
| Chromium 전체 스크롤·표 준비 회귀 | 6/6 통과 |
| 실패/제외/취소 | 모두 0 |

신규 검증은 단위·모의 전달 27건과 Chromium 3건이다. 기존 워커 163건 및 Chromium 3건도 함께 재실행했다.

확인한 경계:

- 임시 헤더 누락 후 정상 표 복구, 실제 DOM의 헤더 순서 복구.
- 지속적인 구조·행 수 불일치가 무한 재시도나 빈 후보로 바뀌지 않음.
- UI 타임아웃, TypeError, 일반 오류의 안전한 분류.
- 기존 인증·저장 장애 코드 보존 및 안쪽 문맥 유지.
- 임의 진단 필드·개인정보·원본 예외 문자열 제외.
- ACK 성공/실패 양쪽에서 단계 진단 보존.
- 실제 어댑터로 Chromium 합성 표 5행을 읽고 기존 스크롤 완결성 검사를 통과함.

Chromium은 외부 요청을 차단한 임시 합성 화면만 사용했다. 운영 API·DB·사용자 세션은 사용하지 않았다. 실제 전체 수집 및 워커→운영 백엔드 종단간 검증은 아직 수행하지 않았다.

증거:

- `docs/release/evidence/uniqueplay-collection-diagnostics-2026-09-13/worker-tests.tap`
- `docs/release/evidence/uniqueplay-collection-diagnostics-2026-09-13/browser-tests.tap`
- `docs/release/evidence/uniqueplay-collection-diagnostics-2026-09-13/summary.json`

## 남은 단계

1. 이 검증된 소스로 새 워커 이미지를 생성·업로드한다.
2. 교체 전 실행/대기 전달 상태와 NAS 백업을 확인하고, Portainer에서 기존 설정을 유지해 교체한다.
3. 동일 공식 기준본 이후 범위로 새 수집을 수행한다. 실패하면 새 조·표·단계·오류 분류를 근거로 추가 보완한다.
4. 전체 후보가 생성되면 팀명 매칭의 불필요한 추가·삭제 감소와 순위·상세 기록을 검증한다.
5. 공식 게시·활성화는 별도 승인 후 진행한다.

이번 작업에서는 Docker 빌드·업로드·운영 교체·재수집·공식 게시를 실행하지 않았다. 운영 워커는 16이며, 로컬 17의 검증 통과와 구분한다.

# 팀 식별 기반 비교와 조별 순위 UI 보완

상태: `LOCAL_VERIFIED_PENDING_DEPLOYMENT`. 2026-09-13.

## 구현한 변경

- 백엔드 선수 기록 비교 키를 조·타격/투구·IN/OUT·확정 팀 ID·정규화 선수명으로 구성한다. 외부 식별자, 원천 이름, 후보 JSON을 바꾸지 않는다.
- 팀 매핑은 해당 실행의 명시적 선택, 유효한 저장 매핑, 유일한 로컬 팀명/코드 순서로 확인한다. 미해결 팀, 사라진 매핑 대상, 중복 직접 일치는 자동 연결하지 않는다.
- 원천/로컬/기준본에서 같은 비교 키가 중복되면 충돌로 남긴다. 마지막 항목으로 덮어쓰거나 임의로 하나를 선택하지 않는다.
- 기준본도 팀 ID로 대조해 팀명 변경 뒤 수동 기록 변경 충돌을 놓치지 않는다. 이전 KEEP_AUBL 결정은 같은 로컬 기록 ID와 조·구분 범위에서 보존한다.
- IN/OUT 전환과 다른 팀의 동명 선수는 별개 기록으로 유지한다.
- 신규 GROUP 변경은 기준본 순위 배열을 보존하고 실제 동일 여부로 CREATE/UPDATE/UNCHANGED를 판정한다.
- 기존 GROUP 항목은 조회 시 고정 기준 리비전에서 이전 순위를 복원한다. 조회로 기존 항목이나 후보를 다시 쓰지 않는다.
- API의 `standings` 비교 값에 표시용 `localTeamId`를 제공한다. 표시용 값은 원천 후보에 삽입하지 않는다.
- UI는 이전/원천 순위와 승패무를 나란히 표시한다. 팀 ID로 이름 변경을 연결하고 이전 표기도 남긴다. 중복 식별자, 자료 미제공, 숫자 누락을 각각 경고한다.
- 이전 이름 문자열 기반 `findBaseStatRow`는 주석으로 보존했다.

## 변경 파일

- 백엔드 `src/main/java/com/aubl/webpage/service/UniquePlaySyncService.java`.
- 백엔드 `src/test/java/com/aubl/webpage/service/UniquePlayIdentityDiffTest.java`.
- `src/features/sync/standingsComparison.ts`.
- `src/features/sync/components/UniquePlayDiffTable.tsx`.
- `scripts/test-standings-comparison.mjs`.
- `scripts/test-standings-comparison-ui.mjs`.
- `scripts/test-uniqueplay-cancellation-integration.sh`.

## 검증 결과

| 검증 | 결과 |
| --- | --- |
| 순위 비교 단위 테스트 | 12 통과, 실패·제외 0 |
| PC/모바일 뷰포트 UI | 8 시나리오 통과, 외부 요청·페이지 오류 0 |
| 백엔드 빌드 및 회귀 | BUILD SUCCESSFUL, 기존 84건 및 신규 16건 통과 |
| 제품 TypeScript 검사 | 명시적 비교 행 타입 추가 후 재검증 통과 |

백엔드 검증은 임시 Docker 내부 네트워크와 별도 MariaDB를 사용했다. 기존 실제 DB 테스트와 새 Mockito 기반 비교 회귀를 함께 실행했으며, 신규 16건 전체가 실제 DB 테스트라는 의미는 아니다. 임시 DB와 네트워크는 정리됐다. 운영 DB에 테스트 데이터를 쓰지 않았다.

백엔드 빌드/시험 산출물: `/tmp/aubl-cancellation-integration.46JyYd`.
저장소 증거: `docs/release/evidence/uniqueplay-identity-comparison-2026-09-13/`.

## 타입 수정 및 재검증 완료

최초 검사에서는 `standingsComparison.ts`의 `flatMap`이 정상 연결 행과 연결 보류 행을 반환할 때 공통 행 타입을 추론하지 못해 소비 UI의 `entry`도 `unknown`으로 판정됐다. 해당 실패 로그는 그대로 보존했다.

사용자 승인 후 `before: ComparisonStanding | null`, `source: ComparisonStanding | null`, `ambiguous: boolean`, `key: string`을 갖는 `ComparisonEntry`를 선언하고 `flatMap<ComparisonEntry>`로 결과 타입을 명시했다. 비교 동작이나 운영 데이터 계약은 바꾸지 않았다.

재검증 결과: 제품 타입 검사 통과, 단위 12건 통과, PC/모바일 UI 8개 시나리오 통과, 외부 요청·페이지 오류 0. 이번 수정은 프런트엔드 타입 선언에 한정되므로 백엔드 100건은 직전 검증 결과이며 이번에 재실행하지 않았다.

추가 증거: `typecheck-fixed.log`, `comparison-unit-fixed.log`, `ui-fixed.log`, `ui-results-typefix.json`.

## 운영 적용 범위와 다음 작업

- 이번 작업은 로컬 구현/검증이다. 백엔드 이미지 업로드·운영 교체·Hosting 배포는 하지 않았다.
- 기존 운영 후보 `4216cd04-6753-4568-afc7-982eeb72ac7c`와 공식 리비전 `291109ef-b73a-44ad-ab8c-121ac67812ca`는 변경하지 않았다.
- 기존 후보의 추가·삭제 비교는 저장된 과거 판정이므로 코드 배포만으로 자동 재작성하지 않는다. 기존 후보를 증거로 유지하고 새 수집 또는 별도 승인된 재검수 경로로 비교를 생성해야 한다.
- 새 코드의 배포와 새 후보 비교에서 대량 추가·삭제 감소 및 충돌 보존을 확인한다.
- 자책·득점·피안타 등 기존 경기 상세 경고 검수는 여전히 별도 필요하다. 순위 비교 개선만으로 해당 경고가 해결되지는 않는다.
- 공식 게시·활성화는 검수와 별도 승인 후 진행한다.

## 운영 배포 후속 상태 (2026-09-13)

로컬 검증 이후 백엔드와 비교 화면의 운영 배포가 완료되었다. 후속 상태는 `DEPLOYED_COLLECTION_VERIFICATION_BLOCKED`이다. 새 수집 `b73b01e3-414a-48c4-873a-7dc3bc62aaab`는 `STANDINGS_RANK_CONFLICT`로 후보 생성 전에 실패했으므로, 운영 데이터의 추가·삭제 감소 효과와 공식 반영은 아직 완료하지 않았다. 기존 후보와 공식 리비전은 유지했다. 백업, 배포 digest, 일시적 502와 복구, 검증 범위, 남은 작업은 `uniqueplay-identity-production-deployment-2026-09-13.md`에 기록했다. 이 문서의 기존 로컬 검증 상태는 당시 이력으로 보존한다.

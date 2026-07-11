# AUBL 올스타/루키 투표 시스템

투표는 Firestore 클라이언트 쓰기가 아니라 `asia-northeast3`의 callable Cloud Functions를 통해서만 접수한다. 일반 사용자의 Firestore 직접 접근은 Security Rules에서 차단된다. 후보 설정은 `admin` 계정이 관리하고, 투표 원문은 `admin: true`와 `allstarVoteAuditor: true` custom claim을 모두 가진 감사 계정만 클라이언트에서 읽을 수 있다. 공개 결과 callable은 운영자가 이중 승인한 후보별 합계만 반환한다.

## 현재 구현 범위

| 영역 | 상태 | 비고 |
| --- | --- | --- |
| 전용 페이지 | 구현 완료 | `/allstar`, 모바일 우선 레이아웃, 독립 공유 링크 |
| 진입 경로 | 구현 완료 | 메인 최상단 홍보 배너, 상단 메뉴 |
| 후보 화면 | 구현 완료 | 올스타/루키, 1팀/2팀, 포지션 필터와 하단 팀 전환 |
| 선택 규칙 | 구현 완료 | 올스타는 팀·포지션별 정확히 1명, 서버와 UI가 함께 강제 |
| 인증·중복 방지 | 구현 완료 | Google 계정, 이벤트당 1회 또는 현지 날짜당 1회 |
| 제출 백엔드 | 구현 완료·기본 비활성 | Functions, Firestore Rules, Secret과 이벤트 설정 배포 필요 |
| 결과 화면 | UI 구현 완료 | 순위표와 그라운드 TOP 2. 검수 빌드는 예시 득표만 표시 |
| 실시간 결과 | 읽기 경로 구현 | 승인된 합계 문서 조회·60초 갱신 완료. 합계 생성 작업은 미구현 |
| 루키 후보 | 명단 확정 전 | 올스타와 별도 후보 세트·투표로 운영 |

운영 빌드의 기본값은 안전한 준비 상태다. `VITE_ALLSTAR_VOTING_API_ENABLED=false`이면 callable을 호출하지 않으며, `VITE_ALLSTAR_SHOW_DRAFT_CANDIDATES=false`이면 초안 후보도 노출하지 않는다.

## 후보 명단 확정 전 병행 작업

- [x] 후보 카드를 92px 높이의 압축형 레이아웃으로 변경
- [x] hero를 투표 기간·올스타전 일시·장소 안내 영역으로 구성
- [x] 경기 일시와 장소를 Firestore 이벤트 설정에서 공개하도록 연결
- [x] 결과 화면과 hero가 같은 TOP 2 순위 계산을 사용하도록 통합
- [x] 실제 집계 미연결 상태와 검수용 예시 득표를 시각적으로 구분
- [x] 후보 버전·hash에 묶인 공개 합계 callable과 60초 갱신 연결
- [ ] 공개 집계 지연 시간, 동률, 무효표, 최소 공개 표본 정책 확정
- [ ] 집계 전용 callable 또는 서버 집계 문서 구현과 부하 검증
- [ ] 최종 후보 세트 생성·검증·게시 및 루키 후보 구조 확정
- [ ] App Check, 운영 모니터링, 실제 Google 로그인·제출 리허설

완료 표시된 항목은 후보 실명과 무관하게 진행했다. 나머지 항목은 운영 회의에서 공개·집계 정책이나 최종 후보 버전이 정해진 뒤 진행한다.

## 사용자 사용 방법

1. 메인 페이지 홍보 배너나 상단 메뉴에서 `올스타전`을 선택한다. 직접 공유 주소 `/allstar`로 진입해도 같은 전용 페이지가 열린다.
2. 안내 영역에서 투표 기간, 올스타전 일시와 장소를 확인하고 최상단에서 `올스타`와 `루키`를 전환한다. URL의 `division=allstar` 또는 `division=rookie`가 현재 부문을 보존한다.
3. 올스타 후보 화면에서 1팀 또는 2팀과 포지션을 선택하고 각 포지션에서 한 명을 선택한다. 1팀 선택을 마치면 페이지 하단 팀 전환 영역이 2팀 진행을 안내한다.
4. 선택 내용은 제출 전까지 현재 브라우저 탭의 `sessionStorage`에만 임시 보관된다. 후보 버전이 바뀌면 이전 임시 선택은 자동 폐기된다.
5. 이용약관과 개인정보 처리방침에 동의한 뒤 Google 계정으로 로그인한다. 모바일에서는 redirect, 일반 데스크톱에서는 popup 로그인을 사용한다.
6. 모든 contest 선택을 마친 뒤 최종 확인 창에서 제출한다. 성공한 투표는 사용자가 수정하거나 다시 제출할 수 없다.
7. `투표 현황`에서 팀별 순위표와 그라운드 TOP 2를 전환한다. `view=results`가 결과 화면 링크를 보존한다.

Google 로그인이 인앱 브라우저에서 차단되면 Chrome 또는 Safari로 링크를 다시 연다. Firebase Authentication의 승인된 도메인에 현재 운영 또는 검토 채널 도메인이 없으면 redirect 로그인도 완료되지 않는다.

결과 화면에서 `예시 데이터 · 실제 득표 아님`이 보이는 빌드는 검수 전용이다. 실제 운영에서는 예시 득표를 노출하지 않으며, 승인된 합계 문서가 생성·공개되기 전에는 준비 상태만 표시한다.

## Callable 계약

- `get_allstar_vote_event({ eventId, division })`
  - 로그인 없이 호출 가능하다.
  - `published: true`인 후보 세트만 반환하며 투표 결과는 반환하지 않는다.
- `get_allstar_ballot_status({ eventId, division })`
  - Firebase Auth 로그인이 필요하다.
  - 현재 정책 기간의 `submitted`, `canVote`, `submittedAt`, `nextEligibleAt`과 후보 준비 상태만 반환하고 선택 내용은 반환하지 않는다.
- `get_allstar_vote_results({ eventId, division })`
  - 로그인 없이 호출할 수 있지만 부문의 `resultsPublished`와 합계 문서의 `published`가 모두 `true`일 때만 합계를 반환한다.
  - 활성 후보 버전·hash와 일치하는 후보별 득표수, 총 ballot 수, 갱신 시각만 반환한다.
  - voter key, period key, 원본 선택 묶음은 반환하지 않는다.
- `submit_allstar_ballot({ eventId, division, candidateVersion, selections })`
  - Firebase Auth 로그인이 필요하다.
  - `selections`는 모든 contest를 정확히 한 번씩 포함하는 `{ [contestId]: candidateId[] }` 객체다.
  - 이벤트/디비전 상태, 투표 기간, 후보 버전, contest 목록, 최소·최대 선택 수, 후보 자격, 중복 ID를 모두 서버에서 재검증한다.
  - 성공 응답의 `submittedAt`은 요청 판단에 사용한 서버 시각이며, 저장 문서에는 Firestore `SERVER_TIMESTAMP`가 기록된다.

올스타와 루키는 서로 다른 `division`을 사용하므로 각각 별도의 1회 투표가 가능하다.

## Firestore 구조

이벤트 문서: `allstarVotingEvents/{eventId}`

```json
{
  "enabled": false,
  "status": "DRAFT",
  "title": "2026 AUBL ALL-STAR",
  "policy": "ONCE_PER_EVENT",
  "timezone": "Asia/Seoul",
  "allowedAuthProviders": ["google.com"],
  "opensAt": "Firestore Timestamp (선택)",
  "closesAt": "Firestore Timestamp (선택)",
  "gameStartsAt": "Firestore Timestamp (선택)",
  "venue": "장소 확정 후 입력",
  "divisions": {
    "allstar": {
      "label": "올스타",
      "enabled": false,
      "published": false,
      "status": "DRAFT",
      "candidateSetId": "allstar-v1",
      "candidateVersion": "allstar-v1",
      "resultsPublished": false
    },
    "rookie": {
      "label": "루키",
      "enabled": false,
      "published": false,
      "status": "DRAFT",
      "candidateSetId": "rookie-v1",
      "candidateVersion": "rookie-v1",
      "resultsPublished": false
    }
  }
}
```

기본 예시는 이벤트와 각 디비전이 모두 비활성화되어 있다. 실제 오픈 때 이벤트와 대상 디비전의 `enabled`, `published`를 `true`, `status`를 `OPEN`으로 바꾼다. `opensAt`, `closesAt`, `gameStartsAt`은 문자열이 아니라 Firestore Timestamp로 입력한다. `venue`는 160자 이하의 공개 장소명으로 입력하며, 값이 없으면 페이지에 확정 후 공개로 표시된다.

후보 세트 문서: `allstarVotingEvents/{eventId}/candidateSets/{candidateSetId}`

```json
{
  "published": true,
  "division": "allstar",
  "version": "allstar-v1",
  "candidates": {
    "team_1-p-1": {
      "name": "홍길동",
      "school": "AUBL대학교",
      "position": "P",
      "side": "TEAM_1",
      "group": "A"
    }
  },
  "contests": {
    "TEAM_1:P": {
      "label": "1팀 투수",
      "side": "TEAM_1",
      "position": "P",
      "candidateIds": ["team_1-p-1"],
      "minSelections": 1,
      "maxSelections": 1
    }
  }
}
```

공개 후보 필드는 `name`, `school`, `position`, `side`, `group`, `number`만 허용된다. 후보·contest ID는 영문자가 한 글자 이상 들어간 불투명 ASCII slug만 허용한다. 이메일, 전화번호, Firebase UID, Unique Play 사용자 ID를 ID로 재사용하지 않는다. 모든 공개 후보는 정확히 하나의 contest에 배정되어야 한다. 올스타 부문의 모든 contest는 `minSelections: 1`, `maxSelections: 1`로 설정하며 서버도 정확히 1명 선택을 강제한다. 그 밖의 필드를 후보 문서에 넣어도 callable 응답에는 포함되지 않는다.

후보나 contest 구성을 한 글자라도 바꾸면 새 후보 세트 문서를 만들고 `candidateSetId`와 `candidateVersion`을 함께 올린다. Security Rules는 `published: true`가 된 후보 세트의 클라이언트 수정·삭제를 차단한다. 각 투표에는 `candidateSetId`, `candidateVersion`, 정규화된 후보 세트의 SHA-256 `candidateSetHash`가 함께 저장되므로 사후 집계 시 사용된 명단을 검증할 수 있다.

투표 문서: `allstarVotingEvents/{eventId}/ballots/{hmacDocumentId}`

투표 문서에는 UID, Google subject, 이메일, 이름, IP, user-agent를 저장하지 않는다. 문서 ID는 Secret Manager의 키로 `eventId + division + policy period + 검증된 Google provider subject`를 HMAC-SHA256 처리한 값이다. Firebase 계정을 삭제하고 같은 Google 계정으로 다시 가입해 UID가 달라져도 동일 투표자로 판정한다.

정책 전환과 동시 요청을 막기 위한 최소 상태는 `allstarVotingEvents/{eventId}/voterEligibility/{hmacEligibilityId}`에 저장된다. 이 문서도 provider subject를 HMAC 처리한 ID만 사용하며 일반 관리자에게도 클라이언트 쓰기를 허용하지 않는다. Firestore 트랜잭션이 eligibility와 ballot을 함께 갱신하므로 동시 요청 중 한 건만 성공한다.

HMAC ID는 익명값이 아니라 가명값이다. Secret과 provider subject 목록을 함께 가진 운영자는 재계산할 수 있으므로 Secret 접근을 최소화하고, 이벤트 이의제기 기간이 끝나면 ballots와 voterEligibility의 보존·삭제 일정을 운영 정책으로 정한다.

공개 합계 문서: `allstarVotingEvents/{eventId}/publicResults/{division}`

```json
{
  "published": false,
  "candidateVersion": "allstar-v1",
  "candidateSetHash": "활성 후보 세트의 contentHash",
  "totalBallots": 0,
  "counts": {
    "team_1-p-1": 0
  },
  "updatedAt": "Firestore Timestamp"
}
```

일반 클라이언트는 이 문서를 직접 읽을 수 없다. `get_allstar_vote_results`는 부문의 `resultsPublished: true`, 합계 문서의 `published: true`, 후보 버전·hash 일치, 0 이상의 정수 득표와 `득표수 <= totalBallots`를 모두 확인한 뒤 공개 필드만 반환한다. 둘 중 하나라도 비활성이면 `available: false`를 반환하므로 운영자가 공개를 명시적으로 두 번 승인해야 한다.

## 1회/1일 정책 전환

- `ONCE_PER_EVENT`: 정책 기간 키가 `event`라서 계정·이벤트·디비전당 한 번만 가능하다.
- `ONCE_PER_DAY`: `timezone` 기준 `YYYY-MM-DD`가 정책 기간 키가 되어 하루 한 번 가능하다.

이벤트 또는 디비전의 `policy` 값만 바꾸면 되며 컬렉션 이동이나 스키마 변환은 필요 없다. 디비전의 값이 이벤트 공통값보다 우선한다. eligibility ledger에는 마지막 투표의 현지 날짜가 남으므로 `ONCE_PER_EVENT`에서 `ONCE_PER_DAY`로 바꾼 당일에는 즉시 한 번 더 투표할 수 없고, 다음 현지 날짜부터 다시 가능하다. 반대로 `ONCE_PER_DAY`에서 `ONCE_PER_EVENT`로 바꾸면 이미 한 번이라도 참여한 계정은 다시 투표할 수 없다.

정책을 바꾸기 전에는 투표를 잠시 닫고 변경 시각과 집계 기준을 공지한다. 혼합 정책 기간의 결과는 ballots의 `policy`, `periodKey`, `localDate`를 기준으로 감사한다.

## 필수 Secret

최소 32바이트의 무작위 문자열을 한 번 생성하고 이벤트 진행 중에는 회전하지 않는다. Secret을 바꾸면 기존 투표 및 eligibility 키를 다시 계산할 수 없어 중복 방지 연속성이 깨진다.

```bash
firebase functions:secrets:set ALLSTAR_VOTER_KEY_SECRET
```

로컬 Functions 에뮬레이터에서는 커밋하지 않는 `functions/.secret.local`에 같은 이름을 둔다.

```dotenv
ALLSTAR_VOTER_KEY_SECRET=32-byte-minimum-random-secret-value
```

## Google 계정 제공자 확인과 custom token 주의점

`allowedAuthProviders`의 기본값은 `["google.com"]`이다. 함수는 현재 `sign_in_provider`와 Firebase token의 연결된 `identities`를 함께 검사하므로, 다른 방식으로 로그인했더라도 Google identity가 실제로 연결되어 있으면 허용할 수 있다.

`exchange_web_id_token`은 검증한 원본 token의 Google provider subject를 서버 서명 custom claim `aublGoogleSubject`에 보존한다. custom 로그인 경로를 투표에 사용할 때는 이벤트의 `allowedAuthProviders`에 `"custom"`을 명시적으로 추가해야 한다. 이 claim이 없는 이전 custom session은 `AUTH_PROVIDER_IDENTITY_UNAVAILABLE`로 거부되므로 다시 로그인해야 한다. 가능하면 투표 웹 페이지는 Firebase Google provider로 직접 로그인한다.

## 설정 방법

### 1. 웹 환경 변수

`.env.example`을 기준으로 Firebase Web 설정과 아래 두 값을 준비한다.

```dotenv
# callable을 실제로 호출할 때만 true
VITE_ALLSTAR_VOTING_API_ENABLED=true
# 익명 초안 후보를 표시하는 로컬·검토 전용 옵션
VITE_ALLSTAR_SHOW_DRAFT_CANDIDATES=false
```

운영에서는 `VITE_ALLSTAR_SHOW_DRAFT_CANDIDATES=false`를 반드시 유지한다. 검토 빌드에서 이 값을 `true`로 켜면 페이지에 `DRAFT`와 `예시 데이터 · 실제 득표 아님` 표시가 함께 보여야 한다.

OG와 canonical 주소는 빌드 시 `OG_BASE_URL`로 바꿀 수 있다. 값을 생략하면 `https://aubl.club`을 사용한다.

```bash
OG_BASE_URL=https://aubl.club npm run build
```

### 2. Firebase Authentication

1. Firebase Console의 Authentication 제공자에서 Google 로그인을 활성화한다.
2. Authentication 설정의 승인된 도메인에 `aubl.club`과 실제로 사용할 Hosting 도메인을 등록한다.
3. 검토 채널에서 로그인까지 시험할 때는 해당 `*.web.app` 채널 도메인도 임시로 등록한다. 후보·화면만 검토한다면 로그인 시험은 생략할 수 있다.
4. 모바일 redirect 후 `/allstar`의 부문·결과 query가 유지되는지 확인한다.

일반 투표자는 Google identity가 확인된 계정만 허용한다. 감사 계정에는 Firebase Admin SDK로 `admin: true`, `allstarVoteAuditor: true` custom claim을 모두 부여하고 다시 로그인해 token을 갱신한다. 감사 계정을 일상 관리자 계정과 분리한다.

### 3. 이벤트와 후보 설정

1. 새 후보 세트를 `published: false`로 작성하고 ID, 학교, 팀, 포지션, contest 포함 관계를 검토한다.
2. 올스타의 1팀·2팀 각각 `P`, `C`, `1B`, `2B`, `3B`, `SS`, `LF`, `CF`, `RF` contest가 모두 있고 각 contest가 `minSelections: 1`, `maxSelections: 1`인지 확인한다.
3. 후보 검토가 끝나면 후보 세트의 `published`를 `true`로 바꾼다. 이후에는 이 문서를 수정하지 않고 변경이 필요할 때 새 `candidateSetId`와 `candidateVersion`을 만든다.
4. 이벤트와 부문은 계속 `enabled: false`, `published: false`, `status: DRAFT`로 유지한 채 callable 응답과 UI를 검증한다.
5. 공개 직전에 부문의 `candidateSetId`와 `candidateVersion`을 확정하고 `published: true`로 바꾼다.
6. 이벤트의 `gameStartsAt`, `venue`를 확정하고 운영 URL의 안내 영역에서 표기와 시간대를 확인한다.

후보 확정 전의 원본 시트, 회의 자료, Unique Play 기록 JSON은 공개 저장소나 Hosting 산출물에 포함하지 않는다. 웹에 필요한 확정 필드만 후보 세트로 옮긴다.

### 4. 일정과 상태

- `enabled: false`: 상태와 관계없이 즉시 `DISABLED`가 되며 제출할 수 없다.
- `status: DRAFT`: 후보 검토 상태다.
- `status: SCHEDULED`: 수동 예약 표시가 필요할 때 사용한다.
- `status: OPEN`: `opensAt`, `closesAt`과 함께 실제 시작·종료를 판정한다.
- `status: CLOSED`: 즉시 종료한다.

이벤트와 대상 부문 모두 `enabled: true`, `status: OPEN`이어야 제출할 수 있다. `opensAt` 전에는 `SCHEDULED`, `closesAt` 이후에는 `CLOSED`가 된다. 시각은 문자열이 아닌 Firestore Timestamp로 저장하고 `timezone`은 `Asia/Seoul`을 기본으로 한다.

### 5. 결과 데이터

현재 결과 callable과 UI 갱신 경로는 준비되어 있지만 합계 문서를 만드는 집계 작업은 아직 구현하지 않았다. 다음 조건을 만족하는 별도 집계 계층을 구현한다.

- 일반 클라이언트가 `ballots`를 직접 읽지 않도록 한다.
- 후보별 합계와 갱신 시각만 공개하고 voter key, period key, 원본 선택 묶음은 반환하지 않는다.
- 동률 처리, 무효표·후보 변경 처리, 공개 지연 시간과 최소 집계 표본을 운영 규칙으로 확정한다.
- 결과 응답은 활성 `candidateVersion`·`candidateSetHash`와 함께 검증하며 UI는 60초마다 `resultCounts`, `updatedAt`을 갱신한다.

이 작업 전까지 운영 결과 화면은 준비 상태로 두며, 검수용 예시 득표를 실제 결과처럼 배포하지 않는다.

현재 구현에는 복합 쿼리가 없어 추가 Firestore index가 필요하지 않다. 실제 투표 전에는 Web App Check를 설정하고 callable의 `enforce_app_check` 활성화를 별도 검토한다.

## 운영 런북

### A. 로컬 검증

```bash
npx eslint src/features/allstar
PYTHONPATH=functions functions/venv/bin/python -m unittest discover -s functions/tests -v
PYTHONPATH=functions functions/venv/bin/python -m py_compile functions/allstar_voting.py functions/main.py
npm run build
git diff --check
```

Functions 연동 검증이 필요하면 Secret을 `functions/.secret.local`에만 두고 에뮬레이터를 실행한다.

```bash
firebase emulators:start --only functions,firestore
```

### B. 공유용 검토 채널 배포

검토 채널은 실제 투표 제출을 끄고 익명 초안만 표시한다. 채널 URL이 한 번 생성된 뒤에는 그 주소를 `OG_BASE_URL`로 사용해 다시 빌드하면 공유 미리보기도 검토 채널을 가리킨다.

```bash
OG_BASE_URL=https://<project>--allstar-review-<id>.web.app \
VITE_ALLSTAR_VOTING_API_ENABLED=false \
VITE_ALLSTAR_SHOW_DRAFT_CANDIDATES=true \
npm run build

firebase hosting:channel:deploy allstar-review --expires 30d --project <project-id>
```

검토 항목:

- `/allstar/?division=allstar`에서 후보·팀·포지션·하단 전환 확인
- hero의 투표 기간·경기 일시·장소와 미확정 fallback 문구 확인
- `/allstar/?division=allstar&view=results`에서 예시 데이터 경고, 순위표, 그라운드 확인
- `/allstar/?division=rookie`에서 준비 상태 확인
- 페이지 source의 canonical, OG 이미지가 검토 채널을 가리키는지 확인
- 응답에 `x-robots-tag: noindex`가 있는지 확인
- 실명 후보나 회의용 추천 문구가 `dist`에 섞이지 않았는지 확인

### C. 운영 배포 순서

1. 투표 오픈 공지, 후보 명단, 정책, 시작·종료 시각과 개인정보 고지를 운영 회의에서 승인한다.
2. `ALLSTAR_VOTER_KEY_SECRET`을 설정하고 접근자를 최소화한다.
3. 이벤트와 모든 부문이 비활성 상태인지 확인한다.
4. 테스트 통과 후 Rules와 Functions를 먼저 배포한다.

```bash
firebase deploy --only firestore:rules,firestore:indexes
firebase deploy --only functions:get_allstar_vote_event,functions:get_allstar_vote_results,functions:get_allstar_ballot_status,functions:submit_allstar_ballot
```

5. 비활성 이벤트 문서와 후보 세트를 생성하고 callable 응답을 확인한다.
6. 운영 웹을 실제 API 활성·초안 비활성 설정으로 빌드하고 Hosting에 배포한다.

```bash
OG_BASE_URL=https://aubl.club \
VITE_ALLSTAR_VOTING_API_ENABLED=true \
VITE_ALLSTAR_SHOW_DRAFT_CANDIDATES=false \
npm run build

firebase deploy --only hosting
```

7. 운영 URL에서 후보 공개, Google 로그인, 약관 링크를 확인하되 이벤트는 아직 열지 않는다.
8. 부문의 `published: true`, 이벤트와 부문의 `enabled: true`, `status: OPEN`을 최종 확인한다. 예약 오픈이면 미래 `opensAt`을 사용한다.
9. 별도 테스트 이벤트나 사전 승인된 테스트 계정으로 한 번만 제출하고 ballot·eligibility가 같은 트랜잭션으로 생성되는지 확인한다. 운영 이벤트에 임의 테스트 표를 남기지 않는다.

### D. 투표 진행 중 점검

- Cloud Functions 로그에서 오류율과 `ALREADY_VOTED`, `VOTING_NOT_OPEN`, `CANDIDATE_VERSION_MISMATCH`, `AUTH_PROVIDER_NOT_ALLOWED` 추이를 확인한다.
- 감사가 필요할 때만 전용 감사 계정으로 원본을 읽는다. ballot이나 eligibility 문서를 콘솔에서 수정하지 않는다.
- 후보 버전, 정책, Secret, timezone은 투표가 열린 동안 변경하지 않는다.
- 트래픽 장애 시 가장 빠른 제출 차단은 이벤트 또는 대상 부문의 `status: CLOSED` 전환이다. 화면만 숨기거나 프런트 환경 변수만 끄는 것으로 대체하지 않는다.
- 공개 결과 기능을 연결한 뒤에도 원본 ballot 수와 공개 합계가 일치하는지 별도 감사한다.

### E. 정상 종료

1. `closesAt` 자동 종료를 확인하거나 대상 부문을 `status: CLOSED`로 바꾼다.
2. 종료 후 `submit_allstar_ballot`이 `VOTING_NOT_OPEN`을 반환하는지 확인한다.
3. 후보 버전·hash, 총 ballot 수, 정책별·period별 건수와 집계 시각을 기록한다.
4. 감사본을 승인된 위치에 보관하고 결과 확정·이의 처리 기간을 공지한다.
5. 이의 처리 종료 후 개인정보 처리방침과 내부 보존 기준에 따라 ballots와 eligibility를 삭제하거나 비식별 집계만 보관한다.
6. 검토 채널과 임시 승인 도메인을 제거한다.

### F. 정책 변경

투표 중 `ONCE_PER_EVENT`와 `ONCE_PER_DAY`를 바로 전환하지 않는다. 먼저 대상 부문을 닫고 변경 시각·재참여 시점·집계 방식을 공지한 뒤 정책을 바꾼다. 재오픈 전 별도 계정으로 자격 상태를 검증한다. 기존 eligibility 때문에 당일 또는 이벤트 전체가 계속 차단될 수 있으므로 위의 정책 전환 규칙을 기준으로 판단한다.

### G. 장애와 사고 대응

| 상황 | 즉시 조치 | 후속 조치 |
| --- | --- | --- |
| 후보 명단 오류 | 대상 부문을 `CLOSED`로 전환 | 공개 후보 세트를 수정하지 말고 새 버전 작성. 투표가 이미 있으면 새 `eventId`로 재투표하는 방안을 우선 검토 |
| 중복·조작 의심 | 투표를 닫고 원본 보존 | 감사 계정으로 ballot, eligibility, 로그의 정책·기간·candidate hash 대조 |
| Functions 오류 급증 | 투표를 닫고 최근 로그 보존 | 설정·Secret·배포 버전을 확인하고 검증된 커밋을 재배포 |
| Secret 노출 의심 | 모든 부문을 즉시 닫고 Secret 접근 차단 | 기존 중복 방지 연속성이 깨질 수 있으므로 증적 보존과 마이그레이션 결정 후 회전 |
| 잘못된 운영 웹 배포 | 서버 상태로 제출을 먼저 차단 | Firebase Hosting 릴리스 기록에서 검증된 버전으로 되돌리거나 이전 커밋을 재배포 |
| Google 로그인 실패 | 승인 도메인과 redirect 복귀 URL 확인 | 인앱 브라우저 사용자에게 Chrome/Safari 재진입 안내, Auth 로그 확인 |

설정 오류를 고친 뒤에는 바로 재오픈하지 말고 `get_allstar_vote_event`, 로그인 상태 조회, 후보 버전, 제출 차단·허용 조건을 차례로 재확인한다.

# AUBL 올스타/루키 투표 시스템

투표는 Firestore 클라이언트 쓰기가 아니라 `asia-northeast3`의 callable Cloud Functions를 통해서만 접수한다. 일반 사용자의 Firestore 직접 접근은 Security Rules에서 차단된다. 후보 설정은 `admin` 계정이 관리하고, 투표 원문은 `admin: true`와 `allstarVoteAuditor: true` custom claim을 모두 가진 감사 계정만 클라이언트에서 읽을 수 있다. 공개 결과 callable은 운영자가 이중 승인한 후보별 합계만 반환한다.

## 현재 구현 범위

| 영역 | 상태 | 비고 |
| --- | --- | --- |
| 전용 페이지 | 구현 완료 | `/allstar`, 모바일 우선 레이아웃, 독립 공유 링크 |
| 진입 경로 | 구현 완료 | 메인 최상단 홍보 배너, 상단 메뉴 |
| 후보 화면 | 구현 완료 | 전체 화면 랜딩·허브·실제 visual viewport에 고정한 올스타 카드 확인과 루키 읽기 전용 명단 |
| 선택 규칙 | 구현 완료 | 일반 포지션은 정확히 1명, 통합 외야수는 15명 중 정확히 6명을 서버와 UI가 함께 강제 |
| 인증·중복 방지 | 구현 완료 | Google 계정, 이벤트당 1회 또는 현지 날짜당 1회 |
| 제출 백엔드 | 구현 완료·기본 비활성 | Functions, Firestore Rules, Secret과 이벤트 설정 배포 필요 |
| 결과 화면 | UI 구현 완료 | 일반 포지션 TOP 2와 단일 OF TOP 6 순위표·그라운드. 검수 빌드는 예시 득표만 표시 |
| 실시간 결과 | 읽기 경로 구현 | 승인된 합계 문서 조회·60초 갱신 완료. 합계 생성 작업은 미구현 |
| 루키 후보 | 검토 명단 공개 | 2026-07-13 추천안 78명(1팀 40명·2팀 38명), 투표 기능은 기준 확정 전까지 비활성 |

운영 빌드의 기본값은 안전한 준비 상태다. `VITE_ALLSTAR_VOTING_API_ENABLED=false`이면 callable을 호출하지 않으며, `VITE_ALLSTAR_SHOW_DRAFT_CANDIDATES=false`이면 초안 후보도 노출하지 않는다.

## 후보 명단 확정 전 병행 작업

- [x] Keen Slider 원통형 카드, 강도별 1~2장 이동, 카드 덱 확대 상세, 미세 기울기 제스처와 AUBL 고유 홀로그램 표면 구현
- [x] 첫 접근과 올스타 허브 새로고침 랜딩, 후보 확인·투표·현황 허브 구현
- [x] hero를 투표 기간·올스타전 일시·장소 안내 영역으로 구성
- [x] 경기 일시와 장소를 Firestore 이벤트 설정에서 공개하도록 연결
- [x] 결과 화면을 일반 포지션 TOP 2·통합 외야 TOP 6으로 통합
- [x] 실제 집계 미연결 상태와 검수용 예시 득표를 시각적으로 구분
- [x] 후보 버전·hash에 묶인 공개 합계 callable과 60초 갱신 연결
- [x] 루키 78명 추천안을 로그인·선택·제출 없는 읽기 전용 화면으로 공개
- [ ] 공개 집계 지연 시간, 동률, 무효표, 최소 공개 표본 정책 확정
- [ ] 집계 전용 callable 또는 서버 집계 문서 구현과 부하 검증
- [ ] 최종 후보 세트 생성·검증·게시 및 루키 투표 단위·선발 규칙 확정
- [ ] App Check, 운영 모니터링, 실제 Google 로그인·제출 리허설

루키 검토 명단 공개 항목만 2026-07-13 학교 추천 실명을 기준으로 한다. 나머지 미완료 항목은 운영 회의에서 공개·집계 정책이나 최종 후보 버전이 정해진 뒤 진행한다.

## 사용자 사용 방법

1. 메인 홍보 배너·상단 메뉴·공유 주소 `/allstar`로 전용 페이지를 연다. 첫 접근과 `?division=allstar` 허브를 새로 불러올 때 전체 화면 랜딩이 나오며 위로 60px 이상 스와이프하거나 버튼을 눌러 들어간다. 후보·결과 딥링크는 같은 세션의 첫 접근에만 랜딩을 거치고 이후에는 공유 화면을 바로 연다.
2. 허브에서 투표 기간·경기 일시·장소를 확인하고 올스타 또는 루키를 고른다. `division=allstar|rookie`, `view=candidates|results`가 공유 대상 화면을 보존한다.
3. `후보 확인하기`는 로그인 없이 동작한다. 올스타 후보 화면은 공용 상단바 없이 열리며 원통 카드를 좌우로 밀어 이동하고 중앙 카드를 눌러 확대한다. 약한 스와이프는 한 장, 충분히 길고 빠른 스와이프는 최대 두 장 이동한다. 확대 화면은 겹친 카드 덱에서 한 장씩 꺼내거나 다시 쌓는 전환으로 탐색한다. 좌우 이동이 아닌 세로·대각선 제스처에는 카드가 가볍게 기울었다가 손을 놓으면 복귀한다. 루키는 학교 추천 카드의 학교·조·추천 가능 포지션·비고를 확인한다.
4. 실제 올스타 투표 시작을 누르면 이용약관·개인정보 처리방침 동의와 Google 로그인을 거친다. 인앱 브라우저는 Chrome 열기와 링크 복사 안내를 먼저 제공한다.
5. 1팀의 `P → C → 1B → 2B → 3B → SS → OF` 순서로 선택한다. 투표 단계는 모바일에서 현재 보이는 viewport 한 화면에 제목·진행률·선택 상태·카드·확인 버튼을 모두 배치한다. 일반 포지션은 5명 중 1명, OF는 15명 중 6명을 선택한다. `maxSelections > 1`인 포지션의 확대 화면 상단에는 `선택 1 / 6명 · 후보 15명`처럼 현재 선택 수가 실시간 표시된다. 상세 카드의 `이 선수 선택`을 누르면 왼쪽 `선택 취소`, 오른쪽 `선택 확인`이 나타나며, 확인하면 포지션별 추가 팝업 없이 바로 다음 포지션으로 이동한다. OF는 정확히 6명을 채울 때까지 확인 버튼이 비활성화된다.
6. 1팀 12명 요약 후 강조된 `2팀 투표 시작`으로 같은 7단계를 반복한다. 선택 내용은 후보 버전별 `sessionStorage`에만 임시 저장되며 버전 변경 시 폐기된다.
7. 양 팀 합계 24명을 최종 확인하고 제출한다. 성공한 투표는 사용자가 수정하거나 다시 제출할 수 없다.
8. 감사 화면에서 `투표 현황 보기`로 이동해 일반 포지션 TOP 2와 통합 OF TOP 6 순위표·그라운드를 확인한다.

[Google OAuth 정책](https://developers.google.com/identity/protocols/oauth2/policies)에 따라 임베디드 WebView 로그인이 제한될 수 있고, Hosting 환경에서는 [Firebase redirect 권고](https://firebase.google.com/docs/auth/web/redirect-best-practices)를 적용한다. Android의 Chrome Intent와 iOS의 Chrome URL scheme은 사용자 버튼으로만 best-effort 실행하며 실패하면 링크 복사 또는 현재 브라우저 계속 시도를 제공한다. 자동 외부 브라우저 전환을 보장하지 않는다. Firebase Authentication 승인 도메인에 운영 또는 로그인 시험용 검토 채널 도메인이 없으면 redirect도 완료되지 않는다.

일반 iPhone Safari·Chrome 탭에서는 웹페이지가 브라우저 상·하단 도구막대를 강제로 숨길 수 없다. 현재 구현은 `viewport-fit=cover`, safe-area inset, `visualViewport.height`를 함께 사용해 도구막대 안쪽의 실제 보이는 높이에 화면을 고정하고 페이지 자체 스크롤과 rubber-band를 막는다. 주소창까지 없는 앱 형태가 필요하면 사용자가 홈 화면에 추가한 standalone Web App 구성을 별도로 도입해야 한다. 관련 동작은 [WebKit viewport 단위 설명](https://webkit.org/blog/12445/new-webkit-features-in-safari-15-4/)과 [Apple 홈 화면 웹 앱 안내](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html)를 기준으로 운영한다.

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
  - `selections`는 모든 contest를 정확히 한 번씩 포함하는 `{ [contestId]: candidateId[] }` 객체다. 일반 올스타 contest는 배열 길이 1, `OF` contest는 배열 길이 6이어야 한다.
  - 이벤트/디비전 상태, 투표 기간, 후보 버전, contest 목록, 최소·최대 선택 수, 후보 자격, 중복 ID를 모두 서버에서 재검증한다.
  - 성공 응답의 `submittedAt`은 요청 판단에 사용한 서버 시각이며, 저장 문서에는 Firestore `SERVER_TIMESTAMP`가 기록된다.

올스타와 루키는 서로 다른 `division`을 사용하므로 각각 별도의 1회 투표가 가능하다.

## Firestore 구조

이벤트 문서: `allstarVotingEvents/{eventId}`

다음 블록은 필드 관계를 설명하는 **일부 발췌본이며 그대로 Firestore에 저장하면 안 된다.** 실제 문서는 후보 90명과 contest 14개를 모두 포함해야 하고, 먼저 `published: false`로 검증한다.

```jsonc
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
      "candidateSetId": "allstar-v2-of",
      "candidateVersion": "allstar-v2-of",
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

다음 블록은 필드 구조를 설명하기 위한 일부 발췌 예시다. 실제 발행 문서에는 주석 없이 양 팀 14개 contest와 90명 후보를 모두 입력해야 한다.

```jsonc
{
  "published": true,
  "division": "allstar",
  "version": "allstar-v2-of",
  "candidates": {
    "team_1-p-1": {
      "name": "홍길동",
      "school": "AUBL대학교",
      "position": "P",
      "side": "TEAM_1",
      "group": "A"
    }
    // team_1-p-2부터 team_2-of-15까지 나머지 후보 89명 필수
  },
  "contests": {
    "TEAM_1:P": {
      "label": "1팀 투수",
      "side": "TEAM_1",
      "position": "P",
      "candidateIds": ["team_1-p-1", "team_1-p-2", "team_1-p-3", "team_1-p-4", "team_1-p-5"],
      "minSelections": 1,
      "maxSelections": 1
    },
    "TEAM_1:OF": {
      "label": "1팀 외야수",
      "side": "TEAM_1",
      "position": "OF",
      "candidateIds": [
        "team_1-of-1", "team_1-of-2", "team_1-of-3", "team_1-of-4", "team_1-of-5",
        "team_1-of-6", "team_1-of-7", "team_1-of-8", "team_1-of-9", "team_1-of-10",
        "team_1-of-11", "team_1-of-12", "team_1-of-13", "team_1-of-14", "team_1-of-15"
      ],
      "minSelections": 6,
      "maxSelections": 6
    }
    // TEAM_1의 나머지 5개 일반 contest와 TEAM_2의 7개 contest 필수
  }
}
```

공개 후보 필드는 `name`, `school`, `position`, `side`, `group`, `number`만 허용된다. 후보·contest ID는 영문자가 한 글자 이상 들어간 불투명 ASCII slug만 허용한다. 이메일, 전화번호, Firebase UID, Unique Play 사용자 ID를 ID로 재사용하지 않는다. 모든 공개 후보는 정확히 하나의 contest에 배정되어야 한다. 올스타는 양 팀마다 `P/C/1B/2B/3B/SS` 후보 각 5명·정확히 1표와 `OF` 후보 15명·정확히 6표로 구성한다. 전체 후보는 90명이고 완성 ballot은 24명을 선택한다. `LF/CF/RF` contest는 새 서버 검증에서 거부되므로 새 후보 버전에서는 반드시 `OF`로 합친다. 그 밖의 필드를 후보 문서에 넣어도 callable 응답에는 포함되지 않는다.

후보나 contest 구성을 한 글자라도 바꾸면 새 후보 세트 문서를 만들고 `candidateSetId`와 `candidateVersion`을 함께 올린다. 기존 LF/CF/RF 후보 ID는 새 OF contest에서도 유지할 수 있지만, 이미 공개된 legacy 후보 세트는 과거 감사·조회용으로만 보존하고 수정하지 않는다. Security Rules는 `published: true`가 된 후보 세트의 클라이언트 수정·삭제를 차단한다. 각 투표에는 `candidateSetId`, `candidateVersion`, 정규화된 후보 세트의 SHA-256 `candidateSetHash`가 함께 저장되므로 사후 집계 시 사용된 명단을 검증할 수 있다.

투표 문서: `allstarVotingEvents/{eventId}/ballots/{hmacDocumentId}`

투표 문서에는 UID, Google subject, 이메일, 이름, IP, user-agent를 저장하지 않는다. 문서 ID는 Secret Manager의 키로 `eventId + division + policy period + 검증된 Google provider subject`를 HMAC-SHA256 처리한 값이다. Firebase 계정을 삭제하고 같은 Google 계정으로 다시 가입해 UID가 달라져도 동일 투표자로 판정한다.

정책 전환과 동시 요청을 막기 위한 최소 상태는 `allstarVotingEvents/{eventId}/voterEligibility/{hmacEligibilityId}`에 저장된다. 이 문서도 provider subject를 HMAC 처리한 ID만 사용하며 일반 관리자에게도 클라이언트 쓰기를 허용하지 않는다. Firestore 트랜잭션이 eligibility와 ballot을 함께 갱신하므로 동시 요청 중 한 건만 성공한다.

HMAC ID는 익명값이 아니라 가명값이다. Secret과 provider subject 목록을 함께 가진 운영자는 재계산할 수 있으므로 Secret 접근을 최소화하고, 이벤트 이의제기 기간이 끝나면 ballots와 voterEligibility의 보존·삭제 일정을 운영 정책으로 정한다.

공개 합계 문서: `allstarVotingEvents/{eventId}/publicResults/{division}`

```json
{
  "published": false,
  "candidateVersion": "allstar-v2-of",
  "candidateSetHash": "활성 후보 세트의 contentHash",
  "totalBallots": 0,
  "counts": {
    "team_1-p-1": 0
  },
  "updatedAt": "Firestore Timestamp"
}
```

일반 클라이언트는 이 문서를 직접 읽을 수 없다. `get_allstar_vote_results`는 부문의 `resultsPublished: true`, 합계 문서의 `published: true`, 후보 버전·hash 일치, 0 이상의 정수 득표와 `득표수 <= totalBallots`를 확인한다. 추가로 각 일반 contest의 득표 합계가 `totalBallots`, OF contest는 `6 × totalBallots`인지 검증한 뒤 공개 필드만 반환한다. 둘 중 하나라도 비활성이면 `available: false`를 반환하므로 운영자가 공개를 명시적으로 두 번 승인해야 한다.

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
2. 올스타의 1팀·2팀 각각 `P`, `C`, `1B`, `2B`, `3B`, `SS`, `OF` contest가 모두 있는지 확인한다. 일반 포지션은 후보 5명과 `minSelections=maxSelections=1`, OF는 후보 15명과 `minSelections=maxSelections=6`이어야 한다.
3. 후보 검토가 끝나면 후보 세트의 `published`를 `true`로 바꾼다. 이후에는 이 문서를 수정하지 않고 변경이 필요할 때 새 `candidateSetId`와 `candidateVersion`을 만든다.
4. 이벤트와 부문은 계속 `enabled: false`, `published: false`, `status: DRAFT`로 유지한 채 callable 응답과 UI를 검증한다.
5. 공개 직전에 부문의 `candidateSetId`와 `candidateVersion`을 확정하고 `published: true`로 바꾼다.
6. 이벤트의 `gameStartsAt`, `venue`를 확정하고 운영 URL의 안내 영역에서 표기와 시간대를 확인한다.

루키 검토 화면에는 2026-07-13 추천안의 이름·학교·조·추천 가능 포지션·비고만 정적 데이터로 공개한다. 원본 시트, 회의용 성적 자료, Unique Play 기록·사용자 ID는 공개 저장소나 Hosting 산출물에 포함하지 않는다. 루키 투표 기준이 확정되면 이 검토 데이터를 그대로 투표 후보 세트로 간주하지 말고 새 후보 버전과 contest를 별도로 검증한다.

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

2026-07-15 검수 빌드 기준으로 올스타 route 분리 전 초기 JS는 613.12 kB gzip이었고, 지연 로딩 적용 후 공통 초기 JS는 589.94 kB gzip, 올스타 전용 청크는 진입 시 26.96 kB gzip이다. 총 JS는 616.90 kB gzip으로 약 3.78 kB 늘었지만 메인 페이지 초기 전송은 약 23.18 kB 줄었다. 의존성이나 카드 자산을 바꿀 때 같은 방식으로 비교한다.

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

- 첫 접근 및 `/allstar/?division=allstar` 새로고침에서 전체 화면 랜딩이 다시 나오고, 60px 위 스와이프와 버튼 진입이 모두 동작하는지 확인. 스와이프 중 아래 허브가 함께 스크롤되지 않고 진입 직후 `scrollY=0`인지도 확인
- 허브의 투표 기간·경기 일시·장소와 미확정 fallback 문구 확인
- `view=candidates`에서 전용 상단바가 숨겨지고, 로그인 없이 5장 일반 포지션·15장 OF 원통 카드가 겹치지 않는지 확인. 별도 이동·확대 버튼 없이 제스처 안내, 중앙 카드 탭 확대, 약한 스와이프 1장·강한 스와이프 최대 2장, 확대 카드 덱 양방향 전환이 동작하는지 확인
- 캐러셀과 확대 카드에서 세로·대각선 제스처를 주면 카드가 제한된 각도만큼 기울고 손을 놓은 뒤 원위치로 복귀하는지 확인. 이 동작이 카드 상세 열기나 좌우 후보 이동을 오발시키지 않아야 한다
- 검수용 투표 흐름에서 360×640 이상 모바일 세로 화면에 세로 스크롤이 생기지 않고 모든 조작 요소가 보이는지 확인. 일반 선수 선택 후 `선택 취소 / 선택 확인`, OF 확대 화면의 실시간 `선택 n / 6명 · 후보 15명`, OF 1~5명에서 확인 비활성·6명에서 활성, 확인 즉시 다음 포지션 이동, 1팀 요약→2팀 유도→24명 최종 확인과 실제 미제출 문구도 함께 확인
- `/allstar/?division=allstar&view=results`에서 예시 데이터 경고, 순위표, 그라운드 확인
- `/allstar/?division=rookie`에서 후보 78명, 1팀 40명, 2팀 38명, 포지션 미기재 17명과 손주홍 비고 확인
- 루키 화면에 로그인·선택·제출·결과 UI가 없고 루키 callable을 호출하지 않는지 확인
- 360px·390px·430px 및 `prefers-reduced-motion`에서 카드 잘림, 세로 스크롤·가로 스와이프 충돌, 정적 포일 fallback 확인
- 인앱 브라우저 경고의 Chrome 열기·링크 복사·현재 브라우저 계속 시도가 사용자 동작으로만 실행되는지 확인
- 페이지 source의 canonical, OG 이미지가 검토 채널을 가리키는지 확인
- 응답에 `x-robots-tag: noindex`가 있는지 확인
- 회의용 성적, 원본 시트 경로, Unique Play 사용자 ID·기록 JSON이 `dist`에 섞이지 않았는지 확인

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

잘못된 웹 배포를 되돌릴 때도 먼저 이벤트 또는 부문을 `CLOSED`로 바꿔 서버 제출을 차단한다. 그 다음 Firebase Hosting 릴리스 기록에서 검증 버전을 복원하거나 known-good 커밋을 재배포하고, Functions 문제가 함께 있으면 이전 검증 커밋의 callable을 재배포한다. 공개된 후보 문서는 직접 수정하지 않는다. 투표 생성 전 active pointer를 복원할 때는 현재 `P/C/1B/2B/3B/SS/OF` 검증과 호환되는 후보 버전만 선택한다. LF/CF/RF legacy 세트로 되돌려야 한다면 해당 스키마를 지원하던 Functions도 함께 복원한 뒤 닫힌 상태에서 검증한다. 투표가 이미 생성된 후보 오류는 새 후보 버전과 새 `eventId`로 재투표하는 방안을 우선한다. 로그인, 후보 version/hash, 제출 차단을 다시 검증한 뒤에만 재오픈한다.

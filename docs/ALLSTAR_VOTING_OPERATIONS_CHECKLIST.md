# 2026 AUBL 올스타 투표 운영 체크리스트

이 문서는 실제 투표 담당자가 오픈·중단·종료·복구 때 그대로 따라가는 실행용 체크리스트다. 상세 스키마와 개발 절차는 [`functions/ALLSTAR_VOTING.md`](../functions/ALLSTAR_VOTING.md), 비기술 설명과 Google Forms 전환 원칙은 [`ALLSTAR_VOTING_RELIABILITY.md`](./ALLSTAR_VOTING_RELIABILITY.md), 평가·비평용 구현 및 측정 분석은 [`ALLSTAR_VOTING_RESILIENCE_ENGINEERING_REVIEW.md`](./ALLSTAR_VOTING_RESILIENCE_ENGINEERING_REVIEW.md)를 함께 본다.

원칙은 세 가지다.

1. 문제가 생기면 화면이 아니라 Firestore 이벤트 또는 대상 부문의 `status: CLOSED`로 새 제출부터 막는다.
2. 원본 ballot·eligibility·공개 후보 세트는 콘솔에서 고치거나 일부만 합치지 않는다.
3. 관리자 JSON/CSV는 운영 증적이며 원본 백업이 아니다. 원본 복구 수단은 예약 백업과 종료 후 managed export다.

## 담당자와 증적

행사 전 아래 칸을 복사해 비공개 운영 기록에 작성한다. Secret 원문, UID, 이메일, Google subject, HMAC 문서 ID는 기록하지 않는다.

| 항목 | 기록 |
| --- | --- |
| 운영 책임자 / 대체 담당자 |  |
| 장애 시 투표 중단 권한자 |  |
| Firebase 프로젝트 / DB | `aubl-backup` / `(default)` |
| 이벤트 / 부문 | `aubl-2026-allstar` / `allstar` |
| 최종 후보 version / hash |  |
| 첫 표 config lock / fingerprint digest |  |
| Functions 배포 commit / 시각 |  |
| Hosting 배포 release / 시각 |  |
| 일일 백업 schedule 이름 / retention |  |
| 최근 `READY` 백업 snapshot 시각 |  |
| 종료 export bucket / 담당자 |  |
| 알림 notification channel / 수신 확인 시각 |  |
| known-good Hosting / Functions 버전 |  |

모든 JSON 증적은 `YYYYMMDD-HHMM-이벤트-부문-종류.json`처럼 저장하고, 운영 담당자 두 명이 읽을 수 있는 비공개 저장소에 보관한다.

## 1. 지금 완료할 항목 — PITR 제외

### 2026-07-21 저장소 검증 결과

- Python 투표·관리자·결과·DR·성능 harness 단위 테스트 82건 통과
- Firestore Emulator 동시성 검증 통과
  - 서로 다른 100계정, 동시성 20: 100건 성공, ballot/eligibility 각각 100건
  - 같은 계정 50개 동시 요청: 1건 성공, 49건 `ALREADY_VOTED`, 원장 각각 1건
  - 응답 유실 재시도: 같은 ID·같은 선택은 `IDEMPOTENT`, 같은 ID·다른 선택은 `ALREADY_VOTED`, 원장 각각 1건
  - 닫힌 이벤트 50개 요청: 전부 `VOTING_NOT_OPEN`, 원장 0건
  - config lock 생성 후 steady-state 40계정 동시 제출: 40건 모두 성공, seed 포함 ballot·eligibility 각 41, lock 1. 평균 112.62ms, p50 114.37ms, p95 121.26ms, p99 122.11ms
  - 비어 있는 부문에 서로 다른 40계정 동시 최초 제출: 40건 모두 성공하고 config lock 하나를 공유함. 부문 전체 legacy 원장 검사 포함 재시험 p50 2.28초, p95 2.29초
  - 다른 사용자·이전 Secret으로 만든 pre-lock 원장: 상태 조회·제출 모두 `VOTING_CONFIG_LOCK_MISSING`, 기존 ballot·eligibility 각 1 유지, lock 자동 재생성 없음
- 최대 결과 재생성 순수 연산 리허설 통과
  - 20,000 ballot·20,000 eligibility·480,000 선택 참조
  - fixture 1.831초, 검증·digest·득표 집계·ledger 연결 검사 9.181초, 총 11.012초
  - Python traced peak 60.12 MiB, 프로세스 peak RSS 200.75 MiB
  - Firestore 읽기·callable 왕복·cold start는 포함하지 않으며 별도 테스트 프로젝트 리허설로 남김
- Firestore Security Rules Emulator 브라우저 클라이언트 경계 125건 통과
  - 비로그인·일반 사용자는 `configLocks`, `ballots`, `voterEligibility`, `resultDrafts`, `publicResults`의 단건/목록 읽기와 생성/수정/삭제가 모두 차단됨
  - `admin` 단독은 `publicResults` 읽기만, `admin + allstarVoteAuditor`는 원장·eligibility·공개 결과 읽기만 허용됨
  - `allstarVoteAuditor` 단독은 접근 불가, `configLocks`와 `resultDrafts`는 모든 브라우저 읽기·쓰기가 차단되고 보호 영역 쓰기는 모든 시험 계정에서 차단됨
- 프로덕션 빌드와 올스타 관련 scoped ESLint 통과

에뮬레이터 결과는 Firestore 트랜잭션 정합성을 검증한 것이다. 실제 HTTP, App Check, Functions cold start·autoscaling, 모바일 Google 로그인은 운영 전 별도 리허설에 남긴다. 저장소 전체 `npm run lint`는 올스타 범위 밖 기존 `.tmp` 스크립트와 커뮤니티/에디터 규칙 오류 때문에 실패하므로, 해당 기존 오류와 이번 올스타 변경 검증을 구분한다.

최초 config lock 경합의 최신 로컬 측정은 p50 2.28초, p95 2.29초이며 정상 제출 SLA가 아니다. 정확성은 유지됐지만 lock 생성 후 steady-state p50 114.37ms와 분명히 다른 첫 burst의 단일 문서 경합 한계를 보여준다. 운영 event에 가짜 표를 넣어 잠금을 미리 만들지 말고, 별도 테스트 event에서 같은 경로를 리허설한 뒤 실제 Cloud Firestore 수치를 기록한다.

### 저장소와 기능 검증

- [ ] `npm run lint`, `npm run build`, 전체 Python 투표 테스트가 통과했다.
- [x] `npm run test:allstar:rules`에서 Firestore Rules가 일반 사용자 보호 데이터 직접 읽기·쓰기를 차단하고 감사 claim 경계를 유지한다.
- [ ] 관리자 화면 `/admin/allstar-voting`에서 경량 관제가 동작한다.
- [ ] 닫힌 테스트 이벤트에서 전체 무결성 검사 → 결과 초안 재생성 → 공개/숨김을 리허설했다.
- [x] 순수 연산 harness에서 최대 20,000 ballot의 후보·선택·fingerprint·ledger·digest 집계 성능이 120초·768 MiB 예산 안에 들어왔다.
- [ ] 동일 Google 계정 동시 제출에서 정확히 한 건만 접수된다.
- [ ] 저장 성공 후 응답 유실 상황에서 같은 `submissionId`·같은 선택은 `idempotent` 성공, 같은 ID·다른 선택은 `ALREADY_VOTED`이며 상태 재조회도 방금 ID만 완료로 복구한다.
- [ ] 별도 테스트 event의 첫 유효 ballot이 `configLocks/{division}`을 만들고, 후보 ID/version/hash·policy·timezone·Secret fingerprint 변경 및 기존 원장에 잠금이 없는 상태가 모두 fail-closed하는지 확인했다.
- [ ] App Check 클라이언트를 먼저 배포하고 요청 지표를 확인했다. 민감 callable 강제는 충분한 정상 토큰 비율을 확인한 뒤 켰다.

### 일일 예약 백업

PITR를 변경하지 않고 예약 백업만 준비한다. 현재 상태와 실행 명령을 먼저 출력한다.

```bash
PYTHONPATH=functions functions/venv/bin/python scripts/allstar_voting_dr.py \
  backup-plan \
  --project aubl-backup \
  --database '(default)' \
  --location asia-northeast3 \
  --retention 14d
```

Cloud Shell 또는 `gcloud` 인증 환경에서 상태를 확인한다. 최근 48시간 이내 `READY` 백업, 일일 schedule, 비정상 상태가 없을 때만 종료 코드 0이다.

```bash
PYTHONPATH=functions functions/venv/bin/python scripts/allstar_voting_dr.py \
  backup-status \
  --project aubl-backup \
  --database '(default)' \
  --location asia-northeast3 \
  --max-ready-age-hours 48 \
  --output ./allstar-backup-status.json
```

일일 schedule이 없을 때만 dry-run을 검토하고 생성한다. `--execute`와 정확한 프로젝트 확인값을 함께 주지 않으면 외부 상태를 바꾸지 않는다. 이 명령은 PITR를 켜거나 끄지 않는다.

```bash
PYTHONPATH=functions functions/venv/bin/python scripts/allstar_voting_dr.py \
  create-daily-backup \
  --project aubl-backup \
  --database '(default)' \
  --location asia-northeast3 \
  --retention 14d

PYTHONPATH=functions functions/venv/bin/python scripts/allstar_voting_dr.py \
  create-daily-backup \
  --project aubl-backup \
  --database '(default)' \
  --location asia-northeast3 \
  --retention 14d \
  --execute \
  --confirm-project aubl-backup
```

- [ ] schedule 생성 결과를 저장했다.
- [ ] 첫 백업이 `READY`가 된 뒤 `backup-status` 종료 코드 0을 확인했다.
- [ ] 복원 담당자에게 `roles/datastore.backupsViewer` 또는 필요한 최소 역할만 부여했다.
- [ ] 예약 백업은 TTL 정책을 포함하지 않으므로 복원 체크리스트에 TTL 재설정을 넣었다.

### 모니터링과 알림

- [ ] `allstar_ballot_failed`가 한 건이라도 발생하면 즉시 알리는 log-based alert를 만들었다.
- [ ] `allstar_ballot_rejected` 중 예상 가능한 `ALREADY_VOTED`, `VOTING_NOT_OPEN`을 제외한 오류가 5분 동안 반복되면 알리도록 설정했다.
- [ ] Functions 5xx/지연 시간과 App Check invalid/missing 요청 증가를 확인할 대시보드와 알림을 만들었다.
- [ ] 매일 `backup-status`를 실행하고 종료 코드 2 또는 `latestReadyStale: true`를 담당자에게 전달하는 작업을 준비했다.
- [ ] 알림 notification channel의 테스트 알림을 실제 당직자와 대체 담당자가 모두 받았다.
- [ ] 공개 결과를 운영한다면 관리자 화면의 `sourceDigest`, ballot 수, 갱신 시각 불일치도 진행 중 점검표에 넣었다.

Cloud Logging 필터의 기준 필드는 다음과 같다.

```text
jsonPayload.event="allstar_ballot_failed"
```

```text
jsonPayload.event="allstar_ballot_rejected"
jsonPayload.reason!="ALREADY_VOTED"
jsonPayload.reason!="VOTING_NOT_OPEN"
```

알림에는 Secret, 요청 토큰, selections를 넣지 않는다. 운영자가 실패 로그를 Firestore에 복제 저장하지 않는다.

### Google Forms cold standby

- [ ] 최종 후보와 동일한 질문 구조의 Forms 초안을 만들되 응답 접수는 꺼 두었다.
- [ ] AUBL 표와 Forms 표를 합치지 않고, 전환 시 기존 라운드 전체 인정 또는 전체 무효 중 하나만 결정한다는 문구를 승인했다.
- [ ] 전환 공지, 새 event/새 기간, 기존 투표 처리 결정을 바로 게시할 수 있게 준비했다.

## 2. 실제 오픈 직전 — PITR 포함

사용자 결정에 따라 PITR 활성화는 실제 투표 직전에 수행한다. 다음 항목은 그때까지 `미완료`로 유지한다.

- [ ] 오픈 직전 PITR를 활성화하고, 활성화 이전 시점은 소급 보호되지 않음을 확인했다.
- [ ] 최종 후보 세트가 `published: true`이고 version/hash를 두 명이 대조했다.
- [ ] 이벤트와 부문은 최종 점검 동안 `DRAFT` 또는 `CLOSED`, `enabled: false`다.
- [ ] `ALLSTAR_VOTER_KEY_SECRET`의 활성 version과 별도 보안 경계의 복구본을 확인했다.
- [ ] 운영 빌드는 API 활성, 초안 후보 비활성, App Check site key 설정으로 배포됐다.
- [ ] Google 로그인, 후보 조회, 투표 상태 조회를 실제 운영 URL에서 확인했다.
- [ ] 운영 이벤트가 아닌 별도 테스트 이벤트에서 실제 제출과 관리자 원장 대조를 완료했다.
- [ ] 예약 백업 최근 상태, 알림 수신, known-good rollback 버전을 다시 확인했다.
- [ ] 책임자 두 명의 오픈 승인을 받은 뒤에만 `enabled: true`, `status: OPEN`으로 전환했다.
- [ ] 첫 정상 표 직후 관리자/DR audit에서 config lock이 현재 설정과 일치하는지 확인하고 비식별 fingerprint digest를 증적에 기록했다.

## 3. 투표 진행 중

매 점검 시각마다 숫자와 담당자를 운영 기록에 남긴다.

- [ ] 관리자 화면의 ballot 수 / eligibility 수 / 최근 5분·1시간 접수량 / 마지막 접수 시각 확인
- [ ] 후보 version/hash, 정책, localDate 분포 확인
- [ ] 최근 로그 무결성 `REVIEW`와 경고가 0인지 확인
- [ ] `allstar_ballot_failed`와 예상 밖 reject 추이 확인
- [ ] App Check invalid/missing 및 Functions 오류율 확인
- [ ] 공개 결과 사용 시 ballot 수, 후보 version/hash, `sourceDigest`, 갱신 시각 대조
- [ ] config lock 일치 상태로 Secret, 후보 ID/version/hash, timezone, 정책이 변경되지 않았는지 확인

다음 상황이면 즉시 `CLOSED`로 바꾸고 장애 절차로 이동한다.

- ballot/eligibility 관계 불일치
- 후보 hash 또는 선택 수 무결성 경고
- 예상 밖 Functions 오류 지속
- 데이터 삭제·오염 또는 Secret 노출 의심
- 후보 명단의 경기 결과에 영향을 주는 중대한 오류

## 4. 장애 대응

1. 이벤트 또는 대상 부문을 `status: CLOSED`로 바꾼다.
2. 사고 인지 시각, 마지막 정상 접수 시각, 관리자 수량, 후보 version/hash를 기록한다.
3. 관리자 JSON과 최근 비식별 CSV, 관련 Cloud Logging 쿼리를 저장한다.
4. 원본 문서를 수정하지 않고 원인을 화면·Functions·인증·설정·데이터로 분류한다.
5. known-good 버전을 닫힌 상태에서 복원하고 후보 조회·로그인·제출 차단을 확인한다.
6. 데이터 사고면 예약 백업/PITR/export를 **새 데이터베이스**로 복원해 대조한다.
7. 재오픈, 새 event 전체 재투표, Google Forms cold standby 전환 중 하나를 운영 회의가 결정한다.

부분 장애 중 AUBL과 Google Forms를 동시에 열지 않는다. 두 시스템의 계정 중복을 사후에 안전하게 합칠 수 없기 때문이다.

## 5. 정상 종료와 수동 export

1. `closesAt` 또는 `status: CLOSED`를 확인한다.
2. 새 제출이 `VOTING_NOT_OPEN`으로 거부되는지 확인한다.
3. 관리자 전체 무결성 검사를 실행하고 경고가 0인지 확인한다.
4. 결과 초안을 원본에서 재생성하고 `sourceDigest`, `generationId`, ballot 수를 기록한다.
5. 아래 dry-run으로 닫힘 장벽과 export 대상을 검증한다.

```bash
PYTHONPATH=functions functions/venv/bin/python scripts/allstar_voting_dr.py \
  export \
  --project aubl-backup \
  --database '(default)' \
  --event aubl-2026-allstar \
  --division allstar \
  --bucket gs://<private-backup-bucket> \
  --manifest ./allstar-export-manifest.json
```

6. 명령과 manifest preview를 두 명이 확인한 뒤 실행한다.

```bash
PYTHONPATH=functions functions/venv/bin/python scripts/allstar_voting_dr.py \
  export \
  --project aubl-backup \
  --database '(default)' \
  --event aubl-2026-allstar \
  --division allstar \
  --bucket gs://<private-backup-bucket> \
  --manifest ./allstar-export-manifest.json \
  --execute \
  --confirm-project aubl-backup
```

도구는 닫힌 상태, config lock, 원장/eligibility 관계, 14개 contest·24명, 후보 version/hash, 결과 digest를 검사한다. 원장이 있는데 lock이 없거나 lock이 현재 닫힌 설정과 다르면 중단하고, export 전후 manifest가 다르면 실패한다. 로컬 manifest에는 Secret fingerprint 원문 대신 별도 SHA-256 digest만 넣으며 selections나 HMAC 문서 ID를 내보내지 않는다.

7. 도구가 managed export operation을 `SUCCESSFUL`까지 poll하고 요청 GCS 경로와 일치하는지 확인한 뒤 manifest를 기록하는지 확인한다. timeout이면 이미 시작된 Cloud operation이 자동 취소되지는 않으므로 manifest를 성공으로 간주하지 말고 출력된 operation 이름을 Cloud Console/CLI에서 별도로 추적한다.
8. 최종 결과 공개는 검증된 `generationId`에 대해서만 실행한다.
9. 결과 확정·이의 처리·원본 보존 만료일을 공지한다.

## 6. 복원 리허설과 대조

운영 `(default)` DB에 덮어쓰지 않는다. 예약 백업을 새 named database로 복원하거나, managed export를 새 named database에 import한 뒤 검사한다.

```bash
PYTHONPATH=functions functions/venv/bin/python scripts/allstar_voting_dr.py \
  verify-restored \
  --project aubl-backup \
  --database allstar-drill-YYYYMMDD \
  --event aubl-2026-allstar \
  --division allstar \
  --source-manifest ./allstar-export-manifest.json \
  --output ./allstar-restore-verification.json
```

- [ ] `comparison.matches: true`
- [ ] ballot/eligibility 수와 정책 관계 일치
- [ ] candidateVersion / candidateSetHash 일치
- [ ] config lock 존재·현재 설정 일치와 비식별 `fingerprintDigest` 일치
- [ ] `sourceDigest` / `generationId` 일치
- [ ] 일반 포지션 합계 = 유효 ballot 수
- [ ] OF 합계 = 유효 ballot 수 × 6
- [ ] index, TTL, Rules, IAM, Functions 환경, App Check 설정을 별도로 재적용·확인
- [ ] 복원 DB에는 실제 사용자 트래픽을 연결하지 않고 검증 후 정리

검증 결과가 다르면 운영 DB에 병합하지 않는다. 차이 목록, 백업 snapshot 시각, export 시각과 마지막 정상 접수 시각을 놓고 운영 책임자가 전체 복원·새 라운드·현 상태 유지 중 하나를 승인한다.

## 7. 현재 남겨 두는 오픈 게이트

저장소 구현만으로 완료할 수 없는 항목이다. 실제 완료 시각과 증적 경로가 없으면 투표를 열지 않는다.

- PITR 활성화와 복구 가능 시간 확인
- Firebase 프로젝트의 첫 `READY` 예약 백업 및 복원 리허설
- 운영 notification channel을 연결한 실제 알림 수신 시험
- 운영 Google OAuth 승인 도메인과 App Check enforcement 지표 확인
- 최종 후보 version/hash, 투표 정책·공개 지연·동률·무효표 규정 승인
- 종료 export bucket 권한과 보존 정책 확인

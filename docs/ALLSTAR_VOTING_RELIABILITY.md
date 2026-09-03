# 올스타 투표 안정성·장애 대응 설명

비기술 운영 판단을 위한 요약 문서다. 설계 의도, 구현 근거, 측정 범위와 비판 지점은 [`ALLSTAR_VOTING_RESILIENCE_ENGINEERING_REVIEW.md`](./ALLSTAR_VOTING_RESILIENCE_ENGINEERING_REVIEW.md), 실제 실행 순서는 [`ALLSTAR_VOTING_OPERATIONS_CHECKLIST.md`](./ALLSTAR_VOTING_OPERATIONS_CHECKLIST.md)를 본다.

## 결론

현재 AUBL 투표 시스템은 **한 표를 정확하게 접수하는 핵심 구조**가 Google Forms보다 엄격하다. 후보 버전, 포지션별 선택 수, 후보 자격과 계정 중복을 서버에서 다시 검사하고, 첫 정상 표에서는 핵심 설정 잠금·투표 원장·중복 방지 원장을 하나의 Firestore 트랜잭션으로 저장한다.

반면 Google Forms는 응답표, CSV 내려받기와 플랫폼 운영 화면이 기본 제공된다는 장점이 있다. AUBL 시스템에는 이 운영 안전망이 부족했기 때문에 관리자 현황·비식별 접수 로그, 제출 응답 유실 복구, 구조화된 함수 로그, 닫힌 원장 기반 결과 재생성·공개 기능을 추가했다. 예약 백업 상태 점검·생성, 종료 export와 복원 대조 도구도 준비했다. 다만 **예약 백업·알림·App Check 강제는 Firebase/GCP 프로젝트에서 실제 적용과 수신 시험이 필요하고, PITR 활성화는 요청대로 투표 오픈 직전에 수행한다.**

따라서 현재 판단은 다음과 같다.

> 자체 시스템을 주 투표 수단으로 유지할 수 있다. 저장소 차원의 접수·감사·결과 재생성·DR 도구는 갖춰졌으며, 실제 프로젝트의 백업·복원, 동시 제출, App Check·알림 리허설을 오픈 게이트로 통과해야 한다. Google Forms는 동시에 받는 예비 창구가 아니라 전체 재투표용 cold standby로만 준비한다.

## Google Forms와 비교

| 항목 | AUBL 투표 시스템 | Google Forms |
| --- | --- | --- |
| Google 계정 1회 제한 | Google provider identity를 HMAC 처리해 서버에서 강제 | 설정으로 간단히 제공 |
| 포지션별 선택 수 | 서버가 일반 1명·외야 6명을 정확히 강제 | 질문 설정과 사후 검토에 의존 |
| 후보 변경 추적 | 후보 version과 SHA-256 hash를 각 ballot에 보존 | 별도의 버전 보관 절차 필요 |
| 동시 제출 | Firestore 트랜잭션으로 한 건만 성공 | Google 플랫폼에 위임 |
| 부분 저장 | ballot과 eligibility가 모두 저장되거나 모두 취소 | 응답 단위 저장 |
| 운영 화면 | AUBL 관리자 페이지를 별도 운영 | 응답표·Sheets 연동이 기본 제공 |
| 백업 | Firestore 백업·PITR를 프로젝트에서 별도 설정 | Sheets·CSV 내려받기가 쉬움 |
| 복구 감사 | 원본 hash와 후보 버전으로 대조 가능 | 응답 수정·삭제 기록을 별도 관리해야 함 |

Google Forms가 더 단순하다는 의견은 타당하다. 하지만 투표 중간에 두 시스템을 동시에 열거나 즉시 갈아타면 동일 계정을 서로 대조할 수 없다. AUBL은 Google provider subject의 원문을 저장하지 않고 HMAC 값만 사용하며, Forms는 같은 값을 제공하지 않기 때문이다. 이메일을 수집해 합치는 방식은 개인정보 고지와 중복 판정 규칙을 새로 정해야 하므로 즉석 해결책이 아니다.

## 현재 접수 안정성

정상 제출은 다음 순서로 처리된다.

1. Firebase 로그인 토큰과 허용된 Google identity를 확인한다.
2. 이벤트가 열려 있고 후보 세트가 공개 상태인지 확인한다.
3. 브라우저가 보낸 후보 version이 현재 version과 같은지 확인한다.
4. 모든 contest가 존재하고 일반 포지션 1명·외야 6명인지 검사한다.
5. 후보가 해당 contest 소속인지, 같은 후보가 중복되지 않았는지 검사한다.
6. 첫 표에서 만든 `configLocks/{division}`이 후보 ID/version/hash, 정책, timezone과 현재 HMAC Secret fingerprint에 일치하는지 확인한다.
7. 같은 Google 계정의 ballot과 eligibility가 이미 존재하는지 확인한다.
8. 첫 표라면 설정 잠금도 함께 만들고, 새 ballot과 eligibility를 한 트랜잭션으로 저장한다.

따라서 네트워크 재시도나 버튼 연타가 발생해도 같은 기간의 두 번째 ballot은 생성되지 않는다. 후보 명단이 바뀐 오래된 화면도 version 불일치로 거부된다. 일반 브라우저는 ballot을 직접 읽거나 쓸 수 없다.

`ONCE_PER_EVENT`와 `ONCE_PER_DAY`는 첫 ballot 전에는 설정으로 선택할 수 있다. 첫 유효 ballot은 후보 세트 ID/version/hash, 정책, timezone과 이벤트 범위 HMAC Secret fingerprint를 서버 잠금에 고정한다. 이후 하나라도 바뀌면 상태 조회와 제출이 `VOTING_CONFIG_LOCK_MISMATCH`로 중단된다. division 전체에 기존 ballot 또는 eligibility가 하나라도 있는데 잠금이 없는 과거 이벤트도 임의 migration 없이 `VOTING_CONFIG_LOCK_MISSING`으로 중단된다. 시작 후 변경이 필요하면 기존 라운드를 닫고 새 `eventId`로 전체 재투표한다.

투표 내용에는 이메일, UID, 이름, IP, user-agent를 저장하지 않는다. 다만 HMAC 문서 ID는 완전한 익명이 아니라 Secret과 provider subject를 함께 가진 운영자가 재계산할 수 있는 가명정보이므로 원본 접근 권한을 최소화해야 한다.

## 오류가 발생했을 때 수습 가능한 범위

### 화면 또는 Hosting 오류

서버의 event/division을 `CLOSED`로 바꾸면 잘못된 화면이 남아 있어도 새 제출은 차단된다. 기존 ballot은 영향받지 않는다. 이후 검증된 Hosting 릴리스로 되돌리고 닫힌 상태에서 후보 조회·로그인·제출 차단을 확인한다.

### Functions 오류

먼저 투표를 닫고 Cloud Logging의 `allstar_ballot_accepted`, `allstar_ballot_rejected`, `allstar_ballot_failed` 구조화 로그를 보존한다. 이 로그에는 계정과 선택 내용이 없고 event, division, candidateVersion, 정책·기간 또는 reason만 들어간다. 검증된 Functions revision으로 복원한 뒤 상태 조회와 테스트 이벤트 제출을 확인한다.

### 저장 성공 후 응답만 유실

모바일 통신이 끊기면 서버에는 저장됐지만 사용자는 오류 응답을 받을 수 있다. 프런트는 호출 전에 후보 version·선택 fingerprint·`submissionId`를 브라우저 세션에 보존하므로 상태 조회까지 실패해도 같은 선택을 다시 누르면 같은 ID를 재사용한다. 서버는 `submissionFingerprint`와 ballot/eligibility pointer를 대조해 같은 ID·같은 선택만 `idempotent` 성공으로 반환한다. 오류 직후 상태 조회에서도 방금 ID가 원장과 같을 때만 완료 화면으로 복구하며, 선택이 바뀌었거나 다른 탭·이전 요청이 먼저 접수된 경우 현재 선택을 접수 로스터로 잘못 저장하지 않는다.

### 후보 명단 오류

공개된 후보 문서를 직접 수정하지 않는다. 투표 전이라면 새 candidateSet/version을 만들고, 투표가 이미 시작됐다면 기존 표 인정 범위를 임의로 섞지 않는다. 영향이 크면 새 `eventId`로 전체 재투표하는 것이 가장 감사하기 쉽다.

### 데이터 삭제 또는 오염

운영 DB에 바로 데이터를 덮어쓰지 않는다. 사고 시각과 마지막 정상 접수 시각을 기록하고, PITR 또는 예약 백업을 새 데이터베이스로 복원한다. 복원본의 config lock, ballot·eligibility 수, 후보 version/hash와 선택 수를 검증하고 종료 export manifest의 비식별 lock fingerprint digest와 대조한 뒤 운영 책임자가 전환이나 병합을 승인한다.

## 관리자 페이지

경로는 `/admin/allstar-voting`이다. 기존 AUBL 관리자 메뉴의 `올스타 투표 관리`에서 접근한다.

페이지에서 확인할 수 있는 내용:

- 이벤트·부문 상태, 정책, 투표 기간
- 활성 후보 version과 hash
- ballot 수와 voterEligibility 수 및 정책별 수량 관계
- 최근 5분·1시간 접수량과 마지막 접수 시각
- 후보 version·정책·날짜별 접수 분포
- 공개 집계의 후보 version/hash·contest 합계 검증과, 종료 후 전체 검사 시 후보별 원본 재계산 대조
- 최근 비식별 접수 로그의 시각, receipt code, 후보 version, 정책, 선택 수, 무결성
- 최근 접수 경량 관제, 투표 종료 후 수동 전체 무결성 검사
- 닫힌 원장 전체 검증, 비공개 결과 초안 재생성, 검증된 generation 공개·숨김
- 비식별 운영 스냅샷 JSON과 접수 로그 CSV

관리자 화면에는 이메일, UID, Google subject, IP, 선택 선수와 원본 HMAC 문서 ID가 나오지 않는다. 원본 ballot 직접 열람은 `admin: true`와 `allstarVoteAuditor: true`를 모두 가진 별도 감사 계정만 가능하다. 기본 30초 조회는 집계 쿼리와 최근 로그만 사용하고, ballot 최대 20,000개와 eligibility 최대 20,000개의 전체 검사는 투표를 닫은 뒤 수동 실행한다. 게시 버튼은 전체 검사에서 ballot 무결성·ledger 연결·혼합 정책 경고가 모두 없는 경우에만 활성화되고, 서버도 공개 직전에 같은 원장을 다시 strict rebuild해 generation이 그대로인지 확인한다. 다만 Admin SDK/IAM 권한자가 재검증 직후 원본을 바꾸는 경우까지 원자적으로 봉인하는 WORM 구조는 아니므로 원본 수동 수정 금지, 최소 IAM과 Cloud Audit Logs가 필요하다. 비식별 JSON·CSV는 회의와 장애 분석 보조자료이며 복원용 원본 백업이 아니다.

경량 수량 조회는 [Firestore aggregation query](https://firebase.google.com/docs/firestore/query-data/aggregation-queries), 오류 추이는 [Cloud Logging structured logging](https://cloud.google.com/logging/docs/structured-logging)의 필드 기반 검색을 사용한다.

## 백업 구성 방향

저장소 코드만으로 실제 Firebase 프로젝트의 PITR나 예약 백업 활성 여부는 확인할 수 없다. [`scripts/allstar_voting_dr.py`](../scripts/allstar_voting_dr.py)는 PITR를 변경하지 않고 예약 백업 상태·최근 `READY` 백업을 검사하고, 명시적 프로젝트 재확인이 있을 때만 일일 schedule을 만들며, 닫힌 원장의 export·복원 대조를 수행한다. 실제 프로젝트에서는 다음 작업을 운영자가 완료하고 체크해야 한다.

1. **요금제·권한**
   - 예약 백업·PITR·managed export에 필요한 Blaze 요금제, 최소 IAM 역할과 Cloud Storage bucket 권한을 먼저 확인한다.
   - 백업 실패 알림, 비용 확인, 복원 승인 담당자를 정한다.
2. **PITR — 오픈 직전 보류**
   - 사용자 결정에 따라 실제 투표 진행 직전에 활성화한다. 가능한 복구 시간이 투표 기간을 덮기 전에 오픈하지 않는다.
   - Firestore PITR는 활성화 이후 최근 최대 7일의 분 단위 상태를 복구하는 수단이다.
3. **예약 백업**
   - 일일 백업과 적절한 보존 기간을 설정한다.
   - 백업은 source DB와 같은 위치에 저장되며 새 데이터베이스로 복원된다.
4. **종료 직후 managed export**
   - division을 `CLOSED`로 전환하고 마지막 접수를 확인한 뒤 실행한다.
   - export 전후 audit manifest가 원장·후보·결과와 config lock digest까지 같고 operation이 성공해야 정상 증적으로 인정한다.
5. **Secret 원문의 별도 재해 복구**
   - `ALLSTAR_VOTER_KEY_SECRET` 원문을 문서나 export에 넣지 않는다.
   - 그러나 원 프로젝트를 잃어도 기존 HMAC 문서 ID를 재현해야 하므로, 별도 보안 경계의 암호화 escrow 또는 별도 프로젝트 Secret Manager에 정확한 원문을 이중 승인으로 보관한다.
   - 사용 중인 Secret Manager version·접근 책임자와 함께 실제 복구를 시험한다.
6. **복원 리허설**
   - 운영 DB가 아닌 새 DB 또는 별도 프로젝트로 복원한다.
   - index·TTL·Security Rules·IAM·Functions 환경과 Secret version까지 다시 적용됐는지 확인한다.
   - 아래 검증을 통과하기 전 운영에 반영하지 않는다.

공식 참고 문서:

- [Cloud Firestore 예약 백업과 복원](https://firebase.google.com/docs/firestore/backups)
- [Cloud Firestore PITR](https://firebase.google.com/docs/firestore/pitr)
- [Cloud Firestore managed export/import](https://firebase.google.com/docs/firestore/manage-data/export-import)

복원 후 확인 항목:

- `ONCE_PER_EVENT`는 division별 ballot 수와 eligibility 수가 같은가
- `ONCE_PER_DAY`는 eligibility가 계정별 ledger이고 ballot이 날짜별로 누적된다는 관계가 맞는가
- 모든 올스타 ballot이 14 contest, 총 24명인가
- 후보 version과 candidateSetHash가 존재하는 후보 세트와 일치하는가
- config lock의 후보 ID/version/hash, 정책, timezone이 현재 닫힌 부문과 일치하고 fingerprint digest가 source manifest와 같은가
- 일반 contest 선택 합계가 유효 ballot 수와 같은가
- 외야 contest 선택 합계가 유효 ballot 수의 6배인가
- 정책, periodKey, localDate와 접수 시각 범위가 정상인가
- 공개 집계가 같은 후보 version/hash와 ballot 수를 사용하는가

## 장애 시 Google Forms 전환 원칙

Google Forms는 다음 두 경우에만 사용한다.

1. 투표 시작 전에 운영 회의가 Forms를 주 시스템으로 최종 선택한 경우
2. 기존 투표 라운드를 공식 무효화하고 새 라운드로 전체 재시작하는 경우

장애가 났다고 기존 AUBL 투표를 유지한 채 Forms를 동시에 열지 않는다. 불가피하게 전환할 때는 다음 순서를 따른다.

1. AUBL division을 `CLOSED`로 전환한다.
2. 마지막 정상 ballot 시각과 원장 수를 기록한다.
3. 기존 표의 인정 또는 전체 무효를 회의에서 결정한다.
4. 새 event/새 투표 기간으로 Forms를 연다.
5. 두 시스템 결과를 임의로 합산하지 않는다.

## 실제 오픈 전 완료 조건

- [x] 서버 후보 version/hash·선택 수·후보 자격·계정 중복 검증
- [x] ballot·eligibility 트랜잭션과 응답 유실 `submissionId` 복구
- [x] 첫 유효 ballot 트랜잭션의 config lock 생성과 이후 후보·정책·timezone·Secret fingerprint 불일치 fail-closed
- [x] 관리자 경량 관제·전체 무결성 검사·비식별 증적 다운로드
- [x] 닫힌 원장 기반 결과 초안 재생성·digest/generation 검증·공개/숨김
- [x] 예약 백업 상태/생성·닫힌 원장 export·복원 manifest 대조 도구
- [x] Firestore Emulator에서 config lock을 포함한 보호 원장의 브라우저 직접 접근 차단과 감사 claim 경계 검증
- [ ] 최종 후보 version/hash 확정
- [ ] 동일 Google 계정 동시 제출 리허설
- [ ] 제출 응답 유실 후 상태 복구 리허설
- [ ] 관리자 페이지의 ballot·eligibility·무결성 확인
- [ ] PITR 활성화와 복구 가능 시간 확인 — 실제 투표 오픈 직전에 수행
- [ ] 첫 `READY` 예약 백업 성공 확인
- [ ] 새 데이터베이스 복원 리허설과 수량/hash 검증
- [ ] 종료 직후 managed export 담당자와 위치 확정
- [ ] App Check enforcement, 오류율·백업 실패·집계 지연 알림의 실제 수신 시험

실행 명령과 담당자 기록 양식은 [`ALLSTAR_VOTING_OPERATIONS_CHECKLIST.md`](./ALLSTAR_VOTING_OPERATIONS_CHECKLIST.md)를 사용한다. 외부 프로젝트 오픈 게이트가 끝나기 전에는 “기술적으로 투표 접수 가능”과 “운영 준비 완료”를 구분해 공지한다.

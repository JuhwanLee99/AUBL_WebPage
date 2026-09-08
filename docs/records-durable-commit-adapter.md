# 영속 큐와 서버 커밋 계약 어댑터

작성일: 2026-09-08

## 이번 구현

`durableScoringCommitAdapter.ts`는 준비된 manifest를 영속 요청으로 고정하고 주입받은 transport에 전달한 뒤 검증된 ACK만 큐에 반영한다. 실제 callable·HTTP endpoint를 제공하거나 운영 writer를 교체하지 않는다.

- 테스트 실행 범위, 경기, 세션, epoch를 요청에 고정한다. UID는 요청의 인가 근거로 보내지 않고 서버 인증에서 확정되어야 한다.
- 정렬된 ASCII JSON과 SHA-256으로 manifest 해시를 만든다. 정수와 ASCII 키를 쓰는 해당 DTO만 지원하며 임의의 야구 사건 객체에 대한 범용 canonical 규격이라고 주장하지 않는다.
- 입력 범위와 기반 revision을 읽은 뒤 요청을 IndexedDB에 고정한다. 큐가 그 사이 변경되면 freeze의 충돌 검사가 거부한다.
- 같은 어댑터의 동시 flush는 하나의 Promise를 공유한다. 다른 탭·인스턴스의 전송 조정은 별도 소유권 계약이 필요하다.
- 복구한 payload의 범위·필드·해시·직렬화 원문을 다시 검사한 뒤 전송한다.
- ACK의 실행·경기·인증 UID·세션·epoch·요청·입력 범위·해시·revision을 모두 대조한다.
- 전송 오류나 ACK 불일치는 큐를 삭제하지 않는다. 일치할 때만 요청 범위의 영속 완료 처리를 수행한다.

## 미완료 연결

transport는 인터페이스를 주입받는다. 실제 인증된 API 호출과 Python 서버 인자 변환, manifest 생성·블록 업로드, 모달 사건·상태 스냅샷은 아직 연결하지 않았다. 큐와 어댑터가 같은 scope로 생성되도록 조립 계층이 보장해야 한다.

현재 권한 거부·네트워크 장애를 자동 분류해 block하는 로직, 재시도 타이머, 다중 탭 소유권, 종료 시 큐 비움·최종 봉인은 없다. 에러를 호출자에게 전달하고 원본을 유지한다. transport는 서버 응답의 진위를 보장하는 인증 채널이어야 한다. 필드 대조 자체는 인증이 아니다.

## 검증 상태

최초 구현 이후 타입 검사와 아래 브라우저 검증을 실행했다. 실제 authenticated endpoint 연결은 아직 검증하지 않았다.

기존 운영 writer·공개 화면·운영 데이터는 변경하지 않았다. `BLOCKED_BEFORE_LOGIN_BACKEND`를 유지한다.

## 후속 검증 결과

2026-09-08: `npm run typecheck` 통과. 실제 Chrome·IndexedDB·Web Crypto와 Python 서버 `_digest`를 사용한 **브라우저 테스트 7건 통과, 실패·제외 0건**이다.

- 실제 manifest DTO 및 별도 문자열 probe의 canonical JSON·해시를 Python과 대조했다. 별도 probe는 한글·surrogate pair·DEL·escape·최대 안전 정수의 직렬화 검사이며 해당 문자열을 실제 규칙 버전으로 허용한다는 뜻은 아니다.
- 첫 ACK를 보류한 동안 두 번째 입력을 영속 접수하고, 첫 ACK는 첫 입력만 제거하는지 확인했다.
- 같은 어댑터의 동시 flush는 한 번의 전송과 같은 Promise를 사용했다.
- 스텁 transport가 영수증 생성 후 오류를 반환하도록 하고, 재시도 payload가 바이트 단위로 동일하며 논리적 영수증이 하나인지 확인했다.
- 다른 UID·세션·epoch·실행·해시의 ACK를 거부하고 입력을 보존했다.
- 새 큐·어댑터 인스턴스로 기존 pending을 복구하여 같은 요청을 전송했다.
- 앞선 서버 head를 받으면 남은 입력을 보존하고 후속 전송을 차단했다. 빈 큐는 전송하지 않았다.

위 항목들은 7개 테스트에 포함된 subcase이며 수를 따로 합산하지 않는다. 실제 네트워크 응답 유실·Firebase callable·모달 연결을 검증한 것은 아니다. 기존 큐 테스트 10건 및 Firestore 회귀를 이번 실행에서 다시 돌리지 않았으므로 과거 결과를 신규 통과 수로 합산하지 않는다.

브라우저 결과는 `outputs/durable-commit-adapter-browser/2026-09-08T13-02-02.955Z/summary.json`, 타입 검사·실행 로그는 `outputs/durable-commit-adapter-validation-2026-09-08/`에 보존했다. 외부 요청을 차단한 일회성 브라우저 context를 사용하고 종료했다. 운영 접근·배포·writer 교체는 없었다.

후속 과제는 큐와 어댑터의 scope 조립 검증, 탭 소유권, 실제 사건·상태·중계의 manifest 구성, 인증된 서버 transport와의 종합 연결이다. 전체 규칙 의미 검증과 운영 진입 조건도 계속 남아 있다.

# 팀 소속 UID 데이터 점검 절차

팀 소속 조회는 `teams/{teamId}/members/{uid}` 문서의 `uid` 필드만 사용한다. collection-group 쿼리에서 bare UID를 `documentId()`와 비교하는 방식은 전체 문서 경로가 필요한 Firestore 동작과 맞지 않아 사용하지 않는다.

## 배포 전 순서

1. 운영 Firebase 프로젝트 ID를 확인한다.
2. Application Default Credentials가 읽기 권한만 가진 상태에서 dry-run을 실행한다.

```bash
node scripts/backfill_member_uids.mjs --project PROJECT_ID > .tmp/member-uid-audit.json
```

3. 결과의 `missingUid`, `mismatchedUid`, `duplicateMemberships`를 검토한다.
4. 불일치와 중복 소속은 팀 담당자가 직접 정리한다. 도구는 이를 자동으로 수정하지 않는다.
5. 누락 UID만 보정할 때 프로젝트를 다시 입력해 실행한다.

```bash
node scripts/backfill_member_uids.mjs \
  --project PROJECT_ID \
  --execute \
  --confirm-project PROJECT_ID \
  > .tmp/member-uid-backfill.json
```

6. 다시 dry-run하여 세 목록이 모두 비었는지 확인한 다음 프런트엔드를 배포한다.

중복 소속이 감지되면 런타임은 임의의 팀 권한을 고르지 않고 소속 기반 권한 부여를 중단한다. 신규 팀원 저장 경로는 문서 ID와 동일한 `uid` 필드를 이미 기록한다. 추가된 UID 필드는 호환 가능한 보정이므로 코드 롤백 때 삭제하지 않는다.

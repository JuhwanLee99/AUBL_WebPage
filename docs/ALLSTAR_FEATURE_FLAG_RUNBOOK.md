# 올스타 기능 공개 플래그 운영 런북

## 목적

올스타 구현은 코드베이스에 유지하되 운영 기본값은 비공개다. `publicFeatureFlags/allstar`가 서버에서 검증된 정확한 `true`일 때만 공개 화면을 연다. 문서가 없거나 형식이 잘못됐거나 읽기에 실패하면 메뉴·배너·직접 주소와 공개 callable을 모두 차단한다.

전역 공개 플래그와 실제 투표 상태는 서로 다른 잠금이다.

- 전역 플래그 ON: 올스타 페이지 공개를 허용한다.
- 이벤트와 부문 `enabled=true`, `status=OPEN`: 실제 투표 접수를 허용한다.
- 따라서 전역 플래그만 켜서는 투표가 시작되지 않는다.

## 데이터와 권한

공개 상태 문서:

```text
publicFeatureFlags/allstar
  schemaVersion: 1
  enabled: false
  revision: 1
  updatedAt: server timestamp
```

변경 감사 문서는 `featureFlagAudit/{autoId}`에 저장한다. 공개 상태 문서에는 관리자 식별자를 넣지 않고, 감사 문서에만 변경 전후 상태·revision·관리자 UID·사유·시각을 저장한다.

- 모든 클라이언트: 공개 상태 읽기만 가능
- 관리자 클라이언트: 감사 이력 읽기만 가능
- 모든 브라우저: 상태와 감사 이력 쓰기 금지
- 관리자 callable: Admin SDK transaction으로만 상태 변경

## 첫 배포

1. `.firebaserc`, Hosting workflow와 운영 환경의 `VITE_FIREBASE_PROJECT_ID`가 같은 프로젝트를 가리키는지 확인한다.
2. Rules와 Functions를 먼저 배포한다.
3. `/admin/allstar-voting`에서 `기본 OFF 상태 저장`을 실행하거나 Firebase Console에서 위 문서를 `enabled=false`, `revision=1`로 만든다.
4. 익명 상태에서 `/allstar`, 공유 로스터 URL, 후보·결과 callable이 차단되는지 확인한다.
5. Hosting을 배포하고 메인 배너·상단/모바일 메뉴가 보이지 않는지 확인한다.

문서 생성이 누락되어도 코드는 OFF로 동작한다. 다만 운영 상태를 명시하고 revision 기반 관리자 변경을 시작하기 위해 false 문서를 생성한다.

## 공개 전환

1. 운영 프로젝트와 현재 Hosting/Functions revision을 기록한다.
2. 후보 세트, 이벤트 문서, 개인정보 고지, Secret과 callable 상태를 확인한다.
3. 이벤트와 모든 부문의 `enabled=false`를 유지한다.
4. 관리자 페이지에서 `공개 기능 켜기`를 누르고 `올스타 기능 공개`를 입력한다.
5. 페이지·후보·결과 화면을 확인한다.
6. 투표를 진행할 때만 이벤트와 해당 부문의 접수 상태를 별도 절차로 연다.

공유 OG 문서는 런타임 플래그로 바뀌지 않는다. 캠페인 공유 미리보기가 필요할 때만 `ALLSTAR_STATIC_PAGES_ENABLED=true`로 별도 Hosting 빌드·배포한다.

## 정상 종료 및 긴급 중지

관리자 페이지의 `공개 및 접수 중지`는 다음을 한 transaction으로 처리한다.

1. 전역 공개 플래그를 OFF로 변경
2. 이벤트 `enabled=false`
3. 모든 부문 `enabled=false`
4. revision 증가 및 감사 로그 생성

OFF 이후 다시 공개 기능을 켜도 이벤트 접수는 자동으로 복구되지 않는다. 장애가 해결된 뒤 후보 버전·원장·기간을 확인하고 접수를 별도로 열어야 한다.

관리자 페이지를 사용할 수 없으면 Firebase Console 또는 Admin SDK로 `publicFeatureFlags/allstar.enabled=false`를 설정하거나 문서를 삭제한다. 문서 삭제도 OFF로 처리된다. 투표 원장·eligibility·결과 문서는 삭제하지 않는다.

## 배포 및 검증 명령

```bash
PYTHONPATH=functions functions/venv/bin/python -m unittest discover -s functions/tests -p 'test_*.py'
npm run test:allstar:rules
npm run lint
npm run typecheck
npm run build
```

기본 운영 빌드에서는 `dist/allstar/index.html`이 없어야 한다. 실제 캠페인 공개 빌드에서만 다음 값을 사용한다.

```bash
ALLSTAR_STATIC_PAGES_ENABLED=true OG_BASE_URL=https://aubl.club npm run build
```

## 롤백

1. 가장 먼저 전역 플래그를 OFF로 설정한다.
2. 이벤트와 모든 부문의 `enabled=false`를 확인한다.
3. Hosting을 이전 release로 되돌린다.
4. 필요하면 올스타 Functions를 이전 revision으로 되돌린다.
5. 변경 전후 revision, 시각, 원장 수량과 조치 결과를 운영 기록에 남긴다.

코드 롤백 여부와 관계없이 투표 원본은 보존한다. 복구 후 재공개는 자동으로 하지 않는다.

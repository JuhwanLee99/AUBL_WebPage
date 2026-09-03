# Firestore 공통 예약 백업 운영 런북

## 범위

`scripts/firestore_backup_dr.py`는 특정 기능이나 컬렉션에 의존하지 않고 Firestore 데이터베이스의 일일 예약 백업을 점검한다. PITR 설정은 조회하거나 변경하지 않으며, 생성 명령은 기본적으로 dry-run이다.

현재 저장소의 `.firebaserc`와 Hosting workflow에 서로 다른 프로젝트 ID가 기록된 적이 있으므로, 아래 예시의 `PROJECT_ID`를 그대로 추측해서 바꾸지 않는다. Firebase Console의 운영 앱 설정, 실제 배포 workflow와 `VITE_FIREBASE_PROJECT_ID`를 대조해 담당자 두 명이 같은 프로젝트·데이터베이스임을 확인한 뒤 기록한다.

## 1. 변경 없는 계획 확인

```bash
python3 scripts/firestore_backup_dr.py backup-plan \
  --project PROJECT_ID \
  --database '(default)' \
  --location asia-northeast3 \
  --retention 14d
```

출력된 프로젝트, 데이터베이스, 위치와 명령을 검토한다. 이 단계는 외부 상태를 바꾸지 않는다.

## 2. 현재 상태 확인

```bash
python3 scripts/firestore_backup_dr.py backup-status \
  --project PROJECT_ID \
  --database '(default)' \
  --location asia-northeast3 \
  --max-ready-age-hours 48 \
  --output ./.tmp/firestore-backup-status.json
```

다음 조건을 모두 만족하면 종료 코드가 0이다.

- 일일 schedule이 하나 이상 존재
- 최근 `READY` 백업이 존재
- 최근 백업이 설정한 시간보다 오래되지 않음
- `FAILED` 등 비정상 상태의 백업이 없음

상태 JSON은 운영 증적이지 데이터 백업 자체가 아니다.

## 3. schedule이 없을 때만 생성

먼저 dry-run으로 명령을 확인한다.

```bash
python3 scripts/firestore_backup_dr.py create-daily-backup \
  --project PROJECT_ID \
  --database '(default)' \
  --location asia-northeast3 \
  --retention 14d
```

프로젝트가 맞고 기존 daily schedule이 없을 때만 실행한다. `--confirm-project`는 오탈자까지 포함해 프로젝트와 정확히 일치해야 한다.

```bash
python3 scripts/firestore_backup_dr.py create-daily-backup \
  --project PROJECT_ID \
  --database '(default)' \
  --location asia-northeast3 \
  --retention 14d \
  --execute \
  --confirm-project PROJECT_ID
```

생성 직후에는 아직 `READY` 백업이 없을 수 있으므로 성공으로 간주하지 않는다. 첫 백업이 `READY`가 된 뒤 상태 검사를 다시 실행한다.

## 4. 운영 기준과 복원 검증

- 상태 검사를 하루 한 번 실행하고 종료 코드 2를 담당자에게 알린다.
- 최소 권한 IAM을 사용하고 schedule resource 이름과 생성 시각을 기록한다.
- 백업을 운영 `(default)` 데이터베이스 위에 덮지 않고 별도의 named database로 복원한다.
- 핵심 컬렉션 문서 수, 표본 문서 checksum과 애플리케이션 조회를 대조한다.
- 실제 복원 소요시간과 복원 가능한 최신 시점을 기록해 RTO/RPO를 측정한다.
- PITR는 별도의 승인된 오픈 절차 전에는 변경하지 않는다.

## 롤백

schedule 생성이 잘못되었다면 생성 때 기록한 정확한 schedule resource만 삭제한다. 기존 백업은 보존하고 앱 데이터나 스키마는 되돌리지 않는다. 삭제 전 프로젝트·DB와 다른 schedule의 존재 여부를 다시 확인한다.

#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
ARTIFACT=$(mktemp -d /tmp/aubl-v25-rollback.XXXXXX)
PREFIX="aubl-v25-rollback-$$"
NETWORK="$PREFIX-network"
DB="$PREFIX-db"
AUTH="$PREFIX-auth"
FIRESTORE="$PREFIX-firestore"
SEED="$PREFIX-seed"
OLD_IMAGE='sha256:e10d8890bcd42258dfbab18892cbc0204203275f1208822f5bd50fefc0731cb4'
NEW_IMAGE='sha256:ea0b89d7740e3a3f1a2592eecfb360e3d49314a0ed6e1381b3c58f96b959b62d'
TEST_IMAGE='sha256:b968ae08905e5241cd1fcb65c8e98fa46c0cb69fdd1da94f9d8bb864ebce34d2'
AUTH_IMAGE='sha256:e2f088ff3c91ee6d7b2fab1ba6b2c7d86e460bb4819af739276be8261b9dba45'
FIRESTORE_JAR='/Users/juhwan/.cache/firebase/emulators/cloud-firestore-emulator-v1.21.0.jar'
CREATED=()
NETWORK_CREATED=0
PHASE='preflight'
d() { docker --context desktop-linux "$@"; }

finish() {
  RESULT=$?
  trap - EXIT
  set +e
  CLEANED=true
  for container in "${CREATED[@]}"; do d logs "$container" > "$ARTIFACT/$container.log" 2>&1; done
  if [ "${#CREATED[@]}" -gt 0 ]; then
    d rm -f "${CREATED[@]}" > "$ARTIFACT/cleanup.log" 2>&1 || CLEANED=false
  fi
  if [ "$NETWORK_CREATED" = 1 ]; then
    d network rm "$NETWORK" >> "$ARTIFACT/cleanup.log" 2>&1 || CLEANED=false
  fi
  rm -f "$ARTIFACT/runtime/firebase-emulator-only.json"
  if [ "$CLEANED" != true ]; then RESULT=1; fi
  node --input-type=module - "$ARTIFACT" "$RESULT" "$CLEANED" "$PHASE" "$ROOT" <<'NODE'
import fs from 'node:fs';
import { createHash } from 'node:crypto';
const [artifacts, result, cleaned, lastPhase, root] = process.argv.slice(2);
const phases = ['new-before', 'v25', 'new-after'];
const completed = phases.filter((phase) => fs.existsSync(`${artifacts}/${phase}.complete`));
const passed = Number(result) === 0 && cleaned === 'true' && completed.length === 3;
const summary = { status: passed ? 'PASSED_V25_ON_V7_READ_ROUNDTRIP' : 'FAILED_OR_INCOMPLETE',
  executedAt: new Date().toISOString(), lastPhase, completedPhases: completed,
  cleanupSucceeded: cleaned === 'true', exitCode: Number(result), productionAccess: false, artifacts };
if (fs.existsSync(`${artifacts}/baseline.sql`)) {
  summary.baselineSha256 = createHash('sha256').update(fs.readFileSync(`${artifacts}/baseline.sql`)).digest('hex');
}
fs.writeFileSync(`${artifacts}/result.json`, JSON.stringify(summary, null, 2));
const report = `# V7 DB에서 v25 백엔드 읽기 복귀 검증\n\n` +
  `- 판정: ${summary.status}\n- 실행 시각(UTC): ${summary.executedAt}\n` +
  `- 완료 단계: ${completed.join(', ') || '없음'}\n- 마지막 단계: ${lastPhase}\n` +
  `- 자원 정리 성공: ${summary.cleanupSucceeded}\n- 증거: \`${artifacts}\` (임시 위치)\n` +
  `- 합성 DB 기준 덤프 SHA-256: \`${summary.baselineSha256 ?? '기준 덤프 생성 전 중단'}\`\n\n` +
  `## 시험 구성\n\n실제 배포용 신규 이미지 → 기존 v25 이미지 → 신규 이미지 순서의 3단계 시나리오다. 성공한 단계만 위 완료 목록에 포함한다. ${passed ? '세 단계 모두 기동·조회·동일성 확인을 완료했다.' : '실패 또는 미완료이므로 복귀 가능 판정을 내리지 않는다.'}\n\n` +
  `새 버전의 기존 전체 흐름 테스트로 MariaDB 11.8.5의 V7 DB에 합성 수집·게시 데이터를 만든다. 여기에 범위 컬럼이 NULL인 구형 형태의 run 1건을 추가한다. 이 NULL 행은 V7 적용 후 만든 호환 자료이며 운영에서 이관한 행이 아니다. 실제 마이그레이션 이전 행의 보존 시험과 구분한다.\n\n` +
  `각 배포 이미지의 원래 JAR·기본 진입점을 사용한다. Firebase 서비스 계정 파일은 로컬에서 만든 가짜 RSA 키와 demo 프로젝트만 사용하며 운영 자격 증명이 아니다. Auth 에뮬레이터에서 발급한 관리자 ID 토큰으로 실제 보안 필터·HTTP API를 통과한다.\n\n` +
  `Flyway 이력 삭제·repair·future migration 무시 옵션의 추가 없이 실행한다. Hibernate DDL은 none이며 운영의 PhysicalNamingStrategyStandardImpl을 유지한다. 네트워크는 Docker internal이고 호스트 포트를 공개하지 않는다.\n\n` +
  `## 통과 조건\n\n- 각 버전의 기동 및 익명 관리자 요청 거부.\n` +
  `- 범위 값이 있는 run과 NULL인 run 등 3건을 관리자 API로 읽고 DB의 checksum·상태와 대조.\n` +
  `- 각 run의 경기 기록 검수 API를 읽고 검수 checksum 및 공통 응답을 신규 버전 기준선과 비교.\n` +
  `- 각 단계 종료 후 전체 합성 DB 논리 덤프를 바이트 단위로 비교하여 원본·범위 컬럼·Flyway 이력 등 불변 확인.\n` +
  `- Firestore의 공식 메타데이터와 경기 2건을 기존 활성 revision 및 최초 응답과 비교.\n` +
  `- 임시 컨테이너·네트워크 및 가짜 서비스 계정 파일 정리.\n\n` +
  `## 판정 한계\n\n이 시험은 읽기 전용 복귀와 신규 버전 재기동의 호환성이다. v25의 신규 수집·정정·게시·활성화는 수행하지 않으며 구형 writer를 다시 허용하는 근거가 아니다. 운영 데이터에 대한 백업 복원, 장애 중 부분 마이그레이션 복구, 공식 리비전 변경 복구, NAS·원천 수집 성공 및 RPO/RTO를 검증한 것이 아니다.\n\n` +
  `통과하더라도 기존 run과 쓰기 차단을 유지한 채 읽기 복귀를 검토할 수 있을 뿐, 운영 백업·설정·정확한 롤백 대상과 별도 승인이 필요하다. 운영 API·DB 접근, push·배포는 하지 않았다.\n\n` +
  `재실행: \`bash scripts/test-uniqueplay-v25-rollback.sh\`. 사용한 이미지 ID는 스크립트와 실행 증거에 고정된다.\n`;
fs.writeFileSync(`${root}/docs/release/uniqueplay-v25-v7-rollback-verification-2026-09-12.md`, report);
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
if (!passed) process.exitCode = 1;
NODE
  REPORT_RESULT=$?
  if [ "$RESULT" = 0 ] && [ "$REPORT_RESULT" != 0 ]; then RESULT=1; fi
  printf 'Evidence retained: %s\n' "$ARTIFACT"
  exit "$RESULT"
}
trap finish EXIT
printf 'Evidence: %s\n' "$ARTIFACT"
mkdir "$ARTIFACT/runtime"
test -f "$FIRESTORE_JAR"
d image inspect "$OLD_IMAGE" "$NEW_IMAGE" "$TEST_IMAGE" "$AUTH_IMAGE" \
  --format '{"id":{{json .Id}},"os":{{json .Os}},"architecture":{{json .Architecture}}}' > "$ARTIFACT/images.jsonl"
node --input-type=module - "$ARTIFACT" <<'NODE'
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
const artifacts = process.argv[2];
const images = fs.readFileSync(`${artifacts}/images.jsonl`, 'utf8').trim().split('\n').map(JSON.parse);
assert.equal(images.length, 4);
for (const image of images) { assert.equal(image.os, 'linux'); assert.equal(image.architecture, 'amd64'); }
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
fs.writeFileSync(`${artifacts}/runtime/firebase-emulator-only.json`, JSON.stringify({
  type: 'service_account', project_id: 'demo-aubl-scoped-full', private_key_id: 'emulator-only',
  private_key: privateKey, client_email: 'fixture@demo-aubl-scoped-full.iam.gserviceaccount.com',
  client_id: '123456789012345678901', token_uri: 'http://auth:9099/emulator-only-token',
}));
NODE
cp "$ROOT/scripts/test-uniqueplay-v25-rollback-probe.mjs" "$ARTIFACT/runtime/probe.mjs"
d network create --internal "$NETWORK" > "$ARTIFACT/network-id.txt"
NETWORK_CREATED=1
d run -d --name "$DB" --network "$NETWORK" --network-alias scope-db \
  --tmpfs /var/lib/mysql -e MARIADB_ALLOW_EMPTY_ROOT_PASSWORD=1 -e MARIADB_DATABASE=scope_full \
  mariadb:11.8.5 > "$ARTIFACT/db-id.txt"
CREATED+=("$DB")
d run -d --platform linux/amd64 --name "$AUTH" --network "$NETWORK" --network-alias auth \
  --mount "type=bind,src=$ARTIFACT/runtime,dst=/rollback-fixture,readonly" \
  "$AUTH_IMAGE" > "$ARTIFACT/auth-id.txt"
CREATED+=("$AUTH")
d run -d --platform linux/amd64 --name "$FIRESTORE" --network "$NETWORK" --network-alias firestore \
  --mount "type=bind,src=$FIRESTORE_JAR,dst=/emulator.jar,readonly" --entrypoint java \
  "$TEST_IMAGE" -jar /emulator.jar --host 0.0.0.0 --port 8080 \
  --project_id demo-aubl-scoped-full --single_project_mode true --single_project_mode_error true > "$ARTIFACT/firestore-id.txt"
CREATED+=("$FIRESTORE")
PHASE='emulator-startup'
READY=0
for attempt in $(seq 1 60); do
  if d exec "$DB" mariadb-admin ping --silent >/dev/null 2>&1 \
    && d exec "$FIRESTORE" bash -c 'echo > /dev/tcp/127.0.0.1/8080' >/dev/null 2>&1 \
    && d exec "$AUTH" node -e 'const s=require("net").connect(9099,"127.0.0.1");s.setTimeout(1000);s.on("connect",()=>{s.end();process.exit(0)});s.on("error",()=>process.exit(1));s.on("timeout",()=>process.exit(1));' >/dev/null 2>&1; then READY=1; break; fi
  sleep 1
done
test "$READY" = 1
PHASE='seed-full-flow'
# Create first, so a failed seed execution is still included in cleanup.
d create --platform linux/amd64 --name "$SEED" --network "$NETWORK" \
  -e AUBL_SCOPED_DB_HOST=scope-db -e FIREBASE_AUTH_EMULATOR_HOST=auth:9099 \
  -e FIRESTORE_EMULATOR_HOST=firestore:8080 -e GCLOUD_PROJECT=demo-aubl-scoped-full \
  -e SPRING_JPA_HIBERNATE_NAMING_PHYSICAL_STRATEGY=org.hibernate.boot.model.naming.PhysicalNamingStrategyStandardImpl \
  "$TEST_IMAGE" > "$ARTIFACT/seed-id.txt"
CREATED+=("$SEED")
d start -a "$SEED" > "$ARTIFACT/seed.log" 2>&1
test "$(d inspect "$SEED" --format '{{.State.ExitCode}}')" = 0
d cp "$SEED:/app/build/test-results/test" "$ARTIFACT/seed-test-results" >/dev/null
node --input-type=module - "$ARTIFACT" <<'NODE'
import fs from 'node:fs';
import assert from 'node:assert/strict';
const xml = fs.readFileSync(`${process.argv[2]}/seed-test-results/TEST-com.aubl.webpage.service.UniquePlayFullFlowTest.xml`, 'utf8');
const suite = xml.match(/<testsuite\b([^>]*)>/);
assert.ok(suite);
const attributes = Object.fromEntries([...suite[1].matchAll(/([\w.-]+)="([^"]*)"/g)].map((match) => [match[1], match[2]]));
assert.equal(attributes.tests, '1');
for (const key of ['failures', 'errors', 'skipped']) assert.equal(attributes[key], '0');
NODE
PHASE='baseline'
d exec "$DB" mariadb -uroot scope_full -e "INSERT INTO UNIQUEPLAY_SYNC_RUN(run_id,season_year,league_id,status,candidate_json,checksum,created_by) SELECT 'compat-legacy-null',season_year,league_id,'REVIEW_REQUIRED',candidate_json,checksum,'isolated-test' FROM UNIQUEPLAY_SYNC_RUN ORDER BY created_at,run_id LIMIT 1;"
d exec "$DB" mariadb -uroot --batch --skip-column-names scope_full -e "SELECT run_id,checksum,status,COALESCE(sync_mode,'<NULL>'),COALESCE(CAST(sync_from_date AS CHAR),'<NULL>') FROM UNIQUEPLAY_SYNC_RUN ORDER BY run_id;" > "$ARTIFACT/runtime/runs.tsv"
d exec "$DB" mariadb -uroot --batch --skip-column-names scope_full -e 'SELECT revision_id FROM UNIQUEPLAY_SYNC_REVISION WHERE active=1 AND season_year=2026 ORDER BY revision_id;' > "$ARTIFACT/runtime/active-revision.txt"
d exec "$DB" mariadb -uroot --batch --skip-column-names scope_full -e 'SELECT version,success FROM flyway_schema_history ORDER BY installed_rank; SELECT @@version,@@lower_case_table_names;' > "$ARTIFACT/schema-baseline.tsv"
dump_db() { d exec "$DB" mariadb-dump -uroot --single-transaction --quick --skip-comments --order-by-primary --hex-blob scope_full; }
dump_db > "$ARTIFACT/baseline.sql"

for PHASE in new-before v25 new-after; do
  APP="$PREFIX-$PHASE"
  IMAGE="$NEW_IMAGE"
  if [ "$PHASE" = v25 ]; then IMAGE="$OLD_IMAGE"; fi
  d run -d --platform linux/amd64 --name "$APP" --network "$NETWORK" --network-alias "$PHASE" \
    --mount "type=bind,src=$ARTIFACT/runtime/firebase-emulator-only.json,dst=/fixture-firebase.json,readonly" \
    -e SPRING_DATASOURCE_URL=jdbc:mariadb://scope-db:3306/scope_full \
    -e SPRING_DATASOURCE_USERNAME=root -e SPRING_DATASOURCE_PASSWORD= \
    -e SPRING_CONFIG_IMPORT= -e SPRING_JPA_HIBERNATE_DDL_AUTO=none \
    -e SPRING_FLYWAY_BASELINE_ON_MIGRATE=false \
    -e SPRING_JPA_HIBERNATE_NAMING_PHYSICAL_STRATEGY=org.hibernate.boot.model.naming.PhysicalNamingStrategyStandardImpl \
    -e FIREBASE_CREDENTIALS_PATH=/fixture-firebase.json -e GOOGLE_CLOUD_PROJECT=demo-aubl-scoped-full \
    -e GCLOUD_PROJECT=demo-aubl-scoped-full -e FIREBASE_AUTH_EMULATOR_HOST=auth:9099 \
    -e FIRESTORE_EMULATOR_HOST=firestore:8080 -e UNIQUEPLAY_WORKER_URL=http://127.0.0.1:9 \
    -e UNIQUEPLAY_WORKER_TOKEN=fixture-worker-token -e SERVER_PORT=8080 \
    "$IMAGE" > "$ARTIFACT/$PHASE-container-id.txt"
  CREATED+=("$APP")
  if ! d exec "$AUTH" node /rollback-fixture/probe.mjs "$PHASE" > "$ARTIFACT/runtime/$PHASE.json" 2> "$ARTIFACT/$PHASE-probe-error.log"; then
    cat "$ARTIFACT/$PHASE-probe-error.log"
    d logs "$APP" 2>&1 | tail -65
    exit 1
  fi
  d stop --timeout 30 "$APP" > "$ARTIFACT/$PHASE-stop.log"
  dump_db > "$ARTIFACT/$PHASE.sql"
  if ! cmp -s "$ARTIFACT/baseline.sql" "$ARTIFACT/$PHASE.sql"; then
    printf 'FAIL: database snapshot changed during %s\n' "$PHASE" >&2
    exit 1
  fi
  printf 'PASS: %s secured HTTP, authenticated reads, official projection and full DB unchanged\n' "$PHASE"
  printf 'completed\n' > "$ARTIFACT/$PHASE.complete"
done
PHASE='roundtrip-complete'

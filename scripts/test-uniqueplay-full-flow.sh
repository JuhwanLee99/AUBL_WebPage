#!/usr/bin/env bash
set -euo pipefail
prefix="aubl-full-flow-$$"
network="$prefix-network"
db="$prefix-db"
firestore="$prefix-firestore"
auth="$prefix-auth"
runner="$prefix-runner"
artifacts=$(mktemp -d /tmp/aubl-full-flow.XXXXXX)
emulator=${FIRESTORE_EMULATOR_JAR:-/Users/juhwan/.cache/firebase/emulators/cloud-firestore-emulator-v1.21.0.jar}
test -f "$emulator"
d() { docker --context desktop-linux "$@"; }
cleanup() {
  d logs "$firestore" > "$artifacts/firestore.log" 2>&1 || true
  d logs "$db" > "$artifacts/mariadb.log" 2>&1 || true
  d logs "$auth" > "$artifacts/auth.log" 2>&1 || true
  printf 'Logs preserved: %s\n' "$artifacts"
  d rm -f "$runner" "$auth" "$firestore" "$db" >/dev/null 2>&1 || true
  d network rm "$network" >/dev/null 2>&1 || true
}
trap cleanup EXIT
d network create --internal "$network" >/dev/null
d run -d --platform linux/amd64 --name "$auth" --network "$network" --network-alias auth \
  aubl-auth-emulator:15.17.0 >/dev/null
d run -d --name "$db" --network "$network" --network-alias scope-db \
  --tmpfs /var/lib/mysql -e MARIADB_ALLOW_EMPTY_ROOT_PASSWORD=1 \
  -e MARIADB_DATABASE=scope_full mariadb:11.8.5 >/dev/null
d run -d --platform linux/amd64 --name "$firestore" --network "$network" --network-alias firestore \
  --mount "type=bind,src=$emulator,dst=/emulator.jar,readonly" --entrypoint java \
  aubl-backend:full-flow-test-20260912 -jar /emulator.jar --host 0.0.0.0 --port 8080 \
  --project_id demo-aubl-scoped-full --single_project_mode true --single_project_mode_error true >/dev/null
ready=0
for attempt in $(seq 1 60); do
  if d exec "$db" mariadb-admin ping --silent >/dev/null 2>&1 && \
     d exec "$firestore" bash -c ': >/dev/tcp/127.0.0.1/8080' >/dev/null 2>&1 && \
     d exec "$auth" node -e 'const s=require("net").connect(9099,"127.0.0.1");s.setTimeout(1000);s.on("connect",()=>{s.end();process.exit(0)});s.on("error",()=>process.exit(1));s.on("timeout",()=>process.exit(1));' >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
if [ "$ready" != 1 ]; then
  printf 'FAIL: isolated database, Auth or Firestore emulator was not ready; preserving startup logs.\n' >&2
  exit 1
fi
set +e
d run --platform linux/amd64 --name "$runner" --network "$network" \
  -e AUBL_SCOPED_DB_HOST=scope-db \
  -e FIRESTORE_EMULATOR_HOST=firestore:8080 \
  -e FIREBASE_AUTH_EMULATOR_HOST=auth:9099 \
  -e GCLOUD_PROJECT=demo-aubl-scoped-full \
  -e SPRING_JPA_HIBERNATE_NAMING_PHYSICAL_STRATEGY=org.hibernate.boot.model.naming.PhysicalNamingStrategyStandardImpl \
  aubl-backend:full-flow-test-20260912 > "$artifacts/gradle.log" 2>&1
result=$?
set -e
d cp "$runner:/app/build/test-results/test" "$artifacts/test-results" >/dev/null
d logs "$firestore" > "$artifacts/firestore.log" 2>&1
tail -50 "$artifacts/gradle.log"
printf 'Evidence: %s\n' "$artifacts"
if [ "$result" -eq 0 ]; then
  python3 - "$artifacts/test-results" <<'PY'
import pathlib, sys, xml.etree.ElementTree as ET
files=list(pathlib.Path(sys.argv[1]).glob('TEST-*.UniquePlayFullFlowTest.xml'))
assert len(files)==1, 'Missing full-flow report'
r=ET.parse(files[0]).getroot()
assert int(r.get('tests','0'))==1 and all(int(r.get(k,'0'))==0 for k in ['failures','errors','skipped']), r.attrib
print('PASS: full Spring application, two collection/publication cycles, MariaDB and Firestore emulator; no skipped test')
PY
fi
cleanup
trap - EXIT
for c in "$runner" "$auth" "$firestore" "$db"; do
  if d container inspect "$c" >/dev/null 2>&1; then printf 'FAIL: remaining test container %s\n' "$c" >&2; exit 1; fi
done
if d network inspect "$network" >/dev/null 2>&1; then printf 'FAIL: remaining test network\n' >&2; exit 1; fi
printf 'Test containers and isolated network removed; no production access.\n'
exit "$result"

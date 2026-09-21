#!/usr/bin/env bash
set -euo pipefail

# Only the test runner and disposable MariaDB join this internal Docker network.
prefix="aubl-scoped-db-$$"
network="$prefix-network"
db="$prefix-mariadb"
runner="$prefix-runner"
artifacts=$(mktemp -d /tmp/aubl-db-integration.XXXXXX)
d() { docker --context desktop-linux "$@"; }
cleanup() {
  d rm -f "$runner" "$db" >/dev/null 2>&1 || true
  d network rm "$network" >/dev/null 2>&1 || true
}
trap cleanup EXIT
d network create --internal "$network" >/dev/null
d run -d --name "$db" --network "$network" --network-alias scope-db \
  --tmpfs /var/lib/mysql -e MARIADB_ALLOW_EMPTY_ROOT_PASSWORD=1 mariadb:11.8.5 >/dev/null
ready=0
for attempt in $(seq 1 60); do
  if d exec "$db" mariadb-admin ping --silent >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
test "$ready" = 1
d exec "$db" mariadb -uroot -e 'CREATE DATABASE scope_upgrade; CREATE DATABASE scope_jpa;'
set +e
d run --platform linux/amd64 --name "$runner" --network "$network" \
  -e AUBL_SCOPED_DB_HOST=scope-db \
  -e SPRING_JPA_HIBERNATE_NAMING_PHYSICAL_STRATEGY=org.hibernate.boot.model.naming.PhysicalNamingStrategyStandardImpl \
  aubl-backend:isolated-db-test-20260912 > "$artifacts/gradle.log" 2>&1
result=$?
set -e
d cp "$runner:/app/build/test-results/test" "$artifacts/test-results" >/dev/null
tail -45 "$artifacts/gradle.log"
printf 'Evidence: %s\n' "$artifacts"
if [ "$result" -eq 0 ]; then
  python3 - "$artifacts/test-results" <<'PY'
import pathlib, sys, xml.etree.ElementTree as ET
root = pathlib.Path(sys.argv[1])
for name in ['UniquePlayFlywayMariaDbTest', 'UniquePlayMariaDbIntegrationTest']:
    files = list(root.glob('TEST-*.' + name + '.xml'))
    assert len(files) == 1, (name, 'missing test report')
    suite = ET.parse(files[0]).getroot()
    assert int(suite.get('tests', '0')) == 1, (name, 'test not executed')
    assert all(int(suite.get(k, '0')) == 0 for k in ['failures', 'errors', 'skipped']), suite.attrib
    print('PASS:', name, 'executed, no failures/errors/skips')
PY
fi
cleanup
trap - EXIT
for container in "$runner" "$db"; do
  if d container inspect "$container" >/dev/null 2>&1; then
    printf 'FAIL: test container remains: %s\n' "$container" >&2
    exit 1
  fi
done
if d network inspect "$network" >/dev/null 2>&1; then
  printf 'FAIL: test network remains\n' >&2
  exit 1
fi
printf 'Disposable containers and internal network removed; no production connection.\n'
exit "$result"

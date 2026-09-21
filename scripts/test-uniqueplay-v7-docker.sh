#!/usr/bin/env bash
set -euo pipefail

# Disposable local-only database: no published ports, network, or persistent volume.
backend=${1:-/Users/juhwan/Documents/Dev/AUBL/AUBL_WebPage_BE-test}
name="aubl-v7-isolated-$$"
tmp=$(mktemp -d /tmp/aubl-v7-check.XXXXXX)
docker_local() { docker --context desktop-linux "$@"; }
cleanup() { docker_local rm -f "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT

awk '/^CREATE TABLE IF NOT EXISTS UNIQUEPLAY_SYNC_RUN / {active=1} active {print} active && /^\);/ {exit}' \
  "$backend/src/main/resources/db/migration/V2__uniqueplay_sync.sql" > "$tmp/schema.sql"
test -s "$tmp/schema.sql"
docker_local run -d --name "$name" --network none --tmpfs /var/lib/mysql \
  -e MARIADB_ALLOW_EMPTY_ROOT_PASSWORD=1 -e MARIADB_DATABASE=scope_test \
  mariadb:11.8.5 >/dev/null
ready=0
for attempt in $(seq 1 60); do
  if docker_local exec "$name" mariadb-admin ping --silent >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
test "$ready" = 1
sql() { docker_local exec -i "$name" mariadb -uroot --batch --skip-column-names scope_test; }
sql < "$tmp/schema.sql"
sql <<'SQL'
INSERT INTO UNIQUEPLAY_SYNC_RUN
 (run_id, season_year, league_id, status, candidate_json, checksum, created_by)
VALUES ('legacy', 2026, '57', 'ACTIVE', '{"fixture":"preserve-original"}', REPEAT('a',64), 'isolated-test');
CREATE TABLE BEFORE_V7 AS SELECT * FROM UNIQUEPLAY_SYNC_RUN;
SQL
# Compare every pre-existing column, including timestamps and the original JSON bytes.
columns=$(sql <<'SQL'
SET SESSION group_concat_max_len=10000;
SELECT GROUP_CONCAT(CONCAT('a.`', COLUMN_NAME, '` <=> b.`', COLUMN_NAME, '`') ORDER BY ORDINAL_POSITION SEPARATOR ' AND ')
FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='scope_test' AND TABLE_NAME='BEFORE_V7';
SQL
)
sql < "$backend/src/main/resources/db/migration/V7__uniqueplay_incremental_scope.sql"
preserved=$(printf 'SELECT COUNT(*) FROM UNIQUEPLAY_SYNC_RUN a JOIN BEFORE_V7 b ON a.run_id=b.run_id WHERE %s;\n' "$columns" | sql)
test "$preserved" = 1
legacy_null=$(printf "SELECT COUNT(*) FROM UNIQUEPLAY_SYNC_RUN WHERE run_id='legacy' AND sync_mode IS NULL AND sync_from_date IS NULL;\n" | sql)
test "$legacy_null" = 1
sql <<'SQL'
INSERT INTO UNIQUEPLAY_SYNC_RUN
 (run_id,season_year,league_id,status,created_by,sync_mode,sync_from_date)
VALUES ('scoped',2026,'57','QUEUED','isolated-test','FROM_DATE','2026-09-11');
SQL
roundtrip=$(printf "SELECT CONCAT(sync_mode,'|',sync_from_date) FROM UNIQUEPLAY_SYNC_RUN WHERE run_id='scoped';\n" | sql)
test "$roundtrip" = 'FROM_DATE|2026-09-11'
# Reapplying raw DDL must fail visibly; Flyway history is responsible for one-time application.
if sql < "$backend/src/main/resources/db/migration/V7__uniqueplay_incremental_scope.sql" > "$tmp/reapply.log" 2>&1; then
  printf 'FAIL: duplicate raw migration unexpectedly succeeded\n' >&2
  exit 1
fi
count=$(printf 'SELECT COUNT(*) FROM UNIQUEPLAY_SYNC_RUN;\n' | sql)
test "$count" = 2
printf 'PASS: V7 on MariaDB 11.8.5; all legacy columns preserved; legacy scope NULL; scoped date roundtrip; duplicate DDL rejected; two rows retained.\n'
docker_local rm -f "$name" >/dev/null
trap - EXIT
if docker_local container inspect "$name" >/dev/null 2>&1; then
  printf 'FAIL: isolated database cleanup failed\n' >&2
  exit 1
fi
printf 'PASS: disposable database container removed; no production connection. SQL artifacts: %s\n' "$tmp"

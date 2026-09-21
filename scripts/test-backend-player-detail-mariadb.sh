#!/usr/bin/env bash
set -euo pipefail

BACKEND_DIR="${BACKEND_DIR:-/Users/juhwan/Documents/Dev/AUBL/AUBL_WebPage_BE-test}"
ARTIFACT_DIR="$(mktemp -d /tmp/aubl-playerdetail-test.XXXXXX)"
RUN_ID="aubl-playerdetail-$(date +%s)-$$"
NETWORK="$RUN_ID"
DB="$RUN_ID-db"
BUILDER="$RUN_ID-build"

cleanup() {
  docker rm -f "$BUILDER" "$DB" >/dev/null 2>&1 || true
  docker network rm "$NETWORK" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# Copy build inputs only. Never mount production environment/credential files.
rsync -a "$BACKEND_DIR/src" "$BACKEND_DIR/gradle" "$BACKEND_DIR/gradlew" \
  "$BACKEND_DIR/settings.gradle" "$BACKEND_DIR/build.gradle" "$ARTIFACT_DIR/"
printf 'Artifacts: %s\n' "$ARTIFACT_DIR"
docker network create --internal "$NETWORK" >/dev/null
docker run -d --name "$DB" --network "$NETWORK" --network-alias playerdetail-db \
  --tmpfs /var/lib/mysql:rw --env MARIADB_ALLOW_EMPTY_ROOT_PASSWORD=1 \
  --env MARIADB_ROOT_HOST=% --env MARIADB_DATABASE=playerdetail_context \
  mariadb:11.8.5 >/dev/null

ready=0
for ((attempt=0; attempt<60; attempt++)); do
  if docker exec "$DB" healthcheck.sh --connect --innodb_initialized >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
if [[ "$ready" != 1 ]]; then
  printf 'Isolated MariaDB did not become ready.\n' >&2
  exit 1
fi

# Offline Gradle uses the dependency cache prepared by the initial test run.
# The internal network prevents the tests from reaching production services.
docker run --rm --name "$BUILDER" --network "$NETWORK" \
  -v "$ARTIFACT_DIR:/app" -v aubl-gradle-cache:/home/gradle/.gradle -w /app \
  -e SPRING_CONFIG_IMPORT= -e FIREBASE_CREDENTIALS_PATH= \
  gradle:jdk21 bash ./gradlew --offline --no-daemon test bootJar

printf '\nPassed. Reports and release JAR: %s/build\n' "$ARTIFACT_DIR"
printf 'Conditional integration tests requiring other emulators remain separately reported.\n'

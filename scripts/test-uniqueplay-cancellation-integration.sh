#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
backend="$(dirname "$root")/AUBL_WebPage_BE-test"
artifacts=$(mktemp -d /tmp/aubl-cancellation-integration.XXXXXX)
prefix="aubl-cancel-$(date +%Y%m%d%H%M%S)-$$"
network="$prefix-network"
db="$prefix-db"
runner="$prefix-runner"
d() { docker --context desktop-linux "$@"; }
created_network=0
created_db=0
cleanup() {
  result=$?
  trap - EXIT
  if [ "$created_db" = 1 ]; then d rm -f "$db" >> "$artifacts/cleanup.log" 2>&1 || result=1; fi
  if [ "$created_network" = 1 ]; then d network rm "$network" >> "$artifacts/cleanup.log" 2>&1 || result=1; fi
  printf '\nEvidence: %s\n' "$artifacts"
  exit "$result"
}
trap cleanup EXIT
d network create --internal "$network" >/dev/null
created_network=1
d run --pull=never -d --name "$db" --network "$network" --network-alias delivery-db --network-alias scope-db \
  --tmpfs /var/lib/mysql:rw,size=536870912 -e MARIADB_ALLOW_EMPTY_ROOT_PASSWORD=1 mariadb:11.8.5 >/dev/null
created_db=1
ready=0
for attempt in $(seq 1 60); do
  if d exec "$db" mariadb --protocol=tcp -h127.0.0.1 -uroot -e 'SELECT 1' >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
test "$ready" = 1
d exec "$db" mariadb -uroot -e 'CREATE DATABASE cancellation_jpa; CREATE DATABASE delivery_jpa; CREATE DATABASE scope_jpa; CREATE DATABASE scope_upgrade; CREATE DATABASE delivery_upgrade;'
mkdir -p "$artifacts/workspace"
for entry in src gradle gradlew build.gradle settings.gradle; do cp -R "$backend/$entry" "$artifacts/workspace/"; done
if [ -f "$backend/gradle.properties" ]; then cp "$backend/gradle.properties" "$artifacts/workspace/"; fi
set +e
d run --pull=never --rm --name "$runner" --network "$network" -u "$(id -u):$(id -g)" \
  -e AUBL_DELIVERY_DB_HOST=delivery-db -e AUBL_SCOPED_DB_HOST=scope-db \
  -e GRADLE_USER_HOME=/gradle-cache \
  -e SPRING_JPA_HIBERNATE_NAMING_PHYSICAL_STRATEGY=org.hibernate.boot.model.naming.PhysicalNamingStrategyStandardImpl \
  -v "$HOME/.gradle:/gradle-cache" -v "$artifacts/workspace:/workspace" -w /workspace gradle:jdk21 \
  bash ./gradlew test --offline --no-daemon \
  --tests '*UniquePlayCancellationMariaDbTest' --tests '*UniquePlayDeliveryMariaDbTest' \
  --tests '*UniquePlayDeliveryServiceTest' --tests '*UniquePlayDeliveryHttpTest' \
  --tests '*UniquePlayCallbackProtocolSwitchTest' --tests '*UniquePlayFlywayMariaDbTest' \
  --tests '*UniquePlayMariaDbIntegrationTest' --tests '*UniquePlayScopedCallbackTest' \
  --tests '*UniquePlayScopedHttpTest' --tests '*QualificationFinalizeServiceTest' \
  --tests '*UniquePlayIdentityDiffTest' bootJar > "$artifacts/gradle.log" 2>&1
result=$?
set -e
tail -n 55 "$artifacts/gradle.log"
exit "$result"

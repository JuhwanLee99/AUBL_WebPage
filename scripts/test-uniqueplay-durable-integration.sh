#!/usr/bin/env bash
set -euo pipefail

# Cached images only. Private test network, no published ports, no production credentials.
root=$(cd "$(dirname "$0")/.." && pwd)
backend=$(cd "$root/../AUBL_WebPage_BE-test" && pwd)
artifact=$(mktemp -d /tmp/aubl-durable-integration.XXXXXX)
suffix="$(date -u +%Y%m%d%H%M%S)-$$"
network="aubl-durable-check-$suffix"
db="aubl-durable-db-$suffix"
db_created=0
network_created=0
cleanup() {
  status=$?
  trap - EXIT
  if [ "$db_created" = 1 ]; then
    if ! docker rm -f "$db" >> "$artifact/cleanup.log" 2>&1; then status=1; fi
  fi
  if [ "$network_created" = 1 ]; then
    if ! docker network rm "$network" >> "$artifact/cleanup.log" 2>&1; then status=1; fi
  fi
  printf 'Verification artifacts: %s\nExit status: %s\n' "$artifact" "$status"
  exit "$status"
}
trap cleanup EXIT
printf 'Verification artifacts: %s\n' "$artifact"
docker network create --internal "$network" > "$artifact/network.log"
network_created=1
docker run -d --rm --pull=never --name "$db" --network "$network" --network-alias delivery-db --network-alias scope-db \
  -e MARIADB_ALLOW_EMPTY_ROOT_PASSWORD=1 -e MARIADB_DATABASE=delivery_jpa \
  --tmpfs /var/lib/mysql:rw,nosuid,size=512m mariadb:11.8.5 > "$artifact/database-container.log"
db_created=1
ready=0
for ((attempt=0; attempt<60; attempt++)); do
  if docker exec "$db" mariadb -h127.0.0.1 --protocol=tcp -uroot -Nse 'SELECT 1' > /dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
if [ "$ready" != 1 ]; then docker logs "$db" > "$artifact/database.log" 2>&1; exit 1; fi
docker exec "$db" mariadb -uroot -e 'CREATE DATABASE scope_jpa; CREATE DATABASE scope_upgrade; CREATE DATABASE delivery_upgrade;'

result=0
docker run --rm --pull=never --network "$network" --user "$(id -u):$(id -g)" \
  -e GRADLE_USER_HOME=/gradle-cache -e AUBL_DELIVERY_DB_HOST=delivery-db -e AUBL_SCOPED_DB_HOST=scope-db \
  -e SPRING_JPA_HIBERNATE_NAMING_PHYSICAL_STRATEGY=org.hibernate.boot.model.naming.PhysicalNamingStrategyStandardImpl \
  --mount "type=bind,src=$HOME/.gradle,dst=/gradle-cache" \
  --mount "type=bind,src=$backend,dst=/source,readonly" \
  --mount "type=bind,src=$artifact,dst=/verification" -w /verification gradle:jdk21 bash -c '
    set -e
    mkdir workspace
    cp -R /source/src /source/gradle workspace/
    for f in gradlew build.gradle settings.gradle gradle.properties; do
      if [ -f "/source/$f" ]; then cp "/source/$f" workspace/; fi
    done
    cd workspace
    bash ./gradlew test --offline --no-daemon \
      --tests com.aubl.webpage.service.UniquePlayDeliveryServiceTest \
      --tests com.aubl.webpage.service.UniquePlayDeliveryHttpTest \
      --tests com.aubl.webpage.service.UniquePlayCallbackProtocolSwitchTest \
      --tests com.aubl.webpage.service.UniquePlayDeliveryMariaDbTest \
      --tests com.aubl.webpage.service.UniquePlayScopedCallbackTest \
      --tests com.aubl.webpage.service.UniquePlayScopedHttpTest \
      --tests com.aubl.webpage.service.UniquePlayMariaDbIntegrationTest \
      --tests com.aubl.webpage.service.UniquePlayFlywayMariaDbTest \
      --tests com.aubl.webpage.service.QualificationFinalizeServiceTest
  ' > "$artifact/result.log" 2>&1 || result=$?
docker logs "$db" > "$artifact/database.log" 2>&1 || true
tail -n 100 "$artifact/result.log"
exit "$result"

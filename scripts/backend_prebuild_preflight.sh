#!/usr/bin/env bash
set -euo pipefail

BACKEND_DIR="${1:-/Users/juhwan/Documents/Dev/AUBL/AUBL_WebPage_BE-test}"
RUN_GRADLE="${RUN_GRADLE:-0}"

pass_count=0
warn_count=0
fail_count=0

pass() {
  pass_count=$((pass_count + 1))
  printf '[PASS] %s\n' "$1"
}

warn() {
  warn_count=$((warn_count + 1))
  printf '[WARN] %s\n' "$1"
}

fail() {
  fail_count=$((fail_count + 1))
  printf '[FAIL] %s\n' "$1"
}

require_file() {
  local path="$1"
  if [[ -f "$path" ]]; then
    pass "file exists: $path"
  else
    fail "missing file: $path"
  fi
}

require_pattern() {
  local file="$1"
  local pattern="$2"
  local label="$3"
  if rg -n --no-heading --fixed-strings "$pattern" "$file" >/dev/null 2>&1; then
    pass "$label"
  else
    fail "$label (pattern not found: $pattern)"
  fi
}

printf '== AUBL Backend Prebuild Preflight ==\n'
printf 'backend dir: %s\n\n' "$BACKEND_DIR"

if [[ ! -d "$BACKEND_DIR" ]]; then
  fail "backend directory not found: $BACKEND_DIR"
  printf '\nSummary: PASS=%d WARN=%d FAIL=%d\n' "$pass_count" "$warn_count" "$fail_count"
  exit 2
fi

require_file "$BACKEND_DIR/README.md"
require_file "$BACKEND_DIR/Dockerfile"
require_file "$BACKEND_DIR/build.gradle"
require_file "$BACKEND_DIR/src/main/resources/application.properties"
require_file "$BACKEND_DIR/src/main/java/com/aubl/webpage/config/SecurityConfig.java"
require_file "$BACKEND_DIR/src/main/java/com/aubl/webpage/api/SeasonController.java"
require_file "$BACKEND_DIR/src/main/java/com/aubl/webpage/api/RecordsFilterController.java"
require_file "$BACKEND_DIR/src/main/java/com/aubl/webpage/api/RecordController.java"
require_file "$BACKEND_DIR/src/main/java/com/aubl/webpage/api/PlayerController.java"
require_file "$BACKEND_DIR/src/main/java/com/aubl/webpage/api/PlayerQueryController.java"
require_file "$BACKEND_DIR/src/main/java/com/aubl/webpage/api/TeamController.java"
require_file "$BACKEND_DIR/src/main/java/com/aubl/webpage/api/FirestoreImportController.java"

printf '\n== Dockerfile checks ==\n'
require_pattern "$BACKEND_DIR/Dockerfile" "FROM gradle:jdk21 AS builder" "build stage uses gradle:jdk21"
require_pattern "$BACKEND_DIR/Dockerfile" "FROM eclipse-temurin:21-jre-alpine" "runtime stage uses temurin 21"
require_pattern "$BACKEND_DIR/Dockerfile" "RUN ./gradlew clean bootJar -x test" "bootJar build step exists"
require_pattern "$BACKEND_DIR/Dockerfile" "ENTRYPOINT [\"java\", \"-jar\", \"app.jar\"]" "entrypoint configured"

printf '\n== Config checks ==\n'
APP_PROPS="$BACKEND_DIR/src/main/resources/application.properties"
SECURITY_CFG="$BACKEND_DIR/src/main/java/com/aubl/webpage/config/SecurityConfig.java"
require_pattern "$APP_PROPS" "spring.datasource.url=jdbc:mariadb://" "datasource URL present"
require_pattern "$APP_PROPS" "spring.datasource.username=\${DB_USER:root}" "DB_USER mapping present"
require_pattern "$APP_PROPS" "spring.datasource.password=\${DB_PASSWORD:}" "DB_PASSWORD mapping present"
require_pattern "$APP_PROPS" "firebase.credentials.path=\${FIREBASE_CREDENTIALS_PATH}" "firebase credential path mapping present"
require_pattern "$SECURITY_CFG" "app.cors.allowed-origins" "CORS property wiring present"
require_pattern "$SECURITY_CFG" ".requestMatchers(\"/api/admin/**\").hasRole(\"ADMIN\")" "admin route protection present"

printf '\n== Endpoint annotation checks ==\n'
require_pattern "$BACKEND_DIR/src/main/java/com/aubl/webpage/api/SeasonController.java" "@RequestMapping(\"/api/seasons\")" "base mapping for /api/seasons present"
require_pattern "$BACKEND_DIR/src/main/java/com/aubl/webpage/api/SeasonController.java" "@GetMapping" "GET /api/seasons handler present"
require_pattern "$BACKEND_DIR/src/main/java/com/aubl/webpage/api/RecordsFilterController.java" "@RequestMapping(\"/api/records\")" "base mapping for /api/records present"
require_pattern "$BACKEND_DIR/src/main/java/com/aubl/webpage/api/RecordsFilterController.java" "@GetMapping(\"/filter-options\")" "GET /api/records/filter-options present"
require_pattern "$BACKEND_DIR/src/main/java/com/aubl/webpage/api/RecordController.java" "@GetMapping(\"/playoffs\")" "GET /api/records/playoffs present"
require_pattern "$BACKEND_DIR/src/main/java/com/aubl/webpage/api/PlayerQueryController.java" "@RequestMapping(\"/api/players\")" "base mapping for /api/players present"
require_pattern "$BACKEND_DIR/src/main/java/com/aubl/webpage/api/PlayerQueryController.java" "@GetMapping(\"/search\")" "GET /api/players/search present"
require_pattern "$BACKEND_DIR/src/main/java/com/aubl/webpage/api/TeamController.java" "@PatchMapping(\"/api/admin/teams/{teamId}/active\")" "PATCH /api/admin/teams/{teamId}/active present"
require_pattern "$BACKEND_DIR/src/main/java/com/aubl/webpage/api/FirestoreImportController.java" "@RequestMapping(\"/api/import/firestore\")" "base mapping for /api/import/firestore present"
require_pattern "$BACKEND_DIR/src/main/java/com/aubl/webpage/api/FirestoreImportController.java" "@PostMapping(\"/matches\")" "POST /api/import/firestore/matches present"

printf '\n== Tooling checks ==\n'
if command -v docker >/dev/null 2>&1; then
  pass "docker installed: $(docker --version)"
else
  fail "docker CLI not found"
fi

if command -v uname >/dev/null 2>&1; then
  arch="$(uname -m)"
  if [[ "$arch" == "arm64" || "$arch" == "aarch64" ]]; then
    warn "host arch is $arch (ARM). Release image must be built with --platform linux/amd64."
  else
    pass "host arch detected: $arch"
  fi
fi

if docker buildx version >/dev/null 2>&1; then
  pass "docker buildx available"
  if docker buildx inspect >/tmp/aubl_buildx_inspect.log 2>&1; then
    if rg -n "linux/amd64" /tmp/aubl_buildx_inspect.log >/dev/null 2>&1; then
      pass "buildx builder supports linux/amd64"
    else
      warn "current buildx builder does not list linux/amd64 (check /tmp/aubl_buildx_inspect.log)"
    fi
  else
    warn "docker buildx inspect failed (check /tmp/aubl_buildx_inspect.log)"
  fi
else
  fail "docker buildx not available"
fi

if command -v java >/dev/null 2>&1; then
  java_line="$(java -version 2>&1 | head -n 1)"
  pass "java detected: ${java_line}"
  java_major="$(java -version 2>&1 | awk -F '\"' '/version/ {print $2}' | awk -F. '{print $1}')"
  if [[ "$java_major" != "21" ]]; then
    warn "JDK 21 not active. Current major=$java_major (Gradle toolchain requires 21)."
  fi
else
  fail "java not found"
fi

if [[ "$RUN_GRADLE" == "1" ]]; then
  printf '\n== Gradle checks ==\n'
  if bash "$BACKEND_DIR/gradlew" -p "$BACKEND_DIR" test >/tmp/aubl_backend_gradle_test.log 2>&1; then
    pass "gradle test passed"
  else
    fail "gradle test failed (see /tmp/aubl_backend_gradle_test.log)"
  fi
else
  warn "gradle test skipped (set RUN_GRADLE=1 to execute)"
fi

printf '\nSummary: PASS=%d WARN=%d FAIL=%d\n' "$pass_count" "$warn_count" "$fail_count"
printf 'Build reminder: use docker buildx build --platform linux/amd64 ...\n'
if [[ "$fail_count" -gt 0 ]]; then
  exit 1
fi

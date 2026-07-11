#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-}"
SEASON_ID="${SEASON_ID:-}"
SEARCH_Q="${SEARCH_Q:-K}"
PLAYOFF_TIER="${PLAYOFF_TIER:-EUTTEUM}"
TEAM_ID="${TEAM_ID:-}"
ADMIN_TOKEN="${ADMIN_TOKEN:-}"

if [[ -z "$BASE_URL" || -z "$SEASON_ID" ]]; then
  cat <<'USAGE'
Usage:
  BASE_URL=https://api.example.com SEASON_ID=11 ./scripts/backend_api_smoke.sh

Optional:
  SEARCH_Q=K PLAYOFF_TIER=EUTTEUM TEAM_ID=15 ADMIN_TOKEN=<firebase-id-token>
  # If SEARCH_Q contains non-ASCII, pass it already URL-encoded.
USAGE
  exit 2
fi

BASE_URL="${BASE_URL%/}"

run_get() {
  local path="$1"
  local name="$2"
  local url="${BASE_URL}${path}"
  printf '\n[GET] %s\n%s\n' "$name" "$url"
  curl -L -sS -f "$url" >/tmp/aubl_smoke.json
  printf '[OK] %s\n' "$name"
}

run_patch_active() {
  if [[ -z "$TEAM_ID" || -z "$ADMIN_TOKEN" ]]; then
    printf '\n[SKIP] PATCH /api/admin/teams/{teamId}/active (TEAM_ID or ADMIN_TOKEN missing)\n'
    return
  fi

  local url="${BASE_URL}/api/admin/teams/${TEAM_ID}/active?active=false"
  printf '\n[PATCH] team active toggle\n%s\n' "$url"
  status="$(curl -L -sS -o /tmp/aubl_smoke_patch.out -w "%{http_code}" \
    -X PATCH \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    "$url")"
  if [[ "$status" == "200" || "$status" == "204" ]]; then
    printf '[OK] PATCH active returned %s\n' "$status"
  else
    printf '[FAIL] PATCH active returned %s\n' "$status"
    cat /tmp/aubl_smoke_patch.out || true
    exit 1
  fi
}

printf '== AUBL API Smoke ==\n'
printf 'BASE_URL=%s\nSEASON_ID=%s\n' "$BASE_URL" "$SEASON_ID"

run_get "/api/seasons" "seasons"
run_get "/api/records/filter-options?seasonId=${SEASON_ID}" "record filter options"
run_get "/api/records/playoffs?seasonId=${SEASON_ID}&view=teams&tier=${PLAYOFF_TIER}" "playoff teams by tier"
run_get "/api/players/search?seasonId=${SEASON_ID}&q=${SEARCH_Q}" "player search"
run_patch_active

printf '\nDone.\n'

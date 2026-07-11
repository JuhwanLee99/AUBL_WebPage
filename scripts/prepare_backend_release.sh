#!/usr/bin/env bash
set -euo pipefail

BACKEND_DIR="${BACKEND_DIR:-/Users/juhwan/Documents/Dev/AUBL/AUBL_WebPage_BE-test}"
REGISTRY_IMAGE="${REGISTRY_IMAGE:-}"
TAG="${TAG:-$(date '+%Y%m%d-%H%M')}"
PLATFORM="${PLATFORM:-linux/amd64}"

if [[ -z "$REGISTRY_IMAGE" ]]; then
  cat <<'USAGE'
Usage:
  REGISTRY_IMAGE=<registry>/<repo>:<name-without-tag> ./scripts/prepare_backend_release.sh

Example:
  REGISTRY_IMAGE=ghcr.io/acme/aubl-backend ./scripts/prepare_backend_release.sh

Optional:
  BACKEND_DIR=/path/to/backend TAG=20260308-1915 PLATFORM=linux/amd64
USAGE
  exit 2
fi

IMAGE_TAGGED="${REGISTRY_IMAGE}:${TAG}"

cat <<EOF
== Backend Release Prep ==
backend dir : ${BACKEND_DIR}
image       : ${IMAGE_TAGGED}
platform    : ${PLATFORM}

Pre-build validation:
  /Users/juhwan/Documents/Dev/AUBL/main/scripts/backend_prebuild_preflight.sh ${BACKEND_DIR}
  RUN_GRADLE=1 /Users/juhwan/Documents/Dev/AUBL/main/scripts/backend_prebuild_preflight.sh ${BACKEND_DIR}

Smoke baseline:
  BASE_URL=<base_url> SEASON_ID=<season_id> /Users/juhwan/Documents/Dev/AUBL/main/scripts/backend_api_smoke.sh

Build (not executed):
  docker buildx build \\
    --platform ${PLATFORM} \\
    -t ${IMAGE_TAGGED} \\
    ${BACKEND_DIR}

Push (not executed):
  docker push ${IMAGE_TAGGED}

Portainer apply checklist:
  1) Update image tag to ${IMAGE_TAGGED}
  2) Verify DB/Firebase/CORS env vars
  3) Re-run backend_api_smoke.sh against deployed URL
  4) Roll back to previous tag if any smoke fails
EOF


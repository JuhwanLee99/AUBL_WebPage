# Backend Prebuild Checklist (Before Docker Build/Deploy)

## Scope
- Backend source: `/Users/juhwan/Documents/Dev/AUBL/AUBL_WebPage_BE-test`
- Stop point: right before actual image build/push and Portainer update.

## Critical constraint
- Local host is ARM, but release image **must** be `linux/amd64`.
- Always use `docker buildx build --platform linux/amd64 ...`.

## 1) Local preflight
Run:

```bash
chmod +x /Users/juhwan/Documents/Dev/AUBL/main/scripts/backend_prebuild_preflight.sh
/Users/juhwan/Documents/Dev/AUBL/main/scripts/backend_prebuild_preflight.sh /Users/juhwan/Documents/Dev/AUBL/AUBL_WebPage_BE-test
```

Optional Gradle test:

```bash
RUN_GRADLE=1 /Users/juhwan/Documents/Dev/AUBL/main/scripts/backend_prebuild_preflight.sh /Users/juhwan/Documents/Dev/AUBL/AUBL_WebPage_BE-test
```

Note:
- Current Gradle toolchain requires Java 21.
- If local `java -version` is not 21, Gradle test can fail before Docker build.

## 2) Runtime/env validation
Required keys:
- `DB_HOST`
- `DB_PORT`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`
- `FIREBASE_CREDENTIALS_PATH`
- `app.cors.allowed-origins`

## 3) API smoke (pre-build baseline)
Run against target environment:

```bash
BASE_URL=https://api.aubl.club \
SEASON_ID=<season_id> \
/Users/juhwan/Documents/Dev/AUBL/main/scripts/backend_api_smoke.sh
```

Admin endpoint smoke (optional):

```bash
BASE_URL=https://api.aubl.club \
SEASON_ID=<season_id> \
TEAM_ID=<team_id> \
ADMIN_TOKEN=<firebase_admin_token> \
/Users/juhwan/Documents/Dev/AUBL/main/scripts/backend_api_smoke.sh
```

## 4) Build command template (do not run until approved)
You can print a ready-to-run release template:

```bash
chmod +x /Users/juhwan/Documents/Dev/AUBL/main/scripts/prepare_backend_release.sh
REGISTRY_IMAGE=<registry>/<repo> /Users/juhwan/Documents/Dev/AUBL/main/scripts/prepare_backend_release.sh
```

Manual template:

```bash
docker buildx build \
  --platform linux/amd64 \
  -t <registry>/<image>:<YYYYMMDD-HHMM> \
  /Users/juhwan/Documents/Dev/AUBL/AUBL_WebPage_BE-test
```

Push template:

```bash
docker push <registry>/<image>:<YYYYMMDD-HHMM>
```

## 5) Portainer template (do not apply yet)
- Update stack/container image tag to new `<YYYYMMDD-HHMM>`.
- Verify env keys above.
- Run same smoke checks post-update.
- Rollback immediately to previous tag on failure.

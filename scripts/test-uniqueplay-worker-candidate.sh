#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
ARTIFACT=$(mktemp -d /tmp/aubl-worker-verification.XXXXXX)
NAME="aubl-worker-candidate-test-$$"
IMAGE='aubl-uniqueplay-sync-worker:incremental-20260912-candidate'
STARTED=0
d() { docker --context desktop-linux "$@"; }
cleanup() {
  if [ "$STARTED" = 1 ]; then
    d logs "$NAME" > "$ARTIFACT/worker.log" 2>&1 || true
    if ! d rm -f "$NAME" > "$ARTIFACT/cleanup.log" 2>&1; then return 1; fi
    STARTED=0
  fi
}
trap 'cleanup || true' EXIT
printf 'Evidence: %s\n' "$ARTIFACT"
d image inspect "$IMAGE" --format '{"id":{{json .Id}},"os":{{json .Os}},"architecture":{{json .Architecture}},"version":{{json (index .Config.Labels "org.opencontainers.image.version")}}}' > "$ARTIFACT/image.json"
IMAGE_ID=$(node --input-type=module - "$ARTIFACT/image.json" <<'NODE'
import fs from 'node:fs';
import assert from 'node:assert/strict';
const image = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
assert.equal(image.id, 'sha256:101af1ec62df94924e91ffd1d91878afec799da4231f1cf3cd3121614f15ed46');
assert.equal(image.os, 'linux');
assert.equal(image.architecture, 'amd64');
assert.equal(image.version, '2026.09.12.14');
process.stdout.write(image.id);
NODE
)
cp -R "$ROOT/services/uniqueplay-sync-worker/test" "$ARTIFACT/test"
cp "$ROOT/scripts/test-uniqueplay-worker-candidate-runtime.mjs" "$ARTIFACT/candidate-runtime.test.mjs"
d run -d --platform linux/amd64 --name "$NAME" --network none --read-only --init \
  --tmpfs /tmp:rw,nosuid,size=512m,mode=1777 \
  --mount "type=bind,src=$ARTIFACT/test,dst=/app/test,readonly" \
  --mount "type=bind,src=$ARTIFACT/candidate-runtime.test.mjs,dst=/app/candidate-runtime.test.mjs,readonly" \
  -e PORT=8080 -e SYNC_SERVICE_TOKEN=fixture-worker-only-20260912 \
  -e SYNC_BACKEND_CALLBACK_URL=http://127.0.0.1:18081 \
  "$IMAGE_ID" > "$ARTIFACT/container-id.txt"
STARTED=1
d inspect "$NAME" --format '{"imageId":{{json .Image}},"network":{{json .HostConfig.NetworkMode}},"readOnly":{{json .HostConfig.ReadonlyRootfs}},"portBindings":{{json .HostConfig.PortBindings}}}' > "$ARTIFACT/isolation.json"
node --input-type=module - "$ARTIFACT/isolation.json" "$IMAGE_ID" <<'NODE'
import fs from 'node:fs';
import assert from 'node:assert/strict';
const container = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
assert.equal(container.imageId, process.argv[3]);
assert.equal(container.network, 'none');
assert.equal(container.readOnly, true);
assert.equal(Object.keys(container.portBindings ?? {}).length, 0);
NODE
set +e
d exec "$NAME" sh -c 'node --test --test-reporter=tap /app/test/*.test.mjs /app/test/browser/*.test.mjs /app/candidate-runtime.test.mjs' > "$ARTIFACT/tests.tap" 2>&1
RESULT=$?
set -e
tail -55 "$ARTIFACT/tests.tap"
CLEANED=true
if ! cleanup; then CLEANED=false; RESULT=1; fi
if [ "$CLEANED" = true ]; then trap - EXIT; fi
node --input-type=module - "$ARTIFACT" "$RESULT" "$CLEANED" "$ROOT" <<'NODE'
import fs from 'node:fs';
const [artifacts, exitCode, cleaned, root] = process.argv.slice(2);
const tap = fs.readFileSync(`${artifacts}/tests.tap`, 'utf8');
const counts = Object.fromEntries([...tap.matchAll(/^# (tests|pass|fail|cancelled|skipped|todo) (\d+)\s*$/gm)].map((match) => [match[1], Number(match[2])]));
const complete = ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'].every((key) => Number.isInteger(counts[key]));
const passed = Number(exitCode) === 0 && cleaned === 'true' && complete && counts.tests > 0
  && counts.tests === counts.pass && ['fail', 'cancelled', 'skipped', 'todo'].every((key) => counts[key] === 0);
const result = { status: passed ? 'PASSED_ISOLATED_CANDIDATE_CHECKS' : 'FAILED_OR_INCOMPLETE',
  executedAt: new Date().toISOString(), exitCode: Number(exitCode), counts,
  cleanupSucceeded: cleaned === 'true', productionAccess: false, artifacts };
fs.writeFileSync(`${artifacts}/result.json`, JSON.stringify(result, null, 2));
const report = `# UniquePlay 워커 후보 이미지 격리 검증\n\n` +
  `- 판정: ${result.status}\n- 실행 시각(UTC): ${result.executedAt}\n` +
  `- 후보: \`aubl-uniqueplay-sync-worker:incremental-20260912-candidate\`\n` +
  `- 버전: \`2026.09.12.14\`, 플랫폼: \`linux/amd64\`\n` +
  `- 고정 실행 이미지 ID: \`sha256:101af1ec62df94924e91ffd1d91878afec799da4231f1cf3cd3121614f15ed46\`\n` +
  `- 테스트 집계: ${JSON.stringify(counts)}\n- 컨테이너 정리 성공: ${result.cleanupSucceeded}\n` +
  `- 증거: \`${artifacts}\` (임시 경로; TAP, 결과 JSON, 이미지·격리 정보, 워커 로그)\n\n` +
  `## 실행 구성\n\n원래 이미지의 서버 CMD와 제품 src를 그대로 사용했다. 테스트 자료와 하네스만 읽기 전용으로 마운트했으며 제품 src를 호스트 파일로 덮어쓰지 않았다. 이미지 ID·아키텍처·버전 라벨을 확인한 후 mutable 태그 대신 고정 이미지 ID로 실행했다.\n\n` +
  `컨테이너는 network=none, 읽기 전용 루트, 호스트 포트 미공개로 실행했다. 운영 토큰·세션·환경 파일은 전달하지 않았다. 실패 콜백 수신기는 같은 컨테이너의 loopback에만 열었으며 임시 토큰만 사용했다.\n\n` +
  `## 검증 항목\n\n` +
  `- HTTP health의 버전·비루트 실행, 인증 누락·오류·서비스 토큰 미설정, 세션 미설정 표시, 필수 runId와 요청 크기 제한.\n` +
  `- 요청 접수 → 로컬 재인증 필요 콜백, 콜백 대기 중 중복 실행 차단 및 종료 후 잠금 해제, runId 경로 인코딩.\n` +
  `- 이미지에 포함된 실제 어댑터의 잘못된 범위 선행 거부, 정상 모드 수용. 정상 모드에서는 합성 브라우저가 네트워크 진입 전에 중단한다.\n` +
  `- KST 자정 직전·직후, 서로 다른 UTC 오프셋, 연도 경계와 윤년, 부분 상세 후보와 전체 스냅샷 검증의 구분.\n` +
  `- 기존 워커 단위 테스트 및 실제 Chromium으로 실행하는 합성 DOM 스크롤 회귀 테스트.\n\n` +
  `## 판정 한계\n\nHTTP 수집은 운영 세션 없이 실패 콜백까지 확인한 것이며 정상 원천 수집 성공을 뜻하지 않는다. 날짜 판정과 어댑터 선행 검증은 이미지의 실제 모듈로 확인했지만, 실제 원천 페이지의 날짜별 상세 방문부터 성공 candidate 콜백까지의 통합 수집은 이번 시험 범위 밖이다. Chromium 합성 페이지 시험을 NAS 로그인·원천 수집 검증으로 계산하지 않는다.\n\n` +
  `실제 NAS 수집, 운영 인증·모바일 확인, 백업·복구·배포 실행 명세와 사용자 승인은 여전히 남는다. 이미지 push, 운영 배포, 실제 동기화·공식 게시 및 운영 DB 변경은 수행하지 않았다. 운영 전면 승인을 대신하지 않는다.\n\n` +
  `재실행: \`bash scripts/test-uniqueplay-worker-candidate.sh\`. 이 스크립트는 위 이미지 ID에 고정되어 있으며 다른 후보는 명시적으로 기대 ID를 변경한 뒤 별도 검증해야 한다.\n`;
fs.writeFileSync(`${root}/docs/release/uniqueplay-worker-candidate-verification-2026-09-12.md`, report);
fs.appendFileSync(`${root}/docs/release/uniqueplay-worker-candidate-2026-09-12.md`,
  `\n## 격리 검증 후속 결과\n\n${result.executedAt}: ${result.status}. 집계: ${JSON.stringify(counts)}. 컨테이너 정리: ${result.cleanupSucceeded}. 상세는 [후보 이미지 격리 검증](./uniqueplay-worker-candidate-verification-2026-09-12.md)을 참조한다. 빌드 당시 미검증 상태와 구분하며 운영 배포 미승인은 유지한다.\n`);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!passed) process.exitCode = 1;
NODE
exit "$RESULT"

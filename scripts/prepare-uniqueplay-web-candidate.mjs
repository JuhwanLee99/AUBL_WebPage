#!/usr/bin/env node
// Prepare local artifacts only. Never deploy Hosting or run production requests.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { loadEnv } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = fs.mkdtempSync('/tmp/aubl-web-candidate.');
const workspace = path.join(artifacts, 'workspace');
fs.mkdirSync(workspace);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
console.log(`Build artifacts: ${artifacts}`);

const env = loadEnv('production', root, 'VITE_');
assert(env.VITE_FIREBASE_PROJECT_ID === 'aubl-backup', 'Candidate requires Firebase project aubl-backup');
assert(env.VITE_FIREBASE_AUTH_DOMAIN === 'aubl-backup.firebaseapp.com', 'Unexpected Firebase auth domain');
assert((env.VITE_BACKEND_API_URL || '').replace(/\/$/, '') === 'https://api.aubl.club', 'Unexpected backend API target');
assert(!env.VITE_SCORING_EXECUTION_MODE || env.VITE_SCORING_EXECUTION_MODE === 'production', 'Local/test scoring mode cannot enter a production candidate');
assert(!env.VITE_USE_FIRESTORE_EMULATOR || env.VITE_USE_FIRESTORE_EMULATOR === 'false', 'Emulator configuration cannot enter a production candidate');
assert(env.VITE_BACKEND_TEST_MODE !== 'true', 'Backend test mode cannot enter a production candidate');
assert(!(env.VITE_BACKEND_TEST_URL || '').trim(), 'Backend test URL must be absent');
for (const field of ['API_KEY', 'AUTH_DOMAIN', 'PROJECT_ID', 'APP_ID', 'MESSAGING_SENDER_ID', 'STORAGE_BUCKET', 'MEASUREMENT_ID']) {
  assert(Boolean(env[`VITE_FIREBASE_${field}`]?.trim()), `Missing Firebase web field: ${field}`);
}

const inputs = ['src', 'public', 'index.html', 'package.json', 'package-lock.json',
  'vite.config.ts', 'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json', 'scripts/generate-og-pages.mjs'];
for (const entry of inputs) {
  const destination = path.join(workspace, entry);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(path.join(root, entry), destination, { recursive: true, dereference: false });
}

function inventory(directory, prefix = '') {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolute = path.join(directory, entry.name);
    assert(!entry.isSymbolicLink(), `Source/artifact symlink requires explicit review: ${relative}`);
    if (entry.isDirectory()) files.push(...inventory(absolute, relative));
    else if (entry.isFile()) {
      const bytes = fs.readFileSync(absolute);
      files.push({ path: relative, bytes: bytes.length, sha256: hash(bytes) });
    }
  }
  return files;
}

// Inventory before adding dependency links or generated build output.
const sourceFiles = inventory(workspace);
const sourceSnapshotId = hash(JSON.stringify(sourceFiles));
fs.writeFileSync(path.join(artifacts, 'source-manifest.json'), JSON.stringify({ sourceSnapshotId, files: sourceFiles }, null, 2));
fs.symlinkSync(path.join(root, 'node_modules'), path.join(workspace, 'node_modules'), 'dir');
const inherited = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'LC_ALL', 'TZ']
  .filter((key) => process.env[key] !== undefined).map((key) => [key, process.env[key]]));
const buildEnvironment = { ...inherited, ...env, NODE_ENV: 'production',
  VITE_SCORING_EXECUTION_MODE: 'production', VITE_USE_FIRESTORE_EMULATOR: 'false',
  OG_BASE_URL: 'https://aubl.club', ALLSTAR_STATIC_PAGES_ENABLED: 'false',
  npm_config_cache: path.join(artifacts, 'npm-cache') };

const build = spawnSync('npm', ['run', 'build'], {
  cwd: workspace, env: buildEnvironment, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
});
const log = `${build.stdout || ''}${build.stderr || ''}`;
fs.writeFileSync(path.join(artifacts, 'build.log'), log);
process.stdout.write(`${log.split('\n').slice(-45).join('\n')}\n`);
if (build.error) throw build.error;
assert(build.status === 0, `Web build failed (${build.status}); evidence: ${artifacts}`);

const dist = path.join(workspace, 'dist');
const files = inventory(dist);
assert(files.some((file) => file.path === 'index.html'), 'Build has no index.html');
const contentManifestSha256 = hash(JSON.stringify(files));
fs.writeFileSync(path.join(artifacts, 'hosting-files.json'), JSON.stringify({ contentManifestSha256, files }, null, 2));
const archive = path.join(artifacts, 'hosting-dist.tar.gz');
const packed = spawnSync('tar', ['-czf', archive, '-C', dist, '.'], { encoding: 'utf8' });
if (packed.error) throw packed.error;
assert(packed.status === 0, 'Could not package Hosting artifact');
const archiveSha256 = hash(fs.readFileSync(archive));
const publicBuildConfiguration = {
  firebaseProjectId: env.VITE_FIREBASE_PROJECT_ID, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  backendApiUrl: env.VITE_BACKEND_API_URL, scoringMode: 'production', firestoreEmulator: false,
  appCheckSiteKeyConfigured: Boolean(env.VITE_FIREBASE_APPCHECK_SITE_KEY?.trim()),
  allstarStaticPages: false,
};
const summary = { status: 'BUILT_NOT_APPROVED_FOR_DEPLOYMENT', builtAt: new Date().toISOString(),
  sourceSnapshotId, sourceFileCount: sourceFiles.length, hostingFileCount: files.length,
  contentManifestSha256, archiveSha256, artifacts, archive,
  publicBuildConfiguration, buildEnvironmentVariableNames: Object.keys(env).sort(),
  originalDistModified: false, productionRequestsExecuted: false, deploymentExecuted: false,
  blockers: ['Hosting CI uses aubl-web-9a141 while web configuration targets aubl-backup',
    'Whole current frontend snapshot needs release-scope approval',
    'Final artifact browser/type/lint/clean-install validation not executed in this preparation',
    'Production execution manifest and backups remain incomplete'] };
fs.writeFileSync(path.join(artifacts, 'candidate.json'), JSON.stringify(summary, null, 2));

const report = `# UniquePlay 최종 웹 후보 산출물\n\n` +
  `- 상태: ${summary.status}\n- 빌드 시각(UTC): ${summary.builtAt}\n` +
  `- 소스 스냅샷 SHA-256: \`${sourceSnapshotId}\`\n- 스냅샷 파일 수: ${sourceFiles.length}\n` +
  `- Hosting 파일 수: ${files.length}\n- 파일 목록 manifest SHA-256: \`${contentManifestSha256}\`\n` +
  `- 배포용 압축본: \`${archive}\`\n- 압축본 SHA-256: \`${archiveSha256}\`\n` +
  `- 상세 증거: \`${artifacts}\`의 candidate.json, source-manifest.json, hosting-files.json, build.log\n\n` +
  `## 산출물 범위\n\n현재 작업트리의 src·public·index.html·패키지 잠금 파일·Vite/TypeScript 설정과 OG 생성 스크립트를 임시 작업 디렉터리에 복사했다. 원래 dist는 변경하지 않았다. package.json의 npm run build로 Vite production 빌드 및 OG 정적 페이지 생성을 수행했다. 원본 환경 파일은 복사하지 않고 해석된 VITE 공개 웹 환경값만 프로세스에 전달했다. 보고서에 API 키·이메일 목록 등 값은 출력하지 않는다.\n\n` +
  `이것은 현재 웹 전체의 스냅샷이며 UniquePlay 변경만 분리한 패치 빌드가 아니다. 소스 manifest는 빌드 입력 식별이며 이전 운영 소스와의 diff를 뜻하지 않는다. Git 조회·커밋·push는 하지 않았다. 실제 출시에 포함되는 전체 변경 범위의 승인은 별도로 필요하다.\n\n` +
  `기존 node_modules를 빌드 시 연결해 사용했고 npm ci로 재설치하지 않았다. 잠금 파일은 스냅샷에 포함하지만 설치 상태와 잠금 파일이 완전히 같다는 검증은 하지 않았다. 후보 산출물 자체를 해시로 고정하며, 재빌드한 파일을 같은 승인 산출물이라고 간주하지 않는다.\n\n` +
  `## 고정한 공개 대상\n\n- Firebase 프로젝트: \`aubl-backup\`\n- Auth 도메인: \`aubl-backup.firebaseapp.com\`\n` +
  `- API: \`https://api.aubl.club\`\n- 기록 실행 모드: production, 에뮬레이터 비활성\n` +
  `- App Check site key 설정 여부: ${publicBuildConfiguration.appCheckSiteKeyConfigured}. 운영 강제 여부와 실제 로그인 성공은 별도 확인 대상이다.\n` +
  `- OG 기준 도메인: \`https://aubl.club\`, 올스타 정적 페이지 추가 생성 비활성\n\n` +
  `production 모드는 배포용 빌드 설정을 뜻하며 기록 엔진 전체의 운영 준비 완료를 뜻하지 않는다. Firebase Hosting 프로젝트를 NAS 백엔드의 실제 서비스 계정 프로젝트로 추정하지 않는다.\n\n` +
  `## 새로 확인한 배포 차단 항목\n\n저장소의 .github/workflows/firebase-hosting-merge.yml은 main push 시 실행되고, 공개 Firebase 설정은 aubl-backup에서 읽지만 Hosting action의 projectId는 aubl-web-9a141이며 서비스 계정 secret 참조도 FIREBASE_SERVICE_ACCOUNT_AUBL_WEB_9A141이다. .firebaserc와 기존 수동 배포 기록은 aubl-backup을 가리킨다. 따라서 현재 workflow를 이번 후보의 승인된 배포 경로로 사용하지 않는다.\n\n` +
  `workflow 파일에서 배포 전용 environment 승인 게이트는 확인되지 않았다. 저장소의 외부 보호 규칙·secret 내용·실제 권한은 확인하지 않았으므로 게이트가 전혀 없다고 단정하지 않는다. main push/merge를 배포와 무관한 작업으로 취급하지 않는다. 이 단계에서 workflow나 secret은 수정하지 않았다.\n\n` +
  `다음 작업은 Hosting 대상 통일, 사용 가능한 서비스 계정 secret과 권한 확인, 명시적 수동 승인 배포 경계 설계다. secret 이름만으로 실제 자격 증명의 프로젝트·권한을 단정하지 않으며, 존재가 확인되지 않은 새 secret으로 자동 교체하지 않는다.\n\n` +
  `## 검증과 배포 상태\n\n빌드는 성공했지만 이번 단계에서 타입 검사·lint·UI/E2E·실제 로그인·운영 조회는 실행하지 않았다. 기존 8건 UI 시험과 워커 121건, V7/v25 왕복 결과가 이 전체 웹 번들의 회귀 검증을 대신하지 않는다. 빌드 경고는 build.log에 보존한다. Functions·Rules·Indexes·Storage·DB·Flutter·NAS 변경은 없으며 Hosting도 배포하지 않았다.\n\n` +
  `로컬 임시 산출물은 영구 보관본이 아니다. 승인된 보관 위치 확보, 전체 웹 변경 범위 승인, CI 불일치 해결 및 운영 실행 명세 완성 후에만 배포를 검토한다. 원래 workspace의 dist를 무심코 firebase deploy에 사용하지 않는다. 이번 후보는 별도 경로에 있다.\n`;
fs.writeFileSync(path.join(root, 'docs/release/uniqueplay-web-candidate-2026-09-12.md'), report);
console.log(JSON.stringify(summary, null, 2));

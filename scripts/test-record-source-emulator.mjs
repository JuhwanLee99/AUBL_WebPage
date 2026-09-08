import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? '', /^(127\.0\.0\.1|localhost):\d+$/);
assert.equal(process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT, 'demo-aubl-scoring');
const output = path.join(repo, 'outputs/record-source-validation', new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(output, { recursive: true });
const jobs = [
  ['existing-scoring-rules', process.execPath, ['--experimental-strip-types', '--test', '--test-skip-pattern=actual .* RPC outage', 'scripts/test-scoring-firestore.mjs']],
  ['record-source-rules', process.execPath, ['--experimental-strip-types', '--test', 'scripts/test-record-source-firestore.mjs']],
  ['record-source-backend', path.join(repo, 'functions/venv/bin/python'), ['scripts/test-record-source-backend.py']],
  ['record-source-browser', process.execPath, ['scripts/test-record-source-e2e.mjs']],
  ['record-source-store-browser', process.execPath, ['scripts/test-record-source-store-e2e.mjs']],
  ['existing-scoring-browser', process.execPath, ['scripts/test-scoring-e2e.mjs']],
  ['official-views', process.execPath, ['scripts/test-official-game-views.mjs']],
];
const results = [];
const only = process.argv.find(arg => arg.startsWith('--only='))?.slice('--only='.length).split(',');
if (only) for (const name of only) assert.ok(jobs.some(job => job[0] === name), `Unknown job: ${name}`);
for (const [name, command, args] of jobs) {
  if (only && !only.includes(name)) continue;
  const file = path.join(output, name + '.log');
  const fd = fs.openSync(file, 'w');
  const start = Date.now();
  const exitCode = await new Promise(resolve => {
    const child = spawn(command, args, { cwd: repo, env: process.env, stdio: ['ignore', fd, fd] });
    child.once('error', error => { fs.writeSync(fd, String(error)); resolve(127); });
    child.once('exit', code => resolve(code ?? 1));
  });
  fs.closeSync(fd);
  const result = { name, exitCode, durationMs: Date.now() - start, log: file };
  results.push(result); process.stdout.write(JSON.stringify(result) + '\n');
  fs.writeFileSync(path.join(output, 'summary.json'), JSON.stringify({ productionAccess: false, results, skippedKnownCases: ['Legacy HTTP/1 gate: actual all RPC outage', 'Legacy HTTP/1 gate: actual commit RPC outage'] }, null, 2));
}
process.stdout.write(`RECORD_SOURCE_VALIDATION_OUTPUT=${output}\n`);
if (results.some(row => row.exitCode !== 0)) process.exitCode = 1;

// Recover the historical pre-integration baseline, not certification of subsequent changes.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { extractArtifactDirectory, jsonCaseSummary, tapSummary } from './lib/scoringValidationReport.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = path.join(root, 'outputs/record-source-validation/2026-09-08T10-55-19-343Z');
const prefix = '/tmp/aubl-preintegration-';
const output = path.join(root, 'outputs/preintegration-baseline-recovered-2026-09-08');
const read = file => fs.readFileSync(file, 'utf8');
const emulator = JSON.parse(read(path.join(run, 'summary.json')));
assert.equal(emulator.results.length, 7);
assert.ok(emulator.results.every(row => row.exitCode === 0));
function cases(file, expected) {
  const log = read(file), artifact = extractArtifactDirectory(log);
  const relative = path.relative(path.join(root, 'outputs'), fs.realpathSync(artifact));
  assert.ok(relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative));
  return { ...jsonCaseSummary(log, expected), artifact, log: file };
}
const source = cases(path.join(run, 'record-source-browser.log'), 34);
const store = cases(path.join(run, 'record-source-store-browser.log'), 28);
for (const item of [source, store]) {
  const data = JSON.parse(read(path.join(item.artifact, 'results.json')));
  assert.equal(data.productionAccess, false); assert.deepEqual(data.blocked, []);
}
const readiness = cases(prefix + 'readiness.log', 220);
const fielding = cases(prefix + 'fielding.log', 36);
const integrity = cases(prefix + 'integrity.log', 32);
const modal = read(path.join(run, 'existing-scoring-browser.log'));
assert.match(modal, /SUMMARY passed=164 failed=0 total=164 productionWrites=0/);
const backend = read(path.join(run, 'record-source-backend.log'));
assert.match(backend, /Ran 12 tests/); assert.match(backend, /\nOK\s*$/);
const summary = {
  collectedAt: new Date().toISOString(), baselineRun: run,
  verdict: 'BLOCKED_BEFORE_LOGIN_BACKEND', historicalBaselineOnly: true,
  productionAccess: false, productionWrites: 0,
  scoringUnits: tapSummary(read(prefix + 'unit.log')),
  sourceAccessUnits: tapSummary(read(prefix + 'source-policy.log')),
  rules: tapSummary(read(path.join(run, 'existing-scoring-rules.log'))),
  sourceRules: tapSummary(read(path.join(run, 'record-source-rules.log'))),
  officialViewNodeTests: tapSummary(read(path.join(run, 'official-views.log'))),
  excludedCases: emulator.skippedKnownCases,
  source, store, readiness: { ...readiness, engine: 74, browser: 146 }, fielding, integrity,
  modal: { passed: 164, failed: 0 }, backend: { passed: 12, failed: 0 }, actualBrowserExecutions: 440,
  typecheck: { status: 'previously-reported-pass', note: 'Exit 0 was observed in the original execution; this collector does not rerun or infer tsc status from an empty log.' },
};
assert.equal(summary.excludedCases.length, 2);
fs.mkdirSync(output, { recursive: true });
// Preserve existing evidence, including any earlier report. Never silently overwrite it.
fs.writeFileSync(path.join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n', { flag: 'wx' });
for (const name of ['typecheck', 'unit', 'source-policy', 'readiness', 'fielding', 'integrity', 'emulator'])
  fs.copyFileSync(prefix + name + '.log', path.join(output, name + '.log'), fs.constants.COPYFILE_EXCL);
process.stdout.write(JSON.stringify({ output, verdict: summary.verdict, historicalBaselineOnly: true }) + '\n');

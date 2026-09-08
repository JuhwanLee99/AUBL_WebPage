import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { sourceModules } from './e2e/scoring/source-modules.mjs';
import { scenarios, guardScenarios } from './e2e/scoring/scenarios.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const localRequire = createRequire(import.meta.url);
let playwright;
try { playwright = localRequire(process.env.AUBL_PLAYWRIGHT_MODULE || 'playwright'); }
catch (error) {
  if (process.env.AUBL_PLAYWRIGHT_MODULE) throw error;
  const bundled = path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json');
  playwright = createRequire(bundled)('playwright');
}
const output = path.join(repo, 'outputs/scoring-e2e', new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(output, { recursive: true });
const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'aubl-e2e-vite-'));
const modules = sourceModules(repo), results = [], networkBlocks = [];
const argument = name => process.argv.find(value => value.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const selected = scenarios.filter(s => !argument('scenario') || s.id === argument('scenario'));
assert.ok(selected.length, 'Unknown scenario filter');
const viewports = [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }]
  .filter(v => !argument('viewport') || v.name === argument('viewport'));
assert.ok(viewports.length, 'Unknown viewport filter');
let server, browser, infrastructureFailed = false;
const readState = page => page.getByTestId('state-json').textContent().then(JSON.parse);
const readProjections = page => page.getByTestId('projection-json').textContent().then(JSON.parse);
const numericSubset = (actual, expected, label) => {
  assert.ok(actual, `Missing ${label}`);
  for (const [key, value] of Object.entries(expected)) assert.equal(actual[key] ?? 0, value, `${label}.${key}`);
};
async function fillDraft(page, scenario) {
  await page.getByRole('button', { name: '복합 플레이 기록', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('타격 판정', { exact: false }).selectOption(scenario.plate);
  await dialog.getByLabel('이번 투구 (기록한 공을 중복 입력하지 마세요)', { exact: false }).selectOption(scenario.pitch);
  await dialog.getByLabel('투구 부가 기록', { exact: false }).selectOption(scenario.misc ?? 'none');
  for (const [index, error] of (scenario.errors ?? []).entries()) {
    await dialog.getByRole('button', { name: '실책 추가', exact: true }).click();
    const row = dialog.locator('.composite-error-row').nth(index);
    await row.getByLabel('야수', { exact: false }).selectOption(error.fielder);
    await row.getByLabel('종류', { exact: false }).selectOption(error.kind);
    await row.getByLabel('행위 설명', { exact: false }).fill(error.note);
  }
  for (const [index, move] of scenario.moves.entries()) {
    await dialog.getByRole('button', { name: `${move.runner} 이동 / 아웃 추가`, exact: true }).click();
    const row = dialog.locator('fieldset.runner-matrix-row').nth(index);
    await row.getByLabel('출발', { exact: false }).selectOption(String(move.from));
    await row.getByLabel('결과', { exact: false }).selectOption(String(move.to));
    await row.getByLabel('원인', { exact: false }).selectOption(move.cause);
    if (move.error !== undefined) await row.getByLabel('연결 실책', { exact: false }).selectOption({ index: move.error + 1 });
    if (move.outKind) await row.getByLabel('아웃 성격', { exact: false }).selectOption(move.outKind);
    if (move.putout) await row.getByLabel('자살 야수', { exact: false }).selectOption(move.putout);
    if (move.assists) await row.getByLabel('보살 경로 (예: 6,4)', { exact: false }).fill(move.assists);
    if (move.rbi) await row.getByLabel('이 득점에 타점 인정', { exact: false }).check();
    if (move.advantageousAppeal) await row.getByLabel('같은 플레이의 유리한 제4아웃 어필 (심판 확정 필요)', { exact: false }).check();
  }
  if (scenario.ruling) {
    await dialog.getByLabel('판정 종류', { exact: false }).selectOption(scenario.ruling.kind);
    await dialog.getByLabel('채택 결과', { exact: false }).selectOption(scenario.ruling.choice);
    await dialog.getByLabel('규칙 조항 / 심판 확인', { exact: false }).fill(scenario.ruling.rule);
  }
  await dialog.getByLabel('판정 근거 (FC, 실책, 희생타, 방해는 필수)', { exact: false }).fill(`${scenario.title}: LOCAL E2E 독립 기대값에 따른 기록원 판단`);
  await dialog.getByLabel('심판 판정 / 기록원 판단 확정', { exact: false }).check();
  if (scenario.responsibility) {
    const row = dialog.locator('.composite-responsibility').first();
    await row.getByLabel('책임투수 확정 / 조정', { exact: false }).fill(scenario.responsibility.pitcher);
    await row.getByLabel('조정 근거', { exact: false }).fill(scenario.responsibility.reason);
  }
  return dialog;
}
async function assertResult(page, scenario) {
  const state = await readState(page), projections = await readProjections(page), expected = scenario.expected;
  assert.equal(state.events.length, 1, 'Exactly one committed event');
  const event = state.events[0], record = event.compositePlay;
  assert.ok(record, 'Structured composite record persisted');
  assert.equal(record.runs, expected.runs); assert.equal(record.outsAdded, expected.outs);
  assert.equal(state.score.away, expected.runs); assert.equal(state.score.home, 0);
  const ended = (scenario.context?.outs ?? 0) + expected.outs === 3;
  assert.equal(state.half, ended ? 'bottom' : 'top');
  assert.equal(state.outs, ended ? 0 : (scenario.context?.outs ?? 0) + expected.outs);
  assert.deepEqual(state.bases, expected.bases);
  assert.equal(state.batterIndex.away, scenario.plate === 'none' ? 0 : 1);
  assert.equal(state.history, 1, 'One undo snapshot'); assert.equal(state.futureHistory, 0);
  assert.equal(state.rejections.length, 0); assert.ok(event.stateTransition, 'Actual gateway attached the state transition');
  assert.equal(event.source.provider, 'composite-modal-v1');
  assert.equal(state.feed.filter(row => row.eventId === event.eventId).length, 1, 'One compound feed row');
  assert.match(await page.getByTestId('feed').innerText(), new RegExp(expected.announce));
  assert.equal(projections.live.hits.away, expected.hits); assert.equal(projections.live.errors.home, expected.errors);
  if (expected.owner) assert.equal(state.runnerResponsiblePitcher[expected.owner.base], expected.owner.pitcher);
  for (const [name, values] of Object.entries(expected.batters)) {
    for (const view of ['keeper', 'viewer']) numericSubset(projections[view].hitters.away.find(row => row.name === name), values, `${view} batter ${name}`);
    // calculateGameStats is a sparse map: a player with no recorded contributions has no row.
    // Missing rows satisfy only zero expectations; any nonzero expectation still fails.
    numericSubset(projections.postgame.away[name] ?? {}, values, `postgame ${name}`);
  }
  for (const [name, values] of Object.entries(expected.pitchers)) for (const view of ['keeper', 'viewer']) {
    numericSubset(projections[view].pitchers.home.find(row => row.name === name), values, `${view} pitcher ${name}`);
  }
  for (const [pos, values] of Object.entries(expected.fielding ?? {})) numericSubset(record.fielding[pos], values, `fielder ${pos}`);
  for (const view of ['keeper-batters', 'viewer-batters', 'keeper-pitchers', 'viewer-pitchers']) {
    assert.equal(await page.getByTestId(view).getByRole('table').count(), 1, `${view} actual StatsTable rendered`);
  }
  return { state, projections };
}
async function positive(page, scenario, prefix) {
  const initial = await readState(page);
  const dialog = await fillDraft(page, scenario);
  const review = dialog.getByLabel('순서·득점·타점·실책·책임 확인', { exact: false });
  assert.equal(await review.isEnabled(), true, await dialog.locator('.runner-matrix-preview').innerText());
  const box = await dialog.boundingBox();
  assert.ok(box && box.x >= 0 && box.width <= page.viewportSize().width, 'Modal fits the viewport');
  await review.check();
  await page.screenshot({ path: `${prefix}-modal.png` });
  await dialog.getByRole('button', { name: '이 플레이 적용', exact: true }).click();
  await dialog.waitFor({ state: 'hidden', timeout: 6000 });
  const applied = await assertResult(page, scenario);
  await page.getByTestId('undo').click();
  const undone = await readState(page);
  for (const key of ['score', 'bases', 'outs', 'half', 'balls', 'strikes', 'batterIndex']) assert.deepEqual(undone[key], initial[key], `Undo restores ${key}`);
  assert.equal(undone.events.length, 0); assert.equal(undone.history, 0); assert.equal(undone.futureHistory, 1);
  await page.getByTestId('redo').click();
  const redone = await assertResult(page, scenario);
  assert.deepEqual(redone.state.events[0].compositePlay, applied.state.events[0].compositePlay, 'Redo keeps the exact transaction');
  await page.getByTestId('reload').click();
  await page.getByRole('button', { name: '복합 플레이 기록', exact: true }).waitFor();
  const reloaded = await assertResult(page, scenario);
  assert.deepEqual(reloaded.state.events[0].compositePlay, applied.state.events[0].compositePlay, 'Actual normalizers preserve the local round trip');
  assert.deepEqual(reloaded.projections, applied.projections, 'Re-query reproduces both pages and post-game statistics');
  await page.screenshot({ path: `${prefix}-result.png` });
}
async function negative(page, scenario, mode, prefix) {
  const modified = structuredClone(scenario);
  if (mode === 'invalid-rbi') modified.moves[0].rbi = true;
  let dialog = await fillDraft(page, modified);
  if (mode === 'pending-ruling') await dialog.getByLabel('심판 판정 / 기록원 판단 확정', { exact: false }).uncheck();
  if (mode === 'stale-draft') {
    await dialog.getByRole('button', { name: '닫기', exact: true }).click();
    await page.getByTestId('stale').click();
    await page.getByRole('button', { name: '복합 플레이 기록', exact: true }).click();
    dialog = page.getByRole('dialog');
    assert.equal(await dialog.locator('.composite-error-row').count(), 2, 'Closed draft was preserved');
  }
  assert.equal(await dialog.getByRole('button', { name: '이 플레이 적용', exact: true }).isDisabled(), true);
  const pattern = mode === 'invalid-rbi' ? /타점/ : mode === 'pending-ruling' ? /확정/ : /바뀌었습니다/;
  assert.match(await dialog.locator('.runner-matrix-preview').innerText(), pattern);
  const state = await readState(page); assert.equal(state.events.length, 0); assert.equal(state.score.away, 0);
  await page.screenshot({ path: `${prefix}-blocked.png` });
}

async function extendedGuard(page, scenario, guard, prefix) {
  const modified = structuredClone(scenario); guard.mutate?.(modified);
  const dialog = await fillDraft(page, modified);
  if (guard.clearEvidence) await dialog.getByLabel('판정 근거 (FC, 실책, 희생타, 방해는 필수)', { exact: false }).fill('');
  assert.equal(await dialog.getByRole('button', { name: '이 플레이 적용', exact: true }).isDisabled(), true);
  assert.equal(await dialog.getByLabel('순서·득점·타점·실책·책임 확인', { exact: false }).isDisabled(), true);
  assert.equal((await readState(page)).events.length, 0);
  await page.screenshot({ path: `${prefix}-guard.png` });
}
async function applyOnly(page, scenario) {
  const dialog = await fillDraft(page, scenario);
  await dialog.getByLabel('순서·득점·타점·실책·책임 확인', { exact: false }).check();
  await dialog.getByRole('button', { name: '이 플레이 적용', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
}
async function workflow(page, scenario, mode, prefix) {
  if (mode === 'timeout') {
    await page.getByTestId('drop-next').click(); const dialog = await fillDraft(page, scenario);
    await dialog.getByLabel('순서·득점·타점·실책·책임 확인', { exact: false }).check();
    await dialog.getByRole('button', { name: '이 플레이 적용', exact: true }).click();
    await dialog.getByRole('alert').filter({ hasText: '화면 적용 결과를 확인하지 못했습니다' }).waitFor({ timeout: 12000 });
    assert.equal(await page.getByTestId('dispatch-count').textContent(), '1');
    await dialog.getByRole('button', { name: '닫기', exact: true }).click(); assert.equal((await readState(page)).events.length, 0);
  } else if (mode === 'paused-submit') {
    await page.getByTestId('pause').click(); const dialog = await fillDraft(page, scenario);
    await dialog.getByLabel('순서·득점·타점·실책·책임 확인', { exact: false }).check();
    await dialog.getByRole('button', { name: '이 플레이 적용', exact: true }).click();
    await page.waitForFunction(() => JSON.parse(document.querySelector('[data-testid="state-json"]').textContent).rejections.length > 0);
    assert.equal((await readState(page)).events.length, 0); await dialog.getByRole('button', { name: '닫기', exact: true }).click();
  } else {
    await applyOnly(page, scenario); const original = await readState(page);
    if (mode === 'replay') await page.getByTestId('retry-input').click();
    else { await page.getByTestId(mode === 'owner' ? 'takeover' : mode === 'paused' ? 'pause' : 'foreign-history').click(); await page.getByTestId('undo').click(); }
    const after = await readState(page); assert.deepEqual(after.events, original.events); assert.deepEqual(after.score, original.score); assert.equal(after.history, 1);
  }
  await page.screenshot({ path: `${prefix}-workflow.png` });
}
async function rateWorkflow(page, mode) {
  const table = page.getByTestId('rate-probe').getByRole('table');
  const headers = await table.locator('thead th').allTextContents();
  const cells = table.locator('tbody tr').first().locator('td');
  assert.equal(await cells.nth(headers.indexOf('출루율')).textContent(), mode === 'legacy' ? '-' : mode === 'sf' ? '.500' : '.600');
  if (mode === 'legacy') assert.match(await table.innerText(), /희생 구분 미확정/);
}
async function saveWorkflow(page, scenario, mode, prefix) {
  await applyOnly(page, scenario);
  const probe = page.getByTestId('atomic-probe');
  const read = () => page.getByTestId('atomic-state').textContent().then(JSON.parse);
  const waitPhase = phase => page.waitForFunction(expected => JSON.parse(document.querySelector('[data-testid="atomic-state"]').textContent).phase === expected, phase);
  if (['offline', 'reload'].includes(mode)) await page.getByTestId('atomic-offline').click();
  if (['response-lost', 'conflict', 'denied'].includes(mode)) await page.getByTestId(`atomic-${mode}`).click();
  await page.getByTestId('atomic-save').click();
  if (mode === 'conflict' || mode === 'denied') {
    await waitPhase(mode === 'conflict' ? 'conflict' : 'blocked'); assert.equal((await read()).writes, 0);
    assert.equal(await probe.getByRole('button', { name: '같은 요청으로 저장 확인', exact: true }).count(), 0);
  } else {
    if (['offline', 'reload', 'response-lost'].includes(mode)) {
      await waitPhase('retry-required'); const id = (await read()).requestId;
      if (mode === 'reload') { await page.getByTestId('reload').click(); await page.getByTestId('atomic-probe').waitFor(); }
      assert.equal((await read()).requestId, id);
      await page.getByTestId('atomic-online').click();
      await probe.getByRole('button', { name: '같은 요청으로 저장 확인', exact: true }).click();
    }
    await waitPhase('saved'); let saved = await read(); assert.equal(saved.head.revision, 1);
    assert.equal(JSON.parse(saved.head.payload).events.length, 1);
    if (mode === 'same-length') {
      await page.getByTestId('stale').click(); await page.getByTestId('atomic-save').click();
      await page.waitForFunction(() => JSON.parse(document.querySelector('[data-testid="atomic-state"]').textContent).revision === 2);
      saved = await read(); const payload = JSON.parse(saved.head.payload);
      assert.equal(payload.events.length, 1); assert.equal(payload.feed.filter(row => row.eventId).length, 1); assert.equal(payload.core.score.home, 1);
    }
    if (mode === 'undo') {
      await page.getByTestId('undo').click(); await page.getByTestId('atomic-save').click();
      await page.waitForFunction(() => JSON.parse(document.querySelector('[data-testid="atomic-state"]').textContent).revision === 2);
      assert.equal(JSON.parse((await read()).head.payload).events.length, 0);
    }
  }
  await page.screenshot({ path: `${prefix}-persistence.png` });
}

try {
  server = await createServer({
    configFile: false, envFile: false, root: path.join(repo, 'scripts/e2e/scoring'), cacheDir: cache,
    clearScreen: false, logLevel: 'error',
    resolve: { alias: [
      { find: /^@shared\/state\/demoStore$/, replacement: path.join(repo, 'scripts/e2e/scoring/store.jsx') },
      { find: '@shared', replacement: path.join(repo, 'src/shared') },
    ] },
    plugins: [{
      name: 'isolated-scoring-source-boundary', enforce: 'pre',
      resolveId(id) {
        if (modules.has(id)) return '\0' + id;
        if (/(^firebase(?:\/|$)|[\\/]firebase[\\/]|demoStore\.effects|backendClient|AuthProvider)/.test(id)) throw new Error(`Production dependency blocked: ${id}`);
      },
      load(id) { if (id.startsWith('\0virtual:')) return modules.get(id.slice(1)); },
    }, react()],
    optimizeDeps: { include: ['react', 'react-dom/client', 'react/jsx-runtime'], entries: [path.join(repo, 'scripts/e2e/scoring/app.jsx')] },
    server: { host: '127.0.0.1', port: 0, hmr: false, fs: { allow: [repo] }, watch: { ignored: ['**/*'] } },
  });
  await server.listen();
  const address = server.httpServer.address();
  assert.ok(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  const chrome = process.env.AUBL_E2E_BROWSER || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  browser = await playwright.chromium.launch({ headless: true, ...(fs.existsSync(chrome) ? { executablePath: chrome } : {}), args: ['--disable-background-networking', '--no-first-run'] });
  console.log(`ISOLATED_ORIGIN=${origin}\nREPORT_DIR=${output}`);
  for (const viewport of viewports) {
    if (infrastructureFailed) break;
    const jobs = selected.map(scenario => ({ scenario, mode: 'positive', name: scenario.id }));
    if (!argument('scenario')) jobs.push(
      { scenario: scenarios.find(s => s.id === 'R06'), mode: 'invalid-rbi', name: 'G01' },
      { scenario: scenarios.find(s => s.id === 'R05'), mode: 'pending-ruling', name: 'G02' },
      { scenario: scenarios.find(s => s.id === 'R01'), mode: 'stale-draft', name: 'G03' },
    );
    if (!argument('scenario')) {
      jobs.push(...guardScenarios.map(guard => ({ scenario: scenarios.find(s => s.id === guard.base), mode: 'extended-guard', name: guard.id, guard })));
      jobs.push(...['owner', 'paused', 'replay', 'paused-submit', 'timeout', 'foreign-history'].map((kind, index) => ({ scenario: scenarios.find(s => s.id === 'R13'), mode: 'workflow', kind, name: `W${index + 1}` })));
      jobs.push(...['sh', 'sf', 'legacy'].map(kind => ({ scenario: scenarios[0], mode: 'rates', kind, name: `RATE-${kind}` })));
      jobs.push(...['online', 'offline', 'response-lost', 'conflict', 'denied', 'reload', 'same-length', 'undo'].map(kind => ({ scenario: scenarios.find(s => s.id === 'R13'), mode: 'save', kind, name: `SAVE-${kind}` })));
    }
    for (const job of jobs) {
      const started = Date.now(), label = `${viewport.name}-${job.name}`, prefix = path.join(output, label);
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, isMobile: viewport.name === 'mobile', hasTouch: viewport.name === 'mobile', serviceWorkers: 'block' });
      const blocked = [], errors = [];
      await context.route('**/*', route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin === origin && request.method() === 'GET' && !url.pathname.startsWith('/api')) return route.continue();
        blocked.push({ url: request.url(), method: request.method() }); return route.abort('blockedbyclient');
      });
      await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
      const page = await context.newPage(); page.setDefaultTimeout(5000);
      page.on('pageerror', error => errors.push(error.message));
      let failure, booted = false;
      try {
        await page.goto(`${origin}/?case=${job.scenario.id}&rates=${job.mode === 'rates' ? job.kind : 'sh'}`, { waitUntil: 'networkidle' });
        await page.getByRole('button', { name: '복합 플레이 기록', exact: true }).waitFor();
        booted = true;
        if (job.mode === 'positive') await positive(page, job.scenario, prefix);
        else if (job.mode === 'extended-guard') await extendedGuard(page, job.scenario, job.guard, prefix);
        else if (job.mode === 'workflow') await workflow(page, job.scenario, job.kind, prefix);
        else if (job.mode === 'rates') await rateWorkflow(page, job.kind);
        else if (job.mode === 'save') await saveWorkflow(page, job.scenario, job.kind, prefix);
        else await negative(page, job.scenario, job.mode, prefix);
        assert.deepEqual(errors, [], 'No browser runtime errors'); assert.deepEqual(blocked, [], 'No production or external requests attempted');
      } catch (error) {
        failure = String(error.stack || error);
        try { await page.screenshot({ path: `${prefix}-failure.png` }); fs.writeFileSync(`${prefix}-dom.html`, await page.content()); } catch { /* A closed browser cannot supply diagnostics. */ }
      } finally {
        networkBlocks.push(...blocked);
        await context.tracing.stop({ path: `${prefix}-trace.zip` }); await context.close();
      }
      const result = { id: job.name, scenario: job.scenario.id, title: job.scenario.title, mode: job.mode, viewport: viewport.name, status: failure ? 'failed' : 'passed', durationMs: Date.now() - started, failure, browserErrors: errors, blockedRequests: blocked };
      results.push(result); console.log(`${result.status.toUpperCase()} ${label} ${result.durationMs}ms${failure ? '\n' + failure.split('\n').slice(0, 9).join('\n') : ''}`);
      fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ results, networkBlocks, productionWrites: 0 }, null, 2));
      if (!booted) { infrastructureFailed = true; console.log('Common fixture failed to load; remaining cases were not run.'); break; }
    }
  }
} finally {
  if (browser) await browser.close();
  if (server) await server.close();
  fs.rmSync(cache, { recursive: true, force: true });
}
const failed = results.filter(r => r.status === 'failed');
const report = [
  '# Isolated scoring frontend E2E results', '',
  `Run: ${new Date().toISOString()}`, `Passed: ${results.length - failed.length}; failed: ${failed.length}; total: ${results.length}.`,
  `Blocked external requests: ${networkBlocks.length}; production writes: 0.`, '',
  '| Case | Viewport | Result | Duration (ms) |', '|---|---|---|---|',
  ...results.map(r => `| ${r.id}: ${r.title} | ${r.viewport} | ${r.status} | ${r.durationMs} |`), '',
  'Boundary: original modal, source-extracted original reducer and page statistics, original helpers/normalizers/StatsTable. Authentication is an in-memory test identity; persistence is isolated sessionStorage, not Firebase.',
  ...failed.flatMap(r => ['', `## ${r.viewport}-${r.id}`, '```text', r.failure, '```']),
].join('\n');
fs.writeFileSync(path.join(output, 'report.md'), report);
console.log(`SUMMARY passed=${results.length - failed.length} failed=${failed.length} total=${results.length} productionWrites=0\nREPORT=${path.join(output, 'report.md')}`);
process.exitCode = failed.length ? 1 : 0;

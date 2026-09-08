import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { sourceModules } from './e2e/scoring/source-modules.mjs';
import { readinessScenarios, readinessInput } from './e2e/scoring/readiness-scenarios.mjs';
import { resolveCompositePlay } from '../src/shared/lib/compositePlayEngine.ts';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(repo, 'outputs/modal-readiness', new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(output, { recursive: true });
const results = [], networkBlocks = [];
const modules = sourceModules(repo), harness = path.join(repo, 'scripts/e2e/scoring');
const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aubl-modal-readiness-'));
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch { playwright = createRequire(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json'))('playwright'); }
let server, browser;
function checkRecord(record, expected) {
  if (expected.feed) assert.match(record.feed.join(' | '), new RegExp(expected.feed));
  for (const map of ['pitchers', 'fielding']) for (const [name, values] of Object.entries(expected[map] ?? {}))
    for (const [field, value] of Object.entries(values)) assert.equal(record[map][name]?.[field] ?? 0, value, map + ' ' + name + '.' + field);
  assert.equal(record.runs, expected.runs, 'runs');
  assert.equal(record.outsAdded, expected.outs, 'outs');
  for (const [name, values] of Object.entries(expected.batters ?? {})) for (const [field, value] of Object.entries(values))
    assert.equal(record.batters[name]?.[field] ?? 0, value, `batter ${name}.${field}`);
}
function row(scenario, layer, error, actual) {
  const result = { id: scenario.id, title: scenario.title, rule: scenario.rule, layer,
    status: error ? 'failed' : 'passed', error: error ? String(error) : undefined, expected: scenario.expected, actual };
  results.push(result); process.stdout.write(JSON.stringify(result) + '\n');
}
async function fill(page, scenario) {
  await page.getByRole('button', { name: '복합 플레이 기록', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('타격 판정', { exact: false }).selectOption(scenario.plate);
  await dialog.getByLabel('이번 투구 (기록한 공을 중복 입력하지 마세요)', { exact: false }).selectOption(scenario.pitch);
  if (scenario.misc) await dialog.getByLabel('투구 부가 기록').selectOption(scenario.misc);
  for (const [index, error] of (scenario.errors ?? []).entries()) {
    await dialog.getByRole('button', { name: '실책 추가', exact: true }).click();
    const item = dialog.locator('.composite-error-row').nth(index);
    await item.getByLabel('야수', { exact: false }).selectOption(error.fielder);
    await item.getByLabel('종류', { exact: false }).selectOption(error.kind);
    await item.getByLabel('행위 설명').fill(error.note);
  }
  for (const [index, move] of scenario.moves.entries()) {
    await dialog.getByRole('button', { name: `${move.runner} 이동 / 아웃 추가`, exact: true }).click();
    const item = dialog.locator('fieldset.runner-matrix-row').nth(index);
    await item.getByLabel('출발', { exact: false }).selectOption(String(move.from));
    await item.getByLabel('결과', { exact: false }).selectOption(String(move.to));
    await item.getByLabel('원인', { exact: false }).selectOption(move.cause);
    if (move.stealGroup) await item.getByLabel('동시 도루 묶음 (1~99)').fill(move.stealGroup);
    if (move.errorIndex !== undefined) await item.getByLabel('연결 실책').selectOption({ index: move.errorIndex + 1 });
    if (move.outKind) await item.getByLabel('아웃 성격', { exact: false }).selectOption(move.outKind);
    if (move.putout) await item.getByLabel('자살 야수', { exact: false }).selectOption(move.putout);
    if (move.assists?.length && (move.to === 'out' || move.cause === 'caught')) await item.getByLabel('보살 경로 (예: 6,4)', { exact: false }).fill(move.assists.join(','));
    if (move.rbi) await item.getByLabel('이 득점에 타점 인정', { exact: false }).check();
  }
  if (scenario.ruling) {
    await dialog.getByLabel('판정 종류', { exact: false }).selectOption(scenario.ruling.kind);
    await dialog.getByLabel('채택 결과', { exact: false }).selectOption(scenario.ruling.choice);
    await dialog.getByLabel('규칙 조항 / 심판 확인', { exact: false }).fill(scenario.ruling.rule);
  }
  await dialog.getByLabel('판정 근거 (FC, 실책, 희생타, 방해는 필수)', { exact: false }).fill(scenario.title);
  await dialog.getByLabel('심판 판정 / 기록원 판단 확정', { exact: false }).check();
  if (scenario.responsibility) {
    const item = dialog.locator('.composite-responsibility').first();
    await item.getByLabel('책임투수 확정 / 조정', { exact: false }).fill(scenario.responsibility.pitcher);
    await item.getByLabel('조정 근거', { exact: false }).fill(scenario.responsibility.reason);
  }
  if (scenario.gdp) await dialog.getByLabel('병살타 판정', { exact: false }).check();
  if (scenario.incompleteDoublePlay) {
    // A contradictory hidden GDP dependency is a pure-engine case, not a selectable UI state.
    await dialog.getByLabel('병살타 완성 여부', { exact: false }).selectOption('incomplete');
    const n = scenario.incompleteDoublePlay.step, move = scenario.moves[n];
    await dialog.getByLabel('제2아웃 실패 행', { exact: false }).selectOption({ label: (n + 1) + '. ' + move.runner });
    await dialog.getByLabel('미완성 병살타 판정 근거', { exact: false }).fill(scenario.incompleteDoublePlay.note);
    if (move.assists?.length) await dialog.locator('fieldset.runner-matrix-row').nth(n).getByLabel('보살 경로 (예: 6,4)', { exact: false }).fill(move.assists.join(','));
  }
  if (scenario.multiOut) {
    await dialog.getByLabel('수비 연속 아웃 기록', { exact: false }).selectOption(scenario.multiOut.kind);
    await dialog.getByLabel('실책·미스플레이 없는 하나의 연속 수비 확인', { exact: false }).setChecked(scenario.multiOut.clean);
    await dialog.getByLabel('수비 DP/TP 판정 근거', { exact: false }).fill(scenario.multiOut.note);
    for (const [n, move] of scenario.moves.entries()) if (move.to === 'out')
      await dialog.getByLabel((n + 1) + '. ' + move.runner + ' 아웃 포함', { exact: false }).setChecked(scenario.multiOut.steps.includes(n));
  }
  return dialog;
}
try {
  for (const scenario of readinessScenarios) {
    const input = readinessInput(scenario), result = resolveCompositePlay(input.expected, input);
    let error;
    try {
      if (scenario.expected.reject) assert.equal(result.ok, false, 'Contradictory rule choice must be blocked');
      else { assert.equal(result.ok, true, JSON.stringify(result)); checkRecord(result.record, scenario.expected); }
    } catch (caught) { error = caught; }
    fs.writeFileSync(path.join(output, `${scenario.id}-engine.json`), JSON.stringify({ input, result }, null, 2));
    row(scenario, 'engine', error, result.ok ? { runs: result.record.runs, outs: result.record.outsAdded, batters: result.record.batters } : { issues: result.issues });
  }
  modules.set('virtual:readiness-scenarios', `export { makeFixture } from '/@fs/${path.join(harness, 'scenarios.mjs')}'; export const scenarios = ${JSON.stringify(readinessScenarios)};`);
  server = await createServer({ configFile: false, envFile: false, root: harness, cacheDir, logLevel: 'error',
    resolve: { alias: [
      { find: /^@shared\/state\/demoStore$/, replacement: path.join(harness, 'store.jsx') },
      { find: '@shared', replacement: path.join(repo, 'src/shared') },
    ] },
    plugins: [{ name: 'isolated-readiness', enforce: 'pre',
      resolveId(id, importer) {
        if (id === './scenarios.mjs' && importer === path.join(harness, 'store.jsx')) return '\0virtual:readiness-scenarios';
        if (modules.has(id)) return '\0' + id;
        if (/(^firebase(?:\/|$)|[\\/]firebase[\\/]|demoStore\.effects|backendClient|AuthProvider)/.test(id))
          throw new Error(`Production dependency blocked: ${id}`);
      },
      load(id) { if (id.startsWith('\0virtual:')) return modules.get(id.slice(1)); },
    }, react()],
    optimizeDeps: { include: ['react', 'react-dom/client', 'react/jsx-runtime'], entries: [path.join(harness, 'app.jsx')] },
    server: { host: '127.0.0.1', port: 0, hmr: false, fs: { allow: [repo] }, watch: { ignored: ['**/*'] } },
  });
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await playwright.chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  for (const viewport of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }]) {
    for (const scenario of readinessScenarios.filter(s => !s.engineOnly)) {
      const context = await browser.newContext({ viewport, isMobile: viewport.name === 'mobile', hasTouch: viewport.name === 'mobile', serviceWorkers: 'block' });
      await context.tracing.start({ screenshots: true, snapshots: true });
      const blocked = [], errors = [];
      await context.route('**/*', route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin === origin && request.method() === 'GET' && !url.pathname.startsWith('/api')) return route.continue();
        blocked.push({ url: request.url(), method: request.method() }); return route.abort();
      });
      const page = await context.newPage(); page.setDefaultTimeout(6000);
      page.on('pageerror', error => errors.push(error.message));
      const prefix = path.join(output, `${scenario.id}-${viewport.name}`);
      let error, actual, booted = false;
      try {
        await page.goto(`${origin}/?case=${scenario.id}`);
        await page.getByRole('button', { name: '복합 플레이 기록', exact: true }).waitFor(); booted = true;
        const dialog = await fill(page, scenario);
        const review = dialog.getByLabel('순서·득점·타점·실책·책임 확인', { exact: false });
        const canReview = await review.isEnabled();
        actual = { canReview, preview: await dialog.locator('.runner-matrix-preview').innerText() };
        await page.screenshot({ path: prefix + '-modal.png' });
        // If an invalid input is accepted, record the local-only consequence as evidence.
        if (canReview) {
          await review.check(); await dialog.getByRole('button', { name: '이 플레이 적용', exact: true }).click();
          await dialog.waitFor({ state: 'hidden' });
          const state = JSON.parse(await page.getByTestId('state-json').textContent());
          const projections = JSON.parse(await page.getByTestId('projection-json').textContent());
          actual = { ...actual, state, projections };
          assert.equal(state.events.length, 1, 'Exactly one actual reducer event');
          if (!scenario.expected.reject) {
            checkRecord(state.events[0].compositePlay, scenario.expected);
            assert.equal(state.score.away, scenario.expected.runs);
            if (scenario.expected.errors !== undefined) assert.equal(projections.live.errors.home, scenario.expected.errors, 'Team errors counted once');
            for (const [name, values] of Object.entries(scenario.expected.pitchers ?? {})) for (const layer of ['keeper', 'viewer']) {
              const pitcher = projections[layer].pitchers.home.find(row => row.name === name);
              for (const [field, value] of Object.entries(values)) assert.equal(pitcher?.[field] ?? 0, value, layer + ' pitcher ' + name + '.' + field);
            }
            assert.deepEqual(state.events[0].compositePlay.input.steps.map(s => s.runnerId), scenario.moves.map(s => s.runner));
            if (scenario.expected.feed) {
              const ownFeed = state.feed.find(row => row.eventId === state.events[0].eventId);
              assert.ok(ownFeed); assert.match(ownFeed.result, new RegExp(scenario.expected.feed));
            }
            if (scenario.id === 'Q08') {
              const playFeed = state.feed.find(row => row.eventId === state.events[0].eventId);
              assert.ok(playFeed, 'Applied event must have its own feed entry');
              assert.match(playFeed.result, /도루 불인정/);
            }
            for (const [name, values] of Object.entries(scenario.expected.batters ?? {})) {
              for (const layer of ['keeper', 'viewer']) {
                const batter = projections[layer].hitters.away.find(row => row.name === name);
                for (const [field, value] of Object.entries(values)) assert.equal(batter?.[field] ?? 0, value, `${layer} ${name}.${field}`);
              }
              for (const [field, value] of Object.entries(values)) assert.equal(projections.postgame.away[name]?.[field] ?? 0, value, `postgame ${name}.${field}`);
            }
          }
        }
        assert.equal(canReview, !scenario.expected.reject, scenario.expected.reject ? 'Modal must block the contradictory rule choice' : 'Legal play must be recordable');
        assert.deepEqual(errors, []); assert.deepEqual(blocked, []);
      } catch (caught) { error = caught; }
      finally {
        fs.writeFileSync(prefix + '.json', JSON.stringify({ actual, errors, blocked }, null, 2));
        await page.screenshot({ path: prefix + '-result.png' }).catch(() => {});
        await context.tracing.stop({ path: prefix + '-trace.zip' }); await context.close(); networkBlocks.push(...blocked);
      }
      row(scenario, viewport.name, error, actual ? { canReview: actual.canReview, score: actual.state?.score } : { errors });
      if (!booted) throw new Error('Readiness harness failed to boot; remaining cases not executed');
    }
  }
} finally {
  await browser?.close(); await server?.close(); fs.rmSync(cacheDir, { recursive: true, force: true });
  const failed = results.filter(row => row.status === 'failed');
  const report = { testedAt: new Date().toISOString(), results, networkBlocks, productionWrites: 0,
    automatedPass: results.length === readinessScenarios.length + readinessScenarios.filter(s => !s.engineOnly).length * 2 && !failed.length && !networkBlocks.length,
    scope: 'Original modal, extracted original reducer and stats, actual pure engine. No Firebase, real login, production effects or backend writes.' };
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(output, 'report.md'), `# Modal rules readiness\n\n${report.scope}\n\nPassed: ${results.length - failed.length}/${results.length}\n\n| Case | Layer | Rule | Result |\n| --- | --- | --- | --- |\n${results.map(row => `| ${row.id}: ${row.title} | ${row.layer} | ${row.rule} | ${row.status} |`).join('\n')}\n\nProduction writes: 0. Unexpected external requests: ${networkBlocks.length}.\n`);
  fs.appendFileSync(path.join(repo, 'docs/records-modal-readiness-gate-2026-09-08.md'),
    `\n## 추가 규칙 검증 실행: ${report.testedAt}\n\n- 실제 통과: ${results.length - failed.length}/${results.length}\n- 실패: ${failed.length}\n- 자동 검증 통과 여부: ${report.automatedPass}\n- 운영 쓰기: 0, 외부 요청 시도: ${networkBlocks.length}\n- [결과 보고서](../${path.relative(repo, output)}/report.md) / [상세 기대값·결과](../${path.relative(repo, output)}/results.json)\n- 실패 사례: ${[...new Set(failed.map(row => row.id))].join(', ') || '없음'}\n- ${report.automatedPass ? '자동 사례 통과. 미검증 범위의 승인 조건은 별도 확인 필요.' : '기록 신뢰성 승인 보류. 로그인·백엔드 연동 단계로 진행하지 않음.'}\n`);
  process.stdout.write(`MODAL_READINESS_OUTPUT=${output}\nSUMMARY passed=${results.length - failed.length} failed=${failed.length} total=${results.length}\n`);
  if (!report.automatedPass) process.exitCode = 1;
}

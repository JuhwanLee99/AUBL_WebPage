import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { sourceModules } from './e2e/scoring/source-modules.mjs';
import { integrityFixtures } from './e2e/scoring/integrity-fixtures.mjs';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const harness = path.join(repo, 'scripts/e2e/scoring'), modules = sourceModules(repo);
const output = path.join(repo, 'outputs/scoring-integrity', new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(output, { recursive: true });
const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aubl-integrity-'));
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch { playwright = createRequire(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json'))('playwright'); }
const results = [], networkBlocks = [];
let browser, server;
try {
  server = await createServer({ configFile: false, envFile: false, root: harness, cacheDir, logLevel: 'error',
    resolve: { alias: [{ find: /^@shared\/state\/demoStore$/, replacement: path.join(harness, 'store.jsx') }, { find: '@shared', replacement: path.join(repo, 'src/shared') }] },
    plugins: [{ name: 'isolated-integrity', enforce: 'pre',
      resolveId(id) {
        if (modules.has(id)) return '\0' + id;
        if (/(^firebase(?:\/|$)|[\\/]firebase[\\/]|demoStore\.effects|backendClient|AuthProvider)/.test(id)) throw new Error('Production dependency blocked: ' + id);
      }, load(id) { if (id.startsWith('\0virtual:')) return modules.get(id.slice(1)); },
    }, react()],
    optimizeDeps: { include: ['react', 'react-dom/client', 'react/jsx-runtime'], entries: [path.join(harness, 'app.jsx')] },
    server: { host: '127.0.0.1', port: 0, hmr: false, fs: { allow: [repo] }, watch: { ignored: ['**/*'] } },
  });
  await server.listen(); const origin = 'http://127.0.0.1:' + server.httpServer.address().port;
  browser = await playwright.chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  for (const viewport of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }])
    for (const audience of ['public', 'admin']) for (const fixture of integrityFixtures) {
      const context = await browser.newContext({ viewport, isMobile: viewport.name === 'mobile', hasTouch: viewport.name === 'mobile', serviceWorkers: 'block' });
      const blocked = [], errors = [], id = viewport.name + '-' + audience + '-' + fixture.id;
      await context.tracing.start({ screenshots: true, snapshots: true });
      await context.route('**/*', route => {
        const r = route.request(), url = new URL(r.url());
        if (url.origin === origin && r.method() === 'GET' && !url.pathname.startsWith('/api')) return route.continue();
        blocked.push({ url: r.url(), method: r.method() }); return route.abort();
      });
      const page = await context.newPage(); page.setDefaultTimeout(6000); page.on('pageerror', e => errors.push(e.message));
      let error;
      try {
        await page.goto(origin + '/?case=R13&integrity=' + fixture.id + '&audience=' + audience);
        const probe = page.getByTestId('integrity-probe'); await probe.waitFor();
        const notice = probe.getByTestId('scoring-integrity');
        assert.equal(await notice.count(), fixture.review ? 1 : 0);
        if (fixture.review) {
          assert.match(await notice.innerText(), /확정 기록으로 사용하지/);
          if (audience === 'public') {
            assert.equal(await notice.locator('summary, pre').count(), 0);
            assert.doesNotMatch(await notice.innerHTML(), /SECRET_/);
          } else {
            await notice.locator('summary').first().click();
            assert.match(await notice.innerText(), /SECRET_AUDIT_EVENT/);
            await notice.getByText('보존 원본 보기', { exact: true }).click();
            assert.match(await notice.locator('pre').innerText(), /SECRET_AUDIT_EVENT/);
            assert.equal(await notice.getByRole('button').count(), 0, 'No dismiss-as-valid action');
          }
          await page.screenshot({ path: path.join(output, id + '.png') });
          await probe.getByTestId('integrity-replace').click();
          await notice.waitFor({ state: 'hidden' });
        }
        assert.deepEqual(errors, []); assert.deepEqual(blocked, []);
      } catch (caught) { error = String(caught); }
      finally {
        await context.tracing.stop({ path: path.join(output, id + '-trace.zip') }); await context.close();
        networkBlocks.push(...blocked);
      }
      const result = { id, status: error ? 'failed' : 'passed', error, errors, blocked };
      results.push(result); process.stdout.write(JSON.stringify(result) + '\n');
    }
} finally {
  await browser?.close(); await server?.close(); fs.rmSync(cacheDir, { recursive: true, force: true });
  const failed = results.filter(r => r.status === 'failed'), expected = integrityFixtures.length * 4;
  const report = { results, expected, productionWrites: 0, networkBlocks, passed: results.length - failed.length, failed: failed.length,
    complete: results.length === expected && !failed.length && !networkBlocks.length,
    scope: 'Actual read-only integrity component and rule/source-priority model; isolated fixture events, no real auth/backend or official-source route.' };
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(output, 'report.md'), '# Scoring integrity E2E\n\n' + report.scope + '\n\nPassed: ' + report.passed + '/' + expected + '\n\n| Case | Result |\n| --- | --- |\n' + results.map(r => '| ' + r.id + ' | ' + r.status + ' |').join('\n') + '\n');
  process.stdout.write('INTEGRITY_OUTPUT=' + output + '\nSUMMARY passed=' + report.passed + ' failed=' + report.failed + ' total=' + results.length + '\n');
  if (!report.complete) process.exitCode = 1;
}

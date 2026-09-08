import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import { sourceModules } from './e2e/scoring/source-modules.mjs';

const repo = process.cwd();
const runtime = createRequire('/Users/juhwan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json');
const { chromium } = runtime('playwright');
const output = path.join(repo, 'outputs/defensive-fielding', new Date().toISOString().replace(/[:.]/g, '-'));
await fs.mkdir(output, { recursive: true });
const modules = sourceModules(repo);
const entry = path.join(repo, 'scripts/e2e/scoring/fielding-app.jsx');
const store = path.join(repo, 'scripts/e2e/scoring/store.jsx');
const results = [];
const server = await createServer({
  configFile: false, envFile: false, root: repo, cacheDir: path.join(output, '.vite'),
  optimizeDeps: { entries: [entry], noDiscovery: true, include: ['react', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime'] },
  server: { host: '127.0.0.1', port: 0, watch: null, hmr: false, ws: false, fs: { allow: [repo] } },
  esbuild: { jsx: 'automatic' },
  plugins: [{
    name: 'isolated-fielding', enforce: 'pre',
    resolveId(id, importer) {
      if (modules.has(id)) return '\0' + id;
      if (importer && /(?:^|\/)demoStore(?:\.tsx)?$/.test(id)) return store;
    },
    load(id) { if (id.startsWith('\0virtual:')) return modules.get(id.slice(1)); },
    configureServer(dev) {
      dev.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] !== '/fielding-test') return next();
        res.setHeader('Content-Type', 'text/html');
        res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://127.0.0.1:*; img-src 'self' data:; font-src 'self' data:");
        res.end(`<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/@fs/${entry}"></script></body></html>`);
      });
    },
  }],
});
await server.listen();
const address = server.httpServer.address();
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const read = async page => JSON.parse(await page.getByTestId('fielding-ledger-json').textContent());
const state = async page => JSON.parse(await page.getByTestId('fielding-state-json').textContent());
const click = (page, id) => page.getByTestId(id).click();
const player = (ledger, name) => ledger.players.find(row => row.name === name);
const cases = [
  ['captured-PO-A', async page => {
    await click(page, 'fielding-ground'); const ledger = await read(page);
    assert.equal(player(ledger, 'HA').stats.assists, 1); assert.equal(player(ledger, 'HD').stats.putouts, 1);
    assert.equal(ledger.issues.length, 0); assert.equal((await state(page)).events[0].defensiveSnapshot.side, 'home');
    assert.equal(await page.getByTestId('defensive-fielding').count(), 1);
  }],
  ['replacement-boundary', async page => {
    await click(page, 'fielding-ground'); await click(page, 'fielding-replace'); await click(page, 'fielding-ground');
    const ledger = await read(page); assert.equal(player(ledger, 'HA').stats.assists, 1); assert.equal(player(ledger, 'NEW_SS').stats.assists, 1);
    assert.equal(player(ledger, 'HD').stats.putouts, 2);
  }],
  ['position-swap', async page => {
    await click(page, 'fielding-ground'); await click(page, 'fielding-swap'); await click(page, 'fielding-ground');
    const ledger = await read(page); assert.equal(player(ledger, 'HA').stats.assists, 1); assert.equal(player(ledger, 'HA').stats.putouts, 1);
    assert.deepEqual(new Set(player(ledger, 'HA').positions), new Set(['3', '6']));
  }],
  ['third-out-defense', async page => {
    await click(page, 'fielding-third-out'); await click(page, 'fielding-ground');
    assert.equal((await state(page)).half, 'bottom'); assert.ok((await read(page)).players.every(row => row.side === 'home'));
  }],
  ['away-defense', async page => {
    await click(page, 'fielding-bottom'); await click(page, 'fielding-ground');
    const ledger = await read(page); assert.equal(player(ledger, 'A').stats.assists, 1); assert.ok(ledger.players.every(row => row.side === 'away'));
  }],
  ['undo-redo', async page => {
    await click(page, 'fielding-ground'); const original = await read(page);
    await click(page, 'undo'); assert.equal((await read(page)).players.length, 0);
    await click(page, 'redo'); assert.deepEqual(await read(page), original);
  }],
  ['JSON-reload', async page => {
    await click(page, 'fielding-ground'); const original = await read(page);
    await click(page, 'reload'); await page.getByTestId('fielding-ledger-json').waitFor(); assert.deepEqual(await read(page), original);
  }],
  ['missing-number', async page => {
    await click(page, 'fielding-missing-number'); await click(page, 'fielding-ground'); const ledger = await read(page);
    assert.equal(ledger.unassigned.assists, 1); assert.equal(ledger.assigned.putouts, 1);
  }],
  ['duplicate-position', async page => {
    await click(page, 'fielding-duplicate-position'); await click(page, 'fielding-ground');
    assert.equal((await read(page)).unassigned.assists, 1);
  }],
  ['legacy-unassigned', async page => {
    await click(page, 'fielding-ground'); await click(page, 'fielding-strip'); const ledger = await read(page);
    assert.equal(ledger.players.length, 0); assert.equal(ledger.unassigned.putouts, 1);
  }],
  ['duplicate-idempotence', async page => {
    await click(page, 'fielding-ground'); const original = await read(page); await click(page, 'fielding-duplicate'); assert.deepEqual(await read(page), original);
  }],
  ['conflict-unassigned', async page => {
    await click(page, 'fielding-ground'); await click(page, 'fielding-conflict'); const ledger = await read(page);
    assert.equal(ledger.players.length, 0); assert.equal(ledger.issues[0].code, 'conflicting_source');
  }],
  ['manual-no-fallback', async page => {
    await click(page, 'fielding-ground'); await click(page, 'fielding-pending-manual'); const ledger = await read(page);
    assert.equal(ledger.players.length, 0); assert.equal(ledger.issues[0].code, 'manual_resolve');
  }],
  ['fielding-error', async page => {
    await click(page, 'fielding-error'); assert.equal(player(await read(page), 'HA').stats.errors, 1);
  }],
  ['catcher-passed-ball', async page => {
    await click(page, 'fielding-runner'); await click(page, 'fielding-pb'); const ledger = await read(page); assert.equal(player(ledger, 'HE').stats.pb, 1); assert.equal(ledger.totals.errors, 0);
  }],
  ...['fielding-pending-manual', 'fielding-invalid-manual'].map(control => [`${control}-reload`, async page => {
    await click(page, 'fielding-ground'); await click(page, control);
    assert.equal((await read(page)).players.length, 0);
    await click(page, 'reload'); await page.getByTestId('fielding-ledger-json').waitFor();
    const ledger = await read(page); assert.equal(ledger.players.length, 0); assert.ok(ledger.issues.length);
  }]),
  ['public-panel-denied', async page => {
    await page.goto(`${origin}/fielding-test?case=R01&public=1`);
    await click(page, 'fielding-seed'); await click(page, 'fielding-ground');
    assert.ok((await read(page)).players.length > 0);
    assert.equal(await page.getByTestId('defensive-fielding').count(), 0);
  }],
];
try {
  for (const [viewportName, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
    for (const [name, run] of cases) {
      const id = `${viewportName}-${name}`; const context = await browser.newContext({ viewport });
      const blocked = [], errors = []; await context.tracing.start({ screenshots: true, snapshots: true });
      await context.route('**/*', route => {
        const url = route.request().url();
        if (url.startsWith(origin + '/')) return route.continue();
        blocked.push(url); return route.abort();
      });
      const page = await context.newPage(); page.setDefaultTimeout(10000);
      page.on('pageerror', error => errors.push(error.message));
      let status = 'passed', failure;
      try {
        await page.goto(`${origin}/fielding-test?case=R01`); await page.getByTestId('fielding-seed').waitFor();
        await click(page, 'fielding-seed'); await run(page);
        assert.deepEqual(errors, []); assert.deepEqual(blocked, []);
        await fs.writeFile(path.join(output, `${id}.json`), JSON.stringify({ ledger: await read(page), state: await state(page) }, null, 2));
      } catch (error) { status = 'failed'; failure = error.stack; }
      await page.screenshot({ path: path.join(output, `${id}.png`), fullPage: true });
      await context.tracing.stop({ path: path.join(output, `${id}.zip`) }); await context.close();
      const result = { id, status, failure, errors, blocked }; results.push(result); console.log(JSON.stringify(result));
    }
  }
} finally { await browser.close(); await server.close(); }
const summary = { passed: results.filter(row => row.status === 'passed').length, failed: results.filter(row => row.status === 'failed').length, total: results.length, productionWrites: 0, results };
await fs.writeFile(path.join(output, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(`DEFENSIVE_OUTPUT=${output}\nSUMMARY passed=${summary.passed} failed=${summary.failed} total=${summary.total} productionWrites=0`);
if (summary.failed || summary.total !== cases.length * 2) process.exitCode = 1;

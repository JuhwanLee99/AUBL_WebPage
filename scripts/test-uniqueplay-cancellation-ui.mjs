import assert from 'node:assert/strict';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from '../services/uniqueplay-sync-worker/node_modules/playwright/index.mjs';

const ID = '11111111-1111-4111-8111-111111111111';
const BASE = '/api/admin/sync/unique-play';
const origin = 'http://127.0.0.1:5197';
const errors = [], blocked = [], results = [];
let mode, run, pending, requests;
const vite = await createServer({
  configFile: false, envDir: false, cacheDir: '.tmp/uniqueplay-cancellation-ui',
  esbuild: { jsx: 'automatic' },
  resolve: { alias: Object.fromEntries(['app', 'core', 'features', 'shared'].map(name => ['@' + name, path.resolve('src', name)])) },
  optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-router-dom', 'firebase/app', 'firebase/auth'] },
  server: { host: '127.0.0.1', port: 5197, strictPort: true, watch: null, hmr: false, ws: false }, appType: 'custom',
  plugins: [{
    name: 'isolated-cancellation-ui',
    resolveId(id) { if (id === '/__cancel-entry') return '\0cancel-entry'; },
    load(id) {
      if (id !== '\0cancel-entry') return;
      return `import React from 'react'; import {createRoot} from 'react-dom/client';
        import {MemoryRouter} from 'react-router-dom'; import {initializeApp} from 'firebase/app';
        initializeApp({apiKey:'fixture-only',projectId:'demo-aubl-cancellation-ui'});
        const {default:Page}=await import('/src/app/pages/admin/AdminUniquePlaySyncPage.tsx');
        createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(Page)));`;
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url?.startsWith('/api/')) {
          res.setHeader('content-type', 'application/json');
          const send = (value, status = 200) => { res.statusCode = status; res.end(JSON.stringify(value)); };
          if (req.url === `${BASE}/session`) return send({ status: 'READY', authenticated: true, activeRunId: run.status === 'CANCELED' ? null : ID });
          if (req.url === `${BASE}/runs/${ID}`) return send(run);
          if (req.url === `${BASE}/runs/${ID}/cancellation`) {
            if (mode === 'unsupported') return send({ message: 'NOT_FOUND' }, 404);
            if (mode === 'forbidden') return send({ message: 'FORBIDDEN' }, 403);
            return send({ runId: ID, supported: mode !== 'disabled', status: run.status, pending });
          }
          if (req.url === `${BASE}/runs/${ID}/cancel` && req.method === 'POST') {
            let raw = ''; for await (const part of req) raw += part;
            const body = JSON.parse(raw); requests.push(body);
            if (mode === 'changed' && requests.length === 1) {
              run.updatedAt = '2026-09-13T01:20:30.123456';
              return send({ code: 'RUN_CHANGED_REFRESH_REQUIRED', message: 'refresh first' }, 409);
            }
            pending = { cancellationId: body.cancellationId, note: body.note };
            run.errorCode = 'CANCEL_REQUESTED'; run.progress.phase = 'CANCELLING';
            if (mode === 'response-loss' && requests.length === 1) return send({ message: 'stop confirmation unavailable' }, 503);
            if (mode === 'wrong-ack') return send({ runId: ID, cancellationId: 'wrong', status: 'CANCELED' });
            run.status = 'CANCELED'; run.errorCode = 'ADMIN_CANCELLED'; run.progress.phase = 'CANCELED';
            return send({ runId: ID, cancellationId: body.cancellationId, status: 'CANCELED' });
          }
          if (req.method !== 'GET') { requests.push({ unexpected: req.url }); return send({ message: 'Unexpected write' }, 500); }
          return send({ items: [], totalElements: 0, totalPages: 0, summary: { total: 0 } });
        }
        if (req.url === '/__cancel-ui') {
          res.setHeader('content-type', 'text/html');
          res.end(await server.transformIndexHtml('/__cancel-ui', '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/__cancel-entry"></script></body></html>'));
          return;
        }
        next();
      });
    },
  }],
});
let browser;
try {
  await vite.listen(); browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    blocked.push(url.origin); return route.abort();
  });
  for (const width of [1280, 390]) for (const scenario of ['success', 'response-loss', 'changed', 'wrong-ack', 'unsupported', 'forbidden', 'disabled', 'review']) {
    mode = scenario; pending = null; requests = [];
    run = { runId: ID, status: mode === 'review' ? 'REVIEW_REQUIRED' : 'RUNNING', seasonYear: 2026,
      startedAt: '2026-09-13T00:10:49', updatedAt: '2026-09-13T00:10:49', checksum: null,
      expectedPublishedRevision: 'fixture-official-preserved', publishedRevision: null, revisionId: null,
      progress: { phase: 'CONNECTING' }, summary: { total: 0 }, validation: { status: 'NOT_RUN', issues: [] }, revisions: [] };
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 }); await page.goto(origin + '/__cancel-ui');
    if (mode === 'review') {
      await page.getByText('변경 검토 필요', { exact: true }).waitFor();
      assert.equal(await page.getByRole('heading', { name: '현재 수집 중단', exact: true }).count(), 0);
    } else {
      await page.getByRole('heading', { name: '현재 수집 중단', exact: true }).waitFor();
      const submit = page.getByRole('button', { name: '수집 중단 요청', exact: true });
      if (['unsupported', 'forbidden', 'disabled'].includes(mode)) {
        const text = mode === 'unsupported' ? /현재 백엔드에는 수집 중단 API가 없습니다/ : mode === 'forbidden' ? /수집 중단은 관리자만 요청/ : /영속 콜백 전환이 비활성/;
        await page.getByText(text).waitFor(); assert.equal(await submit.isEnabled(), false);
      } else {
        assert.equal(await submit.isEnabled(), false);
        await page.getByLabel('중단 사유 (8~500자)').fill('수집 갱신이 멈춰 관리자 승인으로 중단합니다.');
        assert.equal(await submit.isEnabled(), false);
        await page.getByLabel('현재 실행의 수집·결과 전송을 멈추고, 이력과 기존 공식 기록을 보존합니다.').check();
        await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent === '수집 중단 요청' && !button.disabled));
        assert.ok((await submit.boundingBox()).height >= 44);
        await submit.click();
        if (['response-loss', 'changed'].includes(mode)) {
          await page.getByText(mode === 'response-loss' ? /안전한 중단을 아직 확인하지 못했습니다/ : /실행 상태가 변경되었거나 중단 확인과 충돌/).waitFor();
          const retry = page.getByRole('button', { name: '같은 요청으로 중단 재확인', exact: true });
          await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent === '같은 요청으로 중단 재확인' && !button.disabled));
          await retry.click();
        }
        if (mode === 'wrong-ack') {
          await page.getByText(/워커 중단 완료 응답을 확인하지 못했습니다/).waitFor();
          assert.equal(run.status, 'RUNNING');
          assert.equal(await page.getByText(/수집 중단이 확인되었습니다/).count(), 0);
        } else {
          await page.getByText(/수집 중단이 확인되었습니다/).waitFor();
          assert.equal(run.status, 'CANCELED');
          const expected = ['response-loss', 'changed'].includes(mode) ? 2 : 1;
          assert.equal(requests.length, expected);
          if (expected === 2) {
            assert.equal(requests[0].cancellationId, requests[1].cancellationId);
            assert.equal(requests[0].note, requests[1].note);
          }
          assert.equal(run.expectedPublishedRevision, 'fixture-official-preserved');
        }
      }
    }
    if (['unsupported', 'forbidden', 'disabled', 'review'].includes(mode)) assert.equal(requests.length, 0);
    assert.equal(requests.some(request => request.unexpected), false);
    results.push({ width, scenario, passed: true }); await page.close();
  }
  assert.deepEqual(errors, []); assert.deepEqual(blocked, []);
  await writeFile('/tmp/aubl-cancellation-ui-results-20260913.json', JSON.stringify({ results, errors, blocked }, null, 2));
  console.log(`PASS: ${results.length} desktop/mobile cancellation scenarios; no external traffic or unexpected writes.`);
} finally {
  await browser?.close(); await vite.close();
}

import { timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { chromium } from 'playwright';
import { ADAPTER_VERSION, collectUniquePlay } from './adapter.mjs';
import { loadStorageState } from './session.mjs';
import { DiskRunStore, DurableRuns } from './durable-runs.mjs';

const port = Number(process.env.PORT || 8080);
const expectedToken = process.env.SYNC_SERVICE_TOKEN || '';
const callbackBase = (process.env.SYNC_BACKEND_CALLBACK_URL || '').replace(/\/$/, '');
if (!expectedToken || !/^https?:\/\//.test(callbackBase)) throw new Error('Worker callback configuration is required');
const runs = new DurableRuns({
  store: new DiskRunStore(process.env.SYNC_STATE_DIR), callbackBase, token: expectedToken,
  collect: async (payload, progress, signal) => {
    let browser;
    let closing;
    const closeBrowser = () => {
      if (browser && !closing) {
        closing = browser.close();
        // The finally block awaits the result; do not leave an unhandled rejection in an abort listener.
        closing.catch(() => {});
      }
    };
    signal.addEventListener('abort', closeBrowser, { once: true });
    try {
      signal.throwIfAborted();
      const storageState = await loadStorageState();
      signal.throwIfAborted();
      browser = await chromium.launch({ headless: true });
      signal.throwIfAborted();
      return await collectUniquePlay({ browser, storageState, collectionScope: payload.collectionScope,
        leagueId: payload.leagueId || process.env.UNIQUEPLAY_LEAGUE_ID || '57',
        seasonYear: Number(payload.seasonYear || process.env.UNIQUEPLAY_SEASON_YEAR || 2026), progress });
    } finally {
      signal.removeEventListener('abort', closeBrowser);
      try {
        closeBrowser();
        await closing;
        if (browser?.isConnected()) throw new Error('Browser remains connected');
      } catch {
        throw Object.assign(new Error('BROWSER_STOP_NOT_CONFIRMED'), { code: 'BROWSER_STOP_NOT_CONFIRMED' });
      }
    }
  },
});
await runs.initialize();
function authorized(request) {
  const actual = Buffer.from(String(request.headers.authorization || '').replace(/^Bearer\s+/i, ''));
  const expected = Buffer.from(expectedToken);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
function sendJson(response, status, data) {
  response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  response.end(JSON.stringify(data));
}
async function readBody(request) {
  let size = 0; const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 65536) throw Object.assign(new Error('REQUEST_TOO_LARGE'), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('INVALID_JSON'), { status: 400 }); }
}
createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://worker.local');
    if (request.method === 'GET' && url.pathname === '/health') {
      const health = runs.health();
      return sendJson(response, health.ok ? 200 : 503, { ...health, adapterVersion: ADAPTER_VERSION });
    }
    if (!authorized(request)) return sendJson(response, 401, { error: 'Unauthorized' });
    if (request.method === 'GET' && url.pathname === '/session') {
      try {
        await loadStorageState();
        return sendJson(response, 200, { status: 'READY', connected: true, authenticated: true,
          sessionValidation: 'STORAGE_ONLY', protocolVersion: 2, ...runs.health() });
      } catch { return sendJson(response, 200, { status: 'REAUTH_REQUIRED', connected: false, authenticated: false }); }
    }
    if (request.method === 'POST' && url.pathname === '/collect') {
      const payload = await readBody(request);
      return sendJson(response, 202, { accepted: true, ...await runs.submit(payload) });
    }
    const match = url.pathname.match(/^\/runs\/([0-9a-f-]+)(?:\/(retry|fence|cancel))?$/i);
    if (match && request.method === 'GET' && !match[2]) return sendJson(response, 200, runs.status(match[1]));
    if (match && request.method === 'POST' && match[2] === 'retry') return sendJson(response, 202, await runs.retry(match[1]));
    if (match && request.method === 'POST' && match[2] === 'fence') {
      const body = await readBody(request);
      return sendJson(response, 200, await runs.fence(match[1], body.recoveryId));
    }
    if (match && request.method === 'POST' && match[2] === 'cancel') {
      const body = await readBody(request);
      return sendJson(response, 200, await runs.cancel(match[1], body.cancellationId));
    }
    return sendJson(response, 404, { error: 'Not found' });
  } catch (error) {
    const status = Number(error?.status) || 500;
    return sendJson(response, status, { error: /^[A-Z][A-Z0-9_]+$/.test(error?.code || error?.message || '')
      ? error.code || error.message : 'WORKER_REQUEST_FAILED' });
  }
}).listen(port, '0.0.0.0', () => console.log(`UniquePlay sync worker listening on ${port} (adapter ${ADAPTER_VERSION}, durable protocol 2)`));

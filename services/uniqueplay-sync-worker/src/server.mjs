import { timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { chromium } from 'playwright';
import { ADAPTER_VERSION, collectUniquePlay } from './adapter.mjs';
import { loadStorageState } from './session.mjs';

const port = Number(process.env.PORT || 8080);
const expectedToken = process.env.SYNC_SERVICE_TOKEN || '';
const callbackBase = (process.env.SYNC_BACKEND_CALLBACK_URL || '').replace(/\/$/, '');
const activeRuns = new Set();

function sendJson(response, status, payload) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(payload));
}

function isAuthorized(request) {
  if (!expectedToken) return false;
  const supplied = String(request.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const expected = Buffer.from(expectedToken);
  const actual = Buffer.from(supplied);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64 * 1024) throw Object.assign(new Error('Request too large'), { status: 413 });
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

async function callback(runId, path, payload) {
  if (!callbackBase) throw new Error('SYNC_BACKEND_CALLBACK_URL is not configured');
  const response = await fetch(`${callbackBase}/api/internal/sync/unique-play/runs/${encodeURIComponent(runId)}/${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${expectedToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Backend callback failed (${response.status})`);
}

async function executeRun(payload) {
  const runId = String(payload.runId || '');
  if (!runId || activeRuns.has(runId)) return;
  activeRuns.add(runId);
  let browser;
  try {
    const storageState = await loadStorageState();
    browser = await chromium.launch({ headless: true });
    const result = await collectUniquePlay({
      browser,
      storageState,
      leagueId: payload.leagueId || process.env.UNIQUEPLAY_LEAGUE_ID || '57',
      seasonYear: Number(payload.seasonYear || process.env.UNIQUEPLAY_SEASON_YEAR || 2026),
      progress: (event) => callback(runId, 'progress', event),
    });
    await callback(runId, 'candidate', result);
  } catch (error) {
    await callback(runId, 'failed', { code: error?.code || 'COLLECTION_FAILED', message: String(error?.message || 'Collection failed') }).catch(() => {});
  } finally {
    activeRuns.delete(runId);
    await browser?.close();
  }
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', 'http://localhost');
    if (request.method === 'GET' && url.pathname === '/health') return sendJson(response, 200, { ok: true, activeRuns: activeRuns.size, adapterVersion: ADAPTER_VERSION });
    if (!isAuthorized(request)) return sendJson(response, 401, { error: 'unauthorized' });
    if (request.method === 'GET' && url.pathname === '/session') {
      try {
        await loadStorageState();
        return sendJson(response, 200, { status: 'READY', connected: true });
      } catch (error) {
        return sendJson(response, 200, { status: 'REAUTH_REQUIRED', connected: false, message: String(error?.message || 'Session unavailable') });
      }
    }
    if (request.method === 'POST' && url.pathname === '/collect') {
      const payload = await readBody(request);
      if (!payload.runId) return sendJson(response, 400, { error: 'runId is required' });
      if (activeRuns.has(String(payload.runId))) return sendJson(response, 409, { error: 'run already active' });
      void executeRun(payload);
      return sendJson(response, 202, { accepted: true, runId: String(payload.runId) });
    }
    return sendJson(response, 404, { error: 'not found' });
  } catch (error) {
    return sendJson(response, error?.status || 500, { error: String(error?.message || 'worker failure') });
  }
});

server.listen(port, '0.0.0.0', () => {
  process.stdout.write(`UniquePlay sync worker listening on ${port} (adapter ${ADAPTER_VERSION})\n`);
});

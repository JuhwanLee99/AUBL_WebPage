import assert from 'node:assert/strict';
import http from 'node:http';

// This gate forwards only to the explicitly selected loopback emulator.
// Unlike disableNetwork(), it controls the actual transaction HTTP requests.
export async function firestoreNetworkGate(hostname, port, mode) {
  assert.ok(['127.0.0.1', 'localhost'].includes(hostname));
  assert.ok(Number.isInteger(port) && port > 0 && port <= 65535);
  assert.ok(['all', 'commit'].includes(mode));
  let blocking = true;
  const blocked = [], forwarded = [];
  const isCommit = url => /:commit(?:\?|$)|\/Commit(?:\?|$)/i.test(url);
  const server = http.createServer((request, response) => {
    const url = request.url ?? '/';
    if (blocking && (mode === 'all' || isCommit(url))) {
      blocked.push({ method: request.method, url });
      request.resume();
      response.writeHead(503, { 'content-type': 'application/json', connection: 'close' });
      response.end(JSON.stringify({ error: { code: 503, status: 'UNAVAILABLE', message: 'LOCAL_TEST_NETWORK_CUT' } }));
      return;
    }
    forwarded.push({ method: request.method, url });
    const upstream = http.request({ hostname, port, path: url, method: request.method,
      headers: { ...request.headers, host: `${hostname}:${port}` } }, incoming => {
      response.writeHead(incoming.statusCode ?? 502, incoming.headers);
      incoming.pipe(response);
    });
    upstream.on('error', () => {
      if (!response.headersSent) response.writeHead(502, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: { code: 502, status: 'UNAVAILABLE', message: 'LOCAL_TEST_UPSTREAM_UNAVAILABLE' } }));
    });
    upstream.setTimeout(10000, () => upstream.destroy(new Error('Local emulator forwarding timeout')));
    request.on('aborted', () => upstream.destroy());
    response.on('close', () => { if (!response.writableFinished) upstream.destroy(); });
    request.pipe(upstream);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return {
    port: address.port, blocked, forwarded,
    reconnect() { blocking = false; },
    async close() {
      const closed = new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      server.closeAllConnections();
      await closed;
    },
  };
}

export class ScoringEnvironmentError extends Error {
  code: string;
  constructor(code: string) { super(code); this.code = code; this.name = 'ScoringEnvironmentError'; }
}

type Environment = Readonly<Record<string, string | boolean | undefined>>;
type Endpoint = { host: string; port: number };
export type ScoringEnvironment = { mode: 'production' } | {
  mode: 'local-emulator'; projectId: 'demo-aubl-scoring'; apiOrigin: string;
  auth: Endpoint; firestore: Endpoint; functions: Endpoint;
};
const fail = (code: string): never => { throw new ScoringEnvironmentError(code); };
const value = (env: Environment, name: string) => String(env[name] ?? '').trim();
const loopback = (host: string) => host === 'localhost' || host === '127.0.0.1';

export function localApiOrigin(input: string): string {
  let url: URL;
  try { url = new URL(input); } catch { return fail('local-api-required'); }
  if (url.protocol !== 'http:' || !loopback(url.hostname) || url.username || url.password
    || url.search || url.hash || url.pathname !== '/') return fail('local-api-required');
  return url.origin;
}

function endpoint(env: Environment, service: string, defaultPort: number): Endpoint {
  const host = value(env, `VITE_${service}_EMULATOR_HOST`) || '127.0.0.1';
  const raw = value(env, `VITE_${service}_EMULATOR_PORT`) || String(defaultPort);
  if (!loopback(host) || !/^\d+$/.test(raw)) return fail('invalid-emulator-endpoint');
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return fail('invalid-emulator-endpoint');
  return { host, port };
}

export function resolveScoringEnvironment(env: Environment): ScoringEnvironment {
  const legacy = value(env, 'VITE_USE_FIRESTORE_EMULATOR');
  if (legacy && !['true', 'false'].includes(legacy)) return fail('invalid-emulator-flag');
  const mode = value(env, 'VITE_SCORING_EXECUTION_MODE') || (legacy === 'true' ? 'local-emulator' : 'production');
  // No escape hatch: scoped writer, server grants and readiness gates are not connected yet.
  if (mode === 'production-test') return fail('production-test-not-ready');
  if (mode === 'production') {
    if (legacy === 'true') return fail('conflicting-execution-mode');
    return { mode };
  }
  if (mode !== 'local-emulator') return fail('invalid-execution-mode');
  if (legacy === 'false') return fail('conflicting-execution-mode');
  if (value(env, 'VITE_FIREBASE_PROJECT_ID') !== 'demo-aubl-scoring') return fail('demo-project-required');
  if (!loopback(value(env, 'VITE_FIREBASE_AUTH_DOMAIN'))) return fail('local-auth-domain-required');
  const apiOrigin = localApiOrigin(value(env, 'VITE_BACKEND_API_URL'));
  for (const key of ['VITE_BACKEND_PROXY_TARGET', 'VITE_BACKEND_TEST_URL']) {
    const target = value(env, key);
    if (target && localApiOrigin(target) !== apiOrigin) return fail('conflicting-local-api');
  }
  if (value(env, 'VITE_FIREBASE_APPCHECK_SITE_KEY')) return fail('local-app-check-not-supported');
  const auth = endpoint(env, 'AUTH', 9099);
  const firestore = endpoint(env, 'FIRESTORE', 8088);
  const functions = endpoint(env, 'FUNCTIONS', 5001);
  if (new Set([auth.port, firestore.port, functions.port, Number(new URL(apiOrigin).port || 80)]).size !== 4)
    return fail('emulator-port-collision');
  return { mode, projectId: 'demo-aubl-scoring', apiOrigin, auth, firestore, functions };
}

export const LOCAL_SCORING_CSP = "connect-src 'self' http://127.0.0.1:* http://localhost:* ws://127.0.0.1:* ws://localhost:*; frame-src 'self' http://127.0.0.1:* http://localhost:*; form-action 'self' http://127.0.0.1:* http://localhost:*";

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
import { chromium } from '../services/uniqueplay-sync-worker/node_modules/playwright/index.mjs';

// Actual Layout + LoginPage, with every auth/store/bridge boundary replaced by
// inert fixtures. Never submit real credentials, open providers or change users.
const virtual = new Map([
  ['login-fixture-state', `
    export let scenario = {};
    export const telemetry = { calls: [] };
    export const configure = value => { scenario = value; telemetry.calls = []; };
    export const call = async method => { telemetry.calls.push(method); if (scenario.error) throw new Error(scenario.error); };
  `],
  ['login-fixture-auth', `
    import { call, scenario } from '/login-fixture-state';
    const auth = { user: null, initializing: false, error: null,
      loginWithEmail: () => call('email'), registerWithEmail: () => call('register'),
      loginWithGoogle: async () => { await call('google'); return { isNewUser: false }; },
      loginWithApple: async () => { await call('apple'); return { isNewUser: false }; },
      logout: () => call('logout'),
    };
    export const useAuth = () => ({ ...auth, error: scenario.visibleError ?? null });
  `],
  ['login-fixture-firebase', `export const auth = { currentUser: null };`],
  ['login-fixture-bridge', `
    import { call } from '/login-fixture-state';
    export const hasFlutterBridge = () => false;
    export const requestNativeGoogleSignInFromFlutter = () => call('native-google');
    export const sendLoginSuccessToFlutter = () => call('native-success');
  `],
  ['login-fixture-admin', `export const useAdmin = () => ({ isAdmin: false, canUseScorekeeper: false, canEditGameRecords: false });`],
  ['login-fixture-flags', `export const useFeatureFlags = () => ({ allstarEnabled: false });`],
  ['login-fixture-content', `export const ContentProvider = ({ children }) => children;`],
  ['login-fixture-store', `const state = { matches: [], activeMatchId: null }; export const useDemoStore = () => ({ state });`],
  ['login-fixture-entry', `
    import React from 'react'; import { createRoot } from 'react-dom/client';
    import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
    import Layout from '/src/app/Layout.tsx'; import LoginPage from '/src/app/pages/LoginPage.tsx';
    import { configure, telemetry } from '/login-fixture-state';
    import '/src/index.css';
    const root = createRoot(document.getElementById('root'));
    function LocationMarker({ version }) { const location = useLocation(); return React.createElement('output', { hidden: true, id: 'fixture-location', 'data-version': version }, location.pathname + location.search); }
    window.renderLoginFixture = (scenario, version) => {
      configure(scenario);
      document.documentElement.dataset.theme = scenario.theme ?? 'light';
      localStorage.setItem('aubl:notificationPrompt:v1', JSON.stringify({ snoozedUntil: Date.now() + 86400000 }));
      root.render(React.createElement(MemoryRouter, { key: version, initialEntries: [scenario.url ?? '/login?next=/fixture-destination'] },
        React.createElement(LocationMarker, { version }),
        React.createElement(Routes, null, React.createElement(Route, { element: React.createElement(Layout) },
          React.createElement(Route, { path: '/login', element: React.createElement(LoginPage) }),
          React.createElement(Route, { path: '/fixture-destination', element: React.createElement('h1', null, 'Fixture destination') })
        ))));
    };
    window.loginFixtureTelemetry = telemetry;
  `],
]);
const mocks = new Map([
  ['/shared/auth/AuthProvider', 'login-fixture-auth'],
  ['/shared/auth/useAdmin', 'login-fixture-admin'],
  ['/shared/firebase/client', 'login-fixture-firebase'],
  ['/shared/bridge/flutterBridge', 'login-fixture-bridge'],
  ['/shared/config/FeatureFlagsProvider', 'login-fixture-flags'],
  ['/shared/state/contentProvider', 'login-fixture-content'],
  ['/shared/state/demoStore', 'login-fixture-store'],
]);
const vite = await createServer({
  configFile: false, envDir: false, cacheDir: '.tmp/login-layout-test-cache', esbuild: { jsx: 'automatic' },
  optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-router-dom'] },
  server: { host: '127.0.0.1', port: 5185, strictPort: true, watch: null, hmr: false, ws: false }, appType: 'custom',
  plugins: [{
    name: 'login-layout-fixture', enforce: 'pre',
    resolveId(id) {
      for (const [suffix, name] of mocks) if (id.endsWith(suffix)) return '\0' + name;
      const name = id.replace(/^\//, '');
      if (virtual.has(name)) return '\0' + name;
    },
    load(id) { return virtual.get(id.replace(/^\0/, '')); },
    configureServer(server) {
      server.middlewares.use('/__login-fixture', async (_req, res) => {
        res.setHeader('Content-Type', 'text/html');
        res.end(await server.transformIndexHtml('/__login-fixture', '<!doctype html><html lang="ko"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/login-fixture-entry"></script></body></html>'));
      });
    },
  }],
});

const luminance = value => {
  const channels = value.match(/[\d.]+/g).slice(0, 3).map(Number);
  const values = channels.map(n => value.startsWith('color(srgb') ? n : n / 255)
    .map(n => n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4);
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
};
let browser;
try {
  await vite.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.goto('http://127.0.0.1:5185/__login-fixture');
  await page.waitForFunction(() => typeof window.renderLoginFixture === 'function');
  let version = 0;
  const render = async changes => {
    version++;
    await page.evaluate(({ changes, version }) => window.renderLoginFixture(changes, version), { changes, version });
    await page.locator(`#fixture-location[data-version="${version}"]`).waitFor({ state: 'attached' });
    await page.locator('.auth-shell').waitFor();
    await page.mouse.move(0, 0);
    await page.evaluate(() => document.fonts.ready);
  };
  const geometry = () => page.evaluate(() => {
    const box = selector => {
      const rect = document.querySelector(selector).getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, bottom: rect.bottom, right: rect.right };
    };
    return { viewport: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth,
      hero: box('.auth-hero'), form: box('.auth-card'), tips: box('.auth-tips-bottom'), title: box('.auth-hero h1'),
      legacy: document.querySelector('.app-main').classList.contains('season-detail-scope'),
    };
  });
  const layoutCheck = async width => {
    const g = await geometry();
    assert.ok(g.scroll <= g.viewport + 1, JSON.stringify(g));
    assert.equal(g.legacy, false, 'Login must not inherit the legacy detail bridge');
    assert.ok(g.title.y - g.hero.y < 70, 'Hero text must not be pushed to the bottom of a tall blank panel');
    if (width > 900) {
      assert.ok(Math.abs(g.hero.y - g.form.y) <= 1, 'Desktop columns share a top edge');
      assert.ok(g.tips.x < g.form.x && g.tips.y >= g.hero.bottom, 'Tips sit below intro in the left column');
      assert.ok(g.hero.right + 20 <= g.form.x, 'Columns do not overlap');
    } else {
      assert.ok(g.form.y >= g.hero.bottom + 16, 'Mobile form follows compact intro');
      assert.ok(g.tips.y >= g.form.bottom + 16, 'Mobile tips follow form');
    }
    for (const selector of ['.auth-tab', '.auth-input', '.auth-submit', '.auth-google', '.auth-apple']) {
      const bounds = await page.locator(selector).evaluateAll(nodes => nodes.map(node => {
        const r = node.getBoundingClientRect(); return { width: r.width, height: r.height, x: r.x, right: r.right };
      }));
      for (const b of bounds) {
        assert.ok(b.height >= 44, selector + JSON.stringify(b));
        assert.ok(b.x >= g.form.x && b.right <= g.form.right, selector + ' stays inside its card');
      }
    }
    const styles = await page.locator('.auth-submit').evaluate(el => ({ color: getComputedStyle(el).color, background: getComputedStyle(el).backgroundColor, radius: getComputedStyle(el).borderRadius }));
    const a = luminance(styles.color), b = luminance(styles.background);
    assert.ok((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 4.5, JSON.stringify(styles));
    assert.equal(styles.radius, '4px');
    assert.ok(await page.locator('.auth-input').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize)) >= 16);
  };

  for (const width of [320, 360, 390, 768, 900, 960, 1280, 1920]) for (const theme of ['light', 'dark']) {
    await test(`login/register ${width}px ${theme}: balanced layout, controls, contrast and no overflow`, async () => {
      await page.setViewportSize({ width, height: 950 });
      await render({ theme });
      await layoutCheck(width);
      if ([360, 1280].includes(width)) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ fullPage: true, path: `.tmp/login-${theme}-${width}.png` });
      }
      await page.getByRole('button', { name: '회원가입', exact: true }).click();
      await page.getByLabel('비밀번호 확인', { exact: true }).waitFor();
      await layoutCheck(width);
      assert.equal(await page.getByRole('button', { name: '회원가입', exact: true }).getAttribute('aria-pressed'), 'true');
      assert.deepEqual(await page.evaluate(() => window.loginFixtureTelemetry.calls), []);
    });
  }

  await test('global stylesheet ordering cannot reintroduce the retired rounded/gradient auth styles', async () => {
    await page.setViewportSize({ width: 1280, height: 950 });
    await render({ theme: 'dark' });
    await page.evaluate(() => {
      const styles = Array.from(document.querySelectorAll('style'));
      const global = styles.find(style => style.dataset.viteDevId?.endsWith('/src/index.css'));
      if (!global) throw new Error('Global fixture stylesheet missing');
      document.head.append(global);
    });
    await layoutCheck(1280);
    assert.equal(await page.locator('.auth-card').evaluate(el => getComputedStyle(el).boxShadow), 'none');
  });
  await test('keyboard focus, autofill fields and email login redirect remain intact', async () => {
    await render({});
    const email = page.getByLabel('이메일', { exact: true });
    await email.focus(); await page.keyboard.press('Tab');
    assert.equal(await page.getByLabel('비밀번호', { exact: true }).evaluate(el => el === document.activeElement), true);
    assert.notEqual(await page.getByLabel('비밀번호', { exact: true }).evaluate(el => getComputedStyle(el).outlineStyle), 'none');
    assert.equal(await email.getAttribute('autocomplete'), 'email');
    assert.equal(await page.getByLabel('비밀번호', { exact: true }).getAttribute('autocomplete'), 'current-password');
    await email.fill('fixture@example.invalid');
    await page.getByLabel('비밀번호', { exact: true }).fill('fixture-only-password');
    await page.locator('.auth-submit').click();
    await page.getByRole('heading', { name: 'Fixture destination' }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.loginFixtureTelemetry.calls), ['email']);
    assert.equal(await page.locator('main').evaluate(el => el.classList.contains('season-detail-scope')), true, 'Other detail pages retain their bridge');
  });
  await test('submit hover keeps readable contrast in both themes', async () => {
    await page.setViewportSize({ width: 1280, height: 950 });
    for (const theme of ['light', 'dark']) {
      await render({ theme });
      await page.locator('.auth-submit').hover();
      await layoutCheck(1280);
    }
  });
  await test('registration consent and password confirmation checks are preserved', async () => {
    await render({});
    await page.getByRole('button', { name: '회원가입', exact: true }).click();
    await page.getByLabel('이메일', { exact: true }).fill('fixture@example.invalid');
    await page.getByLabel('비밀번호', { exact: true }).fill('fixture-only-password');
    await page.getByLabel('비밀번호 확인', { exact: true }).fill('different-fixture-password');
    await page.locator('.auth-submit').click();
    assert.match(await page.getByRole('alert').innerText(), /동의/);
    await page.locator('.auth-form input[type="checkbox"]').nth(0).check();
    await page.locator('.auth-form input[type="checkbox"]').nth(1).check();
    await page.locator('.auth-submit').click();
    assert.match(await page.getByRole('alert').innerText(), /일치하지 않습니다/);
    assert.deepEqual(await page.evaluate(() => window.loginFixtureTelemetry.calls), []);
    await page.getByLabel('비밀번호 확인', { exact: true }).fill('fixture-only-password');
    await page.locator('.auth-submit').click();
    await page.getByRole('heading', { name: 'Fixture destination' }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.loginFixtureTelemetry.calls), ['register']);
  });
  await test('Google/Apple handlers and long error feedback remain within the card', async () => {
    await page.setViewportSize({ width: 360, height: 900 });
    for (const method of ['google', 'apple']) {
      await render({ error: 'fixture-login-error-' + 'long-message-'.repeat(20), theme: 'dark' });
      await page.locator('.auth-' + method).click();
      await page.getByRole('alert').waitFor();
      await layoutCheck(360);
      assert.deepEqual(await page.evaluate(() => window.loginFixtureTelemetry.calls), [method]);
    }
  });
  await test('embedded Flutter modes keep native consent and do not acquire browser auth', async () => {
    await page.setViewportSize({ width: 360, height: 760 });
    await render({ url: '/login?embedded=flutter' });
    assert.equal(await page.locator('.auth-google, .auth-apple').count(), 0);
    assert.equal(await page.locator('.app-header').count(), 0);
    await render({ url: '/login?embedded=flutter&nativeGoogle=1' });
    await page.locator('.auth-google').click();
    await page.getByRole('dialog').waitFor();
    assert.deepEqual(await page.evaluate(() => window.loginFixtureTelemetry.calls), []);
    assert.equal(await page.getByRole('button', { name: '동의 후 계속하기' }).isEnabled(), false);
    const box = await page.getByRole('dialog').boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 360 && box.height <= 760);
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('.auth-google').evaluate(el => el === document.activeElement), true);
  });
  await test('200% text scaling and reduced motion preserve a contained, scrollable login form', async () => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await render({ theme: 'dark' });
    await page.evaluate(() => {
      // Simulate browser minimum-font/text enlargement, including pixel-based controls.
      for (const el of document.querySelectorAll('.auth-shell h1, .auth-shell p, .auth-shell button, .auth-label, .auth-input, .auth-tips strong, .auth-footer--legal')) {
        el.style.fontSize = (parseFloat(getComputedStyle(el).fontSize) * 2) + 'px';
      }
    });
    await layoutCheck(360);
    const transition = await page.locator('.auth-submit').evaluate(el => getComputedStyle(el).transitionDuration);
    assert.equal(transition, '0s');
  });
  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  await vite.close();
}

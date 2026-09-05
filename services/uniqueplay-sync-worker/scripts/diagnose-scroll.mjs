// Operator-only, bounded read-only provider diagnostic. No server import,
// callbacks, candidate creation, publication, HTML dumps or session output.
// Run explicitly from this checkout or translate imports to /app for the NAS
// Exec console. This is not copied into the worker image or exposed as an API.
import { chromium } from 'playwright';
import { loadStorageState } from '../src/session.mjs';
import { scrollCollectionDom } from '../src/collection-scroll.mjs';

const browser = await chromium.launch({ headless: true });
const headers = ['타율', '팀게임', '선수게임', '타석', '타수', '총안타', '1루타', '2루타', '3루타', '홈런', '타점', '득점', '도루', '볼넷', '삼진', '출루율', '장타율', 'OPS'];
const options = { kind: 'table', anchor: '타율', expectedHeaders: headers };
let phase = 'SESSION';
try {
  const leagueId = process.env.UNIQUEPLAY_LEAGUE_ID;
  const seasonYear = process.env.UNIQUEPLAY_SEASON_YEAR;
  if (!/^\d+$/u.test(leagueId || '') || !/^20\d{2}$/u.test(seasonYear || '')) throw new Error('Diagnostic configuration missing');
  const context = await browser.newContext({ storageState: await loadStorageState(), locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
  const page = await context.newPage();
  phase = 'OPEN_LEAGUE';
  await page.goto(`https://unique-play.com/league/${leagueId}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1000);
  const click = async (text) => {
    phase = text;
    const locator = page.getByText(text, { exact: true }).first();
    await locator.waitFor({ state: 'visible', timeout: 10000 });
    const ancestor = locator.locator('xpath=ancestor-or-self::*[@role="button" or @tabindex="0"][1]');
    await (await ancestor.count() ? ancestor : locator).click({ force: true });
    await page.waitForTimeout(500);
  };
  phase = 'OPEN_A_BATTER_IN';
  await click('기록');
  phase = 'SEASON';
  await page.getByText(`${seasonYear}시즌`, { exact: true }).first().waitFor({ state: 'visible', timeout: 10000 });
  await click('개인순위');
  await click('규정 IN');
  await click('타자순위');
  const metrics = async () => page.evaluate((expected) => {
    const normal = (value) => String(value ?? '').normalize('NFKC').replace(/\s+/gu, ' ').replace(/[▲▼]/gu, '').trim();
    const head = [...document.querySelectorAll('*')].find((node) => normal(node.textContent) === '타율' && node.children.length <= 1
      && expected.every((header, index) => normal(node.parentElement?.children[index]?.textContent) === header));
    if (!head) return { found: false };
    const rows = head.parentElement.parentElement.children.length - 1;
    const scrollers = [];
    for (let node = head; node; node = node.parentElement) {
      const css = getComputedStyle(node);
      if (css.overflowY === 'auto' || css.overflowY === 'scroll') scrollers.push({
        tag: node.tagName, height: node.clientHeight, total: node.scrollHeight, top: node.scrollTop,
        native: /\[native code\]/u.test(Function.prototype.toString.call(node.scrollTo)),
        ownMethod: Object.prototype.hasOwnProperty.call(node, 'scrollTo'), behavior: css.scrollBehavior,
      });
    }
    return { found: true, rows, scrollers };
  }, headers);
  phase = 'COMPARE_METHODS';
  console.log(JSON.stringify({ phase, before: await metrics() }));
  console.log(JSON.stringify({ method: 'installed-adapter', immediate: await page.evaluate(scrollCollectionDom, options) }));
  await page.waitForTimeout(1000);
  console.log(JSON.stringify({ method: 'installed-adapter', after: await metrics() }));
  // Bounded recreation of v9's direct property assignment, on the exact same
  // public table. Do not collect names/values or save source records.
  for (let index = 0; index < 4; index += 1) {
    const step = await page.evaluate((expected) => {
      const normal = (value) => String(value ?? '').normalize('NFKC').replace(/\s+/gu, ' ').replace(/[▲▼]/gu, '').trim();
      const head = [...document.querySelectorAll('*')].find((node) => normal(node.textContent) === '타율' && node.children.length <= 1
        && expected.every((header, i) => normal(node.parentElement?.children[i]?.textContent) === header));
      let target = head?.parentElement?.parentElement?.parentElement;
      while (target && target !== document.body && target.scrollHeight <= target.clientHeight + 2) target = target.parentElement;
      if (!target || target === document.body) return { found: false };
      const before = target.scrollTop;
      target.scrollTop = Math.min(target.scrollHeight, before + Math.max(180, Math.floor(target.clientHeight * .8)));
      return { found: true, before, after: target.scrollTop, height: target.clientHeight, total: target.scrollHeight };
    }, headers);
    await page.waitForTimeout(500);
    console.log(JSON.stringify({ method: 'v9-property', index, step, after: await metrics() }));
  }
  // Prove that the installed helper (not merely the legacy reproduction) can
  // advance from the top and terminate. Otherwise the legacy comparison could
  // park at the bottom and let a broken installed helper appear to succeed.
  // Bounded to one A-group public batter table.
  phase = 'VERIFY_STABLE_END';
  await page.evaluate(() => {
    for (const node of document.querySelectorAll('*')) if (node.scrollTop > 0) node.scrollTop = 0;
  });
  await page.waitForTimeout(500);
  const initial = await page.evaluate(scrollCollectionDom, { ...options, inspectOnly: true });
  const needsMovement = initial.total > initial.height + 2;
  let helperAdvanced = false;
  let stable = 0;
  let previousRows = -1;
  let scroll;
  let snapshot;
  for (let pass = 0; pass < 24 && stable < 3; pass += 1) {
    snapshot = await metrics();
    scroll = await page.evaluate(scrollCollectionDom, options);
    helperAdvanced ||= scroll.advanced;
    stable = snapshot.found && snapshot.rows === previousRows && scroll.atEnd && !scroll.advanced ? stable + 1 : 0;
    previousRows = snapshot.rows;
    await page.waitForTimeout(500);
  }
  console.log(JSON.stringify({ phase, stableReads: stable, rows: snapshot.rows, helperAdvanced, scroll }));
  if (stable < 3 || (needsMovement && !helperAdvanced)) throw new Error('Stable end not reached');
  console.log('DIAGNOSTIC_COMPLETE_NO_CANDIDATE');
} catch {
  console.log(JSON.stringify({ error: 'DIAGNOSTIC_FAILED', phase }));
  process.exitCode = 1;
} finally {
  await browser.close();
}

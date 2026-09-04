import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
import { createUniquePlayStorageState, encryptStorageState } from '../src/session.mjs';

const outputPath = process.env.UNIQUEPLAY_SESSION_PATH || './uniqueplay-session.enc';
const leagueId = process.env.UNIQUEPLAY_LEAGUE_ID || '57';
const endpoint = process.env.UNIQUEPLAY_CDP_URL || 'http://127.0.0.1:9222';

const browser = await chromium.connectOverCDP(endpoint);
try {
  const context = browser.contexts()[0];
  if (!context) throw new Error('연결된 Chrome 프로필을 찾을 수 없습니다.');

  let page = context.pages().find((candidate) => candidate.url().includes('unique-play.com'));
  if (!page) {
    page = await context.newPage();
    await page.goto(`https://unique-play.com/league/${encodeURIComponent(leagueId)}`);
  }

  const hasRecords = await page.getByText('기록', { exact: true }).first().isVisible().catch(() => false);
  if (!hasRecords) throw new Error('로그인된 UniquePlay 리그 화면을 확인할 수 없습니다.');

  const browserState = await context.storageState({ indexedDB: true });
  const localStorageItems = await page.evaluate(() => Object.entries(globalThis.localStorage).map(([name, value]) => ({ name, value })));
  const state = createUniquePlayStorageState(browserState, page.url(), localStorageItems);
  await writeFile(outputPath, `${encryptStorageState(state)}\n`, { mode: 0o600 });
  process.stdout.write(`암호화된 세션을 ${outputPath}에 저장했습니다.\n`);
} finally {
  await browser.close();
}

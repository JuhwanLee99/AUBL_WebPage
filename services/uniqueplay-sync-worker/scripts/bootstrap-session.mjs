import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { createUniquePlayStorageState, encryptStorageState } from '../src/session.mjs';

const outputPath = process.env.UNIQUEPLAY_SESSION_PATH || './uniqueplay-session.enc';
const leagueId = process.env.UNIQUEPLAY_LEAGUE_ID || '57';
const browserChannel = process.env.UNIQUEPLAY_BROWSER_CHANNEL?.trim();
const browser = await chromium.launch({
  headless: false,
  ...(browserChannel ? { channel: browserChannel } : {}),
});
const context = await browser.newContext({ locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
const page = await context.newPage();
await page.goto(`https://unique-play.com/league/${encodeURIComponent(leagueId)}`);

const prompt = createInterface({ input, output });
await prompt.question('브라우저에서 로그인을 완료한 뒤 Enter를 누르세요. ');
prompt.close();

const hasRecords = await page.getByText('기록', { exact: true }).first().isVisible().catch(() => false);
if (!hasRecords) {
  await browser.close();
  throw new Error('로그인된 리그 화면을 확인할 수 없습니다.');
}
const browserState = await context.storageState({ indexedDB: true });
const localStorageItems = await page.evaluate(() => Object.entries(globalThis.localStorage).map(([name, value]) => ({ name, value })));
const state = createUniquePlayStorageState(browserState, page.url(), localStorageItems);
await writeFile(outputPath, `${encryptStorageState(state)}\n`, { mode: 0o600 });
await browser.close();
output.write(`암호화된 세션을 ${outputPath}에 저장했습니다. 비밀 저장소로 옮긴 뒤 로컬 파일을 폐기하세요.\n`);

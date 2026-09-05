import { deterministicGameId, normalizeText, sanitizeCandidate } from './normalization.mjs';
import { validateCandidate } from './validation.mjs';
import { readOpenGameBoxscore, resultListIsReady } from './boxscore-adapter.mjs';
import { contextualizeDetailError, detailError } from './game-details.mjs';

export const ADAPTER_VERSION = '2026.09.05.7';
const GROUP_CODES = [...'ABCDEFGH'];
const BATTER_HEADERS = ['타율', '팀게임', '선수게임', '타석', '타수', '총안타', '1루타', '2루타', '3루타', '홈런', '타점', '득점', '도루', '볼넷', '삼진', '출루율', '장타율', 'OPS'];
const PITCHER_HEADERS = ['ERA', '팀게임', '선수게임', '이닝', '승', '패', '세이브', '홀드', '삼진', '피안타', '피홈런', '실점', '볼넷', '사구', '승률', 'WHIP'];
const PITCHER_STAT_KEYS = PITCHER_HEADERS.map((header) => header === '삼진' ? '탈삼진' : header);
const STANDING_HEADERS = ['게임수', '승률', '승', '패', '무', '승점', '게임차'];

export function statusFromKorean(value) {
  const text = String(value || '').trim();
  if (/경기전|예정/.test(text)) return 'SCHEDULED';
  if (/진행|LIVE|라이브/i.test(text)) return 'IN_PROGRESS';
  if (/종료|경기끝|몰수|콜드|기권|부전승/.test(text)) return 'COMPLETED';
  if (/취소/.test(text)) return 'CANCELED';
  if (/서스펜디드|중단/.test(text)) return 'SUSPENDED';
  return text || 'UNKNOWN';
}

function toKstIso(seasonYear, dateTimeText) {
  const match = String(dateTimeText || '').match(/(\d{2})\/(\d{2})\s+\S+\s+(\d{2}):(\d{2})/u);
  if (!match) return '';
  return `${seasonYear}-${match[1]}-${match[2]}T${match[3]}:${match[4]}:00+09:00`;
}

async function clickText(page, text) {
  const locator = page.getByText(text, { exact: true }).first();
  await locator.waitFor({ state: 'visible', timeout: 10_000 });
  const interactiveAncestor = locator.locator('xpath=ancestor-or-self::*[@role="button" or @tabindex="0"][1]');
  const target = await interactiveAncestor.count() ? interactiveAncestor : locator;
  await target.click({ force: true });
  await page.waitForTimeout(250);
}

async function ensureSeason(page, seasonYear) {
  const expected = `${seasonYear}시즌`;
  const season = page.getByText(expected, { exact: true }).first();
  if (!(await season.isVisible().catch(() => false))) {
    throw Object.assign(new Error(`Expected season label not found: ${expected}`), { code: 'SEASON_MISMATCH' });
  }
}

async function ensureGameSeason(page, seasonYear) {
  // Schedule/result controls use “2026년”, unlike the records tab's “2026시즌”.
  const expected = `${seasonYear}년`;
  if (await page.getByText('전체 시즌', { exact: true }).first().isVisible().catch(() => false)) {
    await clickText(page, '전체 시즌');
    await clickText(page, expected);
  }
  if (!(await page.getByText(expected, { exact: true }).first().isVisible().catch(() => false))) {
    throw Object.assign(new Error('Expected game-list season selector was not found'), { code: 'SEASON_MISMATCH' });
  }
}

async function readVisibleTable(page, anchor, expectedHeaders) {
  return page.evaluate(({ anchor, expectedHeaders }) => {
    const normalize = (value) => String(value || '').normalize('NFKC').replace(/\s+/g, ' ').replace(/[▲▼]/g, '').trim();
    const all = [...document.querySelectorAll('*')];
    const headerCandidates = all.filter((node) => normalize(node.textContent) === anchor && node.children.length <= 1);
    if (!headerCandidates.length) return { rows: [], scroll: null, reason: `header:${anchor}:missing` };
    let headerCell = null;
    let headerRow = null;
    let observedHeaders = [];
    for (const candidate of headerCandidates) {
      const candidateRow = candidate.parentElement;
      const candidateHeaders = candidateRow ? [...candidateRow.children].map((node) => normalize(node.textContent)) : [];
      if (candidateHeaders.length > observedHeaders.length) observedHeaders = candidateHeaders;
      if (expectedHeaders.every((header, index) => candidateHeaders[index] === header)) {
        headerCell = candidate;
        headerRow = candidateRow;
        break;
      }
    }
    if (!headerCell || !headerRow) return { rows: [], scroll: null, reason: `headers:${observedHeaders.join('|')}` };
    const valuesRoot = headerRow?.parentElement;
    let tableRoot = headerCell;
    for (let depth = 0; depth < 5 && tableRoot; depth += 1) tableRoot = tableRoot.parentElement;
    const fixedRoot = tableRoot?.children?.[0];
    if (!headerRow || !valuesRoot || !fixedRoot) return { rows: [], scroll: null, reason: 'table-structure' };

    const fixedRows = [...fixedRoot.children]
      .map((node) => [...node.querySelectorAll('*')]
        .filter((cell) => cell.children.length === 0)
        .map((cell) => normalize(cell.textContent))
        .filter(Boolean))
      .filter((cells) => cells.length >= 2 && /^\d+$/.test(cells[0]));
    const valueRows = [...valuesRoot.children].slice(1).map((node) => [...node.children].map((cell) => normalize(cell.textContent)));
    const rows = fixedRows.slice(0, valueRows.length).map((fixed, index) => ({ fixed, values: valueRows[index] }));

    let scroll = valuesRoot.parentElement;
    while (scroll && scroll !== document.body && scroll.scrollHeight <= scroll.clientHeight + 2) scroll = scroll.parentElement;
    return {
      rows,
      scroll: scroll && scroll !== document.body ? { top: scroll.scrollTop, height: scroll.clientHeight, total: scroll.scrollHeight } : null,
      reason: null,
    };
  }, { anchor, expectedHeaders });
}

async function scrollTable(page, anchor) {
  return page.evaluate((anchor) => {
    const normalize = (value) => String(value || '').normalize('NFKC').replace(/\s+/g, ' ').replace(/[▲▼]/g, '').trim();
    const headerCell = [...document.querySelectorAll('*')].find((node) => normalize(node.textContent) === anchor && node.children.length <= 1);
    let scroll = headerCell?.parentElement?.parentElement?.parentElement;
    while (scroll && scroll !== document.body && scroll.scrollHeight <= scroll.clientHeight + 2) scroll = scroll.parentElement;
    if (!scroll || scroll === document.body) return false;
    const before = scroll.scrollTop;
    scroll.scrollTop = Math.min(scroll.scrollHeight, before + Math.max(180, Math.floor(scroll.clientHeight * 0.8)));
    return scroll.scrollTop > before;
  }, anchor);
}

async function collectVirtualTable(page, anchor, headers) {
  return collectUntilStable({
    read: () => readVisibleTable(page, anchor, headers),
    advance: () => scrollTable(page, anchor),
    wait: () => page.waitForTimeout(120),
  });
}

export async function collectUntilStable({ read, advance, wait = async () => {}, maxPasses = 100 }) {
  const seen = new Map();
  let unchangedSamples = 0;
  for (let pass = 0; pass < maxPasses && unchangedSamples < 3; pass += 1) {
    const snapshot = await read();
    if (snapshot.reason) throw new Error(`UniquePlay table changed (${snapshot.reason})`);
    const before = seen.size;
    for (const row of snapshot.rows) {
      const key = row.fixed.join('|');
      if (key) seen.set(key, row);
    }
    unchangedSamples = seen.size === before ? unchangedSamples + 1 : 0;
    const advanced = await advance();
    if (!advanced) unchangedSamples += 1;
    await wait();
  }
  return [...seen.values()];
}

export async function collectLazyList({ read, advance, identify, wait = async () => {}, maxPasses = 120 }) {
  const seen = new Map();
  let settledAtEnd = 0;
  for (let pass = 0; pass < maxPasses && settledAtEnd < 3; pass += 1) {
    const rows = await read();
    const before = seen.size;
    for (const row of rows) {
      const key = identify(row);
      if (key) seen.set(key, row);
    }
    const advanced = await advance();
    settledAtEnd = seen.size === before && !advanced ? settledAtEnd + 1 : 0;
    await wait();
  }
  return [...seen.values()];
}

function standingFromRow(row) {
  const [rank, ...rest] = row.fixed;
  const teamName = rest.at(-1) || '';
  return {
    rank,
    teamName,
    games: row.values[0],
    winPct: row.values[1],
    wins: row.values[2],
    losses: row.values[3],
    draws: row.values[4],
    points: row.values[5],
    gamesBehind: row.values[6],
  };
}

function playerFromRow(row, headers, statKeys = headers) {
  const [rank, playerName, ...teamParts] = row.fixed;
  return {
    rank,
    playerName,
    teamName: teamParts.at(-1) || '',
    stats: Object.fromEntries(statKeys.map((header, index) => [header, row.values[index] ?? null])),
  };
}

async function collectGroup(page, groupCode, progress) {
  await clickText(page, '팀순위');
  const standings = (await collectVirtualTable(page, '게임수', STANDING_HEADERS)).map(standingFromRow);
  await progress?.({ stage: 'STANDINGS', groupCode, count: standings.length });

  await clickText(page, '개인순위');
  const result = { standings, batters: { IN: [], OUT: [] }, pitchers: { IN: [], OUT: [] } };
  for (const regulation of ['IN', 'OUT']) {
    await clickText(page, `규정 ${regulation}`);
    await clickText(page, '타자순위');
    result.batters[regulation] = (await collectVirtualTable(page, '타율', BATTER_HEADERS)).map((row) => playerFromRow(row, BATTER_HEADERS));
    await progress?.({ stage: `BATTER_${regulation}`, groupCode, count: result.batters[regulation].length });

    await clickText(page, '투수순위');
    result.pitchers[regulation] = (await collectVirtualTable(page, 'ERA', PITCHER_HEADERS)).map((row) => playerFromRow(row, PITCHER_HEADERS, PITCHER_STAT_KEYS));
    await progress?.({ stage: `PITCHER_${regulation}`, groupCode, count: result.pitchers[regulation].length });
  }
  return result;
}

async function readVisibleGames(page, seasonYear) {
  return page.evaluate((seasonYear) => {
    const datePattern = /^\d{2}\/\d{2}\s+\S+\s+\d{2}:\d{2}$/u;
    const leaves = [...document.querySelectorAll('*')].filter((node) => node.children.length === 0 && datePattern.test((node.textContent || '').trim()));
    return leaves.map((dateLeaf) => {
      const card = dateLeaf.parentElement?.parentElement?.parentElement;
      const texts = card ? [...card.querySelectorAll('*')].filter((node) => node.children.length === 0 && (node.textContent || '').trim()).map((node) => (node.textContent || '').normalize('NFKC').replace(/\s+/g, ' ').trim()) : [];
      if (texts.length < 10) return null;
      return {
        seasonYear,
        dateTimeText: texts[0],
        groupCode: texts[1],
        venue: texts[3],
        homeScore: texts[4],
        awayScore: texts[6],
        homeTeamName: texts[7],
        status: texts[8],
        awayTeamName: texts[9],
      };
    }).filter(Boolean);
  }, seasonYear);
}

async function scrollPageList(page) {
  return page.evaluate(() => {
    const candidates = [...document.querySelectorAll('*')].filter((node) => node.scrollHeight > node.clientHeight + 2);
    const target = candidates.sort(
      (a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight),
    )[0];
    if (!target) return false;
    const before = target.scrollTop;
    target.scrollTop = Math.min(target.scrollHeight, before + Math.max(300, Math.floor(target.clientHeight * 0.8)));
    return target.scrollTop > before;
  });
}

async function collectGameTab(page, label, seasonYear) {
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    for (const node of document.querySelectorAll('*')) {
      if (node.scrollTop) node.scrollTop = 0;
    }
  });
  await page.waitForTimeout(200);
  await clickText(page, label);
  await ensureGameSeason(page, seasonYear);
  return collectLazyList({
    read: async () => (await readVisibleGames(page, seasonYear))
      .filter((game) => /^[A-H]조$/u.test(game.groupCode))
      .map((game) => ({
        ...game,
        playedAt: toKstIso(seasonYear, game.dateTimeText),
        groupCode: game.groupCode.replace(/조$/u, ''),
        sourceStatus: game.status, // Internal evidence for explicit no-record forfeits; sanitizer never publishes this field.
        status: statusFromKorean(game.status),
      })),
    advance: () => scrollPageList(page),
    identify: (game) => [game.playedAt, game.groupCode, game.homeTeamName, game.awayTeamName].join('|'),
    wait: () => page.waitForTimeout(120),
  });
}

function sameGameCard(left, right) {
  return ['dateTimeText', 'venue', 'homeTeamName', 'awayTeamName'].every((key) => normalizeText(left[key]) === normalizeText(right[key]))
    && normalizeText(left.groupCode).replace(/조$/u, '') === normalizeText(right.groupCode).replace(/조$/u, '');
}

async function clickVisibleBoxscore(page, target) {
  const outcome = await page.evaluate((target) => {
    const normalize = (value) => String(value ?? '').normalize('NFKC').replace(/\s+/gu, ' ').trim();
    const datePattern = /^\d{2}\/\d{2}\s+\S+\s+\d{2}:\d{2}$/u;
    const leaves = [...document.querySelectorAll('*')].filter((node) => node.children.length === 0 && datePattern.test(normalize(node.textContent)));
    const matches = leaves.map((leaf) => leaf.parentElement?.parentElement?.parentElement).filter((card) => {
      if (!card) return false;
      const texts = [...card.querySelectorAll('*')].filter((node) => node.children.length === 0 && normalize(node.textContent)).map((node) => normalize(node.textContent));
      return texts[0] === normalize(target.dateTimeText) && texts[1]?.replace(/조$/u, '') === normalize(target.groupCode).replace(/조$/u, '')
        && texts[3] === normalize(target.venue) && texts[7] === normalize(target.homeTeamName) && texts[9] === normalize(target.awayTeamName);
    });
    if (matches.length !== 1) return { error: matches.length ? 'GAME_DETAIL_AMBIGUOUS_CARD' : 'GAME_DETAIL_CARD_MISSING' };
    const buttons = [...matches[0].querySelectorAll('*')].filter((node) => node.children.length === 0 && normalize(node.textContent) === '박스스코어');
    if (buttons.length !== 1) return { error: 'GAME_DETAIL_LINK_MISSING' };
    // React-Native-Web uses a DIV click handler, not an <a> or stable CSS class.
    const interactive = buttons[0].closest('[role="button"], [tabindex="0"]');
    (interactive && matches[0].contains(interactive) ? interactive : buttons[0].parentElement || buttons[0]).click();
    return { clicked: true };
  }, target);
  if (outcome.error) throw detailError(outcome.error);
  try {
    await page.waitForURL((url) => /^\/game\/\d+\/boxscore\/?$/u.test(url.pathname), { timeout: 15_000 });
  } catch {
    if (/\/(?:login|sign-in)(?:\/|$)/u.test(new URL(page.url()).pathname)) throw detailError('REAUTH_REQUIRED');
    throw detailError('GAME_DETAIL_NAVIGATION');
  }
}

export async function collectGameDetails(page, games, { leagueId, seasonYear, progress }) {
  const targets = games.filter((game) => game.status === 'COMPLETED');
  const details = [];
  for (const target of targets) {
    const sourceGameId = target.sourceGameId || deterministicGameId({ ...target, leagueId, seasonYear });
    let providerGameId;
    let stage = 'FIND_CARD';
    try {
      let found = false;
      let settledAtEnd = 0;
      for (let pass = 0; pass < 120 && settledAtEnd < 3; pass += 1) {
        const visible = await readVisibleGames(page, seasonYear);
        const matches = visible.filter((game) => sameGameCard(game, target));
        if (matches.length > 1) throw detailError('GAME_DETAIL_AMBIGUOUS_CARD');
        if (matches.length === 1) { found = true; break; }
        const advanced = await scrollPageList(page);
        settledAtEnd = advanced ? 0 : settledAtEnd + 1;
        await page.waitForTimeout(120);
      }
      if (!found) throw detailError('GAME_DETAIL_CARD_MISSING');
      stage = 'OPEN_BOXSCORE';
      await clickVisibleBoxscore(page, target);
      const detail = await readOpenGameBoxscore(page, sourceGameId, { sourceStatus: target.sourceStatus, expectedGame: target });
      providerGameId = detail.providerGameId;
      details.push(detail);
      stage = 'REPORT_PROGRESS';
      await progress?.({ stage: 'GAME_DETAILS', count: details.length });
      stage = 'RETURN_RESULTS';
      await page.goBack({ waitUntil: 'domcontentloaded', timeout: 30_000 });
      // The results list no longer renders a “게임결과” label after returning.
      // Confirm its actual league route, public controls and dated result cards.
      await page.waitForFunction(resultListIsReady, { leagueId: String(leagueId) }, { timeout: 15_000 });
      await ensureGameSeason(page, seasonYear);
      // Back restores the results tab, but lazy lists can restore a later scroll
      // position. Restart from the top so every expected card remains discoverable.
      await page.evaluate(() => {
        window.scrollTo(0, 0);
        for (const node of document.querySelectorAll('*')) if (node.scrollTop) node.scrollTop = 0;
      });
      await page.waitForTimeout(150);
    } catch (error) {
      throw contextualizeDetailError(error, { stage, sourceGameId, providerGameId });
    }
  }
  return details;
}

export async function collectUniquePlay({ browser, storageState, leagueId, seasonYear, progress }) {
  const context = await browser.newContext({ storageState, locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
  const page = await context.newPage();
  try {
    await page.goto(`https://unique-play.com/league/${encodeURIComponent(leagueId)}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(1_000);
    if (!(await page.getByText('기록', { exact: true }).first().isVisible().catch(() => false))) {
      throw Object.assign(new Error('UniquePlay session expired'), { code: 'REAUTH_REQUIRED' });
    }

    await clickText(page, '기록');
    await ensureSeason(page, seasonYear);
    const groups = {};
    let selectedGroupCode = 'A';
    for (const groupCode of GROUP_CODES) {
      if (groupCode !== selectedGroupCode) {
        await clickText(page, `${selectedGroupCode}조`);
        await clickText(page, `${groupCode}조`);
        selectedGroupCode = groupCode;
      }
      groups[groupCode] = await collectGroup(page, groupCode, progress);
    }

    await clickText(page, '일정결과');
    const scheduled = await collectGameTab(page, '조별일정확인', seasonYear);
    await progress?.({ stage: 'GAMES_SCHEDULED', count: scheduled.length });

    await page.goto(`https://unique-play.com/league/${encodeURIComponent(leagueId)}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(500);
    await clickText(page, '일정결과');
    const completed = await collectGameTab(page, '게임결과', seasonYear);
    await progress?.({ stage: 'GAMES_COMPLETED', count: completed.length });
    const games = [...new Map([...scheduled, ...completed].map((game) => [[game.playedAt, game.groupCode, game.homeTeamName, game.awayTeamName].join('|'), game])).values()];
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      for (const node of document.querySelectorAll('*')) if (node.scrollTop) node.scrollTop = 0;
    });
    const gameDetails = await collectGameDetails(page, games, { leagueId, seasonYear, progress }).catch((error) => {
      throw contextualizeDetailError(error, { stage: 'COLLECTION' });
    });

    const candidate = sanitizeCandidate({ groups, games, gameDetails }, { leagueId, seasonYear, adapterVersion: ADAPTER_VERSION });
    const validation = validateCandidate(candidate);
    return { candidate, validation };
  } finally {
    await context.close();
  }
}

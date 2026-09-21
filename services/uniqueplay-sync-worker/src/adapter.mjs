import { deterministicGameId, normalizeText, sanitizeCandidate } from './normalization.mjs';
import { validateCandidate } from './validation.mjs';
import { validateCollectionScope, includesGameDate } from './collection-scope.mjs';
import { readOpenGameBoxscore, resultListIsReady } from './boxscore-adapter.mjs';
import { contextualizeDetailError, detailError } from './game-details.mjs';
import { reachedCollectionEnd, scrollCollectionDom } from './collection-scroll.mjs';
import { auditStandings } from './standings-audit.mjs';
import { standingsConflictError } from './standings-diagnostics.mjs';
import { contextualizeCollectionError, readReadyTable, withCollectionContext } from './collection-diagnostics.mjs';

export const ADAPTER_VERSION = '2026.09.22.1';
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
  try {
    await season.waitFor({ state: 'visible', timeout: 10_000 });
  } catch {
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

export async function readVisibleTable(page, anchor, expectedHeaders) {
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
      if (candidateHeaders.length === expectedHeaders.length && expectedHeaders.every((header, index) => candidateHeaders[index] === header)) {
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
    const valueNodes = [...valuesRoot.children].slice(1);
    if (fixedRows.length !== valueNodes.length || (anchor === '게임수' && !fixedRows.length)) {
      return { rows: [], reason: 'standings-row-count-mismatch', fixedRowCount: fixedRows.length, valueRowCount: valueNodes.length };
    }
    const valueRows = [];
    for (const node of valueNodes) {
      // Player rows have animation/pressable wrappers around the numeric row.
      // Find exactly one full-width row; never concatenate a wrapper's text or
      // silently truncate unmatched fixed/value rows into a successful import.
      const candidates = [];
      let level = [node];
      for (let depth = 0; depth <= 4 && level.length; depth += 1) {
        const next = [];
        for (const element of level) {
          if (element.children.length === expectedHeaders.length) {
            const cells = [...element.children].map(cell => normalize(cell.textContent));
            const numeric = value => /^(?:\d+(?:\.\d+)?|\.\d+)$/u.test(value);
            if (cells.every(value => !value || value === '-' || value === '—' || numeric(value))
                && cells.some(numeric)) candidates.push(cells);
          }
          next.push(...element.children);
        }
        level = next;
      }
      if (candidates.length !== 1) return { rows: [], reason: 'table-structure' };
      valueRows.push(candidates[0]);
    }
    const rows = fixedRows.map((fixed, index) => ({ fixed, values: valueRows[index] }));

    return { rows, reason: null };
  }, { anchor, expectedHeaders });
}

async function scrollTable(page, anchor, expectedHeaders) {
  return page.evaluate(scrollCollectionDom, { kind: 'table', anchor, expectedHeaders });
}

export async function collectVirtualTable(page, anchor, headers, context) {
  return collectUntilStable({
    context,
    read: () => readReadyTable({ read: () => readVisibleTable(page, anchor, headers),
      wait: () => page.waitForTimeout(250), context }),
    advance: () => scrollTable(page, anchor, headers),
    wait: () => page.waitForTimeout(500),
  });
}

export async function collectUntilStable({ read, advance, wait = async () => {}, maxPasses = 100, context = {} }) {
  const seen = new Map();
  const standingsTable = context.table === 'STANDINGS';
  let settledAtEnd = 0;
  let lastScroll;
  for (let pass = 0; pass < maxPasses && settledAtEnd < 3; pass += 1) {
    if (pass > 0) await wait();
    const snapshot = await read();
    if (snapshot.reason) throw new Error(`UniquePlay table changed (${snapshot.reason})`);
    const before = seen.size;
    let contentChanged = false;
    const sampleKeys = new Set();
    if (standingsTable && !snapshot.rows.length) {
      throw Object.assign(new Error('Empty standings snapshot'), { code: 'STANDINGS_TABLE_INCOMPLETE' });
    }
    for (const row of snapshot.rows) {
      if (standingsTable && (!Array.isArray(row.fixed) || row.fixed.length < 2
        || !Array.isArray(row.values) || row.values.length !== STANDING_HEADERS.length)) {
        throw Object.assign(new Error('Incomplete standings row'), { code: 'STANDINGS_TABLE_INCOMPLETE' });
      }
      // Rank is a mutable value, not team identity. Keep the legacy key for
      // player tables: two same-name players must not be silently collapsed.
      const key = standingsTable
        ? String(row.fixed.at(-1) ?? '').normalize('NFKC').replace(/\s+/gu, ' ').trim()
        : row.fixed.join('|');
      if (standingsTable && (!key || sampleKeys.has(key))) {
        throw Object.assign(new Error('Ambiguous standings team identity'), { code: 'STANDINGS_ROW_CONFLICT' });
      }
      sampleKeys.add(key);
      if (key) {
        if (standingsTable && JSON.stringify([seen.get(key)?.fixed, seen.get(key)?.values])
          !== JSON.stringify([row.fixed, row.values])) contentChanged = true;
        seen.set(key, standingsTable ? structuredClone(row) : row);
      }
    }
    const advanced = await advance();
    lastScroll = advanced;
    // Repeated rows inside a virtualized viewport are not completion evidence.
    // Count stability only after the same scroll surface reports its actual end.
    settledAtEnd = seen.size === before && !contentChanged && reachedCollectionEnd(advanced) ? settledAtEnd + 1 : 0;
  }
  if (settledAtEnd < 3) throw incompleteCollectionError('table', { context, rows: seen.size, scroll: lastScroll });
  return [...seen.values()];
}

export async function collectLazyList({ read, advance, identify, wait = async () => {}, maxPasses = 120 }) {
  const seen = new Map();
  let settledAtEnd = 0;
  for (let pass = 0; pass < maxPasses && settledAtEnd < 3; pass += 1) {
    if (pass > 0) await wait();
    const rows = await read();
    const before = seen.size;
    for (const row of rows) {
      const key = identify(row);
      if (key) seen.set(key, row);
    }
    const advanced = await advance();
    settledAtEnd = seen.size === before && reachedCollectionEnd(advanced) ? settledAtEnd + 1 : 0;
  }
  if (settledAtEnd < 3) throw incompleteCollectionError('list');
  return [...seen.values()];
}

function incompleteCollectionError(kind, { context = {}, rows, scroll } = {}) {
  // Do not forward raw DOM, browser exceptions or arbitrary context values.
  const fields = [];
  if (GROUP_CODES.includes(context.groupCode)) fields.push(`group=${context.groupCode}`);
  if (['STANDINGS', 'BATTER_IN', 'BATTER_OUT', 'PITCHER_IN', 'PITCHER_OUT'].includes(context.table)) fields.push(`table=${context.table}`);
  if (Number.isSafeInteger(rows) && rows >= 0) fields.push(`rows=${rows}`);
  if (scroll && typeof scroll === 'object') {
    if (typeof scroll.atEnd === 'boolean') fields.push(`atEnd=${scroll.atEnd}`);
    for (const field of ['top', 'height', 'total']) {
      if (typeof scroll[field] === 'number' && Number.isFinite(scroll[field]) && scroll[field] >= 0 && scroll[field] <= 1e9) fields.push(`${field}=${Math.round(scroll[field])}`);
    }
    if (['TABLE_SCROLL_ANCHOR_MISSING', 'SCROLL_SURFACE_MISSING'].includes(scroll.reason)) fields.push(`reason=${scroll.reason}`);
  }
  return Object.assign(
    new Error(`UniquePlay ${kind} collection did not reach a stable end${fields.length ? ` [${fields.join('; ')}]` : ''}`),
    { code: 'COLLECTION_INCOMPLETE' },
  );
}

import { collectReadyStandings } from './standings-readiness.mjs';

export function standingFromRow(row) {
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
  let table = 'STANDINGS';
  let stage = 'SELECT_TABLE';
  try {
    await clickText(page, '팀순위');
    stage = 'READ_TABLE';
    const standings = await collectReadyStandings({
      read: () => collectVirtualTable(page, '게임수', STANDING_HEADERS, { groupCode, table }),
      convert: standingFromRow,
      groupCode,
      wait: milliseconds => page.waitForTimeout(milliseconds),
    });
    stage = 'AUDIT_STANDINGS';
    const standingsIssues = auditStandings(standings);
    if (standingsIssues.length) throw standingsConflictError(groupCode, standings, standingsIssues);
    stage = 'REPORT_PROGRESS';
    await progress?.({ stage: table, groupCode, count: standings.length });

    table = 'BATTER_IN'; stage = 'SELECT_CATEGORY';
    await clickText(page, '개인순위');
    const result = { standings, batters: { IN: [], OUT: [] }, pitchers: { IN: [], OUT: [] } };
    for (const regulation of ['IN', 'OUT']) {
      table = `BATTER_${regulation}`; stage = 'SELECT_REGULATION';
      await clickText(page, `규정 ${regulation}`);
      stage = 'SELECT_TABLE';
      await clickText(page, '타자순위');
      stage = 'READ_TABLE';
      result.batters[regulation] = (await collectVirtualTable(page, '타율', BATTER_HEADERS, { groupCode, table })).map((row) => playerFromRow(row, BATTER_HEADERS));
      stage = 'REPORT_PROGRESS';
      await progress?.({ stage: table, groupCode, count: result.batters[regulation].length });

      table = `PITCHER_${regulation}`; stage = 'SELECT_TABLE';
      await clickText(page, '투수순위');
      stage = 'READ_TABLE';
      result.pitchers[regulation] = (await collectVirtualTable(page, 'ERA', PITCHER_HEADERS, { groupCode, table })).map((row) => playerFromRow(row, PITCHER_HEADERS, PITCHER_STAT_KEYS));
      stage = 'REPORT_PROGRESS';
      await progress?.({ stage: table, groupCode, count: result.pitchers[regulation].length });
    }
    return result;
  } catch (error) {
    throw contextualizeCollectionError(error, { groupCode, table, stage });
  }
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

export async function scrollPageList(page) {
  return page.evaluate(scrollCollectionDom, { kind: 'games' });
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
    wait: () => page.waitForTimeout(500),
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
        settledAtEnd = reachedCollectionEnd(advanced) ? settledAtEnd + 1 : 0;
        await page.waitForTimeout(500);
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

export async function collectUniquePlay({ browser, storageState, leagueId, seasonYear, progress, collectionScope }) {
  validateCollectionScope(collectionScope, seasonYear);
  const capturedAt = new Date().toISOString();
  const context = await browser.newContext({ storageState, locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
  const page = await context.newPage();
  try {
    await withCollectionContext(async () => {
      await page.goto(`https://unique-play.com/league/${encodeURIComponent(leagueId)}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForTimeout(1_000);
      if (!(await page.getByText('기록', { exact: true }).first().isVisible().catch(() => false))) {
        throw Object.assign(new Error('UniquePlay session expired'), { code: 'REAUTH_REQUIRED' });
      }
      await clickText(page, '기록');
      await ensureSeason(page, seasonYear);
    }, { stage: 'OPEN_RECORDS' });
    const groups = {};
    let selectedGroupCode = 'A';
    for (const groupCode of GROUP_CODES) {
      if (groupCode !== selectedGroupCode) {
        await withCollectionContext(async () => {
          await clickText(page, `${selectedGroupCode}조`);
          await clickText(page, `${groupCode}조`);
        }, { groupCode, stage: 'SELECT_GROUP' });
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
    // Do not upload a partial season as mass deletion candidates. Check raw
    // source group totals before the expensive detail pass; team aliases and
    // exact per-team counts remain the existing review validator's concern.
    assertCompleteGameCollection({ groups, games: completed });
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      for (const node of document.querySelectorAll('*')) if (node.scrollTop) node.scrollTop = 0;
    });
    const detailGames = collectionScope ? games.filter((game) => includesGameDate(game.playedAt, collectionScope.fromDate)) : games;
    const gameDetails = await collectGameDetails(page, detailGames, { leagueId, seasonYear, progress }).catch((error) => {
      throw contextualizeDetailError(error, { stage: 'COLLECTION' });
    });

    const candidate = sanitizeCandidate({ groups, games, gameDetails }, { leagueId, seasonYear, adapterVersion: ADAPTER_VERSION, capturedAt });
    const validation = validateCandidate(candidate, { detailGames: collectionScope ? detailGames.map((game) => ({ ...game, sourceGameId: game.sourceGameId || deterministicGameId({ ...game, leagueId, seasonYear }) })) : undefined });
    return { candidate, validation, ...(collectionScope ? { collectionScope } : {}) };
  } finally {
    await context.close();
  }
}

export function assertCompleteGameCollection({ groups, games }) {
  const shortages = [];
  for (const groupCode of GROUP_CODES) {
    const rows = groups[groupCode]?.standings || [];
    const counts = rows.map((row) => /^\d+$/u.test(String(row.games ?? '').trim()) ? Number(row.games) : NaN);
    if (rows.length !== 5 || counts.some((count) => !Number.isSafeInteger(count))) continue;
    const expected = Math.ceil(counts.reduce((sum, count) => sum + count, 0) / 2);
    const actual = new Set(games.filter((game) => game.groupCode === groupCode && game.status === 'COMPLETED')
      .map((game) => [game.playedAt, game.groupCode, normalizeText(game.homeTeamName), normalizeText(game.awayTeamName)].join('|'))).size;
    if (actual < expected) shortages.push({ groupCode, expected, actual });
  }
  if (shortages.length) throw Object.assign(new Error(
    `종료 경기 수집이 불완전합니다 (${shortages.map(({ groupCode, expected, actual }) => `${groupCode}조 ${actual}/${expected}`).join(', ')}). 후보를 생성하지 않았습니다. 원천 순위표·목록 갱신 상태를 확인한 뒤 관리자가 다시 수집해 주세요.`,
  ), { code: 'COLLECTION_INCOMPLETE' });
}

import { createHash } from 'node:crypto';

export const BATTER_DETAIL_HEADERS = ['타수', '안타', '타점', '도루', '득점', '타율', '시즌타율'];
export const PITCHER_DETAIL_HEADERS = ['이닝', '피안타', '실점', '자책', '4사구', '삼진', '방어율'];
const BATTER_STATS = ['atBats', 'hits', 'rbi', 'stolenBases', 'runs', 'battingAverage', 'seasonBattingAverage'];
const PITCHER_STATS = ['outs', 'inningsPitched', 'hitsAllowed', 'runsAllowed', 'earnedRuns', 'walksAndHitByPitch', 'strikeouts', 'era'];
const POSITIONS = new Set(['미정', '투수', '포수', '1루', '2루', '3루', '유격', '좌익', '중견', '우익', '지명', '지타', '대타', '대주', '1루수', '2루수', '3루수', '유격수', '좌익수', '중견수', '우익수', '지명타자', 'P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH', 'PH', 'PR']);

const DETAIL_ERROR_CODES = new Set(['GAME_DETAIL_SCHEMA', 'GAME_DETAIL_PRIVATE_VALUE', 'GAME_DETAIL_ID',
  'GAME_DETAIL_TEAM_MAPPING', 'GAME_DETAIL_SCORE', 'GAME_DETAIL_PARENT', 'GAME_DETAIL_NAVIGATION',
  'GAME_DETAIL_COLLECTION', 'GAME_DETAIL_AMBIGUOUS_CARD', 'GAME_DETAIL_CARD_MISSING', 'GAME_DETAIL_LINK_MISSING',
  'REAUTH_REQUIRED', 'SEASON_MISMATCH']);
const DETAIL_STAGES = new Set(['COLLECTION', 'FIND_CARD', 'OPEN_BOXSCORE', 'READ_INITIAL', 'CHECK_GAME',
  'SELECT_TEAM', 'READ_TEAM', 'CHECK_TEAMS', 'REPORT_PROGRESS', 'RETURN_RESULTS']);

function safeDetailContext(context = {}) {
  // Diagnostics contain only bounded public identifiers, never arbitrary labels,
  // URLs, exception messages or browser/account state. Source IDs are hashes.
  return {
    phase: 'GAME_DETAILS',
    ...(DETAIL_STAGES.has(context?.stage) ? { stage: context.stage } : {}),
    ...(typeof context?.sourceGameId === 'string' && /^up-[a-f0-9]{24}$/u.test(context.sourceGameId) ? { sourceGameId: context.sourceGameId } : {}),
    ...(typeof context?.providerGameId === 'string' && /^\d{1,24}$/u.test(context.providerGameId) ? { providerGameId: context.providerGameId } : {}),
  };
}

export function detailError(code = 'GAME_DETAIL_SCHEMA', context = {}) {
  const safeCode = DETAIL_ERROR_CODES.has(code) ? code : 'GAME_DETAIL_COLLECTION';
  const detailContext = safeDetailContext(context);
  const fields = Object.entries({ code: safeCode, ...detailContext }).map(([key, value]) => `${key}=${value}`).join('; ');
  return Object.assign(new Error(`UniquePlay game detail failed [${fields}]`), { code: safeCode, detailContext });
}

export function contextualizeDetailError(error, context = {}) {
  // Preserve the innermost safe stage while allowing outer boundaries to supply
  // missing IDs. Never forward the original exception/cause/stack to callbacks.
  const code = DETAIL_ERROR_CODES.has(error?.code) ? error.code : 'GAME_DETAIL_COLLECTION';
  return detailError(code, { ...safeDetailContext(context), ...safeDetailContext(error?.detailContext) });
}

function text(value, max = 100) {
  const result = String(value ?? '').normalize('NFKC').replace(/\s+/gu, ' ').trim();
  if (result.length > max) throw detailError();
  // Free-text fields are public baseball labels, never arbitrary page/account text.
  if (/[<>]|https?:\/\/|\b[^\s@]+@[^\s@]+\.[^\s@]+|(?:\+82[- .]?|0)(?:1[016789]|2|[3-6]\d)[- .]?\d{3,4}[- .]?\d{4}/iu.test(result)) {
    throw detailError('GAME_DETAIL_PRIVATE_VALUE');
  }
  return result;
}

function number(value, { integer = true, max = 999 } = {}) {
  if (value === null || value === undefined) return null;
  const clean = text(value, 24).replace(/,/g, '');
  if (!clean || clean === '-' || clean === '—') return null;
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/u.test(clean)) throw detailError();
  const parsed = Number(clean);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > max || (integer && !Number.isInteger(parsed))) throw detailError();
  return parsed;
}

function requiredText(value, max = 100) {
  const result = text(value, max);
  if (!result) throw detailError();
  return result;
}

function identifier(value, max = 128) {
  // Numeric public IDs and hash substrings are not phone/contact text. Match
  // their bounded identifier alphabet directly, like the backend validator.
  const result = String(value ?? '').normalize('NFKC').trim();
  if (!result || result.length > max || !/^[A-Za-z0-9_-]+$/u.test(result)) throw detailError();
  return result;
}

export function providerGameIdFromUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw detailError('GAME_DETAIL_ID'); }
  const match = url.pathname.match(/^\/game\/(\d{1,24})\/boxscore\/?$/u);
  if (url.protocol !== 'https:' || url.hostname !== 'unique-play.com' || url.username || url.password || !match) throw detailError('GAME_DETAIL_ID');
  return match[1];
}

export function parseInningsPitched(value) {
  const raw = String(value ?? '').trim();
  if (!raw || raw === '-' || raw === '—') return { outs: null, inningsPitched: null };
  // Parse baseball outs, not decimal arithmetic. NFKC expands ⅓/⅔ into 1⁄3/2⁄3.
  const clean = raw.replace(/⅓/gu, ' 1/3').replace(/⅔/gu, ' 2/3').normalize('NFKC').replace(/\s+/gu, ' ').trim();
  let match = clean.match(/^(?:(\d+)\s+)?([12])[/⁄]3$/u);
  // A DOM text normalizer may already have expanded the adjacent “2⅓”.
  if (!match) match = clean.match(/^(\d+)([12])⁄3$/u);
  if (match) {
    const whole = Number(match[1] || 0);
    if (whole > 99) throw detailError();
    return { outs: whole * 3 + Number(match[2]), inningsPitched: `${whole}.${match[2]}` };
  }
  match = clean.match(/^(\d+)(?:\.([012]))?$/u);
  if (!match || Number(match[1]) > 99) throw detailError();
  return { outs: Number(match[1]) * 3 + Number(match[2] || 0), inningsPitched: `${Number(match[1])}${match[2] ? `.${match[2]}` : ''}` };
}

export function parseInningRuns(value) {
  const clean = text(value, 16);
  if (/^x$/iu.test(clean)) return { runs: null, notPlayed: true };
  return { runs: number(clean, { max: 999 }), notPlayed: false };
}

function rowKey(teamName, role, index, playerName, jerseyNumber) {
  const key = JSON.stringify([teamName, role, index, jerseyNumber, playerName]);
  return `up-row-${createHash('sha256').update(key).digest('hex').slice(0, 24)}`;
}

function playerIdentity(label, role) {
  let remaining = requiredText(label, 180);
  let decision = null;
  if (role === 'pitcher') {
    const result = remaining.match(/\s+(승|패|세|세이브|홀드|무|승리|패전)$/u);
    if (result) {
      decision = result[1];
      remaining = remaining.slice(0, result.index).trim();
    }
  }
  let jerseyNumber = null;
  const jersey = remaining.match(/\s*\(\s*(\d{1,4}|-)?\s*\)$/u);
  if (jersey) {
    // The provider explicitly renders () when no jersey is registered.
    // Preserve that absence rather than inventing number zero.
    jerseyNumber = !jersey[1] || jersey[1] === '-' ? null : jersey[1];
    remaining = remaining.slice(0, jersey.index).trim();
  }
  let battingOrder = null;
  let position = null;
  if (role === 'batter') {
    const order = remaining.match(/^([1-9]\d?)\s+/u);
    if (order) {
      battingOrder = Number(order[1]);
      remaining = remaining.slice(order[0].length);
    }
    const tokens = remaining.split(' ');
    if (POSITIONS.has(tokens[0])) position = tokens.shift();
    else if (tokens.length > 1) throw detailError();
    remaining = tokens.join(' ');
  }
  // Unexpected parentheses/numbers usually mean a shifted fixed column.
  if (/[()]/u.test(remaining) || /^\d/u.test(remaining)) throw detailError();
  return { playerName: requiredText(remaining), jerseyNumber, battingOrder, position, decision };
}

function tableRows(table, headers, withInnings, allowForfeitEmpty = false) {
  if (!table || !Array.isArray(table.labels) || !Array.isArray(table.columns)) throw detailError();
  const columns = table.columns.map((column) => ({ header: text(column.header, 24), values: column.values }));
  const statOffset = withInnings ? columns.findIndex((column) => column.header === headers[0]) : 0;
  const totalOnly = table.labels.length === 1 && text(table.labels[0]) === '합계';
  if (statOffset < 0 || (withInnings && statOffset === 0 && !(allowForfeitEmpty && totalOnly)) || columns.length - statOffset !== headers.length
      || !headers.every((header, index) => columns[statOffset + index].header === header)) throw detailError();
  const innings = columns.slice(0, statOffset).map((column) => number(column.header, { max: 30 }));
  if (innings.some((inning, index) => inning !== index + 1)) throw detailError();
  for (const column of columns) {
    if (!Array.isArray(column.values) || column.values.length !== table.labels.length) throw detailError();
  }
  const rows = [];
  for (const [index, label] of table.labels.entries()) {
    const cleaned = text(label, 180);
    if (/^합계(?:\s|$)/u.test(cleaned)) continue;
    if (!cleaned) throw detailError();
    rows.push({ index, label: cleaned, values: columns.slice(statOffset).map((column) => column.values[index]),
      appearances: innings.map((inning, i) => ({ inning, result: text(columns[i].values[index], 200) })).filter((entry) => entry.result && entry.result !== '-' && entry.result !== '—') });
  }
  return rows;
}

export function parseTeamTables(snapshot, teamName, { allowForfeitEmpty = false } = {}) {
  const normalizedTeam = requiredText(teamName, 160);
  const batters = tableRows(snapshot.batter, BATTER_DETAIL_HEADERS, true, allowForfeitEmpty).map((row) => {
    const identity = playerIdentity(row.label, 'batter');
    return {
      rowKey: rowKey(normalizedTeam, 'BATTER', row.index, identity.playerName, identity.jerseyNumber),
      playerName: identity.playerName, jerseyNumber: identity.jerseyNumber,
      battingOrder: identity.battingOrder, position: identity.position,
      stats: Object.fromEntries(BATTER_STATS.map((key, i) => [key, number(row.values[i], { integer: i < 5, max: i < 5 ? 999 : 1 })])),
      plateAppearances: row.appearances,
    };
  });
  const pitchers = tableRows(snapshot.pitcher, PITCHER_DETAIL_HEADERS, false).map((row) => {
    const identity = playerIdentity(row.label, 'pitcher');
    return {
      rowKey: rowKey(normalizedTeam, 'PITCHER', row.index, identity.playerName, identity.jerseyNumber),
      playerName: identity.playerName, jerseyNumber: identity.jerseyNumber, decision: identity.decision,
      stats: {
        ...parseInningsPitched(row.values[0]),
        hitsAllowed: number(row.values[1]), runsAllowed: number(row.values[2]), earnedRuns: number(row.values[3]),
        walksAndHitByPitch: number(row.values[4]), strikeouts: number(row.values[5]), era: number(row.values[6], { integer: false }),
      },
    };
  });
  if (allowForfeitEmpty && (!batters.length || !pitchers.length)
      && ![snapshot.batter, snapshot.pitcher].every((table) => table.labels.length === 1 && text(table.labels[0]) === '합계')) throw detailError();
  return { batters, pitchers };
}

export function parseLineScore(lineScore) {
  if (!lineScore || !Array.isArray(lineScore.teamNames) || lineScore.teamNames.length !== 2
      || !Array.isArray(lineScore.innings) || !lineScore.innings.length || !Array.isArray(lineScore.totals)) throw detailError();
  if (lineScore.totals.length !== 4 || !['R', 'H', 'E', 'B'].every((label, i) => text(lineScore.totals[i].header) === label)) throw detailError();
  const seen = new Set();
  for (const column of [...lineScore.innings, ...lineScore.totals]) {
    if (!Array.isArray(column.values) || column.values.length !== 2) throw detailError();
  }
  const innings = lineScore.innings.map((column) => {
    const inning = number(column.header, { max: 30 });
    if (!inning || seen.has(inning) || inning !== seen.size + 1) throw detailError();
    seen.add(inning);
    return inning;
  });
  return lineScore.teamNames.map((name, teamIndex) => ({
    teamName: requiredText(name, 160),
    innings: innings.map((inning, i) => ({ inning, ...parseInningRuns(lineScore.innings[i].values[teamIndex]) })),
    totals: Object.fromEntries(['runs', 'hits', 'errors', 'walks'].map((key, i) => [key, number(lineScore.totals[i].values[teamIndex])])),
  }));
}

function statsObject(raw, keys, rates = []) {
  return Object.fromEntries(keys.map((key) => [key, number(raw?.[key], { integer: !rates.includes(key), max: key.includes('Average') ? 1 : 999 })]));
}

function jersey(value) {
  const result = text(value, 12);
  if (!result) return null;
  if (!/^\d{1,4}$/u.test(result)) throw detailError();
  return result;
}

export function sanitizeGameDetail(raw) {
  if (!raw || raw.schemaVersion !== 1 || !['AVAILABLE', 'NOT_PUBLISHED'].includes(raw.status) || !Array.isArray(raw.teams) || raw.teams.length > 2) throw detailError();
  const providerGameId = identifier(raw.providerGameId, 24);
  if (!/^\d+$/u.test(providerGameId)) throw detailError();
  const teams = raw.teams.map((team) => {
    if (!Array.isArray(team.innings) || team.innings.length > 30 || !Array.isArray(team.batters) || team.batters.length > 100
        || !Array.isArray(team.pitchers) || team.pitchers.length > 100) throw detailError();
    return {
      teamName: requiredText(team.teamName, 160),
      innings: team.innings.map((inning) => {
        if (typeof inning.notPlayed !== 'boolean') throw detailError();
        return { inning: number(inning.inning, { max: 30 }), runs: number(inning.runs), notPlayed: inning.notPlayed };
      }),
      totals: statsObject(team.totals, ['runs', 'hits', 'errors', 'walks']),
      batters: team.batters.map((batter) => {
        if (!Array.isArray(batter.plateAppearances) || batter.plateAppearances.length > 100) throw detailError();
        return {
          rowKey: identifier(batter.rowKey), playerName: requiredText(batter.playerName),
          jerseyNumber: jersey(batter.jerseyNumber),
          battingOrder: number(batter.battingOrder, { max: 99 }), position: text(batter.position, 40) || null,
          stats: statsObject(batter.stats, BATTER_STATS, ['battingAverage', 'seasonBattingAverage']),
          plateAppearances: batter.plateAppearances.map((entry) => ({ inning: number(entry.inning, { max: 30 }), result: requiredText(entry.result, 200) })),
        };
      }),
      pitchers: team.pitchers.map((pitcher) => ({
        rowKey: identifier(pitcher.rowKey), playerName: requiredText(pitcher.playerName),
        jerseyNumber: jersey(pitcher.jerseyNumber), decision: text(pitcher.decision, 30) || null,
        stats: { ...statsObject(pitcher.stats, PITCHER_STATS.filter((key) => key !== 'inningsPitched'), ['era']), inningsPitched: text(pitcher.stats?.inningsPitched, 16) || null },
      })),
    };
  });
  return { schemaVersion: 1, sourceGameId: identifier(raw.sourceGameId), providerGameId, status: raw.status, teams };
}

export function validateGameDetails(candidate) {
  const issues = [];
  if (candidate.gameDetails === undefined) return issues; // Revisions from older workers remain valid.
  const add = (code, path) => issues.push({ code, message: '경기 상세의 구조·원천·기록 일치 여부를 확인하세요.', path });
  if (!Array.isArray(candidate.gameDetails) || candidate.gameDetails.length > 2000) { add('GAME_DETAILS_SCHEMA', '$.gameDetails'); return issues; }
  const games = new Map((candidate.games || []).map((game) => [game.sourceGameId, game]));
  const seenGames = new Set();
  const seenProviderIds = new Set();
  for (const [index, detail] of candidate.gameDetails.entries()) {
    const path = `$.gameDetails[${index}]`;
    let normalized;
    try { normalized = sanitizeGameDetail(detail); } catch (error) { add(error.code || 'GAME_DETAIL_SCHEMA', path); continue; }
    const game = games.get(normalized.sourceGameId);
    if (!game || game.status !== 'COMPLETED') add('GAME_DETAIL_PARENT', path);
    if (seenGames.has(normalized.sourceGameId) || seenProviderIds.has(normalized.providerGameId)) add('GAME_DETAIL_DUPLICATE', path);
    seenGames.add(normalized.sourceGameId); seenProviderIds.add(normalized.providerGameId);
    if (normalized.status === 'NOT_PUBLISHED') {
      if (normalized.teams.length !== 0) add('GAME_DETAIL_NOT_PUBLISHED', path);
      continue;
    }
    if (normalized.teams.length !== 2 || new Set(normalized.teams.map((team) => team.teamName)).size !== 2) add('GAME_DETAIL_TEAMS', path);
    const rowKeys = new Set();
    for (const [teamIndex, team] of normalized.teams.entries()) {
      const teamPath = `${path}.teams[${teamIndex}]`;
      const names = [text(game?.homeTeamName, 160), text(game?.awayTeamName, 160)];
      const side = names.indexOf(team.teamName);
      if (game && side === -1) add('GAME_DETAIL_TEAM_MAPPING', teamPath);
      const score = side === 0 ? game?.homeScore : side === 1 ? game?.awayScore : null;
      if (score != null && team.totals.runs !== score) add('GAME_DETAIL_SCORE', teamPath);
      const innings = new Set();
      for (const inning of team.innings) {
        if (!inning.inning || innings.has(inning.inning) || inning.inning !== innings.size + 1 || (inning.notPlayed && inning.runs !== null)) add('GAME_DETAIL_INNINGS', teamPath);
        innings.add(inning.inning);
      }
      if (!team.innings.length || team.innings.every((inning) => inning.runs === null) || !team.batters.length || !team.pitchers.length) add('GAME_DETAIL_EMPTY', teamPath);
      if (team.innings.length && team.innings.every((inning) => inning.runs !== null || inning.notPlayed)
          && team.totals.runs !== null && team.innings.reduce((sum, inning) => sum + (inning.runs ?? 0), 0) !== team.totals.runs) add('GAME_DETAIL_INNING_SUM', teamPath);
      for (const row of [...team.batters, ...team.pitchers]) {
        if (rowKeys.has(row.rowKey)) add('GAME_DETAIL_ROW_DUPLICATE', teamPath);
        rowKeys.add(row.rowKey);
      }
      for (const batter of team.batters) {
        if (batter.battingOrder === 0 || (batter.stats.atBats !== null && batter.stats.hits !== null && batter.stats.hits > batter.stats.atBats)) add('GAME_DETAIL_BATTER_RANGE', teamPath);
        if (batter.plateAppearances.some((entry) => !entry.inning || !innings.has(entry.inning))) add('GAME_DETAIL_PLATE_APPEARANCE', teamPath);
      }
      for (const key of ['runs', 'hits']) {
        if (team.batters.length && team.totals[key] !== null && team.batters.every((row) => row.stats[key] !== null)
            && team.batters.reduce((sum, row) => sum + row.stats[key], 0) !== team.totals[key]) add('GAME_DETAIL_BATTER_SUM', teamPath);
      }
      for (const pitcher of team.pitchers) {
        try {
          if (parseInningsPitched(pitcher.stats.inningsPitched).outs !== pitcher.stats.outs) add('GAME_DETAIL_OUTS', teamPath);
        } catch { add('GAME_DETAIL_OUTS', teamPath); }
        if (pitcher.stats.earnedRuns !== null && pitcher.stats.runsAllowed !== null && pitcher.stats.earnedRuns > pitcher.stats.runsAllowed) add('GAME_DETAIL_PITCHER_RANGE', teamPath);
      }
    }
  }
  // A new collector must account for every completed game, never silently omit a failed detail.
  for (const game of games.values()) {
    if (game.status === 'COMPLETED' && !seenGames.has(game.sourceGameId)) add('GAME_DETAIL_MISSING', '$.gameDetails');
  }
  return issues;
}

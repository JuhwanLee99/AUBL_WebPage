import { createHash } from 'node:crypto';

const PRIVATE_KEY_PATTERN = /(^|_)(email|phone|phoneNumber|password|passwd|token|refreshToken|accessToken|uid|userId|birthDate|address)($|_)/i;

export function normalizeText(value) {
  if (value === null || value === undefined) return '';
  return String(value).normalize('NFKC').replace(/\s+/g, ' ').trim();
}

export function normalizeHeader(value) {
  return normalizeText(value).replace(/[▲▼]/g, '').trim();
}

export function toNumber(value, { allowNull = true } = {}) {
  const text = normalizeText(value);
  if (!text || text === '-' || text === '—') return allowNull ? null : 0;
  const numeric = text.replace(/[,％%개승]/g, '');
  const parsed = Number(numeric);
  return Number.isFinite(parsed) ? parsed : allowNull ? null : 0;
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function checksum(value) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

export function deterministicGameId(game) {
  const key = [
    'UNIQUE_PLAY',
    game.leagueId,
    game.seasonYear,
    game.playedAt,
    game.groupCode,
    normalizeText(game.homeTeamName),
    normalizeText(game.awayTeamName),
    normalizeText(game.venue),
  ].join('|');
  return `up-${createHash('sha256').update(key).digest('hex').slice(0, 24)}`;
}

export function findPrivatePaths(value, path = '$', found = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => findPrivatePaths(entry, `${path}[${index}]`, found));
    return found;
  }
  if (!value || typeof value !== 'object') return found;
  for (const [key, entry] of Object.entries(value)) {
    const nextPath = `${path}.${key}`;
    if (PRIVATE_KEY_PATTERN.test(key)) found.push(nextPath);
    findPrivatePaths(entry, nextPath, found);
  }
  return found;
}

function sanitizeStanding(row) {
  return {
    rank: toNumber(row.rank, { allowNull: false }),
    teamName: normalizeText(row.teamName),
    games: toNumber(row.games, { allowNull: false }),
    wins: toNumber(row.wins, { allowNull: false }),
    losses: toNumber(row.losses, { allowNull: false }),
    draws: toNumber(row.draws, { allowNull: false }),
    points: toNumber(row.points, { allowNull: false }),
    winPct: toNumber(row.winPct),
    gamesBehind: toNumber(row.gamesBehind),
  };
}

function sanitizePlayer(row, kind, regulation) {
  const stats = {};
  for (const [key, value] of Object.entries(row.stats || {})) {
    const safeKey = normalizeHeader(key);
    if (!safeKey || PRIVATE_KEY_PATTERN.test(safeKey)) continue;
    stats[safeKey] = toNumber(value);
  }
  return {
    kind,
    regulation,
    rank: toNumber(row.rank, { allowNull: false }),
    playerName: normalizeText(row.playerName),
    teamName: normalizeText(row.teamName),
    stats,
  };
}

function sanitizeGame(game, context) {
  const normalized = {
    leagueId: String(context.leagueId),
    seasonYear: Number(context.seasonYear),
    playedAt: normalizeText(game.playedAt),
    groupCode: normalizeText(game.groupCode).replace(/조$/u, ''),
    venue: normalizeText(game.venue),
    homeTeamName: normalizeText(game.homeTeamName),
    awayTeamName: normalizeText(game.awayTeamName),
    homeScore: toNumber(game.homeScore),
    awayScore: toNumber(game.awayScore),
    status: normalizeText(game.status),
  };
  return { ...normalized, sourceGameId: game.sourceGameId || deterministicGameId(normalized) };
}

export function sanitizeCandidate(raw, context) {
  const groups = {};
  for (const groupCode of Object.keys(raw.groups || {}).sort()) {
    const group = raw.groups[groupCode] || {};
    groups[groupCode] = {
      standings: (group.standings || []).map(sanitizeStanding),
      batters: {
        IN: (group.batters?.IN || []).map((row) => sanitizePlayer(row, 'BATTER', 'IN')),
        OUT: (group.batters?.OUT || []).map((row) => sanitizePlayer(row, 'BATTER', 'OUT')),
      },
      pitchers: {
        IN: (group.pitchers?.IN || []).map((row) => sanitizePlayer(row, 'PITCHER', 'IN')),
        OUT: (group.pitchers?.OUT || []).map((row) => sanitizePlayer(row, 'PITCHER', 'OUT')),
      },
    };
  }

  const candidate = {
    provider: 'UNIQUE_PLAY',
    leagueId: String(context.leagueId),
    seasonYear: Number(context.seasonYear),
    capturedAt: context.capturedAt || new Date().toISOString(),
    adapterVersion: context.adapterVersion,
    games: (raw.games || []).map((game) => sanitizeGame(game, context)),
    groups,
  };
  return { ...candidate, checksum: checksum(candidate) };
}

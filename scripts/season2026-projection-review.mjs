import assert from 'node:assert/strict';
import fs from 'node:fs';
import process from 'node:process';
import { analyzeGroupPlayoffScenarios } from '../src/features/front/components/season2026/qualificationScenarios.ts';

const DEFAULT_SEASON = 2026;
const DEFAULT_GROUP = 'A';
const GROUP_CODES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const GROUP_MATCHER = /^(?:[가-힣]{0,4}\s*)?([A-H])(?:조)?$/i;

const normalizeRuns = (value) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
};

const normalizeInt = (value) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
};

const readJson = (path) => {
  const raw = fs.readFileSync(path, 'utf8');
  const parsed = JSON.parse(raw);
  assert.ok(parsed && typeof parsed === 'object', `JSON root is not object: ${path}`);
  return parsed;
};

const toMatch = (entry) => ({
  id: entry.id ?? `${entry.homeTeamName}-${entry.awayTeamName}-${entry.status ?? 'scheduled'}`,
  startTime: entry.startTime ?? '2026-01-01T12:00:00+09:00',
  venue: entry.venue ?? '검증 경기장',
  homeTeamName: String(entry.homeTeamName ?? ''),
  awayTeamName: String(entry.awayTeamName ?? ''),
  status: entry.status === 'completed' ? 'completed' : entry.status === 'canceled' ? 'canceled' : entry.status === 'inProgress' ? 'inProgress' : 'scheduled',
  deleted: Boolean(entry.deleted),
  homeScore: entry.homeScore == null ? null : normalizeInt(entry.homeScore),
  awayScore: entry.awayScore == null ? null : normalizeInt(entry.awayScore),
  postGame: entry.postGame,
});

const toTeam = (entry) => ({
  teamId: normalizeInt(entry.teamId),
  teamName: String(entry.teamName ?? ''),
  wins: normalizeInt(entry.wins),
  losses: normalizeInt(entry.losses),
  ties: normalizeInt(entry.ties),
  runsFor: normalizeRuns(entry.runsFor),
  runsAgainst: normalizeRuns(entry.runsAgainst),
});

const ensureObject = (value, message) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(message);
  }
  return value;
};

const normalizeStatus = (value) => {
  const normalized = typeof value === 'string' ? value.toUpperCase() : '';
  if (normalized === 'FINAL' || normalized === 'COMPLETED') return 'completed';
  if (normalized === 'IN_PROGRESS' || normalized === 'INPROGRESS') return 'inProgress';
  if (normalized === 'POSTPONED' || normalized === 'CANCELED' || normalized === 'CANCELLED') return 'canceled';
  return normalized === 'SCHEDULED' ? 'scheduled' : normalized === 'POSTPONED' ? 'canceled' : 'scheduled';
};

const parseDateToKstStart = (value) => {
  if (!value) return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/T/.test(trimmed)) return trimmed;
  return `${trimmed}T00:00:00+09:00`;
};

const parseApiTeamName = (entry) => String(
  entry.teamName
  || entry.team_name
  || entry.name
  || (entry.team && (entry.team.teamName || entry.team.name))
  || '',
).trim();

const parseApiGroupCode = (value) => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase().replace(/\s+/g, '');
  if (GROUP_MATCHER.test(normalized)) {
    const match = normalized.match(GROUP_MATCHER);
    return match?.[1] ?? null;
  }
  if (/^[1-8]$/.test(normalized)) {
    const map = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    return map[Number(normalized) - 1] ?? null;
  }
  return null;
};

const toNonNegativeInt = (value) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const normalized = Math.trunc(value);
  return Number.isInteger(normalized) && normalized >= 0 ? normalized : null;
};

const parseApiMatch = (row) => {
  const matchId = String(row.gameId ?? row.id ?? '').trim();
  const status = normalizeStatus(row.status ?? row.gameStatus ?? row.state);
  const homeTeamName = parseApiTeamName(row.homeTeam ?? row.home ?? {});
  const awayTeamName = parseApiTeamName(row.awayTeam ?? row.away ?? {});
  const homeScore = row.homeScore ?? row.home?.score;
  const awayScore = row.awayScore ?? row.away?.score;

  return {
    id: matchId || `${homeTeamName}-${awayTeamName}-${status}`,
    homeTeamName,
    awayTeamName,
    status,
    homeScore: typeof homeScore === 'number' ? Math.trunc(homeScore) : homeScore,
    awayScore: typeof awayScore === 'number' ? Math.trunc(awayScore) : awayScore,
    startTime: parseDateToKstStart(row.startedAt ?? row.started_at ?? row.gameDate ?? row.date),
    venue: String(row.venue ?? row.stadium ?? '검증 경기장'),
    partCode: String(row.partCode ?? row.part_code ?? ''),
    group: String(row.group ?? ''),
  };
};

const normalizeArg = (value, fallback = null) => {
  const item = value?.trim();
  return item ? item : fallback;
};

const normalizeGroupArg = (value) => {
  const normalized = normalizeArg(value, '')?.toUpperCase().replace(/\s+/g, '');
  if (!normalized) return null;
  if (normalized === 'ALL') return 'ALL';
  const match = normalized.match(GROUP_MATCHER);
  return match ? match[1] : null;
};

const fetchJson = async (url) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`API error ${response.status}: ${response.statusText}${text ? ` — ${text}` : ''}`);
  }
  return response.json();
};

const collectGamesApi = async ({
  apiBase,
  seasonId,
  group,
  fromDate,
  toDate,
}) => {
  let page = 0;
  const size = 200;
  const games = [];

  while (true) {
    const params = new URLSearchParams({
      seasonId: String(seasonId),
      scope: 'LEAGUE',
      page: String(page),
      size: String(size),
      sort: 'gameDate',
      sortOrder: 'asc',
    });
    if (group) params.set('group', group);
    if (fromDate) params.set('fromDate', fromDate);
    if (toDate) params.set('toDate', toDate);

    const payload = await fetchJson(`${apiBase}/api/games?${params}`);
    const batch = Array.isArray(payload.items) ? payload.items : [];
    const mapped = batch
      .map(parseApiMatch)
      .filter((match) => match.homeTeamName && match.awayTeamName);
    games.push(...mapped);

    const hasNext = payload.hasNext === true;
    const totalPages = toNonNegativeInt(payload.totalPages);
    if (hasNext || (Number.isInteger(totalPages) && totalPages > page + 1)) {
      page += 1;
      continue;
    }
    if (batch.length < size || (Number.isInteger(totalPages) && page >= totalPages - 1)) break;
    page += 1;
  }

  return games;
};

const collectOverviewApi = async ({ apiBase, seasonId }) => {
  const payload = await fetchJson(`${apiBase}/api/seasons/${seasonId}/overview`);
  return ensureObject(payload, '시즌 통합 현황 응답 형식이 올바르지 않습니다.');
};

const extractGroupCodesFromOverview = (overview) => {
  const groups = Array.isArray(overview?.groups) ? overview.groups : [];
  const codes = new Set(
    groups
      .map((entry) => parseApiGroupCode(entry.groupCode ?? entry.group))
      .filter((entry) => Boolean(entry)),
  );
  return codes.size > 0 ? [...codes].sort() : [...GROUP_CODES];
};

const findTargetGroupEntry = (overview, groupCode) => {
  const groups = Array.isArray(overview?.groups) ? overview.groups : [];
  return groups.find((entry) => parseApiGroupCode(entry.groupCode ?? entry.group) === groupCode);
};

const buildTeamRows = (entryRows, groupCode) => {
  const rows = Array.isArray(entryRows) ? entryRows : [];
  return rows
    .map((entry) => ({
      teamId: toNonNegativeInt(entry.teamId ?? entry.id) ?? 0,
      teamName: String(entry.teamName ?? entry.name ?? '').trim(),
      wins: toNonNegativeInt(entry.wins) ?? 0,
      losses: toNonNegativeInt(entry.losses) ?? 0,
      ties: toNonNegativeInt(entry.ties ?? entry.draws) ?? 0,
      runsFor: 0,
      runsAgainst: 0,
      group: parseApiGroupCode(entry.group ?? entry.partCode ?? entry.groupCode),
    }))
    .filter((team) => team.teamName && (!groupCode || team.group === groupCode));
};

const applyScoreAggregation = (teamIndex, match) => {
  const home = teamIndex.get(match.homeTeamName);
  const away = teamIndex.get(match.awayTeamName);
  if (!home || !away) return;
  if (typeof match.homeScore === 'number' && Number.isFinite(match.homeScore)) {
    home.runsFor += match.homeScore;
    away.runsAgainst += match.homeScore;
  }
  if (typeof match.awayScore === 'number' && Number.isFinite(match.awayScore)) {
    away.runsFor += match.awayScore;
    home.runsAgainst += match.awayScore;
  }

  if (match.status !== 'completed') return;

  const h = match.homeScore;
  const a = match.awayScore;
  if (!Number.isFinite(h) || !Number.isFinite(a)) return;

  if (h > a) {
    home.wins += 1;
    away.losses += 1;
  } else if (h < a) {
    home.losses += 1;
    away.wins += 1;
  } else {
    home.ties += 1;
    away.ties += 1;
  }
};

const dedupeMatches = (matches) => {
  const seen = new Set();
  const next = [];
  for (const match of matches) {
    if (!match.id || seen.has(match.id)) continue;
    seen.add(match.id);
    next.push(match);
  }
  return next;
};

const buildFixtureFromApi = async ({ apiBase, seasonId, overview, group, fromDate, toDate }) => {
  const targetGroup = findTargetGroupEntry(overview, group);
  const groupCode = parseApiGroupCode(group) || DEFAULT_GROUP;

  const allGames = await collectGamesApi({
    apiBase,
    seasonId,
    group: groupCode,
    fromDate,
    toDate,
  });

  const teamRows = buildTeamRows(targetGroup?.standings, groupCode);
  const byName = new Map();

  if (teamRows.length > 0) {
    for (const row of teamRows) {
      byName.set(row.teamName, {
        teamId: row.teamId,
        teamName: row.teamName,
        wins: row.wins,
        losses: row.losses,
        ties: row.ties,
        runsFor: 0,
        runsAgainst: 0,
      });
    }
  }

  if (!byName.size) {
    for (const match of allGames) {
      if (!byName.has(match.homeTeamName)) {
        byName.set(match.homeTeamName, {
          teamId: 0,
          teamName: match.homeTeamName,
          wins: 0,
          losses: 0,
          ties: 0,
          runsFor: 0,
          runsAgainst: 0,
        });
      }
      if (!byName.has(match.awayTeamName)) {
        byName.set(match.awayTeamName, {
          teamId: 0,
          teamName: match.awayTeamName,
          wins: 0,
          losses: 0,
          ties: 0,
          runsFor: 0,
          runsAgainst: 0,
        });
      }
    }
  }

  for (const match of allGames) {
    applyScoreAggregation(byName, match);
  }

  const teams = [...byName.values()];

  return {
    season: {
      seasonId,
      seasonYear: overview.seasonYear ?? overview.year ?? DEFAULT_SEASON,
      sourceRevision: overview.sourceFreshness?.publishedRevision ?? null,
      source: overview.sourceFreshness?.provider ?? null,
    },
    teams,
    matches: dedupeMatches(allGames),
  };
};

const usage = () => {
  console.error(
    'Usage: node --experimental-strip-types scripts/season2026-projection-review.mjs '
    + '--input=<fixture.json> [옵션]\n'
    + '  또는\n'
    + 'node --experimental-strip-types scripts/season2026-projection-review.mjs '
    + '--api-base=<http://127.0.0.1:8080 or https://api.aubl.club> --season-id=<seasonId> --group=<A|B|...|ALL> [--from-date=YYYY-MM-DD] [--to-date=YYYY-MM-DD] [옵션]\n'
    + '또는\n'
    + 'node --experimental-strip-types scripts/season2026-projection-review.mjs '
    + '--api-base=<http://127.0.0.1:8080 or https://api.aubl.club> --season-id=<seasonId> --all-groups [--from-date=YYYY-MM-DD] [--to-date=YYYY-MM-DD] [옵션]\n\n'
    + '옵션: --label=NAME --max-scenarios=100000 [--with-draws] [--output=<fixture.json>]',
  );
  process.exit(1);
};

const args = process.argv.slice(2);
const inputPath = args.find((arg) => arg.startsWith('--input='));
const apiBaseArg = args.find((arg) => arg.startsWith('--api-base='))?.split('=')[1] ?? '';
const seasonIdArg = args.find((arg) => arg.startsWith('--season-id='))?.split('=')[1];
const allGroupsArg = args.includes('--all-groups');
const groupArg = args.find((arg) => arg.startsWith('--group='))?.split('=')[1];
const fromDate = args.find((arg) => arg.startsWith('--from-date='))?.split('=')[1];
const toDate = args.find((arg) => arg.startsWith('--to-date='))?.split('=')[1];
const outputPathArg = args.find((arg) => arg.startsWith('--output='))?.split('=')[1];
const labelArg = args.find((arg) => arg.startsWith('--label='))?.split('=')[1] ?? 'A조-시나리오';
const maxScenariosArg = args.find((arg) => arg.startsWith('--max-scenarios='))?.split('=')[1];
const includeDraws = args.includes('--with-draws');
const maxScenarios = Number.isFinite(Number(maxScenariosArg)) ? Number(maxScenariosArg) : 200000;

const useApi = !inputPath;
if (useApi && !apiBaseArg) usage();
if (useApi && !allGroupsArg && !groupArg) usage();

const parsedSeasonId = Number.isFinite(Number(seasonIdArg ?? '')) ? Number(seasonIdArg) : DEFAULT_SEASON;
const seasonId = Number.isFinite(parsedSeasonId) && parsedSeasonId > 0 ? parsedSeasonId : DEFAULT_SEASON;
if (!Number.isFinite(seasonId) || seasonId <= 0) {
  console.error('season-id must be a positive number');
  process.exit(2);
}

const normalizedGroup = normalizeGroupArg(groupArg);
if (useApi && !allGroupsArg && normalizedGroup === null) {
  console.error('group must be one of A|B|...|H or ALL');
  process.exit(2);
}

const selectedGroup = allGroupsArg ? 'ALL' : normalizedGroup || DEFAULT_GROUP;

const raw = useApi
  ? await (async () => {
    const apiBase = apiBaseArg.replace(/\/$/, '');
    const overview = await collectOverviewApi({ apiBase, seasonId });
    const seasonMeta = {
      seasonId,
      seasonYear: overview.seasonYear ?? overview.year ?? DEFAULT_SEASON,
      sourceRevision: overview.sourceFreshness?.publishedRevision ?? null,
      source: overview.sourceFreshness?.provider ?? null,
    };

    if (selectedGroup === 'ALL') {
      const groupCodes = extractGroupCodesFromOverview(overview);
      const groups = {};
      for (const groupCode of groupCodes) {
        groups[groupCode] = await buildFixtureFromApi({
          apiBase,
          seasonId,
          overview,
          group: groupCode,
          fromDate,
          toDate,
        });
      }
      return {
        season: seasonMeta,
        groups,
      };
    }

    const fixture = await buildFixtureFromApi({
      apiBase,
      seasonId,
      overview,
      group: selectedGroup,
      fromDate,
      toDate,
    });
    return {
      ...fixture,
      season: {
        ...seasonMeta,
        ...fixture.season,
      },
    };
  })()
  : readJson(inputPath.split('=')[1]);

const isAllGroupResult = selectedGroup === 'ALL' && Object.prototype.hasOwnProperty.call(raw, 'groups');

if (outputPathArg) {
  fs.writeFileSync(
    outputPathArg,
    `${JSON.stringify({ ...raw, meta: { generatedAt: new Date().toISOString(), seasonId, group: selectedGroup } }, null, 2)}\n`,
  );
}

if (!isAllGroupResult && (!Array.isArray(raw.teams) || !Array.isArray(raw.matches))) {
  console.error('fixture.json must contain `teams` and `matches` arrays');
  process.exit(2);
}

const analyzeAndPrint = (fixture, groupCode) => {
  const teams = fixture.teams.map(toTeam);
  const matches = fixture.matches.map(toMatch);

  if (!teams.length) {
    console.error(`No teams found for group ${groupCode}`);
    process.exit(3);
  }

  const result = analyzeGroupPlayoffScenarios(teams, matches, {
    includeDrawsInProjection: includeDraws,
    maxScenarios,
    fallbackRunDataToZero: false,
  });

  if (fixture.season?.sourceRevision) {
    console.log(`[source-revision=${fixture.season.sourceRevision}]`);
  }
  console.log(`[totalScenarios=${result.totalScenarios}, exhausted=${result.exhausted}]`);

  for (const [index, team] of teams.entries()) {
    const projection = result.projections[index];
    if (!projection) continue;
    console.log(
      `${team.teamName}: ${team.wins}-${team.losses}-${team.ties} / `
      + `${projection.minPossibleRank}~${projection.maxPossibleRank}위 `
      + `${projection.possibleBuckets.join(',') || 'out'} `
      + `(${projection.scenarioCount} cases)`,
    );
  }

  return result;
};

console.log(`[season2026-projection-review] ${labelArg}`);
if (raw.season) {
  console.log(`[season=${raw.season.seasonId || seasonId}]`);
}

if (isAllGroupResult) {
  for (const groupCode of Object.keys(raw.groups).sort()) {
    const groupFixture = raw.groups[groupCode];
    if (!groupFixture || !Array.isArray(groupFixture.teams) || !Array.isArray(groupFixture.matches)) {
      continue;
    }
    console.log(`\n== Group ${groupCode} ==`);
    analyzeAndPrint(groupFixture, groupCode);
  }
} else {
  analyzeAndPrint(raw, selectedGroup);
}

import {
  getBatterRankings,
  getPitcherRankings,
  getSeasonPublicOverview,
  getSeasons,
  getTeamRecordStandings,
  type TeamRecordStanding,
} from '@core/api/backendClient';
import type { TeamContentEntry } from '@shared/state/contentProvider';
import type { MatchSchedule } from '@shared/state/demoStore';
import {
  SEASON_2026_GROUPS,
  type HomeGroupView,
  type HomeStandingRow,
  type QualificationState,
  type Season2026Group,
  type Season2026RecordPayload,
} from './types';

const TARGET_SEASON = 2026;
const PART_CODE_TO_GROUP = new Map(
  SEASON_2026_GROUPS.map((group, index) => [String(index + 1), group]),
);

const toNameKey = (value: string) =>
  value
    .normalize('NFKC')
    .toLocaleLowerCase('ko-KR')
    .replace(/[^0-9a-zㄱ-힝]/g, '');

const resolveGroup = (row: TeamRecordStanding): Season2026Group | null => {
  const candidates = [row.group, row.partCode];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const normalized = candidate.trim().toUpperCase();
    const direct = normalized.match(/^(?:GROUP\s*)?([A-H])(?:\s*조)?$/)?.[1];
    if (direct && SEASON_2026_GROUPS.includes(direct as Season2026Group)) {
      return direct as Season2026Group;
    }
    const mapped = PART_CODE_TO_GROUP.get(normalized);
    if (mapped) return mapped;
  }
  return null;
};

const completedScore = (match: MatchSchedule) => {
  const home = match.homeScore ?? match.postGame?.totals.home.runs;
  const away = match.awayScore ?? match.postGame?.totals.away.runs;
  if (!Number.isFinite(home) || !Number.isFinite(away)) return null;
  return { home: Number(home), away: Number(away) };
};

const is2026Match = (match: MatchSchedule) => {
  const date = new Date(match.startTime);
  if (Number.isNaN(date.getTime())) return true;
  const year = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
    }).format(date),
  );
  return year === TARGET_SEASON;
};

const emptyStanding = (teamName: string, teamId: number): TeamRecordStanding => ({
  teamId,
  teamName,
  wins: 0,
  losses: 0,
  ties: 0,
  winPct: 0,
  partCode: null,
  group: null,
  seasonType: null,
  scope: null,
});

const standingsFromSchedule = (
  teamEntries: TeamContentEntry[],
  matches: MatchSchedule[],
): TeamRecordStanding[] => {
  const rows = teamEntries.map((entry, index) => emptyStanding(entry.name, -(index + 1)));
  const byName = new Map(rows.map((row) => [toNameKey(row.teamName), row]));

  matches.forEach((match) => {
    if (match.status !== 'completed' || (match.recordMode ?? 'official') !== 'official' || !is2026Match(match)) return;
    const score = completedScore(match);
    if (!score) return;
    const home = byName.get(toNameKey(match.homeTeamName));
    const away = byName.get(toNameKey(match.awayTeamName));
    if (!home || !away) return;

    if (score.home === score.away) {
      home.ties += 1;
      away.ties += 1;
    } else if (score.home > score.away) {
      home.wins += 1;
      away.losses += 1;
    } else {
      away.wins += 1;
      home.losses += 1;
    }
  });

  rows.forEach((row) => {
    const decisions = row.wins + row.losses;
    row.winPct = decisions > 0 ? row.wins / decisions : 0;
  });
  return rows;
};

const recordKey = (row: TeamRecordStanding) =>
  `${row.winPct.toFixed(6)}:${row.wins}:${row.losses}:${row.ties}`;

const explicitQualification = (row: TeamRecordStanding): QualificationState | null => {
  const state = row.qualificationState?.trim().toUpperCase();
  if (state === 'CURRENT_EUTTEUM') return 'current-eutteum';
  if (state === 'CURRENT_BEOGEUM') return 'current-beogeum';
  if (state === 'CURRENT_OUT') return 'out';
  if (state === 'CONFIRMED_EUTTEUM') return 'confirmed-eutteum';
  if (state === 'CONFIRMED_BEOGEUM') return 'confirmed-beogeum';
  if (state === 'CONFIRMED_OUT') return 'confirmed-out';
  if (state === 'TIE_PENDING') return 'pending';
  const marker = `${row.seasonType ?? ''} ${row.scope ?? ''}`.toUpperCase();
  const finalized = /FINAL|CONFIRMED|확정/.test(marker);
  if (!finalized) return null;
  if (/EUTTEUM|으뜸/.test(marker)) return 'confirmed-eutteum';
  if (/BEOGEUM|버금/.test(marker)) return 'confirmed-beogeum';
  return null;
};

const labelForQualification = (state: QualificationState) => {
  switch (state) {
    case 'current-eutteum':
      return '현재 으뜸권';
    case 'current-beogeum':
      return '현재 버금권';
    case 'confirmed-eutteum':
      return '으뜸 진출 확정';
    case 'confirmed-beogeum':
      return '버금 진출 확정';
    case 'confirmed-out':
      return '예선 탈락';
    case 'pending':
      return '경계 동률 · 검토 중';
    case 'out':
      return '탈락권';
    case 'unranked':
      return '순위 산정 전';
  }
};

const rankRows = (rows: TeamRecordStanding[]): HomeStandingRow[] => {
  const hasOfficialRanks = rows.length > 0 && rows.every((row) => typeof row.rank === 'number' && row.rank > 0);
  const sorted = [...rows].sort(
    (a, b) =>
      (hasOfficialRanks ? (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER) : 0) ||
      b.winPct - a.winPct ||
      b.wins - a.wins ||
      a.losses - b.losses ||
      b.ties - a.ties ||
      a.teamName.localeCompare(b.teamName, 'ko'),
  );
  const noGames = sorted.every((row) => row.wins + row.losses + row.ties === 0);
  const keys = sorted.map((row) => hasOfficialRanks ? `rank:${row.rank}` : recordKey(row));

  return sorted.map((row, index) => {
    const key = keys[index];
    const firstIndex = keys.indexOf(key);
    const lastIndex = keys.lastIndexOf(key);
    const crossesBoundary = (firstIndex <= 1 && lastIndex >= 2) || (firstIndex <= 3 && lastIndex >= 4);
    const explicit = explicitQualification(row);
    let qualification: QualificationState;
    if (explicit) qualification = explicit;
    else if (noGames) qualification = 'unranked';
    else if (crossesBoundary) qualification = 'pending';
    else if (index < 2) qualification = 'current-eutteum';
    else if (index < 4) qualification = 'current-beogeum';
    else qualification = 'out';

    return {
      teamId: row.teamId,
      teamName: row.teamName,
      rank: hasOfficialRanks ? row.rank ?? firstIndex + 1 : firstIndex + 1,
      wins: row.wins,
      losses: row.losses,
      ties: row.ties,
      winPct: row.winPct,
      qualification,
      qualificationLabel: labelForQualification(qualification),
      tied: firstIndex !== lastIndex,
    };
  });
};

export async function fetchSeason2026RecordPayload(): Promise<Season2026RecordPayload> {
  const checkedAt = Date.now();
  let seasonId: number | null = null;
  const warnings: string[] = [];

  try {
    const seasons = await getSeasons();
    seasonId = seasons.find((season) => season.year === TARGET_SEASON)?.id ?? null;
    if (seasonId == null) warnings.push('2026 시즌이 기록 API에 아직 등록되지 않았습니다.');
  } catch {
    warnings.push('시즌 정보를 확인하지 못했습니다.');
  }

  if (seasonId == null) {
    return {
      phase: 'unavailable',
      seasonId,
      seasonYear: TARGET_SEASON,
      standings: [],
      batters: [],
      pitchers: [],
      checkedAt,
      warnings,
      sourceFreshness: null,
    };
  }

  try {
    const overview = await getSeasonPublicOverview(seasonId);
    const standings = overview.groups.flatMap((group) => group.standings);
    if (overview.groups.length > 0 && standings.length > 0) {
      return {
        phase: overview.groups.length === SEASON_2026_GROUPS.length ? 'ready' : 'partial',
        seasonId,
        seasonYear: TARGET_SEASON,
        standings,
        batters: overview.batterLeaders,
        pitchers: overview.pitcherLeaders,
        checkedAt: Date.now(),
        warnings,
        sourceFreshness: overview.sourceFreshness,
      };
    }
    warnings.push('게시된 2026 UniquePlay 통합 스냅샷이 아직 없습니다.');
  } catch {
    warnings.push('시즌 통합 현황 API를 확인하지 못해 기존 기록 조회로 전환했습니다.');
  }

  const [standingsResult, battersResult, pitchersResult] = await Promise.allSettled([
    getTeamRecordStandings(seasonId, { scope: 'LEAGUE' }),
    getBatterRankings({
      seasonId,
      limit: 5,
      sort: 'battingAverage',
      filters: { scope: 'LEAGUE' },
      regulation: 'IN',
    }),
    getPitcherRankings({
      seasonId,
      limit: 5,
      sort: 'era',
      filters: { scope: 'LEAGUE' },
      regulation: 'IN',
    }),
  ]);

  if (standingsResult.status === 'rejected') warnings.push('조별 순위 API를 확인하지 못했습니다.');
  if (battersResult.status === 'rejected') warnings.push('타자 순위 API를 확인하지 못했습니다.');
  if (pitchersResult.status === 'rejected') warnings.push('투수 순위 API를 확인하지 못했습니다.');

  const successCount = [standingsResult, battersResult, pitchersResult].filter(
    (result) => result.status === 'fulfilled',
  ).length;

  return {
    phase: successCount === 3 ? 'ready' : successCount > 0 ? 'partial' : 'unavailable',
    seasonId,
    seasonYear: TARGET_SEASON,
    standings: standingsResult.status === 'fulfilled' ? standingsResult.value : [],
    batters: battersResult.status === 'fulfilled' ? battersResult.value : [],
    pitchers: pitchersResult.status === 'fulfilled' ? pitchersResult.value : [],
    checkedAt: Date.now(),
    warnings,
    sourceFreshness: null,
  };
}

export function buildSeason2026Groups(
  apiStandings: TeamRecordStanding[],
  teamEntries: TeamContentEntry[],
  matches: MatchSchedule[],
): HomeGroupView[] {
  const configuredGroupByTeam = new Map(teamEntries.map((entry) => [toNameKey(entry.name), entry.group]));
  const scheduledStandings = standingsFromSchedule(teamEntries, matches);
  const baseRows = apiStandings.length > 0 ? apiStandings : scheduledStandings;
  const source: HomeGroupView['source'] = apiStandings.length
    ? apiStandings.some((row) => row.syncRevision) ? 'season-overview' : 'records-api'
    : matches.some((match) => match.status === 'completed' && completedScore(match))
      ? 'schedule'
      : 'team-directory';

  return SEASON_2026_GROUPS.map((group) => {
    const rowsForGroup = baseRows.filter((row) => {
      const configured = configuredGroupByTeam.get(toNameKey(row.teamName));
      return resolveGroup(row) === group || configured === group;
    });
    const existingNames = new Set(rowsForGroup.map((row) => toNameKey(row.teamName)));
    teamEntries
      .filter((entry) => entry.group === group && !existingNames.has(toNameKey(entry.name)))
      .forEach((entry, index) => rowsForGroup.push(emptyStanding(entry.name, -(100 + index))));

    const rankedRows = rankRows(rowsForGroup);
    const completedGames = Math.floor(
      rankedRows.reduce((total, row) => total + row.wins + row.losses + row.ties, 0) / 2,
    );
    const expectedGames = (rankedRows.length * Math.max(0, rankedRows.length - 1)) / 2;

    return {
      group,
      rows: rankedRows,
      completedGames,
      expectedGames,
      source,
    };
  });
}

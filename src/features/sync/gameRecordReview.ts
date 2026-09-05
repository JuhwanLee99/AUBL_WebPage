export interface GameRecordChangeLike {
  field: string;
  sourceValue: unknown;
}

export interface GameRecordReviewMismatch {
  code: 'DETAIL_LINE_SCORE' | 'DETAIL_BATTER_TOTAL';
  metric: 'RUNS' | 'HITS' | null;
  message: string;
}

export interface GameRecordTeamReview {
  teamName: string;
  teamRuns: number | null;
  teamHits: number | null;
  batterRuns: number | null;
  batterHits: number | null;
  inningRuns: number;
  inningCount: number;
  unknownInningCount: number;
  notPlayedInningCount: number;
  mismatches: GameRecordReviewMismatch[];
}

export interface GameRecordReview {
  providerGameId: string | null;
  providerUrl: string | null;
  status: 'AVAILABLE' | 'NOT_PUBLISHED' | 'UNKNOWN';
  comparisonAvailable: boolean;
  teams: GameRecordTeamReview[];
  structureUnavailable: boolean;
  mismatchCount: number;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function javaInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : null;
}

function safeTeamName(value: unknown): string {
  if (typeof value !== 'string') return '팀명 확인 필요';
  const normalized = value.normalize('NFKC').replace(/\s+/gu, ' ').trim();
  if (!normalized || normalized.length > 160) return '팀명 확인 필요';
  if (/[<>@\p{Cc}]/u.test(normalized)) return '팀명 확인 필요';
  if (/0[0-9]{1,2}[- ]?[0-9]{3,4}[- ]?[0-9]{4}/u.test(normalized)) return '팀명 확인 필요';
  return normalized;
}

function providerId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return /^\d{1,24}$/u.test(normalized) ? normalized : null;
}

function detailStatus(value: unknown): GameRecordReview['status'] {
  return value === 'AVAILABLE' || value === 'NOT_PUBLISHED' ? value : 'UNKNOWN';
}

function batterSum(rows: unknown, key: 'runs' | 'hits'): number | null {
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > 100) return null;
  let total = 0;
  for (const value of rows) {
    const row = record(value);
    const stats = record(row?.stats);
    const number = javaInteger(stats?.[key]);
    if (number === null) return null;
    total += number;
  }
  return total;
}

function teamReview(value: unknown): GameRecordTeamReview | null {
  const team = record(value);
  if (!team) return null;
  const totals = record(team.totals);
  const teamRuns = javaInteger(totals?.runs);
  const teamHits = javaInteger(totals?.hits);
  const batterRuns = batterSum(team.batters, 'runs');
  const batterHits = batterSum(team.batters, 'hits');
  const innings = Array.isArray(team.innings) && team.innings.length <= 30 ? team.innings : [];
  let inningRuns = 0;
  let hasRuns = false;
  let allInningsKnown = true;
  let unknownInningCount = 0;
  let notPlayedInningCount = 0;

  for (const value of innings) {
    const inning = record(value);
    const runs = javaInteger(inning?.runs);
    if (runs !== null) {
      inningRuns += runs;
      hasRuns = true;
    } else if (inning?.notPlayed === true) {
      notPlayedInningCount += 1;
    } else {
      allInningsKnown = false;
      unknownInningCount += 1;
    }
  }

  const mismatches: GameRecordReviewMismatch[] = [];
  if (innings.length === 0) {
    mismatches.push({ code: 'DETAIL_LINE_SCORE', metric: null, message: '이닝별 점수가 없습니다.' });
  } else if (!hasRuns) {
    mismatches.push({ code: 'DETAIL_LINE_SCORE', metric: 'RUNS', message: '숫자로 확인된 이닝 득점이 없습니다.' });
  } else if (allInningsKnown && inningRuns !== (teamRuns ?? -1)) {
    mismatches.push({
      code: 'DETAIL_LINE_SCORE',
      metric: 'RUNS',
      message: `이닝 합계 ${inningRuns}과 팀 R ${teamRuns ?? '—'}이(가) 다릅니다.`,
    });
  }
  if (batterRuns !== null && teamRuns !== null && batterRuns !== teamRuns) {
    mismatches.push({
      code: 'DETAIL_BATTER_TOTAL',
      metric: 'RUNS',
      message: `개인 득점 합계 ${batterRuns}과 팀 R ${teamRuns}이(가) 다릅니다.`,
    });
  }
  if (batterHits !== null && teamHits !== null && batterHits !== teamHits) {
    mismatches.push({
      code: 'DETAIL_BATTER_TOTAL',
      metric: 'HITS',
      message: `개인 안타 합계 ${batterHits}와 팀 H ${teamHits}가 다릅니다.`,
    });
  }

  return {
    teamName: safeTeamName(team.teamName),
    teamRuns,
    teamHits,
    batterRuns,
    batterHits,
    inningRuns,
    inningCount: innings.length,
    unknownInningCount,
    notPlayedInningCount,
    mismatches,
  };
}

export function buildGameRecordReview(changes: readonly GameRecordChangeLike[]): GameRecordReview {
  const providerChange = changes.find((change) => change.field === 'providerGameId');
  const statusChange = changes.find((change) => change.field === 'status');
  const teamsChange = changes.find((change) => change.field === 'teams');
  const id = providerId(providerChange?.sourceValue);
  const status = detailStatus(statusChange?.sourceValue);
  const comparisonAvailable = teamsChange !== undefined;
  const rawTeams = teamsChange?.sourceValue;
  const publicTeams = Array.isArray(rawTeams) && rawTeams.length <= 2 ? rawTeams : null;
  const teams = publicTeams
    ? publicTeams.map(teamReview).filter((team): team is GameRecordTeamReview => team !== null)
    : [];
  const structureUnavailable = comparisonAvailable && (status === 'NOT_PUBLISHED'
    ? publicTeams === null || publicTeams.length !== 0
    : publicTeams === null || publicTeams.length !== 2 || teams.length !== publicTeams.length);
  return {
    providerGameId: id,
    providerUrl: id ? `https://unique-play.com/game/${id}/boxscore` : null,
    status,
    comparisonAvailable,
    teams,
    structureUnavailable,
    mismatchCount: status === 'NOT_PUBLISHED'
      ? 0
      : teams.reduce((sum, team) => sum + team.mismatches.length, 0),
  };
}

import type { MatchSchedule } from '@shared/state/demoStore';

export interface RemainingMatchup {
  teamA: string;
  teamB: string;
  completed: number;
  scheduled: number;
  unscheduled: number;
  remaining: number;
}

const key = (name: string) => name.normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/[^0-9a-zㄱ-힝]/g, '');
const pairKey = (a: string, b: string) => JSON.stringify([a, b].sort());
const score = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0;

// Synthetic fixtures are calculation inputs only, never persisted as actual schedules.
export function buildRemainingMatchups(
  teams: Array<{ teamName: string; wins: number; losses: number; ties: number }>,
  matches: MatchSchedule[],
  group: string,
) {
  const warnings: string[] = [];
  const names = new Map(teams.map((team) => [key(team.teamName), team.teamName]));
  if (names.size !== teams.length || names.has('')) warnings.push('팀명이 중복되거나 비어 있습니다.');
  const pairs = new Map<string, MatchSchedule[]>();
  const seen = new Set<string>();
  const results = new Map([...names.keys()].map((name) => [name, { wins: 0, losses: 0, ties: 0 }]));
  for (const match of matches) {
    if (match.deleted || match.status === 'canceled' || match.recordMode === 'practice' || match.sourceActive === false) continue;
    const a = key(match.homeTeamName), b = key(match.awayTeamName);
    if (a === b || !names.has(a) || !names.has(b)) continue;
    if (match.groupCode && match.groupCode !== group) continue;
    const date = new Date(match.startTime);
    if (Number.isFinite(date.getTime()) && new Date(date.getTime() + 9 * 3600000).getUTCFullYear() !== 2026) continue;
    const identity = match.sourceGameId ? `${match.sourceProvider ?? 'source'}:${match.sourceGameId}` : match.id;
    if (seen.has(identity)) { warnings.push(`중복 경기 확인 필요: ${match.homeTeamName} / ${match.awayTeamName}`); continue; }
    seen.add(identity);
    const id = pairKey(a, b);
    const fixtures = pairs.get(id) ?? [];
    fixtures.push(match);
    pairs.set(id, fixtures);
    if (match.status === 'completed') {
      const h = match.homeScore ?? match.postGame?.totals.home.runs;
      const v = match.awayScore ?? match.postGame?.totals.away.runs;
      if (!score(h) || !score(v)) { warnings.push(`완료 경기 점수 누락: ${match.homeTeamName} / ${match.awayTeamName}`); continue; }
      results.get(a)![h > v ? 'wins' : h < v ? 'losses' : 'ties'] += 1;
      results.get(b)![v > h ? 'wins' : v < h ? 'losses' : 'ties'] += 1;
    }
  }
  for (const team of teams) {
    const actual = results.get(key(team.teamName))!;
    if (actual.wins !== team.wins || actual.losses !== team.losses || actual.ties !== team.ties) {
      warnings.push(`${team.teamName}: 순위표 ${team.wins}승 ${team.losses}패 ${team.ties}무 / 확인된 경기 ${actual.wins}승 ${actual.losses}패 ${actual.ties}무. 완료 경기 자료를 확인해 주세요.`);
    }
  }
  const fixtures: MatchSchedule[] = [];
  const matchups: RemainingMatchup[] = [];
  const ordered = [...names.keys()].sort();
  for (let i = 0; i < ordered.length; i += 1) {
    for (let j = i + 1; j < ordered.length; j += 1) {
      const a = ordered[i]!, b = ordered[j]!;
      const existing = pairs.get(pairKey(a, b)) ?? [];
      const completed = existing.filter((match) => match.status === 'completed').length;
      const scheduled = existing.length - completed;
      const unscheduled = Math.max(0, 2 - existing.length);
      if (existing.length > 2) warnings.push(`${names.get(a)} / ${names.get(b)}: 팀 간 2경기를 초과한 ${existing.length}경기가 등록되어 있습니다.`);
      matchups.push({ teamA: names.get(a)!, teamB: names.get(b)!, completed, scheduled, unscheduled, remaining: Math.max(0, 2 - completed) });
      fixtures.push(...existing);
      for (let slot = existing.length; slot < 2; slot += 1) {
        fixtures.push({ id: `__auto-scenario:${group}:${pairKey(a, b)}:${slot}`, homeTeamName: names.get(a)!, awayTeamName: names.get(b)!, startTime: '', venue: '일정 미정', status: 'scheduled', recordMode: 'official' });
      }
    }
  }
  return { fixtures, matchups, warnings: [...new Set(warnings)] };
}

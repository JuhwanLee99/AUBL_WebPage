import type { MatchSchedule } from '@shared/state/demoStore';

export type QualificationBucket = 'eutteum' | 'beogeum' | 'out';
export type TieBreakStage = 'head-to-head' | 'run-diff' | 'runs-for' | 'runs-allowed';
export interface ScenarioTeamInput {
  teamId: number;
  teamName: string;
  wins: number;
  losses: number;
  ties: number;
  runsFor?: number | null;
  runsAgainst?: number | null;
}
export interface ScenarioCondition {
  teamA: string;
  teamB: string;
  wins: number;
  losses: number;
  ties: number;
}
export interface RankCase {
  rank: number;
  conditional: boolean;
  reasons: string[];
  conditions: ScenarioCondition[];
}
export interface QualificationDistribution {
  model: 'equal-win-loss-draw' | 'equal-win-loss';
  totalCases: string;
  countedCases: string;
  unresolvedCases: string;
  buckets: Array<{ bucket: QualificationBucket; guaranteedCases: string; possibleCases: string }>;
}
export interface TeamPlayoffProjection {
  teamId: number;
  minPossibleRank: number;
  maxPossibleRank: number;
  possibleRanks: number[];
  possibleBuckets: QualificationBucket[];
  tieBreakNotes: string[];
  scenarioCount: string;
  expectedScenarios: string;
  evaluatedStates: number;
  rankCases: RankCase[];
  distribution: QualificationDistribution;
  exhausted: boolean;
}
export interface GroupQualificationScenario {
  projections: TeamPlayoffProjection[];
  totalScenarios: string;
  expectedScenarios: string;
  evaluatedStates: number;
  exhausted: boolean;
  warnings: string[];
}
interface RecordCell { wins: number; losses: number; ties: number; runsFor: number; runsAgainst: number; unknownScores: number; unknownDiff: number }
interface Team extends ScenarioTeamInput { index: number }
interface Range { index: number; min: number; max: number; reasons: string[] }
interface Pair { a: number; b: number; count: number }
const nameKey = (name: string) => name.normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/[^0-9a-zㄱ-힝]/g, '');
const buckets: QualificationBucket[] = ['eutteum', 'beogeum', 'out'];
const bucket = (rank: number): QualificationBucket => rank <= 2 ? 'eutteum' : rank <= 4 ? 'beogeum' : 'out';
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
// Cross multiplication avoids rounding a different win percentage into a tie.
const compareRate = (a: { wins: number; losses: number }, b: { wins: number; losses: number }) =>
  b.wins * (a.wins + a.losses || 1) - a.wins * (b.wins + b.losses || 1);
const partition = (teams: Team[], compare: (a: Team, b: Team) => number) => {
  const result: Team[][] = [];
  for (const team of [...teams].sort((a, b) => compare(a, b) || a.teamId - b.teamId)) {
    const last = result.at(-1);
    if (last && compare(last[0]!, team) === 0) last.push(team);
    else result.push([team]);
  }
  return result;
};
const factorial = (n: number) => { let value = 1n; for (let i = 2; i <= n; i++) value *= BigInt(i); return value; };

export function analyzeGroupPlayoffScenarios(
  input: ScenarioTeamInput[],
  matches: MatchSchedule[],
  options?: { includeDrawsInProjection?: boolean; maxScenarios?: number; fallbackRunDataToZero?: boolean },
): GroupQualificationScenario {
  const empty = (warnings: string[]): GroupQualificationScenario => ({ projections: [], totalScenarios: '0', expectedScenarios: '0', evaluatedStates: 0, exhausted: false, warnings });
  if (!input.length) return empty([]);
  if (new Set(input.map(t => t.teamId)).size !== input.length || new Set(input.map(t => nameKey(t.teamName))).size !== input.length
    || input.some(t => !nameKey(t.teamName) || ![t.wins, t.losses, t.ties].every(integer))) return empty(['팀 식별자 또는 승패무 입력을 확인해 주세요.']);
  const teams = input.map((t, index) => ({ ...t, index }));
  const byName = new Map(teams.map(t => [nameKey(t.teamName), t.index]));
  const matrix: RecordCell[][] = teams.map(() => teams.map(() => ({ wins: 0, losses: 0, ties: 0, runsFor: 0, runsAgainst: 0, unknownScores: 0, unknownDiff: 0 })));
  const pending = new Map<string, Pair>();
  const seen = new Set<string>();
  const warnings: string[] = [];
  let pendingCount = 0;
  for (const match of matches) {
    if (match.deleted || match.status === 'canceled' || match.recordMode === 'practice' || match.sourceActive === false) continue;
    const a = byName.get(nameKey(match.homeTeamName)), b = byName.get(nameKey(match.awayTeamName));
    if (a == null || b == null || a === b) continue;
    const identity = match.sourceGameId ? `${match.sourceProvider ?? 'source'}:${match.sourceGameId}` : match.id;
    if (seen.has(identity)) { warnings.push('중복 경기 입력으로 계산을 보류합니다.'); continue; }
    seen.add(identity);
    if (match.status === 'completed') {
      const h = match.homeScore ?? match.postGame?.totals.home.runs, v = match.awayScore ?? match.postGame?.totals.away.runs;
      if (!integer(h) || !integer(v)) { warnings.push('완료 경기 점수 누락으로 계산을 보류합니다.'); continue; }
      const x = matrix[a]![b]!, y = matrix[b]![a]!;
      x[h > v ? 'wins' : h < v ? 'losses' : 'ties']++;
      y[v > h ? 'wins' : v < h ? 'losses' : 'ties']++;
      x.runsFor += h; x.runsAgainst += v; y.runsFor += v; y.runsAgainst += h;
    } else {
      const low = Math.min(a, b), high = Math.max(a, b), key = `${low}:${high}`;
      const pair = pending.get(key) ?? { a: low, b: high, count: 0 };
      pair.count++; pending.set(key, pair); pendingCount++;
      matrix[a]![b]!.unknownScores++; matrix[b]![a]!.unknownScores++;
    }
  }
  if (warnings.length) return empty([...new Set(warnings)]);
  const pairs = [...pending.values()].sort((x, y) => teams[x.a]!.teamId - teams[y.a]!.teamId || teams[x.b]!.teamId - teams[y.b]!.teamId);
  const expected = BigInt(options?.includeDrawsInProjection ? 3 : 2) ** BigInt(pendingCount);
  const cap = Number.isFinite(options?.maxScenarios) && options!.maxScenarios! > 0 ? Math.max(1, Math.floor(options!.maxScenarios!)) : 100_000;
  const accumulators = teams.map(() => ({
    ranks: new Map<number, RankCase>(), notes: new Set<string>(), unresolved: 0n,
    guaranteed: buckets.map(() => 0n), possible: buckets.map(() => 0n),
  }));
  const path: ScenarioCondition[] = [];
  let evaluatedStates = 0, count = 0n, exhausted = false;

  const peerStats = (team: Team, peers: Team[]) => peers.reduce((sum, other) => {
    if (team.index === other.index) return sum;
    const cell = matrix[team.index]![other.index]!;
    return { wins: sum.wins + cell.wins, losses: sum.losses + cell.losses, runsFor: sum.runsFor + cell.runsFor, runsAgainst: sum.runsAgainst + cell.runsAgainst, unknownScores: sum.unknownScores + cell.unknownScores, unknownDiff: sum.unknownDiff + cell.unknownDiff };
  }, { wins: 0, losses: 0, runsFor: 0, runsAgainst: 0, unknownScores: 0, unknownDiff: 0 });

  const resolveTie = (peers: Team[], start: number): Range[] => {
    const unresolved = (subset: Team[], rank: number, reason: string): Range[] => subset.map(t => ({ index: t.index, min: rank, max: rank + subset.length - 1, reasons: [reason] }));
    if (peers.length === 1) return [{ index: peers[0]!.index, min: start, max: start, reasons: [] }];
    // The stored AUBL article 17 specifies two- and three-team procedures only.
    if (peers.length > 3) return unresolved(peers, start, '4팀 이상 동률로 운영진 확인이 필요합니다.');
    const peer = new Map(peers.map(t => [t.index, peerStats(t, peers)]));
    const completeRuns = pendingCount === 0 && peers.every(t => integer(t.runsFor) && integer(t.runsAgainst));
    const stages: Array<{ available: boolean; compare: (a: Team, b: Team) => number }> = [
      { available: true, compare: (a, b) => compareRate(peer.get(a.index)!, peer.get(b.index)!) },
      { available: peers.every(t => peer.get(t.index)!.unknownDiff === 0), compare: (a, b) => (peer.get(b.index)!.runsFor - peer.get(b.index)!.runsAgainst) - (peer.get(a.index)!.runsFor - peer.get(a.index)!.runsAgainst) },
    ];
    if (peers.length === 3) {
      stages.push(
        { available: peers.every(t => peer.get(t.index)!.unknownScores === 0), compare: (a, b) => peer.get(b.index)!.runsFor - peer.get(a.index)!.runsFor },
        { available: stages[1]!.available, compare: (a, b) => peer.get(a.index)!.runsAgainst - peer.get(b.index)!.runsAgainst },
        { available: completeRuns, compare: (a, b) => (b.runsFor! - b.runsAgainst!) - (a.runsFor! - a.runsAgainst!) },
        { available: completeRuns, compare: (a, b) => b.runsFor! - a.runsFor! },
        { available: completeRuns, compare: (a, b) => a.runsAgainst! - b.runsAgainst! },
      );
    }
    const visit = (subset: Team[], rank: number, stage: number): Range[] => {
      if (subset.length === 1) return [{ index: subset[0]!.index, min: rank, max: rank, reasons: [] }];
      const rule = stages[stage];
      if (!rule) return unresolved(subset, rank, peers.length === 2 ? '결정경기 필요' : '동률 해소 불가: 운영진 판정 필요');
      if (!rule.available) return unresolved(subset, rank, '남은 경기의 득실점에 따라 동률 순위가 달라집니다.');
      let cursor = rank;
      return partition(subset, rule.compare).flatMap(group => {
        const ranges = visit(group, cursor, stage + 1); cursor += group.length; return ranges;
      });
    };
    return visit(peers, start, 0);
  };

  const recordResult = (weight: bigint) => {
    let cursor = 1;
    const ranges = partition(teams, compareRate).flatMap(group => { const result = resolveTie(group, cursor); cursor += group.length; return result; });
    for (const range of ranges) {
      const acc = accumulators[range.index]!;
      const firstBucket = bucket(range.min), lastBucket = bucket(range.max);
      if (firstBucket === lastBucket) acc.guaranteed[buckets.indexOf(firstBucket)]! += weight;
      else acc.unresolved += weight;
      // A tied range contributes once to each possible bucket, not once per rank.
      for (let i = buckets.indexOf(firstBucket); i <= buckets.indexOf(lastBucket); i++) acc.possible[i]! += weight;
      for (const reason of range.reasons) acc.notes.add(reason);
      for (let rank = range.min; rank <= range.max; rank++) {
        const conditional = range.min !== range.max;
        const previous = acc.ranks.get(rank);
        // Prefer a concrete result witness over a still-unresolved tie envelope.
        if (!previous || (previous.conditional && !conditional)) acc.ranks.set(rank, { rank, conditional, reasons: range.reasons, conditions: path.map(p => ({ ...p })) });
      }
    }
    evaluatedStates++; count += weight;
  };
  const branch = (index: number, weight: bigint) => {
    if (exhausted) return;
    if (evaluatedStates >= cap) { exhausted = true; return; }
    const pair = pairs[index];
    if (!pair) { recordResult(weight); return; }
    const a = teams[pair.a]!, b = teams[pair.b]!, ab = matrix[pair.a]![pair.b]!, ba = matrix[pair.b]![pair.a]!;
    // Same-pair order does not alter W/L/T or H2H. Retain multinomial weights
    // so the represented number of individual game outcomes still equals 3^R.
    for (let wins = pair.count; wins >= 0; wins--) {
      for (let losses = pair.count - wins; losses >= 0; losses--) {
        const ties = pair.count - wins - losses;
        if (ties && !options?.includeDrawsInProjection) continue;
        const multiplicity = factorial(pair.count) / (factorial(wins) * factorial(losses) * factorial(ties));
        a.wins += wins; a.losses += losses; a.ties += ties;
        b.wins += losses; b.losses += wins; b.ties += ties;
        ab.unknownDiff += wins + losses; ba.unknownDiff += wins + losses;
        ab.wins += wins; ab.losses += losses; ab.ties += ties;
        ba.wins += losses; ba.losses += wins; ba.ties += ties;
        path.push({ teamA: a.teamName, teamB: b.teamName, wins, losses, ties });
        branch(index + 1, weight * multiplicity);
        path.pop();
        a.wins -= wins; a.losses -= losses; a.ties -= ties;
        b.wins -= losses; b.losses -= wins; b.ties -= ties;
        ab.unknownDiff -= wins + losses; ba.unknownDiff -= wins + losses;
        ab.wins -= wins; ab.losses -= losses; ab.ties -= ties;
        ba.wins -= losses; ba.losses -= wins; ba.ties -= ties;
        if (exhausted) return;
      }
    }
  };
  branch(0, 1n);
  return {
    totalScenarios: count.toString(), expectedScenarios: expected.toString(), evaluatedStates, exhausted, warnings: [],
    projections: teams.map((team, index) => {
      const acc = accumulators[index]!, rankCases = [...acc.ranks.values()].sort((a, b) => a.rank - b.rank);
      const possibleRanks = rankCases.map(item => item.rank);
      const possibleBuckets = buckets.filter(value => possibleRanks.some(rank => bucket(rank) === value));
      return { teamId: team.teamId, minPossibleRank: possibleRanks[0] ?? 0, maxPossibleRank: possibleRanks.at(-1) ?? 0,
        possibleRanks, possibleBuckets, rankCases, tieBreakNotes: [...acc.notes, ...(exhausted ? ['계산 미완료: 추가로 확인할 경기 결과가 있습니다.'] : [])],
        distribution: {
          model: options?.includeDrawsInProjection ? 'equal-win-loss-draw' : 'equal-win-loss',
          totalCases: expected.toString(), countedCases: count.toString(), unresolvedCases: acc.unresolved.toString(),
          buckets: buckets.map((value, i) => ({ bucket: value, guaranteedCases: acc.guaranteed[i]!.toString(), possibleCases: acc.possible[i]!.toString() })),
        },
        scenarioCount: count.toString(), expectedScenarios: expected.toString(), evaluatedStates, exhausted };
    }),
  };
}

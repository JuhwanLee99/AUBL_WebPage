import assert from 'node:assert/strict';
import { analyzeGroupPlayoffScenarios } from '../src/features/front/components/season2026/qualificationScenarios.ts';

const team = (teamId, teamName, wins, losses, ties = 0, runsFor = 0, runsAgainst = 0) => ({
  teamId,
  teamName,
  wins,
  losses,
  ties,
  runsFor,
  runsAgainst,
});

const match = ({ id = 'm', homeTeamName, awayTeamName, status = 'completed', homeScore, awayScore }) => ({
  id,
  startTime: '2026-08-01T12:00:00+09:00',
  venue: '테스트 구장',
  homeTeamName,
  awayTeamName,
  status,
  homeScore: homeScore == null ? null : Number(homeScore),
  awayScore: awayScore == null ? null : Number(awayScore),
});

const sampleScenarios = [
  {
    id: 'S01_fixed_기준결과_동률없음',
    description: '완료경기만 존재해 경우의 수가 1개인 고정 시나리오',
    teams: [
      team(1, 'A조-기록원A', 3, 1, 0, 12, 10),
      team(2, 'A조-기록원B', 2, 2, 0, 8, 9),
      team(3, 'A조-기록원C', 1, 3, 0, 7, 8),
      team(4, 'A조-기록원D', 0, 4, 0, 5, 15),
    ],
    matches: [
      match({ id: 'm101', homeTeamName: 'A조-기록원A', awayTeamName: 'A조-기록원B', status: 'completed', homeScore: 5, awayScore: 3 }),
      match({ id: 'm102', homeTeamName: 'A조-기록원C', awayTeamName: 'A조-기록원D', status: 'completed', homeScore: 4, awayScore: 1 }),
      match({ id: 'm103', homeTeamName: 'A조-기록원A', awayTeamName: 'A조-기록원C', status: 'completed', homeScore: 2, awayScore: 1 }),
    ],
    expected: {
      totalScenarios: '1',
    },
  },
  {
    id: 'S02_single_pending_순위_단일게임',
    description: '1경기 미완료가 상위권 1·2위를 전환 가능',
    teams: [
      team(1, 'A조-기록원A', 2, 1, 0, 10, 7),
      team(2, 'A조-기록원B', 1, 2, 0, 9, 10),
      team(3, 'A조-기록원C', 1, 1, 0, 4, 5),
      team(4, 'A조-기록원D', 0, 3, 0, 2, 7),
    ],
    matches: [
      match({ id: 'm201', homeTeamName: 'A조-기록원A', awayTeamName: 'A조-기록원B', status: 'scheduled' }),
      match({ id: 'm202', homeTeamName: 'A조-기록원C', awayTeamName: 'A조-기록원D', status: 'completed', homeScore: 1, awayScore: 4 }),
    ],
  },
  {
    id: 'S03_draw_포함_3경기',
    description: '승리/패/무가 모두 가능한 단일 조별 경로',
    teams: [
      team(1, 'A조-기록원A', 1, 1, 1, 6, 6),
      team(2, 'A조-기록원B', 1, 1, 1, 6, 6),
      team(3, 'A조-기록원C', 1, 2, 0, 5, 5),
      team(4, 'A조-기록원D', 0, 2, 0, 3, 9),
    ],
    matches: [
      match({ id: 'm301', homeTeamName: 'A조-기록원A', awayTeamName: 'A조-기록원B', status: 'scheduled' }),
      match({ id: 'm302', homeTeamName: 'A조-기록원C', awayTeamName: 'A조-기록원D', status: 'completed', homeScore: 6, awayScore: 7 }),
    ],
  },
  {
    id: 'S04_head_to_head_직접교차_정렬',
    description: '1승1패 동률에서 H2H 승률이 우선 정렬을 바꿔주는 케이스',
    teams: [
      team(1, 'A조-기록원A', 1, 1, 0, 7, 9),
      team(2, 'A조-기록원B', 1, 1, 0, 7, 8),
      team(3, 'A조-기록원C', 1, 1, 0, 9, 7),
      team(4, 'A조-기록원D', 0, 3, 0, 2, 12),
    ],
    matches: [
      match({ id: 'm401', homeTeamName: 'A조-기록원A', awayTeamName: 'A조-기록원B', status: 'completed', homeScore: 3, awayScore: 1 }),
      match({ id: 'm402', homeTeamName: 'A조-기록원B', awayTeamName: 'A조-기록원C', status: 'completed', homeScore: 4, awayScore: 2 }),
      match({ id: 'm403', homeTeamName: 'A조-기록원C', awayTeamName: 'A조-기록원A', status: 'completed', homeScore: 5, awayScore: 7 }),
      match({ id: 'm404', homeTeamName: 'A조-기록원D', awayTeamName: 'A조-기록원A', status: 'scheduled' }),
    ],
  },
  {
    id: 'S05_run_tie_직접_효력',
    description: '승패와 타율은 동일하고 득실차로 정렬되는 미완료 케이스',
    teams: [
      team(1, 'A조-기록원A', 2, 2, 0, 24, 20),
      team(2, 'A조-기록원B', 2, 2, 0, 22, 18),
      team(3, 'A조-기록원C', 1, 3, 0, 15, 9),
      team(4, 'A조-기록원D', 0, 4, 0, 12, 30),
    ],
    matches: [
      match({ id: 'm501', homeTeamName: 'A조-기록원A', awayTeamName: 'A조-기록원B', status: 'scheduled' }),
      match({ id: 'm502', homeTeamName: 'A조-기록원C', awayTeamName: 'A조-기록원D', status: 'completed', homeScore: 2, awayScore: 4 }),
    ],
  },
  {
    id: 'S06_runs_allowed_보조정렬',
    description: '득득실차 동률 후 다득점/적소미로 이어지는 방어 정렬 경로',
    teams: [
      team(1, 'A조-기록원A', 1, 1, 0, 10, 8),
      team(2, 'A조-기록원B', 1, 1, 0, 11, 9),
      team(3, 'A조-기록원C', 1, 1, 0, 13, 11),
      team(4, 'A조-기록원D', 0, 2, 0, 8, 14),
    ],
    matches: [
      match({ id: 'm601', homeTeamName: 'A조-기록원A', awayTeamName: 'A조-기록원B', status: 'scheduled' }),
      match({ id: 'm602', homeTeamName: 'A조-기록원B', awayTeamName: 'A조-기록원C', status: 'scheduled' }),
      match({ id: 'm603', homeTeamName: 'A조-기록원D', awayTeamName: 'A조-기록원A', status: 'completed', homeScore: 2, awayScore: 3 }),
    ],
  },
  {
    id: 'S07_미완성_3부',
    description: '동시 진행형 3경기가 남아 있을 때의 전체 탐색',
    teams: [
      team(1, 'A조-기록원A', 1, 1, 0, 9, 9),
      team(2, 'A조-기록원B', 1, 1, 0, 9, 9),
      team(3, 'A조-기록원C', 1, 1, 0, 9, 9),
      team(4, 'A조-기록원D', 1, 1, 0, 9, 9),
    ],
    matches: [
      match({ id: 'm701', homeTeamName: 'A조-기록원A', awayTeamName: 'A조-기록원B', status: 'scheduled' }),
      match({ id: 'm702', homeTeamName: 'A조-기록원C', awayTeamName: 'A조-기록원D', status: 'scheduled' }),
      match({ id: 'm703', homeTeamName: 'A조-기록원A', awayTeamName: 'A조-기록원C', status: 'scheduled' }),
    ],
  },
  {
    id: 'S08_tie와_승부방식_혼합',
    description: '승/패/무 조합에서 H2H 동률을 함께 처리',
    teams: [
      team(1, 'A조-기록원A', 0, 0, 1, 4, 4),
      team(2, 'A조-기록원B', 0, 0, 1, 4, 4),
      team(3, 'A조-기록원C', 1, 1, 0, 6, 6),
      team(4, 'A조-기록원D', 1, 1, 0, 3, 3),
    ],
    matches: [
      match({ id: 'm801', homeTeamName: 'A조-기록원A', awayTeamName: 'A조-기록원B', status: 'scheduled' }),
      match({ id: 'm802', homeTeamName: 'A조-기록원C', awayTeamName: 'A조-기록원D', status: 'completed', homeScore: 4, awayScore: 2 }),
    ],
  },
  {
    id: 'S09_완료경기_누적_재검증',
    description: '완료경기만 있고 남은 경기 없음. 중복 반영 이슈 재현 방어',
    teams: [
      team(1, 'A조-기록원A', 2, 1, 0, 15, 12),
      team(2, 'A조-기록원B', 1, 2, 0, 12, 15),
      team(3, 'A조-기록원C', 1, 1, 0, 8, 8),
      team(4, 'A조-기록원D', 0, 3, 0, 5, 15),
    ],
    matches: [
      match({ id: 'm901', homeTeamName: 'A조-기록원A', awayTeamName: 'A조-기록원B', status: 'completed', homeScore: 6, awayScore: 3 }),
      match({ id: 'm902', homeTeamName: 'A조-기록원C', awayTeamName: 'A조-기록원D', status: 'completed', homeScore: 4, awayScore: 7 }),
      match({ id: 'm903', homeTeamName: 'A조-기록원A', awayTeamName: 'A조-기록원C', status: 'completed', homeScore: 5, awayScore: 5 }),
    ],
    expected: {
      totalScenarios: '1',
    },
  },
  {
    id: 'S10_경기일치_여러개_엣지',
    description: '동일 상대전이 두 번 남아 있어도 일자와 팀명이 기준이 되는 순열 탐색',
    teams: [
      team(1, 'A조-기록원A', 1, 2, 0, 7, 10),
      team(2, 'A조-기록원B', 1, 2, 0, 8, 9),
      team(3, 'A조-기록원C', 1, 1, 1, 8, 7),
      team(4, 'A조-기록원D', 1, 1, 1, 9, 8),
    ],
    matches: [
      match({ id: 'm1001', homeTeamName: 'A조-기록원A', awayTeamName: 'A조-기록원B', status: 'scheduled' }),
      match({ id: 'm1002', homeTeamName: 'A조-기록원A', awayTeamName: 'A조-기록원B', status: 'scheduled' }),
      match({ id: 'm1003', homeTeamName: 'A조-기록원C', awayTeamName: 'A조-기록원D', status: 'scheduled' }),
      match({ id: 'm1004', homeTeamName: 'A조-기록원D', awayTeamName: 'A조-기록원C', status: 'completed', homeScore: 1, awayScore: 2 }),
    ],
  },
];

const scenarioSummary = (scenario) => {
  const result = analyzeGroupPlayoffScenarios(scenario.teams, scenario.matches, {
    includeDrawsInProjection: true,
    maxScenarios: 50000,
    fallbackRunDataToZero: false,
  });

  const projectionsByTeam = new Map(scenario.teams.map((team, index) => [team.teamId, result.projections[index]]));

  if (scenario.expected?.totalScenarios) {
    assert.equal(
      result.totalScenarios,
      scenario.expected.totalScenarios,
      `${scenario.id}: totalScenarios expected ${scenario.expected.totalScenarios}, got ${result.totalScenarios}`,
    );
  }

  console.log(`\n[${scenario.id}] ${scenario.description}`);
  console.log(`  matches: ${scenario.matches.length}, completed: ${scenario.matches.filter((m) => m.status === 'completed').length}, pending: ${scenario.matches.filter((m) => m.status !== 'completed').length}`);

  for (const team of scenario.teams) {
    const projection = projectionsByTeam.get(team.teamId);
    if (!projection) continue;
    const buckets = projection.possibleBuckets.join(',') || 'out';
    console.log(`  - ${team.teamName}: ${projection.minPossibleRank}~${projection.maxPossibleRank}위 (${buckets}) / scenarios=${projection.scenarioCount}`);

  }

  console.log(`  totalScenarios=${result.totalScenarios}, exhausted=${result.exhausted}`);
};

for (const scenario of sampleScenarios) {
  scenarioSummary(scenario);
}

console.log('\n총 시나리오:', sampleScenarios.length);

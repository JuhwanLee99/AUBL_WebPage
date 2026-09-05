import { BATTER_DETAIL_HEADERS, PITCHER_DETAIL_HEADERS, parseLineScore, parseTeamTables } from '../../src/game-details.mjs';

export function tableFixture(labels, headers, rows) {
  return { labels, columns: headers.map((header, index) => ({ header, values: rows.map((row) => row[index]) })) };
}

export function boxscoreSnapshots() {
  const lineScore = {
    teamNames: ['테스트 대학 A', '테스트 대학 B'],
    innings: [
      { header: '1', values: ['1', '0'] },
      { header: '2', values: ['0', '1'] },
      { header: '3', values: ['2', '0'] },
      { header: '4', values: ['X', '0'] },
    ],
    totals: [
      { header: 'R', values: ['3', '1'] },
      { header: 'H', values: ['4', '2'] },
      { header: 'E', values: ['1', '0'] },
      { header: 'B', values: ['2', '1'] },
    ],
  };
  const batterHeaders = ['1', '2', '3', '4', ...BATTER_DETAIL_HEADERS];
  return [
    {
      selectedTeam: lineScore.teamNames[0], lineScore,
      batter: tableFixture(['1 중견 타자갑 (3)', '9 좌익 동명선수 (51)', '9 미정 동명선수 (31)', '합계'], batterHeaders, [
        ['볼넷,도루', '좌안', '사구,송구실책,사구', '', '2', '2', '1', '1', '2', '1.000', '.333'],
        ['삼진', '', '좌안', '', '1', '1', '1', '0', '1', '1.000', '0.200'],
        ['', '', '우안', '', '1', '1', '1', '0', '0', '1.000', '0.300'],
        ['', '', '', '', '4', '4', '0', '1', '0', '-', '-'], // Source aggregates can be wrong; never import this row.
      ]),
      pitcher: tableFixture(['투수갑 (99) 승', '투수을 (10) 홀드', '합계'], PITCHER_DETAIL_HEADERS, [
        ['1.2', '1', '1', '0', '1', '2', '0.00'],
        ['2.1', '1', '0', '0', '0', '1', '0.00'],
        ['4', '2', '1', '0', '1', '3', '0.00'],
      ]),
    },
    {
      selectedTeam: lineScore.teamNames[1], lineScore,
      batter: tableFixture(['1 포수 타자을 (1)', '2 투수 타자병 (2)', '합계'], batterHeaders, [
        ['좌안', '', '삼진', '', '2', '1', '0', '0', '1', '0.500', '0.300'],
        ['', '우안', '', '유땅', '2', '1', '1', '0', '0', '0.500', '0.400'],
        ['', '', '', '', '4', '2', '1', '0', '1', '-', '-'],
      ]),
      pitcher: tableFixture(['투수병 (9) 패', '합계'], PITCHER_DETAIL_HEADERS, [
        ['3', '4', '3', '3', '2', '1', '9.00'],
        ['3', '4', '3', '3', '2', '1', '9.00'],
      ]),
    },
  ];
}

export function detailFixture() {
  const snapshots = boxscoreSnapshots();
  const teams = parseLineScore(snapshots[0].lineScore).map((team, index) => ({ ...team, ...parseTeamTables(snapshots[index], team.teamName) }));
  return { schemaVersion: 1, sourceGameId: 'up-fixture-game', providerGameId: '12345', status: 'AVAILABLE', teams };
}

export function candidateFixture() {
  return {
    games: [{ sourceGameId: 'up-fixture-game', status: 'COMPLETED', homeTeamName: '테스트 대학 A', awayTeamName: '테스트 대학 B', homeScore: 3, awayScore: 1 }],
    gameDetails: [detailFixture()],
  };
}

export function forfeitSnapshots() {
  return boxscoreSnapshots().map((snapshot) => ({
    selectedTeam: snapshot.selectedTeam,
    lineScore: {
      teamNames: snapshot.lineScore.teamNames,
      innings: Array.from({ length: 7 }, (_, index) => ({ header: String(index + 1), values: ['1', '0'] })),
      totals: ['R', 'H', 'E', 'B'].map((header) => ({ header, values: [header === 'R' ? '7' : '0', '0'] })),
    },
    batter: tableFixture(['합계'], BATTER_DETAIL_HEADERS, [['0', '0', '0', '0', '0', '0', '0']]),
    pitcher: tableFixture(['합계'], PITCHER_DETAIL_HEADERS, [['0', '0', '0', '0', '0', '0', '0']]),
  }));
}

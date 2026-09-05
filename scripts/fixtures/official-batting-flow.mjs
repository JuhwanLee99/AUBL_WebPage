// Public score-sheet notation for up-f1e054d7678bf5467580de7d (2026-08-24).
// Only replay-relevant fields; unneeded numeric stats deliberately stay null.
const team = (teamName, records) => ({
  teamName, innings: [1, 2, 3, 4, 5].map(inning => ({ inning, runs: null, notPlayed: false })),
  totals: { runs: null, hits: null, errors: null, walks: null }, pitchers: [],
  batters: records.map(([battingOrder, playerName, results], index) => ({
    rowKey: `${teamName}-${index}`, playerName, battingOrder, jerseyNumber: null, position: null,
    stats: { atBats: null, hits: null, runs: null, rbi: null, stolenBases: null, battingAverage: null, seasonBattingAverage: null },
    plateAppearances: Object.entries(results).map(([inning, result]) => ({ inning: Number(inning), result })),
  })),
});

export const koreaBattingFixture = team('고려대학교 백구회', [
  [1, 'YAMASHITA SHU', { 1: '우플', 2: '우중3', 3: '유땅', 5: '볼넷,도루,폭투' }],
  [2, '이상진', { 1: '좌플', 2: '볼넷,도루', 3: '중안,도루', 5: '2땅' }],
  [3, '박태성', { 1: '볼넷,도루,도루자', 2: '볼넷', 3: '좌플', 5: '삼진' }],
  [4, '심태윤', { 2: '사구,송구실책,사구', 4: '포플' }],
  [5, '이정용', { 2: '2직,좌안', 4: '삼진' }],
  [6, '이현준', { 2: '좌2,폭투,좌안', 4: '사구' }],
  [7, '이승엽', { 2: '삼진,사구', 4: '1플' }],
  [8, '이윤우', { 2: '3실,도루,삼진', 5: '삼진' }],
  [9, '최문석', { 2: '볼넷', 3: '2땅', 5: '사구,폭투,폭투' }],
  [9, '정인웅', {}],
]);

export const kyungheeBattingFixture = team('경희대학교(서울) BRAVES', [
  [1, '이수호', { 1: '볼넷,도루', 3: '볼넷', 4: '1땅' }],
  [2, '김민수', { 1: '우플', 3: '폭투,우안,도루', 4: '2땅' }],
  [3, '이준용', { 1: '유땅', 3: '우플', 5: '투실,포일' }],
  [4, '최욱진', { 1: '삼진', 3: '3땅R', 5: '볼넷' }],
  [5, '전민찬', { 2: '사구,도루', 3: '중플', 5: '사구' }],
  [6, '오재영', { 2: '2땅', 4: '유안,도루', 5: '삼진' }],
  [7, '안정빈', { 2: '2땅R', 4: '볼넷', 5: '삼진' }],
  [8, '연규성', { 2: '2땅', 4: '삼진', 5: '삼진' }],
  [9, '고주용', { 3: '볼넷,도루', 4: '좌안,도루' }],
]);

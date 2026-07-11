export interface SeededTeam {
  name: string;
  seed: number;
  rank: number;
}

export const SEEDED_TEAMS: SeededTeam[] = [
  // 1시드 (1~8위)
  { name: '세종대학교 세종킹스', seed: 1, rank: 1 },
  { name: '연세대학교 EAGLES', seed: 1, rank: 2 },
  { name: '한양대학교 불새', seed: 1, rank: 3 },
  { name: '경희대국제 LIONS', seed: 1, rank: 4 },
  { name: '경희대학교(서울) BRAVES', seed: 1, rank: 5 },
  { name: '한국외대(서울) 야구부', seed: 1, rank: 6 },
  { name: '홍익대학교 위너스', seed: 1, rank: 7 },
  { name: '숭실대학교 oners', seed: 1, rank: 8 },
  // 2시드 (9~16위)
  { name: '중앙대학교 랑데뷰', seed: 2, rank: 9 },
  { name: '고려대학교 백구회', seed: 2, rank: 10 },
  { name: '건국대(서울) 불소야구', seed: 2, rank: 11 },
  { name: '서울시립대학교FALCONS', seed: 2, rank: 12 },
  { name: '경기대학교 KGB', seed: 2, rank: 13 },
  { name: '국민대학교 윈드밀스', seed: 2, rank: 14 },
  { name: '아주대학교 ABBA', seed: 2, rank: 15 },
  { name: '서강대학교 야구반 알바트로스', seed: 2, rank: 16 },
  // 3시드 (17~24위)
  { name: '인천대학교 바이킹', seed: 3, rank: 17 },
  { name: '인하대학교 비룡', seed: 3, rank: 18 },
  { name: '가천 WIND', seed: 3, rank: 19 },
  { name: '상명대BUCKS', seed: 3, rank: 20 },
  { name: '백석대학교 칼로스', seed: 3, rank: 21 },
  { name: '서울과학기술대 미르', seed: 3, rank: 22 },
  { name: '동국대학교 LAE', seed: 3, rank: 23 },
  { name: '명지대학교(서울) 나이너스', seed: 3, rank: 24 },
  // 4시드 (25~32위)
  { name: '외대(글로벌) 유니온', seed: 4, rank: 25 },
  { name: '성균관대학교 킹고야구반', seed: 4, rank: 26 },
  { name: '한국항공대 Astros', seed: 4, rank: 27 },
  { name: '단국대 PANDAS', seed: 4, rank: 28 },
  { name: '건국대 팬서스', seed: 4, rank: 29 },
  { name: '단국대학교 하운드', seed: 4, rank: 30 },
  { name: '한양대ERICA HIBA', seed: 4, rank: 31 },
  { name: '한국공학대학교 WINNERS', seed: 4, rank: 32 },
  // 5시드 (33~40위)
  { name: '강남대학교 타키온즈', seed: 5, rank: 33 },
  { name: '한성대학교 TURTLES', seed: 5, rank: 34 },
  { name: '서경대학교 적시타', seed: 5, rank: 35 },
  { name: '가톨릭대학교 텀블러즈', seed: 5, rank: 36 },
  { name: '한신대학교 갱스터', seed: 5, rank: 37 },
  { name: '한국체대 루나틱스', seed: 5, rank: 38 },
  { name: '한국교통대학교 스윙스', seed: 5, rank: 39 },
  { name: '광운대학교 페가수스', seed: 5, rank: 40 },
];

export const TEAM_SEED_INFO: ReadonlyMap<string, SeededTeam> = new Map(
  SEEDED_TEAMS.map((entry) => [entry.name, entry]),
);

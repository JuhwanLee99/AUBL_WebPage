/**
 * 2026 시즌 A~H조 조편성 — 대표자회의 확정 후 업데이트.
 * group 값을 변경하면 TeamsPage, ScheduleGroupsPage 등에 자동 반영됩니다.
 */

export type GroupLetter = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H';

export interface TeamGroupEntry {
  name: string;
  group: GroupLetter;
}

export const TEAM_GROUPS: TeamGroupEntry[] = [
  { name: '가천 WIND', group: 'A' },
  { name: '가톨릭대학교 텀블러즈', group: 'A' },
  { name: '강남대학교 타키온즈', group: 'A' },
  { name: '건국대 팬서스', group: 'A' },
  { name: '건국대(서울) 불소야구', group: 'A' },
  { name: '경기대학교 KGB', group: 'B' },
  { name: '경희대국제 LIONS', group: 'B' },
  { name: '경희대학교(서울) BRAVES', group: 'B' },
  { name: '고려대학교 백구회', group: 'B' },
  { name: '광운대학교 페가수스', group: 'B' },
  { name: '국민대학교 윈드밀스', group: 'C' },
  { name: '단국대 PANDAS', group: 'C' },
  { name: '단국대학교 하운드', group: 'C' },
  { name: '동국대학교 LAE', group: 'C' },
  { name: '명지대학교(서울) 나이너스', group: 'C' },
  { name: '백석대학교 칼로스', group: 'D' },
  { name: '상명대BUCKS', group: 'D' },
  { name: '서강대학교 야구반 알바트로스', group: 'D' },
  { name: '서경대학교 적시타', group: 'D' },
  { name: '서울과학기술대 미르', group: 'D' },
  { name: '서울시립대학교FALCONS', group: 'E' },
  { name: '성균관대학교 킹고야구반', group: 'E' },
  { name: '세종대학교 세종킹스', group: 'E' },
  { name: '숭실대학교 oners', group: 'E' },
  { name: '아주대학교 ABBA', group: 'E' },
  { name: '연세대학교 EAGLES', group: 'F' },
  { name: '외대(글로벌) 유니온', group: 'F' },
  { name: '인천대학교 바이킹', group: 'F' },
  { name: '인하대학교 비룡', group: 'F' },
  { name: '중앙대학교 랑데뷰', group: 'F' },
  { name: '한국공학대학교 WINNERS', group: 'G' },
  { name: '한국교통대학교 스윙스', group: 'G' },
  { name: '한국외대(서울) 야구부', group: 'G' },
  { name: '한국체대 루나틱스', group: 'G' },
  { name: '한국항공대 Astros', group: 'G' },
  { name: '한성대학교 TURTLES', group: 'H' },
  { name: '한신대학교 갱스터', group: 'H' },
  { name: '한양대ERICA HIBA', group: 'H' },
  { name: '한양대학교 불새', group: 'H' },
  { name: '홍익대학교 위너스', group: 'H' },
];

/** 팀명 → 조 빠른 검색용 Map */
export const TEAM_NAME_TO_GROUP: ReadonlyMap<string, GroupLetter> = new Map(
  TEAM_GROUPS.map((t) => [t.name, t.group]),
);

export const GROUP_LETTERS: GroupLetter[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

export const GROUP_COLORS: Record<GroupLetter, string> = {
  A: '#60a5fa',
  B: '#a855f7',
  C: '#34d399',
  D: '#f97316',
  E: '#f43f5e',
  F: '#facc15',
  G: '#38bdf8',
  H: '#fb923c',
};

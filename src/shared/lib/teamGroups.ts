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
  { name: '가천 WIND', group: 'D' },
  { name: '가톨릭대학교 텀블러즈', group: 'H' },
  { name: '강남대학교 타키온즈', group: 'F' },
  { name: '건국대 팬서스', group: 'D' },
  { name: '건국대(서울) 불소야구', group: 'E' },
  { name: '경기대학교 KGB', group: 'D' },
  { name: '경희대국제 LIONS', group: 'C' },
  { name: '경희대학교(서울) BRAVES', group: 'A' },
  { name: '고려대학교 백구회', group: 'A' },
  { name: '광운대학교 페가수스', group: 'G' },
  { name: '국민대학교 윈드밀스', group: 'C' },
  { name: '단국대 PANDAS', group: 'E' },
  { name: '단국대학교 하운드', group: 'H' },
  { name: '동국대학교 LAE', group: 'A' },
  { name: '명지대학교(서울) 나이너스', group: 'H' },
  { name: '백석대학교 칼로스', group: 'E' },
  { name: '상명대BUCKS', group: 'F' },
  { name: '서강대학교 야구반 알바트로스', group: 'F' },
  { name: '서경대학교 적시타', group: 'A' },
  { name: '서울과학기술대 미르', group: 'B' },
  { name: '서울시립대학교FALCONS', group: 'B' },
  { name: '성균관대학교 킹고야구반', group: 'G' },
  { name: '세종대학교 세종킹스', group: 'H' },
  { name: '숭실대학교 oners', group: 'D' },
  { name: '아주대학교 ABBA', group: 'H' },
  { name: '연세대학교 EAGLES', group: 'E' },
  { name: '외대(글로벌) 유니온', group: 'B' },
  { name: '인천대학교 바이킹', group: 'G' },
  { name: '인하대학교 비룡', group: 'C' },
  { name: '중앙대학교 랑데뷰', group: 'G' },
  { name: '한국공학대학교 WINNERS', group: 'F' },
  { name: '한국교통대학교 스윙스', group: 'D' },
  { name: '한국외대(서울) 야구부', group: 'B' },
  { name: '한국체대 루나틱스', group: 'C' },
  { name: '한국항공대 Astros', group: 'C' },
  { name: '한성대학교 TURTLES', group: 'B' },
  { name: '한신대학교 갱스터', group: 'E' },
  { name: '한양대ERICA HIBA', group: 'A' },
  { name: '한양대학교 불새', group: 'F' },
  { name: '홍익대학교 위너스', group: 'G' },
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

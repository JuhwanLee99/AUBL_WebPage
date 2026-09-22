export const DIVISIONS = ['eutteum', 'beogeum'] as const;
export type Division = typeof DIVISIONS[number];
export const divisionLabel: Record<Division, string> = { eutteum: '으뜸', beogeum: '버금' };
export const ROUNDS = ['r16', 'qf', 'sf', 'final'] as const;
export type Round = typeof ROUNDS[number];
export const roundLabel: Record<Round, string> = { r16: '16강', qf: '8강', sf: '준결승', final: '결승' };
const roundSizes: Record<Round, number> = { r16: 8, qf: 4, sf: 2, final: 1 };

export interface TournamentMatch {
  id: string;
  round: Round;
  index: number;
  startTime: string;
  venue: string;
  status: 'scheduled' | 'live' | 'completed' | 'postponed' | 'canceled';
  scores: [number | null, number | null];
  winner: string;
}
export interface TournamentDivision {
  seeds: string[];
  teamNames: Record<string, string>;
  matches: TournamentMatch[];
}
export interface TournamentConfig {
  schemaVersion: 1;
  season: 2026;
  phase: 'preview' | 'active' | 'finished';
  homeDefault: 'groups' | 'tournament';
  note: string;
  divisions: Record<Division, TournamentDivision>;
}

// Ordered top-to-bottom on the left, then top-to-bottom on the right.
const initialSeeds: Record<Division, string[]> = {
  eutteum: ['D2', 'G1', 'H2', 'F1', 'E2', 'H1', 'F2', 'B1', 'G2', 'E1', 'A2', 'C1', 'C2', 'D1', 'B2', 'A1'],
  beogeum: ['D4', 'B3', 'E4', 'H3', 'C4', 'D3', 'G4', 'F3', 'F4', 'A3', 'A4', 'E3', 'B4', 'C3', 'H4', 'G3'],
};

export function allowedSeeds(division: Division): string[] {
  return 'ABCDEFGH'.split('').flatMap(group => (division === 'eutteum' ? [1, 2] : [3, 4]).map(rank => `${group}${rank}`));
}

export function createTournament(): TournamentConfig {
  const makeDivision = (division: Division): TournamentDivision => ({
    seeds: [...initialSeeds[division]], teamNames: {},
    matches: ROUNDS.flatMap(round => Array.from({ length: roundSizes[round] }, (_, index): TournamentMatch => ({
      id: `${division}-${round}-${index + 1}`, round, index, startTime: '', venue: '',
      status: 'scheduled', scores: [null, null], winner: '',
    }))),
  });
  return { schemaVersion: 1, season: 2026, phase: 'preview', homeDefault: 'groups',
    note: '예상 대진이며 운영진의 확정 전까지 변경될 수 있습니다.',
    divisions: { eutteum: makeDivision('eutteum'), beogeum: makeDivision('beogeum') } };
}

export function entrants(division: TournamentDivision, match: TournamentMatch): [string | null, string | null] {
  if (match.round === 'r16') return [division.seeds[match.index * 2] ?? null, division.seeds[match.index * 2 + 1] ?? null];
  const previousRound = ROUNDS[ROUNDS.indexOf(match.round) - 1];
  return [0, 1].map(side => division.matches.find(previous => previous.round === previousRound
    && previous.index === match.index * 2 + side && previous.status === 'completed')?.winner || null) as [string | null, string | null];
}

export function entrantLabel(division: TournamentDivision, seed: string | null): string {
  return seed ? division.teamNames[seed] || `${seed[0]}조 ${seed[1]}위` : '이전 경기 승자';
}

// Only identity/result-dependent descendants are reset; dates and venues survive.
export function updateMatch(division: TournamentDivision, id: string, patch: Partial<TournamentMatch>): TournamentDivision {
  const next = structuredClone(division);
  const target = next.matches.find(match => match.id === id);
  if (!target) return next;
  Object.assign(target, patch);
  for (const round of ROUNDS.slice(1)) {
    for (const match of next.matches.filter(item => item.round === round)) {
      const oldPair = entrants(division, match);
      const newPair = entrants(next, match);
      if (oldPair.some((seed, index) => seed !== newPair[index])) {
        match.scores = [null, null]; match.winner = '';
        if (match.status === 'completed' || match.status === 'live') match.status = 'scheduled';
      }
    }
  }
  return next;
}

export function swapSeed(division: TournamentDivision, position: number, seed: string): TournamentDivision {
  const next = structuredClone(division);
  const other = next.seeds.indexOf(seed);
  if (other < 0 || other === position) return next;
  [next.seeds[position], next.seeds[other]] = [next.seeds[other], next.seeds[position]];
  // A draw change invalidates all entered results, not the announced schedule.
  next.matches.forEach(match => {
    match.scores = [null, null]; match.winner = '';
    if (match.status === 'completed' || match.status === 'live') match.status = 'scheduled';
  });
  return next;
}

function isValidSchedule(value: string): boolean {
  if (value === '') return true;
  if (!/^2026-\d{2}-\d{2}T\d{2}:\d{2}:00\+09:00$/.test(value)) return false;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return false;
  // Date.parse can roll February 30 or 24:00 into the next day. Require an
  // exact KST calendar round trip instead of accepting the normalized date.
  const kstCalendar = new Date(timestamp + 9 * 60 * 60 * 1000).toISOString().slice(0, 19);
  return kstCalendar === value.slice(0, 19);
}

export function validateTournament(value: unknown): asserts value is TournamentConfig {
  if (!value || typeof value !== 'object') throw new Error('대진표 형식을 확인해 주세요.');
  const config = value as TournamentConfig;
  if (config.schemaVersion !== 1 || config.season !== 2026
    || !['preview', 'active', 'finished'].includes(config.phase)
    || !['groups', 'tournament'].includes(config.homeDefault)
    || typeof config.note !== 'string' || config.note.length > 1000) throw new Error('시즌·운영 설정이 올바르지 않습니다.');
  const names = new Set<string>();
  for (const key of DIVISIONS) {
    const division = config.divisions?.[key];
    if (!division || !Array.isArray(division.seeds) || division.seeds.length !== 16
      || new Set(division.seeds).size !== 16 || division.seeds.some(seed => !allowedSeeds(key).includes(seed))
      || !division.teamNames || typeof division.teamNames !== 'object' || Array.isArray(division.teamNames)
      || !Array.isArray(division.matches) || division.matches.length !== 15) throw new Error(`${divisionLabel[key]}: 16개 진출 자리를 중복 없이 배치해 주세요.`);
    for (const [seed, name] of Object.entries(division.teamNames)) {
      if (!allowedSeeds(key).includes(seed) || typeof name !== 'string' || name.length > 100) throw new Error('확정 팀명을 확인해 주세요.');
      const normalized = name.normalize('NFKC').replace(/\s/g, '').toLowerCase();
      if (normalized && names.has(normalized)) throw new Error('같은 팀을 여러 진출 자리에 배정할 수 없습니다.');
      if (normalized) names.add(normalized);
    }
    for (const round of ROUNDS) for (let index = 0; index < roundSizes[round]; index++) {
      const matches = division.matches.filter(match => match.round === round && match.index === index);
      const match = matches[0];
      if (matches.length !== 1 || match.id !== `${key}-${round}-${index + 1}`
        || typeof match.startTime !== 'string' || !isValidSchedule(match.startTime)
        || typeof match.venue !== 'string' || match.venue.length > 150
        || !['scheduled', 'live', 'completed', 'postponed', 'canceled'].includes(match.status)
        || !Array.isArray(match.scores) || match.scores.length !== 2
        || match.scores.some(score => score !== null && (!Number.isInteger(score) || score < 0 || score > 999))
        || typeof match.winner !== 'string') throw new Error(`${divisionLabel[key]} ${roundLabel[round]} ${index + 1}경기 입력을 확인해 주세요.`);
      const pair = entrants(division, match);
      const [a, b] = match.scores;
      if (match.status === 'completed') {
        if (!pair[0] || !pair[1] || !pair.includes(match.winner) || a === null || b === null || a === b
          || match.winner !== pair[a > b ? 0 : 1]) throw new Error(`${roundLabel[round]} ${index + 1}경기: 참가 자리·점수·승자가 일치해야 종료할 수 있습니다.`);
      } else if (match.winner) throw new Error('종료 경기만 다음 라운드 진출자를 지정할 수 있습니다.');
      if ((!pair[0] || !pair[1]) && (match.status === 'live' || a !== null || b !== null)) throw new Error('이전 경기 승자 확정 전에는 후속 경기 점수를 입력할 수 없습니다.');
    }
  }
}

export function scheduleLabel(value: string): string {
  if (!value) return '일정 미정';
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric',
    weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
}

import { TEAMS } from './mockData';

const TEAM_ALIASES: Record<string, string> = {
  '가톨릭대학교 텀블러즈': 'Alpha College',
  '강남대학교 타키온즈': 'Beta University',
  '광운대학교 페가수스': 'Gamma Tech',
  '중앙대학교 랑데뷰': 'Delta Dragons',
  '중앙대학교(서울) 랑데뷰': 'Delta Dragons',
  '한양대erica h.i.b.a': 'Epsilon Eagles',
};

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9가-힣]/g, '');
}

function matchesName(source: string, target: string): boolean {
  const left = normalizeName(source);
  const right = normalizeName(target);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

export function resolveTeamIdByName(name: string): string | undefined {
  const trimmed = name.trim();
  if (!trimmed) return undefined;

  const aliasName = TEAM_ALIASES[trimmed] ?? TEAM_ALIASES[trimmed.toLowerCase()];
  const candidates = aliasName
    ? TEAMS.filter((team) => matchesName(aliasName, team.name) || matchesName(aliasName, team.university))
    : TEAMS.filter((team) => matchesName(trimmed, team.name) || matchesName(trimmed, team.university));

  return candidates[0]?.id;
}

import { normalizeScope, normalizeSeasonType } from '../../../shared/lib/recordFilters';

export function getScopeLabel(scope: string | null | undefined): string {
  const normalized = normalizeScope(scope);
  if (normalized === 'PLAYOFF') return 'PLAYOFF';
  if (normalized === 'LEAGUE') return 'LEAGUE';
  return 'LEAGUE';
}

export function getDivisionLabel(value: string | null | undefined): string {
  const normalized = normalizeSeasonType(value);
  if (normalized === 'EUTTEUM') return 'EUTTEUM';
  if (normalized === 'BEOGEUM') return 'BEOGEUM';
  return '-';
}

export function tierToKorean(tier: string | null | undefined): string {
  if (tier === 'EUTTEUM') return '으뜸';
  if (tier === 'BEOGEUM') return '버금';
  return tier || '-';
}

export function normalizeTier(value: string | null | undefined): string {
  const raw = (value || '').trim().toUpperCase();
  if (raw.includes('EUTTEUM') || raw.includes('으뜸')) return 'EUTTEUM';
  if (raw.includes('BEOGEUM') || raw.includes('버금')) return 'BEOGEUM';
  return raw || '-';
}

export function normalizeRound(value: string | null | undefined): string {
  const raw = (value || '').trim();
  return raw || '-';
}

export function toWinPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value <= 1 ? value * 100 : value;
}

export function estimateGamesFromStandings(
  rows: Array<{ wins: number; losses: number; ties: number }>,
): number {
  const teamGameSum = rows.reduce((sum, row) => sum + row.wins + row.losses + row.ties, 0);
  return Math.floor(teamGameSum / 2);
}

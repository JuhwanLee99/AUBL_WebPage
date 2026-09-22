import { useEffect, useState } from 'react';
import type { TeamRecordStanding } from '@core/api/backendClient';
import { fetchSeason2026RecordPayload } from '@features/front/components/season2026/homeData';
import type { HomeGroupView } from '@features/front/components/season2026/types';

export function projectedTournamentTeamNames(groups: HomeGroupView[]): Record<string, string> {
  return Object.fromEntries(groups.flatMap(group => group.rows.slice(0, 4)
    .map((row, index) => [`${group.group}${index + 1}`, row.teamName] as const)));
}

function groupCode(row: TeamRecordStanding): string | null {
  for (const value of [row.group, row.partCode]) {
    const normalized = value?.trim().toUpperCase() ?? '';
    const direct = normalized.match(/^(?:GROUP\s*)?([A-H])(?:\s*조)?$/)?.[1];
    if (direct) return direct;
    if (/^[1-8]$/.test(normalized)) return 'ABCDEFGH'[Number(normalized) - 1];
  }
  return null;
}

export function projectedNamesFromStandings(rows: TeamRecordStanding[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const group of 'ABCDEFGH') {
    const ranked = rows.filter(row => groupCode(row) === group).sort((a, b) =>
      (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER)
      || b.winPct - a.winPct || b.wins - a.wins || a.losses - b.losses
      || a.teamName.localeCompare(b.teamName, 'ko'));
    ranked.slice(0, 4).forEach((row, index) => { result[`${group}${index + 1}`] = row.teamName; });
  }
  return result;
}

export function useTournamentProjectedNames(): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    let active = true;
    void fetchSeason2026RecordPayload().then(payload => {
      if (active) setNames(projectedNamesFromStandings(payload.standings));
    }).catch(() => { if (active) setNames({}); });
    return () => { active = false; };
  }, []);
  return names;
}

import { GROUP_COLORS, TEAM_GROUPS } from './teamGroups';
import type { GroupLetter, TeamGroupEntry } from './teamGroups';

export type TeamDirectoryEntry = {
  name: string;
  group: GroupLetter;
  color: string;
};

export const encodeTeamId = (name: string): string => encodeURIComponent(name);

export const decodeTeamId = (id: string): string => {
  try {
    return decodeURIComponent(id);
  } catch {
    return id;
  }
};

export const buildTeamDirectory = (entries: TeamGroupEntry[]): TeamDirectoryEntry[] =>
  entries.map((entry) => ({
    ...entry,
    color: GROUP_COLORS[entry.group] ?? '#94a3b8',
  }));

export const getDefaultTeamEntries = (): TeamGroupEntry[] => TEAM_GROUPS;

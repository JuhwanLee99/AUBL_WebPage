import type { OfficialGameDetailsResponse } from '../../core/api/backendClient';

type Data = Record<string, unknown>;
export interface RecordComparisonRow {
  key: string;
  label: string;
  live: number | string | null;
  official: number | string | null;
  status: 'equal' | 'mismatch' | 'missing' | 'unmapped';
}
const data = (value: unknown): Data => value && typeof value === 'object' && !Array.isArray(value) ? value as Data : {};
const list = (value: unknown): Data[] => Array.isArray(value) ? value.map(data) : [];
const name = (value: unknown) => typeof value === 'string' ? value.normalize('NFKC').replace(/\s+/g, ' ').trim() : '';
const count = (value: unknown): number | null => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
const at = (value: unknown, ...keys: string[]): unknown => keys.reduce<unknown>((row, key) => data(row)[key], value);

function identity(row: Data, official: boolean): string | null {
  const raw = name(official ? row.playerName : row.name);
  const match = raw.match(/^(.*?)\s*\((\d+)\)$/);
  const player = match ? name(match[1]) : raw;
  const jersey = name(String((official ? row.jerseyNumber : row.number) ?? match?.[2] ?? ''));
  // Names alone are deliberately not sufficient for automatic identity matching.
  return player && /^\d+$/.test(jersey) ? `${player}\u0000${Number(jersey)}` : null;
}

export function pitchingOuts(value: unknown): number | null {
  const text = String(value ?? '');
  const match = text.match(/^(\d+)(?:\.([012]))?$/);
  if (!match) return null;
  const outs = Number(match[1]) * 3 + Number(match[2] ?? 0);
  return count(outs);
}

export function compareRecordSources(schedule: unknown, core: unknown, official: OfficialGameDetailsResponse): RecordComparisonRow[] {
  const result: RecordComparisonRow[] = [];
  const post = data(data(schedule).postGame);
  const append = (key: string, label: string, live: number | string | null, source: number | string | null) => {
    result.push({ key, label, live, official: source, status: live === null || source === null ? 'missing' : live === source ? 'equal' : 'mismatch' });
  };
  for (const side of ['away', 'home'] as const) {
    const teamName = official.game[`${side}TeamName`];
    const matches = official.detail?.teams.filter(team => name(team.teamName) === name(teamName)) ?? [];
    const localName = at(core, 'teamNames', side) ?? data(schedule)[`${side}TeamName`];
    if (matches.length !== 1 || name(localName) !== name(teamName)) {
      result.push({ key: `${side}/mapping`, label: `${teamName} 팀 매핑`, live: name(localName) || null, official: teamName, status: 'unmapped' });
      continue;
    }
    const team = matches[0];
    append(`${side}/runs`, `${teamName} 득점`, count(at(core, 'score', side)) ?? count(at(post, 'totals', side, 'runs')), count(team.totals.runs));
    for (const [metric, label] of [['hits', '안타'], ['errors', '실책']] as const) {
      append(`${side}/${metric}`, `${teamName} ${label}`, count(at(post, 'totals', side, metric)), count(team.totals[metric]));
    }
    const rawLine = at(core, 'lineScore', side) ?? at(post, 'lineScore', side);
    const line = Array.isArray(rawLine) ? rawLine : [];
    const officialInnings = new Map(team.innings.map(inning => [inning.inning, inning]));
    const innings = new Set([...line.map((_, index) => index + 1), ...officialInnings.keys()]);
    for (const inning of [...innings].sort((a, b) => a - b)) {
      const row = officialInnings.get(inning);
      append(`${side}/inning/${inning}`, `${teamName} ${inning}회`, count(line[inning - 1]), row?.notPlayed ? 'X' : count(row?.runs));
    }
    for (const section of ['batters', 'pitchers'] as const) {
      const local = list(at(post, section, side));
      const source = team[section];
      const localKeys = local.map(row => identity(row, false));
      const sourceKeys = source.map(row => identity(row as unknown as Data, true));
      const used = new Set<number>();
      source.forEach((row, index) => {
        const key = sourceKeys[index];
        const indices = localKeys.flatMap((candidate, i) => key && candidate === key ? [i] : []);
        const prefix = `${side}/${section}/${row.rowKey || index}`;
        const label = `${teamName} ${section === 'batters' ? '타자' : '투수'} ${row.playerName} #${row.jerseyNumber ?? '?'}`;
        if (!key || indices.length !== 1 || sourceKeys.filter(candidate => candidate === key).length !== 1) {
          result.push({ key: `${prefix}/mapping`, label, live: null, official: row.playerName, status: 'unmapped' });
          return;
        }
        used.add(indices[0]);
        const live = local[indices[0]];
        const stats = row.stats as unknown as Data;
        const metrics = section === 'batters'
          ? [['ab', 'atBats', '타수'], ['h', 'hits', '안타'], ['r', 'runs', '득점'], ['rbi', 'rbi', '타점'], ['sb', 'stolenBases', '도루']]
          : [['h', 'hitsAllowed', '피안타'], ['r', 'runsAllowed', '실점'], ['er', 'earnedRuns', '자책'], ['so', 'strikeouts', '삼진']];
        for (const [localField, officialField, metric] of metrics) {
          append(`${prefix}/${officialField}`, `${label} ${metric}`, count(live[localField]), count(stats[officialField]));
        }
        if (section === 'pitchers') {
          append(`${prefix}/outs`, `${label} 투구 아웃`, count(live.outs) ?? pitchingOuts(live.ip), count(stats.outs));
          const bb = count(live.bb), hbp = count(live.hbp);
          append(`${prefix}/walksAndHitByPitch`, `${label} 사사구`, bb !== null && hbp !== null ? bb + hbp : null, count(stats.walksAndHitByPitch));
        }
      });
      local.forEach((row, index) => {
        if (!used.has(index)) result.push({ key: `${side}/${section}/local/${index}`, label: `${teamName} 자체 ${name(row.name)}`, live: name(row.name), official: null, status: 'unmapped' });
      });
    }
  }
  return result;
}

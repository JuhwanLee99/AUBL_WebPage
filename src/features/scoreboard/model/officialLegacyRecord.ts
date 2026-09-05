import type { OfficialGameDetailsResponse, OfficialGameDetailTeam } from '@core/api/backendClient';
import type { DisplayItem, PostGameSummary } from '../components/LegacyTextComponents';
import { buildOfficialBattingFlow, type SourceBattingEntry } from './officialBattingFlow';

const value = (number: number | null | undefined) => number ?? '—';
const playerName = (row: { playerName: string; jerseyNumber: string | null }) =>
  `${row.playerName}${row.jerseyNumber == null ? '' : ` (#${row.jerseyNumber})`}`;

/** Display adapters only. Batting order is reconstructed separately; numeric
 * stats and source score sheets remain unchanged. No legacy store or writes. */
export function buildOfficialLegacyRecord(payload: OfficialGameDetailsResponse) {
  const sourceTeams = payload.detail?.teams ?? [];
  const home = sourceTeams.find(team => team.teamName === payload.game.homeTeamName);
  const away = sourceTeams.find(team => team.teamName === payload.game.awayTeamName);
  const teams = [away, home, ...sourceTeams].filter((team, index, items): team is OfficialGameDetailTeam => team != null && items.indexOf(team) === index);
  const innings = [...new Set([...Array.from({ length: 9 }, (_, index) => index + 1), ...teams.flatMap(team => team.innings.map(item => item.inning))])].sort((a, b) => a - b);
  const boxScore = {
    innings,
    rows: teams.map(team => ({ name: team.teamName, runs: value(team.totals.runs), hits: value(team.totals.hits), errors: value(team.totals.errors), color: '#b9d6ff',
      innings: innings.map(inning => { const entry = team.innings.find(item => item.inning === inning); return entry?.notPlayed ? '×' : value(entry?.runs); }) })),
  };
  const totals = (team: OfficialGameDetailTeam | undefined, runs: number | null) => ({ runs: value(runs), hits: value(team?.totals.hits), bb: '—', so: '—' });
  const mappedTeams = [{ side: 'away' as const, team: away }, { side: 'home' as const, team: home }];
  const summary: PostGameSummary = {
    totals: { home: totals(home, payload.game.homeScore), away: totals(away, payload.game.awayScore) },
    topHitters: mappedTeams.flatMap(({ side, team }) => (team?.batters ?? [])
      .filter(row => row.stats.hits != null && row.stats.atBats != null && row.stats.atBats > 0)
      .map(row => ({ side, name: playerName(row), h: row.stats.hits!, hr: '—', bb: '—' })))
      .sort((a, b) => b.h - a.h).slice(0, 3),
    topPitchers: mappedTeams.flatMap(({ side, team }) => (team?.pitchers ?? [])
      .filter(row => row.stats.strikeouts != null && row.stats.outs != null)
      .map(row => ({ side, name: playerName(row), so: row.stats.strikeouts!, outs: row.stats.outs!, h: value(row.stats.hitsAllowed), bb: '—' })))
      .sort((a, b) => b.so - a.so || b.outs - a.outs).slice(0, 2),
  };
  const recordInnings = [...new Set(teams.flatMap(team => team.batters.flatMap(row => row.plateAppearances.map(item => item.inning ?? 0))))].sort((a, b) => a - b);
  const teamFlows = teams.map(team => ({ team, flow: buildOfficialBattingFlow(team) }));
  const sections = recordInnings.map(inning => ({ inning, items: teamFlows.flatMap(({ team, flow }) => {
    const current = flow.find(item => item.inning === inning);
    if (!current) return [];
    const prefix = `${team.teamName}-${inning}`;
    const rawItems = (entries: SourceBattingEntry[], contextOnly = false): DisplayItem[] => entries.flatMap(entry => [
      { type: 'batter', text: playerName(entry.row), key: `${prefix}-${entry.row.rowKey}-${entry.entryIndex}-source-batter`, inning, half: null, order: entry.row.battingOrder },
      { type: 'log', text: entry.result ?? '기록 미제공', key: `${prefix}-${entry.row.rowKey}-${entry.entryIndex}-source-log`, inning, half: null, chip: contextOnly ? '주루·교체 원문 · 시점 미상' : '원본 기록 · 순서 미확정' },
    ]);
    const items: DisplayItem[] = [{ type: 'marker', text: `${team.teamName} · ${current.mode === 'reconstructed' ? `${current.startOrder}번부터 · ${current.appearances.length}타석` : '타순 확인 필요'}`, color: 'var(--season-blue-700)', key: prefix, inning, half: null }];
    if (current.mode === 'source') {
      items.push({ type: 'log', text: current.reason!, key: `${prefix}-reason`, inning, half: null, chip: '안내' }, ...rawItems(current.sourceEntries));
    } else {
      current.appearances.forEach((entry, index) => {
        const key = `${prefix}-${entry.row.rowKey}-${entry.entryIndex}-${entry.partIndex}`;
        items.push(
          { type: 'batter', text: playerName(entry.row), key: `${key}-batter`, inning, half: null, order: entry.row.battingOrder, reconstructedPlateAppearance: true },
          { type: 'log', text: entry.result, key: `${key}-log`, inning, half: null, chip: `${index + 1}번째 타석`, details: entry.context.length ? [{ label: '원본 주루·교체 표기 (시점 미상)', value: entry.context.join(', ') }] : undefined },
        );
      });
      items.push(...rawItems(current.contextEntries, true));
    }
    return items;
  }) }));
  const tableRows = teams.map(team => ({
    teamName: team.teamName,
    batters: team.batters.map(row => ({ name: playerName(row), order: row.battingOrder, pos: row.position,
      ab: row.stats.atBats, h: row.stats.hits, r: row.stats.runs, rbi: row.stats.rbi,
      avg: row.stats.battingAverage == null ? '—' : row.stats.battingAverage.toFixed(3),
      pa: '—', singles: '—', doubles: '—', triples: '—', hr: '—', bb: '—', ci: '—', fc: '—', hbp: '—', so: '—', sac: '—', obp: '—',
    })),
    pitchers: team.pitchers.map(row => ({ name: playerName(row), appearanceLabel: '—',
      outsIp: row.stats.inningsPitched ?? '—', h: row.stats.hitsAllowed, r: row.stats.runsAllowed, er: row.stats.earnedRuns,
      so: row.stats.strikeouts, era: row.stats.era == null ? '—' : row.stats.era.toFixed(2),
      bf: '—', pitchCombo: '—', hr: '—', bb: '—', hbp: '—',
    })),
  }));
  const csvCell = (raw: unknown) => {
    const text = raw == null ? '—' : String(raw);
    return `"${(/^[=+@\-\t\r]/.test(text) ? `'${text}` : text).replaceAll('"', '""')}"`;
  };
  const csv = mappedTeams.filter(({ team }) => team).map(({ side, team }) => [
    [side === 'away' ? '원정 팀 기록지' : '홈 팀 기록지'],
    ['타순', '등번호', '선수', '포지션', ...recordInnings.map(inning => inning ? `${inning}회 기록` : '이닝 미상'), '타수', '안타', '득점', '타점', '도루'],
    ...team!.batters.map(row => [row.battingOrder, row.jerseyNumber, row.playerName, row.position,
      ...recordInnings.map(inning => row.plateAppearances.filter(item => (item.inning ?? 0) === inning).map(item => item.result ?? '기록 미제공').join(' / ') || '—'),
      row.stats.atBats, row.stats.hits, row.stats.runs, row.stats.rbi, row.stats.stolenBases]),
  ].map(row => row.map(csvCell).join(',')).join('\n')).join('\n\n');
  return { boxScore, summary, sections, tableRows, csv };
}

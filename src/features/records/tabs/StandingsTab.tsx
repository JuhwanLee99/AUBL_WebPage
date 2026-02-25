import { useMemo, useState } from 'react';
import type {
  RecordGroup,
  RecordPlayoffDivision,
  RecordScope,
  TeamRecordStanding,
} from '../../../shared/api/backendClient';
import {
  groupLabelFromRecord,
  resolveGroupFromRecord,
} from '../../../shared/lib/recordFilters';
import type { PlayoffStageSummaryRow } from '../types';
import InteractiveFilterCell from '../components/InteractiveFilterCell';
import {
  emptyTextStyle,
  tableCardStyle,
  tableStyle,
  tableTitleStyle,
  tbodyRowStyle,
  tdStyle,
  thStyle,
  theadRowStyle,
} from '../components/recordStyles';
import { getDivisionLabel, getScopeLabel, tierToKorean, toWinPct } from '../utils/recordView';

type StandingsSortKey =
  | 'rank'
  | 'teamName'
  | 'scope'
  | 'seasonType'
  | 'group'
  | 'games'
  | 'winLoss'
  | 'winPct';

interface StandingsColumnDef {
  key: StandingsSortKey;
  label: string;
  align: 'left' | 'center';
}

const STANDINGS_COLUMNS: StandingsColumnDef[] = [
  { key: 'rank', label: '#', align: 'left' },
  { key: 'teamName', label: '팀', align: 'left' },
  { key: 'scope', label: '구분', align: 'center' },
  { key: 'seasonType', label: '플레이오프', align: 'center' },
  { key: 'group', label: '조', align: 'center' },
  { key: 'games', label: '경기', align: 'center' },
  { key: 'winLoss', label: '승-무-패', align: 'center' },
  { key: 'winPct', label: '승률', align: 'center' },
];

const STANDINGS_NUMERIC_SORT_KEYS = new Set<StandingsSortKey>([
  'rank',
  'games',
  'winLoss',
  'winPct',
]);

interface EnrichedStandingRow {
  row: TeamRecordStanding;
  index: number;
  rank: number;
  teamSearchActive: boolean;
  resolvedScope: string;
  resolvedDivision: string;
  resolvedGroup: Exclude<RecordGroup, 'ALL'> | null;
  groupLabel: string;
  games: number;
  winPctDisplay: number;
}

interface StandingsTabProps {
  rows: TeamRecordStanding[];
  playoffStageSummary: PlayoffStageSummaryRow[];
  scope: RecordScope;
  group: RecordGroup;
  playoffDivision: RecordPlayoffDivision;
  onToggleScope: (value: Exclude<RecordScope, 'ALL'> | null) => void;
  onToggleGroup: (value: Exclude<RecordGroup, 'ALL'> | null) => void;
  onToggleDivision: (value: RecordPlayoffDivision | null) => void;
  searchTerm: string;
  onToggleTeamSearch: (teamName: string) => void;
}

export default function StandingsTab({
  rows,
  playoffStageSummary,
  scope,
  group,
  playoffDivision,
  onToggleScope,
  onToggleGroup,
  onToggleDivision,
  searchTerm,
  onToggleTeamSearch,
}: StandingsTabProps) {
  const [sortKey, setSortKey] = useState<StandingsSortKey>('rank');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const enrichedRows = useMemo<EnrichedStandingRow[]>(
    () =>
      rows.map((row, index) => {
        const resolvedScope = getScopeLabel(row.scope);
        const resolvedDivision = getDivisionLabel(row.seasonType);
        const resolvedGroup = resolveGroupFromRecord(row.partCode, row.teamName);
        const games = row.wins + row.losses + row.ties;
        const teamSearchActive = searchTerm.trim().toLowerCase() === row.teamName.trim().toLowerCase();
        return {
          row,
          index,
          rank: index + 1,
          teamSearchActive,
          resolvedScope,
          resolvedDivision,
          resolvedGroup,
          groupLabel: groupLabelFromRecord(row.partCode, row.teamName),
          games,
          winPctDisplay: toWinPct(row.winPct),
        };
      }),
    [rows, searchTerm],
  );

  const sortedRows = useMemo(() => {
    const compareString = (a: string, b: string) => a.localeCompare(b, 'ko', { numeric: true, sensitivity: 'base' });
    const compareNumber = (a: number, b: number) => a - b;

    const items = [...enrichedRows];
    items.sort((a, b) => {
      let result = 0;
      switch (sortKey) {
        case 'rank':
          result = compareNumber(a.rank, b.rank);
          break;
        case 'teamName':
          result = compareString(a.row.teamName, b.row.teamName);
          break;
        case 'scope':
          result = compareString(a.resolvedScope, b.resolvedScope);
          break;
        case 'seasonType':
          result = compareString(a.resolvedDivision, b.resolvedDivision);
          break;
        case 'group':
          result = compareString(a.groupLabel, b.groupLabel);
          break;
        case 'games':
          result = compareNumber(a.games, b.games);
          break;
        case 'winLoss':
          result = compareNumber(a.row.wins * 1000 + a.row.ties * 100 - a.row.losses, b.row.wins * 1000 + b.row.ties * 100 - b.row.losses);
          break;
        case 'winPct':
          result = compareNumber(a.winPctDisplay, b.winPctDisplay);
          break;
        default:
          result = 0;
      }

      if (result === 0) {
        result = compareNumber(a.index, b.index);
      }
      return sortDirection === 'asc' ? result : -result;
    });

    return items;
  }, [enrichedRows, sortDirection, sortKey]);

  const handleSort = (key: StandingsSortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    if (key === 'rank' || key === 'teamName' || key === 'scope' || key === 'seasonType' || key === 'group') {
      setSortDirection('asc');
      return;
    }
    setSortDirection('desc');
  };

  const numericCellStyle = (key: StandingsSortKey, align: 'left' | 'center' = 'center') => ({
    ...tdStyle(align),
    ...(STANDINGS_NUMERIC_SORT_KEYS.has(key) && sortKey === key
      ? { color: '#34d399', fontWeight: 800 }
      : {}),
  });

  return (
    <>
      <section className="record-hub-section" style={tableCardStyle}>
        <div style={tableTitleStyle}>팀 순위</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle(860)}>
            <thead>
              <tr style={theadRowStyle}>
                {STANDINGS_COLUMNS.map((column) => {
                  const active = sortKey === column.key;
                  const arrow = active ? (sortDirection === 'asc' ? ' ▲' : ' ▼') : '';
                  return (
                    <th
                      key={column.key}
                      onClick={() => handleSort(column.key)}
                      style={{
                        ...thStyle(column.align),
                        cursor: 'pointer',
                        color: active ? '#34d399' : '#94a3b8',
                        userSelect: 'none',
                      }}
                      title="클릭: 컬럼 정렬"
                    >
                      {column.label}
                      {arrow}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((item, index) => {
                const {
                  row,
                  rank,
                  teamSearchActive,
                  resolvedScope,
                  resolvedDivision,
                  resolvedGroup,
                  groupLabel,
                  games,
                  winPctDisplay,
                } = item;

                return (
                  <tr key={`${row.teamId}-${row.partCode ?? 'x'}`} style={tbodyRowStyle(index)}>
                    <td style={numericCellStyle('rank', 'left')}>{rank}</td>
                    <InteractiveFilterCell
                      label={row.teamName}
                      align="left"
                      active={teamSearchActive}
                      onToggle={() => onToggleTeamSearch(row.teamName)}
                      title="클릭: 팀 검색 필터 토글"
                    />
                    <InteractiveFilterCell
                      label={resolvedScope}
                      active={scope !== 'ALL' && scope === resolvedScope}
                      onToggle={() => onToggleScope(resolvedScope as Exclude<RecordScope, 'ALL'>)}
                    />
                    <InteractiveFilterCell
                      label={tierToKorean(resolvedDivision)}
                      active={playoffDivision !== 'ALL' && playoffDivision === resolvedDivision}
                      onToggle={
                        resolvedDivision === '-'
                          ? undefined
                          : () => onToggleDivision(resolvedDivision as RecordPlayoffDivision)
                      }
                    />
                    <InteractiveFilterCell
                      label={groupLabel}
                      active={group !== 'ALL' && group === resolvedGroup}
                      onToggle={resolvedGroup ? () => onToggleGroup(resolvedGroup) : undefined}
                    />
                    <td style={numericCellStyle('games')}>{games}</td>
                    <td style={numericCellStyle('winLoss')}>
                      {row.wins}-{row.ties}-{row.losses}
                    </td>
                    <td style={numericCellStyle('winPct')}>{winPctDisplay.toFixed(1)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <p style={emptyTextStyle}>표시할 팀 순위가 없습니다.</p>}
      </section>

      <section className="record-hub-section" style={tableCardStyle}>
        <div style={tableTitleStyle}>플레이오프 스테이지 요약 (으뜸/버금)</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle(780)}>
            <thead>
              <tr style={theadRowStyle}>
                <th style={thStyle('center')}>구분</th>
                <th style={thStyle('center')}>스테이지</th>
                <th style={thStyle('center')}>점수</th>
                <th style={thStyle('center')}>팀 수</th>
                <th style={thStyle('left')}>팀 목록</th>
              </tr>
            </thead>
            <tbody>
              {playoffStageSummary.map((row, index) => (
                <tr key={`${row.tier}-${row.round}`} style={tbodyRowStyle(index)}>
                  <InteractiveFilterCell
                    label={tierToKorean(row.tier)}
                    active={playoffDivision !== 'ALL' && playoffDivision === row.tier}
                    onToggle={
                      row.tier === 'EUTTEUM' || row.tier === 'BEOGEUM'
                        ? () => onToggleDivision(row.tier as RecordPlayoffDivision)
                        : undefined
                    }
                  />
                  <td style={tdStyle('center')}>{row.round}</td>
                  <td style={tdStyle('center')}>{row.points}</td>
                  <td style={tdStyle('center')}>{row.count}</td>
                  <td style={tdStyle('left')}>{row.teams.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {playoffStageSummary.length === 0 && <p style={emptyTextStyle}>요약할 플레이오프 데이터가 없습니다.</p>}
      </section>
    </>
  );
}

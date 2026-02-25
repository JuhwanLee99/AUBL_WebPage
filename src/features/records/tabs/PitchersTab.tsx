import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type {
  PitcherRankingSort,
  PitcherRanking,
  RecordGroup,
  RecordPlayoffDivision,
  RecordRegulation,
  RecordScope,
} from '../../../shared/api/backendClient';
import {
  groupLabelFromRecord,
  resolveGroupFromRecord,
} from '../../../shared/lib/recordFilters';
import type { TopFiveRow } from '../types';
import InteractiveFilterCell from '../components/InteractiveFilterCell';
import RegulationTabs from '../components/RegulationTabs';
import TopFivePanel from '../components/TopFivePanel';
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
import { getDivisionLabel, getScopeLabel, tierToKorean } from '../utils/recordView';

type PitcherSortKey =
  | 'rank'
  | 'playerName'
  | 'teamName'
  | 'scope'
  | 'seasonType'
  | 'group'
  | 'regulation'
  | 'jerseyNumber'
  | 'seasonYear'
  | 'era'
  | 'inningsPitched'
  | 'whip'
  | 'strikeouts'
  | 'walksAllowed'
  | 'winLoss'
  | 'saves'
  | 'gamesPlayed';

interface PitcherColumnDef {
  key: PitcherSortKey;
  label: string;
  align: 'left' | 'center';
}

const PITCHER_COLUMNS: PitcherColumnDef[] = [
  { key: 'rank', label: '#', align: 'center' },
  { key: 'playerName', label: '이름', align: 'left' },
  { key: 'teamName', label: '팀', align: 'left' },
  { key: 'scope', label: '구분', align: 'center' },
  { key: 'seasonType', label: '플레이오프', align: 'center' },
  { key: 'group', label: '조', align: 'center' },
  { key: 'regulation', label: '규정', align: 'center' },
  { key: 'jerseyNumber', label: '등번호', align: 'center' },
  { key: 'seasonYear', label: '년도', align: 'center' },
  { key: 'era', label: 'ERA', align: 'center' },
  { key: 'inningsPitched', label: 'IP', align: 'center' },
  { key: 'whip', label: 'WHIP', align: 'center' },
  { key: 'strikeouts', label: 'K', align: 'center' },
  { key: 'walksAllowed', label: 'BB', align: 'center' },
  { key: 'winLoss', label: 'W-L', align: 'center' },
  { key: 'saves', label: 'SV', align: 'center' },
  { key: 'gamesPlayed', label: 'G', align: 'center' },
];

const PITCHER_NUMERIC_SORT_KEYS = new Set<PitcherSortKey>([
  'rank',
  'jerseyNumber',
  'seasonYear',
  'era',
  'inningsPitched',
  'whip',
  'strikeouts',
  'walksAllowed',
  'winLoss',
  'saves',
  'gamesPlayed',
]);

interface EnrichedPitcherRow {
  row: PitcherRanking;
  index: number;
  displayRank: number;
  resolvedScope: string;
  resolvedDivision: string;
  resolvedGroup: Exclude<RecordGroup, 'ALL'> | null;
  groupLabel: string;
  rowRegulation: Exclude<RecordRegulation, 'ALL'>;
  seasonYearValue: number;
  jerseySortValue: number;
  winLossScore: number;
}

interface PitchersTabProps {
  rows: PitcherRanking[];
  topRows: TopFiveRow[];
  seasonYear: number | null;
  scope: RecordScope;
  group: RecordGroup;
  playoffDivision: RecordPlayoffDivision;
  regulation: Exclude<RecordRegulation, 'ALL'>;
  searchTerm: string;
  onRegulationChange: (value: Exclude<RecordRegulation, 'ALL'>) => void;
  onToggleScope: (value: Exclude<RecordScope, 'ALL'> | null) => void;
  onToggleGroup: (value: Exclude<RecordGroup, 'ALL'> | null) => void;
  onToggleDivision: (value: RecordPlayoffDivision | null) => void;
  onToggleTeamSearch: (teamName: string) => void;
  onToggleRegulationFromCell: (value: Exclude<RecordRegulation, 'ALL'>) => void;
  topSort: PitcherRankingSort;
  topSortOptions: Array<{ value: PitcherRankingSort; label: string }>;
  onTopSortChange: (value: PitcherRankingSort) => void;
}

export default function PitchersTab({
  rows,
  topRows,
  seasonYear,
  scope,
  group,
  playoffDivision,
  regulation,
  searchTerm,
  onRegulationChange,
  onToggleScope,
  onToggleGroup,
  onToggleDivision,
  onToggleTeamSearch,
  onToggleRegulationFromCell,
  topSort,
  topSortOptions,
  onTopSortChange,
}: PitchersTabProps) {
  const [sortKey, setSortKey] = useState<PitcherSortKey>('rank');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const enrichedRows = useMemo<EnrichedPitcherRow[]>(
    () =>
      rows.map((row, index) => {
        const resolvedScope = getScopeLabel(row.scope);
        const resolvedDivision = getDivisionLabel(row.seasonType);
        const resolvedGroup = resolveGroupFromRecord(row.partCode, row.teamName);
        const rowRegulation: Exclude<RecordRegulation, 'ALL'> = row.regulation === 'OUT' ? 'OUT' : 'IN';
        const parsedJersey = Number(row.jerseyNumber);
        return {
          row,
          index,
          displayRank: row.rank || index + 1,
          resolvedScope,
          resolvedDivision,
          resolvedGroup,
          groupLabel: groupLabelFromRecord(row.partCode, row.teamName),
          rowRegulation,
          seasonYearValue: row.seasonYear ?? seasonYear ?? 0,
          jerseySortValue: Number.isFinite(parsedJersey) ? parsedJersey : Number.MAX_SAFE_INTEGER,
          winLossScore: row.wins * 1000 - row.losses,
        };
      }),
    [rows, seasonYear],
  );

  const sortedRows = useMemo(() => {
    const compareString = (a: string, b: string) => a.localeCompare(b, 'ko', { numeric: true, sensitivity: 'base' });
    const compareNumber = (a: number, b: number) => a - b;

    const items = [...enrichedRows];
    items.sort((a, b) => {
      let result = 0;
      switch (sortKey) {
        case 'rank':
          result = compareNumber(a.displayRank, b.displayRank);
          break;
        case 'playerName':
          result = compareString(a.row.playerName, b.row.playerName);
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
        case 'regulation':
          result = compareString(a.rowRegulation, b.rowRegulation);
          break;
        case 'jerseyNumber':
          result = compareNumber(a.jerseySortValue, b.jerseySortValue);
          if (result === 0) {
            result = compareString(a.row.jerseyNumber || '', b.row.jerseyNumber || '');
          }
          break;
        case 'seasonYear':
          result = compareNumber(a.seasonYearValue, b.seasonYearValue);
          break;
        case 'era':
          result = compareNumber(a.row.era, b.row.era);
          break;
        case 'inningsPitched':
          result = compareNumber(a.row.inningsPitched, b.row.inningsPitched);
          break;
        case 'whip':
          result = compareNumber(a.row.whip, b.row.whip);
          break;
        case 'strikeouts':
          result = compareNumber(a.row.strikeouts, b.row.strikeouts);
          break;
        case 'walksAllowed':
          result = compareNumber(a.row.walksAllowed, b.row.walksAllowed);
          break;
        case 'winLoss':
          result = compareNumber(a.winLossScore, b.winLossScore);
          break;
        case 'saves':
          result = compareNumber(a.row.saves, b.row.saves);
          break;
        case 'gamesPlayed':
          result = compareNumber(a.row.gamesPlayed, b.row.gamesPlayed);
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

  const handleSort = (key: PitcherSortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    if (key === 'rank' || key === 'playerName' || key === 'teamName' || key === 'scope' || key === 'seasonType' || key === 'group' || key === 'regulation' || key === 'jerseyNumber' || key === 'seasonYear') {
      setSortDirection('asc');
      return;
    }
    setSortDirection('desc');
  };

  const numericCellStyle = (key: PitcherSortKey, align: 'left' | 'center' = 'center') => ({
    ...tdStyle(align),
    ...(PITCHER_NUMERIC_SORT_KEYS.has(key) && sortKey === key
      ? { color: '#60a5fa', fontWeight: 800 }
      : {}),
  });

  return (
    <>
      <section
        className="record-hub-section"
        style={{
          display: 'grid',
          gap: '14px',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        }}
      >
        <TopFivePanel
          title="투수 TOP 5 (규정 IN)"
          accent="#60a5fa"
          rows={topRows}
          emptyMessage="투수 데이터가 없습니다."
          sortLabel="기준"
          sortValue={topSort}
          sortOptions={topSortOptions}
          onSortChange={(value) => onTopSortChange(value as PitcherRankingSort)}
        />
      </section>

      <section className="record-hub-section" style={tableCardStyle}>
        <div style={tableTitleStyle}>투수 기록</div>
        <RegulationTabs value={regulation} onChange={onRegulationChange} />
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle(1290)}>
            <thead>
              <tr style={theadRowStyle}>
                {PITCHER_COLUMNS.map((column) => {
                  const active = sortKey === column.key;
                  const arrow = active ? (sortDirection === 'asc' ? ' ▲' : ' ▼') : '';
                  return (
                    <th
                      key={column.key}
                      onClick={() => handleSort(column.key)}
                      style={{
                        ...thStyle(column.align),
                        cursor: 'pointer',
                        color: active ? '#60a5fa' : '#94a3b8',
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
                const { row, displayRank, resolvedScope, resolvedDivision, resolvedGroup, groupLabel, rowRegulation } = item;
                const teamSearchActive = searchTerm.trim().toLowerCase() === row.teamName.trim().toLowerCase();
                return (
                  <tr key={`${row.playerId}-${row.seasonId}-${row.rank}`} style={tbodyRowStyle(index)}>
                    <td style={numericCellStyle('rank')}>{displayRank}</td>
                    <td style={tdStyle('left')}>
                      <Link to={`/records/player/${row.playerId}`} style={{ color: 'inherit', textDecoration: 'none', fontWeight: 800 }}>
                        {row.playerName}
                      </Link>
                    </td>
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
                    <InteractiveFilterCell
                      label={rowRegulation}
                      active={regulation === rowRegulation}
                      onToggle={() => onToggleRegulationFromCell(rowRegulation)}
                      title="클릭: 규정 IN/OUT 필터 토글"
                    />
                    <td style={numericCellStyle('jerseyNumber')}>{row.jerseyNumber || '-'}</td>
                    <td style={numericCellStyle('seasonYear')}>{row.seasonYear ?? seasonYear ?? '-'}</td>
                    <td style={numericCellStyle('era')}>{row.era.toFixed(2)}</td>
                    <td style={numericCellStyle('inningsPitched')}>{row.inningsPitched.toFixed(1)}</td>
                    <td style={numericCellStyle('whip')}>{row.whip.toFixed(2)}</td>
                    <td style={numericCellStyle('strikeouts')}>{row.strikeouts}</td>
                    <td style={numericCellStyle('walksAllowed')}>{row.walksAllowed}</td>
                    <td style={numericCellStyle('winLoss')}>
                      {row.wins}-{row.losses}
                    </td>
                    <td style={numericCellStyle('saves')}>{row.saves}</td>
                    <td style={numericCellStyle('gamesPlayed')}>{row.gamesPlayed}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <p style={emptyTextStyle}>표시할 투수 기록이 없습니다.</p>}
      </section>
    </>
  );
}

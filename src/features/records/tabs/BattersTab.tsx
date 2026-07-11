import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type {
  BatterRanking,
  BatterRankingSort,
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

type BatterSortKey =
  | 'rank'
  | 'playerName'
  | 'teamName'
  | 'scope'
  | 'seasonType'
  | 'group'
  | 'regulation'
  | 'jerseyNumber'
  | 'seasonYear'
  | 'battingAverage'
  | 'onBasePct'
  | 'sluggingPct'
  | 'ops'
  | 'homeRuns'
  | 'runsBattedIn'
  | 'stolenBases'
  | 'hits'
  | 'gamesPlayed';

interface BatterColumnDef {
  key: BatterSortKey;
  label: string;
  align: 'left' | 'center';
}

const BATTER_COLUMNS: BatterColumnDef[] = [
  { key: 'rank', label: '#', align: 'center' },
  { key: 'playerName', label: '이름', align: 'left' },
  { key: 'teamName', label: '팀', align: 'left' },
  { key: 'scope', label: '구분', align: 'center' },
  { key: 'seasonType', label: '플레이오프', align: 'center' },
  { key: 'group', label: '조', align: 'center' },
  { key: 'regulation', label: '규정', align: 'center' },
  { key: 'jerseyNumber', label: '등번호', align: 'center' },
  { key: 'seasonYear', label: '년도', align: 'center' },
  { key: 'battingAverage', label: 'AVG', align: 'center' },
  { key: 'onBasePct', label: 'OBP', align: 'center' },
  { key: 'sluggingPct', label: 'SLG', align: 'center' },
  { key: 'ops', label: 'OPS', align: 'center' },
  { key: 'homeRuns', label: 'HR', align: 'center' },
  { key: 'runsBattedIn', label: 'RBI', align: 'center' },
  { key: 'stolenBases', label: 'SB', align: 'center' },
  { key: 'hits', label: 'H', align: 'center' },
  { key: 'gamesPlayed', label: 'G', align: 'center' },
];

const BATTER_NUMERIC_SORT_KEYS = new Set<BatterSortKey>([
  'rank',
  'jerseyNumber',
  'seasonYear',
  'battingAverage',
  'onBasePct',
  'sluggingPct',
  'ops',
  'homeRuns',
  'runsBattedIn',
  'stolenBases',
  'hits',
  'gamesPlayed',
]);

interface EnrichedBatterRow {
  row: BatterRanking;
  index: number;
  displayRank: number;
  resolvedScope: string;
  resolvedDivision: string;
  resolvedGroup: Exclude<RecordGroup, 'ALL'> | null;
  groupLabel: string;
  rowRegulation: Exclude<RecordRegulation, 'ALL'>;
  seasonYearValue: number;
  jerseySortValue: number;
}

interface BattersTabProps {
  rows: BatterRanking[];
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
  topSort: BatterRankingSort;
  topSortOptions: Array<{ value: BatterRankingSort; label: string }>;
  onTopSortChange: (value: BatterRankingSort) => void;
}

export default function BattersTab({
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
}: BattersTabProps) {
  const [sortKey, setSortKey] = useState<BatterSortKey>('rank');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const enrichedRows = useMemo<EnrichedBatterRow[]>(
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
        case 'battingAverage':
          result = compareNumber(a.row.battingAverage, b.row.battingAverage);
          break;
        case 'onBasePct':
          result = compareNumber(a.row.onBasePct, b.row.onBasePct);
          break;
        case 'sluggingPct':
          result = compareNumber(a.row.sluggingPct, b.row.sluggingPct);
          break;
        case 'ops':
          result = compareNumber(a.row.ops, b.row.ops);
          break;
        case 'homeRuns':
          result = compareNumber(a.row.homeRuns, b.row.homeRuns);
          break;
        case 'runsBattedIn':
          result = compareNumber(a.row.runsBattedIn, b.row.runsBattedIn);
          break;
        case 'stolenBases':
          result = compareNumber(a.row.stolenBases, b.row.stolenBases);
          break;
        case 'hits':
          result = compareNumber(a.row.hits, b.row.hits);
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

  const handleSort = (key: BatterSortKey) => {
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

  const numericCellStyle = (key: BatterSortKey, align: 'left' | 'center' = 'center') => ({
    ...tdStyle(align),
    ...(BATTER_NUMERIC_SORT_KEYS.has(key) && sortKey === key
      ? { color: '#f472b6', fontWeight: 800 }
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
          title="타자 TOP 5 (규정 IN)"
          accent="#ec4899"
          rows={topRows}
          emptyMessage="타자 데이터가 없습니다."
          sortLabel="기준"
          sortValue={topSort}
          sortOptions={topSortOptions}
          onSortChange={(value) => onTopSortChange(value as BatterRankingSort)}
        />
      </section>

      <section className="record-hub-section" style={tableCardStyle}>
        <div style={tableTitleStyle}>타자 기록</div>
        <RegulationTabs value={regulation} onChange={onRegulationChange} />
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle(1320)}>
            <thead>
              <tr style={theadRowStyle}>
                {BATTER_COLUMNS.map((column) => {
                  const active = sortKey === column.key;
                  const arrow = active ? (sortDirection === 'asc' ? ' ▲' : ' ▼') : '';
                  return (
                    <th
                      key={column.key}
                      onClick={() => handleSort(column.key)}
                      style={{
                        ...thStyle(column.align),
                        cursor: 'pointer',
                        color: active ? '#f472b6' : '#94a3b8',
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
                    <td style={numericCellStyle('battingAverage')}>{row.battingAverage.toFixed(3)}</td>
                    <td style={numericCellStyle('onBasePct')}>{row.onBasePct.toFixed(3)}</td>
                    <td style={numericCellStyle('sluggingPct')}>{row.sluggingPct.toFixed(3)}</td>
                    <td style={numericCellStyle('ops')}>{row.ops.toFixed(3)}</td>
                    <td style={numericCellStyle('homeRuns')}>{row.homeRuns}</td>
                    <td style={numericCellStyle('runsBattedIn')}>{row.runsBattedIn}</td>
                    <td style={numericCellStyle('stolenBases')}>{row.stolenBases}</td>
                    <td style={numericCellStyle('hits')}>{row.hits}</td>
                    <td style={numericCellStyle('gamesPlayed')}>{row.gamesPlayed}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <p style={emptyTextStyle}>표시할 타자 기록이 없습니다.</p>}
      </section>
    </>
  );
}

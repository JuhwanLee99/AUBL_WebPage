import type { ReactNode } from 'react';
import type {
  RecordGroup,
  RecordPlayoffDivision,
  RecordScope,
  SeasonSummary,
} from '../../../shared/api/backendClient';
import {
  labelStyle,
  selectStyle,
} from './recordStyles';
import type { RecordsTab } from '../types';

interface Option<T extends string> {
  value: T;
  label: string;
}

interface RecordsFilterBarProps {
  seasons: SeasonSummary[];
  selectedSeasonId: number | null;
  onSeasonChange: (seasonId: number) => void;
  scope: RecordScope;
  scopeOptions: Array<Option<RecordScope>>;
  onScopeChange: (scope: RecordScope) => void;
  group: RecordGroup;
  groupOptions: Array<Option<RecordGroup>>;
  onGroupChange: (group: RecordGroup) => void;
  playoffDivision: RecordPlayoffDivision;
  playoffDivisionOptions: Array<Option<RecordPlayoffDivision>>;
  playoffFilterEnabled: boolean;
  onPlayoffDivisionChange: (division: RecordPlayoffDivision) => void;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  tab: RecordsTab;
  rankingYear: number | null;
  onRankingYearChange: (value: string) => void;
  powerLimit: number;
  onPowerLimitChange: (value: string) => void;
  actions?: ReactNode;
}

export default function RecordsFilterBar({
  seasons,
  selectedSeasonId,
  onSeasonChange,
  scope,
  scopeOptions,
  onScopeChange,
  group,
  groupOptions,
  onGroupChange,
  playoffDivision,
  playoffDivisionOptions,
  playoffFilterEnabled,
  onPlayoffDivisionChange,
  searchTerm,
  onSearchChange,
  tab,
  rankingYear,
  onRankingYearChange,
  powerLimit,
  onPowerLimitChange,
  actions,
}: RecordsFilterBarProps) {
  return (
    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
      <label style={labelStyle}>
        SEASON
        <select
          value={selectedSeasonId ?? ''}
          disabled={seasons.length === 0}
          onChange={(e) => onSeasonChange(Number(e.target.value))}
          style={selectStyle('150px')}
        >
          {seasons.map((season) => (
            <option key={season.id} value={season.id}>
              {season.year} 시즌 (ID: {season.id})
            </option>
          ))}
        </select>
      </label>

      <label style={labelStyle}>
        리그/플레이오프
        <select value={scope} onChange={(e) => onScopeChange(e.target.value as RecordScope)} style={selectStyle('130px')}>
          {scopeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label style={labelStyle}>
        조
        <select value={group} onChange={(e) => onGroupChange(e.target.value as RecordGroup)} style={selectStyle('92px')}>
          {groupOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label style={labelStyle}>
        플레이오프
        <select
          value={playoffDivision}
          disabled={!playoffFilterEnabled}
          onChange={(e) => onPlayoffDivisionChange(e.target.value as RecordPlayoffDivision)}
          style={selectStyle('110px')}
        >
          {playoffDivisionOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label style={labelStyle}>
        SEARCH
        <input
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="팀/선수 검색"
          style={{ ...selectStyle('220px'), padding: '9px 10px' }}
        />
      </label>

      {tab === 'power' && (
        <>
          <label style={labelStyle}>
            기준 시즌
            <input
              value={rankingYear ?? ''}
              onChange={(e) => onRankingYearChange(e.target.value)}
              style={{ ...selectStyle('120px'), padding: '9px 10px' }}
            />
          </label>
          <label style={labelStyle}>
            LIMIT
            <input
              value={powerLimit}
              onChange={(e) => onPowerLimitChange(e.target.value)}
              style={{ ...selectStyle('100px'), padding: '9px 10px' }}
            />
          </label>
        </>
      )}

      {actions && <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>{actions}</div>}
    </div>
  );
}

import { Link } from 'react-router-dom';
import type { TopFiveRow } from '../types';

interface SortOption {
  value: string;
  label: string;
}

interface TopFivePanelProps {
  title: string;
  accent: string;
  rows: TopFiveRow[];
  emptyMessage: string;
  sortLabel?: string;
  sortValue?: string;
  sortOptions?: SortOption[];
  onSortChange?: (value: string) => void;
}

export default function TopFivePanel({
  title,
  accent,
  rows,
  emptyMessage,
  sortLabel,
  sortValue,
  sortOptions,
  onSortChange,
}: TopFivePanelProps) {
  const canSort = Boolean(sortOptions && sortOptions.length > 0 && sortValue && onSortChange);
  return (
    <div
      style={{
        borderRadius: '16px',
        border: '1px solid rgba(148,163,184,0.2)',
        background: 'rgba(15,23,42,0.55)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '14px 16px',
          borderBottom: '1px solid rgba(148,163,184,0.15)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}
      >
        <span style={{ fontWeight: 900, color: accent }}>{title}</span>
        {canSort && (
          <label style={{ marginLeft: 'auto', display: 'inline-flex', gap: '8px', alignItems: 'center', color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>
            {sortLabel ?? 'SORT'}
            <select
              value={sortValue}
              onChange={(e) => onSortChange?.(e.target.value)}
              style={{
                borderRadius: '8px',
                border: '1px solid rgba(148,163,184,0.35)',
                background: '#0f172a',
                color: '#e2e8f0',
                padding: '5px 8px',
                fontWeight: 700,
                fontSize: '12px',
              }}
            >
              {sortOptions?.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {rows.length === 0 && <p style={{ margin: 0, padding: '18px', color: '#94a3b8' }}>{emptyMessage}</p>}
      {rows.map((row) => (
        <div
          key={row.id}
          style={{
            display: 'grid',
            gridTemplateColumns: '50px 1fr',
            gap: '12px',
            padding: '12px 16px',
            borderTop: '1px solid rgba(148,163,184,0.1)',
          }}
        >
          <div style={{ fontWeight: 900, color: '#cbd5e1' }}>{row.rank}</div>
          <div style={{ display: 'grid', gap: '4px' }}>
            <Link to={row.link} style={{ color: '#e2e8f0', fontWeight: 800, textDecoration: 'none' }}>
              {row.name}
            </Link>
            <span style={{ color: '#94a3b8', fontSize: '12px' }}>{row.team}</span>
            <span style={{ color: '#cbd5e1', fontSize: '13px' }}>{row.value}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

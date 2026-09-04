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
        borderRadius: '4px',
        border: '1px solid var(--season-line)',
        background: 'var(--season-surface)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '14px 16px',
          borderBottom: '2px solid var(--season-navy-900)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}
      >
        <span style={{ fontWeight: 900, color: accent }}>{title}</span>
        {canSort && (
          <label style={{ marginLeft: 'auto', display: 'inline-flex', gap: '8px', alignItems: 'center', color: 'var(--season-muted)', fontSize: '12px', fontWeight: 700 }}>
            {sortLabel ?? 'SORT'}
            <select
              value={sortValue}
              onChange={(e) => onSortChange?.(e.target.value)}
              style={{
                minHeight: '44px',
                borderRadius: '2px',
                border: '1px solid var(--season-line-strong)',
                background: 'var(--season-surface)',
                color: 'var(--season-ink)',
                padding: '8px 10px',
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
      {rows.length === 0 && <p style={{ margin: 0, padding: '18px', color: 'var(--season-muted)' }}>{emptyMessage}</p>}
      {rows.map((row) => (
        <div
          key={row.id}
          style={{
            display: 'grid',
            gridTemplateColumns: '50px 1fr',
            gap: '12px',
            padding: '12px 16px',
            borderTop: '1px solid var(--season-line)',
          }}
        >
          <div style={{ fontWeight: 900, color: 'var(--season-blue-700)' }}>{row.rank}</div>
          <div style={{ display: 'grid', gap: '4px' }}>
            <Link
              to={row.link}
              style={{
                alignItems: 'center',
                color: 'var(--season-ink)',
                display: 'inline-flex',
                fontWeight: 800,
                minHeight: '44px',
                textDecoration: 'none',
              }}
            >
              {row.name}
            </Link>
            <span style={{ color: 'var(--season-muted)', fontSize: '12px' }}>{row.team}</span>
            <span style={{ color: 'var(--season-ink)', fontSize: '13px' }}>{row.value}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

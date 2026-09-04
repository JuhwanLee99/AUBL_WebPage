import type { CSSProperties } from 'react';
import { tdStyle, withHighlight } from './recordStyles';

interface InteractiveFilterCellProps {
  label: string;
  active: boolean;
  align?: 'left' | 'center';
  title?: string;
  onToggle?: () => void;
  highlightStyle?: CSSProperties;
  highlightWhenActive?: boolean;
}

export default function InteractiveFilterCell({
  label,
  active,
  align = 'center',
  title,
  onToggle,
  highlightStyle,
  highlightWhenActive = false,
}: InteractiveFilterCellProps) {
  const clickable = Boolean(onToggle);
  const base: CSSProperties = {
    ...tdStyle(align),
  };
  const cellStyle = highlightWhenActive ? withHighlight(base, active, highlightStyle) : base;

  if (!clickable) return <td style={cellStyle}>{label}</td>;

  return (
    <td style={{ ...cellStyle, padding: 0 }}>
      <button
        type="button"
        className="record-filter-cell__button"
        aria-pressed={active}
        onClick={onToggle}
        title={title || '필터 토글'}
        style={{ textAlign: align }}
      >
        {label}
      </button>
    </td>
  );
}

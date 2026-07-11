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
    cursor: clickable ? 'pointer' : 'default',
  };
  const cellStyle = highlightWhenActive ? withHighlight(base, active, highlightStyle) : base;

  return (
    <td
      style={cellStyle}
      onClick={onToggle}
      title={title || (clickable ? '클릭: 필터 토글' : undefined)}
    >
      {label}
    </td>
  );
}

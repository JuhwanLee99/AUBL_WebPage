import type { CSSProperties } from 'react';
import ScoreboardPanel from './ScoreboardPanel';

type ScoreboardFrameProps = {
  variant?: 'page' | 'text';
  panelStyle?: CSSProperties;
  showFootnote?: boolean;
};

const variantStyles: Record<NonNullable<ScoreboardFrameProps['variant']>, CSSProperties> = {
  page: {
    width: '100%',
    background: '#050505',
    display: 'grid',
    placeItems: 'center',
    padding: '0.6vw',
    boxSizing: 'border-box',
    borderRadius: '16px',
    overflow: 'hidden',
  },
  text: {
    display: 'contents',
  },
};

export default function ScoreboardFrame({
  variant = 'page',
  panelStyle,
  showFootnote = true,
}: ScoreboardFrameProps) {
  return (
    <div style={variantStyles[variant]}>
      <ScoreboardPanel style={panelStyle} showFootnote={showFootnote} />
    </div>
  );
}
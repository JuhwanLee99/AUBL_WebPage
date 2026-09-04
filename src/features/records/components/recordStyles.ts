import type { CSSProperties } from 'react';

export const ERA_HIGHLIGHT_STYLE: CSSProperties = {
  color: 'var(--season-blue-700)',
  background: 'var(--season-blue-100)',
  border: '1px solid var(--season-blue-600)',
  fontWeight: 800,
};

export const BATTER_HIGHLIGHT_STYLE: CSSProperties = {
  color: 'var(--season-danger)',
  background: 'var(--season-surface-muted)',
  border: '1px solid var(--season-danger)',
  fontWeight: 800,
};

export const STANDINGS_HIGHLIGHT_STYLE: CSSProperties = {
  color: 'var(--season-success)',
  background: 'var(--season-surface-muted)',
  border: '1px solid var(--season-success)',
  fontWeight: 800,
};

export function withHighlight(
  base: CSSProperties,
  active: boolean,
  highlightStyle: CSSProperties = ERA_HIGHLIGHT_STYLE,
): CSSProperties {
  return active ? { ...base, ...highlightStyle } : base;
}

export const labelStyle: CSSProperties = {
  display: 'inline-flex',
  gap: '8px',
  alignItems: 'center',
  color: 'var(--season-muted)',
  fontWeight: 700,
  fontSize: '12px',
};

export function selectStyle(minWidth: string): CSSProperties {
  return {
    minWidth,
    minHeight: '44px',
    borderRadius: '2px',
    border: '1px solid var(--season-line)',
    background: 'var(--season-surface)',
    color: 'var(--season-ink)',
    padding: '9px 12px',
    fontWeight: 800,
  };
}

export function quickLinkStyle(color: string, background: string, border: string): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '44px',
    padding: '10px 14px',
    borderRadius: '2px',
    border: `1px solid ${border}`,
    background,
    color,
    fontWeight: 800,
    textDecoration: 'none',
  };
}

export function noticeCardStyle(color: string): CSSProperties {
  return {
    padding: '30px',
    textAlign: 'center',
    color,
    borderRadius: '4px',
    border: '1px solid var(--season-line)',
    background: 'var(--season-surface)',
    fontWeight: 700,
  };
}

export const tableCardStyle: CSSProperties = {
  borderRadius: '4px',
  border: '1px solid var(--season-line)',
  overflow: 'hidden',
  background: 'var(--season-surface)',
};

export const tableTitleStyle: CSSProperties = {
  padding: '14px 16px',
  borderBottom: '1px solid var(--season-line)',
  color: 'var(--season-ink)',
  fontWeight: 900,
};

export function tableStyle(minWidth: number): CSSProperties {
  return {
    width: '100%',
    borderCollapse: 'collapse',
    minWidth: `${minWidth}px`,
  };
}

export const theadRowStyle: CSSProperties = {
  color: 'var(--season-muted)',
  fontSize: '12px',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

export function thStyle(align: 'left' | 'center'): CSSProperties {
  return {
    padding: '12px 10px',
    textAlign: align,
    whiteSpace: 'nowrap',
  };
}

export function tdStyle(align: 'left' | 'center'): CSSProperties {
  return {
    padding: '10px',
    textAlign: align,
    color: 'var(--season-ink)',
    whiteSpace: 'nowrap',
    fontVariantNumeric: 'tabular-nums',
  };
}

export function tbodyRowStyle(index: number): CSSProperties {
  return {
    borderTop: '1px solid var(--season-line)',
    background: index % 2 === 0 ? 'transparent' : 'var(--season-surface-muted)',
  };
}

export const emptyTextStyle: CSSProperties = {
  margin: 0,
  padding: '20px',
  textAlign: 'center',
  color: 'var(--season-muted)',
};

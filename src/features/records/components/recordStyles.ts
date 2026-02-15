import type { CSSProperties } from 'react';

export const ERA_HIGHLIGHT_STYLE: CSSProperties = {
  color: '#60a5fa',
  background: 'rgba(59,130,246,0.16)',
  border: '1px solid rgba(96,165,250,0.45)',
  fontWeight: 800,
};

export const BATTER_HIGHLIGHT_STYLE: CSSProperties = {
  color: '#f472b6',
  background: 'rgba(236,72,153,0.16)',
  border: '1px solid rgba(244,114,182,0.45)',
  fontWeight: 800,
};

export const STANDINGS_HIGHLIGHT_STYLE: CSSProperties = {
  color: '#34d399',
  background: 'rgba(16,185,129,0.16)',
  border: '1px solid rgba(52,211,153,0.45)',
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
  color: '#94a3b8',
  fontWeight: 700,
  fontSize: '12px',
};

export function selectStyle(minWidth: string): CSSProperties {
  return {
    minWidth,
    borderRadius: '10px',
    border: '1px solid rgba(148,163,184,0.35)',
    background: '#0f172a',
    color: '#e2e8f0',
    padding: '8px 10px',
    fontWeight: 800,
  };
}

export function quickLinkStyle(color: string, background: string, border: string): CSSProperties {
  return {
    padding: '10px 12px',
    borderRadius: '10px',
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
    borderRadius: '14px',
    border: '1px solid rgba(148,163,184,0.24)',
    background: 'rgba(15,23,42,0.55)',
    fontWeight: 700,
  };
}

export const tableCardStyle: CSSProperties = {
  borderRadius: '18px',
  border: '1px solid rgba(148,163,184,0.22)',
  overflow: 'hidden',
  background: 'rgba(15,23,42,0.55)',
};

export const tableTitleStyle: CSSProperties = {
  padding: '14px 16px',
  borderBottom: '1px solid rgba(148,163,184,0.2)',
  color: '#cbd5e1',
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
  color: '#94a3b8',
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
    color: '#cbd5e1',
    whiteSpace: 'nowrap',
    fontVariantNumeric: 'tabular-nums',
  };
}

export function tbodyRowStyle(index: number): CSSProperties {
  return {
    borderTop: '1px solid rgba(148,163,184,0.12)',
    background: index % 2 === 0 ? 'transparent' : 'rgba(148,163,184,0.04)',
  };
}

export const emptyTextStyle: CSSProperties = {
  margin: 0,
  padding: '20px',
  textAlign: 'center',
  color: '#94a3b8',
};

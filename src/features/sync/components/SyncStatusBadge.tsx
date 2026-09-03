import type { CSSProperties } from 'react';
import type {
  UniquePlaySessionStatus,
  UniquePlaySyncRunStatus,
  UniquePlayValidationStatus,
} from '@core/contracts/uniquePlaySync';
import {
  syncRunStatusLabel,
  syncSessionStatusLabel,
  syncValidationStatusLabel,
} from '../model';

type Props =
  | { kind: 'run'; status: UniquePlaySyncRunStatus; rawStatus?: string }
  | { kind: 'session'; status: UniquePlaySessionStatus }
  | { kind: 'validation'; status: UniquePlayValidationStatus };

const palettes = {
  positive: { color: '#166534', background: '#dcfce7', border: '#86efac' },
  progress: { color: '#1d4ed8', background: '#dbeafe', border: '#93c5fd' },
  warning: { color: '#92400e', background: '#fef3c7', border: '#fcd34d' },
  negative: { color: '#991b1b', background: '#fee2e2', border: '#fca5a5' },
  neutral: { color: '#334155', background: '#f1f5f9', border: '#cbd5e1' },
} as const;

function paletteFor(props: Props) {
  if (props.kind === 'session') {
    if (props.status === 'READY') return palettes.positive;
    if (props.status === 'CONNECTING') return palettes.progress;
    if (props.status === 'REAUTH_REQUIRED' || props.status === 'UNAVAILABLE') return palettes.negative;
    return palettes.neutral;
  }
  if (props.kind === 'validation') {
    if (props.status === 'PASSED') return palettes.positive;
    if (props.status === 'RUNNING') return palettes.progress;
    if (props.status === 'FAILED') return palettes.negative;
    return palettes.neutral;
  }
  if (props.status === 'ACTIVE' || props.status === 'PUBLISHED' || props.status === 'READY_TO_PUBLISH') {
    return palettes.positive;
  }
  if (['QUEUED', 'RUNNING', 'VALIDATING', 'PUBLISHING', 'ACTIVATING'].includes(props.status)) {
    return palettes.progress;
  }
  if (props.status === 'REVIEW_REQUIRED') return palettes.warning;
  if (['FAILED', 'CANCELED', 'REAUTH_REQUIRED', 'VALIDATION_FAILED', 'REPAIR_REQUIRED'].includes(props.status)) {
    return palettes.negative;
  }
  return palettes.neutral;
}

export default function SyncStatusBadge(props: Props) {
  const palette = paletteFor(props);
  const label = props.kind === 'run'
    ? syncRunStatusLabel(props.status, props.rawStatus)
    : props.kind === 'session'
      ? syncSessionStatusLabel(props.status)
      : syncValidationStatusLabel(props.status);
  const style: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    minHeight: '26px',
    padding: '3px 9px',
    borderRadius: '999px',
    border: `1px solid ${palette.border}`,
    background: palette.background,
    color: palette.color,
    fontSize: '12px',
    lineHeight: 1.4,
    fontWeight: 850,
    whiteSpace: 'nowrap',
  };

  return <span style={style}>{label}</span>;
}

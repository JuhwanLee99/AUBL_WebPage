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
import './UniquePlaySync.css';

type Props =
  | { kind: 'run'; status: UniquePlaySyncRunStatus; rawStatus?: string }
  | { kind: 'session'; status: UniquePlaySessionStatus }
  | { kind: 'validation'; status: UniquePlayValidationStatus };

type StatusTone = 'positive' | 'progress' | 'warning' | 'negative' | 'neutral';

function toneFor(props: Props): StatusTone {
  if (props.kind === 'session') {
    if (props.status === 'READY') return 'positive';
    if (props.status === 'CONNECTING') return 'progress';
    if (props.status === 'REAUTH_REQUIRED' || props.status === 'UNAVAILABLE') return 'negative';
    return 'neutral';
  }
  if (props.kind === 'validation') {
    if (props.status === 'PASSED') return 'positive';
    if (props.status === 'RUNNING') return 'progress';
    if (props.status === 'FAILED') return 'negative';
    return 'neutral';
  }
  if (props.status === 'ACTIVE' || props.status === 'PUBLISHED' || props.status === 'READY_TO_PUBLISH') {
    return 'positive';
  }
  if (['QUEUED', 'RUNNING', 'VALIDATING', 'PUBLISHING', 'ACTIVATING'].includes(props.status)) {
    return 'progress';
  }
  if (props.status === 'REVIEW_REQUIRED') return 'warning';
  if (['FAILED', 'CANCELED', 'REAUTH_REQUIRED', 'VALIDATION_FAILED', 'REPAIR_REQUIRED'].includes(props.status)) {
    return 'negative';
  }
  return 'neutral';
}

export default function SyncStatusBadge(props: Props) {
  const label = props.kind === 'run'
    ? syncRunStatusLabel(props.status, props.rawStatus)
    : props.kind === 'session'
      ? syncSessionStatusLabel(props.status)
      : syncValidationStatusLabel(props.status);

  return (
    <span className="sync-status-badge" data-tone={toneFor(props)}>
      {label}
    </span>
  );
}

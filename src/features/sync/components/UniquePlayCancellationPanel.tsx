import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { cancelUniquePlaySyncRun, getUniquePlayCancellationControl, UniquePlaySyncApiError } from '@core/api/backendClient';
import type { UniquePlayCancellationControl, UniquePlayCancellationIntent, UniquePlaySyncRun } from '@core/contracts/uniquePlaySync';
import { formatSyncDateTime } from '../model';

type Props = {
  run: UniquePlaySyncRun;
  disabled: boolean;
  onBusy: (busy: boolean) => void;
  onChanged: (runId: string) => Promise<void>;
};

const buttonStyle: CSSProperties = {
  minHeight: 44, padding: '8px 14px', borderRadius: 4,
  border: '1px solid var(--season-line-strong)', color: 'var(--season-ink)', background: 'var(--season-surface)',
};

function message(error: unknown): string {
  if (error instanceof UniquePlaySyncApiError) {
    if (error.status === 404) return '현재 백엔드에는 수집 중단 API가 없습니다. 지원 버전 배포 전에는 실행 상태를 강제로 변경하지 않습니다.';
    if (error.status === 401 || error.status === 403) return '관리자 인증을 다시 확인해 주세요. 수집 중단은 관리자만 요청할 수 있습니다.';
    if (error.status === 503) return '안전한 중단을 아직 확인하지 못했습니다. 배포 설정·워커 연결을 확인한 뒤 같은 요청으로 다시 시도하세요.';
    if (error.status === 409) return '실행 상태가 변경되었거나 중단 확인과 충돌했습니다. 최신 상태와 기존 중단 요청을 확인한 뒤 다시 시도하세요.';
  }
  return error instanceof Error ? error.message : '중단 요청을 확인하지 못했습니다.';
}

export default function UniquePlayCancellationPanel({ run, disabled, onBusy, onChanged }: Props) {
  const [control, setControl] = useState<UniquePlayCancellationControl | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [intent, setIntent] = useState<UniquePlayCancellationIntent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const inFlight = useRef(false);
  const loadSequence = useRef(0);

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setLoading(true);
    try {
      const next = await getUniquePlayCancellationControl(run.runId);
      if (sequence !== loadSequence.current) return;
      setControl(next);
      setError(null);
    } catch (failure) {
      if (sequence === loadSequence.current) {
        setControl(null);
        setError(message(failure));
      }
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, [run.runId]);

  useEffect(() => {
    void load();
    return () => { loadSequence.current += 1; };
  }, [load]);

  const chosenIntent = control?.pending ?? intent;
  const cancelled = completed || run.status === 'CANCELED';
  const collecting = run.status === 'QUEUED' || run.status === 'RUNNING';
  const stopping = !!chosenIntent || run.errorCode === 'CANCEL_REQUESTED';
  const stale = collecting && !!run.updatedAt && Date.now() - new Date(run.updatedAt).getTime() >= 5 * 60_000;
  const validNote = (chosenIntent?.note ?? note).trim().length >= 8;
  const canSubmit = collecting && !cancelled && control?.supported === true && !!run.updatedAt
    && validNote && confirmed && !disabled && !loading && !busy;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit || inFlight.current || !run.updatedAt) return;
    inFlight.current = true;
    setBusy(true);
    onBusy(true);
    setError(null);
    try {
      const request = chosenIntent ?? { cancellationId: crypto.randomUUID(), note: note.trim() };
      setIntent(request);
      await cancelUniquePlaySyncRun(run.runId, {
        ...request, expectedStatus: run.rawStatus, expectedUpdatedAt: run.updatedAt,
      });
      setCompleted(true);
      setConfirmed(false);
      await onChanged(run.runId);
    } catch (failure) {
      // A lost response may follow durable acceptance. Recover the server's intent, never invent a replacement.
      await load();
      setError(message(failure));
      await onChanged(run.runId);
    } finally {
      inFlight.current = false;
      setBusy(false);
      onBusy(false);
    }
  };

  return (
    <section aria-labelledby="unique-play-cancel-heading" aria-busy={busy || loading}
      style={{ border: '1px solid var(--season-line)', borderRadius: 4, padding: 20, background: 'var(--season-surface)' }}>
      <h3 id="unique-play-cancel-heading" style={{ margin: 0, fontSize: 18, color: 'var(--season-navy-900)' }}>현재 수집 중단</h3>
      <p style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--season-muted)' }}>
        실행을 삭제하지 않습니다. 수집과 결과 전송을 중단하고 요청자·사유·원본 이력을 보존합니다.
        기존 공식 기록은 유지하며, 이미 서버에 저장된 후보의 검토·게시·활성화는 이 기능으로 중단하지 않습니다.
      </p>
      <p style={{ fontSize: 13, overflowWrap: 'anywhere' }}>대상: <code>{run.runId}</code><br />마지막 갱신: {formatSyncDateTime(run.updatedAt)}</p>
      {cancelled ? (
        <p role="status">수집 중단이 확인되었습니다. 실행 이력은 보존되며 기존 공식 기록은 변경되지 않습니다.</p>
      ) : (
        <>
          {stale && !stopping && <p className="sync-callout is-warning">5분 이상 갱신되지 않았습니다. 시간 경과만으로 자동 종료하지 않으며, 중단 요청 후 워커 종료를 확인합니다.</p>}
          {stopping && <p role="status" className="sync-callout is-warning">중단 요청을 확인 중입니다. 완료 전에는 새 수집을 시작하지 마세요. 재시도는 같은 요청으로 처리됩니다.</p>}
          {control && !control.supported && <p className="sync-callout is-warning">영속 콜백 전환이 비활성 상태입니다. 구형 콜백의 뒤늦은 반영을 차단할 수 있는 배포 설정이 먼저 필요합니다.</p>}
          <form onSubmit={event => { void submit(event); }} style={{ display: 'grid', gap: 12 }}>
            <label style={{ display: 'grid', gap: 6 }}>
              중단 사유 (8~500자)
              <textarea value={chosenIntent?.note ?? note} maxLength={500} minLength={8} required rows={3}
                disabled={busy || disabled || !!chosenIntent} onChange={event => setNote(event.target.value)}
                style={{ padding: 10, width: '100%', boxSizing: 'border-box', color: 'var(--season-ink)', background: 'var(--season-surface)', border: '1px solid var(--season-line-strong)', borderRadius: 4 }} />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44 }}>
              <input type="checkbox" checked={confirmed} disabled={busy || disabled} onChange={event => setConfirmed(event.target.checked)} />
              현재 실행의 수집·결과 전송을 멈추고, 이력과 기존 공식 기록을 보존합니다.
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button type="submit" disabled={!canSubmit} style={{ ...buttonStyle, color: 'var(--season-danger)' }}>
                {busy ? '워커 중단 확인 중...' : stopping ? '같은 요청으로 중단 재확인' : '수집 중단 요청'}
              </button>
              <button type="button" disabled={busy || loading || disabled} onClick={() => { void load(); }} style={buttonStyle}>
                중단 기능 다시 확인
              </button>
            </div>
          </form>
        </>
      )}
      {error && <p role="alert" className="sync-callout is-danger">{error}</p>}
      {chosenIntent && <p style={{ fontSize: 12, overflowWrap: 'anywhere' }}>중단 요청 ID: <code>{chosenIntent.cancellationId}</code></p>}
    </section>
  );
}

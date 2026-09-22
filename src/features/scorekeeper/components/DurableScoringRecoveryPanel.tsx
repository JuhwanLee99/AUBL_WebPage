import { useEffect, useRef, useState } from 'react';
import type { DurableRecoveryController, DurableRecoveryItem } from '@shared/lib/durableCompositeIntake';

/** Opt-in private writer UI. Not mounted by the production scorekeeper Provider. */
export default function DurableScoringRecoveryPanel({ controller }: { controller: DurableRecoveryController }) {
  const [rows, setRows] = useState<DurableRecoveryItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const active = useRef(false);
  const generation = useRef(0);
  useEffect(() => {
    const version = ++generation.current;
    setRows([]); setError(''); setNotice('');
    void controller.inspectRecovery().then(items => {
      if (version === generation.current) setRows(items);
    }, failure => { if (version === generation.current) setError(String(failure)); });
    return () => { generation.current++; };
  }, [controller]);
  const run = async (inputId?: string) => {
    if (active.current) return;
    active.current = true; setBusy(true); setError(''); setNotice('');
    const version = generation.current;
    try {
      if (inputId) await controller.recoverInput(inputId);
      const items = await controller.inspectRecovery();
      if (version !== generation.current) return;
      setRows(items);
      if (inputId) setNotice('기기 기록의 적용을 확인했습니다. 서버 저장 완료를 의미하지 않습니다.');
    } catch (failure) {
      if (version === generation.current) setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      active.current = false; setBusy(false);
    }
  };
  return <section aria-label="기기 기록 복구" className="runner-matrix-preview">
    <h3>기기 기록 복구</h3>
    <p>서버 확정 전 기록입니다. 복구는 현재 경기와 전후 상태가 일치할 때만 가능합니다. 충돌 기록은 자동 적용하거나 삭제하지 않습니다.</p>
    <button type="button" disabled={busy} onClick={() => void run()}>복구 목록 새로고침</button>
    {error && <p role="alert">복구를 완료하지 못했습니다. 원본은 유지됩니다. {error}</p>}
    {notice && <p role="status">{notice}</p>}
    {!rows.length && !error && <p>표시할 미전송 기록이 없습니다.</p>}
    <ol>{rows.map(row => <li key={row.inputId}>
      <p>{row.sequence}. {row.summary}</p>
      <p>{row.status === 'applied' ? '기기 적용 확인 · 서버 미확정' : row.status === 'pending' ? '적용 확인 전 · 전송 차단' : '형식 확인 필요 · 복구 불가'}</p>
      <code>{row.inputId}</code>{' '}
      <button type="button" disabled={busy || row.status === 'invalid'} onClick={() => void run(row.inputId)}>기록 복구 / 적용 확인</button>
    </li>)}</ol>
  </section>;
}

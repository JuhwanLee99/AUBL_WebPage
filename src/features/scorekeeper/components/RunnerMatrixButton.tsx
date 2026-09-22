import { useEffect, useRef, useState } from 'react';
import { useDemoStore } from '@shared/state/demoStore';
import { captureRunnerPlayContext, resolveRunnerPlay, RUNNER_CAUSE_LABELS } from '@shared/lib/runnerPlayEngine';
import type { BaseIndex, RunnerMovement, RunnerPlayInput } from '@shared/lib/runnerPlayEngine';
import './RunnerMatrixButton.css';

export default function RunnerMatrixButton({ disabled }: { disabled: boolean }) {
  const { state, actions } = useDemoStore();
  const [input, setInput] = useState<RunnerPlayInput | null>(null);
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState<{ id: string; rejectionCount: number } | null>(null);
  const [notice, setNotice] = useState('');
  const [timedOut, setTimedOut] = useState(false);
  const submitting = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const isOpen = visible && input !== null;
  const accepted = Boolean(pending && state.activeMatchId === input?.expected.activeMatchId &&
    state.events.some(event => event.runnerPlay?.input.id === pending.id));
  const rejected = Boolean(pending && (state.scoringRejections ?? []).slice(pending.rejectionCount)
    .some(item => item.matchId === input?.expected.activeMatchId && item.eventType === 'runner_matrix'));
  const busy = pending !== null;
  useEffect(() => {
    if (!pending) return;
    if (accepted) {
      submitting.current = false;
      setPending(null); setInput(null); setVisible(false); setNotice('');
    } else if (rejected) {
      submitting.current = false;
      setPending(null); setNotice('기록이 반려되었습니다. 입력 내용은 보존됩니다. 경기 상태와 입력을 확인하세요.');
    }
  }, [pending, accepted, rejected]);
  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => setTimedOut(true), 8000);
    return () => window.clearTimeout(timer);
  }, [pending]);
  useEffect(() => {
    if (!input) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [input]);
  useEffect(() => {
    const node = dialog.current;
    if (!isOpen || !node) return;
    if (!node.open) node.showModal();
    return () => node.close();
  }, [isOpen]);
  const preview = input ? resolveRunnerPlay(state, input) : null;
  const updateMove = (from: BaseIndex, change: Partial<RunnerMovement>) => setInput((current) => current ? {
    ...current, movements: current.movements.map((move) => move.from === from ? { ...move, ...change } : move),
  } : null);
  return (
    <>
      <button className="runner-matrix-trigger" type="button" disabled={disabled || (!input && !state.bases.some(Boolean))} onClick={() => {
        if (!input) setInput({ id: crypto.randomUUID(), expected: captureRunnerPlayContext(state), note: '', rbi: 0,
          movements: state.bases.flatMap((runnerId, index) => runnerId ? [{
            runnerId, from: index as BaseIndex, to: index as BaseIndex, sequence: 3 - index, cause: 'advance' as const,
          }] : []).reverse(),
        });
        setVisible(true);
      }}>전체 주자 함께 기록</button>
      {input ? (
        <dialog ref={dialog} className="runner-matrix-dialog" aria-labelledby="runner-matrix-title" onCancel={(event) => { event.preventDefault(); if (!busy || timedOut) setVisible(false); }} onKeyDown={(event) => event.stopPropagation()}>
          <form onSubmit={(event) => {
            event.preventDefault();
            if (disabled || busy || submitting.current || !preview?.ok) return;
            submitting.current = true;
            setNotice(''); setTimedOut(false);
            setPending({ id: input.id, rejectionCount: (state.scoringRejections ?? []).length });
            try {
              actions.recordRunnerPlay(input);
              // Legacy: setInput(null) immediately after dispatch discarded rejected drafts.
            } catch {
              submitting.current = false; setPending(null);
              setNotice('기록 접수 중 오류가 발생했습니다. 입력 내용은 보존됩니다.');
            }
          }}>
            <header>
              <div><h2 id="runner-matrix-title">주자 이동 한 번에 기록</h2><p>{input.expected.inning}회 {input.expected.half === 'top' ? '초' : '말'} · {input.expected.outs}아웃</p></div>
              <button type="button" disabled={busy && !timedOut} onClick={() => setVisible(false)} aria-label="주자 이동 닫기">닫기</button>
            </header>
            <p className="runner-matrix-help">각 주자의 최종 결과와 실제 발생 순서를 선택하세요. 작은 숫자가 먼저 발생한 결과입니다. 투구 판정은 별도 입력합니다.</p>
            {input.movements.map((move) => (
              <fieldset key={move.from} className="runner-matrix-row" disabled={busy || disabled}>
                <legend>{move.from + 1}루 · {move.runnerId}</legend>
                <p className="runner-matrix-responsibility">책임 투수: {input.expected.runnerResponsiblePitcher[move.from] ?? '기존 기록에 없음'}</p>
                <div className="runner-matrix-fields">
                  <label>결과<select aria-label={`${move.from + 1}루 주자 결과`} value={move.to} onChange={(event) => {
                    const value = event.target.value;
                    const to = value === 'home' || value === 'out' ? value : Number(value) as BaseIndex;
                    updateMove(move.from, { to, outKind: to === 'out' ? move.outKind ?? 'tag' : undefined });
                  }}>
                    {[0, 1, 2].filter((index) => index >= move.from).map((index) => <option key={index} value={index}>{index === move.from ? '정지' : `${index + 1}루 진루`}</option>)}
                    <option value="home">홈 도달</option><option value="out">아웃</option>
                  </select></label>
                  <label>사유<select value={move.cause} onChange={(event) => updateMove(move.from, { cause: event.target.value as RunnerMovement['cause'] })}>
                    {Object.entries(RUNNER_CAUSE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                  </select></label>
                  <label>발생 순서<select value={move.sequence} disabled={move.to === move.from} onChange={(event) => updateMove(move.from, { sequence: Number(event.target.value) })}>
                    {[1, 2, 3, 4].map((order) => <option key={order} value={order}>{order}번째</option>)}
                  </select></label>
                  {move.to === 'out' ? <label>아웃 종류<select value={move.outKind ?? 'tag'} onChange={(event) => updateMove(move.from, { outKind: event.target.value as RunnerMovement['outKind'] })}>
                    <option value="tag">태그 / 일반 주루 아웃</option><option value="force">포스 아웃</option><option value="appeal">공과·리터치 어필</option>
                  </select></label> : null}
                </div>
              </fieldset>
            ))}
            <fieldset className="runner-matrix-row" disabled={busy || disabled}>
              <legend>동시에 발생한 타자 결과</legend>
              <label className="runner-matrix-check"><input type="checkbox" checked={Boolean(input.batterOut)} onChange={(event) => {
                const checked = event.target.checked;
                setInput((current) => current ? { ...current, batterOut: checked ? { sequence: 4 } : undefined, rbi: 0 } : null);
              }} />타자가 1루 도달 전에 아웃됨</label>
              <p className="runner-matrix-help">안타·출루·희생타·삼진은 전용 입력을 사용하세요. 이 항목은 일반 타자 아웃으로 기록됩니다.</p>
              {input.batterOut ? <div className="runner-matrix-fields">
                <label>타자 아웃 순서<select value={input.batterOut.sequence} onChange={(event) => {
                  const order = Number(event.target.value);
                  setInput((current) => current ? { ...current, batterOut: { sequence: order } } : null);
                }}>{[1, 2, 3, 4].map((order) => <option key={order} value={order}>{order}번째</option>)}</select></label>
                <label>타점 판정<select value={input.rbi} onChange={(event) => {
                  const rbi = Number(event.target.value);
                  setInput((current) => current ? { ...current, rbi } : null);
                }}>{[0, 1, 2, 3].map((runs) => <option key={runs} value={runs}>{runs}타점</option>)}</select></label>
              </div> : null}
            </fieldset>
            <label className="runner-matrix-note">판정 메모<textarea disabled={busy || disabled} maxLength={500} value={input.note} onChange={(event) => {
              const note = event.target.value;
              setInput((current) => current ? { ...current, note } : null);
            }} placeholder="예: 홈 도달 후 태그 아웃 발생" /></label>
            <section className="runner-matrix-preview" aria-live="polite">
              {preview?.ok ? <>
                <strong>{preview.record.runs}득점 인정 · 아웃 {preview.record.outsAdded}개{preview.record.endedHalf ? ' · 공수 교대' : ''}</strong>
                {preview.record.movements.filter((move) => move.to === 'home').map((move) => <p key={move.from}>
                  {move.runnerId}: {move.runCounted ? '득점 인정' : move.runDecision === 'preceding_appeal' ? '선행 주자 어필로 무효' : move.runDecision === 'after_third_out' ? '제3아웃 이후 홈 도달로 무효' : '제3아웃 종류에 따라 무효'}
                </p>)}
                {preview.record.unassignedRuns > 0 ? <p>책임 투수가 확인되지 않은 실점 {preview.record.unassignedRuns}개가 기록에 남습니다.</p> : null}
              </> : <p>{preview?.issues.join(' ')}</p>}
              {disabled ? <p role="alert">기록 권한 또는 경기 상태가 변경되어 저장할 수 없습니다.</p> : null}
              {notice ? <p role="alert">{notice}</p> : null}
              {busy ? <p role="status">{timedOut ? '반영 확인이 지연되고 있습니다. 중복 입력하지 마세요. 초안은 유지되며 기록 반영 여부를 확인해야 합니다.' : '로컬 기록 반영을 확인하고 있습니다.'}</p> : null}
              <p>이 화면의 반영 확인은 로컬 기록 기준이며 서버 저장 완료를 의미하지 않습니다. 닫아도 현재 화면에 머무는 동안 초안은 유지됩니다.</p>
            </section>
            <footer><button type="button" disabled={busy && !timedOut} onClick={() => setVisible(false)}>초안 유지하고 닫기</button><button type="button" disabled={busy} onClick={() => {
              if (!window.confirm('작성 중인 주루 기록을 버릴까요?')) return;
              setInput(null); setVisible(false); setNotice('');
            }}>초안 버리기</button><button className="runner-matrix-submit" type="submit" disabled={disabled || busy || !preview?.ok}>{busy ? '반영 확인 중' : '한 사건으로 저장'}</button></footer>
          </form>
        </dialog>
      ) : null}
    </>
  );
}

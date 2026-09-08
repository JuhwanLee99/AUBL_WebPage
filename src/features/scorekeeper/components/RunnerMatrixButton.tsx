import { useEffect, useRef, useState } from 'react';
import { useDemoStore } from '@shared/state/demoStore';
import { captureRunnerPlayContext, resolveRunnerPlay, RUNNER_CAUSE_LABELS } from '@shared/lib/runnerPlayEngine';
import type { BaseIndex, RunnerMovement, RunnerPlayInput } from '@shared/lib/runnerPlayEngine';
import './RunnerMatrixButton.css';

export default function RunnerMatrixButton({ disabled }: { disabled: boolean }) {
  const { state, actions } = useDemoStore();
  const [input, setInput] = useState<RunnerPlayInput | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const isOpen = input !== null;
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
      <button className="runner-matrix-trigger" type="button" disabled={disabled || !state.bases.some(Boolean)} onClick={() => {
        setInput({ id: crypto.randomUUID(), expected: captureRunnerPlayContext(state), note: '', rbi: 0,
          movements: state.bases.flatMap((runnerId, index) => runnerId ? [{
            runnerId, from: index as BaseIndex, to: index as BaseIndex, sequence: 3 - index, cause: 'advance' as const,
          }] : []).reverse(),
        });
      }}>전체 주자 함께 기록</button>
      {input ? (
        <dialog ref={dialog} className="runner-matrix-dialog" aria-labelledby="runner-matrix-title" onCancel={() => setInput(null)} onKeyDown={(event) => event.stopPropagation()}>
          <form onSubmit={(event) => {
            event.preventDefault();
            if (disabled || !preview?.ok) return;
            actions.recordRunnerPlay(input);
            setInput(null);
          }}>
            <header>
              <div><h2 id="runner-matrix-title">주자 이동 한 번에 기록</h2><p>{input.expected.inning}회 {input.expected.half === 'top' ? '초' : '말'} · {input.expected.outs}아웃</p></div>
              <button type="button" onClick={() => setInput(null)} aria-label="주자 이동 닫기">닫기</button>
            </header>
            <p className="runner-matrix-help">각 주자의 최종 결과와 실제 발생 순서를 선택하세요. 작은 숫자가 먼저 발생한 결과입니다. 투구 판정은 별도 입력합니다.</p>
            {input.movements.map((move) => (
              <fieldset key={move.from} className="runner-matrix-row">
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
            <fieldset className="runner-matrix-row">
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
            <label className="runner-matrix-note">판정 메모<textarea maxLength={500} value={input.note} onChange={(event) => {
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
            </section>
            <footer><button type="button" onClick={() => setInput(null)}>취소</button><button className="runner-matrix-submit" type="submit" disabled={disabled || !preview?.ok}>한 사건으로 저장</button></footer>
          </form>
        </dialog>
      ) : null}
    </>
  );
}

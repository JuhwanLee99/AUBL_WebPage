import { useEffect, useRef, useState } from 'react';
import { compositeContextForState, useDemoStore } from '@shared/state/demoStore';
import { COMPOSITE_CAUSES, COMPOSITE_OUTS, COMPOSITE_PITCHES, COMPOSITE_RULINGS, PLATE_DECISIONS, resolveCompositePlay } from '@shared/lib/compositePlayEngine';
import type { CompositeInput, CompositeStep } from '@shared/lib/compositePlayEngine';
import { formatCompositeFeed } from '@shared/lib/compositePlayDisplay';
import './RunnerMatrixButton.css';
import './CompositePlayButton.css';

const id = () => crypto.randomUUID();
const positions = { batter: '타석', '0': '1루', '1': '2루', '2': '3루', home: '홈' };
const destination = { '0': '1루', '1': '2루', '2': '3루', home: '홈', out: '아웃' };
const options = (items: Record<string, string>) => Object.entries(items).map(([value, label]) => <option key={value} value={value}>{label}</option>);
const parsePosition = (value: string) => /^[0-2]$/.test(value) ? Number(value) as 0 | 1 | 2 : value as 'batter' | 'home';

export default function CompositePlayButton({ disabled = false }: { disabled?: boolean }) {
  const { state, actions } = useDemoStore();
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<CompositeInput | null>(null);
  const [pending, setPending] = useState<{ id: string; rejections: number } | null>(null);
  const [notice, setNotice] = useState('');
  const current = compositeContextForState(state);
  const saved = Boolean(pending && state.events.some(event => event.eventId === pending.id && event.compositePlay));
  const rejected = Boolean(pending && (state.scoringRejections ?? []).length > pending.rejections);
  const [timedOutId, setTimedOutId] = useState<string | null>(null);
  const applyTimedOut = Boolean(pending && timedOutId === pending.id);
  const busy = Boolean(pending && !saved && !rejected && !applyTimedOut);
  useEffect(() => {
    if (!pending || saved || rejected) return;
    const timer = window.setTimeout(() => setTimedOutId(pending.id), 8000);
    return () => window.clearTimeout(timer);
  }, [pending, saved, rejected]);
  useEffect(() => {
    if (!draft || saved) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [draft, saved]);
  const preview = draft ? resolveCompositePlay(current, { ...draft, reviewed: true }) : null;
  const blocked = disabled || busy;
  useEffect(() => { if (saved) dialog.current?.close(); }, [saved]);

  const fresh = (): CompositeInput => ({ id: id(), expected: current, plate: 'none', pitch: 'none', misc: 'none',
    steps: [], errors: [], responsibility: [], ruling: { kind: 'none', status: 'confirmed', choice: 'play', rule: '', note: '' },
    groundedIntoDoublePlay: false, reviewed: false, note: '' });
  const open = () => { if (!draft) setDraft(fresh()); setNotice(''); setPending(null); dialog.current?.showModal(); };
  const update = (patch: Partial<CompositeInput>) => setDraft(previous => previous ? { ...previous, ...patch, reviewed: false } : previous);
  const editStep = (index: number, patch: Partial<CompositeStep>) => {
    if (draft) update({ steps: draft.steps.map((step, i) => i === index ? { ...step, ...patch } : step) });
  };
  const moveStep = (index: number, direction: -1 | 1) => {
    if (!draft || index + direction < 0 || index + direction >= draft.steps.length) return;
    const steps = [...draft.steps]; [steps[index], steps[index + direction]] = [steps[index + direction], steps[index]]; update({ steps });
  };
  const addStep = (runnerId: string) => {
    if (!draft) return;
    const previous = [...draft.steps].reverse().find(step => step.runnerId === runnerId);
    const initial = draft.expected.bases.indexOf(runnerId);
    const from = previous && previous.to !== 'out' ? previous.to : initial >= 0 ? initial as 0 | 1 | 2 : 'batter';
    const to = from === 'batter' ? 0 : from === 'home' ? 'out' : from === 2 ? 'home' : from + 1 as 1 | 2;
    update({ steps: [...draft.steps, { id: id(), runnerId, from, to, cause: 'advance', rbi: false, assists: [], advantageousAppeal: false }] });
  };
  const participants = draft ? [draft.expected.batterId, ...draft.expected.bases.filter((name): name is string => Boolean(name))] : [];
  const submit = () => {
    if (!draft || blocked || !draft.reviewed || !preview?.ok) return;
    setPending({ id: draft.id, rejections: (state.scoringRejections ?? []).length });
    setTimedOutId(null);
    actions.recordCompositePlay(draft);
  };
  return <>
    <button type="button" className="runner-matrix-trigger" disabled={disabled} onClick={open}>복합 플레이 기록</button>
    {notice && <span role="status" className="composite-notice">{notice}</span>}
    <dialog ref={dialog} className="runner-matrix-dialog composite-dialog" aria-labelledby="composite-title"
      onKeyDown={event => event.stopPropagation()} onCancel={event => { if (busy) event.preventDefault(); }}
      onClose={() => { if (saved) { setDraft(null); setNotice('복합 플레이를 현재 화면에 적용했습니다. 서버 저장 완료를 의미하지 않습니다. 취소는 실행 취소를 사용하세요.'); } setPending(null); }}>
      <p role="status">적용은 현재 화면의 기록 반영입니다. 서버 저장 완료 여부는 별도 확인이 필요합니다. 닫은 초안은 이 화면에서만 유지되며 새로고침하면 사라집니다.</p>
      {applyTimedOut && !saved && !rejected && <p role="alert">화면 적용 결과를 확인하지 못했습니다. 자동 재시도하지 않습니다. 모달을 닫고 중계와 기록 권한을 확인하세요. 재시도에는 같은 사건 ID를 사용합니다.</p>}
      <header><h2 id="composite-title">하나의 플레이, 여러 기록</h2><button type="button" disabled={busy} onClick={() => dialog.current?.close()}>닫기</button></header>
      <p>타격 판정과 실제 이동을 분리합니다. 행 순서는 실제 도달·아웃 순서입니다. 같은 주자에게 여러 행과 여러 실책을 연결할 수 있습니다.</p>
      <p className="composite-warning">현재 플레이 전용입니다. 이전 플레이의 사후 재심, 타순 위반, 투타 교체 책임의 자동 판정은 지원하지 않습니다. 기존 기록을 먼저 정정한 뒤 진행하세요.</p>
      {draft && <>
        <p>{draft.expected.inning}회 {draft.expected.half === 'top' ? '초' : '말'} · {draft.expected.outs}아웃 · {draft.expected.balls}B {draft.expected.strikes}S · 타자 {draft.expected.batterId} · 투수 {draft.expected.pitcherId || '미지정'}</p>
        <button type="button" disabled={busy} onClick={() => { setDraft(fresh()); setPending(null); }}>작성 내용 비우고 현재 상황으로 시작</button>
        <fieldset disabled={blocked} className="composite-editor">
          <legend>1. 타격 / 투구 판정</legend>
          <div className="runner-matrix-fields">
            <label>타격 판정<select value={draft.plate} onChange={e => update({ plate: e.target.value as CompositeInput['plate'] })}>{options(PLATE_DECISIONS)}</select></label>
            <label>이번 투구 (기록한 공을 중복 입력하지 마세요)<select value={draft.pitch} onChange={e => update({ pitch: e.target.value as CompositeInput['pitch'] })}>{options(COMPOSITE_PITCHES)}</select></label>
            <label>투구 부가 기록<select value={draft.misc} onChange={e => update({ misc: e.target.value as CompositeInput['misc'] })}>{options({ none: '없음', wp: '폭투 WP', pb: '포일 PB', balk: '보크 BK 적용' })}</select></label>
          </div>
          {draft.plate === 'so_out' && <p className="composite-warning">낫아웃 실패: 타자 행을 타석 → 아웃으로 입력하고, 포수 태그는 태그 아웃, 1루 송구는 타자주자 1루 도달 전 아웃을 선택하세요. 해당 처리 중 다른 주자 진루는 WP/PB로 중복 기록하지 않습니다.</p>}
          <label className="runner-matrix-check"><input type="checkbox" checked={draft.groundedIntoDoublePlay} onChange={e => update({ groundedIntoDoublePlay: e.target.checked, ...(!e.target.checked ? { incompleteDoublePlay: undefined } : {}) })} />병살타 판정 (아웃 수와 별도, 타점 불인정)</label>
          {draft.groundedIntoDoublePlay && <>
            <label>병살타 완성 여부<select value={draft.incompleteDoublePlay ? 'incomplete' : 'completed'} onChange={e => update({ incompleteDoublePlay: e.target.value === 'incomplete' ? { errorStepId: '', note: '' } : undefined })}>{options({ completed: '실제 병살 완성', incomplete: '제2아웃 송구 포구 실책으로 미완성' })}</select></label>
            {draft.incompleteDoublePlay && <>
              <label>제2아웃 실패 행<select value={draft.incompleteDoublePlay.errorStepId} onChange={e => update({ incompleteDoublePlay: { ...draft.incompleteDoublePlay!, errorStepId: e.target.value } })}><option value="">실책 진루 행 선택</option>{draft.steps.map((s, n) => s.to !== 'out' && s.cause === 'error' ? <option key={s.id} value={s.id}>{n + 1}. {s.runnerId}</option> : null)}</select></label>
              <label>미완성 병살타 판정 근거<input maxLength={300} value={draft.incompleteDoublePlay.note} onChange={e => update({ incompleteDoublePlay: { ...draft.incompleteDoublePlay!, note: e.target.value } })} /></label>
              <p>첫 아웃 뒤 정확한 제2아웃 송구를 야수가 놓쳤을 때 사용합니다. 선택한 실책 행에 송구 포구 실책과 보살을 연결하세요. 실제 아웃은 1개, 병살타는 1개이며 수비 DP는 부여하지 않습니다.</p>
            </>}
          </>}
        </fieldset>
        <fieldset disabled={blocked} className="composite-editor">
          <legend>2. 복수 실책 행위</legend>
          {draft.plate === 'ci' && <p className="composite-warning">타격방해 벌칙 채택: 방해한 야수의 포구/처리 실책과 행위 설명을 추가하고, 타자 타석 → 1루 행의 원인을 방해로 지정해 해당 실책을 연결하세요. 여러 주자가 진루해도 같은 방해 행위의 실책은 1개입니다. 실제 플레이 채택 시에는 타격 판정도 실제 결과로 변경하세요.</p>}
          <p>한 실책으로 여러 주자가 이동하면 같은 실책 ID를 연결합니다. 별개의 송구·포구 실책은 행을 각각 추가하세요. WP/PB는 실책이 아닙니다.</p>
          {draft.errors.map((error, index) => <div className="composite-error-row" key={error.id}>
            <span>E{index + 1}</span>
            <label>야수<select value={error.fielder} onChange={e => update({ errors: draft.errors.map((item, i) => i === index ? { ...item, fielder: e.target.value } : item) })}>{options({ '1': '1 투수', '2': '2 포수', '3': '3 1루수', '4': '4 2루수', '5': '5 3루수', '6': '6 유격수', '7': '7 좌익수', '8': '8 중견수', '9': '9 우익수' })}</select></label>
            <label>종류<select value={error.kind} onChange={e => update({ errors: draft.errors.map((item, i) => i === index ? { ...item, kind: e.target.value as typeof error.kind } : item) })}>{options({ fielding: '포구/처리', throwing: '송구', catching: '송구 포구', foul_drop: '파울 낙구' })}</select></label>
            <label>행위 설명<input value={error.note} maxLength={300} onChange={e => update({ errors: draft.errors.map((item, i) => i === index ? { ...item, note: e.target.value } : item) })} /></label>
            <button type="button" onClick={() => update({ errors: draft.errors.filter((_, i) => i !== index) })}>삭제</button>
          </div>)}
          <button type="button" onClick={() => update({ errors: [...draft.errors, { id: id(), fielder: '6', kind: 'fielding', note: '' }] })}>실책 추가</button>
        </fieldset>
        <fieldset disabled={blocked} className="composite-editor">
          <legend>3. 실제 플레이 순서</legend>
          <p>실책으로 살아난 도루자: 결과는 다음 베이스, 원인은 도루자, 연결 실책은 송구 포구, 보살에는 정확한 송구 경로를 입력하세요. CS는 기록하지만 아웃은 늘리지 않습니다.</p>
          <p>포스가 유지되는 주자를 다음 베이스 도달 전에 태그한 경우도 아웃 성격은 포스입니다. 베이스 도달 후 또는 타자·후위 주자 아웃으로 포스가 해제된 경우에만 일반 태그를 선택하세요.</p>
          <p>동시 도루는 같은 묶음 번호를 사용하세요. 한 명이라도 도루에 실패하면 해당 묶음의 도루는 불인정합니다. 별도의 다음 도루 시도는 다른 번호를 지정하세요. 오버슬라이딩 도루자는 원인을 도루자로 입력하세요.</p><p>움직이지 않은 주자는 그대로 남습니다. 예: 타자 1루 도달(안타) → 타자 2루 도달(E6) → 타자 3루 시도 아웃(태그). 홈 도달 행에는 타점 여부를 별도로 지정합니다.</p>
          <div className="composite-add-actions">{participants.map(name => <button type="button" key={name} onClick={() => addStep(name)}>{name} 이동 / 아웃 추가</button>)}</div>
          {draft.steps.map((step, index) => <fieldset className="runner-matrix-row" key={step.id}>
            <legend>{index + 1}. {step.runnerId}</legend>
            <div className="runner-matrix-fields">
              <label>주자<select value={step.runnerId} onChange={e => editStep(index, { runnerId: e.target.value })}>{participants.map(name => <option key={name}>{name}</option>)}</select></label>
              <label>출발<select value={step.from} onChange={e => editStep(index, { from: parsePosition(e.target.value) })}>{options(positions)}</select></label>
              <label>결과<select value={step.to} onChange={e => editStep(index, { to: e.target.value === 'out' ? 'out' : parsePosition(e.target.value) as CompositeStep['to'], outKind: undefined, putout: undefined, assists: [], advantageousAppeal: false, rbi: false })}>{options(destination)}</select></label>
              <label>원인<select value={step.cause} onChange={e => editStep(index, { cause: e.target.value as CompositeStep['cause'] })}>{options(COMPOSITE_CAUSES)}</select></label>
              <label>연결 실책<select value={step.errorId ?? ''} onChange={e => editStep(index, { errorId: e.target.value || undefined })}><option value="">없음</option>{draft.errors.map((error, i) => <option key={error.id} value={error.id}>E{i + 1}: 야수 {error.fielder} {error.note}</option>)}</select></label>
              {['steal', 'caught'].includes(step.cause) && <label>동시 도루 묶음 (1~99)<input type="number" min="1" max="99" value={step.stealGroup ?? '1'} onChange={e => editStep(index, { stealGroup: e.target.value })} /></label>}
              {step.to !== 'out' && (step.cause === 'caught' || draft.incompleteDoublePlay?.errorStepId === step.id) && <label>보살 경로 (예: 6,4)<input value={step.assists.join(',')} onChange={e => editStep(index, { assists: e.target.value ? e.target.value.split(',') : [] })} /></label>}
              {step.to === 'out' && <>
                <label>아웃 성격<select value={step.outKind ?? ''} onChange={e => editStep(index, { outKind: e.target.value as CompositeStep['outKind'] })}><option value="">선택 필요</option>{options(COMPOSITE_OUTS)}</select></label>
                <label>자살 야수<select value={step.putout ?? ''} onChange={e => editStep(index, { putout: e.target.value || undefined })}><option value="">미기재</option>{options({ '1': '1', '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8', '9': '9' })}</select></label>
                <label>보살 경로 (예: 6,4)<input value={step.assists.join(',')} onChange={e => editStep(index, { assists: e.target.value ? e.target.value.split(',') : [] })} /></label>
              </>}
            </div>
            {step.to === 'home' && <label className="runner-matrix-check"><input type="checkbox" checked={step.rbi} onChange={e => editStep(index, { rbi: e.target.checked })} />이 득점에 타점 인정</label>}
            {step.to === 'out' && <label className="runner-matrix-check"><input type="checkbox" checked={step.advantageousAppeal} onChange={e => editStep(index, { advantageousAppeal: e.target.checked })} />같은 플레이의 유리한 제4아웃 어필 (심판 확정 필요)</label>}
            <div className="composite-add-actions"><button type="button" disabled={index === 0} onClick={() => moveStep(index, -1)}>앞으로</button><button type="button" disabled={index === draft.steps.length - 1} onClick={() => moveStep(index, 1)}>뒤로</button><button type="button" onClick={() => update({ steps: draft.steps.filter((_, i) => i !== index) })}>행 삭제</button></div>
          </fieldset>)}
        </fieldset>
        <fieldset disabled={blocked} className="composite-editor">
          <legend>4. 심판 / 기록원 판단과 책임투수</legend>
          <label>수비 연속 아웃 기록<select value={draft.multiOut?.kind ?? 'none'} onChange={e => update({ multiOut: e.target.value === 'none' ? undefined : { kind: e.target.value as 'dp' | 'tp', clean: false, note: '', stepIds: draft.steps.filter(s => s.to === 'out' && !s.advantageousAppeal).map(s => s.id) } })}>{options({ none: '미지정 (DP/TP 미확정)', dp: '수비 병살 DP', tp: '수비 삼중살 TP' })}</select></label>
          {draft.multiOut && <>
            <label className="runner-matrix-check"><input type="checkbox" checked={draft.multiOut.clean} onChange={e => update({ multiOut: { ...draft.multiOut!, clean: e.target.checked } })} />실책·미스플레이 없는 하나의 연속 수비 확인</label>
            <label>수비 DP/TP 판정 근거<input maxLength={300} value={draft.multiOut.note} onChange={e => update({ multiOut: { ...draft.multiOut!, note: e.target.value } })} /></label>
            {draft.steps.map((s, n) => s.to === 'out' ? <label className="runner-matrix-check" key={s.id}><input type="checkbox" checked={draft.multiOut!.stepIds.includes(s.id)} onChange={e => update({ multiOut: { ...draft.multiOut!, stepIds: e.target.checked ? [...draft.multiOut!.stepIds.filter(id => id !== s.id), s.id] : draft.multiOut!.stepIds.filter(id => id !== s.id) } })} />{n + 1}. {s.runnerId} 아웃 포함</label> : null)}
            <p>인정된 아웃과 자살 야수를 모두 지정하세요. 자살·보살에 참여한 야수에게 DP 또는 TP를 한 번씩 부여합니다. 삼진 병살·플라이 병살의 수비 DP와 타자 병살타 GDP는 별개입니다.</p>
          </>}
          <div className="runner-matrix-fields">
            <label>판정 종류<select value={draft.ruling.kind} onChange={e => update({ ruling: { ...draft.ruling, kind: e.target.value as CompositeInput['ruling']['kind'], status: 'pending' } })}>{options(COMPOSITE_RULINGS)}</select></label>
            <label>채택 결과<select value={draft.ruling.choice} onChange={e => update({ ruling: { ...draft.ruling, choice: e.target.value as 'play' | 'award' } })}>{options({ play: '실제 플레이 채택', award: '판정 / 진루권 적용' })}</select></label>
            <label>규칙 조항 / 심판 확인<input maxLength={300} value={draft.ruling.rule} onChange={e => update({ ruling: { ...draft.ruling, rule: e.target.value } })} /></label>
          </div>
          <label>판정 근거 (FC, 실책, 희생타, 방해는 필수)<textarea value={draft.ruling.note} maxLength={1000} onChange={e => update({ ruling: { ...draft.ruling, note: e.target.value } })} /></label>
          <label className="runner-matrix-check"><input type="checkbox" checked={draft.ruling.status === 'confirmed'} onChange={e => update({ ruling: { ...draft.ruling, status: e.target.checked ? 'confirmed' : 'pending' } })} />심판 판정 / 기록원 판단 확정</label>
          <p>기존 주자 책임은 승계됩니다. 야수선택으로 다른 주자가 아웃되면 타자주자의 책임투수를 반드시 확정하세요. 자책점은 이 입력으로 자동 확정하지 않습니다.</p>
          {participants.map(name => {
            const decision = draft.responsibility.find(item => item.runnerId === name);
            const change = (pitcherId: string | null, reason: string) => update({ responsibility: [...draft.responsibility.filter(item => item.runnerId !== name), { runnerId: name, pitcherId, reason }] });
            return <div key={name} className="composite-responsibility">
              <span>{name}</span>
              <label>책임투수 확정 / 조정<input placeholder={name === draft.expected.batterId ? draft.expected.pitcherId : draft.expected.runnerResponsiblePitcher[draft.expected.bases.indexOf(name) as 0 | 1 | 2] ?? '책임 미상'} value={decision?.pitcherId ?? ''} onChange={e => change(e.target.value || null, decision?.reason ?? '')} /></label>
              <label>조정 근거<input value={decision?.reason ?? ''} onChange={e => change(decision?.pitcherId ?? null, e.target.value)} /></label>
              {decision && <button type="button" onClick={() => update({ responsibility: draft.responsibility.filter(item => item.runnerId !== name) })}>기본 책임으로</button>}
            </div>;
          })}
          <label>감사 메모 (중계 자동 문구와 분리)<textarea value={draft.note} maxLength={1000} onChange={e => update({ note: e.target.value })} /></label>
        </fieldset>
        <section className="runner-matrix-preview" aria-live="polite">
          <h3>5. 적용 전 비교</h3>
          {preview?.ok ? <>
            <p>추가 {preview.record.runs}점 / {preview.record.outsAdded}아웃 · {preview.record.endedHalf ? '공수 교대' : `잔여 주자: ${preview.record.after.bases.map((name, i) => `${i + 1}루 ${name ?? '없음'}`).join(', ')}`}</p>
            <p>득점 책임 미상 {preview.record.unassignedRuns}명 · 한 번 적용 / 한 번 실행 취소</p>
            <h4>문자중계</h4><ol>{formatCompositeFeed(preview.record).map((line, index) => <li key={index}>{line}</li>)}</ol>
            <h4>타자 기록 증분</h4>{Object.entries(preview.record.batters).map(([name, row]) => <p key={name}>{name}: {Object.entries(row).map(([key, value]) => `${key} +${value}`).join(', ')}</p>)}
            <h4>투수 기록 증분</h4>{Object.entries(preview.record.pitchers).map(([name, row]) => <p key={name}>{name}: {Object.entries(row).map(([key, value]) => `${key} +${value}`).join(', ')}</p>)}
            <h4>수비 기록</h4>{Object.entries(preview.record.fielding).map(([pos, row]) => <p key={pos}>야수 {pos}: 실책 {row.errors}, 자살 {row.putouts}, 보살 {row.assists}, 포일 {row.pb ?? 0}, DP {row.dp ?? '미확정'}, TP {row.tp ?? '미확정'}</p>)}
          </> : <ul>{preview?.issues.map(issue => <li key={issue}>{issue}</li>)}</ul>}
          {rejected && <p role="alert">적용이 반려되었습니다. 경기 상태와 입력을 확인하세요. 작성 내용은 보존됩니다.</p>}
        </section>
        <footer>
          <label className="runner-matrix-check"><input type="checkbox" disabled={blocked || !preview?.ok} checked={draft.reviewed} onChange={e => setDraft({ ...draft, reviewed: e.target.checked })} />순서·득점·타점·실책·책임 확인</label>
          <button type="button" className="runner-matrix-submit" disabled={blocked || !preview?.ok || !draft.reviewed} onClick={submit}>{busy ? '적용 중' : '이 플레이 적용'}</button>
        </footer>
      </>}
    </dialog>
  </>;
}

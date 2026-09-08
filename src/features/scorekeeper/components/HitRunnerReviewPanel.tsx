import { useState } from 'react';
import { useDemoStore } from '@shared/state/demoStore';
import type { RunnerAdvanceSelections } from '@shared/state/demoStore';
import { captureRunnerPlayContext } from '@shared/lib/runnerPlayEngine';
import type { BaseIndex, RunnerMovement } from '@shared/lib/runnerPlayEngine';
import { resolveHitPlay } from '@shared/lib/hitPlayAdapter';
import type { HitRunnerReview } from '@shared/lib/hitPlayAdapter';

export default function HitRunnerReviewPanel({ bases, selections, batterId, pitcherId, disabled, onConfirm }: {
  bases: 1 | 2 | 3; selections: RunnerAdvanceSelections; batterId: string; pitcherId: string | null;
  disabled: boolean; onConfirm: (review: HitRunnerReview) => void;
}) {
  const { state } = useDemoStore();
  const [review, setReview] = useState<HitRunnerReview>(() => ({
    expected: captureRunnerPlayContext(state), batterId, pitcherId,
    sequences: { 0: 4, 1: 3, 2: 2 }, outKinds: {}, batterSequence: 1,
  }));
  const preview = resolveHitPlay(state, { id: 'hit-preview', batterId, pitcherId, bases, advances: selections, review });
  const hasOut = Object.values(selections).includes('out');
  const selectStyle = { padding: '7px', borderRadius: '7px', background: '#0f172a', color: '#e2e8f0', border: '1px solid #475569', minWidth: 0 };
  return (
    <section style={{ display: 'grid', gap: '10px', padding: '12px', border: '1px solid #334155', borderRadius: '10px' }}>
      <strong style={{ fontSize: '13px' }}>안타·주자 결과 검증</strong>
      {hasOut ? <>
        <p style={{ margin: 0, color: '#94a3b8', fontSize: '12px' }}>타자 도달, 홈 도달, 아웃의 실제 순서를 입력하세요. 포스 아웃이 포함된 타구는 야수선택 판정을 확인하세요.</p>
        <label style={{ display: 'flex', gap: '7px', fontSize: '12px', alignItems: 'center' }}><input type="checkbox" checked={review.hitConfirmed ?? false} onChange={(event) => setReview({ ...review, hitConfirmed: event.target.checked })} />선행 주자 아웃에도 안타가 성립하며 선택한 루타수가 맞는지 확인했습니다.</label>
        <label style={{ display: 'grid', gap: '5px', fontSize: '12px' }}>타자의 {bases}루 도달 순서
          <select style={selectStyle} value={review.batterSequence} onChange={(event) => setReview({ ...review, batterSequence: Number(event.target.value) })}>
            {[1, 2, 3, 4].map((order) => <option key={order} value={order}>{order}번째</option>)}
          </select>
        </label>
        {review.expected.bases.map((runner, index) => {
          if (!runner || selections[index as BaseIndex] === 'hold') return null;
          const from = index as BaseIndex;
          return <div key={from} style={{ display: 'grid', gap: '5px', fontSize: '12px' }}>
            <span>{from + 1}루 · {runner} · 책임 투수 {review.expected.runnerResponsiblePitcher[from] ?? '미확인'}</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '6px' }}>
              <select aria-label={`${from + 1}루 주자 발생 순서`} style={selectStyle} value={review.sequences[from]} onChange={(event) => setReview({ ...review, sequences: { ...review.sequences, [from]: Number(event.target.value) } })}>
                {[1, 2, 3, 4].map((order) => <option key={order} value={order}>{order}번째</option>)}
              </select>
              {selections[from] === 'out' ? <select aria-label={`${from + 1}루 주자 아웃 종류`} style={selectStyle} value={review.outKinds[from] ?? ''} onChange={(event) => setReview({ ...review, outKinds: { ...review.outKinds, [from]: event.target.value as RunnerMovement['outKind'] } })}>
                <option value="">아웃 종류 선택</option><option value="tag">태그 / 일반 주루 아웃</option><option value="appeal">공과·리터치 어필</option>
              </select> : null}
            </div>
          </div>;
        })}
      </> : null}
      <label style={{ display: 'grid', gap: '5px', fontSize: '12px' }}>타점 판정
        <select style={selectStyle} value={review.rbi ?? ''} onChange={(event) => setReview({ ...review, rbi: event.target.value === '' ? undefined : Number(event.target.value) })}>
          <option value="">인정 득점 기준</option>{[0, 1, 2, 3, 4].map((runs) => <option key={runs} value={runs}>{runs}타점</option>)}
        </select>
      </label>
      <div aria-live="polite" style={{ color: preview.ok ? '#86efac' : '#fdba74', fontSize: '12px' }}>
        {preview.ok ? `${preview.record.runs}득점 · ${preview.record.input.rbi}타점 · 추가 아웃 ${preview.record.outsAdded}개${preview.record.endedHalf ? ' · 공수 교대' : ''}` : preview.issues.join(' ')}
      </div>
      <button type="button" disabled={disabled || !preview.ok} onClick={() => { if (!disabled && preview.ok) onConfirm(review); }} style={{ ...selectStyle, background: '#1d4ed8', fontWeight: 800, opacity: disabled || !preview.ok ? .45 : 1 }}>검증 결과로 안타 기록</button>
    </section>
  );
}

import React, { useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { TestProvider, useDemoStore, compositeContextForState } from './store.jsx';
import { substitutePlayer, updateLineup } from 'virtual:scoring-reducer';
import DefensiveFieldingSection from '../../../src/features/scorekeeper/components/DefensiveFieldingSection.tsx';
import { buildDefensiveFieldingLedger } from '../../../src/shared/lib/defensiveFielding.ts';
import { fieldingInput } from './defensive-fixtures.mjs';

function App() {
  const { state, actions, testDispatch } = useDemoStore();
  const counter = useRef(0);
  const patch = value => testDispatch({ type: '__fixture_patch', patch: value });
  const record = kind => {
    counter.current += 1;
    actions.recordCompositePlay(fieldingInput(compositeContextForState(state), `LOCAL_FIELDING_${Date.now()}_${counter.current}`, kind));
  };
  const seed = () => patch({
    lineups: Object.fromEntries(['home', 'away'].map(side => [side, state.lineups[side].map((slot, i) => ({ ...slot, number: String(i + 11) }))])),
    benches: { ...state.benches, home: [{ name: 'NEW_SS', number: '66', pos: 'SS', throws: 'R', bats: 'R' }] },
  });
  const replace = () => patch(substitutePlayer(state, 'home', 0, 1, '대수비'));
  const swap = () => patch(updateLineup(updateLineup(state, 'home', 1, { pos: '1B' }), 'home', 3, { pos: 'SS' }));
  const mutateEvents = transform => patch({ events: transform(structuredClone(state.events)) });
  const ledger = buildDefensiveFieldingLedger(state.events, state.activeMatchId);
  return <main>
    <h2>LOCAL FIELDING ONLY: 실제 reducer / 교체 함수 / 조회 패널</h2>
    <button data-testid="fielding-seed" onClick={seed}>테스트 등번호 준비</button>
    <button data-testid="fielding-ground" onClick={() => record('ground')}>테스트 6-3 아웃 기록</button>
    <button data-testid="fielding-error" onClick={() => record('error')}>테스트 유격수 실책 기록</button>
    <button data-testid="fielding-pb" onClick={() => record('pb')}>테스트 포일 기록</button>
    <button data-testid="fielding-runner" onClick={() => patch({ bases: ['LOCAL_FIELDING_RUNNER', null, null], runnerResponsiblePitcher: { 0: compositeContextForState(state).pitcherId, 1: null, 2: null } })}>포일 진루 주자 준비</button>
    <button data-testid="fielding-replace" onClick={replace}>실제 대수비 교체 함수 적용</button>
    <button data-testid="fielding-swap" onClick={swap}>실제 포지션 변경 함수 적용</button>
    <button data-testid="fielding-missing-number" onClick={() => patch(updateLineup(state, 'home', 1, { number: '' }))}>등번호 누락</button>
    <button data-testid="fielding-duplicate-position" onClick={() => patch(updateLineup(state, 'home', 2, { pos: 'SS' }))}>유격수 중복 배치</button>
    <button data-testid="fielding-third-out" onClick={() => patch({ outs: 2 })}>2아웃 상황</button>
    <button data-testid="fielding-bottom" onClick={() => patch({ half: 'bottom' })}>말 수비 상황</button>
    <button data-testid="fielding-strip" onClick={() => mutateEvents(events => events.map(event => { delete event.defensiveSnapshot; return event; }))}>과거 스냅샷 누락</button>
    <button data-testid="fielding-duplicate" onClick={() => mutateEvents(events => [...events, ...structuredClone(events)])}>중복 사건</button>
    <button data-testid="fielding-conflict" onClick={() => mutateEvents(events => {
      const event = structuredClone(events.find(item => item.compositePlay));
      event.defensiveSnapshot.lineup[1].name = 'CONFLICT'; return [...events, event];
    })}>같은 우선순위 충돌</button>
    <button data-testid="fielding-pending-manual" onClick={() => mutateEvents(events => {
      const event = structuredClone(events.find(item => item.compositePlay));
      event.eventId += '-MANUAL'; event.source = { kind: 'manual' }; event.manualResolve = { required: true };
      return [...events, event];
    })}>상위 수동 기록 미확정</button>
    <button data-testid="fielding-invalid-manual" onClick={() => mutateEvents(events => {
      const event = structuredClone(events.find(item => item.compositePlay));
      event.eventId += '-MANUAL'; event.source = { kind: 'manual' }; event.compositePlay.runs = 99;
      return [...events, event];
    })}>상위 수동 기록 무효</button>
    <DefensiveFieldingSection allowed={!new URLSearchParams(location.search).has('public')} />
    <details open><summary>읽기 전용 검증 상태</summary>
      <pre data-testid="fielding-ledger-json">{JSON.stringify(ledger)}</pre>
      <pre data-testid="fielding-state-json">{JSON.stringify({ events: state.events, half: state.half, outs: state.outs, lineups: state.lineups, rejections: state.scoringRejections })}</pre>
    </details>
  </main>;
}
createRoot(document.getElementById('root')).render(<TestProvider><App /></TestProvider>);

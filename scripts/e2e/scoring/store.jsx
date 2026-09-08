import React, { createContext, useContext, useMemo, useReducer, useRef, useState } from 'react';
import { reducer, initialState, compositeContextForState } from 'virtual:scoring-reducer';
import { scenarios, makeFixture } from './scenarios.mjs';
export { compositeContextForState };
const Context = createContext(null);
const KEY = 'aubl-isolated-e2e-state';
export function useDemoStore() { return useContext(Context); }
function initialize() {
  const scenario = scenarios.find(item => item.id === new URLSearchParams(location.search).get('case')) ?? scenarios[0];
  const fixture = makeFixture(initialState, scenario);
  const saved = sessionStorage.getItem(KEY);
  // Start with the same normalized shape used when the production store hydrates.
  if (!saved) return reducer(initialState, { type: 'hydrate', state: fixture });
  const decoded = JSON.parse(saved);
  if (decoded.activeMatchId !== fixture.activeMatchId || !decoded.activeMatchId.startsWith('LOCAL_E2E_ONLY_')) throw new Error('Unexpected persisted test identity');
  return reducer(initialState, { type: 'hydrate', state: decoded });
}
export function TestProvider({ children }) {
  const [state, dispatch] = useReducer((state, action) => action.type === '__fixture_patch' ? { ...state, ...action.patch } : reducer(state, action), undefined, initialize);
  const drop = useRef(false), lastInput = useRef(null);
  const [calls, setCalls] = useState(0);
  const actions = useMemo(() => ({ recordCompositePlay: input => {
    lastInput.current = input; setCalls(value => value + 1);
    if (!drop.current) dispatch({ type: 'recordCompositePlay', input });
  } }), []);
  return <Context.Provider value={{ state, actions, testDispatch: dispatch }}>
    <header><h1>LOCAL E2E ONLY: 운영 백엔드 연결 없음</h1>
      <button data-testid="undo" onClick={() => dispatch({ type: 'undo' })}>실행 취소</button>
      <button data-testid="redo" onClick={() => dispatch({ type: 'redo' })}>재실행</button>
      <button data-testid="reload" onClick={() => { sessionStorage.setItem(KEY, JSON.stringify(state)); location.reload(); }}>로컬 저장 후 새로고침</button>
      <button data-testid="stale" onClick={() => dispatch({ type: 'setScore', side: 'home', value: state.score.home + 1 })}>다른 입력으로 상태 변경</button>
      <button data-testid="takeover" onClick={() => dispatch({ type: '__fixture_patch', patch: { scorerUid: 'LOCAL_OTHER_SCORER', scorerLockedAt: Date.now() } })}>격리 권한 회수</button>
      <button data-testid="pause" onClick={() => dispatch({ type: '__fixture_patch', patch: { scorerPaused: true } })}>격리 일시정지</button>
      <button data-testid="drop-next" onClick={() => { drop.current = true; }}>격리 액션 응답 누락</button>
      <button data-testid="retry-input" onClick={() => { if (lastInput.current) actions.recordCompositePlay(lastInput.current); }}>같은 사건 재입력</button>
      <button data-testid="foreign-history" onClick={() => dispatch({ type: '__fixture_patch', patch: { history: state.history.map(row => ({ ...row, activeMatchId: 'LOCAL_E2E_ONLY_OTHER_MATCH' })) } })}>격리 다른 경기 이력</button>
      <output data-testid="dispatch-count">{calls}</output>
    </header>{children}
  </Context.Provider>;
}

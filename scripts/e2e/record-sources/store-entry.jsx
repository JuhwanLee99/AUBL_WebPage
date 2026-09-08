import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { DemoStoreProvider, useDemoStore } from '/src/shared/state/demoStore.tsx';
import { useRecordSource } from '/src/shared/state/useRecordSource.ts';
import './store-firestore.js';

// Observe real production timers without changing their duration or callbacks.
const timeouts = new Set(), intervals = new Set();
const realTimeout = window.setTimeout.bind(window), realClearTimeout = window.clearTimeout.bind(window);
const realInterval = window.setInterval.bind(window), realClearInterval = window.clearInterval.bind(window);
window.setTimeout = (callback, delay, ...args) => {
  const tracked = delay === 1000 && new Error().stack.includes('demoStore.effects');
  const id = realTimeout((...values) => { timeouts.delete(id); callback(...values); }, delay, ...args);
  if (tracked) timeouts.add(id);
  return id;
};
window.clearTimeout = id => { timeouts.delete(id); realClearTimeout(id); };
window.setInterval = (callback, delay, ...args) => {
  const id = realInterval(callback, delay, ...args);
  if (delay === 60000 && new Error().stack.includes('demoStore.effects')) intervals.add(id);
  return id;
};
window.clearInterval = id => { intervals.delete(id); realClearInterval(id); };
window.storeTimers = { timeouts, intervals };
window.storeRenders = [];
function Probe() {
  const { state, actions } = useDemoStore();
  const source = useRecordSource(state.activeMatchId);
  const value = {
    activeMatchId: state.activeMatchId, score: state.score, lastPlay: state.lastPlay,
    feed: state.feed, events: state.events, lineups: state.lineups, benches: state.benches, removed: state.removed,
    history: state.history.length, futureHistory: state.futureHistory.length,
    scorerUid: state.scorerUid, scorerPaused: state.scorerPaused, source: source.status,
    matches: state.matches.map(match => ({ id: match.id, authority: match.recordAuthority })),
  };
  window.store = { state: value, actions };
  useEffect(() => { window.storeRenders.push(structuredClone(value)); });
  return <main><h1>LOCAL TEST: actual Store Provider</h1><pre data-testid="store">{JSON.stringify(value)}</pre></main>;
}
const root = createRoot(document.getElementById('root'));
window.unmountStore = () => root.unmount();
root.render(<DemoStoreProvider><Probe /></DemoStoreProvider>);

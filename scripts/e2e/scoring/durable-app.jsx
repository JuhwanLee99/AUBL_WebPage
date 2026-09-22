import React from 'react';
import { createRoot } from 'react-dom/client';
import { TestProvider, useDemoStore } from './durable-store.jsx';
import CompositePlayButton from '../../../src/features/scorekeeper/components/CompositePlayButton';
import DurableScoringRecoveryPanel from '../../../src/features/scorekeeper/components/DurableScoringRecoveryPanel';

function App() {
  const { state, ready, acceptDurably, recoveryController } = useDemoStore();
  return <main><h1>LOCAL ONLY: durable modal intake</h1>
    <CompositePlayButton disabled={!ready} onDurableApply={acceptDurably} />
    {recoveryController && <DurableScoringRecoveryPanel controller={recoveryController} />}
    <output data-testid="event-count">{state.events.length}</output>
  </main>;
}
createRoot(document.getElementById('root')).render(<TestProvider><App /></TestProvider>);

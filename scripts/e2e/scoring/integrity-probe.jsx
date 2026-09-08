import React, { useState } from 'react';
import ScoringIntegrityNotice from '../../../src/shared/components/ScoringIntegrityNotice.tsx';
import { integrityEvents } from './integrity-fixtures.mjs';

function Probe({ fixture, audience }) {
  const [events, setEvents] = useState(() => integrityEvents(fixture));
  return <section data-testid="integrity-probe">
    <h2>LOCAL ONLY: 기록 재심 표시 검증</h2>
    <ScoringIntegrityNotice events={events} allowDetails={audience === 'admin'} />
    <button data-testid="integrity-replace" onClick={() => setEvents(integrityEvents('valid'))}>격리된 정상 원본으로 교체</button>
  </section>;
}
export default function IntegrityProbe() {
  const query = new URLSearchParams(location.search);
  const fixture = query.get('integrity');
  return fixture ? <Probe fixture={fixture} audience={query.get('audience')} /> : null;
}

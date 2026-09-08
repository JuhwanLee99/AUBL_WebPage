import DefensiveFieldingPanel from '../../../src/features/scorekeeper/components/DefensiveFieldingPanel.tsx';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { TestProvider, useDemoStore } from './store.jsx';
import CompositePlayButton from '../../../src/features/scorekeeper/components/CompositePlayButton.tsx';
import StatsTable from '../../../src/shared/components/StatsTable.tsx';
import { buildGameRecord, calculateGameStats } from '../../../src/shared/state/demoStore.record.ts';
import { buildPlayerStats as keeperStats } from 'virtual:keeper-stats';
import { buildPlayerStats as viewerStats } from 'virtual:viewer-stats';
import PersistenceProbe from './persistence-probe.jsx';
import IntegrityProbe from './integrity-probe.jsx';
import ScoringIntegrityNotice from '../../../src/shared/components/ScoringIntegrityNotice.tsx';
function App() {
  const { state } = useDemoStore();
  const record = buildGameRecord(state), keeper = keeperStats(record), viewer = viewerStats(record);
  const postgame = calculateGameStats(record);
  const summary = { inning: state.inning, half: state.half, outs: state.outs, balls: state.balls, strikes: state.strikes,
    score: state.score, bases: state.bases, batterIndex: state.batterIndex, runnerResponsiblePitcher: state.runnerResponsiblePitcher,
    history: state.history.length, futureHistory: state.futureHistory.length, events: state.events, feed: state.feed, rejections: state.scoringRejections };
  const projections = { keeper, viewer, live: record.liveStats, postgame: { home: Object.fromEntries(postgame.home), away: Object.fromEntries(postgame.away) } };
  return <main>
    <IntegrityProbe />
    <ScoringIntegrityNotice events={state.events} allowDetails />
    <CompositePlayButton /><DefensiveFieldingPanel events={state.events} matchId={state.activeMatchId} />
    <h2>점수 / 아웃 / 주자</h2><p data-testid="scoreboard">HOME {state.score.home} : AWAY {state.score.away} / {state.outs} OUT / {state.bases.map((name, i) => `${i + 1}루 ${name ?? '-'}`).join(', ')}</p>
    <h2>실제 feed 결과</h2><ol data-testid="feed">{state.feed.map((row, i) => <li key={i}>{row.result}</li>)}</ol>
    <section data-testid="keeper-batters"><StatsTable title="기록원 타자" variant="batter" stats={keeper.hitters.away} /></section>
    <section data-testid="keeper-pitchers"><StatsTable title="기록원 투수" variant="pitcher" stats={keeper.pitchers.home} /></section>
    <section data-testid="viewer-batters"><StatsTable title="관전자 타자" variant="batter" stats={viewer.hitters.away} /></section>
    <section data-testid="viewer-pitchers"><StatsTable title="관전자 투수" variant="pitcher" stats={viewer.pitchers.home} /></section>
    <section data-testid="rate-probe"><StatsTable title="격리 출루율 기대값" variant="batter" stats={[{
      name: 'RATE FIXTURE', pa: 7, ab: 4, h: 2, singles: 2, doubles: 0, triples: 0, hr: 0, bb: 1, ci: 1, fc: 0, hbp: 0, so: 0, sac: 1, r: 0, rbi: 0,
      ...(new URLSearchParams(location.search).get('rates') === 'legacy' ? {} : new URLSearchParams(location.search).get('rates') === 'sf' ? { sh: 0, sf: 1 } : { sh: 1, sf: 0 }),
    }]} /></section>
    <PersistenceProbe state={state} />
    <details><summary>검증용 읽기 전용 상태</summary><pre data-testid="state-json">{JSON.stringify(summary)}</pre><pre data-testid="projection-json">{JSON.stringify(projections)}</pre></details>
  </main>;
}
createRoot(document.getElementById('root')).render(<TestProvider><App /></TestProvider>);

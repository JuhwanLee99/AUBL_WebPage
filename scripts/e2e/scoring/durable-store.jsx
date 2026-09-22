import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { reducer, initialState, compositeContextForState } from 'virtual:scoring-reducer';
import { scenarios, makeFixture } from './scenarios.mjs';
import { DurableScoringWriter } from '../../../src/shared/lib/durableScoringWriter';
import { DurableCompositeIntake } from '../../../src/shared/lib/durableCompositeIntake';

export { compositeContextForState };
const Context = createContext(null);
export function useDemoStore() { return useContext(Context); }

export function TestProvider({ children }) {
  const [state, setState] = useState(() => {
    const saved = sessionStorage.getItem('durable-test-base');
    if (saved) return JSON.parse(saved);
    const fixture = reducer(initialState, { type: 'hydrate', state: makeFixture(initialState, scenarios[0]) });
    sessionStorage.setItem('durable-test-base', JSON.stringify(fixture));
    return fixture;
  });
  const stateRef = useRef(state);
  const [ready, setReady] = useState(false);
  const intakeRef = useRef(null);
  useEffect(() => {
    let disposed = false, writer;
    const scope = { environment: 'local-emulator', projectId: 'demo-aubl-scoring', uid: 'LOCAL_E2E_SCORER',
      matchId: stateRef.current.activeMatchId, testRunId: 'TEST_RUN_DURABLE_MODAL', writerSessionId: 'modal', lockEpoch: 1 };
    const probe = window.probe = { ready: false, hold: false, revoked: false, failApply: false, failConfirm: false, commitCalls: 0,
      enqueueCalls: 0, applyCalls: 0, legacyCalls: 0, lastInput: null,
      state: () => stateRef.current,
      changeAmbient: () => {
        const current = stateRef.current;
        const next = { ...current, onlineViewerCount: 73, liveVideoUrl: 'LOCAL_AMBIENT_VIDEO',
          liveDelaySeconds: 11, followCurrent: false, scorerName: 'LOCAL_DISPLAY_CHANGED',
          scorerEmail: 'local-test@example.invalid', scorerLockedAt: Date.now() + 1000,
          matches: current.matches.map(match => ({ ...match, notes: 'LOCAL_AMBIENT_NOTE' })) };
        stateRef.current = next; setState(next);
      },
      changeOwner: () => {
        const next = { ...stateRef.current, scorerUid: 'LOCAL_OTHER_SCORER' };
        stateRef.current = next; setState(next);
      },
      promoteOfficial: () => {
        const next = { ...stateRef.current, matches: stateRef.current.matches.map(match => ({ ...match, recordAuthority: 'UNIQUE_PLAY' })) };
        stateRef.current = next; setState(next);
      },
      // Fault injection only: emulate a stale screen restored from an old checkpoint.
      restoreBase: () => {
        const base = JSON.parse(sessionStorage.getItem('durable-test-base'));
        stateRef.current = base; setState(base);
      },
      changeState: () => {
        const next = reducer(stateRef.current, { type: 'setScore', side: 'home', value: 1 });
        stateRef.current = next; setState(next);
      },
    };
    const start = async () => {
      writer = await DurableScoringWriter.acquire(scope, 0, {
        commit: async () => { probe.commitCalls++; throw new Error('Transport must never run in this local intake test'); },
      });
      if (!writer) throw new Error('Local test writer unavailable');
      if (disposed) { await writer.close(); return; }
      probe.recover = () => writer.recover();
      probe.prepare = () => writer.prepare({ version: 1, matchId: scope.matchId, ruleProfileVersion: 'test',
        engineVersion: 'test', projectionVersion: 'test', blocks: [] }, 'recovery_test_request', 1);
      probe.flush = () => writer.flush();
      probe.wrongScope = () => new DurableCompositeIntake({ ...scope, matchId: 'OTHER' }, writer, {});
      const port = {
        capture: () => stateRef.current,
        validate: current => {
          if (probe.revoked || current.scorerUid !== scope.uid || current.scorerPaused || !current.gameStarted || current.gameOver) {
            throw new Error('test-writer-not-authorized');
          }
        },
        project: (before, input) => reducer(before, { type: 'recordCompositePlay', input }),
        apply: (before, after) => {
          if (probe.failApply) throw new Error('test-apply-failed');
          if (JSON.stringify(stateRef.current) !== JSON.stringify(before)) throw new Error('test-compare-and-apply-conflict');
          probe.applyCalls++;
          stateRef.current = after; setState(after);
        },
      };
      const intake = new DurableCompositeIntake(scope, {
        assertScope: value => writer.assertScope(value),
        review: () => writer.review(),
        confirmApplied: (id, payload) => {
          if (probe.failConfirm) return Promise.reject(new Error('test-confirm-failed'));
          return writer.confirmApplied(id, payload);
        },
        stage: async (id, payload) => {
          probe.enqueueCalls++;
          if (probe.hold) await new Promise(resolve => { probe.release = resolve; });
          return writer.stage(id, payload);
        },
      }, port);
      intakeRef.current = intake;
      probe.intake = intake;
      probe.retry = () => intake.accept(probe.lastInput);
      probe.changedRetry = () => intake.accept({ ...probe.lastInput, note: 'different input' });
      probe.ready = true; setReady(true);
    };
    void start().catch(error => { probe.error = String(error); });
    return () => { disposed = true; if (writer) void writer.close(); };
  }, []);
  const acceptDurably = async input => {
    window.probe.lastInput = structuredClone(input);
    await intakeRef.current.accept(input);
  };
  return <Context.Provider value={{ state, ready, acceptDurably, recoveryController: intakeRef.current, actions: {
    recordCompositePlay: () => { window.probe.legacyCalls++; throw new Error('Legacy writer dispatched'); },
  } }}>{children}</Context.Provider>;
}

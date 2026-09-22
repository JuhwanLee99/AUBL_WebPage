import { useEffect, useRef, useState } from 'react';
import { onIdTokenChanged, type Auth } from 'firebase/auth';
import type { DemoState } from './demoStore';
import type { CompositeInput } from '../lib/compositePlayEngine';
import { DurableCompositeIntake, type DurableRecoveryController } from '../lib/durableCompositeIntake';
import { DurableScoringWriter } from '../lib/durableScoringWriter';
import { ScoringProviderSession } from '../lib/scoringProviderSession';
import type { DurableScoringScope } from '../lib/scoringScope';
import type { PrivateCommitTransport } from '../lib/durableScoringCommitAdapter';
import { scoringStateIssues } from '../lib/scoringReplay';
import { scoringCheckpoint } from '../lib/scoringCheckpoint';
import { DurableScoringPublication, type PublicationOptions, type PublicationStatus } from '../lib/durableScoringPublication';
import { buildPostGameRecord } from './demoStore.record';

export type DurableDemoStoreOptions = {
  auth: Auth;
  scope: DurableScoringScope;
  initialState: DemoState;
  initialRevision: number;
  /** Must already have acquired this server-authorized writer session/epoch. */
  transport: PrivateCommitTransport;
  publication?: PublicationOptions;
};
export type DurableProviderControls = {
  status: 'opening' | 'ready' | 'blocked';
  error: string;
  accept(input: CompositeInput): Promise<void>;
  recovery: DurableRecoveryController;
  publication: PublicationStatus | null;
  retryPublication(): Promise<void>;
};

export function useDurableScoringProvider(options: DurableDemoStoreOptions,
  project: (state: DemoState, input: CompositeInput) => DemoState) {
  const [fixed] = useState(() => ({ ...options, scope: structuredClone(options.scope) }));
  const [state, setState] = useState(() => structuredClone(options.initialState));
  const current = useRef(state);
  const [status, setStatus] = useState<DurableProviderControls['status']>('opening');
  const [error, setError] = useState('');
  const intake = useRef<DurableCompositeIntake<DemoState> | null>(null);
  const publisher = useRef<DurableScoringPublication | null>(null);
  const [publication, setPublication] = useState<PublicationStatus | null>(null);
  const active = useRef(false);
  const generation = useRef(0);
  const [gate] = useState(() => new ScoringProviderSession((scope, revision) =>
    DurableScoringWriter.acquire(scope, revision, fixed.transport)));
  const [controls] = useState(() => {
    const requireIntake = () => {
      if (!active.current || !intake.current || !gate.current()) throw new Error('durable-provider-not-ready');
      return intake.current;
    };
    return {
      accept: async (input: CompositeInput) => {
        await requireIntake().accept(input);
        // Local acceptance succeeds independently of network delivery.
        void publisher.current?.drain().catch(() => {});
      },
      retryPublication: async () => {
        requireIntake();
        if (!publisher.current) throw new Error('publication-not-connected');
        await publisher.current.drain();
      },
      recovery: {
        inspectRecovery: () => Promise.resolve().then(() => requireIntake().inspectRecovery()),
        recoverInput: async (id: string) => {
          await requireIntake().recoverInput(id);
          void publisher.current?.drain().catch(() => {});
        },
      },
    };
  });
  useEffect(() => {
    const version = ++generation.current;
    const user = fixed.auth.currentUser;
    let disposed = false;
    const validate = (snapshot: DemoState) => {
      if (disposed || version !== generation.current || !active.current || fixed.auth.currentUser !== user
        || !user || user.uid !== fixed.scope.uid || snapshot.activeMatchId !== fixed.scope.matchId
        || snapshot.scorerUid !== user.uid) throw new Error('durable-provider-access-changed');
    };
    const block = (failure: unknown) => {
      active.current = false; intake.current = null;
      publisher.current?.stop(); publisher.current = null;
      if (!disposed && version === generation.current) {
        setStatus('blocked'); setError(failure instanceof Error ? failure.message : String(failure));
      }
      void gate.stop().catch(() => {
        if (!disposed && version === generation.current) setError('durable-provider-cleanup-failed');
      });
    };
    active.current = true;
    let unsubscribe = () => {};
    void (async () => {
      if (fixed.auth.app.options.projectId !== fixed.scope.projectId
        || fixed.auth.emulatorConfig?.host !== '127.0.0.1' || fixed.auth.emulatorConfig.port !== 9198
        || scoringStateIssues(current.current).length) throw new Error('durable-provider-emulator-required');
      validate(current.current);
      unsubscribe = onIdTokenChanged(fixed.auth, next => { if (next !== user) block(new Error('durable-provider-auth-changed')); });
      const opened = await gate.open(fixed.scope, fixed.initialRevision);
      if (!opened || disposed || version !== generation.current) return;
      validate(current.current);
      const writer = gate.current();
      if (!writer) throw new Error('durable-provider-not-ready');
      const stored = await writer.review(); validate(current.current);
      if (stored.metadata.serverRevision !== fixed.initialRevision) throw new Error('durable-provider-server-checkpoint-required');
      intake.current = new DurableCompositeIntake(fixed.scope, writer, {
        capture: () => current.current,
        validate,
        project,
        apply: (before, after) => {
          validate(current.current);
          if (JSON.stringify(before) !== JSON.stringify(current.current)) throw new Error('durable-provider-state-changed');
          current.current = after; setState(after);
        },
      });
      if (fixed.publication) {
        publisher.current = new DurableScoringPublication(fixed.scope, writer, fixed.publication, {
          validate: () => validate(current.current),
          assertCurrent: after => {
            if (JSON.stringify(scoringCheckpoint(current.current)) !== JSON.stringify(after)) {
              throw new Error('publication-local-recovery-required');
            }
          },
          stats: after => {
            const snapshot = { ...fixed.initialState, ...after } as DemoState;
            return buildPostGameRecord(snapshot, snapshot.matches.find(match => match.id === fixed.scope.matchId));
          },
          notify: update => { if (!disposed && version === generation.current) setPublication(update); },
        });
        setPublication({ phase: 'idle', revision: stored.metadata.serverRevision, acknowledgedSequence: stored.metadata.acknowledgedSequence });
      }
      setStatus('ready');
    })().catch(failure => { if (!disposed && version === generation.current) block(failure); });
    return () => {
      disposed = true; generation.current++; active.current = false; intake.current = null; unsubscribe();
      publisher.current?.stop(); publisher.current = null;
      void gate.stop().catch(() => { /* Keep the failed lease in the gate; never fall back to legacy. */ });
    };
  }, [fixed, gate, project]);
  return { state, durable: { ...controls, status, error, publication } satisfies DurableProviderControls,
    denyLegacy: () => setError('이 테스트 경로는 복합 플레이 모달과 기기 복구만 지원합니다. 다른 입력은 반영하지 않았습니다.') };
}

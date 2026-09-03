import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  doc,
  getDocFromServer,
  onSnapshot,
  type DocumentSnapshot,
} from 'firebase/firestore';
import { firestore } from '@shared/firebase/client';

const ALLSTAR_FEATURE_PATH = ['publicFeatureFlags', 'allstar'] as const;
const SERVER_CHECK_TIMEOUT_MS = 3_000;
const FEATURE_FLAG_SCHEMA_VERSION = 1;

export type PublicFeatureFlagState = {
  allstarEnabled: boolean;
  allstarRevision: number;
  allstarUpdatedAt: string | null;
  loading: boolean;
  verifiedByServer: boolean;
};

const DEFAULT_STATE: PublicFeatureFlagState = {
  allstarEnabled: false,
  allstarRevision: 0,
  allstarUpdatedAt: null,
  loading: true,
  verifiedByServer: false,
};

const FeatureFlagsContext = createContext<PublicFeatureFlagState>(DEFAULT_STATE);

const parseServerSnapshot = (snapshot: DocumentSnapshot): Omit<PublicFeatureFlagState, 'loading' | 'verifiedByServer'> => {
  const data = snapshot.exists() ? snapshot.data() : null;
  const revision = data && typeof data.revision === 'number' && Number.isSafeInteger(data.revision) && data.revision >= 0
    ? data.revision
    : 0;
  const updatedAt = data?.updatedAt && typeof data.updatedAt.toDate === 'function'
    ? data.updatedAt.toDate().toISOString()
    : null;

  return {
    // Only an exact boolean true received from the server enables a feature.
    allstarEnabled: data?.schemaVersion === FEATURE_FLAG_SCHEMA_VERSION && data?.enabled === true && revision > 0,
    allstarRevision: revision,
    allstarUpdatedAt: updatedAt,
  };
};

export function FeatureFlagsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PublicFeatureFlagState>(DEFAULT_STATE);

  useEffect(() => {
    const featureRef = doc(firestore, ...ALLSTAR_FEATURE_PATH);
    let active = true;
    let serverVerified = false;

    const acceptServerSnapshot = (snapshot: DocumentSnapshot) => {
      if (!active) return;
      serverVerified = true;
      setState({
        ...parseServerSnapshot(snapshot),
        loading: false,
        verifiedByServer: true,
      });
    };

    const failInitialCheckClosed = () => {
      if (!active || serverVerified) return;
      setState({ ...DEFAULT_STATE, loading: false });
    };

    const failListenerClosed = () => {
      if (!active) return;
      serverVerified = false;
      setState({ ...DEFAULT_STATE, loading: false });
    };

    const timeout = window.setTimeout(failInitialCheckClosed, SERVER_CHECK_TIMEOUT_MS);

    void getDocFromServer(featureRef).then(acceptServerSnapshot).catch(failInitialCheckClosed);

    const unsubscribe = onSnapshot(
      featureRef,
      { includeMetadataChanges: true },
      (snapshot) => {
        // An old cached true must never reopen a disabled production feature.
        if (!snapshot.metadata.fromCache) acceptServerSnapshot(snapshot);
      },
      failListenerClosed,
    );

    return () => {
      active = false;
      window.clearTimeout(timeout);
      unsubscribe();
    };
  }, []);

  const value = useMemo(() => state, [state]);
  return <FeatureFlagsContext.Provider value={value}>{children}</FeatureFlagsContext.Provider>;
}

export const useFeatureFlags = () => useContext(FeatureFlagsContext);

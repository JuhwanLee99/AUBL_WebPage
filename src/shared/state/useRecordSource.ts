import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { firestore } from '../firebase/client';
import { parseRecordSource, type RecordSourceState } from '../lib/recordSourcePolicy';

export function useRecordSource(matchId: string | null | undefined): RecordSourceState {
  const [resource, setResource] = useState<{ key: string; value: RecordSourceState } | null>(null);
  useEffect(() => {
    if (!matchId) return;
    let active = true;
    const stop = onSnapshot(doc(firestore, 'recordSources', matchId), { includeMetadataChanges: true }, snap => {
      if (!active) return;
      // Never authorize a live read from a cached absence while offline.
      const value = !snap.exists() && snap.metadata.fromCache
        ? { status: 'loading' as const }
        : parseRecordSource(snap.exists() ? snap.data() : null, matchId);
      setResource({ key: matchId, value });
    }, () => {
      if (active) setResource({ key: matchId, value: { status: 'blocked' } });
    });
    return () => { active = false; stop(); };
  }, [matchId]);
  if (!matchId) return { status: 'live' };
  return resource?.key === matchId ? resource.value : { status: 'loading' };
}

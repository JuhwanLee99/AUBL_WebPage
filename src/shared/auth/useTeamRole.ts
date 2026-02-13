import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { firestore } from '../firebase/client';
import { useAuth } from './AuthProvider';

type CoachRoleDoc = {
  role?: 'coach' | string;
  teamId?: string;
  teamName?: string;
  email?: string | null;
  grantedAt?: number;
  grantedBy?: string | null;
};

export function useTeamRole() {
  const { user } = useAuth();
  const [role, setRole] = useState<CoachRoleDoc | null>(null);
  const [checkedUid, setCheckedUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const ref = doc(firestore, 'roles', user.uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          setRole(snap.data() as CoachRoleDoc);
        } else {
          setRole(null);
        }
        setCheckedUid(user.uid);
        setLoading(false);
      },
      () => {
        setRole(null);
        setCheckedUid(user.uid);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [user]);

  const effectiveRole = user ? role : null;
  const isCoach = effectiveRole?.role === 'coach';
  const coachTeamId = effectiveRole?.teamId ?? null;
  const effectiveLoading = user ? loading || checkedUid !== user.uid : false;

  return { role: effectiveRole, isCoach, coachTeamId, loading: effectiveLoading };
}

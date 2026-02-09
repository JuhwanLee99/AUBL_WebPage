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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setRole(null);
      setLoading(false);
      return;
    }

    const ref = doc(firestore, 'roles', user.uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          setRole(snap.data() as CoachRoleDoc);
        } else {
          setRole(null);
        }
        setLoading(false);
      },
      () => {
        setRole(null);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [user]);

  const isCoach = role?.role === 'coach';
  const coachTeamId = role?.teamId ?? null;

  return { role, isCoach, coachTeamId, loading };
}

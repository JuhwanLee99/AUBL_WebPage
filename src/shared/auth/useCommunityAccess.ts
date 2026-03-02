import { useEffect, useState } from 'react';
import { collectionGroup, doc, FieldPath, getDoc, getDocs, limit, query, setDoc, where } from 'firebase/firestore';
import { firestore } from '../firebase/client';
import { useAuth } from './AuthProvider';
import { useAdmin } from './useAdmin';

export function useCommunityAccess() {
  const { user } = useAuth();
  const { isAdmin, isScorer, roleLabel, loading } = useAdmin();
  const [syncingMemberRole, setSyncingMemberRole] = useState(false);
  const [syncedUid, setSyncedUid] = useState<string | null>(null);

  const isAuthenticated = !!user;
  const isPlayerTier = roleLabel === '선수' || roleLabel === '스태프' || roleLabel === '감독';
  const isPlayerOrAbove = isAuthenticated && (isAdmin || isScorer || isPlayerTier);
  const canWritePlayerRegistration = isAuthenticated && isAdmin;
  const canWriteUniformRegistration = isAuthenticated && (isAdmin || roleLabel === '감독');

  useEffect(() => {
    if (!user) {
      setSyncedUid(null);
      setSyncingMemberRole(false);
      return;
    }
    if (loading) return;
    if (!(roleLabel === '선수' || roleLabel === '스태프')) {
      setSyncedUid(user.uid);
      return;
    }
    if (syncedUid === user.uid) return;

    let cancelled = false;
    const run = async () => {
      setSyncingMemberRole(true);
      try {
        let memberSnap = await getDocs(
          query(collectionGroup(firestore, 'members'), where('uid', '==', user.uid), limit(1)),
        );
        if (memberSnap.empty) {
          memberSnap = await getDocs(
            query(collectionGroup(firestore, 'members'), where(FieldPath.documentId(), '==', user.uid), limit(1)),
          );
        }
        if (memberSnap.empty) return;

        const memberDoc = memberSnap.docs[0];
        const member = memberDoc.data() as { role?: string };
        const teamId = memberDoc.ref.parent.parent?.id ?? null;
        if (!teamId) return;

        const role = member.role === 'staff' ? 'staff' : 'player';
        let teamName = teamId;
        try {
          const teamDoc = await getDoc(doc(firestore, 'teams', teamId));
          if (teamDoc.exists()) {
            teamName = (teamDoc.data()?.name as string) ?? teamId;
          }
        } catch {
          // ignore
        }

        await setDoc(
          doc(firestore, 'roles', user.uid),
          {
            uid: user.uid,
            role,
            teamId,
            teamName,
            syncedBy: 'membership-sync',
            syncedAt: Date.now(),
          },
          { merge: true },
        );
      } catch (err) {
        console.error('선수/스태프 roles 동기화 실패:', err);
      } finally {
        if (!cancelled) {
          setSyncedUid(user.uid);
          setSyncingMemberRole(false);
        }
      }
    };
    void run();

    return () => {
      cancelled = true;
    };
  }, [user, loading, roleLabel, syncedUid]);

  return {
    loading: loading || syncingMemberRole,
    isAuthenticated,
    isAdmin,
    isScorer,
    roleLabel,
    isPlayerOrAbove,
    canWritePlayerRegistration,
    canWriteUniformRegistration,
  };
}

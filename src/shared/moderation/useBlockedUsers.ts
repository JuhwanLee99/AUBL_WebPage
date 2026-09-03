import { useEffect, useState } from 'react';
import { useAuth } from '@shared/auth/AuthProvider';
import { watchBlockedUserIds, watchBlockedUsers } from './moderationService';
import type { BlockedUserEntry } from '@shared/types';

const EMPTY_BLOCKED_IDS = new Set<string>();

export function useBlockedUserIds() {
  const { user } = useAuth();
  const [snapshot, setSnapshot] = useState<{ uid: string; values: Set<string> } | null>(null);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = watchBlockedUserIds(
      user.uid,
      (next) => {
        setSnapshot({ uid: user.uid, values: next });
      },
      () => {
        setSnapshot({ uid: user.uid, values: EMPTY_BLOCKED_IDS });
      },
    );

    return () => unsubscribe();
  }, [user]);

  const current = user && snapshot?.uid === user.uid ? snapshot : null;
  return {
    blockedUserIds: current?.values ?? EMPTY_BLOCKED_IDS,
    loading: Boolean(user && !current),
    uid: user?.uid ?? null,
  };
}

export function useBlockedUsers() {
  const { user } = useAuth();
  const [snapshot, setSnapshot] = useState<{ uid: string; values: BlockedUserEntry[] } | null>(null);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = watchBlockedUsers(
      user.uid,
      (next) => {
        setSnapshot({ uid: user.uid, values: next });
      },
      () => {
        setSnapshot({ uid: user.uid, values: [] });
      },
    );

    return () => unsubscribe();
  }, [user]);

  const current = user && snapshot?.uid === user.uid ? snapshot : null;
  return {
    blockedUsers: current?.values ?? [],
    loading: Boolean(user && !current),
    uid: user?.uid ?? null,
  };
}

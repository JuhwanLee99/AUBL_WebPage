import { useEffect, useState } from 'react';
import { useAuth } from '@shared/auth/AuthProvider';
import { watchBlockedUserIds, watchBlockedUsers } from './moderationService';
import type { BlockedUserEntry } from '@shared/types';

export function useBlockedUserIds() {
  const { user } = useAuth();
  const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setBlockedUserIds(new Set());
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = watchBlockedUserIds(
      user.uid,
      (next) => {
        setBlockedUserIds(next);
        setLoading(false);
      },
      () => {
        setBlockedUserIds(new Set());
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [user]);

  return { blockedUserIds, loading, uid: user?.uid ?? null };
}

export function useBlockedUsers() {
  const { user } = useAuth();
  const [blockedUsers, setBlockedUsers] = useState<BlockedUserEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setBlockedUsers([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = watchBlockedUsers(
      user.uid,
      (next) => {
        setBlockedUsers(next);
        setLoading(false);
      },
      () => {
        setBlockedUsers([]);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [user]);

  return { blockedUsers, loading, uid: user?.uid ?? null };
}

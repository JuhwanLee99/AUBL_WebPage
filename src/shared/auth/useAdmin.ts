import { useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthProvider';

const adminList = (import.meta.env.VITE_ADMIN_EMAILS ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function useAdmin() {
  const { user } = useAuth();
  const email = user?.email?.toLowerCase() ?? null;
  const [isAdminByClaim, setIsAdminByClaim] = useState(false);
  const [claimCheckedAt, setClaimCheckedAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setIsAdminByClaim(false);
      setClaimCheckedAt(Date.now());
      return undefined;
    }
    user
      .getIdTokenResult(true)
      .then((result) => {
        if (cancelled) return;
        setIsAdminByClaim(Boolean((result.claims as Record<string, unknown>).admin));
        setClaimCheckedAt(Date.now());
      })
      .catch(() => {
        if (cancelled) return;
        setIsAdminByClaim(false);
        setClaimCheckedAt(Date.now());
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const isAdminByEmail = useMemo(() => {
    if (!email) return false;
    return adminList.includes(email);
  }, [email]);

  const isAdmin = isAdminByClaim || isAdminByEmail;

  const roleLabel = isAdmin ? '관리자' : '일반';
  const roleDetail = isAdminByClaim ? '클레임' : isAdminByEmail ? '이메일' : '기본';

  return {
    isAdmin,
    isAdminByClaim,
    isAdminByEmail,
    adminEmails: adminList,
    roleLabel,
    roleDetail,
    claimCheckedAt,
  };
}

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthProvider';

// -----------------------------------------------------------
// [로컬 테스트용 설정]
// true로 설정하면 무조건 관리자 권한을 가진 것으로 처리합니다.
const FORCE_ADMIN = false; // false
// -----------------------------------------------------------

const adminList = (import.meta.env.VITE_ADMIN_EMAILS ?? '')
  .split(',')
  .map((e: string) => e.trim().toLowerCase())
  .filter(Boolean);

export function useAdmin() {
  const { user } = useAuth();
  const email = user?.email?.toLowerCase() ?? null;
  const [isAdminByClaim, setIsAdminByClaim] = useState(false);
  const [claimCheckedAt, setClaimCheckedAt] = useState<number | null>(null);

  useEffect(() => {
    // FORCE_ADMIN일 경우 불필요한 Firebase 요청 방지 (선택 사항)
    if (FORCE_ADMIN) return;

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

  // Hook 규칙을 지키기 위해 변수 계산까지 다 마친 후, 반환 직전에 덮어씁니다.
  if (FORCE_ADMIN) {
    return {
      isAdmin: true,
      isAdminByClaim: true,
      isAdminByEmail: true,
      adminEmails: ['admin@aubl.com'],
      roleLabel: '테스트 관리자',
      roleDetail: '로컬 강제 권한',
      claimCheckedAt: Date.now(),
    };
  }

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
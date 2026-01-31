import { useEffect, useState } from 'react';
import { useAuth } from './AuthProvider';

// -----------------------------------------------------------
// [로컬 테스트용 설정]
// true로 설정하면 무조건 관리자 권한을 가진 것으로 처리합니다.
// 개발 모드(DEV)에서만 true로 설정 가능하도록 제한
const FORCE_ADMIN = import.meta.env.DEV && false;
// -----------------------------------------------------------

export function useAdmin() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (FORCE_ADMIN) {
        setIsAdmin(true);
        setLoading(false);
        return;
    }

    if (!user) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }

    // ✅ 오직 Custom Claim만 확인
    user.getIdTokenResult()
      .then((idTokenResult) => {
        setIsAdmin(!!idTokenResult.claims.admin);
      })
      .catch(() => setIsAdmin(false))
      .finally(() => setLoading(false));
  }, [user]);

  return { isAdmin, loading };
}
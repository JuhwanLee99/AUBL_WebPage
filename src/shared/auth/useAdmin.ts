import { useEffect, useState } from 'react';
import { useAuth } from './AuthProvider';

// 개발 모드(DEV)에서만 true로 설정 가능하도록 제한
const FORCE_ADMIN = import.meta.env.DEV && false; 

export function useAdmin() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const run = async () => {
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
      try {
        // true를 전달하여 강제로 최신 권한 정보를 가져옵니다.
        const idTokenResult = await user.getIdTokenResult(true);
        setIsAdmin(!!idTokenResult.claims.admin);
      } catch (err) {
        console.error("권한 확인 실패:", err);
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, [user]);

  // ✅ [복구됨] UI에서 사용하는 텍스트 라벨 추가
  const roleLabel = isAdmin ? '관리자' : '일반';
  // 이메일 권한 방식이 사라졌으므로, 관리자는 모두 '정식 승인'으로 표기
  const roleDetail = isAdmin ? '정식 승인' : '사용자'; 

  return { 
    isAdmin, 
    loading, 
    roleLabel,
    roleDetail 
  };
}

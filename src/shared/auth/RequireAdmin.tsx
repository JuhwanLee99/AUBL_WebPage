import { Navigate, useLocation } from 'react-router-dom';
import type { ReactElement } from 'react'; // TS 에러 수정 포함
import { useAuth } from './AuthProvider';
import { useAdmin } from './useAdmin';

type Props = {
  children: ReactElement;
};

export function RequireAdmin({ children }: Props) {
  const { initializing, user } = useAuth();
  // ✅ useAdmin에서 loading 상태도 함께 가져옵니다 (이름이 겹치니 adminLoading으로 변경)
  const { isAdmin, loading: adminLoading } = useAdmin();
  const location = useLocation();

  // 1. 로그인 상태 확인 중이면 대기
  if (initializing) {
    return (
      <div style={{ padding: '32px', textAlign: 'center', color: '#cbd5e1' }}>
        인증 상태를 확인하고 있습니다...
      </div>
    );
  }

  // 2. 로그인이 안 되어 있으면 로그인 페이지로
  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  // 3. ✅ [추가된 부분] 관리자 권한 확인 중이면 대기 (여기서 튕기지 않고 기다림)
  if (adminLoading) {
    return (
      <div style={{ padding: '32px', textAlign: 'center', color: '#cbd5e1' }}>
        관리자 권한 확인 중...
      </div>
    );
  }

  // 4. 확인이 끝났는데 관리자가 아니면 거부
  if (!isAdmin) {
    return <Navigate to="/access-denied" replace />;
  }

  return children;
}
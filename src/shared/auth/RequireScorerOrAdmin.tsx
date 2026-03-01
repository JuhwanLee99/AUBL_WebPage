import { Navigate, useLocation } from 'react-router-dom';
import type { ReactElement } from 'react';
import { useAuth } from './AuthProvider';
import { useAdmin } from './useAdmin';

type Props = {
  children: ReactElement;
};

export function RequireScorerOrAdmin({ children }: Props) {
  const { initializing, user } = useAuth();
  const { canUseScorekeeper, loading: roleLoading } = useAdmin();
  const location = useLocation();

  if (initializing) {
    return (
      <div style={{ padding: '32px', textAlign: 'center', color: '#cbd5e1' }}>
        인증 상태를 확인하고 있습니다...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (roleLoading) {
    return (
      <div style={{ padding: '32px', textAlign: 'center', color: '#cbd5e1' }}>
        권한 확인 중...
      </div>
    );
  }

  if (!canUseScorekeeper) {
    return <Navigate to="/access-denied" replace />;
  }

  return children;
}
